// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Cutoffs por Grau
// ══════════════════════════════════════════════════════════════════
// Constantes centralizadas de todos os cutoffs de gravidade
// usados pelo motor para classificar achados.
//
// Referências adotadas (decisões Dr. Sérgio):
// - JASE 2015: Chamber Quantification
// - JASE 2016: Diastolic Function
// - JASE 2017: Valve Stenosis
// - EACVI/ASE 2024: Speckle Tracking
// - JASE 2025: Right Heart (RAVI unificado)
// ══════════════════════════════════════════════════════════════════

import type { Sexo } from '../types';

// ══ CÂMARAS — DIÂMETROS (mm) ════════════════════════════════════

/**
 * Cutoffs de Átrio Esquerdo (diâmetro M-mode)
 * Referência: ASE 2015 Chamber Quantification
 *
 * Estrutura: [normal_max, leveMod_eq, moderado_max, modImp_eq, importante_min]
 */
export const AE_DIAMETRO = {
  M: [40, 46, 46, 52, 52],   // Homem
  F: [38, 42, 42, 46, 46],   // Mulher
} as const;

/**
 * Cutoffs de DDVE (Diâmetro Diastólico do VE)
 * Referência: ASE 2015
 */
export const DDVE = {
  M: [58, 63, 63, 68, 68],
  F: [52, 56, 56, 61, 61],
} as const;

/**
 * Cutoffs de Ventrículo Direito (basal)
 * Unificado por sexo. Referência: ASE 2015.
 */
export const VD_DIAMETRO = [35, 42, 42, 50, 50] as const;

// ══ ATRIAIS POR VOLUME INDEXADO ═════════════════════════════════

/**
 * LAVI — Left Atrial Volume Index (b24)
 * Referência: ASE 2015 Chamber Quantification (unificado por sexo)
 *
 * - ≤34 ml/m² normal
 * - 35-41 leve
 * - 42-48 moderado
 * - >48 importante
 */
export const LAVI = {
  normal_max: 34,
  leve_max: 41,
  moderada_max: 48,
} as const;

/**
 * RAVI — Right Atrial Volume Index (b25)
 * Referência: JASE 2025 Right Heart Guidelines (Método dos Discos)
 * UNIFICADO POR SEXO (decisão Dr. Sérgio em 2026-05-03).
 *
 * - <30 ml/m² normal
 * - 30-36 leve
 * - >36-41 moderado
 * - >41 importante
 */
export const RAVI = {
  normal_max: 30,        // <30
  leve_max: 36,          // 30-36
  moderada_max: 41,      // >36-41
} as const;

// ══ MASSA E GEOMETRIA VE ════════════════════════════════════════

/**
 * Massa absoluta do VE (g)
 * Referência: ASE 2015 Tabela 8
 *
 * Estrutura: [normal_max, leveMod_eq, moderada_max, modImp_eq, importante_min]
 */
export const MASSA_VE = {
  M: [200, 227, 227, 254, 254],
  F: [150, 171, 171, 193, 193],
} as const;

/**
 * Índice de Massa do VE (g/m²)
 * Referência: ASE 2015
 *
 * - Homem: ≤102 g/m² normal
 * - Mulher: ≤88 g/m² normal
 */
export const IMVE_NORMAL_MAX = {
  M: 102,
  F: 88,
} as const;

/**
 * Espessura Relativa (RWT)
 * Referência: ASE 2015 Figura 6
 *
 * - >0,42 = aumentada (remodelamento ou hipertrofia concêntrica)
 */
export const ER_NORMAL_MAX = 0.42;

// ══ FUNÇÃO SISTÓLICA ════════════════════════════════════════════

/**
 * FE Teichholz (decimal 0-1)
 * Referência: ASE 2015
 */
export const FE_TEICHHOLZ = {
  M: 0.52,  // ≥0.52 preservada
  F: 0.54,  // ≥0.54 preservada
  // Cutoffs de gravidade (≤): leveMod=0.40, modImp=0.30
} as const;

