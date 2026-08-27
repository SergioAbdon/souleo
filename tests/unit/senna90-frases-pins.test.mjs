// ══════════════════════════════════════════════════════════════════
// Senna93 F0-T5 (spec §3 C10): TAPSE/GLS-conclusão/LAVI-bandas/RAVI
// sem pin. BASELINE pré-F1 + os blocos já curados pela F1 (marcados
// F1-Tn). A fotografia da contradição B1 (GLS −19 "reduzido" no achado e
// "preservada" na conclusão) foi substituída pelo bloco F1-T3.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcular, calcularDerivados } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';
import { faixaGLSve } from '../../src/senna90/achados/strain.ts';

const temQueIncluir = (lista, trecho) =>
  assert.ok(lista.some((s) => s.includes(trecho)),
    `esperado trecho "${trecho}" em: ${JSON.stringify(lista, null, 1)}`);
const naoPodeIncluir = (lista, trecho) =>
  assert.ok(!lista.some((s) => s.includes(trecho)),
    `trecho proibido "${trecho}" presente em: ${JSON.stringify(lista, null, 1)}`);

describe('F1-T4 TAPSE — texto diz "VR > 17 mm" (ASE 2025)', () => {
  test('TAPSE 18 com VD preservado: sufixo com o VR corrigido', () => {
    const m = medidasVazias();
    m.sistolica.tapse = 18;
    const r = calcular(m);
    temQueIncluir(r.achados, 'TAPSE= 18 mm (VR > 17 mm)');
  });
});

describe('F1-T4 GLS VE — fronteira exata da faixa (18/16)', () => {
  test('faixaGLSve(-18) === normal (fronteira superior)', () => {
    assert.equal(faixaGLSve(-18), 'normal');
  });
  test('faixaGLSve(-16) === limitrofe (fronteira inferior)', () => {
    assert.equal(faixaGLSve(-16), 'limitrofe');
  });
});

// ══════════════════════════════════════════════════════════════════
// F1-T3 — GLS VE em 3 faixas (ASE/EACVI 2025): normal |≥18| · limítrofe
// 16–18 · reduzido <16. NÃO é baseline: é o comportamento NOVO. A
// contradição B1 (achado |20| × conclusão |18|) MORREU — faixaGLSve é a
// única fonte, achado e conclusão saem sempre da MESMA faixa.
// ══════════════════════════════════════════════════════════════════
describe('F1-T3 GLS VE — 3 faixas com fonte única (B1 extinta)', () => {
  // ddve 50 / dsve 30 → feT 0.7038 = FE preservada (pré-condição da concStrainVE)
  const laudoGLS = (gls) => {
    const m = medidasVazias();
    m.camaras.ddve = 50; m.camaras.dsve = 30;
    m.gerais.sexo = 'M';
    m.sistolica.glsVE = gls;
    return calcular(m);
  };
  test('GLS −19: NORMAL nas duas pontas (era "reduzido" no achado e "preservada" na conclusão)', () => {
    const r = laudoGLS(-19);
    temQueIncluir(r.achados, 'speckle tracking de -19% (VR ≤ -18%).');
    naoPodeIncluir(r.achados, 'ventrículo esquerdo reduzido');
    temQueIncluir(r.conclusoes, 'preservada, confirmada pelo strain longitudinal (-19%).');
  });
  test('GLS −17: LIMÍTROFE nas duas pontas (faixa nova)', () => {
    const r = laudoGLS(-17);
    temQueIncluir(r.achados, 'no limite inferior da normalidade (faixa -18 a -16%) pelo speckle tracking de -17%.');
    naoPodeIncluir(r.achados, 'ventrículo esquerdo reduzido');
    temQueIncluir(r.conclusoes, 'preservada, com strain longitudinal no limite inferior da normalidade (-17%).');
    naoPodeIncluir(r.conclusoes, 'subclínica');
  });
  test('GLS −15: REDUZIDO no achado e "subclínica" na conclusão', () => {
    const r = laudoGLS(-15);
    temQueIncluir(r.achados, 'ventrículo esquerdo reduzido pelo speckle tracking de -15% (VR ≤ -18%).');
    temQueIncluir(r.conclusoes, 'strain longitudinal reduzido (-15%), sugestivo de disfunção subclínica.');
  });
  test('GLS −21: normal nas duas pontas', () => {
    const r = laudoGLS(-21);
    temQueIncluir(r.achados, 'speckle tracking de -21% (VR ≤ -18%).');
    naoPodeIncluir(r.achados, 'ventrículo esquerdo reduzido');
    temQueIncluir(r.conclusoes, 'preservada, confirmada pelo strain longitudinal (-21%).');
  });
});

