// Trava única do emitido (S5-T6). O motor-lock tem DOIS mecanismos (CSS
// pointer-events em page.tsx trava mouse/visual; o disabled-setter em
// SidebarLaudo.tsx trava teclado — CSS sozinho não segura Tab/setas,
// achado S5-T3/M1) que precisam concordar em QUAIS campos ficam de fora
// da trava: convênio/solicitante (correção administrativa sem crédito,
// T5) e nome/dtnasc/dtexame (trava de IDENTIFICAÇÃO, dona separada via
// idBloqueado no JSX — sem esta exceção o botão "🔓 Desbloquear nome/datas"
// libera no React mas o CSS continua pointer-events:none por cima, achado
// Important 2 do review). Se alguém editar só um dos dois lados, os dois
// mecanismos voltam a divergir — exatamente o bug que a task unificou.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const pageSrc = fs.readFileSync(path.join(root, 'src', 'app', 'laudo', '[id]', 'page.tsx'), 'utf8');
const sidebarSrc = fs.readFileSync(path.join(root, 'src', 'components', 'laudo', 'SidebarLaudo.tsx'), 'utf8');

function idsIsentosCss() {
  const cssLine = pageSrc.split('\n').find(l => l.includes('.laudo-locked #laudo-sidebar input'));
  assert.ok(cssLine, 'linha do CSS .laudo-locked não encontrada em page.tsx');
  // Só o ramo `input` — os 3 ramos (input/select/textarea) usam a mesma
  // cadeia de :not() na mesma linha (checado à parte, Minor 2).
  const ramoInput = cssLine.split(',')[0];
  return new Set([...ramoInput.matchAll(/:not\(#([\w-]+)\)/g)].map(m => m[1]));
}

function idsLivresJs() {
  const match = sidebarSrc.match(/const livres = \[([^\]]+)\]/);
  assert.ok(match, 'lista `livres` não encontrada em SidebarLaudo.tsx');
  return new Set(match[1].split(',').map(s => s.trim().replace(/'/g, '')));
}

describe('trava única do emitido — CSS e disabled-setter concordam', () => {
  test('CSS e disabled-setter isentam o MESMO conjunto de ids (a invariante, não um snapshot)', () => {
    const idsCss = idsIsentosCss();
    const livres = idsLivresJs();
    assert.ok(idsCss.size > 0, 'lista de isenção não pode estar vazia dos dois lados (falso-positivo)');
    assert.deepEqual(idsCss, livres, 'CSS (.laudo-locked) e `livres` (disabled-setter) precisam isentar exatamente os mesmos campos');
  });

  test('os 3 ramos do seletor CSS (input/select/textarea) repetem a MESMA cadeia de :not() (Minor 2 — sem assimetria)', () => {
    const cssLine = pageSrc.split('\n').find(l => l.includes('.laudo-locked #laudo-sidebar input'));
    const ramos = cssLine.split('{')[0].split(',');
    assert.equal(ramos.length, 3, 'esperado exatamente 3 ramos: input, select, textarea');
    const cadeias = ramos.map(r => (r.match(/:not\([^)]+\)/g) || []).join(''));
    assert.ok(cadeias.every(c => c === cadeias[0]), 'os 3 ramos devem ter a mesma cadeia de :not()');
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

  test('setEditable roda silencioso (sem disparar onDirty via emit de update) — review Important 1', () => {
    const editorSrc = fs.readFileSync(
      path.join(root, 'src', 'components', 'laudo', 'EditorLaudo.tsx'), 'utf8',
    );
    assert.match(editorSrc, /editor\?\.setEditable\(editable,\s*false\)/);
  });
});
