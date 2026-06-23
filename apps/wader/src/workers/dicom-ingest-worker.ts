import { OrthancClient } from '../adapters/orthanc-client';
import { processarEstudo, IngestResult } from './dicom-ingest';
import { IngestStateStore } from './ingest-state';
import { createLogger } from '../logger';

const log = createLogger({ module: 'dicom-ingest-worker' });

export interface DicomIngestWorkerOptions {
  wsId: string;
  client: OrthancClient;
  intervalSec: number;
  /** Caminho do arquivo de estado (default: <cwd>/.wader-ingest-state.json). */
  stateFile?: string;
}

/**
 * Worker que monitora `/changes` do Orthanc e processa estudos estáveis.
 *
 * ADR 2026-05-18 (wader-ingest-resiliente) — mudanças vs. versão antiga:
 *
 *   Fix 1 — cursor `lastSeq` PERSISTIDO em disco (IngestStateStore).
 *     Restart retoma de onde parou; não re-varre 800+ changes do seq 0.
 *
 *   Fix 2 — re-avaliação por COMPLETUDE no lugar de blacklist eterna.
 *     Antes: `processedStudyIds` (Set em memória) marcava estudo como
 *     "visto pra sempre" — órfão que ganhava ACC depois, ou estudo que
 *     estabilizou parcial (4 imgs, SR atrasado), ficava travado.
 *     Agora: guardamos uma assinatura {nImg,nSR} por estudo; se o Orthanc
 *     passa a ter mais imagens/SR do que gravamos (ou ainda não casou),
 *     reprocessa. `processarEstudo` é idempotente (sobrescreve).
 *
 * Por que `StableStudy` e não `NewStudy`?
 *   - `NewStudy` dispara na 1ª instance — estudo incompleto.
 *   - `StableStudy` dispara quando o Orthanc considera o estudo estável
 *     (StableAge, default 60s sem novas instances). Cada nova
 *     estabilização (mais imagens chegaram) gera um NOVO StableStudy.
 */
export class DicomIngestWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private execCount = 0;
  private lastTickAt: Date | null = null;
  private lastError: string | null = null;
  private estudosProcessados = 0;
  private estudosOrfaos = 0;
  private lastResults: IngestResult[] = [];
  private readonly store: IngestStateStore;

  constructor(private readonly opts: DicomIngestWorkerOptions) {
    this.store = new IngestStateStore(opts.stateFile);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.store.load();
    log.info(
      { intervalSec: this.opts.intervalSec, wsId: this.opts.wsId, lastSeq: this.store.getLastSeq() },
      'DICOM ingest worker iniciado (cursor persistido)',
    );
    this.tick();
    this.timer = setInterval(() => this.tick(), this.opts.intervalSec * 1000);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.store.flush();
    log.info('DICOM ingest worker parado');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus() {
    return {
      running: this.running,
      intervalSec: this.opts.intervalSec,
      lastSeq: this.store.getLastSeq(),
      execCount: this.execCount,
      estudosProcessados: this.estudosProcessados,
      estudosOrfaos: this.estudosOrfaos,
      lastTickAt: this.lastTickAt?.toISOString() ?? null,
      lastError: this.lastError,
      cacheProcessados: this.store.size(),
      ultimosResultados: this.lastResults.slice(-5),
    };
  }

  /** Reseta cursor pra 0 (re-processa tudo). Debug / mudança de lógica. */
  resetCursor(): void {
    this.store.reset();
    log.info('Cursor de changes resetado pra 0 (estado persistido limpo)');
  }

  private async tick(): Promise<void> {
    this.execCount++;
    this.lastTickAt = new Date();
    try {
      const desde = this.store.getLastSeq();
      const changes = await this.opts.client.changes(desde, 100);

      // Estudos estáveis nesta página, deduplicados por ID (fica o mais recente).
      const stable = new Map<string, number>();
      for (const c of changes.Changes) {
        if (c.ChangeType === 'StableStudy' && c.ResourceType === 'Study') {
          stable.set(c.ID, c.Seq);
        }
      }

      if (stable.size > 0) {
        log.info(
          { count: stable.size, desde, ate: changes.Last },
          'Estudos estáveis nesta página',
        );
      }

      for (const studyId of stable.keys()) {
        try {
          // Contagem ATUAL no Orthanc (barata: só conta instances por
          // modalidade, não baixa nada). Decide se precisa (re)processar.
          let curImg = 0;
          let curSR = 0;
          try {
            const series = await this.opts.client.getStudySeries(studyId);
            for (const s of series) {
              const n = (s.Instances ?? []).length;
              if ((s.MainDicomTags?.Modality ?? '') === 'SR') curSR += n;
              else curImg += n;
            }
          } catch {
            // Estudo pode ter sido apagado entre o change e agora — ignora.
            continue;
          }

          const sig = this.store.getSignature(studyId);
          if (!this.store.precisaProcessar(studyId, curImg, curSR)) {
            continue; // já processamos e está completo
          }

          // Fix B (ADR 2026-06-22): força re-extração de SR só quando o Orthanc
          // ganhou série SR nova (curSR subiu). Reprocesso disparado por imagem
          // nova reusa as medidas já gravadas — não re-baixa/re-parseia o SR.
          const forceSr = !!sig && curSR > sig.nSR;

          const result = await processarEstudo({
            client: this.opts.client,
            orthancStudyId: studyId,
            wsId: this.opts.wsId,
            forceSr,
          });
          this.lastResults.push(result);
          if (this.lastResults.length > 20) this.lastResults = this.lastResults.slice(-20);

          if (result.matched) {
            this.estudosProcessados++;
            // Grava a assinatura do estado ATUAL do Orthanc. nImg = imagens
            // subidas com sucesso (se faltou, curImg>nImg ⇒ retenta). nSR =
            // nº de INSTANCES SR (curSR) — mesma unidade que precisaProcessar
            // compara. Corrigido 2026-06-22: antes guardava nº de MEDIDAS, que
            // nunca disparava reprocesso quando um SR novo chegava.
            this.store.setSignature(studyId, {
              nImg: result.imagensProcessadas,
              nSR: curSR,
              matched: true,
              at: new Date().toISOString(),
            });
          } else {
            this.estudosOrfaos++;
            // Órfão (sem exame no LEO ainda) ou falha: NÃO marca como
            // completo. Quando o exame for cadastrado / reenviado com ACC,
            // um novo StableStudy reaparece e reprocessamos.
          }
        } catch (err) {
          log.error({ err, orthancStudyId: studyId }, 'Falha ao processar estudo — reavaliará');
          this.lastError = (err as Error).message;
        }
      }

      // Avança o cursor SÓ depois de processar a página (crash no meio ⇒
      // reprocessa a página; processarEstudo é idempotente). Persiste já.
      this.store.setLastSeq(changes.Last);
      this.store.flush();
      this.lastError = null;
    } catch (err) {
      this.lastError = (err as Error).message;
      log.warn({ err: this.lastError }, 'Tick falhou (Orthanc inacessível?)');
    }
  }
}
