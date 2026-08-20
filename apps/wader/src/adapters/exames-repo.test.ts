import { describe, it, expect, vi, beforeEach } from 'vitest';

let updates: Array<{ id: string; obj: Record<string, unknown> }>;
let shouldThrow: boolean;

vi.mock('./firebase', () => ({
  FieldValue: { serverTimestamp: () => '__ts__' },
  getDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: (id: string) => ({
            update: async (obj: Record<string, unknown>) => {
              if (shouldThrow) throw new Error('firestore indisponível');
              updates.push({ id, obj });
            },
          }),
        }),
      }),
    }),
  }),
}));

import { ExamesRepo } from './exames-repo';

describe('ExamesRepo.marcarMwl', () => {
  beforeEach(() => {
    updates = [];
    shouldThrow = false;
  });

  it('grava mwlStatus ok', async () => {
    const repo = new ExamesRepo('ws1');
    await repo.marcarMwl('ex1', 'ok');
    expect(updates).toEqual([{ id: 'ex1', obj: { mwlStatus: 'ok' } }]);
  });

  it('grava mwlStatus falhou', async () => {
    const repo = new ExamesRepo('ws1');
    await repo.marcarMwl('ex1', 'falhou');
    expect(updates).toEqual([{ id: 'ex1', obj: { mwlStatus: 'falhou' } }]);
  });

  it('nunca lança quando a escrita falha (silencioso)', async () => {
    shouldThrow = true;
    const repo = new ExamesRepo('ws1');
    await expect(repo.marcarMwl('ex1', 'ok')).resolves.toBeUndefined();
    expect(updates).toEqual([]);
  });
});
