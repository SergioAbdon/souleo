// tests/unit/senna90-suite.test.mjs
// ══════════════════════════════════════════════════════════════════
// Senna93 F0-T1 (spec §3 C9): os 72 casos de src/senna90/tests/ na
// esteira automática. Antes desta task eles só rodavam por comando
// manual (`npx tsx src/senna90/tests/index.ts`) — qualquer regressão
// da unificação passava despercebida no commit.
// Cada caso vira um subtest nomeado; a falha imprime as `falhas` do
// runner (mesmo diagnóstico do relatório manual).
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rodarCaso } from '../../src/senna90/tests/runner.ts';
import { casosSaudaveis } from '../../src/senna90/tests/casos/01-saudaveis.ts';
import { casosCardiopatia } from '../../src/senna90/tests/casos/02-cardiopatia.ts';
import { casosValvopatias } from '../../src/senna90/tests/casos/03-valvopatias.ts';
import { casosDiastologia } from '../../src/senna90/tests/casos/04-diastologia.ts';
import { casosStrainHP } from '../../src/senna90/tests/casos/05-strain-hp.ts';
import { casosBordas } from '../../src/senna90/tests/casos/06-bordas.ts';
import { casosDiastologiaCompleta } from '../../src/senna90/tests/casos/07-diastologia-completa.ts';

const grupos = {
  '01-saudaveis': casosSaudaveis,
  '02-cardiopatia': casosCardiopatia,
  '03-valvopatias': casosValvopatias,
  '04-diastologia': casosDiastologia,
  '05-strain-hp': casosStrainHP,
  '06-bordas': casosBordas,
  '07-diastologia-completa': casosDiastologiaCompleta,
};

describe('Senna90 — suite completa na esteira (F0-T1)', () => {
  test('piso de contagem: a suite não pode encolher em silêncio', () => {
    const total = Object.values(grupos).flat().length;
    assert.ok(total >= 72, `suite encolheu: ${total} casos (piso 72)`);
  });
  for (const [grupo, casos] of Object.entries(grupos)) {
    describe(grupo, () => {
      for (const caso of casos) {
        test(`${caso.id} — ${caso.descricao}`, () => {
          const r = rodarCaso(caso);
          assert.ok(r.passou, `falhas do runner:\n  ${r.falhas.join('\n  ')}`);
        });
      }
    });
  }
});
