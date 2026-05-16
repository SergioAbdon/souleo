// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Orquestrador de Achados
// ══════════════════════════════════════════════════════════════════
// gerarAchados(d) — produz lista de strings na ordem clínica fixa.
//
// ORDEM PRESERVADA do motor original (linhas 917-974 motorv8mp4.js):
// 1.  Ritmo (j2)
// 2.  AE (j4 prevalece sobre j3)
// 3.  AD (j5)
// 4.  VE (j6)
// 5.  VD (j7)
// 6.  Síntese câmaras (j8)
// 7.  Massa do VE (j9)
// 8.  Geometria/remodelamento (j10)
// 9.  Sistólica VE (j12 ou j11)
// 10. GLS VE (jGLSve)
// 11. Paredes (j13-j20)
// 12. Diastólica (auto/manual + detalhe)
// 13. LARS (jLARS)
// 14. HP por IT (j50)
// 15. Sistólica VD (j23)
// 16. GLS VD (jGLSvd)
// 17. Mitral morfologia + gradientes + refluxo
// 18. Tricúspide (refluxo + morf + estenose)
// 19. Wilkins (sentinela __WILKINS__)
// 20. PSAP (j30)
// 21. Aórtica (morf + gradientes + refluxo)
// 22. Pulmonar (morf + estenose + refluxo + PMAP)
// 23. Pericárdio (j36)
// 24. Aorta (j37, j38, j39, j40)
// ══════════════════════════════════════════════════════════════════

import type { MedidasEcoTT, CalculosDerivados } from '../types';

import { jRitmo, jAE_diametro, jAE_volume, jAD_volume, jVE_diametro, jVD_diametro, jCamarasNormais } from './camaras';
import { jEspessuraMiocardica, jPadraoGeometrico } from './massa';
import { jFE_Teichholz, jFE_Simpson } from './sistolica';
import { jApex, jParedeAnterior, jParedeSeptalAnterior, jParedeSeptalInferior, jParedeInferior, jParedeInferolateral, jParedeLateral, jDemaisParedes } from './paredes';
import { j21FA_achado, j22, j22FA, DIAST_SENTENCAS } from './diastologia';
import { jGLSve, jGLSvd, jLARS } from './strain';
import { jVD_sistolica } from './sistolicaVD';
import {
  jMitralMorfologia, jGradMaxMitral, jGradMedMitral, jAreaMitral, jRefluxoMitral,
  jRefluxoTricuspide, jTricMorfologia, jEstenoseTricuspide,
  jPSAP, jAorticaMorfologia, jGradMaxAortico, jGradMedAortico, jAreaAortica, jRefluxoAortico,
  jPulmMorfologia, jEstenosePulmonar, jRefluxoPulmonar,
  jPericardio, jPlacas, jProbabilidadeHP,
} from './valvas';
import { jAortaRaiz, jAortaAscendente, jArcoAortico, jAortaNormaisComplementar } from './aorta';
import { jWilkins } from './wilkins';

/**
 * Estado do modo diastológico (auto/manual + seleção do médico).
 * Mantido como variáveis no escopo do módulo, igual ao motor antigo.
 */
let _diastModo: 'auto' | 'manual' = 'auto';
let _diastManualSelecao = -1;
let _diastManualTextoLivre = '';

export function setDiastModo(modo: 'auto' | 'manual') { _diastModo = modo; }
export function setDiastManual(idx: number) { _diastManualSelecao = idx; }
export function setDiastTextoLivre(txt: string) { _diastManualTextoLivre = txt; }
export function getDiastModo() { return _diastModo; }

/** Retorna o achado diastológico baseado no modo (auto ou manual) */
function diastAchado(d: any): string {
  if (_diastModo === 'manual') {
    if (_diastManualTextoLivre) return _diastManualTextoLivre;
    if (_diastManualSelecao >= 0 && _diastManualSelecao < DIAST_SENTENCAS.length) {
      return DIAST_SENTENCAS[_diastManualSelecao].achado;
    }
    return '';
  }
  return j21FA_achado(d);
}

/**
 * Adapter: monta o objeto "d" no formato esperado pelas funções (compatível com motor antigo).
 */
