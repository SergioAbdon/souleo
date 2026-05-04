// ══════════════════════════════════════════════════════════════════
// CASOS DE TESTE — Strain (GLS, LARS) + Hipertensão Pulmonar
// ══════════════════════════════════════════════════════════════════

import type { CasoTeste } from '../runner';
import { pacienteSaudavelM } from '../helpers';

export const casosStrainHP: CasoTeste[] = [
  {
    id: 'ST01',
    descricao: 'GLS VE preservado (-22%) — texto VR atualizado pra -20%',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.sistolica.glsVE = -22;
      return m;
    })(),
    esperado: {
      achados: [
        'Strain global longitudinal do ventrículo esquerdo pelo speckle tracking de -22% (VR ≥ -20%).',
      ],
      conclusoes: [
        'Função sistólica global do ventrículo esquerdo preservada, confirmada pelo strain longitudinal',
      ],
    },
  },
  {
    id: 'ST02',
    descricao: 'GLS VE reduzido (-15%) — sugestivo de disfunção subclínica',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.sistolica.glsVE = -15;
      return m;
    })(),
    esperado: {
      achados: [
        'Strain global longitudinal do ventrículo esquerdo reduzido pelo speckle tracking de -15% (VR ≥ -20%).',
      ],
      conclusoes: [
        'Função sistólica preservada com strain longitudinal reduzido',
        'sugestivo de disfunção subclínica',
      ],
    },
  },
  {
    id: 'ST03',
    descricao: 'GLS VE -19% — agora reduzido (cutoff -20%)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.sistolica.glsVE = -19;
      return m;
    })(),
    esperado: {
      // Com cutoff -20%, -19% agora é REDUZIDO (no motor antigo era preservado)
      achados: [
        'Strain global longitudinal do ventrículo esquerdo reduzido',
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
