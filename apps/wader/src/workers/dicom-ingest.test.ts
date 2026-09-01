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
    FieldValue: { serverTimestamp: () => '__ts__', delete: () => '__delete__' },
    getDb: () => ({
      collection: () => ({
        doc: () => ({
          collection: () => ({
            where: (_field: string, _op: string, val: string) => {
              const fetch = async () => {
                const data = exameStore[val];
                if (!data) return { empty: true, docs: [] };
                const ref = makeRef(data);
                return { empty: false, docs: [{ ref, id: data.__id, data: () => data }] };
              };
              return {
                limit: () => ({ get: fetch }),
                get: fetch,
              };
            },
            doc: (forma: string) => {
              const data = exameStore[forma];
              return {
                id: forma,
                get: async () => (data ? { exists: true, ref: makeRef(data), data: () => data } : { exists: false }),
                update: async (obj: Record<string, unknown>) => {
                  updates.push({ id: forma, obj });
                  if (data) Object.assign(data, obj);
                },
              };
            },
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
  PARSER_VERSAO: 'sr-2026-08-21',
}));

import { processarEstudo, estudosEmExclusao, CAMPOS_DICOM_LIMPAR } from './dicom-ingest';
import { extrairMedidasDoEstudo } from '../adapters/dicom-sr-parser';

// ── Fake OrthancClient configurável ────────────────────────────────────
function makeClient(opts?: {
  accStudyLevel?: string;
  series?: Array<{
    Modality: string;
    Instances: string[];
    /** SeriesNumber DICOM (item 3) — omitido = sem metadado de ordem. */
    SeriesNumber?: string;
    /** InstanceNumber por instance id (item 3) — omitido = sem metadado. */
    instanceNumbers?: Record<string, string>;
    /** IndexInSeries por instance id (desempate, tríade 31/08). */
    indexInSeries?: Record<string, number>;
  }>;
  previewDelays?: Record<string, number>;
  previewFails?: Set<string>;
  patientId?: string;
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
      PatientMainDicomTags: opts?.patientId ? { PatientID: opts.patientId } : {},
    }),
    getStudySeries: async () =>
      series.map((s, idx) => ({
        ID: `serie-${idx}`,
        MainDicomTags: { Modality: s.Modality, SeriesNumber: s.SeriesNumber },
        Instances: s.Instances,
      })),
    // Expand da série (item 3): devolve na MESMA ordem do array Instances —
    // é o sort do ingest que tem que arrumar pela InstanceNumber.
    getSeriesInstances: async (seriesId: string) => {
      const s = series[Number(seriesId.replace('serie-', ''))];
      if (!s) throw new Error(`série desconhecida: ${seriesId}`);
      return s.Instances.map((id) => ({
        ID: id,
        IndexInSeries: s.indexInSeries?.[id],
        MainDicomTags: { InstanceNumber: s.instanceNumbers?.[id] },
      }));
    },
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

  it('Trava 2 + cofre: emitido nunca é tocado nos campos ao vivo (status/medidasDicom)', async () => {
    exameStore['EX123'] = { __id: 'doc5', status: 'emitido', medidasDicom: { x: 1 } };
    await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS });
    expect(updates[0].obj.status).toBeUndefined();
    expect(updates[0].obj.medidasDicom).toBeUndefined();
    expect(exameStore['EX123'].status).toBe('emitido'); // nunca regrediu/mudou
  });

  it('Trava 2: rascunho continua rascunho', async () => {
    exameStore['EX123'] = { __id: 'doc6', status: 'rascunho' };
    await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS });
    expect(updates[0].obj.status).toBe('rascunho');
  });

  it('ordem de AQUISIÇÃO (item 3): séries por SeriesNumber, instances por InstanceNumber — mesmo com o Orthanc devolvendo embaralhado', async () => {
    exameStore['EX123'] = { __id: 'docOrd', status: 'aguardando' };
    // Orthanc devolve a série 2 ANTES da 1, e as instances fora de ordem —
    // exatamente o cenário real que embaralhava a galeria.
    const client = makeClient({
      series: [
        { Modality: 'US', SeriesNumber: '2', Instances: ['b2', 'b1'], instanceNumbers: { b1: '1', b2: '2' } },
        { Modality: 'US', SeriesNumber: '1', Instances: ['a3', 'a1', 'a2'], instanceNumbers: { a1: '1', a2: '2', a3: '3' } },
        { Modality: 'SR', Instances: ['sr1'] },
      ],
    });
    await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    const detalhes = updates[1].obj.imagensDicomDetalhes as Array<{ orthancInstanceId: string; serie?: number; instancia?: number }>;
    expect(detalhes.map((d) => d.orthancInstanceId)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);
    expect(detalhes[0]).toMatchObject({ serie: 1, instancia: 1 });
    // imagensDicom (as URLs) segue a mesma ordem dos detalhes
    expect(updates[1].obj.imagensDicom).toEqual(['url_1', 'url_2', 'url_3', 'url_4', 'url_5']);
  });

  it('imagem TARDIA entra no lugar certo, não no fim (re-sort pós-merge, item 3)', async () => {
    // Exame já tem a1 (instancia 1) e a3 (instancia 3); chega a2 no reprocesso.
    exameStore['EX123'] = {
      __id: 'docMerge', status: 'andamento', medidasDicom: { x: 1 },
      imagensDicomDetalhes: [
        { url: 'u_a1', path: 'p_a1', orthancInstanceId: 'a1', serie: 1, instancia: 1 },
        { url: 'u_a3', path: 'p_a3', orthancInstanceId: 'a3', serie: 1, instancia: 3 },
      ],
    };
    const client = makeClient({
      series: [{ Modality: 'US', SeriesNumber: '1', Instances: ['a2'], instanceNumbers: { a2: '2' } }],
    });
    await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    const detalhes = updates[1].obj.imagensDicomDetalhes as Array<{ orthancInstanceId: string }>;
    expect(detalhes.map((d) => d.orthancInstanceId)).toEqual(['a1', 'a2', 'a3']);
  });

  it('InstanceNumber EMPATADO desempata por IndexInSeries (Codex, tríade 31/08)', async () => {
    exameStore['EX123'] = { __id: 'docTie', status: 'aguardando' };
    const client = makeClient({
      series: [{
        Modality: 'US', SeriesNumber: '1',
        Instances: ['t1', 't2'], // ordem interna do Orthanc: t1 primeiro
        instanceNumbers: { t1: '5', t2: '5' }, // empate
        indexInSeries: { t1: 2, t2: 1 }, // ...mas t2 foi adquirida antes
      }],
    });
    await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    const detalhes = updates[1].obj.imagensDicomDetalhes as Array<{ orthancInstanceId: string }>;
    expect(detalhes.map((d) => d.orthancInstanceId)).toEqual(['t2', 't1']);
  });

  it('tag vazia ("") é AUSENTE, não zero: série sem SeriesNumber vai pro FIM (Codex, tríade 31/08)', async () => {
    exameStore['EX123'] = { __id: 'docVazio', status: 'aguardando' };
    const client = makeClient({
      series: [
        { Modality: 'US', SeriesNumber: '', Instances: ['z1'], instanceNumbers: { z1: '1' } },
        { Modality: 'US', SeriesNumber: '1', Instances: ['a1'], instanceNumbers: { a1: '1' } },
      ],
    });
    await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    const detalhes = updates[1].obj.imagensDicomDetalhes as Array<{ orthancInstanceId: string; serie?: number }>;
    expect(detalhes.map((d) => d.orthancInstanceId)).toEqual(['a1', 'z1']);
    expect(detalhes[1].serie).toBeUndefined(); // '' NÃO virou 0
  });

  it('expand da série falhando: NÃO derruba a etapa 2 — usa a ordem interna (fallback)', async () => {
    exameStore['EX123'] = { __id: 'docFb', status: 'aguardando' };
    const client = makeClient({ series: [{ Modality: 'US', Instances: ['i1', 'i2'] }] });
    client.getSeriesInstances = async () => { throw new Error('expand boom'); };
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    expect(r.imagensProcessadas).toBe(2);
    expect(updates[1].obj.imagensDicom).toEqual(['url_1', 'url_2']);
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
    expect(updates).toHaveLength(2); // etapa1 + write de dicomUltimoErro
    expect(r.errors.some((e) => e.includes('falharam'))).toBe(true);
  });

  it('soMedidas grava etapa 1 e NÃO baixa imagens', async () => {
    exameStore['EX123'] = { __id: 'docSoMedidas', status: 'aguardando' };
    const r = await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS, soMedidas: true });

    expect(r.matched).toBe(true);
    expect(r.medidasExtraidas).toBe(2);
    expect(r.imagensProcessadas).toBe(0);
    expect(updates).toHaveLength(1); // só etapa1 — retorna ANTES de baixar imagens
    expect(updates[0].obj.medidasDicom).toEqual({ a: 1, b: 2 });
  });

  it('falha total de imagens grava dicomUltimoErro/dicomUltimoErroEm no exame', async () => {
    exameStore['EX123'] = { __id: 'docErro', status: 'aguardando' };
    const client = makeClient({
      series: [{ Modality: 'US', Instances: ['i1', 'i2'] }],
      previewFails: new Set(['i1', 'i2']),
    });
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });

    expect(r.matched).toBe(true);
    const erroUpdate = updates[updates.length - 1].obj;
    expect(erroUpdate.dicomUltimoErro).toBe('Falha ao subir 2 imagens');
    expect(erroUpdate.dicomUltimoErroEm).toBe('__ts__');
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

  it('VÍNCULO MANUAL (override): estudo com ACC vazio entra no exame escolhido', async () => {
    exameStore['alvo-1'] = { __id: 'alvo-1', status: 'aguardando' };
    // ACC vazio em tudo (nível-estudo e séries) — sem override seria órfão.
    const client = makeClient({ accStudyLevel: '' });
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS, exameIdOverride: 'alvo-1' });
    expect(r.matched).toBe(true);
    expect(r.exameIdNoLeo).toBe('alvo-1');
    expect(r.imagensProcessadas).toBe(3);
    expect(updates).toHaveLength(2); // etapa1 (medidas/status) + etapa2 (imagens)
    expect(updates[0].obj.status).toBe('andamento');
    expect(updates[1].obj.imagensDicom).toEqual(['url_1', 'url_2', 'url_3']);
  });

  it('VÍNCULO MANUAL (override): exame inexistente → matched=false, nenhum write', async () => {
    const client = makeClient({ accStudyLevel: '' });
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS, exameIdOverride: 'nao-existe' });
    expect(r.matched).toBe(false);
    expect(updates).toHaveLength(0);
    expect(r.errors.some((e) => e.includes('não existe'))).toBe(true);
  });

  it('bloqueia match automático quando CPF do DICOM diverge do CPF do exame', async () => {
    exameStore['EX123'] = { __id: 'docCpf1', status: 'aguardando', cpf: '99988877766' };
    const client = makeClient({ patientId: '11122233344' });
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    expect(r.matched).toBe(false);
    expect(r.motivoBloqueio).toBe('cpf-divergente');
    expect(updates).toHaveLength(0);
  });

  it('segue o match quando um dos CPFs está vazio', async () => {
    exameStore['EX123'] = { __id: 'docCpf2', status: 'aguardando', cpf: '' };
    const client = makeClient({ patientId: '11122233344' });
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    expect(r.matched).toBe(true);
    expect(r.motivoBloqueio).toBeUndefined();
  });

  it('vínculo persistido vence o ACC: exame com dicomOrthancStudyId==S1 é o alvo mesmo com ACC apontando outro', async () => {
    exameStore['EX123'] = { __id: 'E1', status: 'aguardando' }; // casaria pelo ACC se chegasse a olhar
    exameStore['S1'] = { __id: 'E2', status: 'aguardando', dicomOrthancStudyId: 'S1' }; // vínculo persistido
    const r = await processarEstudo({ client: makeClient(), orthancStudyId: 'S1', wsId: WS });
    expect(r.matched).toBe(true);
    expect(r.exameIdNoLeo).toBe('E2');
  });

  it('override limpa o dono anterior (campos DICOM removidos do exame que tinha o estudo)', async () => {
    exameStore['S1'] = {
      __id: 'E1',
      status: 'andamento',
      dicomOrthancStudyId: 'S1',
      medidasDicom: { a: 1 },
    };
    exameStore['E2'] = { __id: 'E2', status: 'aguardando' };
    const r = await processarEstudo({ client: makeClient(), orthancStudyId: 'S1', wsId: WS, exameIdOverride: 'E2' });
    expect(r.matched).toBe(true);
    expect(r.exameIdNoLeo).toBe('E2');
    const limpezaE1 = updates.find((u) => u.id === 'E1');
    expect(limpezaE1).toBeDefined();
    for (const campo of CAMPOS_DICOM_LIMPAR) {
      expect(limpezaE1!.obj[campo]).toBe('__delete__');
    }
  });

  // S4-T15 fix (W5): espelha a recusa do excluirReenvio — dono EMITIDO é
  // documento que já circulou; limpar suas imagens deixaria o PDF assinado
  // apontando pro nada.
  it('override NÃO limpa dono EMITIDO (preserva; use corrigir-laudo)', async () => {
    exameStore['S1'] = {
      __id: 'E1',
      status: 'emitido',
      dicomOrthancStudyId: 'S1',
      medidasDicom: { a: 1 },
    };
    exameStore['E2'] = { __id: 'E2', status: 'aguardando' };
    const r = await processarEstudo({ client: makeClient(), orthancStudyId: 'S1', wsId: WS, exameIdOverride: 'E2' });

    expect(r.matched).toBe(true);
    expect(r.exameIdNoLeo).toBe('E2');
    expect(updates.find((u) => u.id === 'E1')).toBeUndefined(); // intocado
    expect(exameStore['S1'].medidasDicom).toEqual({ a: 1 });
  });

  it('estudo em estudosEmExclusao não grava nada', async () => {
    exameStore['EX123'] = { __id: 'docExcl', status: 'aguardando' };
    estudosEmExclusao.add('s1');
    const r = await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS });
    expect(r.errors[0]).toMatch(/exclus/i);
    expect(updates).toHaveLength(0);
    estudosEmExclusao.delete('s1');
  });

  it('exame emitido: estudo novo vai para campos-sombra, nada sobrescrito (cofre do emitido, D4)', async () => {
    exameStore['EX123'] = { __id: 'docEmit', status: 'emitido', medidasDicom: { x: 1 } };
    const r = await processarEstudo({ client: makeClient(), orthancStudyId: 's1', wsId: WS });

    expect(r.matched).toBe(true);
    const etapa1 = updates[0].obj;
    expect(etapa1.medidasDicomPendente).toEqual({ a: 1, b: 2 }); // srMock do beforeEach
    expect(etapa1.medidasDicomMetaPendente).toBeDefined();
    expect(etapa1.dicomAtualizacaoPendente).toBe(true);
    expect(etapa1.medidasDicom).toBeUndefined();
    expect(etapa1.medidasDicomMeta).toBeUndefined();
    expect(etapa1.dicomMeta).toBeUndefined();
    expect(etapa1.dicomStudyUid).toBeUndefined();
    expect(etapa1.status).toBeUndefined();
    // S4-T15 fix (W4): `dicomOrthancStudyId` também é campo AO VIVO — é o
    // ponteiro que a conferência usa pra achar o dono. Reescrevê-lo no emitido
    // re-aponta um laudo publicado pra um estudo que o médico nunca revisou.
    expect(etapa1.dicomOrthancStudyId).toBeUndefined();

    const etapa2 = updates[1].obj;
    expect(etapa2.imagensDicom).toBeUndefined();
    expect(etapa2.imagensDicomDetalhes).toBeUndefined();
    expect(etapa2.imagensDicomPendente).toBeDefined();
    expect((etapa2.imagensDicomPendente as unknown[]).length).toBe(3);
  });

  it('etapa 2 mescla imagens por orthancInstanceId (reprocesso parcial não encolhe a galeria)', async () => {
    exameStore['EX123'] = {
      __id: 'docMerge',
      status: 'andamento',
      medidasDicom: { x: 1 },
      imagensDicomDetalhes: [
        { url: 'url_i1', path: 'p_i1', orthancInstanceId: 'i1' },
        { url: 'url_i2', path: 'p_i2', orthancInstanceId: 'i2' },
        { url: 'url_i3', path: 'p_i3', orthancInstanceId: 'i3' },
      ],
    };
    const client = makeClient({
      series: [{ Modality: 'US', Instances: ['i1', 'i2', 'i3'] }],
      previewFails: new Set(['i2']), // reprocesso: i2 falha desta vez, i1/i3 sobem de novo
    });
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });

    expect(r.matched).toBe(true);
    const detalhes = updates[1].obj.imagensDicomDetalhes as Array<{ orthancInstanceId: string }>;
    expect(detalhes).toHaveLength(3); // união: i1/i3 reprocessados + i2 preservado do estado anterior
    expect(detalhes.map((d) => d.orthancInstanceId).sort()).toEqual(['i1', 'i2', 'i3']);
  });

  it('CPF guard (refinamento): PatientID = feegowPacienteId (sem CPF no DICOM) não bloqueia mesmo com exame já tendo CPF', async () => {
    exameStore['EX123'] = {
      __id: 'docFeegow',
      status: 'aguardando',
      cpf: '11122233344',
      feegowPacienteId: '84521',
    };
    const client = makeClient({ patientId: '84521' }); // PatientID = prontuário Feegow (hierarquia do wl-writer)
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    expect(r.matched).toBe(true);
    expect(r.motivoBloqueio).toBeUndefined();
  });

  it('CPF guard (3ª cláusula): PatientID de 11 dígitos = feegowPacienteId (diverge do CPF) não bloqueia', async () => {
    exameStore['EX123'] = {
      __id: 'docFeegow2',
      status: 'aguardando',
      cpf: '99988877766',
      feegowPacienteId: '11122233344',
    };
    const client = makeClient({ patientId: '11122233344' }); // PatientID = prontuário Feegow (11 dígitos, diverge do CPF)
    const r = await processarEstudo({ client, orthancStudyId: 's1', wsId: WS });
    expect(r.matched).toBe(true);
    expect(r.motivoBloqueio).toBeUndefined();
  });
});
