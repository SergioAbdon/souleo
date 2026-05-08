// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Achados: Aorta
// ══════════════════════════════════════════════════════════════════
// Funções: j37 (raiz + combinações), j38 (ascendente), j39 (arco)
// Usa classificação por Z-score de calculos/aorta.ts
// ══════════════════════════════════════════════════════════════════

import type { Sexo } from '../types';
import {
  classificarRaizAo,
  classificarAoAscendente,
  classificarArcoAo,
  type ResultadoAorta,
} from '../calculos/aorta';

/**
 * Helper: monta texto de ectasia a partir do resultado de classificação.
 */
function textoEctasia(r: ResultadoAorta, segmentoTexto: string): string {
  if (r.grau === 'normal') return '';
  if (r.metodo === 'zscore' && r.previstoMM !== null && r.sdMM !== null) {
    return `Ectasia ${r.grau} ${segmentoTexto}, medindo ${r.medidaMM} mm (previsto ${r.previstoMM} ± ${r.sdMM} mm).`;
  }
  return `Ectasia ${r.grau} ${segmentoTexto}, medindo ${r.medidaMM} mm.`;
}

/**
 * j37 — Raiz aórtica + combinações de "todas/2/1 normais"
 *
 * Lógica:
 * - Se raiz alterada → texto da raiz (j38 e j39 cobrem ascendente/arco)
 * - Se raiz normal → monta lista combinada
 */
export function jAortaRaiz(
  b7: number | null,
  b28: number | null,
  b29: number | null,
  sexo: Sexo,
  asc: number | null,
  idade: number | null
): string {
  if (!sexo) return '';

  const raiz = b7 ? classificarRaizAo(b7, sexo, asc, idade) : null;
  const ascR = b28 ? classificarAoAscendente(b28, sexo, asc) : null;
  const arco = b29 ? classificarArcoAo(b29, sexo, asc) : null;

  // Se raiz alterada, retorna texto da raiz
  if (raiz && raiz.grau !== 'normal') {
    return textoEctasia(raiz, 'da raiz da aorta');
  }

  // Raiz normal — montar combinação dos normais
  const normais: string[] = [];
  if (!raiz || raiz.grau === 'normal') normais.push('Raiz aórtica');
  if (!ascR || ascR.grau === 'normal') normais.push('aorta ascendente');
  if (!arco || arco.grau === 'normal') normais.push('arco aórtico');

  if (normais.length === 3) {
    return 'Raiz aórtica, aorta ascendente e arco aórtico com dimensões normais.';
  }
  if (normais.length === 2) {
    const primeiro = normais[0].charAt(0).toUpperCase() + normais[0].slice(1);
    return `${primeiro} e ${normais[1]} com dimensões normais.`;
  }
  if (normais.length === 1) {
    const unico = normais[0].charAt(0).toUpperCase() + normais[0].slice(1);
    return `${unico} com dimensões normais.`;
  }
  return '';
}

/** j38 — Aorta ascendente */
export function jAortaAscendente(
  b28: number | null,
  sexo: Sexo,
  asc: number | null
): string {
  if (!sexo || !b28) return '';
  const r = classificarAoAscendente(b28, sexo, asc);
  return r.grau !== 'normal' ? textoEctasia(r, 'da aorta ascendente') : '';
}

/** j39 — Arco aórtico */
export function jArcoAortico(
  b29: number | null,
  sexo: Sexo,
  asc: number | null
): string {
  if (!sexo || !b29) return '';
  const r = classificarArcoAo(b29, sexo, asc);
  return r.grau !== 'normal' ? textoEctasia(r, 'do arco aórtico') : '';
}

/**
 * Quando raiz aórtica está alterada, jAortaRaiz só emite a frase da raiz.
 * Esta função complementa emitindo "Aorta ascendente / arco aórtico com
 * dimensões normais" quando esses segmentos estão normais.
 *
 * Bug corrigido 07/05/2026 — Dr. Sérgio (laudo ficava sem relatar
 * arco/asc normais quando raiz alterada).
 */
export function jAortaNormaisComplementar(
  b7: number | null,
  b28: number | null,
  b29: number | null,
  sexo: Sexo,
  asc: number | null,
  idade: number | null
): string {
  if (!sexo) return '';
  const raiz = b7 ? classificarRaizAo(b7, sexo, asc, idade) : null;
  // Só atua quando raiz alterada (caso normal, jAortaRaiz já cobriu)
  if (!raiz || raiz.grau === 'normal') return '';

  const ascR = b28 ? classificarAoAscendente(b28, sexo, asc) : null;
  const arco = b29 ? classificarArcoAo(b29, sexo, asc) : null;

  const normais: string[] = [];
  if (!ascR || ascR.grau === 'normal') normais.push('aorta ascendente');
  if (!arco || arco.grau === 'normal') normais.push('arco aórtico');

  if (normais.length === 2) return 'Aorta ascendente e arco aórtico com dimensões normais.';
  if (normais.length === 1) {
    return normais[0].charAt(0).toUpperCase() + normais[0].slice(1) + ' com dimensões normais.';
  }
  return '';
}
