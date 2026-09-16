// ══════════════════════════════════════════════════════════════════
// CASOS DE TESTE — Strain (GLS, LARS) + Hipertensão Pulmonar
// ══════════════════════════════════════════════════════════════════

import type { CasoTeste } from '../runner';
import { pacienteSaudavelM } from '../helpers';

export const casosStrainHP: CasoTeste[] = [
  {
    id: 'ST01',
    descricao: 'GLS VE normal (-22%) — faixa normal ASE/EACVI 2025 (|GLS| ≥ 18)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.sistolica.glsVE = -22;
      return m;
    })(),
    esperado: {
      achados: [
        'Strain global longitudinal do ventrículo esquerdo pelo speckle tracking de -22% (VR ≤ -18%).',
      ],
      conclusoes: [
        'Função sistólica global do ventrículo esquerdo preservada, confirmada pelo strain longitudinal',
      ],
    },
  },
  {
    id: 'ST02',
    descricao: 'GLS VE reduzido (-15%, |GLS| < 16) — sugestivo de disfunção subclínica',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.sistolica.glsVE = -15;
      return m;
    })(),
    esperado: {
      achados: [
        'Strain global longitudinal do ventrículo esquerdo reduzido pelo speckle tracking de -15% (VR ≤ -18%).',
      ],
      conclusoes: [
        'Função sistólica preservada com strain longitudinal reduzido',
        'sugestivo de disfunção subclínica',
      ],
    },
  },
  {
    id: 'ST03',
    descricao: 'GLS VE -19% — NORMAL nas duas pontas (fim da contradição B1)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.sistolica.glsVE = -19;
      return m;
    })(),
    esperado: {
      // ASE/EACVI 2025: |−19| ≥ 18 = normal. Achado e conclusão saem da MESMA
      // faixa (faixaGLSve) — antes o achado dizia "reduzido" (corte |20|) e a
      // conclusão dizia "preservada" (corte |18|) no mesmo laudo.
      achados: [
        'Strain global longitudinal do ventrículo esquerdo pelo speckle tracking de -19% (VR ≤ -18%).',
      ],
      achadosNaoPresentes: ['ventrículo esquerdo reduzido'],
      conclusoes: [
        'Função sistólica global do ventrículo esquerdo preservada, confirmada pelo strain longitudinal',
      ],
    },
  },
  {
    id: 'ST03B',
    descricao: 'GLS VE -17% — faixa limítrofe nova (16 a 18) nas duas pontas',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.sistolica.glsVE = -17;
      return m;
    })(),
    esperado: {
      achados: [
        'Strain global longitudinal do ventrículo esquerdo no limite inferior da normalidade (faixa -18 a -16%) pelo speckle tracking de -17%.',
      ],
      conclusoes: [
        'Função sistólica global do ventrículo esquerdo preservada, com strain longitudinal no limite inferior da normalidade (-17%).',
      ],
    },
  },
  {
    id: 'ST04',
    descricao: 'LARS reduzido (15%) — pressão enchimento elevada',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.diastolica.laStrain = 15;
      return m;
    })(),
    esperado: {
      achados: [
        'Strain longitudinal do átrio esquerdo (reservoir) reduzido de 15% (VR ≥ 18%).',
      ],
      conclusoes: [
        'Strain atrial esquerdo reduzido',
      ],
    },
  },
  {
    id: 'HP01',
    descricao: 'HP alta probabilidade (Vel IT > 3.4 m/s)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.diastolica.velocidadeIT = 3.6;
      m.diastolica.psap = 55;
      return m;
    })(),
    esperado: {
      achados: [
        'Pressão sistólica da artéria pulmonar de 55 mmHg. VR < 36 mmHg.',
        'Alta Probabilidade de Hipertensão Pulmonar.',
      ],
      conclusoes: [
        'Alta Probabilidade de Hipertensão Pulmonar.',
      ],
    },
  },
  {
    id: 'HP02',
    descricao: 'HP intermediária (Vel IT 3.0, sem sinais)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.diastolica.velocidadeIT = 3.0;
      m.diastolica.sinaisHP = '';
      return m;
    })(),
    esperado: {
      achados: [
        'Probabilidade Intermediária de Hipertensão Pulmonar.',
      ],
    },
  },
  {
    id: 'HP03',
    descricao: 'HP intermediária (Vel IT 2.5, com sinais indiretos)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.diastolica.velocidadeIT = 2.5;
      m.diastolica.sinaisHP = 'S';
      return m;
    })(),
    esperado: {
      achados: [
        'Probabilidade Intermediária de Hipertensão Pulmonar.',
      ],
    },
  },
];
