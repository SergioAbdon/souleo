// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Cálculos Demográficos / Antropométricos
// ══════════════════════════════════════════════════════════════════
// Fórmulas:
// - IMC: peso (kg) / altura (m)² — OMS 2000
// - ASC: DuBois 1916 (constante 71,84 — corrigida do motor antigo que usava 71,74)
// - Idade: anos completos entre dtnasc e dtexame
// ══════════════════════════════════════════════════════════════════

import { truncar } from '../helpers/truncate';
import { calcIdade as calcIdadeHelper } from '../helpers/format';

/**
 * Índice de Massa Corporal (IMC)
 * Referência: OMS 2000 — WHO Technical Report Series 894
 *
 * Cutoffs:
 * - <18,5: magreza
 * - 18,5–24,9: eutrófico
 * - 25,0–29,9: sobrepeso
 * - ≥30,0: obesidade
 *
 * @param peso Peso em kg
 * @param altura Altura em cm
 * @returns IMC em kg/m² (truncado para 1 casa decimal) ou null
 *
 * @example
 * calcIMC(70, 175) // 22.8
 * calcIMC(null, 175) // null
 */
export function calcIMC(peso: number | null, altura: number | null): number | null {
  if (peso === null || altura === null) return null;
  if (peso <= 0 || altura <= 0) return null;
  const alturaM = altura / 100;
  const imc = peso / (alturaM * alturaM);
  return truncar(imc, 1);
}

/**
 * Área de Superfície Corpórea (ASC) — Fórmula DuBois 1916
 * Referência: DuBois D, DuBois EF. Arch Intern Med 1916; 17: 863–871.
 *
 * Constante: 71,84 (DuBois original)
 * Motor antigo usava 71,74 — correção aprovada pelo Dr. Sérgio em 2026-05-03
 *
 * Fórmula: ASC = 0,007184 × peso(kg)^0,425 × altura(cm)^0,725
 * Equivalente a: 0,0001 × 71,84 × peso^0,425 × altura^0,725
 *
 * @param peso Peso em kg
 * @param altura Altura em cm
 * @returns ASC em m² (truncado para 2 casas) ou null
 *
 * @example
 * calcASC(70, 175) // 1.85
 */
export function calcASC(peso: number | null, altura: number | null): number | null {
  if (peso === null || altura === null) return null;
  if (peso <= 0 || altura <= 0) return null;
  // 0.0001 * 71.84 = 0.007184 (constante DuBois 1916 original)
  const asc = 0.0001 * 71.84 * Math.pow(peso, 0.425) * Math.pow(altura, 0.725);
  return truncar(asc, 2);
}

/**
 * Calcula idade do paciente em anos completos.
 * Wrapper sobre helper format.calcIdade.
 *
 * @param dtnasc Data de nascimento (YYYY-MM-DD)
 * @param dtexame Data do exame (YYYY-MM-DD)
 * @returns Idade em anos completos ou null
 *
 * @example
 * calcIdade('1980-05-15', '2026-05-03') // 45
 */
export function calcIdade(dtnasc: string, dtexame: string): number | null {
  return calcIdadeHelper(dtnasc, dtexame);
}
