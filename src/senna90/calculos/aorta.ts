// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Cálculos da Aorta
// ══════════════════════════════════════════════════════════════════
// Referências:
// - Roman MJ, Devereux RB et al. AJC 1989; 64: 507-512 (raiz <40 vs ≥40)
// - Devereux RB et al. AJC 2012; 110: 1189-1194 (Strong Heart Study)
//
// Sistema de classificação por Desvio-Padrão (Z-score):
// - Z ≤ 2: normal
// - Z 2-3: ectasia leve
// - Z 3-4: ectasia moderada
// - Z > 4: ectasia importante
//
// Fallback (sem ASC): limites fixos por sexo (ASE 2015)
// ══════════════════════════════════════════════════════════════════

import type { Sexo, GrauEstenose } from '../types';
import { truncar } from '../helpers/truncate';

/** Resultado de classificação de um segmento aórtico */
export interface ResultadoAorta {
  medidaMM: number;
  previstoMM: number | null;   // só com ASC
  sdMM: number | null;          // só com ASC
  zScore: number | null;        // só com ASC
  grau: 'normal' | 'leve' | 'moderada' | 'importante';
  metodo: 'zscore' | 'fallback';
}

/**
 * Classifica raiz aórtica usando Z-score (com ASC) ou fallback (sem ASC).
 *
 * COMPORTAMENTO PRESERVADO: corte etário <40 estrito (40 anos exatos = grupo ≥40).
 *
 * @param medidaMM Medida da raiz em mm
 * @param sexo M / F
 * @param asc Área de superfície corpórea em m² (null = usa fallback)
 * @param idade Idade em anos completos (null = assume ≥40)
 * @returns Resultado da classificação
 */
export function classificarRaizAo(
  medidaMM: number,
  sexo: Sexo,
  asc: number | null,
  idade: number | null
): ResultadoAorta {
  if (asc !== null && asc > 0) {
    // ── Método Z-score (Roman/Devereux 1989, atualizado 2012) ──
    const ehJovem = idade !== null && idade < 40; // <40 estrito (decisão Dr. Sérgio)
    const a = ehJovem ? 1.50 : 1.92;
    const b = ehJovem ? 0.95 : 0.74;
    const sd = 0.19; // cm
    const previstoCm = a + b * asc;
    const medidaCm = medidaMM / 10;
    const zScore = (medidaCm - previstoCm) / sd;
    return {
      medidaMM,
      previstoMM: truncar(previstoCm * 10, 1),
      sdMM: truncar(sd * 10, 1),
      zScore: truncar(zScore, 2),
      grau: classificarPorZ(zScore),
      metodo: 'zscore',
    };
  }
  // ── Fallback sem ASC ──
  // Cutoffs ASE 2015 Chamber Quantification — atualizados 07/05/2026
  // Decisão Dr. Sérgio: corrigir superestimação
  // Raiz: M [40, 45, 55] | F [36, 41, 51]
  const limites = sexo === 'F' ? [36, 41, 51] : [40, 45, 55];
  return {
    medidaMM,
    previstoMM: null,
    sdMM: null,
    zScore: null,
    grau: classificarPorFallback(medidaMM, limites),
    metodo: 'fallback',
  };
}

/**
 * Classifica aorta ascendente.
 * COMPORTAMENTO PRESERVADO: equação única (sem dependência etária — Devereux 2012).
 */
export function classificarAoAscendente(
  medidaMM: number,
  sexo: Sexo,
  asc: number | null
): ResultadoAorta {
  if (asc !== null && asc > 0) {
    const a = 1.47;
    const b = 0.91;
    const sd = 0.22; // cm
    const previstoCm = a + b * asc;
    const medidaCm = medidaMM / 10;
    const zScore = (medidaCm - previstoCm) / sd;
    return {
      medidaMM,
      previstoMM: truncar(previstoCm * 10, 1),
      sdMM: truncar(sd * 10, 1),
      zScore: truncar(zScore, 2),
      grau: classificarPorZ(zScore),
      metodo: 'zscore',
    };
  }
  // Fallback ASE 2015 — atualizado 07/05/2026
  // Asc: M [37, 42, 50] | F [34, 39, 47]
  const limites = sexo === 'F' ? [34, 39, 47] : [37, 42, 50];
  return {
    medidaMM,
    previstoMM: null,
    sdMM: null,
    zScore: null,
    grau: classificarPorFallback(medidaMM, limites),
    metodo: 'fallback',
  };
}

