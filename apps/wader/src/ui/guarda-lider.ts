import type { FastifyInstance } from 'fastify';

/**
 * Cadeado (spec §7) num lugar só: não-líder (inclusive uiOnly) não escreve por
 * /api/* — seria o 2º escritor. Passam: leitura, /api/admin/* (atualizar/voltar)
 * e .../worker/stop (desligar nunca faz mal).
 */
export function registrarGuardaLider(app: FastifyInstance, souLider: () => boolean): void {
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD') return;
    // rota CASADA (padrão), não a URL crua: /%61pi/... ou ';' não escapam do cadeado
    const url = (req.routeOptions?.url ?? req.url).split('?')[0];
    if (!url.startsWith('/api/') || url.startsWith('/api/admin/') || url.endsWith('/worker/stop')) return;
    if (!souLider()) return reply.code(409).send({ ok: false, error: 'nao_lider' });
  });
}
