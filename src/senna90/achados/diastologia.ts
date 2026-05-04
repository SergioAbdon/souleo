// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Achados: Diastologia
// ══════════════════════════════════════════════════════════════════
// Funções: j21 (núcleo), j21FA_achado (wrapper FA), j22 (detalhe),
//          j22FA (detalhe FA), j43 (conclusão diastológica)
//
// ATUALIZADO: cutoff E/e' septal >15 consistente em sinusal e FA
// (decisão Dr. Sérgio — antes FA usava >14, agora >15 também)
// ══════════════════════════════════════════════════════════════════

import type { ResultadoJ21, MedidasEcoTT, CalculosDerivados } from '../types';
import { calcularJ21 as calcularJ21Logic } from '../calculos/diastologia';

interface DadosDiast {
  ritmo: string;
  sexo: string;
  b19: number | null;
  b20: number | null;
  b21: number | null;
  b22: number | null;
  b23: number | null;
  b24: number | null;
  lars: number | null;
  feT: number | null;
  b54: number | null;
  imVE: number | null;
}

/**
 * j21 — Núcleo do algoritmo diastológico.
 * Wrapper sobre `calcularJ21` (em calculos/diastologia.ts).
 */
export function j21(d: DadosDiast): ResultadoJ21 {
  return calcularJ21Logic({
    ritmo: d.ritmo as 'S' | 'N' | '',
    sexo: d.sexo as 'M' | 'F' | '',
    ondaE: d.b19,
    relacaoEA: d.b20,
    eSeptal: d.b21,
    relacaoEEseptal: d.b22,
    velocidadeIT: d.b23,
    volAEindex: d.b24,
    laStrain: d.lars,
    feT: d.feT,
    feSimpson: d.b54,
    imVE: d.imVE,
  });
}

/**
 * j21FA_achado — Wrapper que converte sentinelas FA em texto único.
 * Em FA, todas as sentinelas viram a mesma frase de "limitação por arritmia".
 */
export function j21FA_achado(d: DadosDiast): string {
  const x = j21(d);
  if (
    x === 'FA_PRESSAO_ELEVADA' ||
    x === 'FA_PRESSAO_NORMAL' ||
    x === 'FA_INDETERMINADA' ||
    x === 'FA_SEM_DADOS'
  ) {
    return 'Avaliação da função diastólica limitada devido arritmia cardíaca.';
  }
  return x;
}

/**
 * j22 — Linha detalhada com valores das medidas diastológicas.
 * Sintaxe: "Velocidade da Onda E= X cm/s; Relação E/A= Y; ..."
 */
export function j22(d: DadosDiast): string {
  if (!d.b19 && !d.b20 && !d.b21 && !d.b22 && !d.b24) return '';
  const E = d.b19 ?? '';
  const EA = d.b20 ?? '';
  const ep = d.b21 ?? '';
  const Eei = d.b22 ?? '';
  const vi = d.b24 ?? '';
  const base = `Velocidade da Onda E= ${E} cm/s; Relação E/A= ${EA}; Velocidade e' septal= ${ep} cm/s; Relação E/e'= ${Eei}; volume index do átrio esquerdo = ${vi} ml/m²`;
  return d.b23
    ? base + `; Velocidade do Refluxo Tricuspídeo= ${d.b23} m/s.`
    : base + '.';
}

/**
 * j22FA — Detalhamento em fibrilação atrial.
 * Mostra apenas os parâmetros disponíveis.
 */
export function j22FA(d: DadosDiast): string {
  const x = j21(d);
  if (typeof x === 'string' && x.startsWith('FA_')) {
    const partes: string[] = [];
    if (d.b19) partes.push('Velocidade da Onda E= ' + d.b19 + ' cm/s');
    if (d.b22) partes.push("Relação E/e'= " + d.b22);
    if (d.b23) partes.push('Velocidade do Refluxo Tricuspídeo= ' + d.b23 + ' m/s');
    if (d.b24) partes.push('Volume index do átrio esquerdo= ' + d.b24 + ' ml/m²');
    if (d.b21) partes.push("Velocidade e' septal= " + d.b21 + ' cm/s');
    return partes.length ? partes.join('; ') + '.' : '';
  }
  return j22(d);
}

/** j43 — Conclusão diastológica baseada no resultado de j21 */
export function j43(d: DadosDiast): string {
  const x = j21(d);
  if (!x) return '';

  // FA
  if (x === 'FA_PRESSAO_ELEVADA') return 'Parâmetros sugestivos de pressão de enchimento elevada.';
  if (x === 'FA_PRESSAO_NORMAL') return 'Parâmetros sugestivos de pressão de enchimento normal.';
  if (x === 'FA_INDETERMINADA') return 'Pressão de enchimento indeterminada (dados insuficientes para avaliação em arritmia cardíaca).';
  if (x === 'FA_SEM_DADOS') return '';

  // Sinusal
  if (x === 'Índices diastólicos do ventrículo esquerdo preservados') return '';
  if (x === 'Função Diastólica do ventrículo esquerdo Indeterminada') return 'Função diastólica do ventrículo esquerdo Indeterminada.';
  if (typeof x === 'string') {
    if (x.includes('Grau III')) return 'Disfunção diastólica de grau III do ventrículo esquerdo (padrão restritivo).';
    if (x.includes('Grau II')) return 'Disfunção diastólica de grau II do ventrículo esquerdo (padrão pseudo-normal).';
    if (x.includes('Grau I')) return 'Disfunção diastólica de grau I do ventrículo esquerdo (alteração de relaxamento).';
  }
  return '';
}

/**
 * DIAST_SENTENCAS — Sentenças manuais (modo override do médico)
 * Índices 0-6 conforme convenção do motor original.
 */
export const DIAST_SENTENCAS = [
  { achado: 'Índices diastólicos do ventrículo esquerdo preservados.', conclusao: '', alerta: false },
  { achado: 'Disfunção diastólica do ventrículo esquerdo de grau I (alteração de relaxamento).', conclusao: 'Disfunção diastólica de grau I do ventrículo esquerdo (alteração de relaxamento).', alerta: true },
  { achado: 'Disfunção diastólica do ventrículo esquerdo de grau II (padrão pseudonormal).', conclusao: 'Disfunção diastólica de grau II do ventrículo esquerdo (padrão pseudo-normal).', alerta: true },
  { achado: 'Disfunção diastólica do ventrículo esquerdo de grau III (padrão restritivo).', conclusao: 'Disfunção diastólica de grau III do ventrículo esquerdo (padrão restritivo).', alerta: true },
  { achado: 'Função diastólica do ventrículo esquerdo indeterminada.', conclusao: 'Função diastólica do ventrículo esquerdo indeterminada.', alerta: false },
  { achado: 'Avaliação da função diastólica limitada devido arritmia cardíaca.', conclusao: '', alerta: false },
  { achado: '', conclusao: '', alerta: false }, // 6 = não avaliar
] as const;
