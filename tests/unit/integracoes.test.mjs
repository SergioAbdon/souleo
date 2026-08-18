import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_INTEGRACAO, rotuloEstado, SEM_SINAL_MS } from '../../src/lib/integracoes.ts';

const AGORA = new Date('2026-08-16T12:00:00-03:00').getTime();

test('os tres tipos, com rotulo e icone', () => {
  assert.equal(TIPOS_INTEGRACAO.length, 3);
  for (const t of TIPOS_INTEGRACAO) assert.ok(t.id && t.rotulo && t.icone);
});
test('sem teste nenhum e "nunca testado", nao "ok"', () => {
  assert.match(rotuloEstado({ tipo: 'feegow', status: 'nunca_testado' }, AGORA), /nunca testad/i);
});
test('status ausente tambem cai em nunca testado', () => {
  assert.match(rotuloEstado({ tipo: 'feegow' }, AGORA), /nunca testad/i);
});
test('erro mostra erro', () => {
  assert.match(rotuloEstado({ tipo: 'orthanc', status: 'erro', ultimoErro: 'timeout' }, AGORA), /erro|timeout/i);
});
test('wader visto agora esta no ar', () => {
  assert.match(rotuloEstado({ tipo: 'wader', visto: AGORA - 60_000 }, AGORA), /no ar/i);
});
test('wader visto ha muito tempo esta sem sinal', () => {
  assert.match(rotuloEstado({ tipo: 'wader', visto: AGORA - SEM_SINAL_MS - 1 }, AGORA), /sem sinal/i);
});
test('wader que nunca apareceu nao mente que esta no ar', () => {
  assert.doesNotMatch(rotuloEstado({ tipo: 'wader' }, AGORA), /no ar/i);
});
