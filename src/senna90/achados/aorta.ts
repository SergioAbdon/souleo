// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Achados: Aorta (SPEC 16/05/2026 — Dr. Sérgio)
// ══════════════════════════════════════════════════════════════════
// docs/decisoes/2026-05-16-spec-aorta.md
//
// Tiers: normal / dilatacao / aneurisma (tierRaizAo/Asc/Arco em calculos),
// régua ACC/AHA 2022 + WASE 2022 (Senna93 §2.2) — "ectasia leve/moderada/
// importante" morreu na F1; o arco nunca é "aneurisma".
// COMENTÁRIOS:
//   • Raiz : COM "medindo XX mm" SÓ no aneurisma (decisão 27/08 — paridade
//            com a ascendente); a dilatação segue sem medida (decisão 16/05).
//            índice cm²/m no texto em dilatação E em aneurisma (quando há
//            altura).
//   • Asc  : COM "medindo XX mm" + índice cm²/m (espelha a raiz).
//   • Arco : COM "medindo XX mm", SEM índice (não validado p/ arco).
// Frase "com dimensões normais" PRESERVADA (decisão 07/05/2026).
//
// SEM FRASES DE SUGESTÃO (decisão do cardiologista, teste ao vivo 27/08 — V13):
// o laudo é técnico e DESCREVE; conduta é do médico assistente. Morreram as
// notas de avaliação cirúrgica (≥50 raiz/asc · ≥55 arco) e a frase de
// angio-TC/RM do arco. A flag estruturada `notaCirurgica` do cálculo FICA
// (sinal sem texto, para a UI usar depois).
// ══════════════════════════════════════════════════════════════════

import type { Sexo } from '../types';
import {
  tierRaizAo,
  tierAoAscendente,
  tierArcoAo,
  type SegmentoAortaResult,
} from '../calculos/aorta';

const NOTA_INDICE = '(valores acima de 10 cm²/m sugerem maior gravidade)';

function fmtIdx(idx: number): string {
  return idx.toFixed(1).replace('.', ',');
}
function fmtMM(mm: number): string {
  return String(mm).replace('.', ',');
}

// ── COMENTÁRIOS por segmento ──

// I1 da revisão da T1: com aneurisma ≥45, o índice NÃO pode sumir do texto na
// faixa 45-49 (índice = sinalização de risco cirúrgico, spec §2.2). O ramo de
// aneurisma passa a carregar o índice quando disponível.
function sufixoIndice(r: SegmentoAortaResult): string {
  return r.indiceCm2m !== null ? `, ${fmtIdx(r.indiceCm2m)} cm²/m ${NOTA_INDICE}` : '';
}

/** Raiz: "medindo" só no aneurisma (27/08). Índice na dilatação e no aneurisma. */
function comentarioRaiz(r: SegmentoAortaResult): string {
  if (r.tier === 'aneurisma') {
    return `Dilatação aneurismática da Raiz aórtica medindo ${fmtMM(r.medidaMM)} mm${sufixoIndice(r)}.`;
  }
  if (r.indiceCm2m !== null) {
    return `Dilatação da Raiz aórtica, ${fmtIdx(r.indiceCm2m)} cm²/m ${NOTA_INDICE}.`;
  }
  return 'Dilatação da Raiz aórtica.';
}

/** Ascendente: COM "medindo XX mm" + índice. */
function comentarioAsc(r: SegmentoAortaResult): string {
  if (r.tier === 'aneurisma') {
    return `Dilatação aneurismática da aorta ascendente medindo ${fmtMM(r.medidaMM)} mm${sufixoIndice(r)}.`;
  }
  if (r.indiceCm2m !== null) {
    return `Dilatação da aorta ascendente medindo ${fmtMM(r.medidaMM)} mm, ${fmtIdx(r.indiceCm2m)} cm²/m ${NOTA_INDICE}.`;
  }
  return `Dilatação da aorta ascendente medindo ${fmtMM(r.medidaMM)} mm.`;
}

/** Arco: COM "medindo XX mm", SEM índice, SEM tier de aneurisma. */
function comentarioArco(r: SegmentoAortaResult): string {
  return `Arco aórtico dilatado, medindo ${fmtMM(r.medidaMM)} mm.`;
}

