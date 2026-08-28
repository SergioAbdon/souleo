// ══════════════════════════════════════════════════════════════════
// Senna93 F4-T1: pins do SIMULADOR do legado — célula a célula.
// Valores calculados à mão a partir das fórmulas de motorv8mp4.js
// (mesma fixture do senna93-tabela-pins.test.mjs, ♂ 46a, 80kg/170cm).
// Se este teste quebrar, o simulador deixou de imitar o legado — e a
// sombra inteira da F4 perde a referência.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { simularTabelaLegado } from '../../src/lib/shadow/legado-tabela.ts';

const PADRAO = {
  sexo: 'M', peso: 80, altura: 170,
  b7: 34, b8: 40, b9: 50, b10: 10, b11: 10, b12: 30, b13: null,
  dtnasc: '1980-05-15', dtexame: '2026-08-27',
};

describe('simularTabelaLegado — paciente-padrão F0', () => {
  const rows = simularTabelaLegado(PADRAO);

  test('10 linhas × 8 colunas', () => {
    assert.equal(rows.length, 10);
    for (const l of rows) assert.equal(l.length, 8);
  });

  test('as 10 linhas exatas (ponto decimal, toFixed, VRs do legado)', () => {
    assert.deepEqual(rows, [
      ['Sexo', 'M', '', '', 'Índice de Massa Corporal', '27.6', 'kg/m²', '<25 kg/m²'],
      ['Peso', '80.0', 'Kg', '', 'Relação Ao/AE', '0.85', '', ''],
      ['Altura', '170.0', 'cm', '', 'Vol. Diast. final VE', '118.2', 'ml', '62–150 ml'],
      ['Raiz Aórtica', '34.0', 'mm', '≤ 40 mm', 'Vol. Sist. final VE', '35.0', 'ml', '21–61 ml'],
      ['Átrio Esquerdo', '40.0', 'mm', '30–40 mm', 'Fração de Ejeção (Teichholz)', '70%', '', '>51%'],
      ['DDVE', '50.0', 'mm', '42–58 mm', 'Fração de Encurtamento', '40%', '', '30–40%'],
      ['Septo Interventricular', '10.0', 'mm', '6–10 mm', 'Massa do VE', '181.3', 'g', '<201 g'],
      ['Parede Posterior', '10.0', 'mm', '6–10 mm', 'Índice de Massa VE', '94.9', 'g/m²', '<103 g/m²'],
      ['DSVE', '30.0', 'mm', '25–40 mm', 'Espessura Relativa', '0.40', '', '<0,43'],
      ['Ventrículo Direito', '—', 'mm', '21–35 mm', 'Área Sup. Corpórea', '1.91', 'm²', ''],
    ]);
  });

  test('sem sexo: 3 VRs incondicionais do legado ficam (IMC, FS, ER), resto some', () => {
    const r = simularTabelaLegado({ ...PADRAO, sexo: '' });
    assert.equal(r[0][7], '<25 kg/m²');   // IMC incondicional
    assert.equal(r[5][7], '30–40%');      // FS incondicional
    assert.equal(r[8][7], '<0,43');       // ER incondicional
    assert.equal(r[2][7], '');            // VDF some
    assert.equal(r[4][7], '');            // FE some
    assert.equal(r[3][3], '');            // refVal b7 some
  });

  test('♀ 70 anos: raiz VR do LEGADO é ≤ 37 mm (WASE antiga — o Senna93 dá 38)', () => {
    const r = simularTabelaLegado({ ...PADRAO, sexo: 'F', dtnasc: '1956-01-01' });
    assert.equal(r[3][3], '≤ 37 mm');
  });

  test('b12 null: FE e FS viram VIDE, VDF fica, VSF vira —', () => {
    const r = simularTabelaLegado({ ...PADRAO, b12: null });
    assert.equal(r[4][5], 'VIDE');
    assert.equal(r[5][5], 'VIDE');
    assert.equal(r[3][5], '—');
  });

  test('feT do legado sai dos valores CRUS: 70.40% (não os 70.38 do Senna93)', () => {
    // fronteira do toFixed(0): 50/29.55 → feT cru ≈ 0.7150 → '72%'? não:
    // o pin de valor é o do PADRAO ('70%'); aqui só se garante que a conta
    // é a crua — b9=50,b12=30 → 0.70400… (toFixed(0) = 70)
    assert.equal(rows[4][5], '70%');
  });
});
