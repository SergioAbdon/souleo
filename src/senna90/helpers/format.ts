// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Helper: Formatação
// Funções de exibição de valores numéricos
// ══════════════════════════════════════════════════════════════════

/**
 * Formata número como string com fallback pra null.
 * Equivalente a fmt(x, d) do motor original.
 *
 * @example
 * fmt(50.5, 1)  // "50.5"
 * fmt(null, 1)  // "—"
 */
export function fmt(x: number | null, d: number = 1, fallback: string = '—'): string {
  if (x === null || x === undefined || Number.isNaN(x)) return fallback;
  return x.toFixed(d);
}

/**
 * Formata percentual a partir de fração decimal (0-1)
 *
 * @example
 * fmtPct(0.65, 0)  // "65%"
 * fmtPct(0.708, 1) // "70.8%"
 * fmtPct(null)     // "VIDE" (fallback do motor)
 */
export function fmtPct(x: number | null, d: number = 0, fallback: string = 'VIDE'): string {
  if (x === null || x === undefined || Number.isNaN(x)) return fallback;
  return `${(x * 100).toFixed(d)}%`;
}

/**
 * Calcula idade em anos completos entre 2 datas YYYY-MM-DD.
 *
 * @example
 * calcIdade('1980-05-15', '2026-05-03') // 45
 * calcIdade('', '2026-05-03')           // null
 */
export function calcIdade(dtnasc: string, dtexame: string): number | null {
  if (!dtnasc || !dtexame) return null;
  try {
    const [y1, m1, d1] = dtnasc.split('-').map(Number);
    const [y2, m2, d2] = dtexame.split('-').map(Number);
    if (!y1 || !y2) return null;

    let idade = y2 - y1;
    if (m2 < m1 || (m2 === m1 && d2 < d1)) idade--;
    return idade < 0 ? null : idade;
  } catch {
    return null;
  }
}
