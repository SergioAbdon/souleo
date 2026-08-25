// Trava única do emitido (S5-T6). O motor-lock tem DOIS mecanismos (CSS
// pointer-events em page.tsx trava mouse/visual; o disabled-setter em
// SidebarLaudo.tsx trava teclado — CSS sozinho não segura Tab/setas,
// achado S5-T3/M1) que precisam concordar em QUAIS campos ficam de fora
// da trava: convênio/solicitante (correção administrativa sem crédito,
// T5) e nome/dtnasc/dtexame (trava de IDENTIFICAÇÃO, dona separada via
// idBloqueado no JSX). Se alguém editar só um dos dois lados, os dois
// mecanismos voltam a divergir — exatamente o bug que a task unificou.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const pageSrc = fs.readFileSync(path.join(root, 'src', 'app', 'laudo', '[id]', 'page.tsx'), 'utf8');
const sidebarSrc = fs.readFileSync(path.join(root, 'src', 'components', 'laudo', 'SidebarLaudo.tsx'), 'utf8');

describe('trava única do emitido — CSS e disabled-setter concordam', () => {
  test('CSS .laudo-locked isenta exatamente #convenio e #solicitante', () => {
    const cssLine = pageSrc.split('\n').find(l => l.includes('.laudo-locked #laudo-sidebar input'));
    assert.ok(cssLine, 'linha do CSS .laudo-locked não encontrada em page.tsx');
    const idsIsentos = [...cssLine.matchAll(/:not\(#([\w-]+)\)/g)].map(m => m[1]);
    assert.deepEqual(new Set(idsIsentos), new Set(['convenio', 'solicitante']));
  });

  test('disabled-setter (SidebarLaudo) usa a mesma lista de isenção + as 3 da trava de identificação', () => {
    const match = sidebarSrc.match(/const livres = \[([^\]]+)\]/);
    assert.ok(match, 'lista `livres` não encontrada em SidebarLaudo.tsx');
    const livres = new Set(match[1].split(',').map(s => s.trim().replace(/'/g, '')));
    assert.deepEqual(livres, new Set(['nome', 'dtnasc', 'dtexame', 'convenio', 'solicitante']));
  });

  test('Wilkins (wk-mob/wk-esp/wk-cal/wk-sub) NÃO tem mais isenção própria — trava como qualquer campo do motor', () => {
    const match = sidebarSrc.match(/const livres = \[([^\]]+)\]/);
    const livres = match[1];
    for (const id of ['wk-mob', 'wk-esp', 'wk-cal', 'wk-sub', 'wilkins-toggle']) {
      assert.ok(!livres.includes(`'${id}'`), `${id} não deveria estar isento (mesmo furo do S5-T3/M1)`);
    }
  });

  test('EditorLaudo remonta editable — page.tsx passa editable={!emitido}', () => {
    assert.match(pageSrc, /editable=\{!emitido\}/);
  });
});
