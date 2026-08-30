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

  // ── Tríade final (ARQ-C1): o QUANDO da trava também tem dono único ──
  // O T6 unificou QUAIS campos; o gatilho continuou duplicado: um latch
  // `motorDesbloqueado` em SidebarLaudo que subia no 1º desbloqueio e nunca
  // voltava. Depois de desbloquear → editar → REEMITIR na mesma montagem, o
  // CSS travava (dono: `emitido` da page) e o disabled-setter + os 3 guards
  // de onClick continuavam abertos — laudo assinado editável por Tab/setas.
  test('o gatilho da trava do motor é UM só: motorBloqueado = readOnlyMotor (sem latch derivado)', () => {
    assert.match(sidebarSrc, /const motorBloqueado = !!readOnlyMotor;/,
      'motorBloqueado tem que derivar direto de readOnlyMotor — sem estado intermediário');
    assert.ok(!/motorDesbloqueado/.test(sidebarSrc),
      'latch motorDesbloqueado voltou: ele não reseta na reemissão e reabre o laudo assinado');
  });

  test('page.tsx é a dona do lock: CSS e readOnlyMotor leem o MESMO `emitido`', () => {
    assert.match(pageSrc, /emitido \? 'laudo-locked' : ''/);
    assert.match(pageSrc, /readOnlyMotor=\{emitido\}/);
  });

  // ── Tríade final (I1/I2): laudo assinado não volta pra rascunho ──
  test('salvarLaudo recusa gravar em documento fechado (autosave e "Salvar rascunho" não des-emitem)', () => {
    const corpo = pageSrc.split('async function salvarLaudo(')[1] || '';
    assert.ok(/if \(docFechado\) return false;/.test(corpo.slice(0, 1800)),
      'salvarLaudo tem que sair cedo quando o DOC está fechado (não pelo state `emitido`, que handleDesbloquear zera)');
    assert.match(pageSrc, /if \(emitido \|\| docFechado \|\| !dirtyRef\.current/,
      'o gate do autosave tem que olhar o doc, não só o state');
  });

  // fix2/n1: `transferirExame` mantém `emitidoEm` e devolve o exame pra
  // 'andamento' — gatear por `emitidoEm` deixava o médico que RECEBEU o laudo
  // (justamente pra refazê-lo) sem autosave e sem rascunho de servidor.
  test('o gate é o STATUS do doc: transferido volta a salvar, cancelado continua travado', () => {
    assert.match(pageSrc, /const docFechado = \['emitido', 'cancelado'\]\.includes/);
    assert.ok(!/const docFechado = !!exame\?\.emitidoEm/.test(pageSrc));
    // transferirExame: status volta pra 'andamento' e emitidoEm FICA — é isso
    // que torna `emitidoEm` o predicado errado pra este gate. E6 (CAS) passou
    // a LER emitidoEm pra comparar (mesmaEmissao) — leitura legítima, não é
    // o que este canário protege. Mascara ESSA leitura conhecida e faz o
    // grep no corpo INTEIRO que sobrar: qualquer `emitidoEm` que apareça
    // depois disso é escrita nova (ou leitura nova) que o revisor não previu.
    const adminSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'exame-admin.ts'), 'utf8');
    const transf = adminSrc.split('export async function transferirExame')[1] || '';
    assert.match(transf, /status: 'andamento'/);
    const mascarado = transf
      .split('return { ok: true }')[0]
      .replace(/mesmaEmissao\(d\.emitidoEm, exame\.emitidoEm\)/g, '');
    assert.ok(!/emitidoEm/.test(mascarado),
      'apareceu um emitidoEm novo em transferirExame fora da leitura conhecida do CAS — ' +
      'se for escrita (limpar/setar emitidoEm), este gate pode voltar a ser por emitidoEm');
  });

  test('a emissão grava o laudoHtml assinado no doc (tela do emitido = PDF)', () => {
    const bloco = pageSrc.split('const dadosFinais = {')[1]?.split('};')[0] || '';
    assert.match(bloco, /laudoHtml: editorRef\.current\?\.getHTML\(\) \?\? ''/,
      'sem laudoHtml em dadosFinais o emitido reabre com o último autosave, não com o texto assinado');
  });

  // ── Tríade final (I6): /laudo-texto tinha o mesmo furo, sem timer ──
  test('/laudo-texto: "Salvar rascunho" desabilitado (e guardado) em laudo emitido', () => {
    const textoSrc = fs.readFileSync(
      path.join(root, 'src', 'app', 'laudo-texto', '[id]', 'page.tsx'), 'utf8',
    );
    assert.match(textoSrc, /disabled=\{salvando \|\| emitindo \|\| emitidoDoc\}/);
    assert.match(textoSrc, /if \(emitidoDoc\) \{ toast\(/,
      'guard no handler além do disabled — o exame chega depois do primeiro render');
  });
});
