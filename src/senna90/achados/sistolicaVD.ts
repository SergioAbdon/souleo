// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Achados: Função Sistólica VD
// ══════════════════════════════════════════════════════════════════
// Função j23: combinação de Disfunção VD (b32 qualitativo) + TAPSE (b33)
// ══════════════════════════════════════════════════════════════════

import type { GrauRefluxo } from '../types';

/**
 * j23 — Disfunção VD + TAPSE
 *
 * Lógica:
 * - Se b32 preenchido: "Disfunção sistólica de grau X do ventrículo direito" + sufixo TAPSE
 * - Se b32 vazio + b33>0: "Função preservada. TAPSE= X mm (VR ≥ 20 mm)."
 * - Se b32 vazio + sem b33: "Função preservada."
 */
export function jVD_sistolica(b32: GrauRefluxo, b33: number | null): string {
  const t = b33 !== null ? ` TAPSE= ${b33} mm (VR ≥ 20 mm).` : '.';

  if (b32 === 'L') return `Disfunção sistólica de grau leve do ventrículo direito${t}`;
  if (b32 === 'LM') return `Disfunção sistólica de grau leve a moderado do ventrículo direito${t}`;
  if (b32 === 'M') return `Disfunção sistólica de grau moderado do ventrículo direito${t}`;
  if (b32 === 'MI') return `Disfunção sistólica de grau moderado a importante do ventrículo direito${t}`;
  if (b32 === 'I') return `Disfunção sistólica de grau importante do ventrículo direito${t}`;

  if (!b32 && b33 !== null && b33 > 0) {
    return `Função sistólica do ventrículo direito preservada. TAPSE= ${b33} mm (VR ≥ 20 mm).`;
  }
  return 'Função sistólica do ventrículo direito preservada.';
}
