// Modo manual da diastólica chega no laudo gerado (S5-T3, decisão D3).
//
// O engine já tinha DIAST_SENTENCAS + setDiastModo/setDiastManual prontos
// (achados/index.ts, conclusoes/index.ts) mas `calcular()` nunca sincronizava
// esse estado de módulo a partir de `medidas.diastolica` — a seleção do
// médico simplesmente nunca chegava no texto. Zero mudança de fórmula aqui,
// só a consumação do flag.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcular, getDiastModo } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

describe('calcular() — modo manual da diastólica (S5-T3)', () => {
  test('selecaoManual=2 (grau II) substitui achado e conclusão calculados', () => {
    const m = medidasVazias();
    m.diastolica.modoManual = 'manual';
    m.diastolica.selecaoManual = 2;
    const r = calcular(m);
    assert.ok(
      r.achados.includes('Disfunção diastólica do ventrículo esquerdo de grau II (padrão pseudonormal).'),
      `achados não tem a sentença manual: ${JSON.stringify(r.achados)}`
    );
    assert.ok(
      r.conclusoes.includes('Disfunção diastólica de grau II do ventrículo esquerdo (padrão pseudo-normal).'),
      `conclusoes não tem a sentença manual: ${JSON.stringify(r.conclusoes)}`
    );
  });

  test('selecaoManual=6 ("não avaliar") não gera achado nem conclusão de diastólica', () => {
    const m = medidasVazias();
    m.diastolica.modoManual = 'manual';
    m.diastolica.selecaoManual = 6;
    const r = calcular(m);
    assert.ok(!r.achados.some((a) => a.toLowerCase().includes('diastólic')));
    assert.ok(!r.conclusoes.some((c) => c.toLowerCase().includes('diastólic')));
  });

  test('modoManual "auto" (padrão) preserva o cálculo automático — zero mudança de fórmula', () => {
    const m = medidasVazias();
    // ritmo sinusal + 2 critérios avaliados e nenhum alterado (calculos/diastologia.ts:121-139)
    // => 'Índices diastólicos do ventrículo esquerdo preservados' calculado de verdade pelo
    // motor — pina o texto real (review M3), não só a ausência da sentença manual.
    m.gerais.ritmo = 'S';
    m.diastolica.eSeptal = 10;
    m.diastolica.relacaoEEseptal = 10;
    m.sistolica.feSimpson = 60; // FE preservada => algoritmo completo (calculos/diastologia.ts:97-115)
    const r = calcular(m);
    assert.ok(
      r.achados.includes('Índices diastólicos do ventrículo esquerdo preservados'),
      `auto não calculou o esperado: ${JSON.stringify(r.achados)}`
    );
    assert.ok(!r.achados.includes('Disfunção diastólica do ventrículo esquerdo de grau II (padrão pseudonormal).'));
  });

  test('calcular() resincroniza o modo a cada chamada — estado de módulo não vaza entre exames', () => {
    const manual = medidasVazias();
    manual.diastolica.modoManual = 'manual';
    manual.diastolica.selecaoManual = 3;
    calcular(manual);
    assert.equal(getDiastModo(), 'manual');

    const auto = medidasVazias(); // modoManual: 'auto' por padrão
    calcular(auto);
    assert.equal(getDiastModo(), 'auto', 'exame seguinte em modo auto herdou o "manual" do exame anterior');
  });
});
