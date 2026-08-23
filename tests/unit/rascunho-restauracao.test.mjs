// Restauração do laudo (S5-T1): rascunho local x exame do servidor.
// nº8: identificação é responsabilidade da tela, não desta função.
// nº9: recusar o rascunho local não o apaga — não há "remover" aqui.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { decidirFontePreenchimento } from '../../src/lib/rascunho-restauracao.ts';

describe('decidirFontePreenchimento', () => {
  test('sem rascunho local → usa medidas/laudoHtml do exame', () => {
    const r = decidirFontePreenchimento(null, false, { medidas: { nome: 'X' }, laudoHtml: '<p>oi</p>' });
    assert.deepEqual(r, { medidas: { nome: 'X' }, laudoHtml: '<p>oi</p>', origem: 'exame' });
  });

  test('rascunho local presente mas RECUSADO → usa exame (não apaga o local, só não usa)', () => {
    const r = decidirFontePreenchimento(
      { medidas: { nome: 'LOCAL' }, laudoHtml: '<p>local</p>', timestamp: 1 },
      false,
      { medidas: { nome: 'SERVIDOR' }, laudoHtml: '<p>servidor</p>' },
    );
    assert.deepEqual(r, { medidas: { nome: 'SERVIDOR' }, laudoHtml: '<p>servidor</p>', origem: 'exame' });
  });

  test('rascunho local presente e ACEITO → vence, mesmo com exame preenchido', () => {
    const r = decidirFontePreenchimento(
      { medidas: { nome: 'LOCAL' }, laudoHtml: '<p>local</p>', timestamp: 1 },
      true,
      { medidas: { nome: 'SERVIDOR' }, laudoHtml: '<p>servidor</p>' },
    );
    assert.deepEqual(r, { medidas: { nome: 'LOCAL' }, laudoHtml: '<p>local</p>', origem: 'rascunho-local' });
  });

  test('rascunho aceito sem laudoHtml (rascunho antigo) → laudoHtml undefined', () => {
    const r = decidirFontePreenchimento({ medidas: { nome: 'LOCAL' }, timestamp: 1 }, true, { laudoHtml: '<p>servidor</p>' });
    assert.equal(r.laudoHtml, undefined);
    assert.equal(r.origem, 'rascunho-local');
  });

  test('exame sem laudoHtml (nunca salvou rascunho no servidor) → undefined, não string vazia', () => {
    const r = decidirFontePreenchimento(null, false, { medidas: {} });
    assert.equal(r.laudoHtml, undefined);
  });

  test('exame null/undefined → medidas e laudoHtml undefined, sem lançar', () => {
    assert.deepEqual(decidirFontePreenchimento(null, false, null), { medidas: undefined, laudoHtml: undefined, origem: 'exame' });
    assert.deepEqual(decidirFontePreenchimento(null, false, undefined), { medidas: undefined, laudoHtml: undefined, origem: 'exame' });
  });

  test('rascunhoLocal presente mas aceitouRascunho não passado como true explícito → não vence', () => {
    assert.equal(
      decidirFontePreenchimento({ medidas: { a: '1' } }, undefined, { medidas: { b: '2' } }).origem,
      'exame',
    );
  });
});
