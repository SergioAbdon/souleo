import { OrthancClient } from '../adapters/orthanc-client';
import { processarEstudo } from './dicom-ingest';
import { getDb } from '../adapters/firebase';
import { digitos } from '../lib/acc';
import { createLogger } from '../logger';

const log = createLogger({ module: 'acc-recovery-worker' });

export interface AccRecoveryWorkerOptions {
  wsId: string;
  client: OrthancClient;
  intervalSec: number;
  /** Quantos dias pra trás considerar (evita varrer exame antigo). Default 4. */
  janelaDias?: number;
}

/**
 * Recuperação dirigida por AccessionNumber (ADR 2026-05-18, Fix 3).
 *
 * PROBLEMA QUE RESOLVE: o `dicom-ingest-worker` caminha o feed `/changes`
 * de 100 em 100 a cada 30s. Recuperar 1 exame que está lá atrás pode levar
 * minutos (18/05: ~5 min pra 800+ changes). Lento ao ponto de "as imagens
 * não chegarem ao Leo".
 *
 * ESTRATÉGIA: em vez de esperar o feed, vai DIRETO ao ponto. Pra cada
 * exame LEO `status=aguardando` sem imagem (`dicomStudyUid` vazio) que tem
 * `acc`, pergunta ao Orthanc `POST /tools/find {AccessionNumber: *digitos*}`
 * — O(1) no Orthanc. Achou o estudo → processa na hora.
 *
 * Resultado: recuperação em ≤ um ciclo (não depende de paginar o feed),
 * tolerante a ACC digitado sem o prefixo `EX` (wildcard nos dígitos).
 * Idempotente e seguro: `processarEstudo` respeita a Trava 2 de status.
 */
export class AccRecoveryWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private execCount = 0;
  private lastTickAt: Date | null = null;
  private lastError: string | null = null;
  private recuperados = 0;

  constructor(private readonly opts: AccRecoveryWorkerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    log.info(
      { intervalSec: this.opts.intervalSec, wsId: this.opts.wsId },
      'ACC recovery worker iniciado',
    );
    this.tick();
    this.timer = setInterval(() => this.tick(), this.opts.intervalSec * 1000);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    log.info('ACC recovery worker parado');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus() {
    return {
      running: this.running,
      intervalSec: this.opts.intervalSec,
      execCount: this.execCount,
      recuperados: this.recuperados,
      lastTickAt: this.lastTickAt?.toISOString() ?? null,
      lastError: this.lastError,
    };
  }

  private cutoffData(): string {
    const dias = this.opts.janelaDias ?? 4;
    const d = new Date();
    d.setDate(d.getDate() - dias);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  private async tick(): Promise<void> {
    this.execCount++;
    this.lastTickAt = new Date();
    try {
      // Single-field where (sem índice composto) + filtro em memória.
      const snap = await getDb()
        .collection('workspaces')
        .doc(this.opts.wsId)
        .collection('exames')
        .where('status', '==', 'aguardando')
        .get();

      const cutoff = this.cutoffData();
      const pendentes = snap.docs
        .map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }))
        .filter(
          (e) =>
            !e.data.dicomStudyUid &&
            typeof e.data.acc === 'string' &&
            (e.data.acc as string).length > 0 &&
            (typeof e.data.dataExame !== 'string' || (e.data.dataExame as string) >= cutoff),
        )
        .slice(0, 25);

      if (pendentes.length === 0) {
        this.lastError = null;
        return;
      }

      log.info({ pendentes: pendentes.length }, 'Exames aguardando sem DICOM — tentando achar no Orthanc por ACC');

      for (const e of pendentes) {
        const acc = e.data.acc as string;
        const d = digitos(acc);
        if (!d) continue;
        try {
          const studyIds = await this.opts.client.findStudiesByAccession(d);
          if (studyIds.length === 0) continue;

          for (const studyId of studyIds) {
            const result = await processarEstudo({
              client: this.opts.client,
              orthancStudyId: studyId,
              wsId: this.opts.wsId,
            });
            if (result.matched) {
              this.recuperados++;
              log.info(
                {
                  exameId: e.id,
                  acc,
                  orthancStudyId: studyId,
                  imagens: result.imagensProcessadas,
                  medidas: result.medidasExtraidas,
                },
                'Exame recuperado por ACC (sem esperar o feed de changes)',
              );
              break; // casou — não tenta outros estudos pro mesmo exame
            }
          }
        } catch (err) {
          log.warn({ err, exameId: e.id, acc }, 'Falha ao recuperar exame por ACC');
        }
      }
      this.lastError = null;
    } catch (err) {
      this.lastError = (err as Error).message;
      log.warn({ err: this.lastError }, 'Tick ACC-recovery falhou');
    }
  }
}
