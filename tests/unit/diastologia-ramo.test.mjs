// Seleção de ramo da diastologia (ASE/EACVI 2016) — Task 1 do plano
// docs/planos/2026-08-28-diastologia-guideline-ase2016.md (D1 + D3).
//
// Regra permanente do Sergio (28/08/2026): "os resultados seguem os guidelines".
// Algoritmo B (simplificado) é para FE DEPRIMIDA ou doença miocárdica:
//  - Simpson é a FE de referência: presente, decide sozinho (Teichholz não atropela) [D1]
//  - Sem Simpson, Teichholz decide sozinho (não regride)
//  - Sem nenhuma FE não há evidência de FE baixa → algoritmo A [D3]
//  - massaAlta (doença miocárdica) continua selecionando o algoritmo B
//
// Valores de reprodução vindos do anexo normativo
// (docs/planos/2026-08-28-auditoria-diastologia-ase2016.md, seções D1 e D3).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

const PRESERVADOS = 'Índices diastólicos do ventrículo esquerdo preservados';
const GRAU_I = 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';

// Diástole 100% normal do anexo: E 80 · E/A 1,2 · e' 9 · E/e' 8 · LAVI 28 · IT 2,2
function diastoleNormal() {
  const m = medidasVazias();
  m.gerais.sexo = 'M';
  m.gerais.ritmo = 'S';
  m.diastolica.ondaE = 80;
  m.diastolica.relacaoEA = 1.2;
  m.diastolica.eSeptal = 9;
  m.diastolica.relacaoEEseptal = 8;
  m.diastolica.velocidadeIT = 2.2;
  m.diastolica.volAEindex = 28;
  return m;
}

describe('calcular() — seleção de ramo da diastologia (ASE 2016)', () => {
  test('(a) Simpson 60 normal + Teichholz 0,467 baixo → Simpson manda → algoritmo A (D1)', () => {
    const m = diastoleNormal();
    m.sistolica.feSimpson = 60;
    m.camaras.ddve = 55;
    m.camaras.dsve = 42; // feT 0,467 (<0,52 ♂)
    const r = calcular(m);
    assert.ok(r.achados.includes(PRESERVADOS), `esperado preservados: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(GRAU_I), 'Teichholz atropelou o Simpson (D1 vivo)');
  });

  test('(b) sem Simpson + Teichholz 0,467 baixo → algoritmo B continua (não regride)', () => {
    const m = diastoleNormal();
    m.sistolica.feSimpson = null;
    m.camaras.ddve = 55;
    m.camaras.dsve = 42; // feT 0,467
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_I), `esperado Grau I (ramo B): ${JSON.stringify(r.achados)}`);
  });

  test('(c) sem Simpson e sem DDVE/DSVE (FE indisponível) → algoritmo A (D3)', () => {
    const m = diastoleNormal(); // camaras vazias por padrão → feT null
    const r = calcular(m);
    assert.ok(r.achados.includes(PRESERVADOS), `esperado preservados: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(GRAU_I), 'FE ausente ainda vira "FE baixa" (D3 vivo)');
  });

  test('(d) FE indisponível + massa alta (doença miocárdica) → algoritmo B', () => {
    const m = diastoleNormal();
    m.gerais.peso = 70;
    m.gerais.altura = 175;
    m.camaras.septoIV = 16;
    m.camaras.paredePosterior = 16;
    m.camaras.ddve = 50; // massa calculável (imVE ~192 > 115)…
    m.camaras.dsve = null; // …mas sem DSVE não há Teichholz, e sem Simpson → FE indisponível
    m.diastolica.relacaoEA = 2.2; // critério direto do ramo B (E/A ≥2 → Grau III)
    const r = calcular(m);
    assert.ok(
      r.achados.some((a) => a.includes('Grau III')),
      `massaAlta deveria selecionar o ramo B: ${JSON.stringify(r.achados)}`
    );
  });
});
