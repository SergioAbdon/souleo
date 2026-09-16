// ══════════════════════════════════════════════════════════════════
// CASOS DE TESTE — Bordas (zeros, nulls, valores extremos)
// ══════════════════════════════════════════════════════════════════

import type { CasoTeste } from '../runner';
import { medidasVazias, pacienteSaudavelM } from '../helpers';

export const casosBordas: CasoTeste[] = [
  {
    id: 'B01',
    descricao: 'Tudo vazio (sem dados clínicos)',
    inputs: medidasVazias(),
    esperado: {
      derivados: {
        imc: null, asc: null, feT: null,
      },
      conclusoes: [
        'Exame ecodopplercardiográfico transtorácico sem alterações significativas.',
      ],
      // Sem sexo nem ritmo, mas ritmo vazio = "regular" (default)
      achados: ['Ritmo cardíaco regular.'],
    },
  },
  {
    id: 'B02',
    descricao: 'Apenas peso e altura (sem medidas cardíacas)',
    inputs: (() => {
      const m = medidasVazias();
      m.gerais.peso = 70;
      m.gerais.altura = 175;
      m.gerais.sexo = 'M';
      m.gerais.ritmo = 'S';
      return m;
    })(),
    esperado: {
      derivados: {
        imc: 22.8,
        asc: 1.84,    // truncado
      },
      // Câmaras todas vazias = consideradas normais
      achados: [
        'Câmaras cardíacas com dimensões normais.',
      ],
    },
  },
  {
    id: 'B03',
    descricao: 'Cutoffs exatos (DDVE = 58 M = leve a moderado)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.camaras.ddve = 58;
      return m;
    })(),
    esperado: {
      // V2 (F1-T10): imVE 110.5 g/m² (♂) — com o limite antigo (102) caía em
      // "Hipertrofia excêntrica"; com 115 (ASE 2015 Lang) o quadrante é preservado.
      achados: [
        'Índice de massa e espessura relativa do ventrículo esquerdo preservados.',
      ],
      // 58 não é > 58, então não dispara "leve" — fica normal
      achadosNaoPresentes: [
        'Ventrículo esquerdo aumentado',
        'Hipertrofia excêntrica do ventrículo esquerdo.',
      ],
    },
  },
  {
    id: 'B04',
    descricao: 'Cutoffs exatos (DDVE = 63 M = leve a moderado)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.camaras.ddve = 63;
      return m;
    })(),
    esperado: {
      achados: [
        'Ventrículo esquerdo aumentado em grau leve a moderado.',
      ],
    },
  },
  {
    id: 'B05',
    descricao: 'Wilkins ativo, score 8 (limítrofe)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.wilkins.ativo = true;
      m.wilkins.mobilidade = 2;
      m.wilkins.espessura = 2;
      m.wilkins.calcificacao = 2;
      m.wilkins.subvalvar = 2;
      return m;
    })(),
    esperado: {
      derivados: { } as never,
      // Sentinela __WILKINS__ é renderizada como bloco especial
      achados: ['__WILKINS__'],
    },
  },
  {
    id: 'B06',
    descricao: 'Wilkins ativo, score 12 (não candidato)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.wilkins.ativo = true;
      m.wilkins.mobilidade = 3;
      m.wilkins.espessura = 3;
      m.wilkins.calcificacao = 3;
      m.wilkins.subvalvar = 3;
      return m;
    })(),
    esperado: {
      achados: ['__WILKINS__'],
    },
  },
  {
    id: 'B07',
    descricao: 'AE diâmetro vs Vol AE index — volume tem prioridade',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.camaras.ae = 50; // diâmetro alterado (>40 M)
      m.diastolica.volAEindex = 25; // volume normal (≤34)
      return m;
    })(),
    esperado: {
      // Como volAEindex está preenchido, j3 é silenciado
      achadosNaoPresentes: [
        'Átrio esquerdo aumentado em grau',
      ],
    },
  },
  {
    id: 'B08',
    descricao: 'Vol AD index sexo-específico → JASE 2025 unificado',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.diastolica.volADindex = 32;
      // No motor antigo, M ≤32 = normal (silêncio)
      // No motor TS (JASE 2025), 30-36 = leve
      return m;
    })(),
    esperado: {
      achados: [
        'Átrio direito aumentado em grau leve.',
      ],
    },
  },
  {
    id: 'B09',
    descricao: 'Pacientes pediátricos (idade < 40, fórmula raiz especial)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.identificacao.pacienteDtnasc = '2000-01-01';
      m.identificacao.dataExame = '2026-05-04';
      // Idade = 26 anos
      m.camaras.raizAo = 32;
      return m;
    })(),
    esperado: {
      derivados: { idade: 26 },
      // Aorta deve aparecer como normal
      achados: [
        'Raiz aórtica',
        'com dimensões normais.',
      ],
    },
  },
  {
    id: 'B10',
    descricao: 'Aorta ascendente 50mm → aneurisma descrito, SEM frase de sugestão (V13, 27/08)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.camaras.aoAscendente = 50;
      return m;
    })(),
    esperado: {
      achados: [
        'Dilatação aneurismática',
        'aorta ascendente',
        'medindo 50 mm',
      ],
      achadosNaoPresentes: ['sugere-se', 'Sugere-se'],
      conclusoes: [
        // índice 50 mm / 1,75 m ≈ 11,2 cm²/m ⇒ qualificador de gravidade (F1-T2, I1)
        'Aneurisma da aorta ascendente, com critérios de maior gravidade.',
      ],
    },
  },
  {
    id: 'B11',
    descricao: 'Raiz 46mm ♂50a → aneurisma 45-49 com medida + índice cm²/m, sem sugestão (F1-T2 · 27/08)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.identificacao.pacienteDtnasc = '1976-01-01'; // 50 anos no exame
      m.camaras.raizAo = 46;
      return m;
    })(),
    esperado: {
      achados: [
        'Dilatação aneurismática da Raiz aórtica medindo 46 mm, ',
        'cm²/m (valores acima de 10 cm²/m sugerem maior gravidade).',
      ],
      // o laudo descreve, não recomenda (V13, 27/08)
      achadosNaoPresentes: ['sugere-se', 'Sugere-se'],
      conclusoes: ['Aneurisma da Raiz aórtica'],
    },
  },
  {
    id: 'B12',
    descricao: 'Arco 42mm → "dilatado" sem graus e SEM frase de angio-TC/RM (V13, 27/08)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.camaras.arcoAo = 42;
      return m;
    })(),
    esperado: {
      achados: [
        'Arco aórtico dilatado, medindo 42 mm.',
      ],
      achadosNaoPresentes: ['sugere-se', 'Sugere-se', 'angiotomografia'],
      conclusoes: ['Dilatação do arco aórtico.'],
      conclusoesNaoPresentes: ['Aneurisma do arco'],
    },
  },
];
