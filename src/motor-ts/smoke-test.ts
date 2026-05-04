// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Smoke Test
// ══════════════════════════════════════════════════════════════════
// Teste básico de sanidade pra garantir que o motor funciona.
// Não substitui a Fase 4 (testes completos contra motor antigo).
// ══════════════════════════════════════════════════════════════════

import { calcular } from './motor';
import type { MedidasEcoTT } from './types';

/**
 * Cria um conjunto de medidas vazias (template).
 */
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
 * Caso de teste: paciente saudável do sexo M, 1.75m, 70kg
 */
export function casoSaudavelM(): MedidasEcoTT {
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
 * Caso de teste: paciente com cardiopatia dilatada
 */
export function casoCardiopatiaDilatada(): MedidasEcoTT {
  const m = medidasVazias();
  m.identificacao.nome = 'Paciente Teste 2';
  m.identificacao.pacienteDtnasc = '1960-01-01';
  m.identificacao.dataExame = '2026-05-04';
  m.gerais.sexo = 'M';
  m.gerais.ritmo = 'S';
  m.gerais.peso = 80;
  m.gerais.altura = 175;
  m.camaras.raizAo = 35;
  m.camaras.ae = 45;
  m.camaras.ddve = 65;
  m.camaras.septoIV = 11;
  m.camaras.paredePosterior = 11;
  m.camaras.dsve = 50;
  m.camaras.vd = 30;
  m.sistolica.feSimpson = 35;
  return m;
}

/**
 * Roda os testes de sanidade.
 * Imprime relatórios no console.
 */
export function rodarSmokeTests(): void {
  console.log('═══ SMOKE TESTS — Motor TS ═══');

  console.log('\n--- Caso 1: Paciente saudável M, 70kg, 1.75m ---');
  const r1 = calcular(casoSaudavelM());
  console.log('Derivados:', r1.derivados);
  console.log('\nAchados:');
  r1.achados.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  console.log('\nConclusões:');
  r1.conclusoes.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));

  console.log('\n--- Caso 2: Cardiopatia dilatada ---');
  const r2 = calcular(casoCardiopatiaDilatada());
  console.log('Derivados:', r2.derivados);
  console.log('\nAchados:');
  r2.achados.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  console.log('\nConclusões:');
  r2.conclusoes.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));

  console.log('\n═══ END ═══');
}

// Auto-run quando executado direto
// Para rodar: npx tsx src/motor-ts/smoke-test.ts
if (typeof window === 'undefined' && require.main === module) {
  rodarSmokeTests();
}
