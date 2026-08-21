import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trocarAccComReserva } from './reconciliacao';

vi.mock('../../adapters/firebase', () => ({
  FieldValue: { serverTimestamp: () => '__ts__' },
  getDb: () => { throw new Error('não usado neste teste — db é injetado'); },
}));

// Fake Firestore mínimo: só o que trocarAccComReserva usa.
function makeFakeDb(opts: { dupDocs?: Array<{ id: string }> } = {}) {
  const batchOps: Array<{ op: 'create' | 'delete' | 'update'; id: string; obj?: Record<string, unknown> }> = [];
  let commitShouldThrowAlreadyExists = false;

  const examesCol = {
    doc: (id: string) => ({ id }),
    where: (_f: string, _o: string, _v: unknown) => ({
      limit: (_n: number) => ({
        get: async () => ({
          empty: (opts.dupDocs ?? []).length === 0,
          docs: opts.dupDocs ?? [],
        }),
      }),
    }),
  };

  const db = {
    collection: () => ({ doc: () => ({ collection: () => examesCol }) }),
    doc: (path: string) => ({ id: path }),
    batch: () => ({
      create: (ref: { id: string }, obj: Record<string, unknown>) => batchOps.push({ op: 'create', id: ref.id, obj }),
      delete: (ref: { id: string }) => batchOps.push({ op: 'delete', id: ref.id }),
      update: (ref: { id: string }, obj: Record<string, unknown>) => batchOps.push({ op: 'update', id: ref.id, obj }),
      commit: async () => {
        if (commitShouldThrowAlreadyExists) {
          const err = new Error('6 ALREADY_EXISTS') as Error & { code?: number };
          err.code = 6;
          throw err;
        }
      },
    }),
  } as unknown as FirebaseFirestore.Firestore;

  return { db, batchOps, setCommitThrows: (v: boolean) => { commitShouldThrowAlreadyExists = v; } };
}

describe('trocarAccComReserva', () => {
  it('acc duplicado (outro exame já usa) responde 409, sem mexer no batch', async () => {
    const { db, batchOps } = makeFakeDb({ dupDocs: [{ id: 'outro-exame' }] });
    const resultado = await trocarAccComReserva(db, 'ws1', 'ex1', { acc: 'EX999' }, 'EX111');
    expect(resultado).toEqual({ ok: false, status: 409, error: 'ACC EX999 já pertence ao exame outro-exame' });
    expect(batchOps).toEqual([]);
  });

  it('acc novo troca a reserva em batch: create novo + delete antigo + update exame', async () => {
    const { db, batchOps } = makeFakeDb();
    const resultado = await trocarAccComReserva(db, 'ws1', 'ex1', { acc: 'EX999', pacienteNome: 'FULANO' }, 'EX111');
    expect(resultado).toEqual({ ok: true });
    expect(batchOps).toEqual([
      { op: 'create', id: 'workspaces/ws1/accIndex/EX999', obj: { exameId: 'ex1', em: '__ts__' } },
      { op: 'delete', id: 'workspaces/ws1/accIndex/EX111' },
      { op: 'update', id: 'ex1', obj: { acc: 'EX999', pacienteNome: 'FULANO' } },
    ]);
  });

  it('sem acc antigo (exame nunca teve ACC), não tenta apagar reserva nenhuma', async () => {
    const { db, batchOps } = makeFakeDb();
    await trocarAccComReserva(db, 'ws1', 'ex1', { acc: 'EX999' }, '');
    expect(batchOps.some((o) => o.op === 'delete')).toBe(false);
  });

  it('colisão na reserva do accIndex (create ALREADY_EXISTS) responde 409', async () => {
    const { db, setCommitThrows } = makeFakeDb();
    setCommitThrows(true);
    const resultado = await trocarAccComReserva(db, 'ws1', 'ex1', { acc: 'EX999' }, 'EX111');
    expect(resultado).toEqual({ ok: false, status: 409, error: 'ACC EX999 já está em uso' });
  });
});
