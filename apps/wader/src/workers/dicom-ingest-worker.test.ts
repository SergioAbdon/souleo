import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';

// ── Mock do Firestore (só o pedaço que a flag reprocessarDicom usa) ────
let exames: Record<string, Record<string, unknown>>;
let updates: Array<{ id: string; obj: Record<string, unknown> }>;

vi.mock('../adapters/firebase', () => {
  const makeRef = (id: string) => ({
    update: async (obj: Record<string, unknown>) => {
      updates.push({ id, obj });
      const cur = exames[id] ?? {};
      for (const [k, v] of Object.entries(obj)) {
        if (v === '__delete__') delete cur[k];
        else cur[k] = v;
      }
      exames[id] = cur;
    },
  });
  return {
    FieldValue: { serverTimestamp: () => '__ts__', delete: () => '__delete__' },
    getDb: () => ({
      collection: () => ({
        doc: () => ({
          collection: () => ({
            where: (field: string, _op: string, val: unknown) => ({
              limit: () => ({
                get: async () => {
                  const docs = Object.entries(exames)
                    .filter(([, data]) => (data as Record<string, unknown>)[field] === val)
                    .map(([id, data]) => ({ id, ref: makeRef(id), data: () => data }));
                  return { empty: docs.length === 0, docs };
                },
              }),
            }),
          }),
        }),
      }),
    }),
  };
});

let processarEstudoImpl: (opts: Record<string, unknown>) => Promise<unknown>;
vi.mock('./dicom-ingest', () => ({
  processarEstudo: vi.fn(async (opts: Record<string, unknown>) => processarEstudoImpl(opts)),
}));

import { DicomIngestWorker } from './dicom-ingest-worker';
import { processarEstudo } from './dicom-ingest';

const WS = 'ws1';

function makeClient() {
  return {
    changes: async () => ({ Changes: [], Done: true, Last: 0 }),
  } as any;
}

function makeWorker(name: string) {
  return new DicomIngestWorker({
    wsId: WS,
    client: makeClient(),
    intervalSec: 999,
    stateFile: path.join(os.tmpdir(), `wader-ingest-test-${name}-${Date.now()}-${Math.random()}.json`),
  });
}

beforeEach(() => {
  exames = {};
  updates = [];
  vi.clearAllMocks();
  processarEstudoImpl = async () => ({
    orthancStudyId: 'S1',
    accessionNumber: '',
    exameIdNoLeo: null,
    matched: true,
    imagensProcessadas: 0,
    imagensFalhadas: 0,
    bytesTotais: 0,
    medidasExtraidas: 0,
    errors: [],
  });
});

describe('DicomIngestWorker — reprocesso sob demanda (flag reprocessarDicom)', () => {
  it('exame com reprocessarDicom=true e dicomOrthancStudyId é reprocessado com override e a flag limpa', async () => {
    exames['doc1'] = { reprocessarDicom: true, dicomOrthancStudyId: 'S1' };
    const worker = makeWorker('a');
    await (worker as any).tick();

    expect(processarEstudo).toHaveBeenCalledTimes(1);
    expect(processarEstudo).toHaveBeenCalledWith(
      expect.objectContaining({ orthancStudyId: 'S1', wsId: WS, forceSr: true, exameIdOverride: 'doc1' }),
    );
    expect(exames['doc1'].reprocessarDicom).toBeUndefined();
  });

  it('exame com flag mas sem vínculo: flag limpa + dicomUltimoErro gravado', async () => {
    exames['doc2'] = { reprocessarDicom: true };
    const worker = makeWorker('b');
    await (worker as any).tick();

    expect(processarEstudo).not.toHaveBeenCalled();
    expect(exames['doc2'].reprocessarDicom).toBeUndefined();
    expect(exames['doc2'].dicomUltimoErro).toBe('Reprocesso pedido mas exame sem estudo vinculado');
    expect(exames['doc2'].dicomUltimoErroEm).toBe('__ts__');
  });
});
