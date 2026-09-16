// ══════════════════════════════════════════════════════════════════
// LEO Senna93 — Coluna "VR" da tabela de parâmetros do laudo
// ══════════════════════════════════════════════════════════════════
// Reescrito na F2 (spec §2.7 / plano F2-T2). A string aqui é a
// referência IMPRESSA no laudo assinado; o realce vermelho é o
// isOOR.ts — os dois têm que contar a MESMA história (teste de
// coerência em tests/unit/senna93-refval-pins.test.mjs).
//
// Regra C8: sexo vazio → '' em TODAS as 19 linhas (o alerta
// SEXO_AUSENTE é quem explica a tabela sem referências). O guard vem
// ANTES de tetoRaiz(), que sem sexo devolveria a régua masculina.
//
// Origem de cada string:
// • legado-verbatim (motorv8mp4.js:1075-1080 e :1197-1207) — travessão
//   "–" (en dash) nos intervalos, exatamente como sai hoje na tela;
// • corrigida-V13 — b7 (WASE dinâmico), b28/b29 (réguas da aorta F1),
//   feT (A9) e imVE (V2), que no legado imprimiam corte defasado.
// ══════════════════════════════════════════════════════════════════

import type { Sexo } from '../types';
import { tetoRaiz, type CampoTabela } from './isOOR';

/** Pares (♂, ♀) — string idêntica nos dois sexos aparece repetida. */
const VR: Record<Exclude<CampoTabela, 'b7'>, readonly [string, string]> = {
  // ── coluna esquerda (medidas cruas, mm) ──
  b8:  ['30–40 mm', '27–38 mm'],
  b9:  ['42–58 mm', '38–52 mm'],
  b10: ['6–10 mm', '6–9 mm'],
  b11: ['6–10 mm', '6–9 mm'],
  b12: ['25–40 mm', '21–35 mm'],
  b13: ['21–35 mm', '21–35 mm'],
  b28: ['≤ 38 mm', '≤ 35 mm'],      // V13: ASE Chamber Tab.14 (era 30–37/27–34)
  b29: ['≤ 40 mm', '≤ 40 mm'],      // V13: teto prático ACC/AHA (era 22–36)
  // ── coluna direita (derivados) ──
  imc:  ['<25 kg/m²', '<25 kg/m²'],
  aoae: ['', ''],                    // sem referência publicada
  asc:  ['', ''],                    // idem
  vdf:  ['62–150 ml', '46–106 ml'],
  vsf:  ['21–61 ml', '14–42 ml'],
  feT:  ['≥ 52%', '≥ 54%'],          // V13/A9 (era >51%/>53%)
  fs:   ['30–40%', '30–40%'],
  // '≤ 200 g' (era '<201 g' no legado): com massa truncada a 1 casa, '<201'
  // deixava 200,1-200,9 "normal" na VR enquanto a frase (j9 >200) e o realce
  // acendem — achado M da revisão F2-T2. A frase é a verdade; a VR acompanha. V13.
  massa: ['≤ 200 g', '≤ 150 g'],
  imVE: ['≤ 115 g/m²', '≤ 95 g/m²'], // V13/V2 Lang 2015 (era <103/<89)
  er:   ['<0,43', '<0,43'],
};

/**
 * String de referência impressa na coluna VR.
 * @example refVal('b7', 'F', 70) // "≤ 38 mm"
 * @example refVal('b9', '', 50)  // "" (C8: sem sexo, sem VR)
 */
export function refVal(campo: CampoTabela, sexo: Sexo, idade: number | null): string {
  if (!sexo) return '';                                   // C8 — antes de tetoRaiz
  if (campo === 'b7') return `≤ ${tetoRaiz(sexo, idade)} mm`;
  return VR[campo][sexo === 'F' ? 1 : 0];
}
