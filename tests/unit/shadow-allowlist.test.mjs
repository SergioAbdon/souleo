// ══════════════════════════════════════════════════════════════════
// Senna93 F4-T2 · TRIPWIRE de cobertura da allowlist
// ══════════════════════════════════════════════════════════════════
// O markdown docs/planos/2026-08-27-senna93-divergencias-esperadas.md
// é A FONTE. Linha nova no md sem matcher (ou matcher citando linha
// que não existe) QUEBRA este teste. O assert de lista vazia NÃO pode
// ser afrouxado — é ele que impede a allowlist de apodrecer.
// ══════════════════════════════════════════════════════════════════
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FRASES_ESPERADAS,
  PARES_VR,
  TOL_CELULA,
  LINHAS_MD_NAO_COMPARAVEIS,
} from '../../src/lib/shadow/allowlist.ts';

const md = readFileSync('docs/planos/2026-08-27-senna93-divergencias-esperadas.md', 'utf8');
// refs do md: linhas de tabela "| F… | Domínio | …" das DUAS tabelas
const refsMd = [...md.matchAll(/^\| (F[0-9]-\w+|F3-fix|F3-T\d+\w*) \| ([^|]+?) \|/gm)]
  .map(m => `${m[1]} ${m[2].trim()}`);

/** Refs cobertas por regra estrutural/tolerância do compararTabelas. */
const POR_ESTRUTURA = [
  'F3-T5 Tabela · separador', 'F3-T5 Tabela · casas', 'F3-T5 Tabela · FE/FS',
  'F3-T5 Tabela · valores', 'F3-T5 Tabela · linhas',
  'F3-T5 Tabela · sexo vazio',
];

test('o markdown parseia (sanidade do regex de extração)', () => {
  assert.equal(refsMd.length, 38, 'linhas de tabela do md');
  assert.equal(refsMd.length, (md.match(/^\| F/gm) || []).length, 'linha do md com ref fora do formato extraível');
  assert.equal(new Set(refsMd).size, 33, 'refs distintas');
  assert.ok(refsMd.includes('F1-T1 Aorta'));
  assert.ok(refsMd.includes('F3-T5 Tabela · sexo vazio'));
  assert.ok(refsMd.includes('F3-T3fix Rodapé'));
});

test('toda linha do markdown tem cobertura (matcher, par de VR, tolerância ou não-comparável)', () => {
  const cobertas = new Set([
    ...FRASES_ESPERADAS.map(f => f.ref),
    ...PARES_VR.map(p => p.ref),
    ...LINHAS_MD_NAO_COMPARAVEIS,
    ...POR_ESTRUTURA,
  ]);
  const descobertas = refsMd.filter(r => !cobertas.has(r));
  assert.deepEqual(descobertas, [], `linhas do md sem cobertura: ${descobertas.join(' · ')}`);
});

test('todo matcher cita uma linha que EXISTE no markdown', () => {
  const setMd = new Set(refsMd);
  for (const f of [...FRASES_ESPERADAS, ...PARES_VR]) {
    assert.ok(setMd.has(f.ref), `ref fantasma: ${f.ref}`);
  }
  for (const r of LINHAS_MD_NAO_COMPARAVEIS) {
    assert.ok(setMd.has(r), `não-comparável fantasma: ${r}`);
  }
});

test('TOL_CELULA cobre as duas colunas de valor da zona comum', () => {
  // col 1: linhas 1..9 (a 0 é o Sexo, texto). col 5: linhas 0..9.
  for (let l = 1; l <= 9; l++) assert.ok(TOL_CELULA[`${l},1`] > 0, `falta tol ${l},1`);
  for (let l = 0; l <= 9; l++) assert.ok(TOL_CELULA[`${l},5`] > 0, `falta tol ${l},5`);
  assert.equal(TOL_CELULA['0,1'], undefined, 'linha do Sexo não tem tolerância numérica');
});

test('matcher e não-comparável não se sobrepõem', () => {
  const refsMatcher = new Set(FRASES_ESPERADAS.map(f => f.ref));
  for (const r of LINHAS_MD_NAO_COMPARAVEIS) {
    assert.ok(!refsMatcher.has(r), `${r} está nos dois lados`);
  }
});
