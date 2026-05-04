// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Achados: Válvulas
// ══════════════════════════════════════════════════════════════════
// Funções:
// - j24 (mitral morf), j25-j27 (gradientes mit), j28 (refluxo mit)
// - jTricMorf (tric morf), j29 (refluxo tric), jEstenTric
// - j31 (aórtica morf), j32-j34 (gradientes ao), j35 (refluxo ao)
// - jPulmMorf (pulm morf), jEstenPulm, jRefluxoPulm
// - j30 (PSAP), j36 (pericárdio), j40 (placas), j50 (HP)
// ══════════════════════════════════════════════════════════════════

import type { GrauRefluxo, MorfologiaValvar, GrauEstenose } from '../types';

// ── J24 — Mitral morfologia ─────────────────────────────────────
export function jMitralMorfologia(b34: MorfologiaValvar, b36: GrauRefluxo): string {
  if (!b34) return !b36
    ? 'Válvulas atrioventriculares com a morfologia preservada.'
    : 'Válvula mitral com morfologia preservada.';

  const m: Record<string, string> = {
    EL: 'Válvula mitral espessada em grau leve.',
    ELM: 'Válvula mitral espessada em grau leve a moderado.',
    EM: 'Válvula mitral espessada em grau moderado, gerando restrição da sua abertura.',
    EMI: 'Válvula mitral espessada em grau moderado a importante, gerando restrição da sua abertura.',
    EI: 'Válvula mitral espessada em grau importante, gerando restrição da sua abertura.',
    FL: 'Válvula mitral fibrocalcificada em grau leve.',
    FLM: 'Válvula mitral fibrocalcificada em grau leve a moderado.',
    FM: 'Válvula mitral fibrocalcificada em grau moderado, gerando restrição da sua abertura.',
    FMI: 'Válvula mitral fibrocalcificada em grau moderado a importante, gerando restrição da sua abertura.',
    FI: 'Válvula mitral fibrocalcificada em grau importante, gerando restrição da sua abertura.',
    EFL: 'Válvula mitral espessada e fibrocalcificada em grau leve.',
    EFLM: 'Válvula mitral espessada e fibrocalcificada em grau leve a moderado.',
    EFM: 'Válvula mitral espessada e fibrocalcificada em grau moderado, gerando restrição da sua abertura.',
    EFMI: 'Válvula mitral espessada e fibrocalcificada em grau moderado a importante, gerando restrição da sua abertura.',
    EFI: 'Válvula mitral espessada e fibrocalcificada em grau importante, gerando restrição da sua abertura.',
  };
  return m[b34] || '';
}

/** j25 — Gradiente máximo mitral */
export function jGradMaxMitral(b45: number | null): string {
  return b45 !== null && b45 >= 1
    ? `Gradiente transvalvar mitral máximo de ${b45} mmHg.`
    : '';
}

/** j26 — Gradiente médio mitral */
export function jGradMedMitral(b46: number | null): string {
  return b46 !== null && b46 >= 1
    ? `Gradiente transvalvar mitral médio de ${b46} mmHg.`
    : '';
}

/** j27 — Área mitral PHT */
export function jAreaMitral(b47: number | null): string {
  return b47 !== null && b47 > 0
    ? `Área mitral estimada em ${b47} cm² (PHT).`
    : '';
}

/**
 * j28 — Refluxo mitral + frase "Fluxo AV preservado" (condicional)
 * Frase preservada só aparece se NENHUMA alteração AV (mit/tric).
 */
export function jRefluxoMitral(
  b35: GrauRefluxo,
  b36: GrauRefluxo,
  b45: number | null,
  b46: number | null,
  b47: number | null,
  b34t: MorfologiaValvar,
  estenTricGrau: GrauEstenose
): string {
  const m: Record<string, string> = {
    L: 'Insuficiência Mitral leve.',
    LM: 'Insuficiência Mitral leve a moderada.',
    M: 'Insuficiência Mitral moderada.',
    MI: 'Insuficiência Mitral moderada a importante.',
    I: 'Insuficiência Mitral importante.',
  };

  if (b35) return m[b35] || '';

  const temAlteracaoAV =
    b36 ||
    (b45 !== null && b45 > 0) ||
    (b46 !== null && b46 > 0) ||
    (b47 !== null && b47 > 0) ||
    b34t ||
    estenTricGrau;

  if (!temAlteracaoAV) return 'Fluxo pelas válvulas atrioventriculares preservado.';
  return '';
}

