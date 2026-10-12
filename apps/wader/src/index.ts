/**
 * Wader — Entry point.
 *
 * Orquestra o ciclo de vida completo do agente:
 *   1. Carrega configuração
 *   2. Inicia logger
 *   3. Sobe servidor web local (UI)
 *   4. Registra graceful shutdown (SIGINT/SIGTERM)
 *
 * Em fases posteriores virá:
 *   - Worker de sync de worklist (Firestore → .wl)
 *   - Worker de monitoramento Orthanc /changes
 *   - Worker de upload (Firebase Storage + OneDrive)
 *   - Forwarder de DICOM SR pro servidor LEO
 *   - Heartbeat pro LEO (badge online/offline)
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { loadConfig, ConfigError } from './config/load';
import { logger, createLogger } from './logger';
import { CODIGO, sairCom, lerLancador } from './lib/saida';
import { iniciarVigia } from './lib/vigia';
import { startUiServer } from './ui/server';
import { initFirebase } from './adapters/firebase';
import { OrthancClient } from './adapters/orthanc-client';
import { WorkspaceRepo } from './adapters/workspace-repo';
import { iniciarBatimento } from './adapters/heartbeat';
import { validarWorklistPath } from './workers/worklist-path-validator';
import { WorklistSyncWorker } from './workers/worklist-sync-worker';
import { DicomIngestWorker } from './workers/dicom-ingest-worker';
import { AccRecoveryWorker } from './workers/acc-recovery-worker';
import type { FastifyInstance } from 'fastify';

const log = createLogger({ module: 'main' });

/**
 * Lê a versão real do código empacotado (apps/wader/package.json), não um
 * campo de config por-máquina que ninguém mantém (WaderConfig.version).
 *
 * package.json.json fica um nível acima de __dirname tanto rodando via
 * `tsx src/index.ts` (__dirname = src/) quanto compilado (__dirname =
 * dist/index.js, rootDir src → outDir dist espelham a mesma estrutura).
 * Sem "type": "module" no package.json do Wader (CommonJS), __dirname é
 * nativo — não precisa de import.meta.url.
 *
 * Não importamos o JSON direto (resolveJsonModule) porque package.json está
 * fora de rootDir ("./src") e isso quebra o build com TS6059.
 */
function lerVersaoPackage(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch (err) {
    log.warn({ err }, 'Não foi possível ler versão do package.json, usando fallback');
    return '0.0.0';
  }
}

