import { describe, it, expect, vi, beforeEach } from 'vitest';

// Espiona log.warn sem perder o resto do módulo (createLogger é chamado no
// module-scope de dicom-sr-parser.ts, então o spy precisa existir antes do
// import via vi.hoisted).
const logSpies = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('../logger', () => ({ createLogger: () => logSpies }));

import {
  extrairMedidasDoEstudo,
  detectarGrupo,
  PARSER_VERSAO,
  CODIGOS_CONHECIDOS,
} from './dicom-sr-parser';

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Helpers de fixture (formato simplified-tags do Orthanc) ──────────────
function conceptNode(codeValue: string, codeMeaning: string) {
  return { ConceptNameCodeSequence: [{ CodeValue: codeValue, CodeMeaning: codeMeaning }] };
}

function numericItem(codeValue: string, codeMeaning: string, numericValue: string, unit = 'cm') {
  return {
    ...conceptNode(codeValue, codeMeaning),
    MeasuredValueSequence: [
      { NumericValue: numericValue, MeasurementUnitsCodeSequence: [{ CodeValue: unit }] },
    ],
  };
}

function measurementGroup(siblings: unknown[]) {
  return {
    ...conceptNode('MG', 'Measurement Group'),
    ContentSequence: siblings,
  };
}

function makeClient(contentSequence: unknown[]) {
  return {
    getStudySeries: async () => [
      { MainDicomTags: { Modality: 'SR' }, Instances: ['sr1'] },
    ],
    getInstanceSimplifiedTags: async () => ({ ContentSequence: contentSequence }),
  } as any;
}

describe('detectarGrupo — desempate honesto', () => {
  it('empate de votos vira general (nunca chuta estrutura)', () => {
    const siblings = [
      conceptNode('a', 'Left Ventricle Internal End Diastolic Dimension'),
      conceptNode('b', 'Left Ventricle Ejection Fraction'),
      conceptNode('c', 'Aortic Root Diameter'),
      conceptNode('d', 'Aortic Valve Area'),
    ];
    expect(detectarGrupo(siblings)).toBe('general');
  });

  it('vitória clara continua funcionando', () => {
    const siblings = [
      conceptNode('a', 'Aortic Root Diameter'),
      conceptNode('b', 'Aortic Valve Area'),
      conceptNode('c', 'Aortic Annulus Diameter'),
      conceptNode('d', 'Left Ventricle Ejection Fraction'),
    ];
    expect(detectarGrupo(siblings)).toBe('AO');
  });
});

describe('extrairMedidasDoEstudo — repasse total', () => {
  it('parserVersao acompanha o resultado', async () => {
    const client = makeClient([
      measurementGroup([
        conceptNode('a', 'Aortic Root Diameter'),
        numericItem('18015-8', 'Aortic Root Diameter', '3.4'),
      ]),
    ]);
    const result = await extrairMedidasDoEstudo({ client, orthancStudyId: 'st1' });
    expect(result.parserVersao).toBe(PARSER_VERSAO);
  });

  it('warn quando código conhecido cai em general_*', async () => {
    // Código conhecido fora de qualquer Measurement Group → cai em 'general'.
    const codigoConhecido = CODIGOS_CONHECIDOS[0];
    const client = makeClient([
      numericItem(codigoConhecido, 'Something Unexpected', '9.9'),
    ]);
    await extrairMedidasDoEstudo({ client, orthancStudyId: 'st1' });
    expect(logSpies.warn).toHaveBeenCalled();
    const [meta] = logSpies.warn.mock.calls.find(([, msg]) => typeof msg === 'string' && msg.includes('CONHECIDA')) ?? [];
    expect(meta).toMatchObject({ key: `general_${codigoConhecido}` });
  });

  it('nenhum item numérico é descartado: código sem grupo vem como general_{code}', async () => {
    const client = makeClient([
      numericItem('CODIGO-DESCONHECIDO-XYZ', 'Something Never Seen Before', '1.23'),
    ]);
    const result = await extrairMedidasDoEstudo({ client, orthancStudyId: 'st1' });
    expect(result.medidas['general_CODIGO-DESCONHECIDO-XYZ']).toBeDefined();
    expect(result.medidas['general_CODIGO-DESCONHECIDO-XYZ'].value).toBe(1.23);
    // Código desconhecido cair em general NÃO deve disparar o alarme.
    expect(logSpies.warn).not.toHaveBeenCalled();
  });
});
