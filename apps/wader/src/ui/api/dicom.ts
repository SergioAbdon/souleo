import { FastifyInstance } from 'fastify';
import { OrthancClient } from '../../adapters/orthanc-client';
import { WorkspaceRepo } from '../../adapters/workspace-repo';
import { processarEstudo } from '../../workers/dicom-ingest';
import { DicomIngestWorker } from '../../workers/dicom-ingest-worker';
import { createLogger } from '../../logger';
import { WaderConfig } from '../../config/types';

const log = createLogger({ module: 'api-dicom' });

/**
 * Endpoints de DICOM ingest.
 *
 *   GET  /api/dicom/test                          — testa conexão com Orthanc
 *   GET  /api/dicom/changes?since=N&limit=M       — espia /changes (debug)
 *   POST /api/dicom/import/:orthancStudyId        — processa estudo manualmente
 *   GET  /api/dicom/worker                        — status do worker
 *   POST /api/dicom/worker/start                  — liga worker
 *   POST /api/dicom/worker/stop                   — desliga worker
 *   POST /api/dicom/worker/reset-cursor           — reseta cursor (re-processa tudo)
 */
export function registerDicomRoutes(
  app: FastifyInstance,
  config: WaderConfig,
  worker: DicomIngestWorker | null = null,
): void {
  const workspaceRepo = new WorkspaceRepo(config.wsId);
  const client = new OrthancClient(workspaceRepo);

  app.get('/api/dicom/test', async (_req, reply) => {
    const result = await client.testConnection();
    return reply.send(result);
  });

  app.get<{ Querystring: { since?: string; limit?: string } }>('/api/dicom/changes', async (req, reply) => {
    const since = Number(req.query.since ?? 0);
    const limit = Number(req.query.limit ?? 50);
    try {
      const changes = await client.changes(since, limit);
      return reply.send({ ok: true, ...changes });
    } catch (err) {
      log.error({ err }, 'Falha em /api/dicom/changes');
      return reply.status(502).send({ ok: false, error: 'orthanc_inacessivel', message: (err as Error).message });
    }
  });

  app.post<{ Params: { orthancStudyId: string } }>(
    '/api/dicom/import/:orthancStudyId',
    async (req, reply) => {
      try {
        const result = await processarEstudo({
          client,
          orthancStudyId: req.params.orthancStudyId,
          wsId: config.wsId,
        });
        return reply.send({ ok: result.matched && result.imagensFalhadas === 0, ...result });
      } catch (err) {
        log.error({ err }, 'Falha em /api/dicom/import');
        return reply.status(500).send({
          ok: false,
          error: 'import_falhou',
          message: (err as Error).message,
        });
      }
    },
  );

  app.get('/api/dicom/worker', async (_req, reply) => {
    if (!worker) {
      return reply.send({
        ok: true,
        configurado: false,
        mensagem: 'DICOM ingest worker não inicializado.',
      });
    }
    return reply.send({ ok: true, configurado: true, ...worker.getStatus() });
  });

  app.post('/api/dicom/worker/start', async (_req, reply) => {
    if (!worker) {
      return reply.status(409).send({ ok: false, error: 'worker_nao_configurado' });
    }
    worker.start();
    return reply.send({ ok: true, ...worker.getStatus() });
  });

  app.post('/api/dicom/worker/stop', async (_req, reply) => {
    if (!worker) {
      return reply.status(409).send({ ok: false, error: 'worker_nao_configurado' });
    }
    worker.stop();
    return reply.send({ ok: true, ...worker.getStatus() });
  });

  app.post('/api/dicom/worker/reset-cursor', async (_req, reply) => {
    if (!worker) {
      return reply.status(409).send({ ok: false, error: 'worker_nao_configurado' });
    }
    worker.resetCursor();
    return reply.send({ ok: true, ...worker.getStatus() });
  });
}
