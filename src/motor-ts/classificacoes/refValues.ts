// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Strings de Referência (Tabela de Parâmetros)
// ══════════════════════════════════════════════════════════════════
// Texto de "valor de referência" mostrado na tabela do laudo,
// específico por sexo quando aplicável.
//
// Equivalente a refVal(campo, sexo) do motor original.
// ══════════════════════════════════════════════════════════════════

import type { Sexo } from '../types';

/**
 * Retorna a string do valor de referência (VR) por campo e sexo.
 * Usado na tabela "Medidas e Parâmetros" do laudo.
 *
 * @example
 * refVal('b9', 'M') // "42–58 mm"
 * refVal('b9', 'F') // "38–52 mm"
 */
export function refVal(campo: string, sexo: Sexo): string {
  const isM = sexo !== 'F'; // default M se vazio

  switch (campo) {
    // Câmaras (mm)
    case 'b7':  return isM ? '31–37 mm' : '27–33 mm';   // Raiz Aórtica
    case 'b8':  return isM ? '30–40 mm' : '27–38 mm';   // AE
    case 'b9':  return isM ? '42–58 mm' : '38–52 mm';   // DDVE
    case 'b10': return isM ? '6–10 mm'  : '6–9 mm';     // Septo IV
    case 'b11': return isM ? '6–10 mm'  : '6–9 mm';     // Parede Posterior
    case 'b12': return isM ? '25–40 mm' : '21–35 mm';   // DSVE
    case 'b13': return '21–35 mm';                       // VD (unificado)
    case 'b28': return isM ? '26–34 mm' : '23–31 mm';   // Aorta Asc

    // Volumes / Calculados
    case 'vdf': return isM ? '62–150 ml' : '46–106 ml'; // Vol Diast Final VE
    case 'vsf': return isM ? '21–61 ml'  : '14–42 ml';  // Vol Sist Final VE
    case 'feT': return isM ? '>51%'      : '>53%';      // FE Teichholz
    case 'fs':  return '30–40%';                         // Fração Encurtamento
    case 'massa': return isM ? '<201 g' : '<151 g';     // Massa VE
    case 'imVE':  return isM ? '<103 g/m²' : '<89 g/m²'; // Índice Massa VE
    case 'er':  return '<0,43';                          // Espessura Relativa
    case 'imc': return '<25 kg/m²';                      // IMC

    // Atrial volumes
    case 'b24': return '≤34 ml/m²';                      // LAVI
    case 'b25': return '<30 ml/m²';                      // RAVI (JASE 2025)

    // Diastologia
    case 'b19': return '>50 cm/s';                       // Onda E
    case 'b20': return '≥0,8';                           // Relação E/A
    case 'b21': return '≥7 cm/s';                        // e' septal
    case 'b22': return '≤15';                            // E/e' septal
    case 'b23': return '≤2,8 m/s';                       // Vel IT
    case 'b37': return '<36 mmHg';                       // PSAP
    case 'lars': return '≥18%';                          // LA strain

    // Sistólica VD
    case 'b33': return '≥17 mm';                         // TAPSE

    // Strain
    case 'gls_ve': return '≥|20%|';                      // GLS VE (atualizado)
    case 'gls_vd': return '≥|20%|';                      // GLS VD

    default: return '';
  }
}
