import { syncWorklists, SyncResult } from './worklist-sync';
import { createLogger } from '../logger';

const log = createLogger({ module: 'wl-sync-worker' });

export interface WorklistSyncWorkerOptions {
  wsId: string;
  worklistPath: string;
  intervalSec: number;
  /** Tag DICOM (0040,0010) do .wl. Default no wl-writer = "VIVIDT8". */
  scheduledStationName?: string;
}

/**
 * Worker que executa sync de worklists em loop, intervalo configurável.
 *
 * Estratégia:
 *   - setInterval simples (não precisa de scheduler externo pra ~60s)
 *   - Erro em uma iteração não derruba o worker — loga e continua
 *   - Pode ser pausado/retomado em runtime (via API admin)
 *
 * Não usa Firestore listener (real-time) por dois motivos:
 *   1. Firestore real-time tem custo crescente (1 listener por exame, ou subscription cara)
 *   2. Polling de 60s é bom suficiente — clínica não precisa de sync sub-segundo
 *      (Vivid puxa worklist quando usuário clica "Atualizar", não real-time)
 */
export class WorklistSyncWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastResult: SyncResult | null = null;
  private lastRunAt: Date | null = null;
  private lastError: string | null = null;
  private execCount = 0;

  constructor(private readonly opts: WorklistSyncWorkerOptions) {}

  start(): void {
    if (this.running) {
      log.warn('Worker já está rodando, ignorando start()');
      return;
    }
    this.running = true;
    log.info(
      { intervalSec: this.opts.intervalSec, wsId: this.opts.wsId, worklistPath: this.opts.worklistPath },
      'Worker de sync de worklist iniciado',
    );
    // Roda imediatamente (não espera o primeiro tick)
    this.tick();
    this.timer = setInterval(() => this.tick(), this.opts.intervalSec * 1000);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    log.info('Worker de sync de worklist parado');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus(): {
    running: boolean;
    intervalSec: number;
    execCount: number;
    lastRunAt: string | null;
    lastResult: SyncResult | null;
    lastError: string | null;
  } {
    return {
      running: this.running,
      intervalSec: this.opts.intervalSec,
      execCount: this.execCount,
      lastRunAt: this.lastRunAt?.toISOString() ?? null,
      lastResult: this.lastResult,
      lastError: this.lastError,
    };
  }

  private async tick(): Promise<void> {
    this.execCount++;
    this.lastRunAt = new Date();
    try {
      const result = await syncWorklists({
        wsId: this.opts.wsId,
        worklistPath: this.opts.worklistPath,
        scheduledStationName: this.opts.scheduledStationName,
      });
      this.lastResult = result;
      this.lastError = null;
      // Loga só quando tem mudança (evita poluir log)
      if (result.wlsCriados > 0 || result.wlsRemovidos > 0) {
        log.info(
          {
            criados: result.wlsCriados,
            removidos: result.wlsRemovidos,
            intactos: result.wlsIntactos,
            total: result.wlsDepois,
          },
          'Sync executado com mudanças',
        );
      }
    } catch (err) {
      this.lastError = (err as Error).message;
      log.error({ err }, 'Tick do worker falhou');
    }
  }
}
