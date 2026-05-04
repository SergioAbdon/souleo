// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — API Pública
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
import { gerarAchados } from './achados/index';
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
function gerarAlertas(m: MedidasEcoTT): AlertaUI[] {
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
  const derivados = calcularDerivados(medidas);
  const achados = gerarAchados(medidas, derivados);
  const conclusoes = gerarConclusao(medidas, derivados);
  const alertas = gerarAlertas(medidas);

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
export { setDiastManualConcl, setDiastTextoLivreConcl } from './conclusoes/index';
