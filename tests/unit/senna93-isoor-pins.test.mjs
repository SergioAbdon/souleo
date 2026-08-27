// ══════════════════════════════════════════════════════════════════
// Senna93 F2-T1 (spec §2.7/C3): pins de fronteira do isOOR reescrito.
// Cada linha da tabela × sexo (× idade no b7) grava o par
// (último NORMAL, primeiro VERMELHO). Se um corte derivar de novo,
// um destes pares vira falha na hora.
// Regra C8: sexo vazio → nada acende. Valor null → nada acende.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isOOR, tetoRaiz } from '../../src/senna90/classificacoes/isOOR.ts';

/** (último normal, primeiro OOR) para um campo+sexo+idade. */
function fronteira(campo, sexo, normal, oor, idade = null) {
  assert.equal(isOOR(campo, normal, sexo, idade), false,
    `${campo} ${sexo}${idade === null ? '' : ' ' + idade + 'a'}: ${normal} devia ser normal`);
  assert.equal(isOOR(campo, oor, sexo, idade), true,
    `${campo} ${sexo}${idade === null ? '' : ' ' + idade + 'a'}: ${oor} devia acender`);
}

describe('Senna93 isOOR — b7 raiz (WASE sexo+idade, só teto)', () => {
  test('♂ por faixa etária: 38 / 40 / 41', () => {
    fronteira('b7', 'M', 38, 39, 30);
    fronteira('b7', 'M', 40, 41, 50);
    fronteira('b7', 'M', 41, 42, 70);
  });
  test('♀ por faixa etária: 35 / 36 / 38 (≥66 = 38, WASE cru 37,5)', () => {
    fronteira('b7', 'F', 35, 36, 30);
    fronteira('b7', 'F', 36, 37, 50);
    fronteira('b7', 'F', 38, 39, 70);
  });
  test('sem idade cai na faixa média 41-65 (paridade legado): ♂40 · ♀36', () => {
    fronteira('b7', 'M', 40, 41, null);
    fronteira('b7', 'F', 36, 37, null);
    assert.equal(tetoRaiz('M', null), 40);
    assert.equal(tetoRaiz('F', null), 36);
  });
  test('bordas das faixas WASE: 40 vs 41 e 65 vs 66 anos', () => {
    // ♂ 38 (≤40a) → 40 (41-65) → 41 (≥66)
    assert.equal(isOOR('b7', 39, 'M', 40), true);    // 40a ainda é jovem
    assert.equal(isOOR('b7', 39, 'M', 41), false);   // 41a já é faixa média
    assert.equal(isOOR('b7', 41, 'M', 65), true);    // 65a ainda é média
    assert.equal(isOOR('b7', 41, 'M', 66), false);   // 66a já é idoso
    // ♀ 35 (≤40a) → 36 (41-65) → 38 (≥66)
    assert.equal(isOOR('b7', 36, 'F', 40), true);
    assert.equal(isOOR('b7', 36, 'F', 41), false);
    assert.equal(isOOR('b7', 37, 'F', 65), true);
    assert.equal(isOOR('b7', 37, 'F', 66), false);
  });
  test('b7 não tem corte inferior — raiz pequena não acende', () => {
    assert.equal(isOOR('b7', 20, 'M', 50), false);
    assert.equal(isOOR('b7', 20, 'F', 50), false);
  });
});

describe('Senna93 isOOR — medidas cruas (mm)', () => {
  test('b8 AE: ♂30-40 · ♀27-38', () => {
    fronteira('b8', 'M', 30, 29);
    fronteira('b8', 'M', 40, 41);
    fronteira('b8', 'F', 27, 26);
    fronteira('b8', 'F', 38, 39);
  });
  test('b9 DDVE: ♂42-58 · ♀38-52', () => {
    fronteira('b9', 'M', 42, 41);
    fronteira('b9', 'M', 58, 59);
    fronteira('b9', 'F', 38, 37);
    fronteira('b9', 'F', 52, 53);
  });
  test('b10 septo: ♂6-10 · ♀6-9', () => {
    fronteira('b10', 'M', 6, 5.9);
    fronteira('b10', 'M', 10, 10.1);
    fronteira('b10', 'F', 6, 5.9);   // piso ♀ é 6 também
    fronteira('b10', 'F', 9, 9.1);
  });
  test('b11 parede posterior: mesmos cortes do b10', () => {
    fronteira('b11', 'M', 6, 5.9);
    fronteira('b11', 'M', 10, 10.1);
    fronteira('b11', 'F', 6, 5.9);
    fronteira('b11', 'F', 9, 9.1);
  });
  test('b12 DSVE: ♂25-40 · ♀21-35', () => {
    fronteira('b12', 'M', 25, 24);
    fronteira('b12', 'M', 40, 41);
    fronteira('b12', 'F', 21, 20);
    fronteira('b12', 'F', 35, 36);
  });
  test('b13 VD: 21-35 unificado (idêntico nos dois sexos)', () => {
    fronteira('b13', 'M', 21, 20);
    fronteira('b13', 'M', 35, 36);
    fronteira('b13', 'F', 21, 20);
    fronteira('b13', 'F', 35, 36);
  });
  test('b28 aorta ascendente: ♂≤38 · ♀≤35 (ASE Chamber Tab.14)', () => {
    fronteira('b28', 'M', 38, 39);
    fronteira('b28', 'F', 35, 36);
  });
  test('b29 arco: ≤40 SEM distinção de sexo (ACC/AHA, teto prático)', () => {
    fronteira('b29', 'M', 40, 41);
    fronteira('b29', 'F', 40, 41);
  });
});

