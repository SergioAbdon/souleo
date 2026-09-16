import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_INTEGRACAO, rotuloEstado, tomEstado, SEM_SINAL_MS } from '../../src/lib/integracoes.ts';

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

test('tomEstado: status ok ou erro ou nem um nem outro', () => {
  assert.equal(tomEstado({ tipo: 'feegow', status: 'ok' }, AGORA), 'ok');
  assert.equal(tomEstado({ tipo: 'feegow', status: 'erro' }, AGORA), 'erro');
  assert.equal(tomEstado({ tipo: 'feegow' }, AGORA), 'neutro');
});

test('tomEstado e rotuloEstado nao podem divergir no wader (cor x texto)', () => {
  const casos = [
    { visto: AGORA - 60_000 },                 // no ar
    { visto: AGORA - SEM_SINAL_MS - 1 },        // sem sinal
    {},                                         // nunca apareceu
  ];
  for (const dados of casos) {
    const i = { tipo: 'wader', ...dados };
    const tom = tomEstado(i, AGORA);
    const texto = rotuloEstado(i, AGORA);
    if (tom === 'ok') assert.match(texto, /no ar/i);
    if (tom === 'erro') assert.match(texto, /sem sinal/i);
    if (tom === 'neutro') assert.match(texto, /nunca apareceu/i);
  }
});
