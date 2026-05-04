// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Cálculos Ventriculares
// ══════════════════════════════════════════════════════════════════
// Fórmulas:
// - VDF/VSF/FE Teichholz: AJC 1976; 37: 7-11
// - Massa VE: Devereux AJC 1986; 57: 450-458
// - Espessura Relativa: variante Reichek (SIV+PP)/DDVE — ASE 2015 aceita
// ══════════════════════════════════════════════════════════════════

import { truncar } from '../helpers/truncate';

/**
 * Volume Diastólico Final do VE (Teichholz)
 * Referência: Teichholz LE et al. AJC 1976; 37: 7-11
 *
 * Fórmula: V = 7·D³ / (2,4 + D), onde D em cm e V em ml
 *
 * IMPORTANTE: Input em mm, conversão interna /10 para cm.
 * Validade: apenas em VE com geometria preservada (sem alteração contrátil segmentar).
 *
 * @param ddve DDVE em mm (b9)
 * @returns Volume Diastólico Final em ml (truncado 1 casa) ou null
 *
 * @example
 * calcVDF(50) // 118.2
 */
export function calcVDF(ddve: number | null): number | null {
  if (ddve === null || ddve <= 0) return null;
  const dCm = ddve / 10;
  const vdf = (Math.pow(dCm, 3) * 7) / (2.4 + dCm);
  return truncar(vdf, 1);
}

/**
 * Volume Sistólico Final do VE (Teichholz)
 * Mesma fórmula que VDF, aplicada ao DSVE.
 *
 * @param dsve DSVE em mm (b12)
 * @returns Volume Sistólico Final em ml ou null
 *
 * @example
 * calcVSF(30) // 35.0
 */
export function calcVSF(dsve: number | null): number | null {
  if (dsve === null || dsve <= 0) return null;
  const dCm = dsve / 10;
  const vsf = (Math.pow(dCm, 3) * 7) / (2.4 + dCm);
  return truncar(vsf, 1);
}

/**
 * Fração de Ejeção pelo Teichholz
 * Referência: Teichholz et al. 1976
 *
 * Fórmula: FE = (VDF − VSF) / VDF
 * Retorno: decimal entre 0 e 1 (ex: 0.65 = 65%)
 *
 * IMPORTANTE: Em VE com alteração contrátil segmentar, Simpson é preferencial (b54).
 * No fluxo do motor, b54 (Simpson) prevalece sobre o cálculo Teichholz.
 *
 * @param ddve DDVE em mm
 * @param dsve DSVE em mm
 * @returns FE como decimal (0-1) ou null
 *
 * @example
 * calcFE_Teichholz(50, 30) // 0.70 (= 70%)
 */
export function calcFE_Teichholz(ddve: number | null, dsve: number | null): number | null {
  const vdf = calcVDF(ddve);
  const vsf = calcVSF(dsve);
  if (vdf === null || vsf === null || vdf <= 0) return null;
  const fe = (vdf - vsf) / vdf;
  return truncar(fe, 4); // mais precisão pro decimal
}

/**
 * Fração de Encurtamento (Shortening Fraction, FS)
 * Referência: Feigenbaum, década de 1970
 *
 * Fórmula: FS = (DDVE − DSVE) / DDVE
 * Retorno: decimal (ex: 0.4 = 40%)
 *
 * Cutoffs (ASE 2015): 30-40% normal
 *
 * @param ddve DDVE em mm
 * @param dsve DSVE em mm
 * @returns FS como decimal (0-1) ou null
 *
 * @example
 * calcFS(50, 30) // 0.40 (= 40%)
 */
export function calcFS(ddve: number | null, dsve: number | null): number | null {
  if (ddve === null || dsve === null) return null;
  if (ddve <= 0) return null;
  const fs = (ddve - dsve) / ddve;
  return truncar(fs, 4);
}

