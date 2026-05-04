// ══════════════════════════════════════════════════════════════════
// CASOS DE TESTE — Função Diastólica (graus + FA)
// ══════════════════════════════════════════════════════════════════

import type { CasoTeste } from '../runner';
import { pacienteSaudavelM } from '../helpers';

export const casosDiastologia: CasoTeste[] = [
  {
    id: 'D01',
    descricao: 'Disfunção diastólica Grau I (E/A ≤ 0.8 e E ≤ 50)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.diastolica.ondaE = 45;
      m.diastolica.relacaoEA = 0.7;
      m.diastolica.eSeptal = 6;
      m.diastolica.relacaoEEseptal = 10;
      // Disfunção sistólica leve para entrar no algoritmo simplificado
      m.sistolica.feSimpson = 45;
      return m;
    })(),
    esperado: {
      achados: [
        'Disfunção Diastólica do ventrículo esquerdo de Grau I',
      ],
      conclusoes: [
        'Disfunção diastólica de grau I do ventrículo esquerdo (alteração de relaxamento).',
      ],
    },
  },
  {
    id: 'D02',
    descricao: 'Disfunção diastólica Grau III (Restritivo, E/A ≥ 2)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.diastolica.ondaE = 100;
      m.diastolica.relacaoEA = 2.5;
      m.diastolica.eSeptal = 5;
      m.diastolica.relacaoEEseptal = 18;
      m.diastolica.velocidadeIT = 3.2;
      m.diastolica.volAEindex = 50;
      m.sistolica.feSimpson = 35;
      return m;
    })(),
    esperado: {
      achados: [
        'Disfunção Diastólica do ventrículo esquerdo de Grau III',
      ],
      conclusoes: [
        'Disfunção diastólica de grau III do ventrículo esquerdo (padrão restritivo).',
      ],
    },
  },
  {
    id: 'D03',
    descricao: 'Função diastólica preservada (FE preservada + ≤1 critério)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      // Já é saudável — confirma achado
      return m;
    })(),
    esperado: {
      achados: [
        'Índices diastólicos do ventrículo esquerdo preservados',
      ],
      // Sem conclusão de disfunção
      conclusoesNaoPresentes: ['Disfunção diastólica'],
    },
  },
  {
    id: 'D04',
    descricao: 'Fibrilação Atrial — pressão de enchimento elevada (≥2 critérios)',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null; // sem onda A em FA
      m.diastolica.ondaE = 90;
      m.diastolica.eSeptal = 6;
      m.diastolica.relacaoEEseptal = 18; // >15 elevado
      m.diastolica.velocidadeIT = 3.0; // >2.8 elevado
      m.diastolica.volAEindex = 38; // >34 elevado
      m.diastolica.laStrain = 14; // <18 reduzido
      return m;
    })(),
    esperado: {
      achados: [
        'Avaliação da função diastólica limitada devido arritmia cardíaca.',
      ],
      conclusoes: [
        'Parâmetros sugestivos de pressão de enchimento elevada.',
      ],
    },
  },
  {
    id: 'D05',
    descricao: 'Fibrilação Atrial — pressão de enchimento normal',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.gerais.ritmo = 'N';
      m.diastolica.relacaoEA = null;
      m.diastolica.ondaE = 70;
      m.diastolica.eSeptal = 9;
      m.diastolica.relacaoEEseptal = 8; // ≤15 normal
      m.diastolica.velocidadeIT = 2.0; // ≤2.8 normal
      m.diastolica.volAEindex = 28; // ≤34 normal
      m.diastolica.laStrain = 25; // ≥18 normal
      return m;
    })(),
    esperado: {
      achados: [
        'Avaliação da função diastólica limitada devido arritmia cardíaca.',
      ],
      conclusoes: [
        'Parâmetros sugestivos de pressão de enchimento normal.',
      ],
    },
  },
];