function montarD(m: MedidasEcoTT, calc: CalculosDerivados): any {
  return {
    // identificação
    nome: m.identificacao.nome,
    dtnasc: m.identificacao.pacienteDtnasc,
    dtexame: m.identificacao.dataExame,
    convenio: m.identificacao.convenio,
    solicitante: m.identificacao.solicitante,
    // medidas gerais
    sexo: m.gerais.sexo,
    ritmo: m.gerais.ritmo,
    peso: m.gerais.peso,
    altura: m.gerais.altura,
    // câmaras
    b7: m.camaras.raizAo,
    b8: m.camaras.ae,
    b9: m.camaras.ddve,
    b10: m.camaras.septoIV,
    b11: m.camaras.paredePosterior,
    b12: m.camaras.dsve,
    b13: m.camaras.vd,
    b28: m.camaras.aoAscendente,
    b29: m.camaras.arcoAo,
    // diastologia (incl. b24/b25 movidos pra cá)
    b19: m.diastolica.ondaE,
    b20: m.diastolica.relacaoEA,
    b21: m.diastolica.eSeptal,
    b22: m.diastolica.relacaoEEseptal,
    b23: m.diastolica.velocidadeIT,
    b24: m.diastolica.volAEindex,
    b25: m.diastolica.volADindex,
    b37: m.diastolica.psap,
    b38: m.diastolica.sinaisHP,
    lars: m.diastolica.laStrain,
    // sistólica
    b54: m.sistolica.feSimpson,
    b32: m.sistolica.disfuncaoVD,
    b33: m.sistolica.tapse,
    glsVE: m.sistolica.glsVE,
    glsVD: m.sistolica.glsVD,
    // válvulas
    b34: m.valvas.morfMitral,
    b35: m.valvas.refluxoMitral,
    b34t: m.valvas.morfTricuspide,
    b36: m.valvas.refluxoTricuspide,
    b39: m.valvas.morfAortica,
    b40: m.valvas.refluxoAortico,
    b39p: m.valvas.morfPulmonar,
    b40p: m.valvas.refluxoPulmonar,
    psmap: m.valvas.pmap,
    b41: m.valvas.derramePericard,
    b42: m.valvas.placasArco,
    // estenoses
    b45: m.estenoses.gradMaxMitral,
    b46: m.estenoses.gradMedMitral,
    b47: m.estenoses.areaMitral,
    b50: m.estenoses.gradMaxAo,
    b51: m.estenoses.gradMedAo,
    b52: m.estenoses.areaAo,
    b46t: m.estenoses.gradMedTric,
    b47t: m.estenoses.areaTric,
    b50p: m.estenoses.gradMaxPulm,
    // wilkins
    wilkinsOn: m.wilkins.ativo,
    wkMob: m.wilkins.mobilidade,
    wkEsp: m.wilkins.espessura,
    wkCal: m.wilkins.calcificacao,
    wkSub: m.wilkins.subvalvar,
    // segmentar
    b55: m.segmentar.apex,
    b56: m.segmentar.anterior,
    b57: m.segmentar.septalAnterior,
    b58: m.segmentar.septalInferior,
    b59: m.segmentar.inferior,
    b60: m.segmentar.inferolateral,
    b61: m.segmentar.lateral,
    b62: m.segmentar.demaisParedes,
    // derivados
    asc: calc.asc,
    feT: calc.feT,
    massa: calc.massa,
    imVE: calc.imVE,
    er: calc.er,
    aoIdx: calc.aoIdx,
    estenMitGrau: calc.estenMitGrau,
    estenAoGrau: calc.estenAoGrau,
    estenTricGrau: calc.estenTricGrau,
    estenPulmGrau: calc.estenPulmGrau,
    wilkinsScore: calc.wilkinsScore,
  };
}

/**
 * gerarAchados — Lista ordenada de achados.
 * Filter(Boolean) remove strings vazias.
 */
