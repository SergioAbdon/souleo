// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — API Pública
// ══════════════════════════════════════════════════════════════════
// Função principal: calcular(medidas) → ResultadoLaudo completo
//
// Esta é a API que o React vai consumir (substitui calcAll() do motor antigo).
// ══════════════════════════════════════════════════════════════════

import type { MedidasEcoTT, CalculosDerivados, ResultadoLaudo, AlertaUI } from './types';

import { calcIMC, calcASC, calcIdade } from './calculos/demografia';
import {
  calcVDF, calcVSF, calcFE_Teichholz, calcFS,
  calcMassaVE, calcIMVE, calcRWT, calcAoAE, calcAreaAoIndexada,
} from './calculos/ventricle';
import {
  classificarEstenoseMitral, classificarEstenoseAortica,
  classificarEstenoseTricuspide, classificarEstenosePulmonar,
} from './calculos/valvas';
import { calcWilkinsScore } from './achados/wilkins';
import { gatilhosRamoB } from './calculos/diastologia';
import { gerarAchados, setDiastModo, setDiastManual, setDiastTextoLivre } from './achados/index';
import { gerarConclusao } from './conclusoes/index';

// ══ MOTOR PRINCIPAL ════════════════════════════════════════════

/**
 * Calcula todos os derivados a partir das medidas.
 */
export function calcularDerivados(medidas: MedidasEcoTT): CalculosDerivados {
  const { gerais, camaras, diastolica, estenoses, wilkins, identificacao } = medidas;

  // Demografia
  const imc = calcIMC(gerais.peso, gerais.altura);
  const asc = calcASC(gerais.peso, gerais.altura);
  const idade = calcIdade(identificacao.pacienteDtnasc, identificacao.dataExame);

  // Câmaras / Ventrículo
  const aoae = calcAoAE(camaras.raizAo, camaras.ae);
  const vdf = calcVDF(camaras.ddve);
  const vsf = calcVSF(camaras.dsve);
  const feT = calcFE_Teichholz(camaras.ddve, camaras.dsve);
  const fs = calcFS(camaras.ddve, camaras.dsve);
  const massa = calcMassaVE(camaras.ddve, camaras.septoIV, camaras.paredePosterior);
  const imVE = calcIMVE(massa, asc);
  const er = calcRWT(camaras.ddve, camaras.septoIV, camaras.paredePosterior);
  const aoIdx = calcAreaAoIndexada(estenoses.areaAo, asc);

  // Estenoses
  const estenMitGrau = classificarEstenoseMitral(estenoses.gradMedMitral, estenoses.areaMitral);
  const estenAoGrau = classificarEstenoseAortica(estenoses.gradMaxAo, estenoses.gradMedAo, estenoses.areaAo);
  const estenTricGrau = classificarEstenoseTricuspide(estenoses.gradMedTric, estenoses.areaTric);
  const estenPulmGrau = classificarEstenosePulmonar(estenoses.gradMaxPulm);

  // Wilkins
  const wilkinsScore = calcWilkinsScore(
    wilkins.ativo,
    wilkins.mobilidade,
    wilkins.espessura,
    wilkins.subvalvar,
    wilkins.calcificacao,
  );

  return {
    imc, asc, aoae, vdf, vsf, feT, fs,
    massa, imVE, er, aoIdx, idade,
    estenMitGrau, estenAoGrau, estenTricGrau, estenPulmGrau,
    wilkinsScore,
  };
}

/**
 * Gera lista de alertas visuais.
 */