/** j29 — Refluxo tricúspide */
export function jRefluxoTricuspide(b36: GrauRefluxo): string {
  const m: Record<string, string> = {
    L: 'Insuficiência Tricúspide leve.',
    LM: 'Insuficiência Tricúspide leve a moderada.',
    M: 'Insuficiência Tricúspide moderada.',
    MI: 'Insuficiência Tricúspide moderada a importante.',
    I: 'Insuficiência Tricúspide importante.',
  };
  return b36 ? m[b36] || '' : '';
}

/** jTricMorf — Tricúspide morfologia */
export function jTricMorfologia(b34t: MorfologiaValvar): string {
  if (!b34t) return '';

  const m: Record<string, string> = {
    EL: 'Válvula tricúspide espessada em grau leve.',
    ELM: 'Válvula tricúspide espessada em grau leve a moderado.',
    EM: 'Válvula tricúspide espessada em grau moderado, gerando restrição da sua abertura.',
    EMI: 'Válvula tricúspide espessada em grau moderado a importante, gerando restrição da sua abertura.',
    EI: 'Válvula tricúspide espessada em grau importante, gerando restrição da sua abertura.',
    FL: 'Válvula tricúspide fibrocalcificada em grau leve.',
    FLM: 'Válvula tricúspide fibrocalcificada em grau leve a moderado.',
    FM: 'Válvula tricúspide fibrocalcificada em grau moderado.',
    FMI: 'Válvula tricúspide fibrocalcificada em grau moderado a importante.',
    FI: 'Válvula tricúspide fibrocalcificada em grau importante.',
    EFL: 'Válvula tricúspide espessada e fibrocalcificada em grau leve.',
    EFLM: 'Válvula tricúspide espessada e fibrocalcificada em grau leve a moderado.',
    EFM: 'Válvula tricúspide espessada e fibrocalcificada em grau moderado.',
    EFMI: 'Válvula tricúspide espessada e fibrocalcificada em grau moderado a importante.',
    EFI: 'Válvula tricúspide espessada e fibrocalcificada em grau importante.',
  };
  return m[b34t] || '';
}

/**
 * jEstenTric — Estenose tricúspide (lista de linhas)
 * COMPORTAMENTO PRESERVADO: sem grau "leve"
 */
export function jEstenoseTricuspide(
  estenTricGrau: GrauEstenose,
  b46t: number | null,
  b47t: number | null
): string[] {
  if (!estenTricGrau) return [];
  const linhas: string[] = [];
  if (b46t !== null && b46t >= 5) linhas.push(`Gradiente transvalvar tricúspide médio de ${b46t} mmHg.`);
  if (b47t !== null && b47t > 0) linhas.push(`Área tricúspide estimada em ${b47t} cm² (PHT).`);
  if (estenTricGrau === 'importante') linhas.push('Estenose Tricúspide Importante.');
  else if (estenTricGrau === 'moderada') linhas.push('Estenose Tricúspide Moderada.');
  return linhas;
}

/**
 * j30 — PSAP por b37 + Ausência de sinais HP
 *
 * - b37 preenchido: "Pressão sistólica da artéria pulmonar de X mmHg. VR < 36 mmHg."
 * - b37 vazio + b23 vazio: "Ausência de sinais indiretos de hipertensão pulmonar."
 * - b37 vazio + b23 preenchido: silêncio (j50 cobre)
 */
export function jPSAP(b37: number | null, b23: number | null): string {
  if (b37 !== null && b37 > 0) return `Pressão sistólica da artéria pulmonar de ${b37} mmHg. VR < 36 mmHg.`;
  if (!b23 || b23 === 0) return 'Ausência de sinais indiretos de hipertensão pulmonar.';
  return '';
}