describe('F1-T5 LAVI — j4: >34 leve · ≥42 mod · >48 IMP (Lang 2015)', () => {
  const comLavi = (v) => {
    const m = medidasVazias();
    m.diastolica.volAEindex = v;
    return calcular(m).achados;
  };
  test('35 → leve', () => temQueIncluir(comLavi(35), 'leve'));
  test('42 → moderado', () => temQueIncluir(comLavi(42), 'moderado'));
  test('48 → moderado (Lang 2015: grave é >48)', () =>
    temQueIncluir(comLavi(48), 'moderado'));
  test('49 → importante', () => temQueIncluir(comLavi(49), 'importante'));
  test('34 → silêncio', () => naoPodeIncluir(comLavi(34), 'Átrio esquerdo aumentado'));
});

// ══════════════════════════════════════════════════════════════════
// F1-T2 — TEXTOS da aorta (não é baseline: é o comportamento NOVO).
// "Ectasia" morreu; entram a nota cirúrgica (≥50 raiz/asc · ≥55 arco) e
// a frase de angio-TC/RM (arco dilatado ou não visualizado).
// ══════════════════════════════════════════════════════════════════
const NOTA_CIRURGIA = 'sugere-se avaliação cirúrgica especializada (ACC/AHA 2022)';
const FRASE_ANGIO = 'Sugere-se complementação com angiotomografia ou angiorressonância da aorta torácica';

const laudoAorta = ({ raiz = null, asc = null, arco = null, placas = '', altura = 175 } = {}) => {
  const m = medidasVazias();
  m.gerais.sexo = 'M';
  m.gerais.altura = altura;
  m.identificacao.pacienteDtnasc = '1996-01-01';  // 30 anos no exame
  m.identificacao.dataExame = '2026-01-01';
  m.camaras.raizAo = raiz;
  m.camaras.aoAscendente = asc;
  m.camaras.arcoAo = arco;
  m.valvas.placasArco = placas;
  return calcular(m);
};

