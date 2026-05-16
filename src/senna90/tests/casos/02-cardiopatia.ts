// ══════════════════════════════════════════════════════════════════
// CASOS DE TESTE — Cardiopatia (dilatada, hipertrófica, restritiva)
// ══════════════════════════════════════════════════════════════════

import type { CasoTeste } from '../runner';
import { pacienteSaudavelM, medidasVazias } from '../helpers';

export const casosCardiopatia: CasoTeste[] = [
  {
    id: 'C01',
    descricao: 'Cardiopatia dilatada — VE moderado, FE 35% (Simpson)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.identificacao.pacienteDtnasc = '1960-01-01';
      m.gerais.peso = 80;
      m.camaras.ddve = 65;
      m.camaras.dsve = 50;
      m.camaras.septoIV = 11;
      m.camaras.paredePosterior = 11;
      m.camaras.ae = 45;
      m.sistolica.feSimpson = 35;
      return m;
    })(),
    esperado: {
      achados: [
        'Ventrículo esquerdo aumentado em grau moderado.',
        'Disfunção sistólica do ventrículo esquerdo em grau moderado',
        'Hipertrofia excêntrica do ventrículo esquerdo.',
      ],
      conclusoes: [
        'Hipertrofia excêntrica do ventrículo esquerdo.',
        'Miocardiopatia Dilatada com Disfunção sistólica do ventrículo esquerdo.',
      ],
    },
  },
  {
    id: 'C02',
    descricao: 'Hipertrofia concêntrica — Septo+PP aumentados, ER>0.42',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.camaras.ddve = 48;
      m.camaras.septoIV = 14;
      m.camaras.paredePosterior = 14;
      m.camaras.dsve = 30;
      return m;
    })(),
    esperado: {
      achados: [
        'Massa do ventrículo esquerdo aumentada',
        'Hipertrofia concêntrica do ventrículo esquerdo.',
      ],
      conclusoes: [
        'Hipertrofia concêntrica do ventrículo esquerdo.',
      ],
    },
  },
  {
    id: 'C03',
    descricao: 'Remodelamento concêntrico — IMVE normal, ER>0.42',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.camaras.ddve = 42;
      m.camaras.septoIV = 11;
      m.camaras.paredePosterior = 11;
      return m;
    })(),
    esperado: {
      achados: [
        'remodelamento concêntrico',
      ],
      conclusoes: [
        'Remodelamento concêntrico do ventrículo esquerdo.',
      ],
    },
  },
  {
    id: 'C04',
    descricao: 'Disfunção VE importante (FE 25%) + dilatação',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.camaras.ddve = 70;
      m.camaras.dsve = 60;
      m.sistolica.feSimpson = 25;
      return m;
    })(),
    esperado: {
      achados: [
        'Ventrículo esquerdo aumentado em grau importante.',
        'Disfunção sistólica do ventrículo esquerdo em grau importante',
      ],
      conclusoes: [
        'Miocardiopatia Dilatada com Disfunção sistólica do ventrículo esquerdo.',
      ],
    },
  },
];
