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
  'Disfunção Diastólica do ventrículo esquerdo presente, de grau não determinado.';
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

// ── Revisão final F1 ────────────────────────────────────────────────────────
// A zona média do ramo A (E/A ≤0,8 com E >50, ou 0,8 < E/A < 2) caía DIRETO em
// Grau II depois que a entrada por maioria da Fig. 7 dizia "disfunção presente".
// Isso não era problema enquanto a entrada exigia c≥3 de 4 (anexo §10: com c≥3
// sempre há ≥2 dos 3 critérios de pressão positivos) — mas a T2 trocou a entrada
// por MAIORIA dos avaliados, que admite c=2 de 3, e aí o Grau II podia sair com
// a Fig. 8 empatada. Resultado: os MESMOS dados diastológicos davam Grau II com
// FE 60 (ramo A) e Indeterminada com FE 35 (ramo B) — inversão de gravidade
// contra a própria FE. O grau da zona média agora sai da MESMA régua nos dois
// ramos: maioria dos 3 critérios de pressão da Fig. 8 (E/e' septal >15 · IT >2,8
// · LAVI >34), com <2 avaliados ou empate → Indeterminada.
//
// Cada caso abaixo declara o caminho ENTRADA (Fig. 7, 4 critérios) × GRADUAÇÃO
// (Fig. 8, 3 critérios) — são contagens diferentes sobre conjuntos diferentes.
const INDETERMINADA = 'Função Diastólica do ventrículo esquerdo Indeterminada';

describe('calcular() — zona média do ramo A gradua pela Fig. 8 (revisão final F1)', () => {
  // Base diastológica da inversão provada na revisão: e' 5(+) · E/e' 10(−) ·
  // LAVI 40(+) · IT ausente · E/A 1,2 (zona média) · onda E 80.
  function inversao(feSimpson) {
    const m = medidasVazias();
    m.gerais.sexo = 'M';
    m.gerais.ritmo = 'S';
    m.sistolica.feSimpson = feSimpson;
    m.diastolica.ondaE = 80;
    m.diastolica.relacaoEA = 1.2;
    m.diastolica.eSeptal = 5;
    m.diastolica.relacaoEEseptal = 10;
    m.diastolica.volAEindex = 40;
    return m;
  }

  test("(f) FE 60 · e' 5(+) E/e' 10(−) LAVI 40(+) IT ausente · E/A 1,2 → Indeterminada (era Grau II)", () => {
    // ENTRADA (Fig. 7): e'(+) E/e'(−) LAVI(+) = 2 de 3 avaliados → maioria → disfunção.
    // GRADUAÇÃO (Fig. 8): E/e'(−) LAVI(+) = 1 de 2 → EMPATE → sem grau afirmável.
    const r = calcular(inversao(60));
    assert.ok(r.achados.includes(INDETERMINADA), `esperado Indeterminada: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(GRAU_II), 'Grau II com Fig. 8 empatada (regressão F1)');
  });

  test('(g) mesma base + IT 3,0(+) → Grau II (Fig. 8 vira 2 de 3)', () => {
    // ENTRADA: e'(+) E/e'(−) IT(+) LAVI(+) = 3 de 4 → maioria.
    // GRADUAÇÃO: E/e'(−) IT(+) LAVI(+) = 2 de 3 → maioria positiva → Grau II.
    const m = inversao(60);
    m.diastolica.velocidadeIT = 3.0;
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_II), `esperado Grau II: ${JSON.stringify(r.achados)}`);
  });

  test("(h) e' 5(+) E/e' 16(+) LAVI 30(−) IT ausente · E/A 1,2 → Indeterminada (empate na Fig. 8)", () => {
    // ENTRADA: e'(+) E/e'(+) LAVI(−) = 2 de 3 → maioria → disfunção presente.
    // GRADUAÇÃO: E/e'(+) LAVI(−) = 1 de 2 → EMPATE. A entrada e a graduação
    // divergem porque o e' só existe na Fig. 7 (é critério de disfunção, não de
    // pressão de enchimento).
    const m = inversao(60);
    m.diastolica.relacaoEEseptal = 16;
    m.diastolica.volAEindex = 30;
    const r = calcular(m);
    assert.ok(r.achados.includes(INDETERMINADA), `esperado Indeterminada: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.includes(GRAU_II), 'Grau II com Fig. 8 empatada (regressão F1)');
  });

  test('(i) E/A 2,2 com a mesma base → Grau III (regra direta não passa pela Fig. 8)', () => {
    // E/A ≥2 decide sozinho antes da zona média — a Fig. 8 nem é consultada.
    const m = inversao(60);
    m.diastolica.ondaE = 100;
    m.diastolica.relacaoEA = 2.2;
    const r = calcular(m);
    assert.ok(r.achados.includes(GRAU_III), `esperado Grau III: ${JSON.stringify(r.achados)}`);
  });

  test('(j) pino cross-ramo: FE 60 e FE 35 com os mesmos dados diastológicos concordam', () => {
    // Era a inversão: FE 60 (ramo A) dizia Grau II e FE 35 (ramo B, coração
    // PIOR) dizia Indeterminada. Mesma régua nos dois → mesma resposta.
    const a = calcular(inversao(60));
    const b = calcular(inversao(35));
    const grau = (r) => r.achados.filter((x) => x.includes('Diastólica do ventrículo esquerdo'));
    assert.deepEqual(grau(a), grau(b), 'ramo A e ramo B divergindo com os mesmos dados diastológicos');
    assert.ok(a.achados.includes(INDETERMINADA), `esperado Indeterminada nos dois: ${JSON.stringify(a.achados)}`);
  });
});
