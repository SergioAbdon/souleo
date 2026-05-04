// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Achados: Escore de Wilkins & Block
// ══════════════════════════════════════════════════════════════════
// Função: jWilkins
//
// Retorna sentinela `__WILKINS__{json}` que é renderizada como bloco recuado.
//
// COMPORTAMENTO PRESERVADO: Wilkins =8 = "limítrofe" (decisão Dr. Sérgio).
// ══════════════════════════════════════════════════════════════════

/**
 * WK_DESC — Descrições por categoria (índices 0-4)
 * Usado pelo bloco recuado renderizado no laudo.
 */
export const WK_DESC = {
  mob: [
    'Normal',
    'Boa mobilidade da valva, com restrição apenas na ponta do folheto',
    'Redução da mobilidade na porção média e na base dos folhetos',
    'Mobilidade somente na base dos folhetos',
    'Nenhum ou mínimo movimento dos folhetos',
  ],
  esp: [
    'Normal',
    'Espessura valvar próxima do normal (4–5 mm)',
    'Grande espessamento nas margens do folheto',
    'Espessamento de todo o folheto (5–8 mm)',
    'Grande espessamento de todo o folheto (>8–10 mm)',
  ],
  sub: [
    'Normal',
    'Espessamento mínimo da corda tendínea logo abaixo da valva',
    'Espessamento da corda até terço proximal',
    'Espessamento da corda até terço distal',
    'Extenso espessamento e encurtamento de toda corda até músculo papilar',
  ],
  cal: [
    'Sem calcificação',
    'Uma única área de calcificação',
    'Calcificações nas margens dos folhetos',
    'Calcificações extensivas à porção média do folheto',
    'Extensa calcificação em todo o folheto',
  ],
} as const;

/**
 * Payload da sentinela __WILKINS__
 */
export interface WilkinsPayload {
  mob: number;
  esp: number;
  sub: number;
  cal: number;
  sc: number;
  concFrase: string;
}

/**
 * jWilkins — Retorna sentinela `__WILKINS__{json}` ou string vazia.
 *
 * Cutoffs (preservados):
 * - ≤7: favorável para valvuloplastia
 * - =8: limítrofe
 * - ≥9: NÃO candidato
 */
export function jWilkins(
  ativo: boolean,
  mob: number,
  esp: number,
  sub: number,
  cal: number
): string {
  if (!ativo) return '';

  const sc = mob + esp + sub + cal;

  let concFrase: string;
  if (sc >= 9) {
    concFrase = 'Pacientes com escore de Wilkins maior ou igual a 9 NÃO são candidatos a valvuloplastia mitral percutânea.';
  } else if (sc >= 8) {
    concFrase = `Escore de Wilkins & Block de ${sc} pontos. Paciente no limite para valvuloplastia mitral percutânea.`;
  } else {
    concFrase = `Escore de Wilkins & Block de ${sc} pontos. Paciente favorável para valvuloplastia mitral percutânea (escore ≤ 8).`;
  }

  const payload: WilkinsPayload = { mob, esp, sub, cal, sc, concFrase };
  return `__WILKINS__${JSON.stringify(payload)}`;
}

/**
 * Calcula apenas o score (útil pra tooltip/display)
 */
export function calcWilkinsScore(
  ativo: boolean,
  mob: number,
  esp: number,
  sub: number,
  cal: number
): number | null {
  if (!ativo) return null;
  return mob + esp + sub + cal;
}
