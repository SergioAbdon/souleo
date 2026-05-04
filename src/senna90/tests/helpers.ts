// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Test Helpers
// Cria template de medidas vazias e atalhos pra construir casos
// ══════════════════════════════════════════════════════════════════

import type { MedidasEcoTT } from '../types';

export function medidasVazias(): MedidasEcoTT {
  return {
    identificacao: {
      nome: '', pacienteDtnasc: '', dataExame: '',
      convenio: '', solicitante: '',
    },
    gerais: {
      sexo: '', ritmo: '', peso: null, altura: null,
    },
    camaras: {
      raizAo: null, ae: null, ddve: null, septoIV: null,
      paredePosterior: null, dsve: null, vd: null,
      aoAscendente: null, arcoAo: null,
    },
    diastolica: {
      ondaE: null, relacaoEA: null, eSeptal: null, relacaoEEseptal: null,
      velocidadeIT: null, psap: null, volAEindex: null, volADindex: null,
      laStrain: null, sinaisHP: '',
      modoManual: 'auto', selecaoManual: -1, textoLivre: '',
    },
    sistolica: {
      feSimpson: null, disfuncaoVD: '', tapse: null,
      glsVE: null, glsVD: null,
    },
    valvas: {
      morfMitral: '', refluxoMitral: '',
      morfTricuspide: '', refluxoTricuspide: '',
      morfAortica: '', refluxoAortico: '',
      morfPulmonar: '', refluxoPulmonar: '',
      pmap: null, derramePericard: '', placasArco: '',
    },
    estenoses: {
      gradMaxMitral: null, gradMedMitral: null, areaMitral: null,
      gradMaxAo: null, gradMedAo: null, areaAo: null,
      gradMedTric: null, areaTric: null,
      gradMaxPulm: null,
    },
    wilkins: {
      ativo: false, mobilidade: 0, espessura: 0,
      calcificacao: 0, subvalvar: 0,
    },
    segmentar: {
      apex: '', anterior: '', septalAnterior: '', septalInferior: '',
      inferior: '', inferolateral: '', lateral: '', demaisParedes: 'NL',
    },
  };
}

/**
 * Atalho: paciente saudável padrão M, 1.75m, 70kg.
 */
export function pacienteSaudavelM(): MedidasEcoTT {
  const m = medidasVazias();
  m.identificacao.nome = 'Paciente Teste';
  m.identificacao.pacienteDtnasc = '1980-01-01';
  m.identificacao.dataExame = '2026-05-04';
  m.gerais.sexo = 'M';
  m.gerais.ritmo = 'S';
  m.gerais.peso = 70;
  m.gerais.altura = 175;
  m.camaras.raizAo = 32;
  m.camaras.ae = 36;
  m.camaras.ddve = 50;
  m.camaras.septoIV = 9;
  m.camaras.paredePosterior = 9;
  m.camaras.dsve = 32;
  m.camaras.vd = 28;
  m.diastolica.ondaE = 75;
  m.diastolica.relacaoEA = 1.2;
  m.diastolica.eSeptal = 9;
  m.diastolica.relacaoEEseptal = 8;
  m.diastolica.volAEindex = 28;
  return m;
}

/**
 * Atalho: paciente saudável padrão F, 1.62m, 60kg.
 */
export function pacienteSaudavelF(): MedidasEcoTT {
  const m = medidasVazias();
  m.identificacao.nome = 'Paciente Teste F';
  m.identificacao.pacienteDtnasc = '1985-06-15';
  m.identificacao.dataExame = '2026-05-04';
  m.gerais.sexo = 'F';
  m.gerais.ritmo = 'S';
  m.gerais.peso = 60;
  m.gerais.altura = 162;
  m.camaras.raizAo = 28;
  m.camaras.ae = 32;
  m.camaras.ddve = 45;
  m.camaras.septoIV = 8;
  m.camaras.paredePosterior = 8;
  m.camaras.dsve = 28;
  m.camaras.vd = 26;
  m.diastolica.ondaE = 78;
  m.diastolica.relacaoEA = 1.3;
  m.diastolica.eSeptal = 10;
  m.diastolica.relacaoEEseptal = 7;
  m.diastolica.volAEindex = 25;
  return m;
}
