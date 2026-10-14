// ══════════════════════════════════════════════════════════════════
// LEO · retry curto para chamadas de rede que falham a frio
//
// Origem (14/10/2026, clínica): a rota /api/exame/imagens-urls devolveu
// UM 500 na partida a frio da função na Vercel; 12 chamadas seguidas
// depois deram 200. A galeria chamava uma vez só e guardava a falha até o
// F5 — médico olhando 10 miniaturas pretas. Tentar de novo com pausa
// curta resolve o caso comum sem esconder falha persistente.
// ══════════════════════════════════════════════════════════════════

export type TentarOpts = {
  /** Total de tentativas (1 = sem retry). */
  tentativas?: number;
  /** Pausas (ms) antes da 2ª, 3ª… tentativa; a última repete se faltar. */
  pausasMs?: number[];
  /** Decide se o erro merece nova tentativa. Default: sempre. */
  retentar?: (erro: unknown) => boolean;
  /** Injetável nos testes. */
  dormir?: (ms: number) => Promise<void>;
};

export async function tentar<T>(fn: () => Promise<T>, opts: TentarOpts = {}): Promise<T> {
  const tentativas = Math.max(1, opts.tentativas ?? 3);
  const pausas = opts.pausasMs ?? [800, 2000];
  const retentar = opts.retentar ?? (() => true);
  const dormir = opts.dormir ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (e) {
      ultimo = e;
      if (i === tentativas - 1 || !retentar(e)) throw e;
      await dormir(pausas[Math.min(i, pausas.length - 1)] ?? 0);
    }
  }
  throw ultimo;
}

/** Erro HTTP com status, para a política de retry distinguir 5xx de 4xx. */
export class ErroHttp extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = 'ErroHttp';
    this.status = status;
  }
}

/** 5xx e falha de rede (sem status) merecem retry; 4xx não. */
export function retentavel(erro: unknown): boolean {
  return !(erro instanceof ErroHttp) || erro.status >= 500;
}
