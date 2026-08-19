import { describe, it, expect, vi, beforeEach } from 'vitest';

let setCalls: Array<{ path: string; data: unknown; opts: unknown }>;
let shouldThrow: boolean;

vi.mock('./firebase', () => ({
  getDb: () => ({
    doc: (path: string) => ({
      set: async (data: unknown, opts: unknown) => {
        if (shouldThrow) throw new Error('firestore indisponível');
        setCalls.push({ path, data, opts });
      },
    }),
  }),
}));

import { iniciarBatimento } from './heartbeat';

describe('iniciarBatimento', () => {
  beforeEach(() => {
    setCalls = [];
    shouldThrow = false;
    vi.useFakeTimers();
  });

  it('escreve tipo/visto/versao/maquina em integracoes/wader na primeira batida', async () => {
    const parar = iniciarBatimento('ws1', '1.2.3');
    await vi.advanceTimersByTimeAsync(0); // deixa a batida imediata (não-gated por timer) resolver

    expect(setCalls).toHaveLength(1);
    expect(setCalls[0].path).toBe('workspaces/ws1/integracoes/wader');
    expect(setCalls[0].opts).toEqual({ merge: true });
    const data = setCalls[0].data as Record<string, unknown>;
    expect(data.tipo).toBe('wader');
    expect(data.versao).toBe('1.2.3');
    expect(data.visto).toBeInstanceOf(Date);
    expect(typeof data.maquina).toBe('string');

    parar();
    vi.useRealTimers();
  });

  it('nunca lança quando a escrita falha (falha em silêncio)', async () => {
    shouldThrow = true;
    expect(() => iniciarBatimento('ws1', '1.2.3')).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(setCalls).toHaveLength(0);

    vi.useRealTimers();
  });

  it('parar() cancela o timer periódico', async () => {
    const parar = iniciarBatimento('ws1', '1.2.3');
    await vi.advanceTimersByTimeAsync(0);
    expect(setCalls).toHaveLength(1);

    parar();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    expect(setCalls).toHaveLength(1);

    vi.useRealTimers();
  });
});
