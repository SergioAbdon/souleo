// Ramo simplificado (B) com suficiência + sem grau sem fluxo mitral + empate da FA
// — Task 3 (+T2c) do plano docs/planos/2026-08-28-diastologia-guideline-ase2016.md.
//
// Anexo normativo: docs/planos/2026-08-28-auditoria-diastologia-ase2016.md
// D2 (§6): o ramo B contava campo AUSENTE como campo normal e caía num
// "Grau I" incondicional — 399.840 combos. §8.2: sem E/A (ou E/A ≤0,8 com onda E
// ausente) o guideline NÃO fornece grau. FA (adendo): a suficiência estava certa,
// mas `elevados>=2` fixo dava "pressão elevada" no mesmo empate 50% que o ramo
// sinusal resolve como "Indeterminada".
//
// Regra permanente do Sergio (28/08/2026): "os resultados seguem os guidelines".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

const INDETERMINADA = 'Função Diastólica do ventrículo esquerdo Indeterminada';
const SEM_GRADUACAO =
  'Disfunção Diastólica do ventrículo esquerdo presente, de grau não determinado.';
const GRAU_I = 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';
const GRAU_II = 'Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal)';
const GRAU_III = 'Disfunção Diastólica do ventrículo esquerdo de Grau III (Padrão Restritivo)';

// Ramo B: sinusal + FE deprimida.
function baseRamoB(fe = 40) {
  const m = medidasVazias();
  m.gerais.sexo = 'M';
  m.gerais.ritmo = 'S';
  m.sistolica.feSimpson = fe;
  return m;
}

function baseFA() {
  const m = medidasVazias();
  m.gerais.sexo = 'M';
  m.gerais.ritmo = 'N';
  m.diastolica.relacaoEA = null; // sem onda A → ramo FA
  return m;
}

