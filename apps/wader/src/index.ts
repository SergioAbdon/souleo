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

import { loadConfig, ConfigError } from './config/load';
import { logger, createLogger } from './logger';
import { startUiServer } from './ui/server';
import { initFirebase } from './adapters/firebase';
import { validarWorklistPath } from './workers/worklist-path-validator';
import type { FastifyInstance } from 'fastify';

const log = createLogger({ module: 'main' });

async function main(): Promise<void> {
  log.info('Wader iniciando…');

  let config;
  try {
    config = loadConfig();
    log.info({ wsId: config.wsId, agentId: config.agentId }, 'Configuração carregada');
  } catch (err) {
    if (err instanceof ConfigError) {
      log.fatal(err.message);
      process.exit(1);
    }
    throw err;
  }

  try {
    initFirebase(config.firebase);
  } catch (err) {
    log.fatal({ err }, 'Falha ao inicializar Firebase');
    process.exit(1);
  }

  // Valida pasta de worklists. Falhar NÃO derruba Wader — só desativa worklist sync.
  const wlPathValidation = validarWorklistPath(config.orthanc.worklistPath);
  if (!wlPathValidation.ok) {
    log.warn(
      { path: config.orthanc.worklistPath, error: wlPathValidation.error, hint: wlPathValidation.hint },
      'Pasta worklists inválida — sync de worklist ficará desativado',
    );
  }

  const app = await startUiServer(config);

  registerShutdownHandlers(app);

  log.info('Wader rodando. Acesse http://localhost:%d', config.ui.port);
}

function registerShutdownHandlers(app: FastifyInstance): void {
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Sinal recebido, encerrando…');
    try {
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
  logger.fatal({ err }, 'Erro fatal no startup do Wader');
  process.exit(1);
});