/**
 * Classifica arco aórtico.
 */
export function classificarArcoAo(
  medidaMM: number,
  sexo: Sexo,
  asc: number | null
): ResultadoAorta {
  if (asc !== null && asc > 0) {
    const a = 1.26;
    const b = 0.61;
    const sd = 0.20; // cm
    const previstoCm = a + b * asc;
    const medidaCm = medidaMM / 10;
    const zScore = (medidaCm - previstoCm) / sd;
    return {
      medidaMM,
      previstoMM: truncar(previstoCm * 10, 1),
      sdMM: truncar(sd * 10, 1),
      zScore: truncar(zScore, 2),
      grau: classificarPorZ(zScore),
      metodo: 'zscore',
    };
  }
  // Fallback ASE 2015 — atualizado 07/05/2026
  // Arco: sem distinção de sexo (ASE Chamber Quantification 2015)
  const limites = [36, 38, 42];
  return {
    medidaMM,
    previstoMM: null,
    sdMM: null,
    zScore: null,
    grau: classificarPorFallback(medidaMM, limites),
    metodo: 'fallback',
  };
}

// ── Helpers internos ──

function classificarPorZ(z: number): 'normal' | 'leve' | 'moderada' | 'importante' {
  if (z <= 2) return 'normal';
  if (z <= 3) return 'leve';
  if (z <= 4) return 'moderada';
  return 'importante';
}

function classificarPorFallback(
  medida: number,
  limites: number[]
): 'normal' | 'leve' | 'moderada' | 'importante' {
  // limites = [normal_max, leve_max, moderada_max]
  if (medida <= limites[0]) return 'normal';
  if (medida <= limites[1]) return 'leve';
  if (medida <= limites[2]) return 'moderada';
  return 'importante';
}

// ══════════════════════════════════════════════════════════════════
// SPEC AORTA — Tiers normal/ectasia/aneurisma (Dr. Sérgio 16/05/2026)
// ══════════════════════════════════════════════════════════════════
// docs/decisoes/2026-05-16-spec-aorta.md
//
// Fronteira normal→ectasia, fonte mais recente POR SEGMENTO:
// • RAIZ : WASE 2022 (seio de Valsalva), corte por SEXO + IDADE =
//   média + 1,96·DP (percentil 97,5, critério do paper). Sem idade
//   no exame → cai no Z-score Roman validado (rede de segurança).
// • ASCENDENTE : ASE/EACVI Chamber Quantification 2015 (Tabela 14,
//   ascendente proximal) — Homem ≤ 38 · Mulher ≤ 35 mm (média+2DP).
// • ARCO : idem (Chamber não tabula arco → usa ascendente proximal).
//
// Ectasia→aneurisma (ABSOLUTO): Raiz/Asc ≥ 50 mm · Arco ≥ 45 mm
// (ACC/AHA 2022). Reconcilia a antiga divergência Z×absoluto —
// leve/moderada/importante deixam de existir.
//
// Índice área transversal (cm²) ÷ altura (m): só Raiz/Asc; ≥ 10 ⇒
// "com critérios de maior gravidade" (ACC/AHA 2022). Arco sem índice.
// ══════════════════════════════════════════════════════════════════

export type TierAorta = 'normal' | 'ectasia' | 'aneurisma';

export interface SegmentoAortaResult {
  medidaMM: number;
  tier: TierAorta;
  indiceCm2m: number | null; // só Raiz/Asc (precisa altura)
  graveIndice: boolean;      // indiceCm2m !== null && >= 10
}

const ANEURISMA_MM_RAIZ_ASC = 50;
const ARCO_ANEURISMA_MM = 45;

