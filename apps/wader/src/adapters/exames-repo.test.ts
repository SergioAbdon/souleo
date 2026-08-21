import { describe, it, expect, vi, beforeEach } from 'vitest';

let updates: Array<{ id: string; obj: Record<string, unknown> }>;
let shouldThrow: boolean;
let batchOps: Array<{ op: 'set' | 'create' | 'update' | 'delete'; id: string; obj?: Record<string, unknown> }>;
let commitFailTimes: number; // quantas vezes o próximo commit() deve falhar com ALREADY_EXISTS
let commitCalls: number;

vi.mock('./pacientes-repo', () => ({
  PacientesRepo: class {
    async buscarOuCriar() {
      return { paciente: pacienteMock, criado: pacienteCriadoMock };
    }
  },
}));

vi.mock('./firebase', () => ({
  FieldValue: { serverTimestamp: () => '__ts__' },
  getDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          // marcarMwl passa id explícito; criarManual chama .doc() sem id
          // (Firestore geraria um ID novo — aqui fixamos um valor previsível).
          doc: (id?: string) => ({
            id: id ?? 'auto-exame-id',
            update: async (obj: Record<string, unknown>) => {
              if (shouldThrow) throw new Error('firestore indisponível');
              updates.push({ id: id ?? 'auto-exame-id', obj });
            },
          }),
        }),
      }),
    }),
    // getDb().doc(path) — usado pra reservar no accIndex (mesmo padrão de feegow-admin.ts)
    doc: (path: string) => ({ id: path }),
    batch: () => ({
      set: (ref: { id: string }, obj: Record<string, unknown>) => batchOps.push({ op: 'set', id: ref.id, obj }),
      create: (ref: { id: string }, obj: Record<string, unknown>) => batchOps.push({ op: 'create', id: ref.id, obj }),
      update: (ref: { id: string }, obj: Record<string, unknown>) => batchOps.push({ op: 'update', id: ref.id, obj }),
      delete: (ref: { id: string }) => batchOps.push({ op: 'delete', id: ref.id }),
      commit: async () => {
        commitCalls++;
        if (commitFailTimes > 0) {
          commitFailTimes--;
          const err = new Error('6 ALREADY_EXISTS: já existe') as Error & { code?: number };
          err.code = 6;
          throw err;
        }
      },
    }),
  }),
}));

let pacienteMock: { id: string; nome: string; cpf: string };
let pacienteCriadoMock: boolean;

import { ExamesRepo, gerarAccessionNumber } from './exames-repo';

beforeEach(() => {
  updates = [];
  shouldThrow = false;
  batchOps = [];
  commitFailTimes = 0;
  commitCalls = 0;
  pacienteMock = { id: 'pac1', nome: 'FULANO', cpf: '12345678901' };
  pacienteCriadoMock = false;
});

describe('ExamesRepo.marcarMwl', () => {
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

describe('gerarAccessionNumber', () => {
  it('tem 16 chars formato EX+14 dígitos', () => {
    expect(gerarAccessionNumber()).toMatch(/^EX\d{14}$/);
  });
});

describe('ExamesRepo.criarManual — ACC com reserva no cartório', () => {
  const input = {
    nomePaciente: 'FULANO', cpf: '12345678901', dtnasc: '', sexo: '' as const,
    telefone: '', convenio: '', tipoExame: 'eco_tt' as const,
    dataExame: '2026-08-21', horarioChegada: '10:00',
  };

  it('grava acc e cpf no exame e reserva no accIndex, no mesmo batch', async () => {
    const repo = new ExamesRepo('ws1');
    const { exame } = await repo.criarManual(input);

    expect(exame.acc).toMatch(/^EX\d{14}$/);
    expect(exame.cpf).toBe('12345678901');

    const setOp = batchOps.find((o) => o.op === 'set');
    expect(setOp?.obj?.acc).toBe(exame.acc);
    expect(setOp?.obj?.cpf).toBe('12345678901');

    const createOp = batchOps.find((o) => o.op === 'create');
    expect(createOp?.id).toBe(`workspaces/ws1/accIndex/${exame.acc}`);
    expect(createOp?.obj?.exameId).toBe('auto-exame-id');

    expect(commitCalls).toBe(1);
  });

  it('usa o cpf do input quando o paciente resolvido não tem cpf', async () => {
    pacienteMock = { id: 'pac2', nome: 'CICRANO', cpf: '' };
    const repo = new ExamesRepo('ws1');
    const { exame } = await repo.criarManual(input);
    expect(exame.cpf).toBe('12345678901'); // veio de input.cpf
  });

  it('em colisão de ACC (create ALREADY_EXISTS), regenera com offset +10ms e tenta 1x mais', async () => {
    commitFailTimes = 1;
    const repo = new ExamesRepo('ws1');
    const { exame } = await repo.criarManual(input);

    expect(exame.acc).toMatch(/^EX\d{14}$/);
    expect(commitCalls).toBe(2);

    const createOps = batchOps.filter((o) => o.op === 'create');
    expect(createOps).toHaveLength(2);
    expect(createOps[0].id).not.toBe(createOps[1].id); // 2ª tentativa usou ACC diferente (offset +10ms)
    expect(createOps[1].id).toBe(`workspaces/ws1/accIndex/${exame.acc}`);
  });

  it('em 2 colisões seguidas, propaga o erro (só 1 retry)', async () => {
    commitFailTimes = 2;
    const repo = new ExamesRepo('ws1');
    await expect(repo.criarManual(input)).rejects.toThrow(/ALREADY_EXISTS/);
    expect(commitCalls).toBe(2);
  });
});