// ── J31 — Aórtica morfologia ────────────────────────────────────
export function jAorticaMorfologia(b39: MorfologiaValvar): string {
  if (!b39) return 'Válvulas semilunares com morfologia preservada.';

  const m: Record<string, string> = {
    EL: 'Válvula aórtica espessada em grau leve.',
    ELM: 'Válvula aórtica espessada em grau leve a moderado.',
    EM: 'Válvula aórtica espessada em grau moderado.',
    EMI: 'Válvula aórtica espessada em grau moderado a importante.',
    EI: 'Válvula aórtica espessada em grau importante.',
    FL: 'Válvula aórtica fibrocalcificada em grau leve.',
    FLM: 'Válvula aórtica fibrocalcificada em grau leve a moderado.',
    FM: 'Válvula aórtica fibrocalcificada em grau moderado.',
    FMI: 'Válvula aórtica fibrocalcificada em grau moderado a importante.',
    FI: 'Válvula aórtica fibrocalcificada em grau importante.',
    EFL: 'Válvula aórtica espessada e fibrocalcificada em grau leve.',
    EFLM: 'Válvula aórtica espessada e fibrocalcificada em grau leve a moderado.',
    EFM: 'Válvula aórtica espessada e fibrocalcificada em grau moderado.',
    EFMI: 'Válvula aórtica espessada e fibrocalcificada em grau moderado a importante.',
    EFI: 'Válvula aórtica espessada e fibrocalcificada em grau importante.',
  };
  return m[b39] || '';
}

/** j32 — Gradiente máximo aórtico */
export function jGradMaxAortico(b50: number | null): string {
  return b50 !== null && b50 >= 1
    ? `Gradiente transvalvar aórtico máximo de ${b50} mmHg.`
    : '';
}

/** j33 — Gradiente médio aórtico */
export function jGradMedAortico(b51: number | null): string {
  return b51 !== null && b51 >= 1
    ? `Gradiente transvalvar aórtico médio de ${b51} mmHg.`
    : '';
}

/** j34 — Área aórtica + área indexada */
export function jAreaAortica(b52: number | null, aoIdx: number | null): string {
  if (!b52 || b52 <= 0) return '';
  let t = `Área aórtica estimada em ${b52} cm² (Equação de continuidade).`;
  if (aoIdx) t += ` Área aórtica indexada = ${aoIdx} cm²/m².`;
  return t;
}

/**
 * j35 — Refluxo aórtico + frase "Fluxo SL preservado"
 */
export function jRefluxoAortico(
  b40: GrauRefluxo,
  b40p: GrauRefluxo,
  b50: number | null,
  b51: number | null,
  b52: number | null,
  b39p: MorfologiaValvar,
  estenPulmGrau: GrauEstenose
): string {
  const m: Record<string, string> = {
    L: 'Insuficiência Aórtica leve.',
    LM: 'Insuficiência Aórtica leve a moderada.',
    M: 'Insuficiência Aórtica moderada.',
    MI: 'Insuficiência Aórtica moderada a importante.',
    I: 'Insuficiência Aórtica importante.',
  };

  if (b40) return m[b40] || '';

  const temAlteracaoSL =
    b40p ||
    (b50 !== null && b50 > 0) ||
    (b51 !== null && b51 > 0) ||
    (b52 !== null && b52 > 0) ||
    b39p ||
    estenPulmGrau;

  if (!temAlteracaoSL) return 'Fluxo pelas válvulas semilunares preservado.';
  return '';
}

