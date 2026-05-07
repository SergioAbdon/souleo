import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createLogger } from '../logger';
import { WaderConfig } from '../config/types';
import { registerAgendamentosRoutes } from './api/agendamentos';
import { registerProcedimentosRoutes } from './api/procedimentos';
import { registerOrthancConfigRoutes } from './api/orthanc-config';
import { registerWorklistRoutes } from './api/worklist';

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
export async function startUiServer(config: WaderConfig): Promise<FastifyInstance> {
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

  registerHealthRoutes(app);
  registerPageRoutes(app);
  registerApiRoutes(app, config);
  registerAgendamentosRoutes(app, config);
  registerProcedimentosRoutes(app, config);
  registerOrthancConfigRoutes(app, config);
  registerWorklistRoutes(app, config);

  await app.listen({ host: '127.0.0.1', port: config.ui.port });

  log.info({ port: config.ui.port }, 'UI server iniciado em http://localhost:%d', config.ui.port);
  return app;
}

function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', async () => ({
    status: 'ok',
    service: 'wader',
    timestamp: new Date().toISOString(),
  }));

  app.get('/version', async () => ({
    version: '0.1.0',
    phase: 'F1 — Esqueleto',
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
