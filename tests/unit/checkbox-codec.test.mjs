// Codec do checkbox único da tela de laudo (Wilkins) — invariante que liga
// coletarMedidas ↔ setVal (page.tsx). Achado M4, revisão S5-T4: se um lado
// derivar do outro, o escore salvo volta desmarcado sem erro nenhum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkboxParaMedida, medidaParaChecked } from '../../src/lib/checkbox-codec.ts';

test('round-trip: checked -> medida -> checked', () => {
  assert.equal(medidaParaChecked(checkboxParaMedida(true)), true);
  assert.equal(medidaParaChecked(checkboxParaMedida(false)), false);
});

test('valor canonico salvo e string "1"/"0", nao boolean/number', () => {
  assert.equal(checkboxParaMedida(true), '1');
  assert.equal(checkboxParaMedida(false), '0');
});

test('exame antigo sem a chave, ou qualquer outro valor, volta desmarcado', () => {
  assert.equal(medidaParaChecked(''), false);
  assert.equal(medidaParaChecked('true'), false);
  assert.equal(medidaParaChecked('on'), false);
});
