// ══════════════════════════════════════════════════════════════════
// Senna93 F2-T2 (plano §Task 2): pins da coluna VR impressa no laudo.
// Grava a string EXATA das 19 linhas × sexo (b7 × idade), inclusive
// travessão/espaço — é texto de laudo assinado, byte importa.
// Fecha também a COERÊNCIA refVal ↔ isOOR: nenhuma referência
// impressa sem realce possível, nenhum realce sem referência.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { refVal } from '../../src/senna90/classificacoes/refValues.ts';
import { isOOR, tetoRaiz, CAMPOS_TABELA } from '../../src/senna90/classificacoes/isOOR.ts';

// Fonte única runtime (achado I da revisão F2-T2): campo novo na união entra
// aqui automaticamente — a coerência nunca deixa de cobri-lo em silêncio.
const CAMPOS = CAMPOS_TABELA;

/** ♂ e ♀ com idade 50 (faixa média WASE) — string exata de cada linha. */
const PINS = {
  b7:   ['≤ 40 mm', '≤ 36 mm'],
  b8:   ['30–40 mm', '27–38 mm'],
  b9:   ['42–58 mm', '38–52 mm'],
  b10:  ['6–10 mm', '6–9 mm'],
  b11:  ['6–10 mm', '6–9 mm'],
  b12:  ['25–40 mm', '21–35 mm'],
  b13:  ['21–35 mm', '21–35 mm'],
  b28:  ['≤ 38 mm', '≤ 35 mm'],
  b29:  ['≤ 40 mm', '≤ 40 mm'],
  imc:  ['<25 kg/m²', '<25 kg/m²'],
  aoae: ['', ''],
  asc:  ['', ''],
  vdf:  ['62–150 ml', '46–106 ml'],
  vsf:  ['21–61 ml', '14–42 ml'],
  feT:  ['≥ 52%', '≥ 54%'],
  fs:   ['30–40%', '30–40%'],
  // V13 (achado M da revisão F2-T2): '≤ 200 g' fecha o gap 200,1-200,9 em que
  // a VR '<201' dizia normal enquanto frase (j9 >200) e realce acendiam.
  massa: ['≤ 200 g', '≤ 150 g'],
  imVE: ['≤ 115 g/m²', '≤ 95 g/m²'],
  er:   ['<0,43', '<0,43'],
};

describe('Senna93 refVal — string exata das 19 linhas', () => {
  for (const campo of CAMPOS) {
    test(`${campo}: ♂ "${PINS[campo][0]}" · ♀ "${PINS[campo][1]}"`, () => {
      assert.equal(refVal(campo, 'M', 50), PINS[campo][0]);
      assert.equal(refVal(campo, 'F', 50), PINS[campo][1]);
    });
  }
});

describe('Senna93 refVal — b7 é WASE dinâmico (sexo + idade)', () => {
  test('♂ por faixa: ≤40a "≤ 38 mm" · 41-65 "≤ 40 mm" · ≥66 "≤ 41 mm"', () => {
    assert.equal(refVal('b7', 'M', 30), '≤ 38 mm');
    assert.equal(refVal('b7', 'M', 40), '≤ 38 mm');   // borda inferior
    assert.equal(refVal('b7', 'M', 41), '≤ 40 mm');
    assert.equal(refVal('b7', 'M', 65), '≤ 40 mm');
    assert.equal(refVal('b7', 'M', 66), '≤ 41 mm');
    assert.equal(refVal('b7', 'M', 70), '≤ 41 mm');
  });
  test('♀ por faixa: ≤40a "≤ 35 mm" · 41-65 "≤ 36 mm" · ≥66 "≤ 38 mm"', () => {
    assert.equal(refVal('b7', 'F', 30), '≤ 35 mm');
    assert.equal(refVal('b7', 'F', 40), '≤ 35 mm');
    assert.equal(refVal('b7', 'F', 41), '≤ 36 mm');
    assert.equal(refVal('b7', 'F', 65), '≤ 36 mm');
    assert.equal(refVal('b7', 'F', 66), '≤ 38 mm');
  });
  test('sem idade cai na faixa média (paridade legado): ♂ 40 · ♀ 36', () => {
    assert.equal(refVal('b7', 'M', null), '≤ 40 mm');
    assert.equal(refVal('b7', 'F', null), '≤ 36 mm');
  });
});

