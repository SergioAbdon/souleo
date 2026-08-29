// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Algoritmo Diastológico
// ══════════════════════════════════════════════════════════════════
// Referências:
// - ASE/EACVI 2016: Nagueh SF et al. JASE 2016; 29: 277-314
// - ASE/EACVI 2025 (in press): atualização para FA com LARS
//
// Cutoffs adotados (decisão Dr. Sérgio):
// - E/e' septal isolado: >15 (não >14 — esse é pra média septal+lateral)
// - e' septal: <7 cm/s
// - LAVI: >34 ml/m²
// - Vel. IT: >2,8 m/s
// - LARS: <18% (em FA, critério ASE 2025)
// ══════════════════════════════════════════════════════════════════

import type { ResultadoJ21, Sexo, Ritmo } from '../types';

/**
 * Inputs necessários para o algoritmo j21
 */
export interface InputsDiastologia {
  ritmo: Ritmo;
  sexo: Sexo;
  ondaE: number | null;            // b19
  relacaoEA: number | null;        // b20
  eSeptal: number | null;          // b21
  relacaoEEseptal: number | null;  // b22
  velocidadeIT: number | null;     // b23
  volAEindex: number | null;       // b24 (LAVI)
  laStrain: number | null;         // lars
  feT: number | null;              // FE Teichholz calculada (decimal 0-1)
  feSimpson: number | null;        // b54 (%)
  imVE: number | null;             // Índice massa VE (g/m²)
}

/**
 * Algoritmo j21 — núcleo da classificação diastológica.
 *
 * Retorna texto OU sentinela FA (FA_PRESSAO_ELEVADA / FA_PRESSAO_NORMAL /
 * FA_INDETERMINADA / FA_SEM_DADOS).
 *
 * Lógica:
 * 1. Se ritmo irregular E sem onda A → algoritmo de FA (4 critérios)
 * 2. Se FE deprimida OU IMVE alta → classificação direta por E/A e contagem de critérios
 * 3. Caso contrário (inclusive FE indisponível) → contagem de critérios diastológicos
 *
 * @param inputs Medidas diastológicas
 * @returns String com classificação ou sentinela FA
 */
