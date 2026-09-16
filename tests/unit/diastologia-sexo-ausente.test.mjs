// Sexo ausente e massa não-indexável (ASE/EACVI 2016) — Task 4 do plano
// docs/planos/2026-08-28-diastologia-guideline-ase2016.md (D6 + NOVO-1 + NOVO-2).
//
// Postura C8 da casa: régua dependente de sexo NÃO roda calada no default
// masculino. Sem sexo, o GATILHO do ramo B (gatilhosRamoB) decide só onde
// ♂ e ♀ CONCORDAM:
//  - FE Simpson <52 (baixa nas duas) dispara · ≥54 (normal nas duas) não dispara
//    · [52,54) discordam → não-avaliável
//  - imVE >115 dispara · ≤95 não · (95,115] discordam → não-avaliável
// NOVO-1: massa calculável com imVE null (sem peso/altura) → MASSA_NAO_INDEXAVEL.
//
// Revisão T4 (Important): o ALERTA SEXO_AUSENTE não fica mais preso à faixa
// ambígua do gatilho — a frase da FE Simpson (achados/sistolica.ts:jFE_Simpson)
// silencia sozinha sem sexo, em QUALQUER valor de Simpson. O motor dispara o
// alerta sempre que a régua da FE Simpson foi consultada sem sexo
// (`feSimpson !== null`), concordante ou não.
//
// Valores de reprodução do anexo normativo
// (docs/planos/2026-08-28-auditoria-diastologia-ase2016.md, D6 e ADENDO NOVO-1/2).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

const PRESERVADOS = 'Índices diastólicos do ventrículo esquerdo preservados';
const MSG_SEXO = 'Sexo não informado — referências e classificações dependentes de sexo podem ficar suprimidas ou limitadas.';
const MSG_MASSA = 'Massa do VE calculada mas não indexável — informe peso e altura para o índice de massa.';

const tipos = (r) => r.alertas.map((a) => a.tipo);

// Diástole 100% normal do anexo: E 80 · E/A 1,2 · e' 9 · E/e' 8 · LAVI 28 · IT 2,2
function diastoleNormal() {
  const m = medidasVazias();
  m.gerais.sexo = ''; // AUSENTE — o ponto da task
  m.gerais.ritmo = 'S';
  m.diastolica.ondaE = 80;
  m.diastolica.relacaoEA = 1.2;
  m.diastolica.eSeptal = 9;
  m.diastolica.relacaoEEseptal = 8;
  m.diastolica.velocidadeIT = 2.2;
  m.diastolica.volAEindex = 28;
  return m;
}

