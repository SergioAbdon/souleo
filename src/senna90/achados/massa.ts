// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Achados: Massa e Geometria do VE
// ══════════════════════════════════════════════════════════════════
// Funções: j9 (espessura miocárdica), j10 (padrão geométrico)
// ══════════════════════════════════════════════════════════════════

import type { Sexo } from '../types';

/**
 * j9 — Massa do VE (absoluta, em gramas)
 *
 * CORREÇÃO 07/05/2026 — Dr. Sérgio:
 * "VC ESTA ANALIZANDO A MASSA MAS NOS COMENTARIOS ESTA FALANDO EM ESPESSURA,
 *  E PARA ANALIZAR E COMENTAR A MASSA NOS COMENTARIOS"
 *
 * Antes: input = massa (correto), texto = "Espessura miocárdica" (errado).
 * Agora: input = massa, texto = "Massa do ventrículo esquerdo" (alinhado).
 *
 * Cutoffs ASE 2015 Chamber Quantification (Lang et al.) — LV mass absoluta:
 *   Homem:  normal ≤200 / leve 201–227 / moderado 228–254 / importante ≥255 g
 *   Mulher: normal ≤150 / leve 151–171 / moderado 172–193 / importante ≥194 g
 */
export function jEspessuraMiocardica(massa: number | null, sexo: Sexo): string {
  if (!massa || !sexo) return '';

  if (sexo === 'M') {
    if (massa > 254) return 'Massa do ventrículo esquerdo aumentada em grau importante.';
    if (massa === 254) return 'Massa do ventrículo esquerdo em grau moderado a importante.';
    if (massa > 227) return 'Massa do ventrículo esquerdo aumentada em grau moderado.';
    if (massa === 227) return 'Massa do ventrículo esquerdo aumentada em grau leve a moderado.';
    if (massa > 200) return 'Massa do ventrículo esquerdo aumentada em grau leve.';
    return 'Massa do ventrículo esquerdo preservada.';
  }

  // Mulher
  if (massa > 193) return 'Massa do ventrículo esquerdo aumentada em grau importante.';
  if (massa === 193) return 'Massa do ventrículo esquerdo aumentada em grau moderado a importante.';
  if (massa > 171) return 'Massa do ventrículo esquerdo aumentada em grau moderado.';
  if (massa === 171) return 'Massa do ventrículo esquerdo aumentada em grau leve a moderado.';
  if (massa > 150) return 'Massa do ventrículo esquerdo aumentada em grau leve.';
  return 'Massa do ventrículo esquerdo preservada.';
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