describe('calcular() — ramo B (simplificado) com suficiência (D2)', () => {
  test('(a) FE 40 + E/A 1,2 + E 80 + zero critérios → Indeterminada (era Grau I)', () => {
    const m = baseRamoB();
    m.diastolica.ondaE = 80;
    m.diastolica.relacaoEA = 1.2;
    const r = calcular(m);
    assert.ok(r.achados.includes(INDETERMINADA), `esperado Indeterminada: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(GRAU_I), 'Grau I afirmado sem critério de pressão medido');
  });

  test("(b) idem + LAVI 40(+) + E/e' 8(−), empate 1×1 → Indeterminada (era Grau I)", () => {
    const m = baseRamoB();
    m.diastolica.ondaE = 80;
    m.diastolica.relacaoEA = 1.2;
    m.diastolica.volAEindex = 40;
    m.diastolica.relacaoEEseptal = 8;
    const r = calcular(m);
    assert.ok(r.achados.includes(INDETERMINADA), `esperado Indeterminada: ${JSON.stringify(r.achados)}`);
  });

  test("(c) FE 40 + E/A 1,2 + E/e' 20(+) + LAVI 40(+) → Grau II (não regride)", () => {
    const m = baseRamoB();
    m.diastolica.ondaE = 80;
    m.diastolica.relacaoEA = 1.2;
    m.diastolica.relacaoEEseptal = 20;
    m.diastolica.volAEindex = 40;
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_II), `esperado Grau II: ${JSON.stringify(r.achados)}`);
  });

  test('(d) FE 40 + E/A 2,2 sem mais nada → Grau III direto (regra direta não exige critério)', () => {
    const m = baseRamoB();
    m.diastolica.relacaoEA = 2.2;
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_III), `esperado Grau III: ${JSON.stringify(r.achados)}`);
  });

  test("(d2) FE 40 + E/A 0,7 + E 45 sem mais nada → Grau I direto (regra direta não exige critério)", () => {
    const m = baseRamoB();
    m.diastolica.relacaoEA = 0.7;
    m.diastolica.ondaE = 45;
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_I), `esperado Grau I: ${JSON.stringify(r.achados)}`);
  });

  test("(d3) zona média com maioria NEGATIVA continua Grau I (E/A 1,2 + E/e' 8(−) + IT 2,0(−))", () => {
    const m = baseRamoB();
    m.diastolica.ondaE = 80;
    m.diastolica.relacaoEA = 1.2;
    m.diastolica.relacaoEEseptal = 8;
    m.diastolica.velocidadeIT = 2.0;
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_I), `esperado Grau I: ${JSON.stringify(r.achados)}`);
  });
});

describe('calcular() — ramo B não gradua sem fluxo mitral (T2c, §8.2)', () => {
  test('(g) FE 35 + IT 2,9(+) + LAVI 34,1(+) sem E/A → grau não determinado (era Grau II)', () => {
    const m = baseRamoB(35);
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 34.1;
    const r = calcular(m);
    assert.ok(r.achados.includes(SEM_GRADUACAO), `esperado sem graduação: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(GRAU_II), 'Grau II afirmado sem fluxo mitral');
  });

  // Reescrito na revisão da tríade (C-I2): ASE/EACVI 2016, premissa do
  // Algoritmo B — o algoritmo simplificado existe porque, com FE DEPRIMIDA, a
  // presença de disfunção diastólica é dada; a pergunta que resta é a pressão
  // de enchimento. Dizer "Indeterminada" aqui negava essa premissa e produzia a
  // inversão do relatório do Codex (ver o describe da inversão, abaixo).
  test('(h) FE 35 + IT 2,2(−) + LAVI 30(−) sem E/A → grau não determinado (FE deprimida afirma a presença)', () => {
    const m = baseRamoB(35);
    m.diastolica.velocidadeIT = 2.2;
    m.diastolica.volAEindex = 30;
    const r = calcular(m);
    assert.ok(r.achados.includes(SEM_GRADUACAO), `esperado sem graduação: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(GRAU_I), 'Grau I afirmado sem fluxo mitral');
    assert.ok(!r.achados.includes(INDETERMINADA), 'presença negada apesar da FE deprimida (C-I2)');
  });

  test('(i) FE 35 + E/A 0,7 SEM onda E + 2 critérios(+) → grau não determinado (família indecidível)', () => {
    const m = baseRamoB(35);
    m.diastolica.relacaoEA = 0.7;
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 34.1;
    const r = calcular(m);
    assert.ok(r.achados.includes(SEM_GRADUACAO), `esperado sem graduação: ${JSON.stringify(r.achados)}`);
  });

  // Reescrito na revisão da tríade (C-I2), mesma citação da (h): a suficiência
  // (<2 critérios de pressão) segue impedindo o GRAU e a afirmação sobre a
  // PRESSÃO — não a presença, que aqui vem da FE, não dos critérios.
  test('(i2) FE 35 + só 1 critério medido, sem E/A → grau não determinado (suficiência barra o grau, não a presença)', () => {
    const m = baseRamoB(35);
    m.diastolica.volAEindex = 44;
    const r = calcular(m);
    assert.ok(r.achados.includes(SEM_GRADUACAO), `esperado sem graduação: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.some((a) => a.includes('Grau')), 'grau afirmado com 1 critério e sem fluxo mitral');
  });

  // Gatilho de MASSA sozinho não carrega a premissa do Algoritmo B: hipertrofia
  // não prova disfunção diastólica. Sem maioria de pressão e sem fluxo mitral,
  // não há o que afirmar — Indeterminada continua sendo a resposta honesta.
  test('(i3) massaAlta SOZINHA (FE normal) + IT 2,2(−) + LAVI 30(−) sem E/A → Indeterminada (C-I2: só feBaixa afirma presença)', () => {
    const m = medidasVazias();
    m.gerais.sexo = 'M';
    m.gerais.ritmo = 'S';
    m.gerais.peso = 70;
    m.gerais.altura = 175;
    m.sistolica.feSimpson = 60;   // FE preservada → feBaixa false
    m.camaras.ddve = 52;
    m.camaras.septoIV = 14;
    m.camaras.paredePosterior = 14; // imVE > 115 → massaAlta
    m.diastolica.velocidadeIT = 2.2;
    m.diastolica.volAEindex = 30;
    const r = calcular(m);
    assert.ok(r.derivados.imVE > 115, `fixture fraca: imVE=${r.derivados.imVE}`);
    assert.ok(r.achados.includes(INDETERMINADA), `esperado Indeterminada: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(SEM_GRADUACAO), 'presença afirmada só por massa (C-I2)');
  });

  // Braço positivo do gatilho de massa: não regride com o split da C-I2.
  test('(i4) massaAlta SOZINHA + IT 2,9(+) + LAVI 40(+) sem E/A → grau não determinado (maioria+ decide em qualquer gatilho)', () => {
    const m = medidasVazias();
    m.gerais.sexo = 'M';
    m.gerais.ritmo = 'S';
    m.gerais.peso = 70;
    m.gerais.altura = 175;
    m.sistolica.feSimpson = 60;
    m.camaras.ddve = 52;
    m.camaras.septoIV = 14;
    m.camaras.paredePosterior = 14;
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 40;
    const r = calcular(m);
    assert.ok(r.achados.includes(SEM_GRADUACAO), `esperado sem graduação: ${JSON.stringify(r.achados)}`);
  });
});

// ── Revisão da tríade (C-I2) ────────────────────────────────────────────────
// Inversão de PRESENÇA entre os ramos, relatada pelo Codex: com os MESMOS dados
// diastológicos (e' 5 · LAVI 40 · sem E/A · sem E/e' · sem IT), o ramo A com
// FE 60 dizia "disfunção presente, grau não determinado" — a Fig. 7 fecha
// maioria 2/2 com o e' e o LAVI — enquanto o ramo B com FE 40 dizia
// "Indeterminada", porque a Fig. 8 não vê o e' e sobra 1 critério só. O
// ventrículo PIOR recebia a frase mais branda.
//
// ASE/EACVI 2016: o Algoritmo B é escolhido justamente quando a FE está
// deprimida, situação em que a presença de disfunção diastólica é premissa do
// algoritmo. Sem fluxo mitral o GRAU segue indeterminável — a presença, não.
describe('calcular() — sem fluxo mitral, FE deprimida afirma presença (C-I2)', () => {
  function repro(feSimpson) {
    const m = medidasVazias();
    m.gerais.sexo = 'M';
    m.gerais.ritmo = 'S';
    m.sistolica.feSimpson = feSimpson;
    m.diastolica.eSeptal = 5;      // (+) na Fig. 7, invisível pra Fig. 8
    m.diastolica.volAEindex = 40;  // (+) nas duas
    return m;                      // sem E/A, sem onda E, sem E/e', sem IT
  }

  test('(k) FE 60 (ramo A) → grau não determinado (comportamento de referência)', () => {
    const r = calcular(repro(60));
    assert.ok(r.achados.includes(SEM_GRADUACAO), `esperado sem graduação: ${JSON.stringify(r.achados)}`);
  });

  test('(l) FE 40 (ramo B, coração PIOR) → grau não determinado, não mais "Indeterminada"', () => {
    const r = calcular(repro(40));
    assert.ok(r.achados.includes(SEM_GRADUACAO), `esperado sem graduação: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(INDETERMINADA), 'inversão de presença ainda viva (C-I2)');
  });

  test('(m) pino cross-ramo: FE 60 e FE 40 concordam com os mesmos dados diastológicos', () => {
    const grau = (r) => r.achados.filter((x) => x.includes('Diastólica do ventrículo esquerdo'));
    assert.deepEqual(grau(calcular(repro(60))), grau(calcular(repro(40))), 'ramos divergindo (C-I2)');
  });
});

