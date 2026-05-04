// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Cálculos de Estenoses Valvares
// ══════════════════════════════════════════════════════════════════
// Referência principal: Baumgartner H, Hung J et al.
// "Echocardiographic Assessment of Valve Stenosis: ASE/EACVI Update"
// JASE 2017; 30: 372-392
// ══════════════════════════════════════════════════════════════════

import type { GrauEstenose } from '../types';

/**
 * Classificação de Estenose Mitral
 *
 * Prioridade 1: Gradiente médio (ASE 2017)
 * - >10 mmHg → importante
 * - ≥5 mmHg → moderada
 * - >0 mmHg → leve
 *
 * Prioridade 2 (se gradiente médio vazio): Área PHT
 * - <1,0 cm² → importante
 * - <1,5 cm² → moderada
 * - ≤2,0 cm² → leve
 *
 * @param gradMedio Gradiente médio mitral em mmHg (b46)
 * @param areaPHT Área mitral em cm² (b47)
 */
export function classificarEstenoseMitral(
  gradMedio: number | null,
  areaPHT: number | null
): GrauEstenose {
  // Prioridade 1: gradiente médio
  if (gradMedio !== null && gradMedio > 0) {
    if (gradMedio > 10) return 'importante';
    if (gradMedio >= 5) return 'moderada';
    return 'leve';
  }
  // Prioridade 2: área PHT
  if (areaPHT !== null && areaPHT > 0) {
    if (areaPHT < 1.0) return 'importante';
    if (areaPHT < 1.5) return 'moderada';
    if (areaPHT <= 2.0) return 'leve';
  }
  return '';
}

/**
 * Classificação de Estenose Aórtica
 *
 * Prioridade 1: Gradiente máximo (ASE 2017)
 * - ≥64 mmHg → importante
 * - ≥36 mmHg → moderada
 * - ≥27 mmHg → leve
 * - ≥16 mmHg → esclerose (sem conclusão emitida — decisão Dr. Sérgio)
 *
 * Prioridade 2: Gradiente médio
 * - >40 mmHg → importante
 * - ≥20 mmHg → moderada
 * - >0 mmHg → leve
 *
 * Prioridade 3: Área (sem cutoff de leve — decisão preservada)
 * - <1,0 cm² → importante
 * - <1,5 cm² → moderada
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
  // Prioridade 1: gradiente máximo
  if (gradMax !== null && gradMax > 0) {
    if (gradMax >= 64) return 'importante';
    if (gradMax >= 36) return 'moderada';
    if (gradMax >= 27) return 'leve';
    if (gradMax >= 16) return 'esclerose';
    return '';
  }
  // Prioridade 2: gradiente médio
  if (gradMedio !== null && gradMedio > 0) {
    if (gradMedio > 40) return 'importante';
    if (gradMedio >= 20) return 'moderada';
    return 'leve';
  }
  // Prioridade 3: área (sem leve — preservado conforme decisão)
  if (area !== null && area > 0) {
    if (area < 1.0) return 'importante';
    if (area < 1.5) return 'moderada';
  }
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
