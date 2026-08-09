import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks dos adapters (Firestore, Storage, SR parser) ─────────────────
// Estado controlável por teste:
let exameStore: Record<string, Record<string, unknown> & { __id: string }>;
let updates: Array<{ id: string; obj: Record<string, unknown> }>;
let srMock: { medidas: Record<string, unknown>; srInstanceId: string | null; totalMedidas: number; metodoFallback: string };
let srThrows: boolean;

vi.mock('../adapters/firebase', () => {
  const makeRef = (data: Record<string, unknown> & { __id: string }) => ({
    id: data.__id,
    update: async (obj: Record<string, unknown>) => {
      updates.push({ id: data.__id, obj });
      Object.assign(data, obj);
    },
    get: async () => ({ exists: true, data: () => data }),
  });
  return {
    FieldValue: { serverTimestamp: () => '__ts__' },
    getDb: () => ({
      collection: () => ({
        doc: () => ({
          collection: () => ({
            where: (_field: string, _op: string, val: string) => ({
              limit: () => ({
                get: async () => {
                  const data = exameStore[val];
                  if (!data) return { empty: true, docs: [] };
                  const ref = makeRef(data);
                  return { empty: false, docs: [{ ref, id: data.__id, data: () => data }] };
                },
              }),
            }),
            doc: (forma: string) => ({
              get: async () => {
                const data = exameStore[forma];
                return data ? { exists: true, ref: makeRef(data), data: () => data } : { exists: false };
              },
            }),
          }),
        }),
      }),
    }),
  };
});

vi.mock('../adapters/storage-uploader', () => ({
  uploadDicomPreview: vi.fn(async (o: { seq: number }) => ({
    url: `url_${o.seq}`,
    path: `p_${o.seq}`,
    bytes: 100,
  })),
}));

vi.mock('../adapters/dicom-sr-parser', () => ({
  extrairMedidasDoEstudo: vi.fn(async () => {
    if (srThrows) throw new Error('SR boom');
    return srMock;
  }),
}));

import { processarEstudo } from './dicom-ingest';
import { extrairMedidasDoEstudo } from '../adapters/dicom-sr-parser';

// ── Fake OrthancClient configurável ────────────────────────────────────
function makeClient(opts?: {
  accStudyLevel?: string;
  series?: Array<{ Modality: string; Instances: string[] }>;
  previewDelays?: Record<string, number>;
  previewFails?: Set<string>;
}) {
  const series = opts?.series ?? [
    { Modality: 'US', Instances: ['i1', 'i2', 'i3'] },
    { Modality: 'SR', Instances: ['sr1'] },
  ];
  return {
    getStudy: async () => ({
      MainDicomTags: {
        AccessionNumber: opts?.accStudyLevel ?? 'EX123',
        StudyInstanceUID: 'uid1',
        Modality: 'US',
        StudyDate: '20260622',
        StudyTime: '101010',
        StudyDescription: 'eco',
      },
      PatientMainDicomTags: {},
    }),
    getStudySeries: async () =>
      series.map((s) => ({ MainDicomTags: { Modality: s.Modality }, Instances: s.Instances })),
    getStudyInstances: async () => series.flatMap((s) => s.Instances),
    getInstancePreview: async (id: string) => {
      const d = opts?.previewDelays?.[id] ?? 0;
      if (d) await new Promise((r) => setTimeout(r, d));
      if (opts?.previewFails?.has(id)) throw new Error(`fail ${id}`);
      return Buffer.from(id);
    },
    getInstanceSimplifiedTags: async () => ({}),
  } as any;
}

const WS = 'ws1';

beforeEach(() => {
  exameStore = {};
  updates = [];
  srMock = { medidas: { a: 1, b: 2 }, srInstanceId: 'sr1', totalMedidas: 2, metodoFallback: 'content-sequence' };
  srThrows = false;
  vi.clearAllMocks();
});

