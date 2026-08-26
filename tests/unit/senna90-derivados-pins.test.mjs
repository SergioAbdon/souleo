// ══════════════════════════════════════════════════════════════════
// Senna93 F0-T4 (spec §3 C10): vdf/vsf/fs/aoae nunca foram asseridos;
// massa nunca teve valor exato pinado. Estes são OS 12 números que a
// F3 vai começar a IMPRIMIR (tabela + caixas calc-*) — pinar antes.
// Política numérica ATUAL: truncar (não arredondar) — helpers/truncate.
// Valores esperados conferidos à mão (fórmulas no comentário de cada
// assert). BASELINE pré-F1: a F1 corrige o +0,6 da massa (B24) e este
// arquivo registra a mudança (181.3 → 181.9).
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcularDerivados } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

function pacientePadrao() {
  const m = medidasVazias();
  m.identificacao.pacienteDtnasc = '1980-05-15';
  m.identificacao.dataExame = '2026-08-27';        // → 46 anos
  m.gerais.sexo = 'M';
  m.gerais.peso = 80;                               // kg
  m.gerais.altura = 170;                            // cm
  m.camaras.raizAo = 34;                            // b7
  m.camaras.ae = 40;                                // b8
  m.camaras.ddve = 50;                              // b9
  m.camaras.septoIV = 10;                           // b10
  m.camaras.paredePosterior = 10;                   // b11
  m.camaras.dsve = 30;                              // b12
  m.estenoses.areaAo = 3.0;                         // b52 → aoIdx
  return m;
}

describe('BASELINE derivados pré-F1 — os 12 números da tabela (F0-T4)', () => {
  const d = calcularDerivados(pacientePadrao());

  test('idade por string (imune a fuso): 46', () => assert.equal(d.idade, 46));
  test('imc = 80/1.7² = 27.68… → trunc1 27.6', () => assert.equal(d.imc, 27.6));
  test('asc DuBois 71,84: 0.0001×71.84×80^0.425×170^0.725 ≈ 1.9154 → trunc2 1.91', () =>
    assert.equal(d.asc, 1.91));
  test('aoae = 34/40 = 0.85', () => assert.equal(d.aoae, 0.85));
  test('vdf Teichholz D=5.0cm: 7·125/(2.4+5) = 118.24… → trunc1 118.2', () =>
    assert.equal(d.vdf, 118.2));
  test('vsf Teichholz D=3.0cm: 7·27/(2.4+3) = 35.0', () => assert.equal(d.vsf, 35));
  // feT: calcFE_Teichholz NÃO reusa d.vdf/d.vsf — recalcula vdf/vsf internamente
  // (mesma fórmula), cada um já truncado 1 casa (118.2 e 35.0), e só ENTÃO tira
  // a razão: (118.2−35.0)/118.2 = 0.70389170896... → truncar(_, 4) trunca o 4º
  // dígito decimal (7 0 3 8 |9...) sem arredondar → 0.7038 (não 0.7039).
  // Observado em node: Math.trunc(0.7038917089678511 * 10000)/10000 === 0.7038.
  test('feT: truncar((118.2−35.0)/118.2, 4) = 0.7038 (trunc, não round — 5º dígito é 9)', () => {
    assert.equal(d.feT, 0.7038);
  });
  test('fs = 20/50 = 0.4', () => assert.equal(d.fs, 0.4));
  test('massa Devereux ATUAL (+0.6 dentro do /1000 — bug B24): ((70³−50³)·1.04·0.8+0.6)/1000 = 181.3766 → trunc1 181.3  // F1 → 181.9', () =>
    assert.equal(d.massa, 181.3));
  test('imVE = massa/asc = 181.3/1.91 = 94.92… → trunc1 94.9', () =>
    assert.equal(d.imVE, 94.9));
  test('er = (10+10)/50 = 0.4', () => assert.equal(d.er, 0.4));
  test('aoIdx = 3.0/1.91 = 1.570… → trunc2 1.57', () => assert.equal(d.aoIdx, 1.57));

  test('guardas null: sem peso → imc/asc/imVE/aoIdx null; sem dsve → vsf/feT/fs null', () => {
    const semPeso = pacientePadrao(); semPeso.gerais.peso = null;
    const d1 = calcularDerivados(semPeso);
    assert.equal(d1.imc, null); assert.equal(d1.asc, null);
    assert.equal(d1.imVE, null); assert.equal(d1.aoIdx, null);
    const semDsve = pacientePadrao(); semDsve.camaras.dsve = null;
    const d2 = calcularDerivados(semDsve);
    assert.equal(d2.vsf, null); assert.equal(d2.feT, null); assert.equal(d2.fs, null);
  });
});