describe('F1-T2 aorta — nomenclatura ACC/AHA nos achados e conclusões', () => {
  test('raiz ♂30a 39 mm (dilatação): "Dilatação da Raiz aórtica" + índice, sem nota', () => {
    const r = laudoAorta({ raiz: 39 });
    temQueIncluir(r.achados, 'Dilatação da Raiz aórtica, ');
    temQueIncluir(r.achados, 'cm²/m (valores acima de 10 cm²/m sugerem maior gravidade)');
    naoPodeIncluir(r.achados, 'Ectasia');
    naoPodeIncluir(r.achados, NOTA_CIRURGIA);
    temQueIncluir(r.conclusoes, 'Dilatação da Raiz aórtica.');
  });
  test('raiz 46 mm (aneurisma 45-49): "Dilatação aneurismática" COM índice e SEM nota (I1)', () => {
    const r = laudoAorta({ raiz: 46 });
    temQueIncluir(r.achados, 'Dilatação aneurismática da Raiz aórtica, ');
    temQueIncluir(r.achados, 'cm²/m (valores acima de 10 cm²/m sugerem maior gravidade).');
    naoPodeIncluir(r.achados, NOTA_CIRURGIA);
    temQueIncluir(r.conclusoes, 'Aneurisma da Raiz aórtica');
  });
  test('raiz 52 mm: aneurisma COM a nota cirúrgica ≥ 50', () => {
    const r = laudoAorta({ raiz: 52 });
    temQueIncluir(r.achados, 'Dilatação aneurismática da Raiz aórtica, ');
    temQueIncluir(r.achados, 'Diâmetro ≥ 50 mm: ' + NOTA_CIRURGIA + '.');
  });
  test('arco 42 mm: "Arco aórtico dilatado, medindo 42 mm." + frase de angio-TC/RM', () => {
    const r = laudoAorta({ arco: 42 });
    temQueIncluir(r.achados, 'Arco aórtico dilatado, medindo 42 mm.');
    temQueIncluir(r.achados, FRASE_ANGIO);
    naoPodeIncluir(r.achados, NOTA_CIRURGIA);
    temQueIncluir(r.conclusoes, 'Dilatação do arco aórtico.');
    naoPodeIncluir(r.conclusoes, 'Aneurisma do arco');
  });
  test('arco 55 mm: nota cirúrgica ≥ 55 (e continua "dilatado", nunca aneurisma)', () => {
    const r = laudoAorta({ arco: 55 });
    temQueIncluir(r.achados, 'Arco aórtico dilatado, medindo 55 mm.');
    temQueIncluir(r.achados, 'Diâmetro ≥ 55 mm: ' + NOTA_CIRURGIA + '.');
    naoPodeIncluir(r.conclusoes, 'Aneurisma');
  });
  test("arco NÃO VISUALIZADO ('nv') sem medida: frase de angio-TC/RM mesmo assim", () => {
    const r = laudoAorta({ arco: null, placas: 'nv' });
    temQueIncluir(r.achados, FRASE_ANGIO);
  });
  test('arco 38 mm normal e sem "nv": frase de angio-TC/RM AUSENTE', () => {
    const r = laudoAorta({ arco: 38 });
    naoPodeIncluir(r.achados, FRASE_ANGIO);
  });
});

// ══════════════════════════════════════════════════════════════════
// F1-T6 — B8: j22 sinusal monta só os campos preenchidos (sem buracos).
// Antes: template fixo imprimia "Relação E/A= ; " com campo vazio.
// Depois: monta um array e faz join — buraco não aparece.
// ══════════════════════════════════════════════════════════════════
describe('F1-T6 j22 sinusal — sem buracos (B8)', () => {
  test('só Onda E + E/A preenchidos: frase SEM "= ;" e SEM "e\' septal"', () => {
    const m = medidasVazias();
    m.gerais.ritmo = 'S';
    m.diastolica.ondaE = 80;
    m.diastolica.relacaoEA = 1.2;
    const r = calcular(m);
    temQueIncluir(r.achados, 'Velocidade da Onda E= 80 cm/s; Relação E/A= 1.2.');
    naoPodeIncluir(r.achados, '= ;');
    naoPodeIncluir(r.achados, "e' septal");
  });

  test('todos preenchidos: frase completa IDÊNTICA à antiga (paridade byte a byte)', () => {
    const m = medidasVazias();
    m.gerais.ritmo = 'S';
    m.diastolica.ondaE = 80;
    m.diastolica.relacaoEA = 1.2;
    m.diastolica.eSeptal = 9;
    m.diastolica.relacaoEEseptal = 8;
    m.diastolica.volAEindex = 28;
    m.diastolica.velocidadeIT = 2.5;
    const r = calcular(m);
    const fraseAntiga =
      "Velocidade da Onda E= 80 cm/s; Relação E/A= 1.2; Velocidade e' septal= 9 cm/s; " +
      "Relação E/e'= 8; volume index do átrio esquerdo = 28 ml/m²; " +
      'Velocidade do Refluxo Tricuspídeo= 2.5 m/s.';
    temQueIncluir(r.achados, fraseAntiga);
  });
});

