import { FastifyInstance } from 'fastify';
import { WorkspaceRepo } from '../../adapters/workspace-repo';
import { createLogger } from '../../logger';
import { WaderConfig } from '../../config/types';

const log = createLogger({ module: 'api-orthanc-config' });

/**
 * Endpoint de debug/admin que mostra como o Wader resolveu a config do Orthanc.
 *
 * GET /api/orthanc/config — retorna config resolvida (senha mascarada)
 *
 * Útil pra:
 *   - Validar que workspace tem Orthanc configurado
 *   - Conferir se admin atualizou URL no LocalModal do LEO web
 *   - Diagnosticar quando Wader não consegue alcançar Orthanc
 */
export function registerOrthancConfigRoutes(app: FastifyInstance, config: WaderConfig): void {
  const workspaceRepo = new WorkspaceRepo(config.wsId);

  app.get('/api/orthanc/config', async (_req, reply) => {
    try {
      const conn = await workspaceRepo.getOrthancConnection();

      if (!conn) {
        return reply.send({
          ok: true,
          configurado: false,
          mensagem: 'Workspace não tem Orthanc ativo. Configure via LocalModal no LEO web.',
          worklistPathLocal: config.orthanc.worklistPath,
        });
      }

      return reply.send({
        ok: true,
        configurado: true,
        orthancRemoto: {
          url: conn.url,
          user: conn.user,
          // Mascara senha — só mostra últimos 3 chars
          passMascarada: conn.pass.length > 3 ? '***' + conn.pass.slice(-3) : '***',
          ativo: conn.ativo,
        },
        worklistPathLocal: config.orthanc.worklistPath,
        cacheTtlMin: 5,
      });
    } catch (err) {
      log.error({ err }, 'Falha ao resolver config Orthanc');
      return reply.status(500).send({
        ok: false,
        error: 'erro_firestore',
        message: (err as Error).message,
      });
    }
  });

  app.post('/api/orthanc/config/refresh', async (_req, reply) => {
    workspaceRepo.invalidate();
    const conn = await workspaceRepo.getOrthancConnection();
    return reply.send({ ok: true, configurado: !!conn });
  });
}
