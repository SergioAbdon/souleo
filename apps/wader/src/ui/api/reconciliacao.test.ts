import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trocarAccComReserva, excluirReenvio, montarReconciliacao } from './reconciliacao';
import { estudosEmExclusao } from '../../workers/dicom-ingest';
import type { OrthancClient, OrthancStudy } from '../../adapters/orthanc-client';
import type { DicomIngestWorker } from '../../workers/dicom-ingest-worker';

vi.mock('../../adapters/firebase', () => ({
  FieldValue: { serverTimestamp: () => '__ts__', delete: () => '__del__' },
  getDb: () => { throw new Error('não usado neste teste — db é injetado'); },
}));

vi.mock('../../adapters/storage-uploader', () => ({
  removerImagensExame: vi.fn(async () => 0),
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

// ─── excluirReenvio + montarReconciliacao (Task 7) ─────────────────────────

const STUDY_BASE: OrthancStudy = {
  ID: 'study1',
  ParentPatient: 'pat1',
  PatientMainDicomTags: { PatientID: '11122233344', PatientName: 'FULANO DE TAL' },
  MainDicomTags: { AccessionNumber: 'EX123', StudyInstanceUID: 'uid1' },
  Series: ['s1', 's2'],
  IsStable: true,
};

/** Fake Firestore mínimo pro workspaces/{ws}/exames + /auditoria usados por excluirReenvio. */
function makeFakeExameDb(exames: Array<{ id: string; data: Record<string, unknown> }>, order: string[] = []) {
  const auditoriaDocs: Record<string, unknown>[] = [];
  const examesCol = {
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => {
        const docs = exames
          .filter((e) => e.data[field] === value)
          .map((e) => ({
            id: e.id,
            data: () => e.data,
            ref: {
              update: async (obj: Record<string, unknown>) => {
                order.push(`update:${e.id}`);
                Object.assign(e.data, obj);
              },
            },
          }));
        return { empty: docs.length === 0, docs };
      },
    }),
  };
  const wsDoc = {
    collection: (name: string) => {
      if (name === 'exames') return examesCol;
      if (name === 'auditoria') {
        return {
          add: async (obj: Record<string, unknown>) => {
            order.push('auditoria');
            auditoriaDocs.push(obj);
          },
        };
      }
      throw new Error(`coleção não mockada: ${name}`);
    },
  };
  const db = {
    collection: (name: string) => {
      if (name !== 'workspaces') throw new Error(`coleção raiz não mockada: ${name}`);
      return { doc: (_wsId: string) => wsDoc };
    },
  } as unknown as FirebaseFirestore.Firestore;
  return { db, auditoriaDocs };
}

function makeFakeClient(study: OrthancStudy | null, order: string[] = []) {
  return {
    getStudy: vi.fn(async () => {
      if (!study) throw new Error('not found');
      return study;
    }),
    deleteStudy: vi.fn(async () => {
      order.push('delete');
    }),
  } as unknown as OrthancClient;
}

function makeFakeWorker(order: string[] = []) {
  return {
    forgetStudy: vi.fn((_id: string) => {
      order.push('forget');
    }),
  } as unknown as DicomIngestWorker;
}

const FINGERPRINT_OK = { accDicom: 'EX123', patientIdDicom: '11122233344' };

describe('excluirReenvio', () => {
  beforeEach(() => {
    estudosEmExclusao.clear();
  });

  it('recusa quando dicomWorker é null (UI-only) com 409', async () => {
    const { db } = makeFakeExameDb([]);
    const client = makeFakeClient(STUDY_BASE);
    const resultado = await excluirReenvio(db, client, null, 'ws1', {
      orthancStudyId: 'study1',
      fingerprint: FINGERPRINT_OK,
      operador: 'Ana',
    });
    expect(resultado.status).toBe(409);
    expect(resultado.ok).toBe(false);
  });

  it('recusa quando o exame dono está emitido', async () => {
    const { db } = makeFakeExameDb([
      { id: 'ex1', data: { status: 'emitido', dicomOrthancStudyId: 'study1' } },
    ]);
    const client = makeFakeClient(STUDY_BASE);
    const worker = makeFakeWorker();
    const resultado = await excluirReenvio(db, client, worker, 'ws1', {
      orthancStudyId: 'study1',
      fingerprint: FINGERPRINT_OK,
      operador: 'Ana',
    });
    expect(resultado.status).toBe(409);
    expect(resultado.error).toContain('EMITIDO');
    expect(client.deleteStudy).not.toHaveBeenCalled();
  });

  it('recusa quando a impressão digital divergiu (estudo mudou desde a renderização)', async () => {
    const { db } = makeFakeExameDb([]);
    const client = makeFakeClient(STUDY_BASE);
    const worker = makeFakeWorker();
    const resultado = await excluirReenvio(db, client, worker, 'ws1', {
      orthancStudyId: 'study1',
      fingerprint: { accDicom: 'EX999', patientIdDicom: '11122233344' },
      operador: 'Ana',
    });
    expect(resultado.status).toBe(409);
    expect(resultado.error).toMatch(/mudou/);
    expect(client.deleteStudy).not.toHaveBeenCalled();
  });

  it('executa na ordem: marca → limpa donos+Storage → auditoria → DELETE → forget → desmarca', async () => {
    const order: string[] = [];
    const { db, auditoriaDocs } = makeFakeExameDb(
      [{ id: 'ex1', data: { status: 'aguardando', dicomOrthancStudyId: 'study1' } }],
      order,
    );
    const client = makeFakeClient(STUDY_BASE, order);
    const worker = makeFakeWorker(order);

    const { removerImagensExame } = await import('../../adapters/storage-uploader');
    vi.mocked(removerImagensExame).mockImplementation(async () => {
      expect(estudosEmExclusao.has('study1')).toBe(true); // DURANTE a limpeza
      order.push('storage');
      return 0;
    });

    expect(estudosEmExclusao.has('study1')).toBe(false);
    const resultado = await excluirReenvio(db, client, worker, 'ws1', {
      orthancStudyId: 'study1',
      fingerprint: FINGERPRINT_OK,
      operador: 'Ana',
    });

    expect(resultado.ok).toBe(true);
    expect(estudosEmExclusao.has('study1')).toBe(false); // desmarcado no final
    expect(order).toEqual(['update:ex1', 'storage', 'auditoria', 'delete', 'forget']);
    expect(auditoriaDocs).toHaveLength(1);
    expect(auditoriaDocs[0]).toMatchObject({
      tipo: 'exclusao-estudo-orthanc',
      orthancStudyId: 'study1',
      operadorDeclarado: 'Ana',
      examesLimpos: ['ex1'],
    });
  });
});

/** Fake Firestore mínimo pro workspaces/{ws}/exames usado por montarReconciliacao. */
function makeFakeReconDb(exames: Array<{ id: string; data: Record<string, unknown> }>) {
  const whereCalls: Array<[string, string, unknown]> = [];
  const examesCol = {
    where: (field: string, op: string, value: unknown) => {
      whereCalls.push([field, op, value]);
      return {
        get: async () => {
          const docs = exames
            .filter((e) => e.data[field] === value)
            .map((e) => ({ id: e.id, data: () => e.data }));
          return { empty: docs.length === 0, docs };
        },
      };
    },
  };
  const wsDoc = {
    collection: (name: string) => {
      if (name === 'exames') return examesCol;
      throw new Error(`coleção não mockada: ${name}`);
    },
  };
  const db = {
    collection: (name: string) => {
      if (name !== 'workspaces') throw new Error(`coleção raiz não mockada: ${name}`);
      return { doc: (_wsId: string) => wsDoc };
    },
  } as unknown as FirebaseFirestore.Firestore;
  return { db, whereCalls };
}

describe('montarReconciliacao', () => {
  it('usa where dataExame == data (não 5 varreduras por status)', async () => {
    const { db, whereCalls } = makeFakeReconDb([
      { id: 'ex1', data: { dataExame: '2026-08-21', acc: 'EX1', pacienteNome: 'A' } },
    ]);
    const client = { listStudies: vi.fn(async () => []) } as unknown as OrthancClient;

    const resultado = await montarReconciliacao(db, 'ws1', client, '2026-08-21');

    expect(whereCalls).toEqual([['dataExame', '==', '2026-08-21']]);
    expect(resultado.exames.map((e) => e.id)).toEqual(['ex1']);
    expect(client.listStudies).toHaveBeenCalledWith(80, '2026-08-21');
  });

  it('sugestões: órfão com CPF que bate exame do dia vem com sugestaoExameId preenchido', async () => {
    const { db } = makeFakeReconDb([
      { id: 'ex1', data: { dataExame: '2026-08-21', acc: '', pacienteNome: 'FULANO', cpf: '111.222.333-44' } },
    ]);
    const orfao: OrthancStudy = {
      ID: 'orfao1',
      ParentPatient: 'p',
      PatientMainDicomTags: { PatientID: '11122233344', PatientName: 'FULANO' },
      MainDicomTags: { AccessionNumber: '', StudyInstanceUID: 'uidX' },
      Series: ['s1'],
      IsStable: true,
    };
    const client = { listStudies: vi.fn(async () => [orfao]) } as unknown as OrthancClient;

    const resultado = await montarReconciliacao(db, 'ws1', client, '2026-08-21');

    expect(resultado.orfaos).toHaveLength(1);
    expect(resultado.orfaos[0].sugestaoExameId).toBe('ex1');
  });
});