/**
 * FE Simpson (%)
 * Referência: ASE 2015
 */
export const FE_SIMPSON = {
  M: 52,    // ≥52% preservada
  F: 54,    // ≥54% preservada
  // Cutoffs de gravidade (≤): leveMod=40, modImp=30
} as const;

/**
 * Limites comuns de gravidade FE (Teichholz e Simpson)
 */
export const FE_GRAVIDADE = {
  leveMod_T: 0.40,
  modImp_T: 0.30,
  leveMod_S: 40,
  modImp_S: 30,
} as const;

// ══ STRAIN (Speckle Tracking) ═══════════════════════════════════

/**
 * GLS VE — Global Longitudinal Strain VE
 * Referência: EACVI/ASE 2024 (atualizado de -18% para -20%)
 * DECISÃO: Dr. Sérgio em 2026-05-03 — migrar para -20%
 *
 * VR ≥ |20%| = preservado
 */
export const GLS_VE_NORMAL = -20;

/**
 * GLS VD — Global Longitudinal Strain VD
 * Referência: EACVI/ASE 2024
 *
 * VR ≥ |20%| = preservado
 */
export const GLS_VD_NORMAL = -20;

/**
 * LARS — Left Atrial Reservoir Strain
 * Referência: Singh A et al. JACC Img 2017; 10: 735-743
 *
 * VR ≥ 18% = preservado
 */
export const LARS_NORMAL = 18;

// ══ DIASTOLOGIA ═════════════════════════════════════════════════

/**
 * E/e' septal — cutoff isolado (não média septal+lateral)
 * Referência: ASE 2016 (Nagueh et al.)
 * DECISÃO: Dr. Sérgio em 2026-05-03 — usar >15 consistente em FA e sinusal
 *
 * - ≤15 normal
 * - >15 elevado (sugestivo de pressão de enchimento elevada)
 */
export const E_E_SEPTAL_CUTOFF = 15;

/**
 * e' septal — onda E' tecidual septal
 * Referência: ASE 2016
 *
 * - ≥7 cm/s normal
 * - <7 cm/s anormal
 */
export const E_SEPTAL_CUTOFF = 7;

/**
 * Velocidade do refluxo tricuspídeo
 * Referência: ESC/ERS 2022 Pulmonary Hypertension
 */
export const VEL_IT = {
  alta_HP: 3.4,        // >3.4 m/s = alta probabilidade HP
  intermediaria: 2.9,  // 2.9-3.4 m/s = intermediária
} as const;

/**
 * PSAP normal
 */
export const PSAP_NORMAL_MAX = 36; // mmHg

// ══ HIPERTROFIA — REGRA DE GRAVIDADE NA MASSA ═══════════════════

/**
 * Cutoffs de gravidade da massa do VE
 * Estrutura igual MASSA_VE: [normal, leveMod, moderada, modImp, importante]
 */
export function obterCutoffMassa(sexo: Sexo): readonly number[] {
  return sexo === 'F' ? MASSA_VE.F : MASSA_VE.M;
}

export function obterCutoffDDVE(sexo: Sexo): readonly number[] {
  return sexo === 'F' ? DDVE.F : DDVE.M;
}

export function obterCutoffAE(sexo: Sexo): readonly number[] {
  return sexo === 'F' ? AE_DIAMETRO.F : AE_DIAMETRO.M;
}

export function obterIMVE_NormalMax(sexo: Sexo): number {
  return sexo === 'F' ? IMVE_NORMAL_MAX.F : IMVE_NORMAL_MAX.M;
}

export function obterFE_Teichholz_NormalMin(sexo: Sexo): number {
  return sexo === 'F' ? FE_TEICHHOLZ.F : FE_TEICHHOLZ.M;
}

export function obterFE_Simpson_NormalMin(sexo: Sexo): number {
  return sexo === 'F' ? FE_SIMPSON.F : FE_SIMPSON.M;
}
