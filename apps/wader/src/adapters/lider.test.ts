import { describe, it, expect, vi, afterEach } from 'vitest';
import { tentarAdquirir, renovar, iniciarLider, VALIDADE_MS } from './lider';

/** Firestore de mentira: 1 doc, transação serializada (o que importa aqui é a lógica). */
function dbFalso(inicial: Record<string, unknown> = {}) {
  let doc: Record<string, unknown> = { ...inicial };
  let falhar = false;
  const ref = { path: 'workspaces/ws1/integracoes/wader' };
  const db = {
    doc: () => ref,
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      if (falhar) throw new Error('UNAVAILABLE');
      const tx = {
        get: async () => ({ data: () => doc }),
        set: (_r: unknown, data: Record<string, unknown>) => { doc = { ...doc, ...data }; },
      };
      return fn(tx);
    },
  };
  return { db, lider: () => doc.lider as { agentId: string; maquina: string; ate: number; geracao: number } | undefined, setFalhar: (v: boolean) => { falhar = v; } };
}

const EU = { agentId: 'pc-1234', maquina: 'PC' };
const OUTRO = { agentId: 'nb-9999', maquina: 'NOTEBOOK' };
const T0 = 1_000_000;

describe('tentarAdquirir', () => {
  it('sem líder → pega, geracao 1, ate = agora + 90 s', async () => {
    const f = dbFalso();
    expect(await tentarAdquirir(f.db as any, 'ws1', EU, T0)).toEqual({ ok: true, geracao: 1 });
    expect(f.lider()).toEqual({ ...EU, ate: T0 + VALIDADE_MS, geracao: 1 });
  });
  it('líder vivo de outro → não pega e diz a máquina', async () => {
    const f = dbFalso({ lider: { ...OUTRO, ate: T0 + 10_000, geracao: 4 } });
    expect(await tentarAdquirir(f.db as any, 'ws1', EU, T0)).toEqual({ ok: false, maquina: 'NOTEBOOK' });
    expect(f.lider()?.agentId).toBe('nb-9999');
  });
  it('líder expirado → pega e incrementa geracao', async () => {
    const f = dbFalso({ lider: { ...OUTRO, ate: T0 - 1, geracao: 4 } });
    expect(await tentarAdquirir(f.db as any, 'ws1', EU, T0)).toEqual({ ok: true, geracao: 5 });
  });
  it('eu mesmo (reinício rápido) → pega sem esperar expirar', async () => {
    const f = dbFalso({ lider: { ...EU, ate: T0 + 60_000, geracao: 2 } });
    expect(await tentarAdquirir(f.db as any, 'ws1', EU, T0)).toEqual({ ok: true, geracao: 3 });
  });
});

describe('renovar', () => {
  it('meu agentId e minha geracao → renova ate', async () => {
    const f = dbFalso({ lider: { ...EU, ate: T0 + 10, geracao: 2 } });
    expect(await renovar(f.db as any, 'ws1', EU, 2, T0 + 30_000)).toBe(true);
    expect(f.lider()?.ate).toBe(T0 + 30_000 + VALIDADE_MS);
  });
  it('dono trocou (ou geracao diferente) → false e não toca no doc', async () => {
    const f = dbFalso({ lider: { ...OUTRO, ate: T0 + 10, geracao: 7 } });
    expect(await renovar(f.db as any, 'ws1', EU, 2, T0)).toBe(false);
    expect(f.lider()?.agentId).toBe('nb-9999');
    const g = dbFalso({ lider: { ...EU, ate: T0 + 10, geracao: 9 } });
    expect(await renovar(g.db as any, 'ws1', EU, 2, T0)).toBe(false);
  });
});

describe('iniciarLider', () => {
  afterEach(() => vi.useRealTimers());

  it('adquire na subida → aoVirarLider; renova a cada 30 s', async () => {
    vi.useFakeTimers();
    const f = dbFalso();
    const aoVirarLider = vi.fn(); const aoPerder = vi.fn();
    const l = iniciarLider({ db: f.db as any, wsId: 'ws1', eu: EU, aoVirarLider, aoPerder });
    await vi.advanceTimersByTimeAsync(0);
    expect(aoVirarLider).toHaveBeenCalledTimes(1);
    expect(l.souLider()).toBe(true);
    const ate1 = f.lider()!.ate;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.lider()!.ate).toBeGreaterThan(ate1);
    expect(aoPerder).not.toHaveBeenCalled();
    l.parar();
  });

  it('outro líder vivo → não-líder, outraMaquina, tenta de novo a cada 1 min e pega quando expira', async () => {
    vi.useFakeTimers();
    const f = dbFalso({ lider: { ...OUTRO, ate: Date.now() + 100_000, geracao: 1 } });
    const aoVirarLider = vi.fn(); const aoPerder = vi.fn();
    const l = iniciarLider({ db: f.db as any, wsId: 'ws1', eu: EU, aoVirarLider, aoPerder });
    await vi.advanceTimersByTimeAsync(0);
    expect(l.souLider()).toBe(false);
    expect(l.outraMaquina()).toBe('NOTEBOOK');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(aoVirarLider).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000); // agora o outro expirou
    expect(aoVirarLider).toHaveBeenCalledTimes(1);
    expect(l.souLider()).toBe(true);
    l.parar();
  });

  it('renovação descobre outro dono → aoPerder("lider")', async () => {
    vi.useFakeTimers();
    const f = dbFalso();
    const aoPerder = vi.fn();
    const l = iniciarLider({ db: f.db as any, wsId: 'ws1', eu: EU, aoVirarLider: () => {}, aoPerder });
    await vi.advanceTimersByTimeAsync(0);
    // alguém sobrescreveu (não deveria, mas é o caso que a renovação protege)
    await f.db.runTransaction(async (tx: any) => tx.set(null, { lider: { ...OUTRO, ate: Date.now() + 999_999, geracao: 99 } }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(aoPerder).toHaveBeenCalledWith('lider');
    l.parar();
  });

  it('sem rede por 90 s → aoPerder("lider"); falha curta não derruba', async () => {
    vi.useFakeTimers();
    const f = dbFalso();
    const aoPerder = vi.fn();
    const l = iniciarLider({ db: f.db as any, wsId: 'ws1', eu: EU, aoVirarLider: () => {}, aoPerder });
    await vi.advanceTimersByTimeAsync(0);
    f.setFalhar(true);
    await vi.advanceTimersByTimeAsync(60_000); // 2 renovações falhas (30 s, 60 s)
    expect(aoPerder).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000); // 90 s sem renovar
    expect(aoPerder).toHaveBeenCalledWith('lider');
    l.parar();
  });
});
