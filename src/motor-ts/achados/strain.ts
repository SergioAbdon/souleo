// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Achados: Strain (Speckle Tracking)
// ══════════════════════════════════════════════════════════════════
// Funções: jGLSve, jGLSvd, jLARS
//
// ATUALIZADO: GLS VE cutoff -18% → -20% (consenso EACVI/ASE 2024)
// (decisão Dr. Sérgio em 2026-05-03)
//
// Aparecem apenas se valor preenchido (em branco = não realizado).
// ══════════════════════════════════════════════════════════════════

/**
 * jGLSve — GLS Global do VE
 * ATUALIZADO: cutoff -20% (era -18% no motor antigo)
 * Texto VR também atualizado: "VR ≥ -20%" (era "VR ≥ -18%")
 */
export function jGLSve(glsVE: number | null): string {
  if (glsVE === null) return '';
  const abs = Math.abs(glsVE);
  if (abs >= 20) return `Strain global longitudinal do ventrículo esquerdo pelo speckle tracking de ${glsVE}% (VR ≥ -20%).`;
  return `Strain global longitudinal do ventrículo esquerdo reduzido pelo speckle tracking de ${glsVE}% (VR ≥ -20%).`;
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
