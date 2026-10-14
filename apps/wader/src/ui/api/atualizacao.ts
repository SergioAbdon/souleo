import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '../../logger';
import { WaderConfig } from '../../config/types';
import { GuardaPin, origemPermitida } from '../../lib/pin';
import { CODIGO, type Pedido } from '../../lib/saida';
import type { ReleaseInfo } from '../../lib/estado';

const log = createLogger({ module: 'api-atualizacao' });

export interface AtualizacaoDeps {
  release: () => ReleaseInfo | null;
  baixar: (info: ReleaseInfo, dir: string) => Promise<void>;
  sair: (codigo: number, pedido: Omit<Pedido, 'em'>) => never;
  prevExiste: () => boolean;
  dirUpdates: () => string;
}

/**
 * Botões do /admin (spec §5):
 *   POST /api/admin/atualizar — baixa a release, grava pedido {atualizar}, sai 10
 *   POST /api/admin/voltar    — grava pedido {voltar}, sai 10
 * O lançador faz o resto. Ambos: X-Wader-Pin + Origin (lib/pin.ts).
 */
export function registerAtualizacaoRoutes(app: FastifyInstance, config: WaderConfig, deps: AtualizacaoDeps): void {
  let emVoo = false; // um download por vez: duplo clique não pisa no mesmo .tmp
  let saidaAgendada = false; // pedido já vai sair: o 2º pedido (atualizar×voltar) não sobrescreve
  const guarda = config.adminPin ? new GuardaPin(config.adminPin) : null;

  const autorizar = (req: FastifyRequest, reply: FastifyReply): FastifyReply | null => {
    if (!guarda) return reply.status(503).send({ ok: false, error: 'sem_pin', message: 'adminPin não configurado em wader.config.json' });
    if (!origemPermitida(req.headers.origin, config.ui.port)) return reply.status(403).send({ ok: false, error: 'origem' });
    const v = guarda.verificar(req.headers['x-wader-pin'] as string | undefined);
    if (v === 'bloqueado') return reply.status(429).send({ ok: false, error: 'bloqueado', message: '5 erros: tente em 15 min' });
    if (v === 'errado') return reply.status(401).send({ ok: false, error: 'pin' });
    if (saidaAgendada) return reply.status(409).send({ ok: false, error: 'saindo' });
    return null;
  };

  // Responde antes de sair: o navegador precisa do 200 pra mostrar "reiniciando".
  // false = outra saída já agendada (ex.: /voltar chegou durante o download do /atualizar).
  const sairDepois = (pedido: Omit<Pedido, 'em'>): boolean => {
    if (saidaAgendada) return false;
    saidaAgendada = true;
    setTimeout(() => deps.sair(CODIGO.ATUALIZACAO, pedido), 300);
    return true;
  };

  app.post('/api/admin/atualizar', async (req, reply) => {
    const negado = autorizar(req, reply);
    if (negado) return negado;
    const info = deps.release();
    if (!info) return reply.status(409).send({ ok: false, error: 'sem_versao_nova' });
    if (emVoo) return reply.status(409).send({ ok: false, error: 'em_andamento' });
    emVoo = true; // só solta se o download falhar: com saída agendada, o processo vai embora
    try {
      await deps.baixar(info, deps.dirUpdates());
    } catch (err) {
      emVoo = false;
      log.error({ err }, 'Download da release falhou');
      return reply.status(502).send({ ok: false, error: 'download', message: (err as Error).message });
    }
    if (!sairDepois({ atualizar: info.versao, motivo: 'atualizacao' })) return reply.status(409).send({ ok: false, error: 'saindo' });
    log.warn({ versao: info.versao }, 'Atualização pedida pelo painel — saindo pro lançador aplicar');
    return reply.send({ ok: true, versao: info.versao });
  });

  app.post('/api/admin/voltar', async (req, reply) => {
    const negado = autorizar(req, reply);
    if (negado) return negado;
    if (!deps.prevExiste()) return reply.status(409).send({ ok: false, error: 'sem_prev' });
    if (!sairDepois({ voltar: true, motivo: 'rollback' })) return reply.status(409).send({ ok: false, error: 'saindo' });
    log.warn('Rollback pedido pelo painel — saindo pro lançador voltar');
    return reply.send({ ok: true });
  });
}
