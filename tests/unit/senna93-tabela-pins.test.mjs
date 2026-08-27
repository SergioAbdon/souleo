// ══════════════════════════════════════════════════════════════════
// Senna93 F3-T4 (plano §Task 4): pins do builder da tabela de parâmetros.
// A tabela é o corpo do laudo assinado — aqui grava-se CÉLULA A CÉLULA
// o que sai para o paciente-padrão da F0 (♂ 46a, 80kg/170cm).
// Cobre B13 (a metade direita passa a acender), B14 (linhas 11-12 da
// aorta), a regra VIDE (C4/V10) e C8 (sexo vazio → sem VR, sem realce).
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { montarRowsTabela } from '../../src/senna90/classificacoes/tabela.ts';
import { calcularDerivados } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

/** Mesma fixture de tests/unit/senna90-derivados-pins.test.mjs (F0-T4). */
function pacientePadrao() {
  const m = medidasVazias();
  m.identificacao.pacienteDtnasc = '1980-05-15';
  m.identificacao.dataExame = '2026-08-27'; // → 46 anos
  m.gerais.sexo = 'M';
  m.gerais.peso = 80;
  m.gerais.altura = 170;
  m.camaras.raizAo = 34;            // b7
  m.camaras.ae = 40;                // b8
  m.camaras.ddve = 50;              // b9
  m.camaras.septoIV = 10;           // b10
  m.camaras.paredePosterior = 10;   // b11
  m.camaras.dsve = 30;              // b12
  m.estenoses.areaAo = 3.0;
  return m;
}

const IDENT = { sexo: 'M', peso: 80, altura: 170 };
const MEDIDAS = { b7: 34, b8: 40, b9: 50, b10: 10, b11: 10, b12: 30, b13: null, b28: null, b29: null };

/** Monta a tabela a partir da fixture, com overrides opcionais. */
function montar({ medidas = {}, ident = {}, mutar = () => {} } = {}) {
  const m = pacientePadrao();
  mutar(m);
  const d = calcularDerivados(m);
  return montarRowsTabela(
    { ...IDENT, ...ident },
    { ...MEDIDAS, ...medidas },
    d,
    d.idade
  );
}

/** Coordenadas [linha, coluna] de todas as células acesas. */
const acesas = (oor) => oor.flatMap((l, i) => l.map((x, j) => (x ? `${i},${j}` : null))).filter(Boolean);

describe('Senna93 montarRowsTabela — paciente-padrão F0, célula a célula', () => {
  const { rows, oor } = montar();

  test('12 linhas × 8 colunas (10 do legado + Ao asc + Arco — B14)', () => {
    assert.equal(rows.length, 12);
    assert.equal(oor.length, 12);
    for (const l of rows) assert.equal(l.length, 8);
    for (const l of oor) assert.equal(l.length, 8);
  });

  test('as 12 linhas exatas', () => {
    assert.deepEqual(rows, [
      ['Sexo', 'M', '', '', 'Índice de Massa Corporal', '27,6', 'kg/m²', '<25 kg/m²'],
      ['Peso', '80,0', 'Kg', '', 'Relação Ao/AE', '0,85', '', ''],
      ['Altura', '170,0', 'cm', '', 'Vol. Diast. final VE', '118,2', 'ml', '62–150 ml'],
      ['Raiz Aórtica', '34', 'mm', '≤ 40 mm', 'Vol. Sist. final VE', '35,0', 'ml', '21–61 ml'],
      ['Átrio Esquerdo', '40', 'mm', '30–40 mm', 'Fração de Ejeção (Teichholz)', '70%', '', '≥ 52%'],
      ['DDVE', '50', 'mm', '42–58 mm', 'Fração de Encurtamento', '40%', '', '30–40%'],
      ['Septo Interventricular', '10', 'mm', '6–10 mm', 'Massa do VE', '181,9', 'g', '≤ 200 g'],
      ['Parede Posterior', '10', 'mm', '6–10 mm', 'Índice de Massa VE', '95,2', 'g/m²', '≤ 115 g/m²'],
      ['DSVE', '30', 'mm', '25–40 mm', 'Espessura Relativa', '0,40', '', '<0,43'],
      ['Ventrículo Direito', '—', 'mm', '21–35 mm', 'Área Sup. Corpórea', '1,91', 'm²', ''],
      ['Ao Ascendente', '—', 'mm', '≤ 38 mm', '', '', '', ''],
      ['Arco Aórtico', '—', 'mm', '≤ 40 mm', '', '', '', ''],
    ]);
  });

  test('realce: só o IMC 27,6 (≥25) acende — e ele é da DIREITA (B13)', () => {
    assert.deepEqual(acesas(oor), ['0,5']);
  });
});