describe('Senna93 isOOR — derivados (B13: passam a acender)', () => {
  test('imc: <25 normal', () => {
    fronteira('imc', 'M', 24.9, 25);
    fronteira('imc', 'F', 24.9, 25);
  });
  test('vdf: ♂62-150 · ♀46-106', () => {
    fronteira('vdf', 'M', 62, 61);
    fronteira('vdf', 'M', 150, 151);
    fronteira('vdf', 'F', 46, 45);
    fronteira('vdf', 'F', 106, 107);
  });
  test('vsf: ♂21-61 · ♀14-42', () => {
    fronteira('vsf', 'M', 21, 20);
    fronteira('vsf', 'M', 61, 62);
    fronteira('vsf', 'F', 14, 13);
    fronteira('vsf', 'F', 42, 43);
  });
  test('feT compara DECIMAL (0,52/0,54), não porcento', () => {
    fronteira('feT', 'M', 0.52, 0.5199);   // ≥0,52 é normal
    fronteira('feT', 'F', 0.54, 0.5399);
    assert.equal(isOOR('feT', 0.53, 'M', null), false);
    assert.equal(isOOR('feT', 0.53, 'F', null), true);   // ♀ exige 0,54
    assert.equal(isOOR('feT', 52, 'M', null), false);    // 52 (porcento) não acende
  });
  test('fs: 0,30-0,40 nos dois sexos', () => {
    fronteira('fs', 'M', 0.30, 0.29);
    fronteira('fs', 'M', 0.40, 0.41);
    fronteira('fs', 'F', 0.30, 0.29);
    fronteira('fs', 'F', 0.40, 0.41);
  });
  test('massa: ♂≤200 · ♀≤150', () => {
    fronteira('massa', 'M', 200, 200.1);
    fronteira('massa', 'F', 150, 150.1);
  });
  test('imVE: ♂≤115 · ♀≤95 (V2, Lang 2015)', () => {
    fronteira('imVE', 'M', 115, 115.1);
    fronteira('imVE', 'F', 95, 95.1);
  });
  test('er: >0,42 acende', () => {
    fronteira('er', 'M', 0.42, 0.43);
    fronteira('er', 'F', 0.42, 0.43);
  });
  test('aoae e asc não têm referência — nunca acendem', () => {
    for (const sexo of ['M', 'F']) {
      assert.equal(isOOR('aoae', 99, sexo, 50), false);
      assert.equal(isOOR('asc', 99, sexo, 50), false);
      assert.equal(isOOR('aoae', 0, sexo, 50), false);
      assert.equal(isOOR('asc', 0, sexo, 50), false);
    }
  });
});

describe('Senna93 isOOR — C8: sexo vazio e valor ausente', () => {
  test("sexo '' → NADA acende (o alerta SEXO_AUSENTE explica)", () => {
    // inclui as linhas SEM distinção de sexo (b13/b29/imc): elas também apagam
    for (const [campo, valor] of [['b7', 99], ['b9', 99], ['b13', 99], ['b28', 99],
      ['b29', 99], ['imc', 99], ['feT', 0.1], ['imVE', 999]]) {
      assert.equal(isOOR(campo, valor, '', 50), false, `${campo} acendeu sem sexo`);
    }
  });
  test('valor null → nunca acende (ausência não é anormalidade)', () => {
    for (const campo of ['b7', 'b13', 'b29', 'imc', 'er']) {
      assert.equal(isOOR(campo, null, 'M', 50), false, `${campo} acendeu com valor null`);
    }
  });
});
