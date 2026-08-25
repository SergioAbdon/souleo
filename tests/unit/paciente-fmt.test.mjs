// Formatação de dados de paciente (Sub-plano 4, revisão final): mascara de
// CPF é lógica de privacidade, idade é lógica de data — nenhuma das duas
// tinha teste antes de virar lib compartilhada.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { maskCpf, formatCpf, fmtData, calcIdade, idadeLabel } from '../../src/lib/paciente-fmt.ts';

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

describe('formatCpf', () => {
  test('11 digitos -> 000.000.000-00', () => {
    assert.equal(formatCpf('12345678900'), '123.456.789-00');
  });
  test('CPF já formatado é idempotente', () => {
    assert.equal(formatCpf('123.456.789-00'), '123.456.789-00');
  });
  test('menos de 11 digitos ou malformado -> degrada p/ valor original trimado', () => {
    assert.equal(formatCpf('1234'), '1234');
    assert.equal(formatCpf('abc'), 'abc');
  });
  test('vazio ou undefined -> travessao', () => {
    assert.equal(formatCpf(''), '—');
    assert.equal(formatCpf(undefined), '—');
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
  test('data malformada (nao parseia) -> null', () => {
    assert.equal(calcIdade('nao-e-uma-data'), null);
  });
  test('data de nascimento no futuro -> null', () => {
    const dtnasc = dtnascAnosAtras(-1, 0);
    assert.equal(calcIdade(dtnasc), null);
  });

  // S5-T10 fix (I1): a idade do LAUDO é a da data do exame — reemitir anos
  // depois nao pode envelhecer o paciente no papel assinado.
  test('ateData: aniversario ja passou naquela data -> idade cheia', () => {
    assert.equal(calcIdade('1964-03-12', '2026-08-25'), 62);
  });
  test('ateData: aniversario ainda nao tinha chegado -> um a menos', () => {
    assert.equal(calcIdade('1964-03-12', '2026-01-10'), 61);
  });
  test('ateData no proprio aniversario -> idade cheia', () => {
    assert.equal(calcIdade('1964-03-12', '2026-03-12'), 62);
  });
  test('ateData invalida -> cai em hoje (nao quebra)', () => {
    assert.equal(calcIdade(dtnascAnosAtras(30, -1), 'nao-e-uma-data'), 30);
  });
  test('sem ateData -> hoje, como sempre foi (ficha do paciente intacta)', () => {
    assert.equal(calcIdade(dtnascAnosAtras(30, -1)), 30);
  });
});

describe('idadeLabel', () => {
  test('plural como o motor: >1 ano vira "anos"', () => {
    assert.equal(idadeLabel('1964-03-12', '2026-08-25'), '62 anos');
  });
  test('1 ano no singular (motorv8mp4: a > 1 ? anos : ano)', () => {
    assert.equal(idadeLabel('2025-03-12', '2026-08-25'), '1 ano');
  });
  test('lactente: 0 ano', () => {
    assert.equal(idadeLabel('2026-03-12', '2026-08-25'), '0 ano');
  });
  test('sem data de nascimento -> string vazia (quem decide o travessao e a tela)', () => {
    assert.equal(idadeLabel(undefined, '2026-08-25'), '');
  });
});
