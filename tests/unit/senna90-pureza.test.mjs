// tests/unit/senna90-pureza.test.mjs
// ══════════════════════════════════════════════════════════════════
// Senna93 F0-T7 (spec §8): o motor ser TS puro (sem imports node-only,
// sem framework) hoje é acidente de convenção. Este teste vira
// contrato: qualquer import de runtime específico dentro do grafo de
// produção do motor quebra o build de teste na hora.
// Fora do escopo (não são o motor de produção): tests/, smoke-test.ts,
// teste-prod-aorta.ts, valida-exames-reais.ts (scripts manuais).
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = join(process.cwd(), 'src', 'senna90');
const FORA = [/[\\/]tests[\\/]/, /smoke-test\.ts$/, /teste-prod-aorta\.ts$/, /valida-exames-reais\.ts$/];
// Import proibido no motor de produção: builtins do Node, firebase, next, react.
const PROIBIDO = /from\s+['"](node:[^'"]*|fs|path|os|crypto|http|https|child_process|firebase[^'"]*|next[^'"]*|react[^'"]*)['"]/g;

function arquivosTs(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...arquivosTs(p));
    else if (nome.endsWith('.ts')) saida.push(p);
  }
  return saida;
}

describe('Senna90/93 — pureza do motor (F0-T7)', () => {
  const alvos = arquivosTs(RAIZ).filter((p) => !FORA.some((rx) => rx.test(p)));

  test('piso de sanidade: a varredura enxerga o motor (≥ 15 arquivos)', () => {
    assert.ok(alvos.length >= 15, `só ${alvos.length} arquivos — o filtro esvaziou?`);
  });

  test('nenhum arquivo do motor importa runtime específico (node/firebase/next/react)', () => {
    const violacoes = [];
    for (const p of alvos) {
      const fonte = readFileSync(p, 'utf8');
      for (const m of fonte.matchAll(PROIBIDO)) {
        violacoes.push(`${relative(process.cwd(), p)} → import de '${m[1]}'`);
      }
    }
    assert.deepEqual(violacoes, [], `o motor deixou de ser puro:\n${violacoes.join('\n')}`);
  });
});
