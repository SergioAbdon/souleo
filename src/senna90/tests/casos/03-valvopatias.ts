// ══════════════════════════════════════════════════════════════════
// CASOS DE TESTE — Valvopatias (estenoses + insuficiências)
// ══════════════════════════════════════════════════════════════════

import type { CasoTeste } from '../runner';
import { pacienteSaudavelM } from '../helpers';

export const casosValvopatias: CasoTeste[] = [
  {
    id: 'V01',
    descricao: 'Estenose mitral importante (grad médio 12 mmHg)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.estenoses.gradMedMitral = 12;
      m.estenoses.areaMitral = 0.9;
      m.valvas.morfMitral = 'EFI'; // espessada e fibrocalcificada importante
      return m;
    })(),
    esperado: {
      derivados: { estenMitGrau: 'importante' },
      achados: [
        'Válvula mitral espessada e fibrocalcificada em grau importante',
        'Gradiente transvalvar mitral médio de 12 mmHg.',
        'Área mitral estimada em 0.9 cm² (PHT).',
      ],
      conclusoes: [
        'Estenose Mitral Importante.',
      ],
    },
  },
  {
    id: 'V02',
    descricao: 'Estenose aórtica moderada (gradMax 50 mmHg)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.estenoses.gradMaxAo = 50;
      m.estenoses.gradMedAo = 30;
      m.estenoses.areaAo = 1.2;
      m.valvas.morfAortica = 'EFM';
      return m;
    })(),
    esperado: {
      derivados: { estenAoGrau: 'moderada' },
      achados: [
        'Gradiente transvalvar aórtico máximo de 50 mmHg.',
      ],
      conclusoes: [
        'Estenose Aórtica Moderada.',
      ],
    },
  },
  {
    id: 'V03',
    descricao: 'Estenose pulmonar moderada — ASE 2017 (gradMax 45 mmHg = moderada)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.estenoses.gradMaxPulm = 45;
      return m;
    })(),
    esperado: {
      derivados: { estenPulmGrau: 'moderada' }, // 36-64 = moderada (ASE 2017)
      achados: [
        'Gradiente transvalvar pulmonar máximo de 45 mmHg.',
        'Estenose Pulmonar Moderada.',
      ],
      conclusoes: [
        'Estenose Pulmonar Moderada.',
      ],
    },
  },
  {
    id: 'V04',
    descricao: 'Estenose pulmonar leve (gradMax 30 — antes era leve só ≥25)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.estenoses.gradMaxPulm = 30;
      return m;
    })(),
    esperado: {
      derivados: { estenPulmGrau: 'leve' }, // <36 = leve (ASE 2017)
      conclusoes: [
        'Estenose Pulmonar Leve.',
      ],
    },
  },
  {
    id: 'V05',
    descricao: 'Insuficiência mitral moderada + tricúspide leve',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.valvas.refluxoMitral = 'M';
      m.valvas.refluxoTricuspide = 'L';
      return m;
    })(),
    esperado: {
      achados: [
        'Insuficiência Mitral moderada.',
        'Insuficiência Tricúspide leve.',
      ],
      conclusoes: [
        'Insuficiência Mitral moderada.',
        'Insuficiência Tricúspide leve.',
      ],
    },
  },
  {
    id: 'V06',
    descricao: 'Esclerose aórtica (gradMax 20 — não emite conclusão)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.estenoses.gradMaxAo = 20;
      return m;
    })(),
    esperado: {
      derivados: { estenAoGrau: 'esclerose' },
      achados: [
        'Gradiente transvalvar aórtico máximo de 20 mmHg.',
      ],
      // Esclerose NÃO emite conclusão (decisão preservada)
      conclusoesNaoPresentes: ['Estenose Aórtica'],
    },
  },
  {
    id: 'V07',
    descricao: 'Estenose tricúspide moderada (sem grau leve no motor)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.estenoses.gradMedTric = 5;
      m.estenoses.areaTric = 1.2;
      return m;
    })(),
    esperado: {
      derivados: { estenTricGrau: 'moderada' },
      conclusoes: [
        'Estenose Tricúspide Moderada.',
      ],
    },
  },
];
