// Formatação de dados de paciente (Sub-plano 4, revisão final): mascara de
// CPF é lógica de privacidade, idade é lógica de data — nenhuma das duas
// tinha teste antes de virar lib compartilhada.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { maskCpf, fmtData, calcIdade } from '../../src/lib/paciente-fmt.ts';

describe('maskCpf', () => {
  test('mostra so os 2 ultimos digitos', () => {
    assert.equal(maskCpf('12345678900'), '***.***.***-00');
  });
  test('aceita CPF formatado (pontos/traco) — so os digitos importam', () => {
    assert.equal(maskCpf('123.456.789-11'), '***.***.***-11');
  });
  test('entrada malformada (letras misturadas) degrada extraindo so os digitos', () => {
    assert.equal(maskCpf('cpf:12345-x'), '***.***.***-45');
  });
  test('vazio ou undefined -> travessao', () => {
    assert.equal(maskCpf(''), '—');
    assert.equal(maskCpf(undefined), '—');
  });
  test('menos de 2 digitos -> travessao', () => {
    assert.equal(maskCpf('1'), '—');
  });
});

describe('fmtData', () => {
  test('yyyy-mm-dd -> dd/mm/aaaa', () => {
    assert.equal(fmtData('2026-08-15'), '15/08/2026');
  });
  test('sem data -> travessao', () => {
    assert.equal(fmtData(undefined), '—');
    assert.equal(fmtData(''), '—');
  });
  test('formato sem 3 partes -> devolve o valor bruto (nao inventa data)', () => {
    assert.equal(fmtData('15/08/2026'), '15/08/2026');
  });
});

describe('calcIdade', () => {
  // Constroi yyyy-mm-dd em hora LOCAL (evitar toISOString, que converte pra
  // UTC e pode empurrar o dia — mesmo cuidado do tests/unit/data-brt.test.mjs).
  function isoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function dtnascAnosAtras(anos, deltaDias) {
    const d = new Date();
    d.setDate(d.getDate() + deltaDias);
    d.setFullYear(d.getFullYear() - anos);
    return isoLocal(d);
  }

  test('aniversario deste ano JA passou (foi ontem) -> idade cheia', () => {
    const dtnasc = dtnascAnosAtras(30, -1);
    assert.equal(calcIdade(dtnasc), 30);
  });
  test('aniversario deste ano AINDA NAO chegou (e amanha) -> um a menos', () => {
    const dtnasc = dtnascAnosAtras(30, 1);
    assert.equal(calcIdade(dtnasc), 29);
  });
  test('sem data -> null', () => {
    assert.equal(calcIdade(undefined), null);
  });
});
