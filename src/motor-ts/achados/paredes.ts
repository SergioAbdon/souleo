// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Achados: Contratilidade Segmentar
// ══════════════════════════════════════════════════════════════════
// Funções: j13 (apex), j14-j19 (paredes), j20 (demais), wallText (helper)
//
// MAPEAMENTO ATUALIZADO (decisão Dr. Sérgio — modelo AHA):
// - b56 → P. Anterior
// - b57 → P. Septal anterior (anteroseptal)
// - b58 → P. Septal inferior (inferoseptal)
// - b59 → P. Inferior          (CORRIGIDO — antes era "lateral")
// - b60 → P. Inferolateral     (CORRIGIDO — antes era "inferior")
// - b61 → P. Lateral           (CORRIGIDO — antes era "inferolateral")
// ══════════════════════════════════════════════════════════════════

import type { CodigoSegmento, CodigoDemaisParedes } from '../types';

/** Helper: gera texto pra parede + código (18 padrões) */
export function wallText(val: CodigoSegmento, parede: string): string {
  if (!val) return '';

  const m: Record<string, string> = {
    HB: `Alteração contrátil por hipocinesia da porção basal da ${parede}`,
    HMB: `Alteração contrátil por hipocinesia da porção médiobasal da ${parede}`,
    HM: `Alteração contrátil por hipocinesia da porção média da ${parede}`,
    HMA: `Alteração contrátil por hipocinesia da porção médioapical da ${parede}`,
    HA: `Alteração contrátil por hipocinesia da porção apical da ${parede}`,
    AB: `Alteração contrátil por acinesia da porção basal da ${parede}`,
    AMB: `Alteração contrátil por acinesia da porção médiobasal da ${parede}`,
    AM: `Alteração contrátil por acinesia da porção média da ${parede}`,
    AMA: `Alteração contrátil por acinesia da porção médioapical da ${parede}`,
    AA: `Alteração contrátil por acinesia da porção apical da ${parede}`,
    DB: `Alteração contrátil por discinesia da porção basal da ${parede}`,
    DMB: `Alteração contrátil por discinesia da porção médiobasal da ${parede}`,
    DM: `Alteração contrátil por discinesia da porção média da ${parede}`,
    DMA: `Alteração contrátil por discinesia da porção médioapical da ${parede}`,
    DA: `Alteração contrátil por discinesia da porção apical da ${parede}`,
    H: `Alteração contrátil por hipocinesia da ${parede}`,
    A: `Alteração contrátil por acinesia da ${parede}`,
    D: `Alteração contrátil por discinesia da ${parede}`,
  };

  return m[val] || '';
}

/** j13 — Região apical (b55) */
export function jApex(b55: '' | 'H' | 'A' | 'D'): string {
  const m: Record<string, string> = {
    H: 'Alteração contrátil por hipocinesia da região apical do ventrículo esquerdo',
    A: 'Alteração contrátil por acinesia da região apical do ventrículo esquerdo',
    D: 'Alteração contrátil por discinesia da região apical do ventrículo esquerdo',
  };
  return b55 ? m[b55] || '' : '';
}

/** j14 — Parede anterior (b56) */
export function jParedeAnterior(b56: CodigoSegmento): string {
  return wallText(b56, 'parede anterior');
}

/** j15 — Parede septal anterior (b57) */
export function jParedeSeptalAnterior(b57: CodigoSegmento): string {
  return wallText(b57, 'parede septalanterior');
}

/** j16 — Parede septal inferior (b58) */
export function jParedeSeptalInferior(b58: CodigoSegmento): string {
  return wallText(b58, 'parede septalinferior');
}

/** j17 — Parede inferior (b59) — CORRIGIDO conforme AHA */
export function jParedeInferior(b59: CodigoSegmento): string {
  return wallText(b59, 'parede inferior');
}

/** j18 — Parede inferolateral (b60) — CORRIGIDO conforme AHA */
export function jParedeInferolateral(b60: CodigoSegmento): string {
  return wallText(b60, 'parede inferolateral');
}

/** j19 — Parede lateral (b61) — CORRIGIDO conforme AHA */
export function jParedeLateral(b61: CodigoSegmento): string {
  return wallText(b61, 'parede lateral');
}

/** j20 — Demais paredes (b62) */
export function jDemaisParedes(b62: CodigoDemaisParedes): string {
  const m: Record<string, string> = {
    NL: 'Contratilidade preservada nas demais paredes',
    HD: 'Alteração contratil por hipocinesia difusa do ventrículo esquerdo',
    HR: 'Alteração contratil por hipocinesia das demais paredes',
    AD: 'Alteração contratil por acinesia das demais paredes',
    DD: 'Alteração contratil por hipocinesia das demais paredes',
  };
  return b62 ? m[b62] || '' : '';
}
