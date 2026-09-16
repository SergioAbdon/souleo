import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock hojeClinica (fonte de "hoje" — não UTC) ───────────────────────
let hojeClinicaMock: string;
vi.mock('../lib/clinica-tempo', () => ({
  hojeClinica: () => hojeClinicaMock,
}));

// ── Mock processarEstudo (Task 1 já cobre a lógica de match/CPF/etc.) ──
const processarEstudoMock = vi.fn();
vi.mock('./dicom-ingest', () => ({
  processarEstudo: (...args: unknown[]) => processarEstudoMock(...args),
}));

// ── Mock Firestore: espiona where().where().orderBy().limit().get() ────
let queryDocs: Array<{ id: string; data: () => Record<string, unknown> }>;
let whereCalls: Array<[string, string, unknown]>;
let orderByCalls: Array<[string, string]>;
let limitCalls: number[];

vi.mock('../adapters/firebase', () => ({
  getDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: (f1: string, o1: string, v1: unknown) => {
            whereCalls.push([f1, o1, v1]);
            return {
              where: (f2: string, o2: string, v2: unknown) => {
                whereCalls.push([f2, o2, v2]);
                return {
                  orderBy: (campo: string, dir: string) => {
                    orderByCalls.push([campo, dir]);
                    return {
                      limit: (n: number) => {
                        limitCalls.push(n);
                        return { get: async () => ({ docs: queryDocs }) };
                      },
                    };
                  },
                };
              },
            };
          },
        }),
      }),
    }),
  }),
}));

import { AccRecoveryWorker } from './acc-recovery-worker';

const WS = 'ws1';

function makeClient(config: {
  studiesByAcc: Record<string, string[]>;
  studies: Record<string, string>; // studyId -> AccessionNumber
}) {
  return {
    findStudiesByAccession: async (d: string) => config.studiesByAcc[d] ?? [],
    getStudy: async (id: string) => ({ MainDicomTags: { AccessionNumber: config.studies[id] } }),
  } as any;
}

function doc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

beforeEach(() => {
  hojeClinicaMock = '2026-08-21';
  queryDocs = [];
  whereCalls = [];
  orderByCalls = [];
  limitCalls = [];
  processarEstudoMock.mockReset();
});

describe('AccRecoveryWorker — régua estrita', () => {
  it('cutoffData deriva de hojeClinica (não UTC)', () => {
    hojeClinicaMock = '2026-08-21';
    const worker = new AccRecoveryWorker({ wsId: WS, client: makeClient({ studiesByAcc: {}, studies: {} }), intervalSec: 30 });
    expect((worker as any).cutoffData()).toBe('2026-08-17');
  });

  it('só conta recuperado quando o estudo tem ACC EXATO e entrou no exame que originou a busca', async () => {
    queryDocs = [
      doc('e1', { status: 'aguardando', acc: 'EX334' }), // estudo achado é só PARECIDO (3341)
      doc('e2', { status: 'aguardando', acc: 'EX556' }), // estudo achado é EXATO e vincula em e2
      doc('e3', { status: 'aguardando', acc: 'EX778' }), // estudo achado é EXATO mas vinculou noutro exame
    ];
    const client = makeClient({
      studiesByAcc: { '334': ['studyA'], '556': ['studyB'], '778': ['studyC'] },
      studies: { studyA: 'EX3341', studyB: 'EX556', studyC: 'EX778' },
    });
    processarEstudoMock.mockImplementation(async (opts: { orthancStudyId: string }) => {
      if (opts.orthancStudyId === 'studyB') return { exameIdNoLeo: 'e2', matched: true };
      if (opts.orthancStudyId === 'studyC') return { exameIdNoLeo: 'outro-exame', matched: true };
      throw new Error('não deveria chamar processarEstudo para studyA (ACC só PARECIDO)');
    });

    const worker = new AccRecoveryWorker({ wsId: WS, client, intervalSec: 30 });
    await (worker as any).tick();

    // ACC apenas parecido (3341 ≠ 334): NUNCA chama processarEstudo pra studyA.
    expect(processarEstudoMock).toHaveBeenCalledTimes(2);
    const calledStudies = processarEstudoMock.mock.calls.map((c) => c[0].orthancStudyId);
    expect(calledStudies).toEqual(['studyB', 'studyC']);

    // Só e2 conta como recuperado (exameIdNoLeo bateu com quem originou a busca).
    expect(worker.getStatus().recuperados).toBe(1);
  });

  it('query usa where dataExame >= cutoff com limit 25 (sem varrer coleção)', async () => {
    hojeClinicaMock = '2026-08-21';
    queryDocs = [];
    const worker = new AccRecoveryWorker({ wsId: WS, client: makeClient({ studiesByAcc: {}, studies: {} }), intervalSec: 30 });
    await (worker as any).tick();

    expect(whereCalls).toEqual([
      ['status', '==', 'aguardando'],
      ['dataExame', '>=', '2026-08-17'],
    ]);
    expect(limitCalls).toEqual([25]);
  });

  // S4-T15 fix (W1): sem orderBy DESC o Firestore ordena por doc id e a página
  // de 25 enche com exames velhos da janela — o de HOJE nunca entra no lote.
  it('ordena por dataExame DESC (o exame de hoje entra na página de 25)', async () => {
    const worker = new AccRecoveryWorker({ wsId: WS, client: makeClient({ studiesByAcc: {}, studies: {} }), intervalSec: 30 });
    await (worker as any).tick();

    expect(orderByCalls).toEqual([['dataExame', 'desc']]);
  });
});
