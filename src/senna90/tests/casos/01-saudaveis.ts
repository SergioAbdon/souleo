// ══════════════════════════════════════════════════════════════════
// CASOS DE TESTE — Pacientes Saudáveis
// ══════════════════════════════════════════════════════════════════

import type { CasoTeste } from '../runner';
import { pacienteSaudavelM, pacienteSaudavelF } from '../helpers';

export const casosSaudaveis: CasoTeste[] = [
  {
    id: 'S01',
    descricao: 'Paciente saudável M, 70kg/1.75m, 46 anos',
    inputs: pacienteSaudavelM(),
    esperado: {
      derivados: {
        imc: 22.8,
        asc: 1.84,            // truncado (não arredondado): 1.847 → 1.84
        feT: 0.6539,
        idade: 46,
        estenMitGrau: '',
        estenAoGrau: '',
      },
      achados: [
        'Ritmo cardíaco regular.',
        'Câmaras cardíacas com dimensões normais.',
        'Massa do ventrículo esquerdo preservada.',
        'Função sistólica do ventrículo esquerdo preservada e sem alteração contrátil segmentar.',
        'Função sistólica do ventrículo direito preservada.',
        'Pericárdio sem alterações.',
        'Raiz aórtica, aorta ascendente e arco aórtico com dimensões normais.',
      ],
      conclusoes: [
        'Exame ecodopplercardiográfico transtorácico sem alterações significativas.',
      ],
      numConclusoes: { igual: 1 },
    },
  },
  {
    id: 'S02',
    descricao: 'Paciente saudável F, 60kg/1.62m, 40 anos',
    inputs: pacienteSaudavelF(),
    esperado: {
      derivados: {
        estenMitGrau: '',
        estenAoGrau: '',
      },
      achados: [
        'Ritmo cardíaco regular.',
        'Câmaras cardíacas com dimensões normais.',
      ],
      conclusoes: [
        'Exame ecodopplercardiográfico transtorácico sem alterações significativas.',
      ],
    },
  },
  {
    id: 'S03',
    descricao: 'Sexo vazio (motor deve silenciar inferências)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.gerais.sexo = '';
      return m;
    })(),
    esperado: {
      // Sem sexo, várias frases que dependem dele ficam vazias.
      // Mas IMC e ASC ainda são calculados.
      derivados: {
        imc: 22.8,
        asc: 1.84,    // truncado
      },
      // Conclusão fallback ainda aparece (lista vazia)
      conclusoes: [
        'Exame ecodopplercardiográfico transtorácico sem alterações significativas.',
      ],
    },
  },
];
