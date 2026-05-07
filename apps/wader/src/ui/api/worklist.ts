import { FastifyInstance } from 'fastify';
import { syncWorklists, detalhesPasta } from '../../workers/worklist-sync';
import { validarWorklistPath } from '../../workers/worklist-path-validator';
import { createLogger } from '../../logger';
import { WaderConfig } from '../../config/types';

const log = createLogger({ module: 'api-worklist' });

/**
 * Endpoints de worklist (gerar/listar `.wl` pro Orthanc).
 *
 *   POST /api/worklist/sync           — sincroniza pasta com Firestore (manual)
 *   GET  /api/worklist/list?data=     — lista `.wl` na pasta
 *   GET  /api/worklist/path-status    — valida pasta (existe/escrevível)
 */
export function registerWorklistRoutes(app: FastifyInstance, config: WaderConfig): void {
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
}
