// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Helper: Normalização de inputs
// Converte strings DOM em números/booleanos seguros
// Equivalente a v(id) e n(id) do motor original
// ══════════════════════════════════════════════════════════════════

/**
 * Lê string de campo DOM, retorna string vazia se inexistente.
 * Equivalente a v(id) do motor original.
 */
export function readStr(id: string): string {
  if (typeof document === 'undefined') return '';
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return el?.value?.trim() || '';
}

/**
 * Lê string e parseia como float, retorna null se inválido ou vazio.
 * Equivalente a n(id) do motor original.
 *
 * @example
 * parseNum("50.5")  // 50.5
 * parseNum("")      // null
 * parseNum("abc")   // null
 */
export function parseNum(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === '') return null;
  // Aceita vírgula brasileira como separador decimal
  const normalized = s.replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? null : n;
}

/**
 * Lê valor de campo DOM e converte pra número (ou null).
 */
export function readNum(id: string): number | null {
  return parseNum(readStr(id));
}

/**
 * Parseia inteiro (0-4) para campos Wilkins.
 */
export function parseWkScore(value: string | null | undefined): number {
  const n = parseNum(value);
  if (n === null) return 0;
  const i = Math.trunc(n);
  return Math.max(0, Math.min(4, i));
}

/**
 * Verifica se um valor está preenchido (não vazio, não nulo, não zero).
 * Útil pra condicionais "se preenchido".
 */
export function preenchido(v: number | null | undefined): boolean {
  return v !== null && v !== undefined && !Number.isNaN(v) && v > 0;
}
