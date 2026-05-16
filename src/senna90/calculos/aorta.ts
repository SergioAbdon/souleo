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
// • Normal→ectasia (Raiz/Asc): mantém o método VALIDADO existente
//   (Z-score idade+sexo+ASC; fallback ASE 2015 por sexo) — é o "corte
//   referenciado por idade e sexo" pedido pelo Dr. Sérgio.
// • Ectasia→aneurisma (Raiz/Asc): ABSOLUTO ≥50 mm (ACC/AHA 2022,
//   faixa cirúrgica esporádica). Reconcilia a antiga divergência
//   Z-score×absoluto: leve/moderada/importante deixam de existir.
// • Arco: faixa FIXA 22–36 normal · 37–44 ectasia · ≥45 aneurisma
//   (sem sexo/idade e sem índice — não validado p/ arco na diretriz).
// • Índice área transversal (cm²) ÷ altura (m): só Raiz/Asc; ≥10 ⇒
//   "com critérios de maior gravidade" (ACC/AHA 2022).
// ══════════════════════════════════════════════════════════════════

export type TierAorta = 'normal' | 'ectasia' | 'aneurisma';

export interface SegmentoAortaResult {
  medidaMM: number;
  tier: TierAorta;
  indiceCm2m: number | null; // só Raiz/Asc (precisa altura)
  graveIndice: boolean;      // indiceCm2m !== null && >= 10
}

const ANEURISMA_MM_RAIZ_ASC = 50;
const ARCO_NORMAL_MAX = 36;
const ARCO_ANEURISMA_MM = 45;

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

function tierRaizAsc(
  normalBoundary: ResultadoAorta,
  medidaMM: number,
  alturaCm: number | null
): SegmentoAortaResult {
  const indiceCm2m = indiceAortaAltura(medidaMM, alturaCm);
  const graveIndice = indiceCm2m !== null && indiceCm2m >= 10;
  if (normalBoundary.grau === 'normal' && medidaMM < ANEURISMA_MM_RAIZ_ASC) {
    return { medidaMM, tier: 'normal', indiceCm2m, graveIndice };
  }
  const tier: TierAorta = medidaMM >= ANEURISMA_MM_RAIZ_ASC ? 'aneurisma' : 'ectasia';
  return { medidaMM, tier, indiceCm2m, graveIndice };
}

/** Raiz aórtica — tier (normal boundary = Z-score/fallback validado). */
export function tierRaizAo(
  medidaMM: number,
  sexo: Sexo,
  asc: number | null,
  idade: number | null,
  alturaCm: number | null
): SegmentoAortaResult {
  return tierRaizAsc(classificarRaizAo(medidaMM, sexo, asc, idade), medidaMM, alturaCm);
}

/** Aorta ascendente — tier (espelha a raiz). */
export function tierAoAscendente(
  medidaMM: number,
  sexo: Sexo,
  asc: number | null,
  alturaCm: number | null
): SegmentoAortaResult {
  return tierRaizAsc(classificarAoAscendente(medidaMM, sexo, asc), medidaMM, alturaCm);
}

/** Arco aórtico — faixa fixa 22–36 / 37–44 / ≥45. Sem índice. */
export function tierArcoAo(medidaMM: number): SegmentoAortaResult {
  let tier: TierAorta = 'normal';
  if (medidaMM >= ARCO_ANEURISMA_MM) tier = 'aneurisma';
  else if (medidaMM > ARCO_NORMAL_MAX) tier = 'ectasia';
  return { medidaMM, tier, indiceCm2m: null, graveIndice: false };
}
