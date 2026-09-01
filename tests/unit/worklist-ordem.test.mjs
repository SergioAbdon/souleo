// Ordem de chegada da worklist (item 2, 31/08/2026): `horarioChegada` de
// exame FEEGOW e o slot AGENDADO — a fila real e chegouEm (Feegow) ou
// criadoEm (manual). Testa a logica pura de worklist-ordem.ts.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ordenarPorChegada, millisChegada, horaChegadaExibicao } from '../../src/lib/worklist-ordem.ts';

const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) });

describe('ordenarPorChegada', () => {
  test('chegouEm manda: agendado 08:00 que chegou 10:30 fica DEPOIS do 09:00 que chegou 08:50', () => {
    const a = { id: 'a', horarioChegada: '08:00', chegouEm: ts(10_500) };
    const b = { id: 'b', horarioChegada: '09:00', chegouEm: ts(8_500) };
    assert.deepEqual(ordenarPorChegada([a, b]).map((x) => x.id), ['b', 'a']);
  });

  test('manual sem chegouEm usa criadoEm, intercalado com Feegow', () => {
    const feegow = { id: 'f', chegouEm: ts(2000) };
    const manual = { id: 'm', criadoEm: ts(1000) };
    assert.deepEqual(ordenarPorChegada([feegow, manual]).map((x) => x.id), ['m', 'f']);
  });

  test('legado sem timestamp nenhum vai pro fim, preservando a ordem que veio (sort estavel)', () => {
    const l1 = { id: 'l1', horarioChegada: '07:00' };
    const l2 = { id: 'l2', horarioChegada: '07:30' };
    const novo = { id: 'n', chegouEm: ts(5) };
    assert.deepEqual(ordenarPorChegada([l1, l2, novo]).map((x) => x.id), ['n', 'l1', 'l2']);
    assert.equal(millisChegada(l1), Number.MAX_SAFE_INTEGER);
  });

  test('serverTimestamp pendente (toMillis ausente/null) nao quebra e vai pro fim', () => {
    const pendente = { id: 'p', chegouEm: null, criadoEm: null };
    const ok = { id: 'ok', chegouEm: ts(1) };
    assert.deepEqual(ordenarPorChegada([pendente, ok]).map((x) => x.id), ['ok', 'p']);
  });

  test('nao muta o array original', () => {
    const arr = [{ id: 'x', chegouEm: ts(2) }, { id: 'y', chegouEm: ts(1) }];
    ordenarPorChegada(arr);
    assert.deepEqual(arr.map((x) => x.id), ['x', 'y']);
  });
});

describe('horaChegadaExibicao', () => {
  test('com chegouEm mostra HH:MM da chegada real (zero-padded)', () => {
    const d = new Date(2026, 7, 31, 8, 5); // 08:05 local
    assert.equal(horaChegadaExibicao({ chegouEm: { toDate: () => d } }), '08:05');
  });

  test('sem chegouEm cai no horarioChegada (manual/legado)', () => {
    assert.equal(horaChegadaExibicao({ horarioChegada: '10:30' }), '10:30');
    assert.equal(horaChegadaExibicao({}), '');
  });
});
