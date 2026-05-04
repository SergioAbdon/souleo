// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Achados: Câmaras
// ══════════════════════════════════════════════════════════════════
// Funções: j2 (ritmo), j3-j8 (AE, AD, VE, VD, síntese)
//
// COMPORTAMENTO PRESERVADO 100% do motor original.
// Sintaxe modernizada (TypeScript), textos LITERAIS preservados.
// ══════════════════════════════════════════════════════════════════

import type { Sexo, Ritmo } from '../types';

/** j2 — Ritmo cardíaco */
export function jRitmo(ritmo: Ritmo): string {
  return ritmo === 'N' ? 'Ritmo cardíaco irregular.' : 'Ritmo cardíaco regular.';
}

/**
 * j3 — AE diâmetro M-mode (b8)
 * Silenciado quando volAEindex (b24) está preenchido.
 * Cutoffs sexo-específicos.
 */
export function jAE_diametro(b8: number | null, sexo: Sexo, b24: number | null): string {
  if (b24 !== null && b24 > 0) return '';
  if (!b8 || !sexo) return '';

  if (sexo === 'M') {
    if (b8 > 52) return 'Átrio esquerdo aumentado em grau importante.';
    if (b8 === 52) return 'Átrio esquerdo aumentado em grau moderado a importante.';
    if (b8 > 46) return 'Átrio esquerdo aumentado em grau moderado.';
    if (b8 === 46) return 'Átrio esquerdo aumentado em grau leve a moderado.';
    if (b8 > 40) return 'Átrio esquerdo aumentado em grau leve.';
  } else {
    if (b8 > 46) return 'Átrio esquerdo aumentado em grau importante.';
    if (b8 === 46) return 'Átrio esquerdo aumentado em grau moderado a importante.';
    if (b8 > 42) return 'Átrio esquerdo aumentado em grau moderado.';
    if (b8 === 42) return 'Átrio esquerdo aumentado em grau leve a moderado.';
    if (b8 > 38) return 'Átrio esquerdo aumentado em grau leve.';
  }
  return '';
}

/** j4 — AE pelo volume indexado (LAVI). Tem prioridade sobre j3. */
export function jAE_volume(b24: number | null): string {
  if (b24 === null || b24 <= 0) return '';
  if (b24 >= 48) return `Átrio esquerdo aumentado em grau importante. Volume index de ${b24} ml/m².`;
  if (b24 >= 42) return `Átrio esquerdo aumentado em grau moderado. Volume index de ${b24} ml/m².`;
  if (b24 > 34) return `Átrio esquerdo aumentado em grau leve. Volume index de ${b24} ml/m².`;
  return '';
}

/**
 * j5 — AD pelo volume indexado (RAVI)
 * ATUALIZADO: cutoffs JASE 2025 unificado por sexo
 * (decisão Dr. Sérgio em 2026-05-03)
 */
export function jAD_volume(b25: number | null): string {
  if (b25 === null || b25 === 0) return '';
  // JASE 2025 Method of Disks (unificado):
  // <30 normal | 30-36 leve | >36-41 moderado | >41 importante
  if (b25 < 30) return '';
  if (b25 <= 36) return 'Átrio direito aumentado em grau leve.';
  if (b25 <= 41) return 'Átrio direito aumentado em grau moderado.';
  return 'Átrio direito aumentado em grau importante.';
}

/** j6 — DDVE (b9). Cutoffs sexo-específicos. */
export function jVE_diametro(b9: number | null, sexo: Sexo): string {
  if (!b9 || !sexo) return '';

  if (sexo === 'M') {
    if (b9 > 68) return 'Ventrículo esquerdo aumentado em grau importante.';
    if (b9 === 68) return 'Ventrículo esquerdo aumentado em grau moderado a importante.';
    if (b9 > 63) return 'Ventrículo esquerdo aumentado em grau moderado.';
    if (b9 === 63) return 'Ventrículo esquerdo aumentado em grau leve a moderado.';
    if (b9 > 58) return 'Ventrículo esquerdo aumentado em grau leve.';
  } else {
    if (b9 > 61) return 'Ventrículo esquerdo aumentado em grau importante.';
    if (b9 === 61) return 'Ventrículo esquerdo aumentado em grau moderado a importante.';
    if (b9 > 56) return 'Ventrículo esquerdo aumentado em grau moderado.';
    if (b9 === 56) return 'Ventrículo esquerdo aumentado em grau leve a moderado.';
    if (b9 > 52) return 'Ventrículo esquerdo aumentado em grau leve.';
  }
  return '';
}

/** j7 — VD diâmetro (b13). Unificado por sexo. */
export function jVD_diametro(b13: number | null): string {
  if (b13 === null) return '';
  if (b13 > 50) return 'Ventrículo direito aumentado em grau importante.';
  if (b13 === 50) return 'Ventrículo direito aumentado em grau moderado a importante.';
  if (b13 > 42) return 'Ventrículo direito aumentado em grau moderado.';
  if (b13 === 42) return 'Ventrículo direito aumentado em grau leve a moderado.';
  if (b13 > 35) return 'Ventrículo direito aumentado em grau leve.';
  return '';
}

/**
 * j8 — Síntese de câmaras normais
 * Cada câmara: alterada se medida e fora do normal, normal se medida ok ou se não medida.
 *
 * ATUALIZADO: AD usa cutoff JASE 2025 unificado (≥30 = alterada)
 */
export function jCamarasNormais(
  b8: number | null,
  b9: number | null,
  b13: number | null,
  b24: number | null,
  b25: number | null,
  sexo: Sexo
): string {
  // AE: prioridade pra volume; senão diâmetro
  const aeA = (b24 !== null && b24 > 0)
    ? b24 > 34
    : (b8 ? (sexo === 'M' ? b8 > 40 : b8 > 38) : false);
  const veA = b9 ? (sexo === 'M' ? b9 > 58 : b9 > 52) : false;
  const vdA = b13 ? b13 > 35 : false;
  // AD: JASE 2025 unificado (>=30 alterado)
  const adA = b25 ? b25 >= 30 : false;

  const alteradas = [aeA, veA, vdA, adA];
  const totalAlteradas = alteradas.filter(Boolean).length;

  if (totalAlteradas === 0) return 'Câmaras cardíacas com dimensões normais.';

  const nomes: string[] = [];
  if (!aeA) nomes.push('Átrio esquerdo');
  if (!adA) nomes.push('Átrio direito');
  if (!veA) nomes.push('Ventrículo esquerdo');
  if (!vdA) nomes.push('Ventrículo direito');

  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0] + ' com dimensões normais.';
  return 'Demais câmaras cardíacas com dimensões normais.';
}
