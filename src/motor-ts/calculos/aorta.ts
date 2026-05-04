// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Cálculos da Aorta
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
  // ── Fallback sem ASC (ASE 2015) ──
  // Raiz: M [37, 42, 49] mm (normal/leve/moderada → importante >49)
  //       F [33, 40, 47] mm
  const limites = sexo === 'F' ? [33, 40, 47] : [37, 42, 49];
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
  // Fallback: M [34, 39, 48] / F [31, 36, 43]
  const limites = sexo === 'F' ? [31, 36, 43] : [34, 39, 48];
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
  // Fallback: M=F [30, 35, 41]
  const limites = [30, 35, 41];
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
