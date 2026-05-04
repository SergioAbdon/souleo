// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Achados: Função Sistólica VE
// ══════════════════════════════════════════════════════════════════
// Funções: j11 (FE Teichholz), j12 (FE Simpson)
// PRIORIDADE: Simpson (b54) prevalece sobre Teichholz quando preenchido
// ══════════════════════════════════════════════════════════════════

import type { Sexo } from '../types';

/**
 * j11 — FE pelo Teichholz
 * Cutoffs por sexo:
 * - M: >0.52 preservada / =0.52 limítrofe / <0.52 leve / =0.40 leve-mod / <0.40 moderada / =0.30 mod-imp / <0.30 importante
 * - F: >0.54 / =0.54 / <0.54 / etc.
 */
export function jFE_Teichholz(feT: number | null, sexo: Sexo): string {
  if (!sexo || feT === null) return '';
  const fe = feT;

  if (sexo === 'M') {
    if (fe > 0.52) return 'Função sistólica do ventrículo esquerdo preservada e sem alteração contrátil segmentar.';
    if (fe === 0.52) return 'Função sistólica do ventrículo esquerdo preservada, porém no limite inferior da normalidade.';
    if (fe < 0.30) return 'Disfunção sistólica do ventrículo esquerdo em grau importante.';
    if (fe === 0.30) return 'Disfunção sistólica do ventrículo esquerdo em grau moderado a importante.';
    if (fe < 0.40) return 'Disfunção sistólica do ventrículo esquerdo em grau moderado.';
    if (fe === 0.40) return 'Disfunção sistólica do ventrículo esquerdo em grau leve a moderado.';
    if (fe < 0.52) return 'Disfunção sistólica do ventrículo esquerdo em grau leve.';
  } else {
    if (fe > 0.54) return 'Função sistólica do ventrículo esquerdo preservada e sem alteração contrátil segmentar.';
    if (fe === 0.54) return 'Função sistólica do ventrículo esquerdo preservada, porém no limite inferior da normalidade.';
    if (fe < 0.30) return 'Disfunção sistólica do ventrículo esquerdo em grau importante.';
    if (fe === 0.30) return 'Disfunção sistólica do ventrículo esquerdo em grau moderado a importante.';
    if (fe < 0.40) return 'Disfunção sistólica do ventrículo esquerdo em grau moderado.';
    if (fe === 0.40) return 'Disfunção sistólica do ventrículo esquerdo em grau leve a moderado.';
    if (fe < 0.54) return 'Disfunção sistólica do ventrículo esquerdo em grau leve.';
  }
  return '';
}

/**
 * j12 — FE Simpson (b54, em %)
 * Texto sempre termina com " Fração de ejeção de X% (Simpson)."
 *
 * Comportamento especial: FE preservada (≥lim) menciona "apesar da alteração contrátil segmentar".
 * Esta frase é assumida — em pacientes com Simpson preservado o motor acredita que paredes podem estar alteradas.
 */
export function jFE_Simpson(b54: number | null, sexo: Sexo): string {
  if (!sexo || b54 === null) return '';
  const fe = b54;
  const lim = sexo === 'M' ? 52 : 54;

  if (fe >= lim)
    return `Função sistólica do ventrículo esquerdo preservada, apesar da alteração contrátil segmentar. Fração de ejeção de ${fe}% (Simpson).`;
  if (fe < 30)
    return `Disfunção sistólica do ventrículo esquerdo em grau importante. Fração de ejeção de ${fe}% (Simpson).`;
  if (fe === 30)
    return `Disfunção sistólica do ventrículo esquerdo em grau moderado a importante. Fração de ejeção de ${fe}% (Simpson).`;
  if (fe < 40)
    return `Disfunção sistólica do ventrículo esquerdo em grau moderado. Fração de ejeção de ${fe}% (Simpson).`;
  if (fe === 40)
    return `Disfunção sistólica do ventrículo esquerdo em grau leve a moderado. Fração de ejeção de ${fe}% (Simpson).`;
  return `Disfunção sistólica do ventrículo esquerdo em grau leve. Fração de ejeção de ${fe}% (Simpson).`;
}
