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

  // S4-T15 fix (W7): a flag some de qualquer jeito (senão o tick loopa), mas
  // um reprocesso que NÃO casou precisa ficar visível no exame — o médico
  // pediu e tem que saber que não deu, sem abrir o log do Wader.
  it('reprocesso que não casou: flag limpa E dicomUltimoErro gravado', async () => {
    exames['doc3'] = { reprocessarDicom: true, dicomOrthancStudyId: 'S1' };
    processarEstudoImpl = async () => ({
      orthancStudyId: 'S1',
      matched: false,
      errors: ['Estudo sem AccessionNumber — não dá pra fazer match'],
    });
    const worker = makeWorker('c');
    await (worker as any).tick();

    expect(exames['doc3'].reprocessarDicom).toBeUndefined();
    expect(exames['doc3'].dicomUltimoErro).toBe(
      'Reprocesso falhou: Estudo sem AccessionNumber — não dá pra fazer match',
    );
    expect(exames['doc3'].dicomUltimoErroEm).toBe('__ts__');
  });

  it('reprocesso sem erro reportado: mensagem genérica de indisponível', async () => {
    exames['doc4'] = { reprocessarDicom: true, dicomOrthancStudyId: 'S1' };
    processarEstudoImpl = async () => ({ orthancStudyId: 'S1', matched: false, errors: [] });
    const worker = makeWorker('d');
    await (worker as any).tick();

    expect(exames['doc4'].dicomUltimoErro).toBe('Reprocesso falhou: estudo indisponível');
  });
});

// ── Retry limitado de falha transitória (achado Codex 31/08) ───────────
// Sem instance nova o Orthanc não emite novo StableStudy, então o tick tem
// que reenfileirar sozinho o estudo com imagem falhada — com backoff e teto
// (MAX_TENTATIVAS_FALHA), preservando a proteção do Achado 9 contra loop.

/**
 * Client controlado pelo teste: `emitStable` entrega 1 StableStudy de S1 no
 * próximo tick (e se auto-desliga); `nInstances < 0` simula estudo apagado
 * no Orthanc (getStudySeries lança).
 */
function makeRetryClient(state: { nInstances: number; emitStable: boolean }) {
  return {
    changes: async () => {
      const Changes = state.emitStable
        ? [{ ChangeType: 'StableStudy', ResourceType: 'Study', ID: 'S1', Seq: 1 }]
        : [];
      state.emitStable = false;
      return { Changes, Done: true, Last: 1 };
    },
    getStudySeries: async () => {
      if (state.nInstances < 0) throw new Error('estudo apagado no Orthanc');
      return [
        {
          MainDicomTags: { Modality: 'US' },
          Instances: Array.from({ length: state.nInstances }, (_, i) => `i${i}`),
        },
      ];
    },
  } as any;
}

function makeRetryWorker(name: string, state: { nInstances: number; emitStable: boolean }) {
  return new DicomIngestWorker({
    wsId: WS,
    client: makeRetryClient(state),
    intervalSec: 999,
    stateFile: path.join(os.tmpdir(), `wader-ingest-test-${name}-${Date.now()}-${Math.random()}.json`),
  });
}

function resultado(processadas: number, falhadas: number) {
  return {
    orthancStudyId: 'S1',
    accessionNumber: 'A1',
    exameIdNoLeo: 'e1',
    matched: true,
    imagensProcessadas: processadas,
    imagensFalhadas: falhadas,
    bytesTotais: 0,
    medidasExtraidas: 0,
    errors: falhadas > 0 ? ['timeout no upload'] : [],
  };
}

function backdate(store: any, studyId: string, minutos: number) {
  const sig = store.getSignature(studyId);
  store.setSignature(studyId, {
    ...sig,
    at: new Date(Date.now() - minutos * 60_000).toISOString(),
  });
}

