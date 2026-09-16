// ══════════════════════════════════════════════════════════════════
// Senna93 F4-T4 · `extrairRowsDoSnapshot` — round-trip com montarParamsHtml
// ══════════════════════════════════════════════════════════════════
// Revisão adversarial (ce866ff): o fixture precisa ser a moldura REAL
// (`montarPdfMoldura`, pdf-moldura.ts) — é ela quem embrulha a tabela de
// params num `<table class="pl">` externo no snapshot de verdade
// (page.tsx:1711, gerarPdfHtml). Um wrapper `<body>` cru não reproduz o
// bug que a revisão achou (scan começando na tabela externa).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extrairRowsDoSnapshot } from '../../src/lib/shadow/snapshot-params.ts';
import { montarParamsHtml } from '../../src/lib/pdf-params.ts';
import { montarPdfMoldura } from '../../src/lib/pdf-moldura.ts';
import { simularTabelaLegado } from '../../src/lib/shadow/legado-tabela.ts';

const PADRAO = {
  sexo: 'M', peso: 80, altura: 170,
  b7: 34, b8: 40, b9: 50, b10: 10, b11: 10, b12: 30, b13: null,
  dtnasc: '1980-05-15', dtexame: '2026-08-27',
};

const CFG = { p1: '#0A7C71', clinicaNome: 'Clínica Teste', sigTexto: 'Dr. Teste\nCRM 1234' };

/** Mimetiza o `corpoHtml` de page.tsx:1702-1709 e a chamada de
 *  `montarPdfMoldura` de page.tsx:1711-1729 — minimal, mas genuíno: a
 *  tabela de params entra dentro do `<table class="pl">` externo. */
function laudoReal(paramsHtml) {
  const corpoHtml = `<div>MEDIDAS E PARÂMETROS</div><div>${paramsHtml}</div>`;
  return montarPdfMoldura({
    titulo: 'Ecocardiograma Transtorácico',
    identificacao: [[{ label: 'PACIENTE', valor: 'Paciente Teste' }]],
    corpoHtml,
    cfg: CFG,
  });
}

describe('extrairRowsDoSnapshot — round-trip com montarPdfMoldura (moldura real)', () => {
  test('devolve as MESMAS 10×8 strings de dentro do <table class="pl"> externo', () => {
    const rows = simularTabelaLegado(PADRAO);
    const paramsHtml = montarParamsHtml(rows, '#0A7C71', { pdf: true });
    const html = laudoReal(paramsHtml);
    assert.match(html, /<table class="pl">/); // confirma que o fixture tem a moldura real
    assert.deepEqual(extrairRowsDoSnapshot(html), rows);
  });

  test('round-trip também vale pro template "copiar formatado" (pdf:false)', () => {
    const rows = simularTabelaLegado(PADRAO);
    const paramsHtml = montarParamsHtml(rows, '#0A7C71', { pdf: false });
    const html = laudoReal(paramsHtml);
    assert.deepEqual(extrairRowsDoSnapshot(html), rows);
  });

  test('com realce (oor) — class="alert" + cor inline não corrompem as células', () => {
    const rows = simularTabelaLegado(PADRAO);
    const oor = rows.map((r) => r.map(() => false));
    oor[3][1] = true; // realça uma célula qualquer
    const paramsHtml = montarParamsHtml(rows, '#0A7C71', { pdf: true, oor });
    const html = laudoReal(paramsHtml);
    assert.match(html, /class="alert"/); // confirma que o realce está no fixture
    assert.deepEqual(extrairRowsDoSnapshot(html), rows);
  });

  test('HTML sem a tabela → null', () => {
    const html = laudoReal('<p>sem tabela nenhuma aqui</p>');
    assert.equal(extrairRowsDoSnapshot(html), null);
  });

  test('tabela com linha de 7 células (snapshot velho/estranho) → null', () => {
    const html = laudoReal(`<table style="border-collapse:collapse;table-layout:fixed;">
<colgroup><col/><col/><col/><col/><col/><col/><col/><col/></colgroup>
<tbody><tr><td>a</td><td>b</td><td>c</td><td>d</td><td>e</td><td>f</td><td>g</td></tr></tbody>
</table>`);
    assert.equal(extrairRowsDoSnapshot(html), null);
  });

  test('tbody vazio (0 linhas) → null, não []', () => {
    const html = laudoReal(`<table style="border-collapse:collapse;table-layout:fixed;">
<colgroup><col/><col/><col/><col/><col/><col/><col/><col/></colgroup>
<tbody></tbody>
</table>`);
    assert.equal(extrairRowsDoSnapshot(html), null);
  });

  test('decodifica &amp;/&lt;/&gt; das células', () => {
    const rows = [['A & B', '< 5', '> 10', '', 'x', 'y', 'z', 'w']];
    const paramsHtml = montarParamsHtml(rows, '#0A7C71', { pdf: true });
    const html = laudoReal(paramsHtml);
    assert.deepEqual(extrairRowsDoSnapshot(html), rows);
  });
});