describe('processarEstudo — two-stage / paralelo / Fix B', () => {
  it('exame novo (aguardando, sem medidas): extrai SR, grava etapa1+etapa2, status→andamento', async () => {
    exameStore['EX123'] = { __id: 'doc1', status: 'aguardando' };
    const r = await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS });

    expect(extrairMedidasDoEstudo).toHaveBeenCalledTimes(1);
    expect(r.matched).toBe(true);
    expect(r.imagensProcessadas).toBe(3); // 3 US (SR excluído)
    expect(r.imagensFalhadas).toBe(0);
    expect(r.medidasExtraidas).toBe(2);
    expect(updates).toHaveLength(2);
    // etapa1: medidas + status + dicomStudyUid; SEM imagens
    expect(updates[0].obj.medidasDicom).toEqual({ a: 1, b: 2 });
    expect(updates[0].obj.status).toBe('andamento');
    expect(updates[0].obj.dicomStudyUid).toBe('uid1');
    expect(updates[0].obj.imagensDicom).toBeUndefined();
    // etapa2: imagens, ordenadas, só US
    expect(updates[1].obj.imagensDicom).toEqual(['url_1', 'url_2', 'url_3']);
  });

  it('exame já com medidas, sem forceSr: PULA extração de SR (Fix B) e reusa contagem', async () => {
    exameStore['EX123'] = { __id: 'doc2', status: 'andamento', medidasDicom: { x: 1, y: 2, z: 3 } };
    const r = await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS });

    expect(extrairMedidasDoEstudo).not.toHaveBeenCalled();
    expect(r.medidasExtraidas).toBe(3); // reusou as 3 existentes
    expect(updates[0].obj.medidasDicom).toBeUndefined(); // não regravou medidas
    expect(updates[1].obj.imagensDicom).toEqual(['url_1', 'url_2', 'url_3']);
  });

  it('forceSr=true com medidas existentes: re-extrai SR', async () => {
    exameStore['EX123'] = { __id: 'doc3', status: 'andamento', medidasDicom: { x: 1 } };
    await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS, forceSr: true });
    expect(extrairMedidasDoEstudo).toHaveBeenCalledTimes(1);
    expect(updates[0].obj.medidasDicom).toEqual({ a: 1, b: 2 });
  });

  it('BUG FIX perda de dado: forceSr re-extrai VAZIO mas NÃO apaga medidas boas', async () => {
    exameStore['EX123'] = { __id: 'doc4', status: 'andamento', medidasDicom: { x: 1, y: 2 } };
    srMock = { medidas: {}, srInstanceId: null, totalMedidas: 0, metodoFallback: 'sem-sr' };
    const r = await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS, forceSr: true });
    expect(extrairMedidasDoEstudo).toHaveBeenCalledTimes(1);
    expect(updates[0].obj.medidasDicom).toBeUndefined(); // NÃO sobrescreveu com {}
    expect(r.medidasExtraidas).toBe(2); // preservou contagem existente
  });

  it('Trava 2: emitido continua emitido', async () => {
    exameStore['EX123'] = { __id: 'doc5', status: 'emitido', medidasDicom: { x: 1 } };
    await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS });
    expect(updates[0].obj.status).toBe('emitido');
  });

  it('Trava 2: rascunho continua rascunho', async () => {
    exameStore['EX123'] = { __id: 'doc6', status: 'rascunho' };
    await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS });
    expect(updates[0].obj.status).toBe('rascunho');
  });

  it('ordenação paralela: imagens saem ordenadas por seq mesmo completando fora de ordem', async () => {
    exameStore['EX123'] = { __id: 'doc7', status: 'aguardando' };
    // i1 demora mais que i2/i3 → completa por último, mas deve ficar em 1º
    const client = makeClient({
      series: [{ Modality: 'US', Instances: ['i1', 'i2', 'i3'] }],
      previewDelays: { i1: 40, i2: 5, i3: 5 },
    });
    await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    expect(updates[1].obj.imagensDicom).toEqual(['url_1', 'url_2', 'url_3']);
  });

  it('falha parcial de imagem: conta falha, grava as que deram certo', async () => {
    exameStore['EX123'] = { __id: 'doc8', status: 'aguardando' };
    const client = makeClient({
      series: [{ Modality: 'US', Instances: ['i1', 'i2', 'i3'] }],
      previewFails: new Set(['i2']),
    });
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    expect(r.imagensProcessadas).toBe(2);
    expect(r.imagensFalhadas).toBe(1);
    expect(updates).toHaveLength(2); // etapa2 ainda grava (nem todas falharam)
    expect(updates[1].obj.imagensDicom).toEqual(['url_1', 'url_3']);
  });

  it('TODAS as imagens falham: grava etapa1 (medidas) mas NÃO etapa2; matched fica true', async () => {
    exameStore['EX123'] = { __id: 'doc9', status: 'aguardando' };
    const client = makeClient({
      series: [{ Modality: 'US', Instances: ['i1', 'i2'] }],
      previewFails: new Set(['i1', 'i2']),
    });
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    expect(r.matched).toBe(true);
    expect(r.imagensProcessadas).toBe(0);
    expect(updates).toHaveLength(1); // só etapa1
    expect(r.errors.some((e) => e.includes('falharam'))).toBe(true);
  });

  it('SR lança exceção: não derruba; segue sem medidas, grava imagens', async () => {
    exameStore['EX123'] = { __id: 'doc10', status: 'aguardando' };
    srThrows = true;
    const r = await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS });
    expect(r.matched).toBe(true);
    expect(r.medidasExtraidas).toBe(0);
    expect(updates[0].obj.medidasDicom).toBeUndefined();
    expect(updates[1].obj.imagensDicom).toEqual(['url_1', 'url_2', 'url_3']);
  });

  it('sem match no Firestore: matched=false, nenhum update', async () => {
    // exameStore vazio
    const r = await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS });
    expect(r.matched).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it('ACC vazio no nível-estudo: varre séries e casa pelo ACC da instance', async () => {
    exameStore['EX999'] = { __id: 'doc11', status: 'aguardando' };
    const client = makeClient({ accStudyLevel: '' });
    // getInstanceSimplifiedTags devolve {} por padrão → sem ACC nas séries → não casa.
    // Sobrescreve pra devolver ACC numa instance:
    client.getInstanceSimplifiedTags = async () => ({ AccessionNumber: 'EX999' });
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    expect(r.accessionNumber).toBe('EX999');
    expect(r.matched).toBe(true);
  });
});
