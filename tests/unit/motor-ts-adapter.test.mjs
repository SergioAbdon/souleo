// Modo manual da diastólica chega no adapter (S5-T3, decisão D3).
//
// `lerMedidasDoDOM()` lê o DOM real do navegador; aqui simulamos com um
// stub mínimo de `document.getElementById` (sem jsdom — só o que a função
// usa: `.value`/`.checked`). Antes desta task o adapter sempre devolvia
// `modoManual: 'auto', selecaoManual: -1` fixos (comentário "será
// controlado via API do motor TS" — nunca foi).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lerMedidasDoDOM } from '../../src/lib/motor-ts-adapter.ts';

/** Troca `globalThis.document` por um stub só com os campos passados. */
function stubDocumento(valores) {
  globalThis.document = {
    getElementById(id) {
      if (!(id in valores)) return null;
      const v = valores[id];
      return typeof v === 'boolean' ? { checked: v } : { value: v };
    },
  };
}

describe('lerMedidasDoDOM — #diast-manual-sel (S5-T3)', () => {
  test('select em "-1" (— Selecione —, estado zerado) => modoManual auto', () => {
    stubDocumento({ 'diast-manual-sel': '-1' });
    const m = lerMedidasDoDOM();
    assert.equal(m.diastolica.modoManual, 'auto');
    assert.equal(m.diastolica.selecaoManual, -1);
  });

  test('select em "0" (Índices preservados) => já é seleção manual, não auto', () => {
    stubDocumento({ 'diast-manual-sel': '0' });
    const m = lerMedidasDoDOM();
    assert.equal(m.diastolica.modoManual, 'manual');
    assert.equal(m.diastolica.selecaoManual, 0);
  });

  test('select em "2" (grau II) => modoManual manual, selecaoManual 2', () => {
    stubDocumento({ 'diast-manual-sel': '2' });
    const m = lerMedidasDoDOM();
    assert.equal(m.diastolica.modoManual, 'manual');
    assert.equal(m.diastolica.selecaoManual, 2);
  });

  test('select ausente do DOM (tela antiga / erro) => cai pra auto, não quebra', () => {
    stubDocumento({});
    const m = lerMedidasDoDOM();
    assert.equal(m.diastolica.modoManual, 'auto');
    assert.equal(m.diastolica.selecaoManual, -1);
  });
});