describe('Senna93 montarRowsTabela — realce nas DUAS colunas (B13)', () => {
  test('esquerda: raiz 39 mm em ♂ 30a (teto WASE 38) acende a col. 1', () => {
    const { rows, oor } = montar({
      medidas: { b7: 39 },
      mutar: (m) => { m.identificacao.pacienteDtnasc = '1996-05-15'; m.camaras.raizAo = 39; },
    });
    assert.equal(rows[3][1], '39');
    assert.equal(rows[3][3], '≤ 38 mm');   // VR segue a idade
    assert.equal(oor[3][1], true);
  });

  test('direita: FE/FS baixas (DDVE 50 / DSVE 45) acendem a col. 5', () => {
    const { rows, oor } = montar({
      medidas: { b12: 45 },
      mutar: (m) => { m.camaras.dsve = 45; },
    });
    assert.equal(rows[4][5], '21%');       // feT 0,2182
    assert.equal(rows[5][5], '10%');       // fs 0,10
    assert.equal(oor[4][5], true);
    assert.equal(oor[5][5], true);
  });

  test('realce NUNCA sai das colunas 1 e 5', () => {
    const { oor } = montar({
      medidas: { b7: 60, b8: 60, b9: 90, b10: 20, b11: 20, b12: 60, b13: 60, b28: 60, b29: 60 },
      mutar: (m) => { m.camaras.raizAo = 60; m.camaras.ddve = 90; m.camaras.dsve = 60; },
    });
    for (const linha of oor) {
      for (let j = 0; j < 8; j++) {
        if (j !== 1 && j !== 5) assert.equal(linha[j], false, `coluna ${j} não pode acender`);
      }
    }
  });
});

describe('Senna93 montarRowsTabela — VIDE, sexo ausente e aorta (B14)', () => {
  test('DSVE null → FE e FS imprimem VIDE (sem "%")', () => {
    const { rows } = montar({
      medidas: { b12: null },
      mutar: (m) => { m.camaras.dsve = null; },
    });
    assert.equal(rows[8][1], '—');         // a própria linha DSVE
    assert.equal(rows[4][5], 'VIDE');
    assert.equal(rows[5][5], 'VIDE');
  });

  test("sexo '' → todas as VR vazias, zero realce, célula Sexo = '—' (C8)", () => {
    const { rows, oor } = montar({
      ident: { sexo: '' },
      medidas: { b28: 60, b29: 60 },
      mutar: (m) => { m.gerais.sexo = ''; },
    });
    assert.equal(rows[0][1], '—');
    for (const l of rows) {
      assert.equal(l[3], '', `VR esquerda de "${l[0]}" devia estar vazia`);
      assert.equal(l[7], '', `VR direita de "${l[4]}" devia estar vazia`);
    }
    assert.deepEqual(acesas(oor), []);
  });

  test('b28/b29 null → linhas 11-12 com "—" mas VR presente', () => {
    const { rows, oor } = montar();
    assert.deepEqual(rows[10], ['Ao Ascendente', '—', 'mm', '≤ 38 mm', '', '', '', '']);
    assert.deepEqual(rows[11], ['Arco Aórtico', '—', 'mm', '≤ 40 mm', '', '', '', '']);
    assert.equal(oor[10][1], false);
    assert.equal(oor[11][1], false);
  });

  test('b28 39 ♂ (>38) e b29 41 (>40) acendem', () => {
    const { rows, oor } = montar({ medidas: { b28: 39, b29: 41 } });
    assert.equal(rows[10][1], '39');
    assert.equal(rows[11][1], '41');
    assert.equal(oor[10][1], true);
    assert.equal(oor[11][1], true);
  });
});