/**
 * Massa do Ventrículo Esquerdo (Devereux modificada)
 * Referência: Devereux RB et al. AJC 1986; 57: 450-458
 *
 * Fórmula:
 *   LVM (g) = 0,8 × {1,04 × [(DDVE + SIV + PP)³ − DDVE³]} + 0,6
 *
 * Constantes:
 * - 1,04 g/cm³: densidade do miocárdio
 * - 0,8: fator de correção (regressão vs necropsia)
 * - 0,6 g: termo aditivo da regressão
 *
 * IMPORTANTE: Input em mm, divisão por 1000 ao final converte mm³ → cm³.
 *
 * @param ddve DDVE em mm (b9)
 * @param siv Septo IV em mm (b10)
 * @param pp Parede Posterior em mm (b11)
 * @returns Massa do VE em gramas (truncada 1 casa) ou null
 *
 * @example
 * calcMassaVE(50, 10, 9) // 169.3
 */
export function calcMassaVE(
  ddve: number | null,
  siv: number | null,
  pp: number | null
): number | null {
  if (ddve === null || siv === null || pp === null) return null;
  if (ddve <= 0 || siv <= 0 || pp <= 0) return null;
  // (DDVE + SIV + PP)³ - DDVE³, em mm
  const total = ddve + siv + pp;
  const volMiocardio = Math.pow(total, 3) - Math.pow(ddve, 3);
  // Aplica fórmula Devereux + conversão mm³ → cm³ (/1000) → g
  const massa = (volMiocardio * 1.04 * 0.8 + 0.6) / 1000;
  return truncar(massa, 1);
}

/**
 * Índice de Massa do VE (massa indexada à ASC)
 * Referência: ASE 2015 (Lang et al.)
 *
 * Fórmula: IMVE = Massa / ASC
 *
 * Cutoffs:
 * - Homem: ≤102 g/m² normal
 * - Mulher: ≤88 g/m² normal
 *
 * @param massa Massa do VE em gramas
 * @param asc ASC em m²
 * @returns IMVE em g/m² ou null
 *
 * @example
 * calcIMVE(169.3, 1.61) // 105.1
 */
export function calcIMVE(massa: number | null, asc: number | null): number | null {
  if (massa === null || asc === null) return null;
  if (asc <= 0) return null;
  return truncar(massa / asc, 1);
}

/**
 * Espessura Relativa (Relative Wall Thickness — RWT)
 * Variante Reichek 1981 (ASE 2015 aceita: aceita tanto 2·PP/DDVE quanto SIV+PP/DDVE)
 *
 * Fórmula utilizada: ER = (SIV + PP) / DDVE
 *
 * Vantagem desta variante: mais sensível em hipertrofia septal assimétrica (CMH).
 *
 * Cutoff (ASE 2015): >0,42 = aumentada
 *
 * @param ddve DDVE em mm
 * @param siv Septo IV em mm
 * @param pp Parede Posterior em mm
 * @returns ER como razão (truncada 2 casas) ou null
 *
 * @example
 * calcRWT(50, 10, 9) // 0.38
 */
export function calcRWT(
  ddve: number | null,
  siv: number | null,
  pp: number | null
): number | null {
  if (ddve === null || siv === null || pp === null) return null;
  if (ddve <= 0) return null;
  const rwt = (siv + pp) / ddve;
  return truncar(rwt, 2);
}

/**
 * Relação Aorta / Átrio Esquerdo
 * Referência: Brown OR et al. AJC 1974; 33: 192-195
 *
 * Fórmula: Ao/AE = b7 / b8
 *
 * @param raizAo Raiz aórtica em mm (b7)
 * @param ae Átrio esquerdo em mm (b8)
 * @returns Razão (truncada 2 casas) ou null
 *
 * @example
 * calcAoAE(30, 30) // 1.00
 */
export function calcAoAE(raizAo: number | null, ae: number | null): number | null {
  if (raizAo === null || ae === null) return null;
  if (ae <= 0) return null;
  return truncar(raizAo / ae, 2);
}

/**
 * Área Aórtica Indexada (cm² / m²)
 * Útil pra classificar estenose aórtica em pacientes pequenos/grandes.
 *
 * Fórmula: AAi = Área aórtica / ASC
 *
 * Cutoff: <0,6 cm²/m² = estenose importante
 *
 * @param areaAo Área aórtica em cm² (b52)
 * @param asc ASC em m²
 * @returns Área indexada ou null
 */
export function calcAreaAoIndexada(
  areaAo: number | null,
  asc: number | null
): number | null {
  if (areaAo === null || asc === null) return null;
  if (asc <= 0) return null;
  return truncar(areaAo / asc, 2);
}