describe('calcular() — empate da FA por maioria dos avaliados', () => {
  test("(e) FA: E/e' 20(+) + IT 2,9(+) + LAVI 30(−) + LARS 25(−), 2/4 → indeterminada (era elevada)", () => {
    const m = baseFA();
    m.diastolica.relacaoEEseptal = 20;
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 30;
    m.diastolica.laStrain = 25;
    const r = calcular(m);
    assert.ok(
      r.conclusoes.includes('Pressão de enchimento indeterminada (dados insuficientes para avaliação em arritmia cardíaca).'),
      `esperado FA indeterminada: ${JSON.stringify(r.conclusoes)}`,
    );
  });

  test('(f) FA 3/4 elevados → pressão elevada (maioria, não regride)', () => {
    const m = baseFA();
    m.diastolica.relacaoEEseptal = 20;
    m.diastolica.velocidadeIT = 2.9;
    m.diastolica.volAEindex = 40;
    m.diastolica.laStrain = 25;
    const r = calcular(m);
    assert.ok(
      r.conclusoes.includes('Parâmetros sugestivos de pressão de enchimento elevada.'),
      `esperado pressão elevada: ${JSON.stringify(r.conclusoes)}`,
    );
  });

  test('(f2) FA: LARS reduzido continua votando — LARS 14(+) + IT 3,0(+) + E/e\' 10(−), 2/3 → elevada', () => {
    // Preserva a intenção do DC15 (LARS conta como critério) numa maioria real.
    const m = baseFA();
    m.diastolica.laStrain = 14;
    m.diastolica.velocidadeIT = 3.0;
    m.diastolica.relacaoEEseptal = 10;
    const r = calcular(m);
    assert.ok(
      r.conclusoes.includes('Parâmetros sugestivos de pressão de enchimento elevada.'),
      `esperado pressão elevada: ${JSON.stringify(r.conclusoes)}`,
    );
  });

  test('(f3) FA: 1 elevado de 2 avaliados → indeterminada (empate, alinha com o sinusal)', () => {
    const m = baseFA();
    m.diastolica.relacaoEEseptal = 20;
    m.diastolica.velocidadeIT = 2.0;
    const r = calcular(m);
    assert.ok(
      r.conclusoes.includes('Pressão de enchimento indeterminada (dados insuficientes para avaliação em arritmia cardíaca).'),
      `esperado FA indeterminada: ${JSON.stringify(r.conclusoes)}`,
    );
  });

  test('(f4) FA: 0 elevados de 2 avaliados → pressão normal (ramo negativo preservado)', () => {
    const m = baseFA();
    m.diastolica.relacaoEEseptal = 10;
    m.diastolica.velocidadeIT = 2.0;
    const r = calcular(m);
    assert.ok(
      r.conclusoes.includes('Parâmetros sugestivos de pressão de enchimento normal.'),
      `esperado pressão normal: ${JSON.stringify(r.conclusoes)}`,
    );
  });
});