async function main(): Promise<void> {
  log.info('Wader iniciando…');

  let config;
  try {
    config = loadConfig();
    log.info({ wsId: config.wsId, agentId: config.agentId }, 'Configuração carregada');
  } catch (err) {
    if (err instanceof ConfigError) {
      log.fatal(err.message);
      sairCom(CODIGO.CONFIG, { motivo: 'config' });
    }
    throw err;
  }

  try {
    initFirebase(config.firebase);
  } catch (err) {
    log.fatal({ err }, 'Falha ao inicializar Firebase');
    sairCom(CODIGO.CONFIG, { motivo: 'config' });
  }

  // O que o lançador deixou pra nós (spec §5): publicado no /health e no
  // batimento pelas tarefas seguintes. Não apagar — o arquivo é do lançador.
  const lancador = lerLancador();
  if (lancador) log.info({ lancador }, 'lancador.json lido na subida');

  // Modo UI-only (WADER_UI_ONLY=1): sobe servidor + console SEM os workers.
  // Permite rodar uma instância de DEV noutra porta sem dois Waders
  // processarem os mesmos exames (escrita dupla). Ver ADR 2026-06-26.
  const uiOnly = process.env.WADER_UI_ONLY === '1' || process.env.WADER_UI_ONLY === 'true';

  // OrthancClient é sempre necessário (UI server + endpoint de reconciliação).
  const workspaceRepo = new WorkspaceRepo(config.wsId);
  const orthancClient = new OrthancClient(workspaceRepo);

  let worklistWorker: WorklistSyncWorker | null = null;
  let dicomWorker: DicomIngestWorker | null = null;
  let accWorker: AccRecoveryWorker | null = null;
  let pararBatimento: (() => void) | null = null;
  let pararVigia: (() => void) | null = null;

  if (uiOnly) {
    log.warn('WADER_UI_ONLY ativo — workers DESLIGADOS (modo dev/console; não processa exames)');
  } else {
    // Valida pasta de worklists. Falhar NÃO derruba Wader — só desativa worklist sync.
    const wlPathValidation = validarWorklistPath(config.orthanc.worklistPath);
    if (!wlPathValidation.ok) {
      log.warn(
        { path: config.orthanc.worklistPath, error: wlPathValidation.error, hint: wlPathValidation.hint },
        'Pasta worklists inválida — sync de worklist ficará desativado',
      );
    } else {
      worklistWorker = new WorklistSyncWorker({
        wsId: config.wsId,
        worklistPath: config.orthanc.worklistPath,
        intervalSec: config.polling.worklistSyncSec,
        scheduledStationName: config.orthanc.scheduledStationName,
      });
      worklistWorker.start();
    }

    // DICOM ingest worker — não derruba se Orthanc estiver fora; tenta a cada tick
    dicomWorker = new DicomIngestWorker({
      wsId: config.wsId,
      client: orthancClient,
      intervalSec: config.polling.orthancChangesSec,
    });
    dicomWorker.start();

    // Vigia (spec §6): tick parado > 2 min → pedido.json {travado} + saída 3.
    const dicomVigiado = dicomWorker;
    pararVigia = iniciarVigia({
      ultimoTickOkEm: () => dicomVigiado.getUltimoTickOkEm(),
      ligado: () => dicomVigiado.isRunning(),
      aoTravar: () => {
        log.fatal({ ultimoTickOkEm: dicomVigiado.getUltimoTickOkEm() }, 'Ingestão travada — saindo pro serviço reiniciar');
        sairCom(CODIGO.VIGIA, { motivo: 'travado' });
      },
    });

    // ACC recovery worker (ADR 2026-05-18, Fix 3) — recuperação dirigida:
    // acha exame aguardando sem DICOM e busca o estudo no Orthanc por ACC.
    // ADR 2026-06-22 (Fix C): intervalo próprio (default 20s).
    accWorker = new AccRecoveryWorker({
      wsId: config.wsId,
      client: orthancClient,
      intervalSec: config.polling.accRecoverySec ?? 20,
    });
    accWorker.start();

    // Batimento (Sub-plano 5, D4) — diz "estou aqui" pro cartão de Integrações
    // distinguir "Wader parado" de "sem exame hoje". Não derruba nada se falhar.
    // Task 8 (D1): também verifica o Orthanc daqui de dentro da rede da clínica
    // (a nuvem não alcança mais ele — Task 7).
    pararBatimento = iniciarBatimento(config.wsId, lerVersaoPackage(), workspaceRepo, orthancClient, {
      ultimoErroIngest: () => dicomWorker?.getUltimoErro() ?? null,
    });
  }

  const app = await startUiServer(config, {
    worklistWorker,
    dicomWorker,
    orthancClient,
    workspaceRepo,
    versao: lerVersaoPackage(),
    lancador,
  });

  registerShutdownHandlers(app, { worklistWorker, dicomWorker, accWorker, pararBatimento, pararVigia });

  log.info('Wader rodando. Acesse http://localhost:%d', config.ui.port);
}

function registerShutdownHandlers(
  app: FastifyInstance,
  workers: {
    worklistWorker: WorklistSyncWorker | null;
    dicomWorker: DicomIngestWorker | null;
    accWorker: AccRecoveryWorker | null;
    pararBatimento: (() => void) | null;
    pararVigia: (() => void) | null;
  } = {
    worklistWorker: null,
    dicomWorker: null,
    accWorker: null,
    pararBatimento: null,
    pararVigia: null,
  },
): void {
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Sinal recebido, encerrando…');
    try {
      workers.worklistWorker?.stop();
      workers.dicomWorker?.stop();
      workers.accWorker?.stop();
      workers.pararBatimento?.();
      workers.pararVigia?.();
      await app.close();
      log.info('Servidor encerrado com sucesso.');
      process.exit(0);
    } catch (err) {
      log.error({ err }, 'Erro durante shutdown.');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    log.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

main().catch((err) => {
  // Porta ocupada = outro Wader nesta máquina (spec §12): código 2, mensagem clara.
  if ((err as NodeJS.ErrnoException)?.code === 'EADDRINUSE') {
    logger.fatal({ err }, 'Porta ocupada — já existe um Wader rodando nesta máquina?');
    sairCom(CODIGO.CONFIG, { motivo: 'config' });
  }
  logger.fatal({ err }, 'Erro fatal no startup do Wader');
  process.exit(1);
});
