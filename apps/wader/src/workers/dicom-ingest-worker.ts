import { OrthancClient } from '../adapters/orthanc-client';
import { processarEstudo, IngestResult } from './dicom-ingest';
import { createLogger } from '../logger';

const log = createLogger({ module: 'dicom-ingest-worker' });

export interface DicomIngestWorkerOptions {
  wsId: string;
  client: OrthancClient;
  intervalSec: number;
}

/**
 * Worker que monitora `/changes` do Orthanc e processa novos estudos.
 *
 * Estratégia:
 *   - Mantém cursor `lastSeq` em memória (em produção, persistir em arquivo
 *     pra retomar após reinício)
 *   - Polling a cada `intervalSec` segundos
 *   - Pra cada change `StableStudy` (estudo finalizado), processa
 *   - Processados ficam em `processedStudyIds` pra evitar duplo-processamento
 *
 * Por que `StableStudy` e não `NewStudy`?
 *   - `NewStudy` dispara quando primeira instance chega — estudo ainda incompleto
 *   - `StableStudy` dispara quando Orthanc considera o estudo "completo"
 *     (configurável via StableAge no orthanc.json — default 60s sem novas instances)
 */
export class DicomIngestWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastSeq = 0;
  private execCount = 0;
  private lastTickAt: Date | null = null;
  private lastError: string | null = null;
  private estudosProcessados = 0;
  private estudosOrfaos = 0;
  private processedStudyIds = new Set<string>();
  private lastResults: IngestResult[] = [];

  constructor(private readonly opts: DicomIngestWorkerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    log.info({ intervalSec: this.opts.intervalSec, wsId: this.opts.wsId }, 'DICOM ingest worker iniciado');
    this.tick();
    this.timer = setInterval(() => this.tick(), this.opts.intervalSec * 1000);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    log.info('DICOM ingest worker parado');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus() {
    return {
      running: this.running,
      intervalSec: this.opts.intervalSec,
      lastSeq: this.lastSeq,
      execCount: this.execCount,
      estudosProcessados: this.estudosProcessados,
      estudosOrfaos: this.estudosOrfaos,
      lastTickAt: this.lastTickAt?.toISOString() ?? null,
      lastError: this.lastError,
      cacheProcessados: this.processedStudyIds.size,
      ultimosResultados: this.lastResults.slice(-5),
    };
  }

  /**
   * Reseta cursor pra 0 (re-processa tudo).
   * Útil pra debug / quando muda lógica de processamento.
   */
  resetCursor(): void {
    this.lastSeq = 0;
    this.processedStudyIds.clear();
    log.info('Cursor de changes resetado pra 0');
  }

  private async tick(): Promise<void> {
    this.execCount++;
    this.lastTickAt = new Date();
    try {
      const changes = await this.opts.client.changes(this.lastSeq, 100);
      this.lastSeq = changes.Last;

      // Filtra estudos estáveis ainda não processados
      const studiesToProcess = changes.Changes.filter(
        (c) =>
          c.ChangeType === 'StableStudy' &&
          c.ResourceType === 'Study' &&
          !this.processedStudyIds.has(c.ID),
      );

      if (studiesToProcess.length === 0) {
        this.lastError = null;
        return;
      }

      log.info({ count: studiesToProcess.length, lastSeq: this.lastSeq }, 'Novos estudos estáveis detectados');

      for (const change of studiesToProcess) {
        this.processedStudyIds.add(change.ID);
        try {
          const result = await processarEstudo({
            client: this.opts.client,
            orthancStudyId: change.ID,
            wsId: this.opts.wsId,
          });
          this.lastResults.push(result);
          if (this.lastResults.length > 20) this.lastResults = this.lastResults.slice(-20);
          if (result.matched) this.estudosProcessados++;
          else this.estudosOrfaos++;
        } catch (err) {
          log.error({ err, orthancStudyId: change.ID }, 'Falha ao processar estudo');
          this.lastError = (err as Error).message;
        }
      }
    } catch (err) {
      this.lastError = (err as Error).message;
      // Não loga em ERROR no tick recorrente — só warn (clínica pode estar offline temporariamente)
      log.warn({ err: this.lastError }, 'Tick falhou (Orthanc inacessível?)');
    }
  }
}