describe("Senna93 refVal — C8: sexo '' apaga a coluna inteira", () => {
  test("sexo '' → '' nas 19 linhas (com e sem idade)", () => {
    for (const campo of CAMPOS) {
      assert.equal(refVal(campo, '', 50), '', `${campo} imprimiu VR sem sexo`);
      assert.equal(refVal(campo, '', null), '', `${campo} imprimiu VR sem sexo/idade`);
    }
  });
});

// ── Step 3: coerência refVal ↔ isOOR ──────────────────────────────
// Sondas nos dois extremos: qualquer linha com referência impressa
// tem que acender em pelo menos uma delas.
const SONDAS = [0, 1e6];
const acendeEmAlgumaSonda = (campo, sexo, idade) =>
  SONDAS.some((v) => isOOR(campo, v, sexo, idade));

describe('Senna93 coerência refVal ↔ isOOR', () => {
  test('VR impressa ⟺ existe fronteira que acende (19 linhas × 2 sexos)', () => {
    for (const campo of CAMPOS) {
      for (const sexo of ['M', 'F']) {
        const temVR = refVal(campo, sexo, 50) !== '';
        assert.equal(acendeEmAlgumaSonda(campo, sexo, 50), temVR,
          temVR
            ? `${campo} ${sexo}: imprime VR mas nunca acende`
            : `${campo} ${sexo}: acende sem VR que explique`);
      }
    }
  });
  test('aoae e asc: sem VR E sem realce, sempre', () => {
    for (const campo of ['aoae', 'asc']) {
      for (const sexo of ['M', 'F', '']) {
        assert.equal(refVal(campo, sexo, 50), '');
        for (const v of [0, 0.5, 99, 1e6]) {
          assert.equal(isOOR(campo, v, sexo, 50), false, `${campo} acendeu com ${v}`);
        }
      }
    }
  });
  test("sexo '': coluna vazia E nada aceso (C8 dos dois lados)", () => {
    for (const campo of CAMPOS) {
      assert.equal(refVal(campo, '', 50), '');
      assert.equal(acendeEmAlgumaSonda(campo, '', 50), false, `${campo} acendeu sem sexo`);
    }
  });
  test('linhas "≤ X": o X impresso é exatamente onde o isOOR vira', () => {
    for (const [campo, idade] of [['b7', 30], ['b7', 50], ['b7', 70], ['b28', 50], ['b29', 50]]) {
      for (const sexo of ['M', 'F']) {
        const teto = Number(refVal(campo, sexo, idade).match(/[\d.]+/)[0]);
        assert.equal(isOOR(campo, teto, sexo, idade), false, `${campo} ${sexo}: ${teto} devia ser normal`);
        assert.equal(isOOR(campo, teto + 0.1, sexo, idade), true, `${campo} ${sexo}: ${teto + 0.1} devia acender`);
      }
    }
    assert.equal(Number(refVal('b7', 'F', 70).match(/[\d.]+/)[0]), tetoRaiz('F', 70));
  });
});

// Fecho do achado M (revisão F2-T2): a zona 200,1-200,9 conta a MESMA história
// nas três pontas — VR '≤ 200 g' diz fora, realce acende, e a frase j9 (>200)
// chama de aumentada. O par (200 normal · 200.1 fora) pina a granularidade.
describe('F2-T2 fix — massa: VR, realce e frase contam a mesma história na fronteira', () => {
  test('massa ♂ 200 → VR dentro (não acende); 200.1 → fora (acende)', () => {
    assert.equal(isOOR('massa', 200, 'M', null), false);
    assert.equal(isOOR('massa', 200.1, 'M', null), true);
    assert.equal(refVal('massa', 'M', null), '≤ 200 g');
  });
  test('massa ♀ 150 → dentro; 150.1 → fora', () => {
    assert.equal(isOOR('massa', 150, 'F', null), false);
    assert.equal(isOOR('massa', 150.1, 'F', null), true);
    assert.equal(refVal('massa', 'F', null), '≤ 150 g');
  });
});
