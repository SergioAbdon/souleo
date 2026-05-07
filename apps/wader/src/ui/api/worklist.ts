import { FastifyInstance } from 'fastify';
import { syncWorklists, detalhesPasta } from '../../workers/worklist-sync';
import { validarWorklistPath } from '../../workers/worklist-path-validator';
import { WorklistSyncWorker } from '../../workers/worklist-sync-worker';
import { createLogger } from '../../logger';
import { WaderConfig } from '../../config/types';

const log = createLogger({ module: 'api-worklist' });

/**
 * Endpoints de worklist (gerar/listar `.wl` pro Orthanc).
 *
 *   POST /api/worklist/sync           — sincroniza pasta com Firestore (manual)
 *   GET  /api/worklist/list?data=     — lista `.wl` na pasta
 *   GET  /api/worklist/path-status    — valida pasta (existe/escrevível)
 *   GET  /api/worklist/worker         — status do worker periódico
 *   POST /api/worklist/worker/start   — liga worker
 *   POST /api/worklist/worker/stop    — desliga worker
 */
export function registerWorklistRoutes(
  app: FastifyInstance,
  config: WaderConfig,
  worker: WorklistSyncWorker | null = null,
): void {
  app.post<{ Body?: { data?: string } }>('/api/worklist/sync', async (req, reply) => {
    try {
      const result = await syncWorklists({
        wsId: config.wsId,
        worklistPath: config.orthanc.worklistPath,
        data: req.body?.data,
      });
      return reply.send({ ok: true, ...result });
    } catch (err) {
      log.error({ err }, 'Falha em /api/worklist/sync');
      return reply.status(500).send({
        ok: false,
        error: 'sync_falhou',
        message: (err as Error).message,
      });
    }
  });

  app.get('/api/worklist/list', async (_req, reply) => {
    try {
      const arquivos = detalhesPasta(config.orthanc.worklistPath);
      return reply.send({
        ok: true,
        worklistPath: config.orthanc.worklistPath,
        total: arquivos.length,
        arquivos,
      });
    } catch (err) {
      log.error({ err }, 'Falha em /api/worklist/list');
      return reply.status(500).send({
        ok: false,
        error: 'list_falhou',
        message: (err as Error).message,
      });
    }
  });

  app.get('/api/worklist/path-status', async (_req, reply) => {
    const validation = validarWorklistPath(config.orthanc.worklistPath);
    return reply.send(validation);
  });

  app.get('/api/worklist/worker', async (_req, reply) => {
    if (!worker) {
      return reply.send({
        ok: true,
        configurado: false,
        mensagem: 'Worker periódico não inicializado (provavelmente pasta inválida no startup).',
      });
    }
    return reply.send({ ok: true, configurado: true, ...worker.getStatus() });
  });

  app.post('/api/worklist/worker/start', async (_req, reply) => {
    if (!worker) {
      return reply.status(409).send({
        ok: false,
        error: 'worker_nao_configurado',
        message: 'Worker não foi inicializado (pasta inválida?). Reinicie o Wader após corrigir.',
      });
    }
    worker.start();
    return reply.send({ ok: true, ...worker.getStatus() });
  });

  app.post('/api/worklist/worker/stop', async (_req, reply) => {
    if (!worker) {
      return reply.status(409).send({ ok: false, error: 'worker_nao_configurado' });
    }
    worker.stop();
    return reply.send({ ok: true, ...worker.getStatus() });
  });
}
