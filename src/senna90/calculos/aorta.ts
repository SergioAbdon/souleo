// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Cálculos da Aorta
// ══════════════════════════════════════════════════════════════════
// Referências:
// - Roman MJ, Devereux RB et al. AJC 1989; 64: 507-512 (raiz <40 vs ≥40)
// - Devereux RB et al. AJC 2012; 110: 1189-1194 (Strong Heart Study)
//
// Z-score / fallback abaixo (classificarRaizAo) sobrevivem só como REDE DE
// SEGURANÇA da raiz quando o exame não traz idade — seus graus internos
// ('leve'/'moderada'/'importante') não viram texto de laudo desde a F1.
// A régua clínica em vigor é a de tiers normal/dilatacao/aneurisma da
// segunda metade deste arquivo (ACC/AHA 2022 + WASE 2022, Senna93 §2.2).
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
// SPEC AORTA — Tiers normal/dilatacao/aneurisma (Senna93 §2.2, F1)
// ══════════════════════════════════════════════════════════════════
// docs/decisoes/2026-05-16-spec-aorta.md (base) + spec Senna93 §2.2
// (decisão do arco 26/08/2026, ACC/AHA 2022).
//
// Fronteira normal→dilatação, fonte mais recente POR SEGMENTO:
// • RAIZ : WASE 2022 (seio de Valsalva), corte por SEXO + IDADE =
//   média + 1,96·DP (percentil 97,5, critério do paper). Sem idade
//   no exame → cai no Z-score Roman validado (rede de segurança),
//   e o motor emite o alerta AORTA_SEM_IDADE.
// • ASCENDENTE : ASE/EACVI Chamber Quantification 2015 (Tabela 14,
//   ascendente proximal) — Homem ≤ 38 · Mulher ≤ 35 mm (média+2DP).
// • ARCO : NENHUMA diretriz tabula o normal do arco transverso.
//   Teto prático ~40 mm (ACC/AHA 2022, "aproximado, não validado"),
//   sem sexo e sem graus.
//
// Dilatação→ANEURISMA (ABSOLUTO): Raiz/Asc ≥ 45 mm (ACC/AHA 2022,
// adulto médio). O arco NUNCA vira "aneurisma" (sem tabela de normal).
// 50 mm (raiz/asc) e 55 mm (arco) são limiares CIRÚRGICOS — viram
// nota de encaminhamento (`notaCirurgica`), não mudam o nome do tier.
// "Ectasia leve/moderada/importante" morreu (F1).
//
// Índice área transversal (cm²) ÷ altura (m): só Raiz/Asc; ≥ 10 ⇒
// "com critérios de maior gravidade" (ACC/AHA 2022). Arco sem índice.
// ══════════════════════════════════════════════════════════════════

export type TierAorta = 'normal' | 'dilatacao' | 'aneurisma';

export interface SegmentoAortaResult {
  medidaMM: number;
  tier: TierAorta;
  indiceCm2m: number | null; // só Raiz/Asc (precisa altura)
  graveIndice: boolean;      // indiceCm2m !== null && >= 10
  notaCirurgica: boolean;    // raiz/asc >= 50 mm · arco >= 55 mm (ACC/AHA 2022)
}

// ACC/AHA 2022 (spec Senna93 §2.2): dilatação = acima do previsto p/ sexo+idade
// e < 45 mm; ANEURISMA >= 45 mm (adulto médio); 50/55 = limiares CIRÚRGICOS
// (nota de encaminhamento, não mudança de nome). "Ectasia leve/mod/imp" morreu.
const ANEURISMA_MM_RAIZ_ASC = 45;
const NOTA_CIRURGICA_MM_RAIZ_ASC = 50;
// Arco: NENHUMA diretriz tabula normal do arco; teto prático ~40 mm (ACC/AHA,
// "aproximado, não validado"). > 40 = "dilatado" SEM graus; >= 55 = cirurgia.
export const ARCO_NORMAL_MAX = 40;
const NOTA_CIRURGICA_MM_ARCO = 55;

/**
 * ASE/EACVI Chamber Quantification 2015, Tabela 14 — aorta ascendente
 * PROXIMAL em adultos normais: Homem 30 ± 4 mm · Mulher 27 ± 4 mm.
 * Limite superior do normal = média + 2 DP → Homem 38 · Mulher 35 mm.
 * Arco usa o mesmo (Chamber não tabula o arco transverso isolado).
 */
export function corteChamberAsc(sexo: Sexo): number {
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
 *   Homem : 38 / 40 / 41      Mulher : 35 / 36 / 38
 * (♀ ≥66 anos: 37,5 mm cru arredonda para 38 — correção F1.)
 */
export function corteWaseRaiz(sexo: Sexo, idade: number): number {
  const homem = sexo !== 'F';
  if (idade <= 40) return homem ? 38 : 35;
  if (idade <= 65) return homem ? 40 : 36;
  return homem ? 41 : 38;
}

/** Monta o tier a partir de "está acima do normal?" + medida + altura. */
function montarTierRaizAsc(
  acimaDoNormal: boolean,
  medidaMM: number,
  alturaCm: number | null
): SegmentoAortaResult {
  const indiceCm2m = indiceAortaAltura(medidaMM, alturaCm);
  const graveIndice = indiceCm2m !== null && indiceCm2m >= 10;
  const notaCirurgica = medidaMM >= NOTA_CIRURGICA_MM_RAIZ_ASC;
  if (!acimaDoNormal && medidaMM < ANEURISMA_MM_RAIZ_ASC) {
    return { medidaMM, tier: 'normal', indiceCm2m, graveIndice, notaCirurgica };
  }
  const tier: TierAorta = medidaMM >= ANEURISMA_MM_RAIZ_ASC ? 'aneurisma' : 'dilatacao';
  return { medidaMM, tier, indiceCm2m, graveIndice, notaCirurgica };
}

/**
 * Raiz aórtica — fronteira normal→dilatação pelo WASE 2022 (sexo+idade).
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
 * Aorta ascendente — fronteira normal→dilatação pelo ASE Chamber 2015
 * (≤38 ♂ / ≤35 ♀). Aneurisma ≥ 45 mm. Mantém índice cm²/m.
 */
export function tierAoAscendente(
  medidaMM: number,
  sexo: Sexo,
  _asc: number | null,
  alturaCm: number | null
): SegmentoAortaResult {
  return montarTierRaizAsc(medidaMM > corteChamberAsc(sexo), medidaMM, alturaCm);
}

/** Arco — sem sexo, sem graus, sem índice (spec §2.2, decisão do arco 26/08). */
export function tierArcoAo(medidaMM: number): SegmentoAortaResult {
  const tier: TierAorta = medidaMM > ARCO_NORMAL_MAX ? 'dilatacao' : 'normal';
  return {
    medidaMM, tier, indiceCm2m: null, graveIndice: false,
    notaCirurgica: medidaMM >= NOTA_CIRURGICA_MM_ARCO,
  };
}
