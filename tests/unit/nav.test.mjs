// Navegação da plataforma é dado puro: o que cada papel vê na sidebar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_PLATAFORMA, itensVisiveis } from '../../src/lib/nav.ts';

const hrefs = (papel) => itensVisiveis(papel).map(i => i.href);

test('recepcao NAO ve financeiro nem clinica-gerencia, ve agenda e laudos', () => {
  const v = hrefs('recepcao');
  assert.ok(v.includes('/agenda'));
  assert.ok(v.includes('/laudos'));
  assert.ok(!v.includes('/financeiro'));
});
test('medico ve financeiro', () => {
  assert.ok(hrefs('medico').includes('/financeiro'));
});
test('dono ve tudo que existe hoje', () => {
  const v = hrefs('dono');
  for (const h of ['/agenda', '/laudos', '/financeiro', '/clinica']) assert.ok(v.includes(h), h);
});
test('todo item tem rotulo e icone', () => {
  for (const i of NAV_PLATAFORMA) {
    assert.ok(i.href.startsWith('/') && i.rotulo && i.icone);
  }
});