export function calcularJ21(inputs: InputsDiastologia): ResultadoJ21 {
  const {
    ritmo,
    sexo,
    ondaE,
    relacaoEA,
    eSeptal,
    relacaoEEseptal,
    velocidadeIT,
    volAEindex,
    laStrain,
    feT,
    feSimpson,
    imVE,
  } = inputs;

  // ── Lógica de FA: ritmo irregular + sem onda A ──
  const ehFA = ritmo === 'N' && (relacaoEA === null || relacaoEA === 0);
  if (ehFA) {
    return calcularDiastologiaFA({
      relacaoEEseptal,
      velocidadeIT,
      volAEindex,
      laStrain,
    });
  }

  // ── Lógica sinusal (ou irregular com onda A) ──

  // Sem dados suficientes
  const semDados =
    ondaE === null && relacaoEA === null && eSeptal === null &&
    relacaoEEseptal === null && velocidadeIT === null && volAEindex === null;
  if (semDados) return '';

  // Pré-condições para algoritmo simplificado (FE baixa OU IMVE alta)
  const limFEsimpson = sexo === 'F' ? 54 : 52;
  const limFEteich = sexo === 'F' ? 0.54 : 0.52;
  const limIMVE = sexo === 'F' ? 95 : 115;

  // ASE 2016: Simpson é o método recomendado — quando medido, ele DECIDE sozinho
  // (Teichholz não atropela um Simpson normal, D1). Sem Simpson, Teichholz decide.
  // Sem nenhuma FE não há evidência de FE deprimida: não é gatilho do algoritmo B (D3).
  const feBaixa =
    feSimpson !== null ? feSimpson < limFEsimpson :
    feT !== null ? feT < limFEteich :
    false;

  const massaAlta = imVE !== null && imVE > limIMVE;

  // ── Algoritmo simplificado / B (FE deprimida OU doença miocárdica) ──
  if (feBaixa || massaAlta) {
    // Critérios diretos
    if (relacaoEA !== null && relacaoEA >= 2) {
      return 'Disfunção Diastólica do ventrículo esquerdo de Grau III (Padrão Restritivo)';
    }
    if (relacaoEA !== null && relacaoEA <= 0.8 && ondaE !== null && ondaE <= 50) {
      return 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';
    }
    // Contagem de critérios pra Grau II vs Grau I
    let p = 0;
    if (relacaoEEseptal !== null && relacaoEEseptal > 15) p++;
    if (velocidadeIT !== null && velocidadeIT > 2.8) p++;
    if (volAEindex !== null && volAEindex > 34) p++;
    if (p >= 2) {
      return 'Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal)';
    }
    return 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';
  }

  // ── Algoritmo completo (FE preservada + massa normal) ──
  // Conta critérios alterados
  let c = 0;
  let avaliados = 0;
  if (eSeptal !== null) {
    avaliados++;
    if (eSeptal < 7) c++;
  }
  if (relacaoEEseptal !== null) {
    avaliados++;
    if (relacaoEEseptal > 15) c++;
  }
  if (velocidadeIT !== null) {
    avaliados++;
    if (velocidadeIT > 2.8) c++;
  }
  if (volAEindex !== null) {
    avaliados++;
    if (volAEindex > 34) c++;
  }

  // ASE 2016: decide pela PROPORÇÃO dos critérios AVALIADOS, não por contagem fixa
  // (>50% positivos → disfunção · 50% → indeterminada · <50% → normal). Abaixo de 2
  // avaliados não há evidência suficiente (spec §2.4) → silêncio.
  if (avaliados < 2) return '';
  if (c * 2 < avaliados) return 'Índices diastólicos do ventrículo esquerdo preservados';
  if (c * 2 === avaliados) return 'Função Diastólica do ventrículo esquerdo Indeterminada';

  // Maioria positiva → gradua via E/A e onda E
  if (relacaoEA !== null && relacaoEA >= 2) {
    return 'Disfunção Diastólica do ventrículo esquerdo de Grau III (Padrão Restritivo)';
  }
  if (relacaoEA !== null && relacaoEA <= 0.8 && ondaE !== null && ondaE <= 50) {
    return 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';
  }
  return 'Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal)';
}

/**
 * Algoritmo de FA (ASE/EACVI 2025 in press).
 *
 * Critérios:
 * - E/e' septal > 15
 * - Vel. IT > 2,8 m/s
 * - LAVI > 34 ml/m²
 * - LARS < 18%
 *
 * Decisão:
 * - <2 critérios disponíveis → FA_INDETERMINADA
 * - ≥2 elevados → FA_PRESSAO_ELEVADA
 * - <2 elevados → FA_PRESSAO_NORMAL
 */
function calcularDiastologiaFA(inputs: {
  relacaoEEseptal: number | null;
  velocidadeIT: number | null;
  volAEindex: number | null;
  laStrain: number | null;
}): ResultadoJ21 {
  const { relacaoEEseptal, velocidadeIT, volAEindex, laStrain } = inputs;

  // Sem dados nenhum
  const todoVazio =
    relacaoEEseptal === null && velocidadeIT === null &&
    volAEindex === null && laStrain === null;
  if (todoVazio) return 'FA_SEM_DADOS';

  let avaliados = 0;
  let elevados = 0;

  if (relacaoEEseptal !== null) {
    avaliados++;
    if (relacaoEEseptal > 15) elevados++; // ASE 2016: E/e' septal isolado >15
  }
  if (velocidadeIT !== null) {
    avaliados++;
    if (velocidadeIT > 2.8) elevados++;
  }
  if (volAEindex !== null) {
    avaliados++;
    if (volAEindex > 34) elevados++;
  }
  if (laStrain !== null) {
    avaliados++;
    if (laStrain < 18) elevados++;
  }

  if (avaliados < 2) return 'FA_INDETERMINADA';
  if (elevados >= 2) return 'FA_PRESSAO_ELEVADA';
  return 'FA_PRESSAO_NORMAL';
}
