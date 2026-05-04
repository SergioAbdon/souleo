// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Out-of-Range Checker
// ══════════════════════════════════════════════════════════════════
// Verifica se um valor está fora do range de referência por sexo.
// Usado pra marcar células da tabela como "alert" (vermelho).
//
// Equivalente a isOOR(campo, val, sexo) do motor original.
//
// COMPORTAMENTO PRESERVADO: IMC sem alerta (decisão Dr. Sérgio).
// ══════════════════════════════════════════════════════════════════

import type { Sexo } from '../types';

/**
 * Retorna true se o valor estiver fora do range fisiológico do parâmetro.
 *
 * @param campo ID do campo (b7-b13, b28, etc.)
 * @param val Valor numérico
 * @param sexo M ou F (afeta range pra muitos parâmetros)
 *
 * @example
 * isOOR('b9', 65, 'M') // true (DDVE M normal: 42-58)
 * isOOR('b9', 50, 'M') // false
 */
export function isOOR(campo: string, val: number | null, sexo: Sexo): boolean {
  if (val === null || val === undefined) return false;
  const isM = sexo !== 'F';

  switch (campo) {
    // Câmaras (mm) — fora do range = alerta
    case 'b7':
      return isM ? (val < 31 || val > 37) : (val < 27 || val > 33);
    case 'b8':
      return isM ? (val < 30 || val > 40) : (val < 27 || val > 38);
    case 'b9':
      return isM ? (val < 42 || val > 58) : (val < 38 || val > 52);
    case 'b10':
      return isM ? (val < 6 || val > 10) : (val < 6 || val > 9);
    case 'b11':
      return isM ? (val < 6 || val > 10) : (val < 6 || val > 9);
    case 'b12':
      return isM ? (val < 25 || val > 40) : (val < 21 || val > 35);
    case 'b13':
      return val < 21 || val > 35; // unificado
    case 'b28':
      return isM ? (val < 26 || val > 34) : (val < 23 || val > 31);

    // Atrial volumes
    case 'b24': // LAVI
      return val > 34;
    case 'b25': // RAVI (JASE 2025 unificado)
      return val >= 30;

    // Diastologia (anormalidade)
    case 'b19': return val < 50; // Onda E baixa
    case 'b20': return val < 0.8 || val >= 2; // E/A
    case 'b21': return val < 7; // e' septal baixa
    case 'b22': return val > 15; // E/e' septal elevada
    case 'b23': return val > 2.8; // Vel IT elevada
    case 'b37': return val >= 36; // PSAP elevada

    // Sistólica VD
    case 'b33': return val < 17; // TAPSE baixa

    // Strain (valores negativos)
    case 'gls_ve': return Math.abs(val) < 20; // <|20%| reduzido
    case 'gls_vd': return Math.abs(val) < 20;
    case 'lars': return val < 18; // reservoir reduzido

    // IMC — DECISÃO PRESERVADA: sem alerta automático
    case 'imc': return false;

    // Calculados (na tabela)
    case 'feT':
      return isM ? val < 0.51 : val < 0.53;
    case 'fs':
      return val < 0.30 || val > 0.40;
    case 'massa':
      return isM ? val >= 201 : val >= 151;
    case 'imVE':
      return isM ? val >= 103 : val >= 89;
    case 'er':
      return val >= 0.43;

    default:
      return false;
  }
}

/**
 * Versão extensa que retorna não apenas se está OOR mas também
 * a direção (alta ou baixa). Útil pra UI mais rica.
 */
export function checkOOR(
  campo: string,
  val: number | null,
  sexo: Sexo
): { oor: boolean; direcao: 'normal' | 'baixo' | 'alto' } {
  if (val === null) return { oor: false, direcao: 'normal' };
  if (!isOOR(campo, val, sexo)) return { oor: false, direcao: 'normal' };

  // Determina direção
  const isM = sexo !== 'F';
  switch (campo) {
    case 'b7':  case 'b8':  case 'b9':
    case 'b10': case 'b11': case 'b12':
    case 'b13': case 'b28':
      // Para diâmetros, "alto" = aumentado (mais comum); "baixo" = pequeno
      const limiteAlto = getLimiteSuperior(campo, isM);
      return { oor: true, direcao: val > limiteAlto ? 'alto' : 'baixo' };

    case 'b24': case 'b25': case 'b22': case 'b23':
    case 'b37': case 'massa': case 'imVE': case 'er':
      return { oor: true, direcao: 'alto' };

    case 'b19': case 'b21': case 'b33': case 'lars':
    case 'feT':
      return { oor: true, direcao: 'baixo' };

    case 'gls_ve': case 'gls_vd':
      return { oor: true, direcao: 'baixo' }; // strain reduzido = anormal

    default:
      return { oor: true, direcao: 'normal' };
  }
}

// ── Helper interno ──
function getLimiteSuperior(campo: string, isM: boolean): number {
  switch (campo) {
    case 'b7':  return isM ? 37 : 33;
    case 'b8':  return isM ? 40 : 38;
    case 'b9':  return isM ? 58 : 52;
    case 'b10': return isM ? 10 : 9;
    case 'b11': return isM ? 10 : 9;
    case 'b12': return isM ? 40 : 35;
    case 'b13': return 35;
    case 'b28': return isM ? 34 : 31;
    default: return Infinity;
  }
}