describe('calcular() — sexo ausente: dupla concordância nos gatilhos (D6/NOVO-2)', () => {
  test('(a) sexo "" + Simpson 53 (zona ambígua ♂52/♀54) → sem grau fantasma + alerta SEXO_AUSENTE', () => {
    const m = diastoleNormal();
    m.sistolica.feSimpson = 53;
    const r = calcular(m);
    assert.ok(r.achados.includes(PRESERVADOS), `esperado preservados: ${JSON.stringify(r.achados)}`);
    assert.ok(!r.achados.some((a) => a.includes('Grau')), 'gatilho ambíguo disparou o ramo B');
    assert.ok(tipos(r).includes('SEXO_AUSENTE'), `alerta ausente: ${JSON.stringify(tipos(r))}`);
  });

  test('(b) sexo "" + Simpson 45 (baixa nas DUAS réguas, zona CONCORDANTE) → ramo B decide E alerta SEXO_AUSENTE dispara', () => {
    const m = diastoleNormal();
    m.sistolica.feSimpson = 45;
    const r = calcular(m);
    assert.ok(
      r.achados.some((a) => a.includes('Grau') || a.includes('Indeterminada') || a.includes('não determinado')),
      `ramo B deveria decidir: ${JSON.stringify(r.achados)}`
    );
    // Achado da revisão T4 (Important): a régua do gatilho concorda (♂/♀ ambos
    // <52), mas a FRASE da FE Simpson (achados/sistolica.ts:jFE_Simpson) checa
    // `!sexo` sozinha e SILENCIA de qualquer forma — exame só-diastologia/FE
    // (nenhuma medida de câmara) fica sem nenhuma frase de FE e sem nenhum
    // aviso, se o gate não disparasse aqui. Corrigido: o gate agora dispara
    // sempre que `feSimpson !== null` sem sexo, não só na faixa ambígua do
    // gatilho do ramo B.
    assert.ok(tipos(r).includes('SEXO_AUSENTE'), `alerta ausente: ${JSON.stringify(tipos(r))}`);
  });

  test('(b2) sexo "" + Simpson 60 (normal nas DUAS réguas, zona CONCORDANTE) → alerta SEXO_AUSENTE dispara mesmo assim (contra-exemplo do revisor)', () => {
    const m = diastoleNormal();
    m.sistolica.feSimpson = 60;
    const r = calcular(m);
    // jFE_Simpson silencia a frase de FE sem sexo mesmo com FE normal — o
    // médico precisa do aviso independente do valor de Simpson.
    assert.ok(tipos(r).includes('SEXO_AUSENTE'), `alerta ausente: ${JSON.stringify(tipos(r))}`);
  });

  test('(c) sexo "" + imVE na zona ambígua (95,115] → massaAlta não dispara + alerta', () => {
    const m = diastoleNormal();
    m.gerais.peso = 70;
    m.gerais.altura = 175;
    m.camaras.ddve = 50;
    m.camaras.septoIV = 10;
    m.camaras.paredePosterior = 10; // imVE ~98 → ♀ alta, ♂ normal
    const r = calcular(m);
    const imVE = r.derivados.imVE;
    assert.ok(imVE > 95 && imVE <= 115, `fixture fora da zona ambígua: imVE=${imVE}`);
    assert.ok(r.achados.includes(PRESERVADOS), `esperado preservados: ${JSON.stringify(r.achados)}`);
    assert.ok(tipos(r).includes('SEXO_AUSENTE'), `alerta ausente: ${JSON.stringify(tipos(r))}`);
  });

  test('(d) sexo "" + imVE >115 (alta nas DUAS réguas) → ramo B dispara', () => {
    const m = diastoleNormal();
    m.gerais.peso = 70;
    m.gerais.altura = 175;
    m.camaras.ddve = 52;
    m.camaras.septoIV = 12;
    m.camaras.paredePosterior = 12; // imVE >115
    m.diastolica.relacaoEA = 2.2;   // critério direto do ramo B (E/A ≥2 → Grau III)
    const r = calcular(m);
    assert.ok(r.derivados.imVE > 115, `fixture fraca: imVE=${r.derivados.imVE}`);
    assert.ok(
      r.achados.some((a) => a.includes('Grau III')),
      `massaAlta deveria selecionar o ramo B: ${JSON.stringify(r.achados)}`
    );
  });

  test('(g) mensagem do SEXO_AUSENTE diz a verdade sobre a diastologia (NOVO-2)', () => {
    const m = medidasVazias();
    m.camaras.ddve = 50; // gatilho ANTIGO (medida de câmara) — não regride
    const r = calcular(m);
    const a = r.alertas.find((x) => x.tipo === 'SEXO_AUSENTE');
    assert.ok(a, 'gatilho antigo regrediu');
    assert.equal(a.mensagem, MSG_SEXO);
    assert.equal(a.campo, 'sexo');
  });
});

describe('calcular() — massa calculada mas não indexável (NOVO-1)', () => {
  test('(e) SIV 16 + PP 16 + DDVE 50 SEM peso/altura → MASSA_NAO_INDEXAVEL', () => {
    const m = medidasVazias();
    m.gerais.sexo = 'M';
    m.camaras.septoIV = 16;
    m.camaras.paredePosterior = 16;
    m.camaras.ddve = 50;
    const r = calcular(m);
    assert.ok(r.derivados.massa !== null, 'massa deveria ser calculável');
    assert.equal(r.derivados.imVE, null);
    const a = r.alertas.find((x) => x.tipo === 'MASSA_NAO_INDEXAVEL');
    assert.ok(a, `alerta ausente: ${JSON.stringify(tipos(r))}`);
    assert.equal(a.mensagem, MSG_MASSA);
    assert.equal(a.campo, 'peso');
  });

  test('(f) mesmo exame COM peso/altura → imVE calcula, sem o alerta', () => {
    const m = medidasVazias();
    m.gerais.sexo = 'M';
    m.gerais.peso = 70;
    m.gerais.altura = 175;
    m.camaras.septoIV = 16;
    m.camaras.paredePosterior = 16;
    m.camaras.ddve = 50;
    const r = calcular(m);
    assert.ok(r.derivados.imVE !== null);
    assert.ok(!tipos(r).includes('MASSA_NAO_INDEXAVEL'), `alerta indevido: ${JSON.stringify(tipos(r))}`);
  });

  test('sem massa (só DDVE) → nenhum alerta de massa', () => {
    const m = medidasVazias();
    m.gerais.sexo = 'M';
    m.camaras.ddve = 50;
    const r = calcular(m);
    assert.equal(r.derivados.massa, null);
    assert.ok(!tipos(r).includes('MASSA_NAO_INDEXAVEL'));
  });
});