describe('DicomIngestWorker — retry limitado de falha transitória de imagem', () => {
  it('imagem falhada retenta após o backoff e o sucesso limpa a pendência', async () => {
    const estado = { nInstances: 3, emitStable: true };
    const worker = makeRetryWorker('retry-ok', estado);
    const store = (worker as any).store;
    let chamada = 0;
    processarEstudoImpl = async () => {
      chamada++;
      return chamada === 1 ? resultado(2, 1) : resultado(3, 0); // 1º: timeout numa imagem
    };

    await (worker as any).tick(); // StableStudy → processa, 1 imagem falha
    expect(processarEstudo).toHaveBeenCalledTimes(1);
    expect(store.getSignature('S1')).toMatchObject({
      nImg: 2,
      nImgTentadas: 3,
      nImgFalhadas: 1,
      tentativasFalha: 1,
    });

    await (worker as any).tick(); // backoff (2 min) não venceu → segura
    expect(processarEstudo).toHaveBeenCalledTimes(1);

    backdate(store, 'S1', 10); // simula o backoff vencido
    await (worker as any).tick(); // retenta e agora dá certo
    expect(processarEstudo).toHaveBeenCalledTimes(2);
    expect(store.getSignature('S1')).toMatchObject({ nImg: 3, nImgTentadas: 3 });
    expect(store.getSignature('S1').nImgFalhadas).toBeUndefined();

    await (worker as any).tick(); // sem pendência → nada a fazer
    expect(processarEstudo).toHaveBeenCalledTimes(2);
  });

  it('falha persistente para no teto (não reprocessa pra sempre — Achado 9)', async () => {
    const estado = { nInstances: 3, emitStable: true };
    const worker = makeRetryWorker('retry-teto', estado);
    const store = (worker as any).store;
    processarEstudoImpl = async () => resultado(2, 1); // falha SEMPRE (instance corrompida)

    await (worker as any).tick(); // tentativa 1 (StableStudy)
    backdate(store, 'S1', 10);
    await (worker as any).tick(); // retentativa → tentativa 2
    backdate(store, 'S1', 10);
    await (worker as any).tick(); // retentativa → tentativa 3 = teto
    expect(processarEstudo).toHaveBeenCalledTimes(3);
    expect(store.getSignature('S1').tentativasFalha).toBe(3);

    backdate(store, 'S1', 10);
    await (worker as any).tick(); // teto atingido → desiste
    expect(processarEstudo).toHaveBeenCalledTimes(3);
  });

  it('instance nova zera o contador — abre geração nova de retries', async () => {
    const estado = { nInstances: 3, emitStable: true };
    const worker = makeRetryWorker('retry-geracao', estado);
    const store = (worker as any).store;
    processarEstudoImpl = async () => resultado(estado.nInstances - 1, 1); // sempre falha 1

    await (worker as any).tick(); // tentativa 1
    backdate(store, 'S1', 10);
    await (worker as any).tick(); // retentativa → tentativa 2
    expect(store.getSignature('S1').tentativasFalha).toBe(2);

    // Chega instance nova → novo StableStudy. O contador tem que ZERAR
    // (senão o estudo herda tentativas da geração anterior e perde retries).
    estado.nInstances = 4;
    estado.emitStable = true;
    backdate(store, 'S1', 10);
    await (worker as any).tick();
    expect(processarEstudo).toHaveBeenCalledTimes(3);
    expect(store.getSignature('S1')).toMatchObject({ nImgTentadas: 4, tentativasFalha: 1 });
  });

  it('estudo apagado no Orthanc consome tentativa e sai da fila no teto', async () => {
    const estado = { nInstances: 3, emitStable: true };
    const worker = makeRetryWorker('retry-apagado', estado);
    const store = (worker as any).store;
    processarEstudoImpl = async () => resultado(2, 1);

    await (worker as any).tick(); // tentativa 1 (falha 1 imagem)
    estado.nInstances = -1; // estudo some do Orthanc (getStudySeries lança)

    backdate(store, 'S1', 10);
    await (worker as any).tick(); // consulta falha → consome tentativa 2
    expect(store.getSignature('S1').tentativasFalha).toBe(2);
    backdate(store, 'S1', 10);
    await (worker as any).tick(); // consome tentativa 3 = teto
    expect(store.getSignature('S1').tentativasFalha).toBe(3);

    backdate(store, 'S1', 10);
    await (worker as any).tick(); // teto → não volta mais pra fila
    expect(store.getSignature('S1').tentativasFalha).toBe(3);
    expect(processarEstudo).toHaveBeenCalledTimes(1); // só o processamento original
  });

  it('ticks sobrepostos: o atrasado é pulado (não processa o mesmo estudo 2×)', async () => {
    const estado = { nInstances: 3, emitStable: true };
    const worker = makeRetryWorker('retry-overlap', estado);
    let solta!: () => void;
    processarEstudoImpl = () =>
      new Promise((res) => {
        solta = () => res(resultado(3, 0));
      });

    const t1 = (worker as any).tick();
    const t2 = (worker as any).tick(); // dispara enquanto t1 roda → pulado
    await vi.waitFor(() => expect(processarEstudo).toHaveBeenCalled());
    solta();
    await Promise.all([t1, t2]);
    expect(processarEstudo).toHaveBeenCalledTimes(1);
  });
});