// ── Helper: combinação dos segmentos NORMAIS (preservado 07/05/2026) ──
function fraseNormais(normais: string[]): string {
  if (normais.length === 3) {
    return 'Raiz aórtica, aorta ascendente e arco aórtico com dimensões normais.';
  }
  if (normais.length === 2) {
    const p = normais[0].charAt(0).toUpperCase() + normais[0].slice(1);
    return `${p} e ${normais[1]} com dimensões normais.`;
  }
  if (normais.length === 1) {
    const u = normais[0].charAt(0).toUpperCase() + normais[0].slice(1);
    return `${u} com dimensões normais.`;
  }
  return '';
}

/**
 * j37 — Raiz aórtica + combinações de "todas/2/1 normais"
 * - Raiz alterada → texto da raiz (asc/arco cobertos por j38/j39/complementar)
 * - Raiz normal → monta lista combinada dos normais
 */
export function jAortaRaiz(
  b7: number | null,
  b28: number | null,
  b29: number | null,
  sexo: Sexo,
  asc: number | null,
  idade: number | null,
  alturaCm: number | null
): string {
  if (!sexo) return '';

  const raiz = b7 ? tierRaizAo(b7, sexo, asc, idade, alturaCm) : null;
  const ascR = b28 ? tierAoAscendente(b28, sexo, asc, alturaCm) : null;
  const arco = b29 ? tierArcoAo(b29) : null;

  if (raiz && raiz.tier !== 'normal') {
    return comentarioRaiz(raiz);
  }

  const normais: string[] = [];
  if (!raiz || raiz.tier === 'normal') normais.push('Raiz aórtica');
  if (!ascR || ascR.tier === 'normal') normais.push('aorta ascendente');
  if (!arco || arco.tier === 'normal') normais.push('arco aórtico');
  return fraseNormais(normais);
}

/** j38 — Aorta ascendente */
export function jAortaAscendente(
  b28: number | null,
  sexo: Sexo,
  asc: number | null,
  alturaCm: number | null
): string {
  if (!sexo || !b28) return '';
  const r = tierAoAscendente(b28, sexo, asc, alturaCm);
  return r.tier !== 'normal' ? comentarioAsc(r) : '';
}

/** j39 — Arco aórtico (faixa fixa, sem sexo/ASC/índice) */
export function jArcoAortico(b29: number | null, sexo: Sexo): string {
  if (!sexo || !b29) return '';
  const r = tierArcoAo(b29);
  return r.tier !== 'normal' ? comentarioArco(r) : '';
}

/**
 * Quando raiz aórtica está alterada, jAortaRaiz só emite a frase da raiz.
 * Esta função complementa emitindo "Aorta ascendente / arco aórtico com
 * dimensões normais" quando esses segmentos estão normais.
 *
 * Bug corrigido 07/05/2026 — Dr. Sérgio (laudo ficava sem relatar
 * arco/asc normais quando raiz alterada). PRESERVADO na spec 16/05.
 */
export function jAortaNormaisComplementar(
  b7: number | null,
  b28: number | null,
  b29: number | null,
  sexo: Sexo,
  asc: number | null,
  idade: number | null,
  alturaCm: number | null
): string {
  if (!sexo) return '';
  const raiz = b7 ? tierRaizAo(b7, sexo, asc, idade, alturaCm) : null;
  if (!raiz || raiz.tier === 'normal') return '';

  const ascR = b28 ? tierAoAscendente(b28, sexo, asc, alturaCm) : null;
  const arco = b29 ? tierArcoAo(b29) : null;

  const normais: string[] = [];
  if (!ascR || ascR.tier === 'normal') normais.push('aorta ascendente');
  if (!arco || arco.tier === 'normal') normais.push('arco aórtico');

  if (normais.length === 2) return 'Aorta ascendente e arco aórtico com dimensões normais.';
  if (normais.length === 1) {
    return normais[0].charAt(0).toUpperCase() + normais[0].slice(1) + ' com dimensões normais.';
  }
  return '';
}