/**
 * ASE/EACVI Chamber Quantification 2015, Tabela 14 — aorta ascendente
 * PROXIMAL em adultos normais: Homem 30 ± 4 mm · Mulher 27 ± 4 mm.
 * Limite superior do normal = média + 2 DP → Homem 38 · Mulher 35 mm.
 * Arco usa o mesmo (Chamber não tabula o arco transverso isolado).
 */
function corteChamberAsc(sexo: Sexo): number {
  return sexo !== 'F' ? 38 : 35;
}

/**
 * Índice = área transversal (cm²) ÷ altura (m). ACC/AHA 2022: ≥10 cm²/m
 * sugere maior gravidade. Validado só p/ raiz/ascendente.
 */
export function indiceAortaAltura(
  medidaMM: number,
  alturaCm: number | null
): number | null {
  if (!medidaMM || medidaMM <= 0 || alturaCm === null || alturaCm <= 0) return null;
  const rCm = medidaMM / 10 / 2;
  const areaCm2 = Math.PI * rCm * rCm;
  return truncar(areaCm2 / (alturaCm / 100), 1);
}

/**
 * WASE 2022 — limite superior do normal da RAIZ (seio de Valsalva), mm.
 * Cutoff = média + 1,96·DP (percentil 97,5 — critério do paper WASE).
 * Faixas WASE: jovem ≤40 · médio 41–65 · idoso ≥66.
 *   Homem : 38 / 40 / 41      Mulher : 35 / 36 / 37
 */
function corteWaseRaiz(sexo: Sexo, idade: number): number {
  const homem = sexo !== 'F';
  if (idade <= 40) return homem ? 38 : 35;
  if (idade <= 65) return homem ? 40 : 36;
  return homem ? 41 : 37;
}

/** Monta o tier a partir de "está acima do normal?" + medida + altura. */
function montarTierRaizAsc(
  acimaDoNormal: boolean,
  medidaMM: number,
  alturaCm: number | null
): SegmentoAortaResult {
  const indiceCm2m = indiceAortaAltura(medidaMM, alturaCm);
  const graveIndice = indiceCm2m !== null && indiceCm2m >= 10;
  if (!acimaDoNormal && medidaMM < ANEURISMA_MM_RAIZ_ASC) {
    return { medidaMM, tier: 'normal', indiceCm2m, graveIndice };
  }
  const tier: TierAorta = medidaMM >= ANEURISMA_MM_RAIZ_ASC ? 'aneurisma' : 'ectasia';
  return { medidaMM, tier, indiceCm2m, graveIndice };
}

/**
 * Raiz aórtica — fronteira normal→ectasia pelo WASE 2022 (sexo+idade).
 * Sem idade no exame → Z-score Roman validado (rede de segurança).
 */
export function tierRaizAo(
  medidaMM: number,
  sexo: Sexo,
  asc: number | null,
  idade: number | null,
  alturaCm: number | null
): SegmentoAortaResult {
  const acima = idade !== null
    ? medidaMM > corteWaseRaiz(sexo, idade)
    : classificarRaizAo(medidaMM, sexo, asc, idade).grau !== 'normal';
  return montarTierRaizAsc(acima, medidaMM, alturaCm);
}

/**
 * Aorta ascendente — fronteira normal→ectasia pelo ASE Chamber 2015:
 * normal ≤ 36 mm (absoluto). Aneurisma ≥ 50 mm. Mantém índice cm²/m.
 */
export function tierAoAscendente(
  medidaMM: number,
  sexo: Sexo,
  _asc: number | null,
  alturaCm: number | null
): SegmentoAortaResult {
  return montarTierRaizAsc(medidaMM > corteChamberAsc(sexo), medidaMM, alturaCm);
}

/** Arco — normal pelo Chamber ascendente proximal (sexo); ≥45 aneurisma. Sem índice. */
export function tierArcoAo(medidaMM: number, sexo: Sexo): SegmentoAortaResult {
  let tier: TierAorta = 'normal';
  if (medidaMM >= ARCO_ANEURISMA_MM) tier = 'aneurisma';
  else if (medidaMM > corteChamberAsc(sexo)) tier = 'ectasia';
  return { medidaMM, tier, indiceCm2m: null, graveIndice: false };
}