function gerarAlertas(m: MedidasEcoTT, d: CalculosDerivados): AlertaUI[] {
  const alertas: AlertaUI[] = [];

  // Vel IT preenchida sem PSAP
  if (m.diastolica.velocidadeIT && m.diastolica.velocidadeIT > 0
      && (!m.diastolica.psap || m.diastolica.psap === 0)) {
    alertas.push({
      tipo: 'IT_SEM_PSAP',
      campo: 'b37',
      mensagem: 'Velocidade IT preenchida sem PSAP. Considere adicionar a estimativa.',
    });
  }

  // Refluxo Pulmonar sem PMAP
  if (m.valvas.refluxoPulmonar && (!m.valvas.pmap || m.valvas.pmap === 0)) {
    alertas.push({
      tipo: 'REFLUXO_PULM_SEM_PMAP',
      campo: 'psmap',
      mensagem: 'Refluxo Pulmonar preenchido sem PMAP. Considere estimar a Pressão Média da Artéria Pulmonar.',
    });
  }

  // Raiz aórtica medida sem data de nascimento → classificação cai no Z-score
  // (rede de segurança). O Senna93 AVISA em vez de escolher em silêncio (spec A7).
  if (m.camaras.raizAo && m.camaras.raizAo > 0
      && calcIdade(m.identificacao.pacienteDtnasc, m.identificacao.dataExame) === null) {
    alertas.push({
      tipo: 'AORTA_SEM_IDADE',
      campo: 'dtnasc',
      mensagem: 'Raiz aórtica medida sem data de nascimento — referência por idade indisponível (usando previsão por superfície corporal).',
    });
  }

  // Wilkins ativado com categoria em 0 (não avaliada). Antes o motor somava o
  // 0 e imprimia "TOTAL 0 pts"; agora o bloco some e o médico é avisado (B29/V8).
  if (m.wilkins.ativo && ![m.wilkins.mobilidade, m.wilkins.espessura, m.wilkins.subvalvar, m.wilkins.calcificacao]
      .every((v) => Number.isInteger(v) && v >= 1 && v <= 4)) {
    alertas.push({
      tipo: 'WILKINS_INCOMPLETO',
      campo: 'wk-mob',
      mensagem: 'Escore de Wilkins ativado com categoria não avaliada — pontue as 4 categorias (1 a 4) ou desative o escore.',
    });
  }

  // Massa calculável (DDVE+SIV+PP) mas sem ASC: o índice de massa fica null e o
  // gatilho de HVE da diastologia vira `false` por dado AUSENTE — silêncio mudo
  // (NOVO-1). Alerta de TELA: orienta o preenchimento, não é frase de laudo.
  if (d.massa !== null && d.imVE === null) {
    alertas.push({
      tipo: 'MASSA_NAO_INDEXAVEL',
      campo: 'peso',
      mensagem: 'Massa do VE calculada mas não indexável — informe peso e altura para o índice de massa.',
    });
  }

  // Sexo ausente: as frases silenciam, a tabela fica sem VR/realce e as réguas
  // de FE/imVE da diastologia só decidem onde ♂ e ♀ concordam — este alerta
  // explica o porquê em vez de deixar o vazio mudo (C8/D6/NOVO-2).
  const temMedidaClinica = [
    m.camaras.raizAo, m.camaras.ae, m.camaras.ddve, m.camaras.septoIV,
    m.camaras.paredePosterior, m.camaras.dsve, m.camaras.vd,
    m.camaras.aoAscendente, m.camaras.arcoAo,
  ].some((v) => v !== null && v > 0);
  // …e também quando uma régua dependente de sexo foi consultada na zona
  // ambígua (exame só com diastologia/FE não tem medida de câmara nenhuma).
  const { sexoAmbiguo } = gatilhosRamoB({
    sexo: m.gerais.sexo,
    feSimpson: m.sistolica.feSimpson,
    feT: d.feT,
    imVE: d.imVE,
  });
  if (!m.gerais.sexo && (temMedidaClinica || sexoAmbiguo)) {
    alertas.push({
      tipo: 'SEXO_AUSENTE',
      campo: 'sexo',
      mensagem: 'Sexo não informado — referências e classificações dependentes de sexo estão suprimidas ou limitadas.',
    });
  }

  return alertas;
}

/**
 * calcular — API principal do motor.
 *
 * Recebe medidas tipadas, retorna resultado completo (derivados + achados + conclusões + alertas).
 *
 * @example
 * const resultado = calcular(medidasDoLaudo);
 * console.log(resultado.derivados.imc);
 * resultado.achados.forEach(a => console.log(a));
 * resultado.conclusoes.forEach((c, i) => console.log(`${i+1}. ${c}`));
 */
export function calcular(medidas: MedidasEcoTT): ResultadoLaudo {
  // Modo manual da diastólica (D3/S5-T3): `medidas.diastolica` carrega a
  // seleção do médico (vinda do adapter), mas achados/index.ts guarda o
  // modo/seleção em variáveis de módulo (mesmo padrão do motor antigo — ver
  // DIAST_SENTENCAS). conclusoes/index.ts lê o mesmo estado via getters
  // (dono único desde a T11/B30). Sem sincronizar aqui a cada chamada, a
  // seleção nunca chegava no texto (e, pior, um exame em modo manual
  // "vazava" pro próximo cálculo se não fosse resetada).
  setDiastModo(medidas.diastolica.modoManual);
  setDiastManual(medidas.diastolica.selecaoManual);
  setDiastTextoLivre(medidas.diastolica.textoLivre);

  const derivados = calcularDerivados(medidas);
  const achados = gerarAchados(medidas, derivados);
  const conclusoes = gerarConclusao(medidas, derivados);
  const alertas = gerarAlertas(medidas, derivados);

  return {
    derivados,
    achados,
    conclusoes,
    alertas,
  };
}

// Re-exports para conveniência
export type { MedidasEcoTT, CalculosDerivados, ResultadoLaudo } from './types';
export { setDiastModo, setDiastManual, setDiastTextoLivre, getDiastModo } from './achados/index';
