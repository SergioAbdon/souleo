// ══════════════════════════════════════════════════════════════════
// LEO Senna93 — isOOR: realce (vermelho) da tabela de parâmetros
// ══════════════════════════════════════════════════════════════════
// Reescrito na F2 (spec §2.7/C3) a partir dos cortes VIVOS — a versão
// anterior era código morto que já tinha derivado em 7 pontos (A22).
// Regra C8: sexo vazio → NUNCA acende (nenhuma linha), o alerta
// SEXO_AUSENTE (F2-T4) explica. Valor null → nunca acende (decisão 19b:
// zero validação; ausência não é anormalidade).
// B13: as linhas de derivados (imc/vdf/vsf/feT/fs/massa/imVE/er) TAMBÉM
// acendem — a "metade direita sempre preta" do legado morreu.
// ══════════════════════════════════════════════════════════════════
import type { Sexo } from '../types';
import { corteWaseRaiz, corteChamberAsc, ARCO_NORMAL_MAX } from '../calculos/aorta';

export type CampoTabela =
  | 'b7' | 'b8' | 'b9' | 'b10' | 'b11' | 'b12' | 'b13' | 'b28' | 'b29'
  | 'imc' | 'aoae' | 'asc' | 'vdf' | 'vsf' | 'feT' | 'fs' | 'massa' | 'imVE' | 'er';

// Lista runtime com exaustividade travada pelo tipo (achado I da revisão F2-T2):
// um 20º membro na união sem entrada aqui quebra o tsc — e o teste de coerência
// itera ESTA lista, então campo novo nunca escapa da coerência em silêncio.
const TODOS_OS_CAMPOS: Record<CampoTabela, true> = {
  b7: true, b8: true, b9: true, b10: true, b11: true, b12: true, b13: true,
  b28: true, b29: true, imc: true, aoae: true, asc: true, vdf: true, vsf: true,
  feT: true, fs: true, massa: true, imVE: true, er: true,
};
export const CAMPOS_TABELA = Object.keys(TODOS_OS_CAMPOS) as CampoTabela[];

/** Teto da raiz p/ exibição: WASE por idade; sem idade, faixa 41-65 (paridade legado). */
export function tetoRaiz(sexo: Sexo, idade: number | null): number {
  if (idade === null) return sexo !== 'F' ? 40 : 36;
  return corteWaseRaiz(sexo, idade);
}

export function isOOR(
  campo: CampoTabela,
  valor: number | null,
  sexo: Sexo,
  idade: number | null
): boolean {
  if (valor === null || !sexo) return false;   // C8: sem sexo, nada acende
  const M = sexo !== 'F';
  switch (campo) {
    // ── coluna esquerda (medidas cruas, mm) ──
    case 'b7':  return valor > tetoRaiz(sexo, idade);          // só teto (WASE)
    case 'b8':  return M ? (valor < 30 || valor > 40) : (valor < 27 || valor > 38);
    case 'b9':  return M ? (valor < 42 || valor > 58) : (valor < 38 || valor > 52);
    case 'b10':
    case 'b11': return M ? (valor < 6 || valor > 10) : (valor < 6 || valor > 9);
    case 'b12': return M ? (valor < 25 || valor > 40) : (valor < 21 || valor > 35);
    case 'b13': return valor < 21 || valor > 35;
    case 'b28': return valor > corteChamberAsc(sexo);          // ≤38♂/≤35♀ (F1)
    case 'b29': return valor > ARCO_NORMAL_MAX;                // ≤40, sem sexo (F1)
    // ── coluna direita (derivados) — B13: passam a acender ──
    case 'imc':  return valor >= 25;                           // VR '<25'
    case 'vdf':  return M ? (valor < 62 || valor > 150) : (valor < 46 || valor > 106);
    case 'vsf':  return M ? (valor < 21 || valor > 61) : (valor < 14 || valor > 42);
    case 'feT':  return M ? valor < 0.52 : valor < 0.54;       // decimal 0-1 (≥52/54%)
    case 'fs':   return valor < 0.30 || valor > 0.40;          // VR '30-40%'
    case 'massa': return M ? valor > 200 : valor > 150;        // VR '<201'/'<151'
    case 'imVE': return M ? valor > 115 : valor > 95;          // V2 (Lang 2015)
    case 'er':   return valor > 0.42;                          // VR '<0,43'
    // ── sem referência definida — nunca acendem ──
    case 'aoae':
    case 'asc':  return false;
  }
}
