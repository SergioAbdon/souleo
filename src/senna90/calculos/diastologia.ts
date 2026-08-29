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
 * Disfunção presente por maioria de critérios, mas sem o fluxo mitral que o
 * ASE 2016 usa para atribuir o grau (anexo §8.2 da auditoria de 28/08/2026).
 */
export const SEM_GRADUACAO =
  'Disfunção Diastólica do ventrículo esquerdo presente, de grau não determinado (fluxo mitral não avaliado).';

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
 * Maioria dos 3 critérios de PRESSÃO DE ENCHIMENTO do ASE 2016 (Fig. 8):
 * E/e' septal >15 · Vel. IT >2,8 m/s · LAVI >34 ml/m². Decide pela maioria dos
 * AVALIADOS (D2): abaixo de 2 medidos, ou empate 50%, não há decisão.
 *
 * É a MESMA régua nos dois ramos — foi extraída na revisão final (F1) porque o
 * ramo A não a aplicava: depois que a entrada por maioria da Fig. 7 (4 critérios,
 * inclui o e' septal) dizia "disfunção presente", a zona média caía direto em
 * Grau II. Com os mesmos dados diastológicos isso dava Grau II com FE preservada
 * e Indeterminada com FE deprimida — inversão de gravidade contra a própria FE.
 */
type MaioriaPressao = 'positiva' | 'negativa' | 'indeterminada';

function maioriaPressaoEnchimento(i: {
  relacaoEEseptal: number | null;
  velocidadeIT: number | null;
  volAEindex: number | null;
}): MaioriaPressao {
  let avaliados = 0;
  let positivos = 0;
  if (i.relacaoEEseptal !== null) {
    avaliados++;
    if (i.relacaoEEseptal > 15) positivos++;
  }
  if (i.velocidadeIT !== null) {
    avaliados++;
    if (i.velocidadeIT > 2.8) positivos++;
  }
  if (i.volAEindex !== null) {
    avaliados++;
    if (i.volAEindex > 34) positivos++;
  }
  if (avaliados < 2 || positivos * 2 === avaliados) return 'indeterminada';
  return positivos * 2 > avaliados ? 'positiva' : 'negativa';
}

/** Gatilhos de seleção do algoritmo B. */
export interface GatilhosRamoB {
  feBaixa: boolean;
  massaAlta: boolean;
}

/**
 * Gatilhos do algoritmo B (FE deprimida OU doença miocárdica) — as duas réguas
 * dependem de sexo (FE Simpson 52♂/54♀ · Teichholz 0,52/0,54 · imVE 115♂/95♀).
 *
 * Sem sexo, a régua masculina NÃO roda calada (postura C8 da casa / D6): o
 * gatilho decide só onde as duas réguas CONCORDAM (FE <52 é baixa em ambas,
 * ≥54 normal em ambas; imVE >115 alta em ambas, ≤95 normal em ambas). Na faixa
 * de discordância — FE [52,54) · imVE (95,115] — o gatilho é NÃO-AVALIÁVEL
 * (não dispara). O alerta SEXO_AUSENTE do motor (motor.ts) não depende mais
 * dessa ambiguidade: dispara sempre que a régua da FE Simpson foi consultada
 * sem sexo (`feSimpson !== null`), porque a FRASE da FE Simpson já silencia
 * fora dessa faixa também (revisão T4 — `sexoAmbiguo` removido daqui, ficou
 * morto no motor).
 *
 * ASE 2016: Simpson é o método recomendado — quando medido, ele DECIDE sozinho
 * (Teichholz não atropela um Simpson normal, D1). Sem Simpson, Teichholz decide.
 * Sem nenhuma FE não há evidência de FE deprimida: não é gatilho do ramo B (D3).
 */
export function gatilhosRamoB(i: {
  sexo: Sexo;
  feSimpson: number | null;
  feT: number | null;
  imVE: number | null;
}): GatilhosRamoB {
  const regua = (alteradoM: boolean, alteradoF: boolean): boolean | 'ambiguo' =>
    i.sexo === 'M' ? alteradoM :
    i.sexo === 'F' ? alteradoF :
    alteradoM === alteradoF ? alteradoM : 'ambiguo';

  const fe =
    i.feSimpson !== null ? regua(i.feSimpson < 52, i.feSimpson < 54) :
    i.feT !== null ? regua(i.feT < 0.52, i.feT < 0.54) :
    false;
  const massa = i.imVE !== null ? regua(i.imVE > 115, i.imVE > 95) : false;

  return {
    feBaixa: fe === true,
    massaAlta: massa === true,
  };
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
  const { feBaixa, massaAlta } = gatilhosRamoB({ sexo, feSimpson, feT, imVE });

  // ── Algoritmo simplificado / B (FE deprimida OU doença miocárdica) ──
  if (feBaixa || massaAlta) {
    // Regras DIRETAS do fluxo mitral (ASE 2016, Fig. 8) — decidem sozinhas, sem
    // exigir critério de pressão de enchimento.
    if (relacaoEA !== null && relacaoEA >= 2) {
      return 'Disfunção Diastólica do ventrículo esquerdo de Grau III (Padrão Restritivo)';
    }
    if (relacaoEA !== null && relacaoEA <= 0.8 && ondaE !== null && ondaE <= 50) {
      return 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';
    }

    // Critérios de pressão de enchimento: decide a MAIORIA dos AVALIADOS (D2).
    // Antes, campo ausente contava como normal e o `return` final era Grau I
    // incondicional — o ramo B graduava com 0 critério medido.
    const maioriaB = maioriaPressaoEnchimento({ relacaoEEseptal, velocidadeIT, volAEindex });
    if (maioriaB === 'indeterminada') {
      return 'Função Diastólica do ventrículo esquerdo Indeterminada';
    }
    const maioriaPositiva = maioriaB === 'positiva';

    // Zona média do algoritmo B — só existe com fluxo mitral: E/A ≤0,8 com
    // E >50, ou 0,8 < E/A < 2 (E/A ≥2 e E/A ≤0,8 com E ≤50 já retornaram).
    const zonaMedia = relacaoEA !== null && (relacaoEA > 0.8 || ondaE !== null);
    if (zonaMedia) {
      return maioriaPositiva
        ? 'Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal)'
        : 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';
    }
    // Sem fluxo mitral utilizável (anexo §8.2): a maioria positiva prova pressão
    // de enchimento elevada — disfunção presente, mas o GRAU vem do padrão do
    // fluxo, que não foi medido. Maioria negativa sem E/A não decide nem grau
    // (E/A ≥2 daria III) nem presença: o gatilho do ramo é sistólico/massa.
    return maioriaPositiva
      ? SEM_GRADUACAO
      : 'Função Diastólica do ventrículo esquerdo Indeterminada';
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

  // Maioria positiva → há disfunção. O GRAU, porém, é definido pelo padrão do
  // FLUXO MITRAL (ASE 2016: E/A ≥2 → III; E/A ≤0,8 com E ≤50 → I; E/A ≤0,8 com
  // E >50 ou E/A entre 0,8 e 2 → critérios → II). Sem o dado de fluxo que a
  // decisão consome, o guideline NÃO fornece grau (anexo §8.2) — o laudo
  // descreve a disfunção sem afirmar um grau que não foi medido.
  if (relacaoEA !== null && relacaoEA >= 2) {
    return 'Disfunção Diastólica do ventrículo esquerdo de Grau III (Padrão Restritivo)';
  }
  if (relacaoEA === null) return SEM_GRADUACAO; // sem fluxo mitral não há zona
  if (relacaoEA <= 0.8) {
    // A separação Grau I × critérios exige a onda E (corte 50 cm/s).
    if (ondaE === null) return SEM_GRADUACAO;
    if (ondaE <= 50) {
      return 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';
    }
  }

  // Zona média (E/A ≤0,8 com E >50, ou 0,8 < E/A < 2): o ASE 2016 manda contar
  // os 3 critérios de PRESSÃO da Fig. 8 — não é a mesma contagem da entrada, que
  // é a Fig. 7 e inclui o e' septal (critério de disfunção, não de pressão).
  // Antes daqui o código caía direto em Grau II (revisão final F1): com a entrada
  // por maioria da T2, que admite 2 de 3, a Fig. 8 podia estar EMPATADA e ainda
  // assim sair "Grau II" — enquanto o ramo B, com os mesmos dados, dizia
  // Indeterminada. Mesma régua agora, mesmo resultado.
  // Nota: com a entrada exigindo maioria da Fig. 7, a saída 'negativa' aqui é
  // inalcançável por álgebra (para a Fig. 8 ser negativa-maioria a Fig. 7 nunca
  // fecha maioria, nem com o e' positivo) — mas a regra do guideline fica
  // escrita inteira, e é ela que sobrevive se a entrada mudar de novo.
  const maioriaA = maioriaPressaoEnchimento({ relacaoEEseptal, velocidadeIT, volAEindex });
  if (maioriaA === 'indeterminada') {
    return 'Função Diastólica do ventrículo esquerdo Indeterminada';
  }
  return maioriaA === 'positiva'
    ? 'Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal)'
    : 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';
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
 * - maioria dos AVALIADOS elevada → FA_PRESSAO_ELEVADA
 * - empate 50% → FA_INDETERMINADA (mesma régua do ramo sinusal)
 * - maioria não-elevada → FA_PRESSAO_NORMAL
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

  // Maioria dos AVALIADOS, não contagem fixa: 2 de 4 é empate (indeterminada),
  // como no ramo sinusal — o `elevados >= 2` fixo chamava isso de "elevada".
  if (avaliados < 2 || elevados * 2 === avaliados) return 'FA_INDETERMINADA';
  if (elevados * 2 > avaliados) return 'FA_PRESSAO_ELEVADA';
  return 'FA_PRESSAO_NORMAL';
}