/** jPulmMorf — Pulmonar morfologia */
export function jPulmMorfologia(b39p: MorfologiaValvar): string {
  if (!b39p) return '';

  const m: Record<string, string> = {
    EL: 'Válvula pulmonar espessada em grau leve.',
    ELM: 'Válvula pulmonar espessada em grau leve a moderado.',
    EM: 'Válvula pulmonar espessada em grau moderado.',
    EMI: 'Válvula pulmonar espessada em grau moderado a importante.',
    EI: 'Válvula pulmonar espessada em grau importante.',
    FL: 'Válvula pulmonar fibrocalcificada em grau leve.',
    FLM: 'Válvula pulmonar fibrocalcificada em grau leve a moderado.',
    FM: 'Válvula pulmonar fibrocalcificada em grau moderado.',
    FMI: 'Válvula pulmonar fibrocalcificada em grau moderado a importante.',
    FI: 'Válvula pulmonar fibrocalcificada em grau importante.',
    EFL: 'Válvula pulmonar espessada e fibrocalcificada em grau leve.',
    EFLM: 'Válvula pulmonar espessada e fibrocalcificada em grau leve a moderado.',
    EFM: 'Válvula pulmonar espessada e fibrocalcificada em grau moderado.',
    EFMI: 'Válvula pulmonar espessada e fibrocalcificada em grau moderado a importante.',
    EFI: 'Válvula pulmonar espessada e fibrocalcificada em grau importante.',
  };
  return m[b39p] || '';
}

/** jEstenPulm — Estenose pulmonar (lista de linhas) */
export function jEstenosePulmonar(
  estenPulmGrau: GrauEstenose,
  b50p: number | null
): string[] {
  if (!estenPulmGrau) return [];
  const linhas: string[] = [];
  if (b50p) linhas.push(`Gradiente transvalvar pulmonar máximo de ${b50p} mmHg.`);
  if (estenPulmGrau === 'importante') linhas.push('Estenose Pulmonar Importante.');
  else if (estenPulmGrau === 'moderada') linhas.push('Estenose Pulmonar Moderada.');
  else if (estenPulmGrau === 'leve') linhas.push('Estenose Pulmonar Leve.');
  return linhas;
}

/** jRefluxoPulm — Refluxo pulmonar + PMAP */
export function jRefluxoPulmonar(b40p: GrauRefluxo, psmap: number | null): string[] {
  if (!b40p) return [];
  const linhas: string[] = [];
  const m: Record<string, string> = {
    L: 'Insuficiência Pulmonar leve.',
    LM: 'Insuficiência Pulmonar leve a moderada.',
    M: 'Insuficiência Pulmonar moderada.',
    MI: 'Insuficiência Pulmonar moderada a importante.',
    I: 'Insuficiência Pulmonar importante.',
  };
  if (m[b40p]) linhas.push(m[b40p]);
  if (psmap !== null && psmap > 0) {
    linhas.push(`Pressão sistólica média da artéria pulmonar de ${psmap} mmHg.`);
  }
  return linhas;
}

/** j36 — Pericárdio */
export function jPericardio(b41: GrauRefluxo): string {
  const m: Record<string, string> = {
    L: 'Derrame pericárdico leve.',
    LM: 'Derrame pericárdico leve a moderado.',
    M: 'Derrame pericárdico moderado.',
    MI: 'Derrame pericárdico moderado a importante.',
    I: 'Derrame pericárdico importante.',
  };
  return b41 ? m[b41] || '' : 'Pericárdio sem alterações.';
}

/** j40 — Placas no arco aórtico */
export function jPlacas(b42: '' | 's' | 'nv'): string {
  if (b42 === 's') return 'Placas de ateroma calcificadas e não complicadas no arco aórtico.';
  if (b42 === 'nv') return 'Arco aórtico não visualizado adequadamente.';
  return '';
}

/**
 * j50 — Probabilidade de Hipertensão Pulmonar (por velocidade IT)
 * Cutoffs ESC/ERS 2022:
 * - >3.4 m/s: Alta
 * - 2.9-3.4 m/s: Alta (com sinais) ou Intermediária (sem)
 * - <2.9 m/s: Intermediária (com sinais) ou Baixa (sem)
 */
export function jProbabilidadeHP(b23: number | null, b38: '' | 'S'): string {
  if (!b23 || b23 === 0) return '';
  const presente = b38 === 'S';

  if (b23 > 3.4) return 'Alta Probabilidade de Hipertensão Pulmonar.';
  if (b23 >= 2.9) return presente
    ? 'Alta Probabilidade de Hipertensão Pulmonar.'
    : 'Probabilidade Intermediária de Hipertensão Pulmonar.';
  return presente
    ? 'Probabilidade Intermediária de Hipertensão Pulmonar.'
    : 'Baixa Probabilidade de Hipertensão Pulmonar.';
}