export function gerarAchados(m: MedidasEcoTT, calc: CalculosDerivados): string[] {
  const d = montarD(m, calc);
  const L = (...xs: (string | string[])[]): string[] =>
    xs.flat().filter((x): x is string => typeof x === 'string' && !!x);

  const mitMorf = jMitralMorfologia(d.b34, d.b36);
  const tricMorf = jTricMorfologia(d.b34t);
  const fluxoAV = jRefluxoMitral(d.b35, d.b36, d.b45, d.b46, d.b47, d.b34t, d.estenTricGrau);
  const aoMorf = jAorticaMorfologia(d.b39);
  const pulmMorf = jPulmMorfologia(d.b39p);

  return [
    // Ritmo e câmaras
    ...L(jRitmo(d.ritmo)),
    ...L(jAE_volume(d.b24) || jAE_diametro(d.b8, d.sexo, d.b24)),
    ...L(jAD_volume(d.b25)),
    ...L(jVE_diametro(d.b9, d.sexo)),
    ...L(jVD_diametro(d.b13)),
    ...L(jCamarasNormais(d.b8, d.b9, d.b13, d.b24, d.b25, d.sexo)),
    // VE estrutura (j9 analisa MASSA absoluta, texto fala em massa)
    ...L(jEspessuraMiocardica(d.massa, d.sexo)),
    ...L(jPadraoGeometrico(d.er, d.imVE, d.sexo)),
    // Sistólica VE (Simpson prevalece)
    ...L(d.b54 !== null ? jFE_Simpson(d.b54, d.sexo) : jFE_Teichholz(d.feT, d.sexo)),
    // GLS VE
    ...L(jGLSve(d.glsVE)),
    // Paredes
    ...L(
      jApex(d.b55),
      jParedeAnterior(d.b56),
      jParedeSeptalAnterior(d.b57),
      jParedeSeptalInferior(d.b58),
      jParedeInferior(d.b59),
      jParedeInferolateral(d.b60),
      jParedeLateral(d.b61),
      jDemaisParedes(d.b62),
    ),
    // Diastólica (auto/manual + detalhe)
    ...L(diastAchado(d)),
    ...L(_diastModo === 'manual' ? '' : j22FA(d)),
    // LA strain
    ...L(jLARS(d.lars)),
    // HP por IT
    ...L(jProbabilidadeHP(d.b23, d.b38)),
    // VD sistólica
    ...L(jVD_sistolica(d.b32, d.b33)),
    // GLS VD
    ...L(jGLSvd(d.glsVD)),
    // ── Atrioventriculares ──
    ...L(mitMorf),
    ...L(jGradMaxMitral(d.b45), jGradMedMitral(d.b46), jAreaMitral(d.b47)),
    ...L(fluxoAV),
    ...L(jRefluxoTricuspide(d.b36)),
    ...L(tricMorf),
    ...jEstenoseTricuspide(d.estenTricGrau, d.b46t, d.b47t),
    ...L(jWilkins(d.wilkinsOn, d.wkMob, d.wkEsp, d.wkSub, d.wkCal)),
    ...L(jPSAP(d.b37, d.b23)),
    // ── Semilunares ──
    ...L(aoMorf),
    ...L(jGradMaxAortico(d.b50), jGradMedAortico(d.b51), jAreaAortica(d.b52, d.aoIdx)),
    ...L(jRefluxoAortico(d.b40, d.b40p, d.b50, d.b51, d.b52, d.b39p, d.estenPulmGrau)),
    ...L(pulmMorf),
    ...jEstenosePulmonar(d.estenPulmGrau, d.b50p),
    ...jRefluxoPulmonar(d.b40p, d.psmap),
    // ── Pericárdio e Aorta ──
    ...L(jPericardio(d.b41)),
    ...L(
      jAortaRaiz(d.b7, d.b28, d.b29, d.sexo, d.asc, calc.idade, m.gerais.altura),
      jAortaAscendente(d.b28, d.sexo, d.asc, m.gerais.altura),
      jArcoAortico(d.b29, d.sexo),
      jAortaNormaisComplementar(d.b7, d.b28, d.b29, d.sexo, d.asc, calc.idade, m.gerais.altura),
      jPlacas(d.b42),
    ),
  ].filter(Boolean);
}
