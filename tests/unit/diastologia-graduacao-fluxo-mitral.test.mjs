// Graduação exige fluxo mitral (ASE/EACVI 2016) — Task 2b do plano
// docs/planos/2026-08-28-diastologia-guideline-ase2016.md, achado da revisão da T2.
//
// Anexo normativo §8.2 (docs/planos/2026-08-28-auditoria-diastologia-ase2016.md):
// "Quando E/A está ausente, ou quando E/A ≤0,8 com onda E ausente, o guideline
// simplesmente não fornece grau." O motor afirmava Grau II (queda no return final
// do ramo completo) — grau que é DEFINIDO pelo padrão do fluxo mitral, com zero
// fluxo mitral medido.
//
// Regra permanente do Sergio (28/08/2026): "os resultados seguem os guidelines".
// Onde o guideline se cala, o laudo descreve a disfunção sem inventar o grau.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

const SEM_GRADUACAO =
  'Disfunção Diastólica do ventrículo esquerdo presente, de grau não determinado (fluxo mitral não avaliado).';
const CONC_SEM_GRADUACAO = 'Disfunção diastólica do ventrículo esquerdo de grau não determinado.';
const GRAU_I = 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';
const GRAU_II = 'Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal)';
const GRAU_III = 'Disfunção Diastólica do ventrículo esquerdo de Grau III (Padrão Restritivo)';

// Ramo completo (A): sinusal, FE preservada, sem massa alta.
function baseRamoA() {
  const m = medidasVazias();
  m.gerais.sexo = 'M';
  m.gerais.ritmo = 'S';
  m.sistolica.feSimpson = 60;
  return m;
}

describe('calcular() — graduação do ramo completo exige fluxo mitral (ASE 2016 §8.2)', () => {
  test('(a) IT 2,9(+) + LAVI 34,1(+) sem E/A → grau não determinado (era Grau II)', () => {
    const m = baseRamoA();
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 34.1;
    const r = calcular(m);
    assert.ok(r.achados.includes(SEM_GRADUACAO), `esperado sem graduação: ${JSON.stringify(r.achados)}`);
    assert.ok(r.conclusoes.includes(CONC_SEM_GRADUACAO), `conclusão j43 ausente: ${JSON.stringify(r.conclusoes)}`);
    assert.ok(!r.achados.includes(GRAU_II), 'Grau II afirmado sem fluxo mitral');
  });

  test('(b) E/A 0,7 + onda E 45 + IT 2,9(+) + LAVI 34,1(+) → Grau I (fluxo mitral completo gradua)', () => {
    const m = baseRamoA();
    m.diastolica.relacaoEA = 0.7;
    m.diastolica.ondaE = 45;
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 34.1;
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_I), `esperado Grau I: ${JSON.stringify(r.achados)}`);
  });

  test('(b2) E/A 0,7 SEM onda E + IT 2,9(+) + LAVI 34,1(+) → grau não determinado (era Grau II)', () => {
    // ASE 2016 separa Grau I (E ≤50) de "vai aos critérios" (E >50) pela onda E.
    // Sem ela o par I × II é indecidível — e "Grau II" contradizia o próprio
    // E/A 0,7 (pseudonormal é, por definição, E/A entre 0,8 e 2).
    const m = baseRamoA();
    m.diastolica.relacaoEA = 0.7;
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 34.1;
    const r = calcular(m);
    assert.ok(r.achados.includes(SEM_GRADUACAO), `esperado sem graduação: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(GRAU_II), 'Grau II contradizendo E/A 0,7');
  });

  test('(b3) E/A 0,7 + onda E 80 (>50) + 2 critérios(+) → Grau II continua (ASE 2016 literal)', () => {
    const m = baseRamoA();
    m.diastolica.relacaoEA = 0.7;
    m.diastolica.ondaE = 80;
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 34.1;
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_II), `esperado Grau II: ${JSON.stringify(r.achados)}`);
  });

  test("(c) E/A 2,2 + e' 6(+) + IT 2,9(+) + LAVI 34(−) → Grau III continua (não regride)", () => {
    const m = baseRamoA();
    m.diastolica.ondaE = 100;
    m.diastolica.relacaoEA = 2.2;
    m.diastolica.eSeptal = 6;
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 34;
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_III), `esperado Grau III: ${JSON.stringify(r.achados)}`);
  });

  test('(d) E/A 1,2 + E/e\' 18(+) + IT 3,0(+) + LAVI 38(+) → Grau II continua (DC29)', () => {
    const m = baseRamoA();
    m.diastolica.ondaE = 80;
    m.diastolica.relacaoEA = 1.2;
    m.diastolica.relacaoEEseptal = 18;
    m.diastolica.velocidadeIT = 3.0;
    m.diastolica.volAEindex = 38;
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_II), `esperado Grau II: ${JSON.stringify(r.achados)}`);
  });

  test('(e) ramo B sem E/A + 2 critérios(+) → grau não determinado (era Grau II)', () => {
    // Reescrito na Task 3 (T2c) do mesmo plano: o lock da T2b era deliberado
    // ("trava o ramo B como está pra que o próximo fix seja deliberado") e o fix
    // chegou. §8.2 alcança os dois ramos — sem fluxo mitral não há grau.
    // Cobertura completa do ramo B em tests/unit/diastologia-ramo-b-suficiencia.test.mjs.
    const m = medidasVazias();
    m.gerais.sexo = 'M';
    m.gerais.ritmo = 'S';
    m.sistolica.feSimpson = 35; // FE deprimida → ramo B
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 34.1;
    const r = calcular(m);
    assert.ok(r.achados.includes(SEM_GRADUACAO), `esperado sem graduação: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(GRAU_II), 'Grau II afirmado sem fluxo mitral (ramo B)');
  });
});
