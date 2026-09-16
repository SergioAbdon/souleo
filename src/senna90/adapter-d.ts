// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Adapter único (achados + conclusões)
// ══════════════════════════════════════════════════════════════════
// montarD — monta o objeto "d" no formato esperado pelas funções j*
// (compatível com motor antigo). SUPERSET: união dos campos que os
// dois orquestradores (achados/index.ts e conclusoes/index.ts) usavam
// em adapters locais separados antes da unificação (Task 11 / B30).
// ══════════════════════════════════════════════════════════════════

import type { MedidasEcoTT, CalculosDerivados } from './types';

export function montarD(m: MedidasEcoTT, calc: CalculosDerivados): any {
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
    idade: calc.idade,
    estenMitGrau: calc.estenMitGrau,
    estenAoGrau: calc.estenAoGrau,
    estenTricGrau: calc.estenTricGrau,
    estenPulmGrau: calc.estenPulmGrau,
    wilkinsScore: calc.wilkinsScore,
  };
}

/**
 * B5/B7 — há alguma parede com contratilidade alterada?
 * b55..b61 vazio = normal; b62 ('demais paredes') usa 'NL' para normal.
 * Usada tanto pelo achado (jFE_Simpson) quanto pela conclusão (concSistolica).
 */
export function temParedeAlterada(d: any): boolean {
  return !!(d.b55 || d.b56 || d.b57 || d.b58 || d.b59 || d.b60 || d.b61
    || (d.b62 && d.b62 !== 'NL'));
}
