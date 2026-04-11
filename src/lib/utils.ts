// ══════════════════════════════════════════════════════════════════
// SOULEO · Utilitários
// Funções puras reutilizáveis em todo o projeto
// ══════════════════════════════════════════════════════════════════

/**
 * Retorna a data LOCAL no formato YYYY-MM-DD.
 * Nunca usa toISOString() que retorna UTC e causa bug de timezone.
 */
export function dataLocalHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
