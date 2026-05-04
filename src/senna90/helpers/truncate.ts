// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Helper: TRUNCAR (não arredondar)
// Equivalente ao T(x,d) do motorv8mp4.js
// IMPORTANTE: o motor original TRUNCA, não arredonda
// Ex: T(1.999, 2) = 1.99 (não 2.00)
// ══════════════════════════════════════════════════════════════════

/**
 * Trunca um número para `d` casas decimais (sem arredondar).
 * Retorna null se o input for null/NaN.
 *
 * @param x Número a truncar
 * @param d Casas decimais desejadas (default 1)
 * @returns Número truncado ou null
 *
 * @example
 * truncar(23.4567, 2) // 23.45
 * truncar(1.999, 2)   // 1.99 (NÃO 2.00)
 * truncar(null, 2)    // null
 */
export function truncar(x: number | null, d: number = 1): number | null {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const factor = Math.pow(10, d);
  // Math.trunc remove a parte decimal sem arredondar (positivos e negativos)
  return Math.trunc(x * factor) / factor;
}

/**
 * Trunca para string formatada (com casas fixas).
 * Útil pra exibição em DOM.
 *
 * @example
 * truncarStr(1.999, 2) // "1.99"
 * truncarStr(null, 2)  // "—"
 */
export function truncarStr(x: number | null, d: number = 1, fallback: string = '—'): string {
  const t = truncar(x, d);
  if (t === null) return fallback;
  return t.toFixed(d);
}