// ══════════════════════════════════════════════════════════════════
// F1-T7 — estenoses (spec §2.5). Comportamento NOVO:
// · Mitral: ÁREA é primária (gradiente baixo por fluxo baixo não
//   subclassifica mais); faixa 1,5–2,0 só fecha "leve" com grad ≥5 (B19).
// · Aórtica: PIOR grau entre os critérios (low-flow-low-gradient deixa
//   de sair "leve"); esclerose só quando é o único critério.
// · Esclerose ganha frase no ACHADO (B27) — conclusão segue silenciando.
// · Estenose tricúspide sempre imprime o gradiente que fechou o grau (B18).
// ══════════════════════════════════════════════════════════════════
describe('F1-T7 estenoses — mitral área-primária · aórtica pior-grau · esclerose · B18', () => {
  const derivados = (mut) => {
    const m = medidasVazias();
    mut(m.estenoses);
    return calcularDerivados(m);
  };

  test('mitral área 0.8 + grad 3: importante (era "leve" pelo gradiente)', () => {
    assert.equal(derivados((e) => { e.areaMitral = 0.8; e.gradMedMitral = 3; }).estenMitGrau, 'importante');
  });
  test('mitral área 1.8 sem gradiente: silêncio (1,5–2,0 não fecha sozinha)', () => {
    assert.equal(derivados((e) => { e.areaMitral = 1.8; }).estenMitGrau, '');
  });
  test('mitral área 1.8 + grad 6: leve (B19 — gradiente dá o suporte)', () => {
    assert.equal(derivados((e) => { e.areaMitral = 1.8; e.gradMedMitral = 6; }).estenMitGrau, 'leve');
  });
  test('mitral sem área, grad 12: importante (gradiente decide)', () => {
    assert.equal(derivados((e) => { e.gradMedMitral = 12; }).estenMitGrau, 'importante');
  });

  test('aórtica área 0.8 + gradMax 30: importante (era "leve" pelo gradMax)', () => {
    assert.equal(derivados((e) => { e.areaAo = 0.8; e.gradMaxAo = 30; }).estenAoGrau, 'importante');
  });
  test('aórtica gradMax 20 sozinho: esclerose + achado presente, conclusão silenciada', () => {
    const m = medidasVazias();
    m.estenoses.gradMaxAo = 20;
    assert.equal(calcularDerivados(m).estenAoGrau, 'esclerose');
    const r = calcular(m);
    temQueIncluir(r.achados, 'Esclerose valvar aórtica, sem estenose significativa.');
    naoPodeIncluir(r.conclusoes, 'Estenose Aórtica');
  });

  test('tricúspide grad 3 + área 0.9: importante COM o gradiente impresso (B18)', () => {
    const m = medidasVazias();
    m.estenoses.gradMedTric = 3;
    m.estenoses.areaTric = 0.9;
    assert.equal(calcularDerivados(m).estenTricGrau, 'importante');
    temQueIncluir(calcular(m).achados, 'Gradiente transvalvar tricúspide médio de 3 mmHg.');
  });
});

describe('BASELINE RAVI (JASE 2025 unificado) — j5: <30 sil · ≤36 leve · ≤41 mod · >41 imp', () => {
  const comRavi = (v) => {
    const m = medidasVazias();
    m.diastolica.volADindex = v;
    return calcular(m).achados;
  };
  test('29 → silêncio', () => naoPodeIncluir(comRavi(29), 'Átrio direito aumentado'));
  test('30 → leve', () => temQueIncluir(comRavi(30), 'leve'));
  test('37 → moderado', () => temQueIncluir(comRavi(37), 'moderado'));
  test('42 → importante', () => temQueIncluir(comRavi(42), 'importante'));
});
