// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Cálculos de Estenoses Valvares
// ══════════════════════════════════════════════════════════════════
// Referência principal: Baumgartner H, Hung J et al.
// "Echocardiographic Assessment of Valve Stenosis: ASE/EACVI Update"
// JASE 2017; 30: 372-392
// ══════════════════════════════════════════════════════════════════

import type { GrauEstenose } from '../types';

/**
 * Classificação de Estenose Mitral (Senna93 F1-T7 — spec §2.5/B2)
 *
 * Prioridade 1: ÁREA (critério primário — ASE 2017)
 * - <1,0 cm² → importante
 * - <1,5 cm² → moderada
 * - 1,5–2,0 cm² → leve SÓ com gradiente médio ≥5 mmHg (B19); senão, silêncio
 * - >2,0 cm² → silêncio
 *
 * Prioridade 2 (se área vazia): Gradiente médio
 * - >10 mmHg → importante
 * - ≥5 mmHg → moderada
 * - >0 mmHg → leve
 *
 * @param gradMedio Gradiente médio mitral em mmHg (b46)
 * @param areaPHT Área mitral em cm² (b47)
 */
export function classificarEstenoseMitral(
  gradMedio: number | null,
  areaPHT: number | null
): GrauEstenose {
  // Prioridade 1 (spec §2.5/B2): ÁREA é o critério primário.
  if (areaPHT !== null && areaPHT > 0) {
    if (areaPHT < 1.0) return 'importante';
    if (areaPHT < 1.5) return 'moderada';
    // 1,5–2,0: só fecha "leve" com suporte do gradiente (B19).
    if (areaPHT <= 2.0) return gradMedio !== null && gradMedio >= 5 ? 'leve' : '';
    return '';
  }
  // Sem área: gradiente médio decide (comportamento anterior preservado).
  if (gradMedio !== null && gradMedio > 0) {
    if (gradMedio > 10) return 'importante';
    if (gradMedio >= 5) return 'moderada';
    return 'leve';
  }
  return '';
}

/**
 * Classificação de Estenose Aórtica (Senna93 F1-T7 — spec §2.5)
 *
 * PIOR grau entre os critérios disponíveis (não mais precedência absoluta do
 * gradiente máximo): mata o low-flow-low-gradient saindo "leve".
 *
 * Gradiente máximo (ASE 2017):
 * - ≥64 mmHg → importante · ≥36 → moderada · ≥27 → leve
 * - ≥16 mmHg → esclerose (só vale se for o único critério; sem conclusão — decisão Dr. Sérgio)
 *
 * Gradiente médio: >40 → importante · ≥20 → moderada · >0 → leve
 * Área (sem cutoff de leve — decisão preservada): <1,0 → importante · <1,5 → moderada
 *
 * @param gradMax Gradiente máximo aórtico em mmHg (b50)
 * @param gradMedio Gradiente médio aórtico em mmHg (b51)
 * @param area Área aórtica em cm² (b52)
 */
export function classificarEstenoseAortica(
  gradMax: number | null,
  gradMedio: number | null,
  area: number | null
): GrauEstenose {
  const graus: GrauEstenose[] = [];
  if (gradMax !== null && gradMax > 0) {
    if (gradMax >= 64) graus.push('importante');
    else if (gradMax >= 36) graus.push('moderada');
    else if (gradMax >= 27) graus.push('leve');
    else if (gradMax >= 16) graus.push('esclerose');
  }
  if (gradMedio !== null && gradMedio > 0) {
    if (gradMedio > 40) graus.push('importante');
    else if (gradMedio >= 20) graus.push('moderada');
    else graus.push('leve');
  }
  if (area !== null && area > 0) {
    if (area < 1.0) graus.push('importante');
    else if (area < 1.5) graus.push('moderada');
  }
  if (graus.includes('importante')) return 'importante';
  if (graus.includes('moderada')) return 'moderada';
  if (graus.includes('leve')) return 'leve';
  if (graus.includes('esclerose')) return 'esclerose';
  return '';
}

/**
 * Classificação de Estenose Tricúspide
 *
 * Pega o pior grau entre os 2 critérios.
 * COMPORTAMENTO PRESERVADO: sem grau "leve" (decisão Dr. Sérgio).
 *
 * Por gradiente médio:
 * - >7 mmHg → importante
 * - ≥5 mmHg → moderada
 *
 * Por área:
 * - <1,0 cm² → importante
 * - ≤1,5 cm² → moderada
 *
 * @param gradMedio Gradiente médio tricúspide em mmHg (b46t)
 * @param area Área tricúspide em cm² (b47t)
 */
export function classificarEstenoseTricuspide(
  gradMedio: number | null,
  area: number | null
): GrauEstenose {
  let grauGrad: GrauEstenose = '';
  if (gradMedio !== null && gradMedio > 0) {
    if (gradMedio > 7) grauGrad = 'importante';
    else if (gradMedio >= 5) grauGrad = 'moderada';
  }
  let grauArea: GrauEstenose = '';
  if (area !== null && area > 0) {
    if (area < 1.0) grauArea = 'importante';
    else if (area <= 1.5) grauArea = 'moderada';
  }
  // Pega o pior grau
  if (grauGrad === 'importante' || grauArea === 'importante') return 'importante';
  if (grauGrad === 'moderada' || grauArea === 'moderada') return 'moderada';
  return '';
}

/**
 * Classificação de Estenose Pulmonar
 *
 * ATUALIZADO: ASE 2017 valvular (anteriormente usava critério adult-congenital).
 * Decisão Dr. Sérgio em 2026-05-03: migrar para ASE 2017.
 *
 * Por gradiente máximo (b50p):
 * - >64 mmHg → importante (severa)
 * - 36-64 mmHg → moderada
 * - <36 mmHg → leve
 *
 * @param gradMax Gradiente máximo pulmonar em mmHg (b50p)
 */
export function classificarEstenosePulmonar(
  gradMax: number | null
): GrauEstenose {
  if (gradMax === null || gradMax <= 0) return '';
  if (gradMax > 64) return 'importante';
  if (gradMax >= 36) return 'moderada';
  return 'leve';
}
