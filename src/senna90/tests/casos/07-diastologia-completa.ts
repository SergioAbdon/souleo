// ══════════════════════════════════════════════════════════════════
// CASOS DE TESTE — Função Diastólica Completa
// Cobre todos os cenários: sinusal + FA + cutoffs limítrofes
// ══════════════════════════════════════════════════════════════════

import type { CasoTeste } from '../runner';
import { pacienteSaudavelM, medidasVazias } from '../helpers';

// ── HELPER: paciente diastológico base ──────────────────────────
function diastBase() {
  const m = pacienteSaudavelM();
  // Limpa diastologia para começar do zero
  m.diastolica.ondaE = null;
  m.diastolica.relacaoEA = null;
  m.diastolica.eSeptal = null;
  m.diastolica.relacaoEEseptal = null;
  m.diastolica.velocidadeIT = null;
  m.diastolica.volAEindex = null;
  m.diastolica.laStrain = null;
  m.diastolica.psap = null;
  m.diastolica.sinaisHP = '';
  return m;
}

export const casosDiastologiaCompleta: CasoTeste[] = [
  // ═══════════════════════════════════════════════════════════════
  // GRUPO 1 — RITMO SINUSAL (sem arritmia)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'DC01',
    descricao: 'SINUSAL — Função preservada (todos critérios normais)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 80;          // Normal
      m.diastolica.relacaoEA = 1.2;     // Normal (>0.8 e <2)
      m.diastolica.eSeptal = 9;         // Normal (≥7)
      m.diastolica.relacaoEEseptal = 8; // Normal (≤15)
      m.diastolica.velocidadeIT = 2.0;  // Normal (≤2.8)
      m.diastolica.volAEindex = 28;     // Normal (≤34)
      return m;
    })(),
    esperado: {
      achados: ['Índices diastólicos do ventrículo esquerdo preservados'],
      conclusoesNaoPresentes: ['Disfunção diastólica'],
    },
  },

  {
    id: 'DC02',
    descricao: 'SINUSAL — Grau I com FE BAIXA (E/A ≤ 0.8 e E ≤ 50 → algoritmo simplificado)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 45;            // ≤50 ✓
      m.diastolica.relacaoEA = 0.7;        // ≤0.8 ✓
      m.diastolica.eSeptal = 6;
      m.diastolica.relacaoEEseptal = 10;
      m.diastolica.velocidadeIT = 2.5;
      m.diastolica.volAEindex = 30;
      m.sistolica.feSimpson = 35;          // FE baixa → força classify()
      return m;
    })(),
    esperado: {
      // FE baixa força classify(): E/A 0.7 e E 45 → Grau I direto
      achados: ['Disfunção Diastólica do ventrículo esquerdo de Grau I'],
      conclusoes: ['Disfunção diastólica de grau I do ventrículo esquerdo (alteração de relaxamento).'],
    },
  },

  {
    id: 'DC03',
    descricao: 'SINUSAL — Grau II Pseudonormal (3 critérios alterados, E/A normal)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 90;
      m.diastolica.relacaoEA = 1.4;     // Normal (não dispara Grau III nem Grau I)
      m.diastolica.eSeptal = 5;          // <7 (anormal)
      m.diastolica.relacaoEEseptal = 18; // >15 (anormal)
      m.diastolica.velocidadeIT = 3.0;   // >2.8 (anormal)
      m.diastolica.volAEindex = 40;      // >34 (anormal)
      m.sistolica.feSimpson = 60;        // FE preservada
      return m;
    })(),
    esperado: {
      // 4 critérios alterados → ≥3 → algoritmo simplificado: como E/A é normal e não restritivo, vai pra Grau II
      achados: ['Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal)'],
      conclusoes: ['Disfunção diastólica de grau II do ventrículo esquerdo (padrão pseudo-normal).'],
    },
  },

  {
    id: 'DC04',
    descricao: 'SINUSAL — Grau III Restritivo (E/A ≥ 2)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 100;
      m.diastolica.relacaoEA = 2.5;
      m.diastolica.eSeptal = 5;
      m.diastolica.relacaoEEseptal = 20;
      m.diastolica.velocidadeIT = 3.5;
      m.diastolica.volAEindex = 50;
      m.sistolica.feSimpson = 35;
      return m;
    })(),
    esperado: {
      achados: ['Disfunção Diastólica do ventrículo esquerdo de Grau III (Padrão Restritivo)'],
      conclusoes: ['Disfunção diastólica de grau III do ventrículo esquerdo (padrão restritivo).'],
    },
  },

  {
    id: 'DC05',
    descricao: 'SINUSAL — Indeterminada (exatamente 2 critérios alterados, FE preservada)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 70;
      m.diastolica.relacaoEA = 1.3;     // Normal
      m.diastolica.eSeptal = 6;          // <7 (1)
      m.diastolica.relacaoEEseptal = 16; // >15 (2)
      m.diastolica.velocidadeIT = 2.5;   // ≤2.8 (normal)
      m.diastolica.volAEindex = 30;      // ≤34 (normal)
      m.sistolica.feSimpson = 60;        // FE preservada
      return m;
    })(),
    esperado: {
      achados: ['Função Diastólica do ventrículo esquerdo Indeterminada'],
      conclusoes: ['Função diastólica do ventrículo esquerdo Indeterminada.'],
    },
  },

  {
    id: 'DC06',
    descricao: 'SINUSAL — FE preservada + 1 critério alterado (ainda preservada)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 80;
      m.diastolica.relacaoEA = 1.2;
      m.diastolica.eSeptal = 6;          // <7 (1 critério)
      m.diastolica.relacaoEEseptal = 8;
      m.diastolica.velocidadeIT = 2.0;
      m.diastolica.volAEindex = 28;
      m.sistolica.feSimpson = 60;
      return m;
    })(),
    esperado: {
      achados: ['Índices diastólicos do ventrículo esquerdo preservados'],
      conclusoesNaoPresentes: ['Disfunção diastólica'],
    },
  },

  {
    id: 'DC07',
    descricao: 'SINUSAL — FE baixa força classificação por algoritmo simplificado',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 80;
      m.diastolica.relacaoEA = 1.1;     // Normal — entra na contagem
      m.diastolica.relacaoEEseptal = 18; // >15 (1)
      m.diastolica.velocidadeIT = 3.0;   // >2.8 (2)
      m.diastolica.volAEindex = 38;      // >34 (3)
      m.sistolica.feSimpson = 35;        // FE BAIXA
      return m;
    })(),
    esperado: {
      // FE baixa força classify(): E/A não é restritivo nem Grau I, p≥2 → Grau II
      achados: ['Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal)'],
      conclusoes: ['Disfunção diastólica de grau II'],
    },
  },

  {
    id: 'DC08',
    descricao: 'SINUSAL — Massa alta força classificação simplificada',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.gerais.sexo = 'M';
      m.diastolica.ondaE = 80;
      m.diastolica.relacaoEA = 1.1;
      m.diastolica.relacaoEEseptal = 18;
      m.diastolica.velocidadeIT = 3.0;
      m.diastolica.volAEindex = 38;
      // Force IMVE > 115 (homem)
      m.camaras.ddve = 50;
      m.camaras.septoIV = 14;
      m.camaras.paredePosterior = 14;
      m.gerais.peso = 70;
      m.gerais.altura = 175;
      return m;
    })(),
    esperado: {
      achados: ['Disfunção Diastólica do ventrículo esquerdo'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // GRUPO 2 — FIBRILAÇÃO ATRIAL (ritmo irregular + sem onda A)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'DC09',
    descricao: 'FA — Pressão elevada (4 critérios elevados)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;     // FA = sem onda A
      m.diastolica.relacaoEEseptal = 18; // >15 elevado
      m.diastolica.velocidadeIT = 3.2;   // >2.8 elevado
      m.diastolica.volAEindex = 40;      // >34 elevado
      m.diastolica.laStrain = 14;        // <18 elevado
      return m;
    })(),
    esperado: {
      achados: ['Avaliação da função diastólica limitada devido arritmia cardíaca.'],
      conclusoes: ['Parâmetros sugestivos de pressão de enchimento elevada.'],
    },
  },

  {
    id: 'DC10',
    descricao: 'FA — Pressão elevada (apenas 2 critérios elevados — limite)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      m.diastolica.relacaoEEseptal = 18; // >15 elevado (1)
      m.diastolica.velocidadeIT = 3.0;   // >2.8 elevado (2)
      m.diastolica.volAEindex = 30;      // ≤34 normal
      m.diastolica.laStrain = 25;        // ≥18 normal
      return m;
    })(),
    esperado: {
      achados: ['Avaliação da função diastólica limitada devido arritmia cardíaca.'],
      conclusoes: ['Parâmetros sugestivos de pressão de enchimento elevada.'],
    },
  },

  {
    id: 'DC11',
    descricao: 'FA — Pressão NORMAL (1 elevado, 3 normais)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      m.diastolica.relacaoEEseptal = 12; // ≤15 normal
      m.diastolica.velocidadeIT = 2.0;   // ≤2.8 normal
      m.diastolica.volAEindex = 38;      // >34 elevado (1 só)
      m.diastolica.laStrain = 25;        // ≥18 normal
      return m;
    })(),
    esperado: {
      achados: ['Avaliação da função diastólica limitada devido arritmia cardíaca.'],
      conclusoes: ['Parâmetros sugestivos de pressão de enchimento normal.'],
    },
  },

  {
    id: 'DC12',
    descricao: 'FA — Pressão normal (todos parâmetros normais)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      m.diastolica.relacaoEEseptal = 8;
      m.diastolica.velocidadeIT = 1.8;
      m.diastolica.volAEindex = 25;
      m.diastolica.laStrain = 28;
      return m;
    })(),
    esperado: {
      achados: ['Avaliação da função diastólica limitada devido arritmia cardíaca.'],
      conclusoes: ['Parâmetros sugestivos de pressão de enchimento normal.'],
    },
  },

  {
    id: 'DC13',
    descricao: 'FA — Indeterminada (apenas 1 parâmetro disponível)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      m.diastolica.relacaoEEseptal = 18; // único parâmetro
      // Os outros: null
      return m;
    })(),
    esperado: {
      achados: ['Avaliação da função diastólica limitada devido arritmia cardíaca.'],
      conclusoes: ['Pressão de enchimento indeterminada (dados insuficientes para avaliação em arritmia cardíaca).'],
    },
  },

  {
    id: 'DC14',
    descricao: 'FA — Sem dados (todos parâmetros vazios)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      // Tudo null
      return m;
    })(),
    esperado: {
      // FA_SEM_DADOS → ainda emite frase de "limitação por arritmia" no achado
      achados: ['Avaliação da função diastólica limitada devido arritmia cardíaca.'],
      // Mas conclusão fica vazia (sem dados pra estimar pressão)
      conclusoesNaoPresentes: ['Parâmetros sugestivos', 'Pressão de enchimento indeterminada'],
    },
  },

  {
    id: 'DC15',
    descricao: 'FA — LARS isolado reduzido conta como elevado',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      m.diastolica.laStrain = 14;        // <18 = elevado (1)
      m.diastolica.velocidadeIT = 3.0;   // >2.8 = elevado (2)
      m.diastolica.relacaoEEseptal = 10; // normal
      m.diastolica.volAEindex = 30;      // normal
      return m;
    })(),
    esperado: {
      conclusoes: ['Parâmetros sugestivos de pressão de enchimento elevada.'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // GRUPO 3 — CUTOFFS LIMÍTROFES (igualdades exatas)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'DC16',
    descricao: 'CUTOFF — E/e\' septal exatamente 15 (NÃO dispara, pois é >15)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 80;
      m.diastolica.relacaoEA = 1.2;
      m.diastolica.eSeptal = 9;
      m.diastolica.relacaoEEseptal = 15; // EXATAMENTE 15
      m.diastolica.velocidadeIT = 2.0;
      m.diastolica.volAEindex = 28;
      m.sistolica.feSimpson = 60;
      return m;
    })(),
    esperado: {
      achados: ['Índices diastólicos do ventrículo esquerdo preservados'],
    },
  },

  {
    id: 'DC17',
    descricao: 'CUTOFF — E/A exatamente 2.0 (DISPARA Grau III)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 100;
      m.diastolica.relacaoEA = 2.0;       // exatamente 2 → dispara
      m.diastolica.eSeptal = 5;
      m.diastolica.relacaoEEseptal = 18;
      m.diastolica.velocidadeIT = 3.5;
      m.diastolica.volAEindex = 50;
      m.sistolica.feSimpson = 35;
      return m;
    })(),
    esperado: {
      achados: ['Disfunção Diastólica do ventrículo esquerdo de Grau III'],
    },
  },

  {
    id: 'DC18',
    descricao: 'CUTOFF — Vel IT exatamente 2.8 (NÃO dispara, pois é >2.8)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 80;
      m.diastolica.relacaoEA = 1.2;
      m.diastolica.eSeptal = 9;
      m.diastolica.relacaoEEseptal = 8;
      m.diastolica.velocidadeIT = 2.8;   // EXATAMENTE 2.8
      m.diastolica.volAEindex = 28;
      m.sistolica.feSimpson = 60;
      return m;
    })(),
    esperado: {
      achados: ['Índices diastólicos do ventrículo esquerdo preservados'],
    },
  },

  {
    id: 'DC19',
    descricao: 'CUTOFF — LAVI exatamente 34 (NÃO dispara, pois é >34)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 80;
      m.diastolica.relacaoEA = 1.2;
      m.diastolica.eSeptal = 9;
      m.diastolica.relacaoEEseptal = 8;
      m.diastolica.velocidadeIT = 2.0;
      m.diastolica.volAEindex = 34;      // EXATAMENTE 34
      m.sistolica.feSimpson = 60;
      return m;
    })(),
    esperado: {
      achados: ['Índices diastólicos do ventrículo esquerdo preservados'],
      // AE Vol = 34 ainda é normal (cutoff é >34)
      achadosNaoPresentes: ['Átrio esquerdo aumentado'],
    },
  },

  {
    id: 'DC20',
    descricao: 'CUTOFF — E/A=0.8 + E=50 com FE baixa (DISPARA Grau I via classify)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 50;            // exatamente 50 (≤50 ✓)
      m.diastolica.relacaoEA = 0.8;       // exatamente 0.8 (≤0.8 ✓)
      m.diastolica.eSeptal = 6;
      m.diastolica.relacaoEEseptal = 10;
      m.sistolica.feSimpson = 35;         // FE baixa → algoritmo simplificado
      return m;
    })(),
    esperado: {
      achados: ['Disfunção Diastólica do ventrículo esquerdo de Grau I'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // GRUPO 4 — INTERAÇÃO COM OUTROS PARÂMETROS
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'DC21',
    descricao: 'Diastologia preservada + LARS preservado (LARS confirma normalidade)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 80;
      m.diastolica.relacaoEA = 1.2;
      m.diastolica.eSeptal = 9;
      m.diastolica.relacaoEEseptal = 8;
      m.diastolica.laStrain = 28;
      m.sistolica.feSimpson = 60;
      return m;
    })(),
    esperado: {
      achados: [
        'Índices diastólicos do ventrículo esquerdo preservados',
        'Strain longitudinal do átrio esquerdo (reservoir) de 28% (VR ≥ 18%).',
      ],
      conclusoes: [
        'Strain atrial esquerdo preservado (28%).',
      ],
    },
  },

  {
    id: 'DC22',
    descricao: 'Diastologia preservada + LARS reduzido (sugere disfunção subclínica)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 80;
      m.diastolica.relacaoEA = 1.2;
      m.diastolica.eSeptal = 9;
      m.diastolica.relacaoEEseptal = 8;
      m.diastolica.laStrain = 14;        // reduzido
      m.sistolica.feSimpson = 60;
      return m;
    })(),
    esperado: {
      achados: ['Strain longitudinal do átrio esquerdo (reservoir) reduzido de 14%'],
      conclusoes: [
        'Strain atrial esquerdo reduzido (14%), sugestivo de elevação das pressões de enchimento.',
      ],
    },
  },

  {
    id: 'DC23',
    descricao: 'Diastologia ALTERADA + LARS reduzido (LARS NÃO emite — j43 cobre)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 100;
      m.diastolica.relacaoEA = 2.5;       // Grau III
      m.diastolica.laStrain = 12;
      m.sistolica.feSimpson = 35;
      return m;
    })(),
    esperado: {
      conclusoes: ['Disfunção diastólica de grau III'],
      // LARS silencia quando diast já alterada
      conclusoesNaoPresentes: ['Strain atrial esquerdo'],
    },
  },

  {
    id: 'DC24',
    descricao: 'IT preenchida sem PSAP — gera alerta visual',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 80;
      m.diastolica.relacaoEA = 1.2;
      m.diastolica.velocidadeIT = 3.0;
      m.diastolica.psap = null;          // SEM PSAP
      m.sistolica.feSimpson = 60;
      return m;
    })(),
    esperado: {
      achados: ['Probabilidade Intermediária de Hipertensão Pulmonar.'],
      // Frase "Ausência de sinais indiretos" não deve aparecer (b23 preenchida)
      achadosNaoPresentes: ['Ausência de sinais indiretos'],
    },
  },

  {
    id: 'DC25',
    descricao: 'PSAP preenchida — emite frase com VR<36',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 80;
      m.diastolica.relacaoEA = 1.2;
      m.diastolica.velocidadeIT = 3.0;
      m.diastolica.psap = 45;
      m.sistolica.feSimpson = 60;
      return m;
    })(),
    esperado: {
      achados: [
        'Pressão sistólica da artéria pulmonar de 45 mmHg. VR < 36 mmHg.',
        'Probabilidade Intermediária de Hipertensão Pulmonar.',
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // GRUPO 5 — FA com sintomas atípicos
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'DC26',
    descricao: 'FA — apenas LAVI alterado (LAVI sozinho não basta pra elevada)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      m.diastolica.volAEindex = 50;       // único elevado
      m.diastolica.relacaoEEseptal = 8;
      m.diastolica.velocidadeIT = 1.5;
      m.diastolica.laStrain = 28;
      return m;
    })(),
    esperado: {
      // 1 elevado de 4 disponíveis = pressão NORMAL
      conclusoes: ['Parâmetros sugestivos de pressão de enchimento normal.'],
    },
  },

  {
    id: 'DC27',
    descricao: 'FA — só E/e\' septal e Vel IT (2 disponíveis, 0 elevados = normal)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      m.diastolica.relacaoEEseptal = 10; // normal
      m.diastolica.velocidadeIT = 2.0;   // normal
      // LAVI e LARS = null
      return m;
    })(),
    esperado: {
      conclusoes: ['Parâmetros sugestivos de pressão de enchimento normal.'],
    },
  },

  {
    id: 'DC28',
    descricao: 'FA com sinais HP indiretos presentes (modula j50)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      m.diastolica.velocidadeIT = 2.5;    // <2.9
      m.diastolica.sinaisHP = 'S';        // sinais presentes
      m.diastolica.relacaoEEseptal = 18;
      m.diastolica.volAEindex = 38;
      return m;
    })(),
    esperado: {
      achados: ['Probabilidade Intermediária de Hipertensão Pulmonar.'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // GRUPO 6 — Sinusal com FE indisponível (feVide)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'DC29',
    descricao: 'SINUSAL — FE indisponível (feVide) força algoritmo simplificado',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.gerais.sexo = 'M';
      m.diastolica.ondaE = 80;
      m.diastolica.relacaoEA = 1.2;
      m.diastolica.relacaoEEseptal = 18;
      m.diastolica.velocidadeIT = 3.0;
      m.diastolica.volAEindex = 38;
      // SEM b54 e SEM b9/b12 (sem como calcular FE Teichholz)
      m.camaras.ddve = null;
      m.camaras.dsve = null;
      m.sistolica.feSimpson = null;
      return m;
    })(),
    esperado: {
      // feVide → algoritmo simplificado → 3 critérios elevados → Grau II
      achados: ['Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal)'],
    },
  },

  {
    id: 'DC30',
    descricao: 'SINUSAL — Disfunção Grau I com FE preservada e ≥3 critérios alterados',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 45;            // ≤50
      m.diastolica.relacaoEA = 0.7;       // ≤0.8
      m.diastolica.eSeptal = 6;
      m.diastolica.relacaoEEseptal = 18;
      m.diastolica.velocidadeIT = 3.0;
      m.diastolica.volAEindex = 38;
      m.sistolica.feSimpson = 60;
      return m;
    })(),
    esperado: {
      // Mesmo com FE preservada, ≥3 critérios → classify() → E/A 0.7 e E 45 → Grau I
      achados: ['Disfunção Diastólica do ventrículo esquerdo de Grau I'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // GRUPO 7 — Nuance: FE preservada + E/A baixo NÃO dispara Grau I direto
  // (descoberto durante validação clínica)
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'DC31',
    descricao: 'NUANCE — FE preservada + E/A 0.7 + apenas 1 critério → preservada',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 45;            // ≤50 (mas não relevante aqui)
      m.diastolica.relacaoEA = 0.7;       // ≤0.8
      m.diastolica.eSeptal = 8;            // normal (≥7)
      m.diastolica.relacaoEEseptal = 10;   // normal
      m.diastolica.velocidadeIT = 2.0;     // normal
      m.diastolica.volAEindex = 30;        // normal
      m.sistolica.feSimpson = 60;          // FE preservada
      return m;
    })(),
    esperado: {
      // FE preservada e c=0 critérios alterados → preservada
      // E/A baixo NÃO dispara Grau I direto sem FE baixa/massa alta/FE vazia
      achados: ['Índices diastólicos do ventrículo esquerdo preservados'],
    },
  },

  {
    id: 'DC32',
    descricao: 'NUANCE — FE preservada + E/A baixo + 2 critérios = Indeterminada',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.diastolica.ondaE = 45;
      m.diastolica.relacaoEA = 0.7;
      m.diastolica.eSeptal = 6;            // <7 (1 critério)
      m.diastolica.relacaoEEseptal = 18;   // >15 (2 critérios)
      m.diastolica.velocidadeIT = 2.0;     // normal
      m.diastolica.volAEindex = 30;        // normal
      m.sistolica.feSimpson = 60;
      return m;
    })(),
    esperado: {
      achados: ['Função Diastólica do ventrículo esquerdo Indeterminada'],
    },
  },

  {
    id: 'DC33',
    descricao: 'NUANCE — Massa alta força classify() mesmo com FE preservada',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';
      m.gerais.sexo = 'M';
      m.diastolica.ondaE = 45;
      m.diastolica.relacaoEA = 0.7;
      m.diastolica.eSeptal = 8;
      m.diastolica.relacaoEEseptal = 10;
      m.diastolica.velocidadeIT = 2.0;
      m.diastolica.volAEindex = 30;
      m.sistolica.feSimpson = 60;          // FE preservada
      // Massa alta (IMVE > 115 M)
      m.camaras.ddve = 50;
      m.camaras.septoIV = 14;
      m.camaras.paredePosterior = 14;
      m.gerais.peso = 70;
      m.gerais.altura = 175;
      return m;
    })(),
    esperado: {
      // Massa alta força classify() → E/A 0.7 e E 45 → Grau I
      achados: ['Disfunção Diastólica do ventrículo esquerdo de Grau I'],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // GRUPO 8 — FA com fluxo entre limites
  // ═══════════════════════════════════════════════════════════════

  {
    id: 'DC34',
    descricao: 'FA — todos critérios no limite (E/e\'=15, IT=2.8, LAVI=34, LARS=18)',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      m.diastolica.relacaoEEseptal = 15;  // exatamente 15 (>15 falso)
      m.diastolica.velocidadeIT = 2.8;     // exatamente 2.8 (>2.8 falso)
      m.diastolica.volAEindex = 34;        // exatamente 34 (>34 falso)
      m.diastolica.laStrain = 18;          // exatamente 18 (<18 falso)
      return m;
    })(),
    esperado: {
      // 0 critérios elevados (todos no limite estrito) → pressão normal
      conclusoes: ['Parâmetros sugestivos de pressão de enchimento normal.'],
    },
  },

  {
    id: 'DC35',
    descricao: 'FA — 3 disponíveis e 2 elevados = pressão elevada',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      m.diastolica.relacaoEEseptal = 18;   // elevado
      m.diastolica.velocidadeIT = 3.0;     // elevado
      m.diastolica.volAEindex = 30;        // normal
      // LARS = null
      return m;
    })(),
    esperado: {
      conclusoes: ['Parâmetros sugestivos de pressão de enchimento elevada.'],
    },
  },

  {
    id: 'DC36',
    descricao: 'Sinusal vs FA — mesmo paciente classifica diferente',
    inputs: (() => {
      const m = diastBase();
      m.gerais.ritmo = 'S';                // Ritmo sinusal
      m.diastolica.ondaE = 70;
      m.diastolica.relacaoEA = 1.0;        // Onda A presente
      m.diastolica.eSeptal = 8;
      m.diastolica.relacaoEEseptal = 12;
      m.diastolica.velocidadeIT = 2.0;
      m.diastolica.volAEindex = 32;
      m.sistolica.feSimpson = 60;
      return m;
    })(),
    esperado: {
      // Paciente claramente normal
      achados: ['Índices diastólicos do ventrículo esquerdo preservados'],
    },
  },
];
