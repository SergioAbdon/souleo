// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Achados: Massa e Geometria do VE
// ══════════════════════════════════════════════════════════════════
// Funções: j9 (espessura miocárdica), j10 (padrão geométrico)
// ══════════════════════════════════════════════════════════════════

import type { Sexo } from '../types';

/**
 * j9 — Espessura miocárdica VE pela massa absoluta
 * Cutoffs sexo-específicos (ASE 2015)
 */
export function jEspessuraMiocardica(massa: number | null, sexo: Sexo): string {
  if (!massa || !sexo) return '';

  if (sexo === 'M') {
    if (massa > 254) return 'Espessura miocárdica do ventrículo esquerdo aumentada em grau importante.';
    if (massa === 254) return 'Espessura miocárdica do ventrículo esquerdo em grau moderado a importante.';
    if (massa > 227) return 'Espessura miocárdica do ventrículo esquerdo aumentada em grau moderado.';
    if (massa === 227) return 'Espessura miocárdica do ventrículo esquerdo aumentada em grau leve a moderado.';
    if (massa > 200) return 'Espessura miocárdica do ventrículo esquerdo aumentada em grau leve.';
    return 'Espessura miocárdica do ventrículo esquerdo preservada.';
  }

  // Mulher
  if (massa > 193) return 'Espessura miocárdica do ventrículo esquerdo aumentada em grau importante.';
  if (massa === 193) return 'Espessura miocárdica do ventrículo esquerdo aumentada em grau moderado a importante.';
  if (massa > 171) return 'Espessura miocárdica do ventrículo esquerdo aumentada em grau moderado.';
  if (massa === 171) return 'Espessura miocárdica do ventrículo esquerdo aumentada em grau leve a moderado.';
  if (massa > 150) return 'Espessura miocárdica do ventrículo esquerdo aumentada em grau leve.';
  return 'Espessura miocárdica do ventrículo esquerdo preservada.';
}

/**
 * j10 — Padrão geométrico do VE (4 quadrantes ER × IMVE)
 * Cutoffs IMVE: M=102, F=88
 */
export function jPadraoGeometrico(
  er: number | null,
  imVE: number | null,
  sexo: Sexo
): string {
  if (er === null || imVE === null || !sexo) return '';
  const lim = sexo === 'M' ? 102 : 88;

  if (er > 0.42 && imVE <= lim)
    return 'Índice de massa preservado e espessura relativa aumentada compatível com remodelamento concêntrico do ventrículo esquerdo.';
  if (er <= 0.42 && imVE > lim)
    return 'Hipertrofia excêntrica do ventrículo esquerdo.';
  if (er <= 0.42 && imVE <= lim)
    return 'Índice de massa e espessura relativa do ventrículo esquerdo preservados.';
  if (er > 0.42 && imVE > lim)
    return 'Hipertrofia concêntrica do ventrículo esquerdo.';

  return '';
}
