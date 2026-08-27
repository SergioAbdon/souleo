// ══════════════════════════════════════════════════════════════════
// Senna93 F2-T3 (spec §2.7): pins de valorTabela (VIDE/B25) e rodapeFontes (B20).
// B25: NUNCA re-arredonda — truncarExibicao usa Math.trunc (er 0,429 → '0,42',
// não '0,43', que é o que toFixed daria).
// VIDE (C4/V10): só feT/fs com dsveAusente; null sem flag → '—'.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { valorTabela } from '../../src/senna90/classificacoes/formatar.ts';
import { rodapeFontes, FONTES_POR_DOMINIO } from '../../src/senna90/classificacoes/fontes.ts';

describe('Senna93 valorTabela — feT/fs em % (paridade legado + caixa calc-fe)', () => {
  test('feT 0,7038 → "70" (0 casas, tabela)', () => {
    assert.equal(valorTabela('feT', 0.7038, {}), '70');
  });
  test('feT 0,7038 com casas:1 → "70,3" (caixa calc-fe)', () => {
    assert.equal(valorTabela('feT', 0.7038, { casas: 1 }), '70,3');
  });
});

describe('Senna93 valorTabela — regra VIDE (C4/V10)', () => {
  test('null + dsveAusente → "VIDE" (feT e fs)', () => {
    assert.equal(valorTabela('feT', null, { dsveAusente: true }), 'VIDE');
    assert.equal(valorTabela('fs', null, { dsveAusente: true }), 'VIDE');
  });
  test('null sem flag → "—"', () => {
    assert.equal(valorTabela('feT', null, {}), '—');
    assert.equal(valorTabela('fs', null, {}), '—');
    assert.equal(valorTabela('b7', null, {}), '—');
  });
});

describe('Senna93 valorTabela — casas fixas, vírgula decimal', () => {
  test('massa 181,9 → "181,9"', () => {
    assert.equal(valorTabela('massa', 181.9, {}), '181,9');
  });
  test('er 0,42 → "0,42"', () => {
    assert.equal(valorTabela('er', 0.42, {}), '0,42');
  });
  test('asc 1,91 → "1,91"', () => {
    assert.equal(valorTabela('asc', 1.91, {}), '1,91');
  });
  test('imc 27,6 → "27,6"', () => {
    assert.equal(valorTabela('imc', 27.6, {}), '27,6');
  });
});

describe('Senna93 valorTabela — B25: NUNCA arredonda', () => {
  test('er 0,429 (se viesse cru) → "0,42", não "0,43"', () => {
    assert.equal(valorTabela('er', 0.429, {}), '0,42');
  });
});

describe('Senna93 rodapeFontes — B20 (rodapé por domínio)', () => {
  test('string exata pinada', () => {
    assert.equal(rodapeFontes(),
      'Valores de referência: Lang 2015 (ASE/EACVI); Goldstein 2015 (ASE); ' +
      'ACC/AHA 2022; WASE 2022; ASE 2025 (coração direito); ASE/EACVI 2025 (strain).');
  });
  test('as 4 chaves de FONTES_POR_DOMINIO', () => {
    assert.equal(FONTES_POR_DOMINIO.camaras, 'Lang 2015 (ASE/EACVI)');
    assert.equal(FONTES_POR_DOMINIO.aorta, 'Goldstein 2015 (ASE); ACC/AHA 2022; WASE 2022');
    assert.equal(FONTES_POR_DOMINIO.coracaoDireito, 'ASE 2025 (coração direito)');
    assert.equal(FONTES_POR_DOMINIO.strain, 'ASE/EACVI 2025 (strain)');
  });
});
