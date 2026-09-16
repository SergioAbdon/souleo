import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createLogger } from '../logger';
import { WaderConfig } from '../config/types';
import { WorklistSyncWorker } from '../workers/worklist-sync-worker';
import { DicomIngestWorker } from '../workers/dicom-ingest-worker';
import { OrthancClient } from '../adapters/orthanc-client';
import { WorkspaceRepo } from '../adapters/workspace-repo';
import { registerAgendamentosRoutes } from './api/agendamentos';
import { registerProcedimentosRoutes } from './api/procedimentos';
import { registerOrthancConfigRoutes } from './api/orthanc-config';
import { registerWorklistRoutes } from './api/worklist';
import { registerDicomRoutes } from './api/dicom';
import { registerReconciliacaoRoutes } from './api/reconciliacao';

const log = createLogger({ module: 'ui-server' });
const PAGES_DIR = path.join(__dirname, 'pages');

/**
 * Servidor web local do Wader.
 *
 * Roda em localhost:8043 (configurável via wader.config.json).
 * Não é exposto pra internet — só acessível da própria máquina.
 *
 * Três áreas:
 *   /              → recepção (cadastro manual + lista de exames)
 *   /admin         → painel admin (config, logs, status)
 *   /wizard        → wizard de instalação inicial
 *   /api/*         → endpoints internos (placeholder na F1)
 */
export interface UiServerExtras {
  worklistWorker: WorklistSyncWorker | null;
  dicomWorker?: DicomIngestWorker | null;
  orthancClient?: OrthancClient | null;
  /** Instância única compartilhada (fim das cópias em dicom.ts/orthanc-config.ts). */
  workspaceRepo?: WorkspaceRepo | null;
  /** Versão real do package.json (index.ts) — /version deixa de mentir "0.1.0". */
  versao?: string;
}

export async function startUiServer(
  config: WaderConfig,
  extras: UiServerExtras = { worklistWorker: null, dicomWorker: null },
): Promise<FastifyInstance> {
  const workspaceRepo = extras.workspaceRepo ?? new WorkspaceRepo(config.wsId);
  const orthancClient = extras.orthancClient ?? new OrthancClient(workspaceRepo);
  const app = Fastify({
    logger: false, // usamos pino diretamente via createLogger
    bodyLimit: 50 * 1024 * 1024, // 50 MB (DICOM SR pode ser grande)
  });

  // Páginas estáticas (HTML/CSS/JS futuros)
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'pages'),
    prefix: '/static/',
    decorateReply: false,
  });

  registerHealthRoutes(app, extras.versao);
  registerPageRoutes(app);
  registerApiRoutes(app, config);
  registerAgendamentosRoutes(app, config);
  registerProcedimentosRoutes(app, config);
  registerOrthancConfigRoutes(app, config, workspaceRepo);
  registerWorklistRoutes(app, config, extras.worklistWorker);
  registerDicomRoutes(app, config, extras.dicomWorker ?? null, orthancClient);
  registerReconciliacaoRoutes(app, config, orthancClient, extras.dicomWorker ?? null);

  await app.listen({ host: '127.0.0.1', port: config.ui.port });

  log.info({ port: config.ui.port }, 'UI server iniciado em http://localhost:%d', config.ui.port);
  return app;
}

function registerHealthRoutes(app: FastifyInstance, versao?: string): void {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'wader',
    timestamp: new Date().toISOString(),
  }));

  // Achado 11/pacote de latência: versão REAL do package.json (index.ts),
  // não o literal '0.1.0' congelado desde a F1 — o cartão de Integrações
  // precisa saber qual versão está rodando de fato pra depurar clínica a clínica.
  app.get('/version', async () => ({
    version: versao ?? '0.0.0',
  }));
}

function registerPageRoutes(app: FastifyInstance): void {
  const servePage = (filename: string) => async (_req: unknown, reply: any) => {
    const content = await fs.promises.readFile(path.join(PAGES_DIR, filename), 'utf-8');
    return reply.type('text/html; charset=utf-8').send(content);
  };

  app.get('/', servePage('reception.html'));
  app.get('/admin', servePage('admin.html'));
  app.get('/wizard', servePage('wizard.html'));
  // Console de conferência (vincular/trocar/excluir p/ reenvio) — só admin,
  // NUNCA na recepção (decisão do produto, Task 7).
  app.get('/conferencia', servePage('conferencia.html'));
}

function registerApiRoutes(app: FastifyInstance, config: WaderConfig): void {
  const startTime = Date.now();

  app.get('/api/status', async () => ({
    service: 'wader',
    phase: 'F2',
    wsId: config.wsId,
    agentId: config.agentId,
    uptimeSec: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  }));
}
