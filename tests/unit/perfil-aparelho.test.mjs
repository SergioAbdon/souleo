// Perfil do aparelho (S4-T13): fallback embutido + semantica de merge raso.
// So testa validarMapeamentos (pura) — carregarPerfilAparelho e I/O puro em
// cima dela (mesmo criterio do resto do lib: funcao com Firestore nao ganha
// teste unit, so a logica pura por baixo — ver resolverPapel/exame-admin.ts).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validarMapeamentos, SR_TO_MOTOR } from '../../src/lib/perfil-aparelho.ts';

const ENTRADA_OK = { campo: 'b7', nomePt: 'Raiz Aórtica', casas: 0, alvo: 'mm' };

describe('validarMapeamentos — fallback (doc ausente/vazio/malformado)', () => {
  test('undefined -> null (chamador cai no SR_TO_MOTOR)', () => {
    assert.equal(validarMapeamentos(undefined), null);
  });
  test('null -> null', () => {
    assert.equal(validarMapeamentos(null), null);
  });
  test('objeto vazio -> null', () => {
    assert.equal(validarMapeamentos({}), null);
  });
  test('array -> null (nao e o formato esperado)', () => {
    assert.equal(validarMapeamentos([ENTRADA_OK]), null);
  });
  test('string/numero -> null', () => {
    assert.equal(validarMapeamentos('lixo'), null);
    assert.equal(validarMapeamentos(42), null);
  });
  test('so entradas malformadas -> null (sem sobra valida)', () => {
    const out = validarMapeamentos({
      x: { campo: '', nomePt: 'Y', casas: 0, alvo: 'mm' }, // campo vazio
      y: { campo: 'b7', nomePt: 'Y', casas: 0, alvo: 'polegada' }, // alvo fora da whitelist
      z: { campo: 'b7', nomePt: 'Y' }, // sem casas/alvo
      w: 'string qualquer',
    });
    assert.equal(out, null);
  });
});

describe('validarMapeamentos — doc com entradas validas e a VERDADE INTEIRA', () => {
  test('doc com 1 entrada valida NAO herda o resto do SR_TO_MOTOR (sem merge com o default)', () => {
    const out = validarMapeamentos({ 'AO_18015-8': ENTRADA_OK });
    assert.deepEqual(out, { 'AO_18015-8': ENTRADA_OK });
    assert.equal(Object.keys(out).length, 1);
    assert.ok(Object.keys(SR_TO_MOTOR).length > 1, 'sanity: default tem mais de 1 entrada');
  });
  test('entrada malformada dentro de doc por outro lado valido e descartada, nao derruba as boas', () => {
    const out = validarMapeamentos({
      'AO_18015-8': ENTRADA_OK,
      lixo: { campo: '', nomePt: '', casas: 'x', alvo: 'kg' },
    });
    assert.deepEqual(out, { 'AO_18015-8': ENTRADA_OK });
  });
  test('casas 0 e um numero valido (nao confundir com falsy)', () => {
    const out = validarMapeamentos({ k: { campo: 'b7', nomePt: 'X', casas: 0, alvo: '' } });
    assert.deepEqual(out, { k: { campo: 'b7', nomePt: 'X', casas: 0, alvo: '' } });
  });
  test('alvo vazio ("") e valido (razao/indice adimensional)', () => {
    const out = validarMapeamentos({ k: { campo: 'b20', nomePt: 'E/A', casas: 1, alvo: '' } });
    assert.ok(out && 'k' in out);
  });
});
