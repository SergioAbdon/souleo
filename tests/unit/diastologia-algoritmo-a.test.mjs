// Algoritmo A da diastologia (ASE/EACVI 2016) — Task 2 do plano
// docs/planos/2026-08-28-diastologia-guideline-ase2016.md (D4 + D5).
//
// Regra permanente do Sergio (28/08/2026): "os resultados seguem os guidelines".
// O guideline decide por PROPORÇÃO dos critérios AVALIADOS, não por contagem fixa:
//  - >50% positivos  → disfunção presente (gradua)          [D4]
//  - exatamente 50%  → Função Diastólica Indeterminada      [D5]
//  - <50% positivos  → índices preservados
//  - <2 avaliados    → silêncio (spec §2.4, regra mantida)
//
// Valores de reprodução vindos do anexo normativo
// (docs/planos/2026-08-28-auditoria-diastologia-ase2016.md, seções D4 e D5).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

const PRESERVADOS = 'Índices diastólicos do ventrículo esquerdo preservados';
const INDETERMINADA = 'Função Diastólica do ventrículo esquerdo Indeterminada';
const GRAU_II = 'Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal)';
const GRAU_III = 'Disfunção Diastólica do ventrículo esquerdo de Grau III (Padrão Restritivo)';
const SEM_GRADUACAO =
  'Disfunção Diastólica do ventrículo esquerdo presente, de grau não determinado (fluxo mitral não avaliado).';

// Base do algoritmo A: sinusal, sem FE (nem Simpson nem Teichholz) e sem massa
// → seleção de ramo cai no algoritmo completo (Task 1).
function baseAlgoritmoA() {
  const m = medidasVazias();
  m.gerais.sexo = 'M';
  m.gerais.ritmo = 'S';
  return m;
}

describe('calcular() — algoritmo A por maioria dos critérios avaliados (ASE 2016)', () => {
  // Reescrito na T2b: o alvo desta linha é a ENTRADA por maioria (2/2 = 100%
  // deixa de ser "Indeterminada"). O GRAU que saía daqui era Grau II por queda
  // no return final, sem nenhum fluxo mitral medido — o ASE 2016 não gradua sem
  // E/A (anexo §8.2), então a saída correta é a classe sem graduação.
  test('(a) IT 2,9(+) + LAVI 34,1(+) — 2/2 positivos (100%) → disfunção, não "Indeterminada" (D4)', () => {
    const m = baseAlgoritmoA();
    m.sistolica.feSimpson = 60; // FE preservada explícita → prende o ramo A (T1)
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 34.1;
    const r = calcular(m);
    assert.ok(r.achados.includes(SEM_GRADUACAO), `esperado sem graduação: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(INDETERMINADA), 'contagem fixa c===2 ainda viva (D4)');
    assert.ok(!r.achados.includes(GRAU_II), 'Grau II afirmado sem fluxo mitral (T2b/§8.2)');
  });

  test("(b) e' 6(+) + IT 2,9(+) + LAVI 34(−) + E/A 2,2 — 2/3 (67%) → Grau III (D4 pior caso)", () => {
    const m = baseAlgoritmoA();
    m.sistolica.feSimpson = 60; // FE preservada explícita → prende o ramo A (T1)
    m.diastolica.ondaE = 100;
    m.diastolica.relacaoEA = 2.2;
    m.diastolica.eSeptal = 6;
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 34; // não é >34 → negativo
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_III), `esperado Grau III: ${JSON.stringify(r.achados)}`);
  });

  test("(c) e' 6(+) + E/e' 12(−) — empate 1/2 (50%) → Indeterminada (D5, falso-normal)", () => {
    const m = baseAlgoritmoA();
    m.diastolica.eSeptal = 6;
    m.diastolica.relacaoEEseptal = 12;
    const r = calcular(m);
    assert.ok(r.achados.includes(INDETERMINADA), `esperado Indeterminada: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(PRESERVADOS), 'falso-normal de 1/2 ainda vivo (D5)');
  });

  test('(d) 1 critério avaliado → silêncio (regra dos ≥2 campos intacta)', () => {
    const m = baseAlgoritmoA();
    m.diastolica.velocidadeIT = 2.9;
    const r = calcular(m);
    assert.ok(!r.achados.includes(PRESERVADOS), `silêncio esperado: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(INDETERMINADA), `silêncio esperado: ${JSON.stringify(r.achados)}`);
    assert.ok(
      !r.achados.some((a) => a.includes('Disfunção Diastólica')),
      `silêncio esperado: ${JSON.stringify(r.achados)}`
    );
  });

  test("(e) 4 avaliados, 1 positivo (25% <50%) → preservados (conforme, não regride)", () => {
    const m = baseAlgoritmoA();
    m.diastolica.eSeptal = 6; // (+)
    m.diastolica.relacaoEEseptal = 8; // (−)
    m.diastolica.velocidadeIT = 2.2; // (−)
    m.diastolica.volAEindex = 28; // (−)
    const r = calcular(m);
    assert.ok(r.achados.includes(PRESERVADOS), `esperado preservados: ${JSON.stringify(r.achados)}`);
  });
});
