// Fonte unica de "hoje/agora" no fuso da clinica (Achado 12 da Secao 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataLocalBRT, agoraBelem } from '../../src/lib/utils.ts';

test('01h30 UTC ainda e o dia anterior em Belem', () => {
  assert.equal(dataLocalBRT(new Date('2026-08-13T01:30:00Z')), '2026-08-12');
});
test('12h UTC e o mesmo dia em Belem', () => {
  assert.equal(dataLocalBRT(new Date('2026-08-12T12:00:00Z')), '2026-08-12');
});
test('agoraBelem devolve Date cuja data local casa com dataLocalHoje', () => {
  const d = agoraBelem();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(ymd, dataLocalBRT(new Date()));
});
