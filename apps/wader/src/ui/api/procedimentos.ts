import { FastifyInstance } from 'fastify';
import { WorkspaceRepo } from '../../adapters/workspace-repo';
import { createLogger } from '../../logger';
import { WaderConfig } from '../../config/types';

const log = createLogger({ module: 'api-procedimentos' });

/**
 * Registra rota de listagem de procedimentos do workspace.
 *
 *   GET /api/procedimentos — retorna lista oferecida pela clínica
 *
 * Origem: workspaces/{wsId}/integracoes/feegow.procMap (LEO web salva lá
 *         quando integra Feegow). Mapa vazio ou ausente = lista vazia;
 *         configure em Integrações > Feegow.
 */
export function registerProcedimentosRoutes(app: FastifyInstance, config: WaderConfig): void {
  const workspaceRepo = new WorkspaceRepo(config.wsId);

  app.get('/api/procedimentos', async (_req, reply) => {
    try {
      const procedimentos = await workspaceRepo.getProcedimentos();
      return reply.send({ ok: true, total: procedimentos.length, procedimentos });
    } catch (err) {
      log.error({ err }, 'Falha ao buscar procedimentos do workspace');
      return reply.status(500).send({ ok: false, error: 'erro_firestore', message: (err as Error).message });
    }
  });

  // Endpoint para invalidar cache (útil quando admin atualiza integracoes/feegow.procMap no LEO)
  app.post('/api/procedimentos/refresh', async (_req, reply) => {
    workspaceRepo.invalidate();
    const procedimentos = await workspaceRepo.getProcedimentos();
    return reply.send({ ok: true, total: procedimentos.length, procedimentos });
  });
}
