// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Achados: Strain (Speckle Tracking)
// ══════════════════════════════════════════════════════════════════
// Funções: faixaGLSve, jGLSve, jGLSvd, jLARS
//
// ATUALIZADO (Senna93 F1-T3): GLS VE deixa de ser binário |20| e passa a
// 3 faixas ASE/EACVI 2025 (normal ≥18 · limítrofe 16-18 · reduzido <16).
// `faixaGLSve` é a ÚNICA fonte de classificação — achado E conclusão.
//
// Aparecem apenas se valor preenchido (em branco = não realizado).
// ══════════════════════════════════════════════════════════════════

/** ASE/EACVI 2025 (spec Senna93 §2.1): normal |GLS| ≥ 18 · limítrofe 16–18 · anormal < 16. */
export function faixaGLSve(gls: number): 'normal' | 'limitrofe' | 'reduzido' {
  const abs = Math.abs(gls);
  if (abs >= 18) return 'normal';
  if (abs >= 16) return 'limitrofe';
  return 'reduzido';
}

export function jGLSve(glsVE: number | null): string {
  if (glsVE === null) return '';
  const faixa = faixaGLSve(glsVE);
  if (faixa === 'normal') return `Strain global longitudinal do ventrículo esquerdo pelo speckle tracking de ${glsVE}% (VR ≤ -18%).`;
  if (faixa === 'limitrofe') return `Strain global longitudinal do ventrículo esquerdo no limite inferior da normalidade (faixa -18 a -16%) pelo speckle tracking de ${glsVE}%.`;
  return `Strain global longitudinal do ventrículo esquerdo reduzido pelo speckle tracking de ${glsVE}% (VR ≤ -18%).`;
}

/**
 * jGLSvd — GLS Global do VD
 * Cutoff -20% (mantido — já estava correto)
 */
export function jGLSvd(glsVD: number | null): string {
  if (glsVD === null) return '';
  const abs = Math.abs(glsVD);
  if (abs >= 20) return `Strain global longitudinal do ventrículo direito pelo speckle tracking de ${glsVD}% (VR ≥ -20%).`;
  return `Strain global longitudinal do ventrículo direito reduzido pelo speckle tracking de ${glsVD}% (VR ≥ -20%).`;
}

/**
 * jLARS — Strain do AE (reservoir)
 * Cutoff +18% (Singh et al. 2017)
 */
export function jLARS(lars: number | null): string {
  if (lars === null) return '';
  if (lars >= 18) return `Strain longitudinal do átrio esquerdo (reservoir) de ${lars}% (VR ≥ 18%).`;
  return `Strain longitudinal do átrio esquerdo (reservoir) reduzido de ${lars}% (VR ≥ 18%).`;
}
