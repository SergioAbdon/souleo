// ══════════════════════════════════════════════════════════════════
// Senna93 F4-T4 · `extrairRowsDoSnapshot` — round-trip com montarParamsHtml
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extrairRowsDoSnapshot } from '../../src/lib/shadow/snapshot-params.ts';
import { montarParamsHtml } from '../../src/lib/pdf-params.ts';
import { simularTabelaLegado } from '../../src/lib/shadow/legado-tabela.ts';

const PADRAO = {
  sexo: 'M', peso: 80, altura: 170,
  b7: 34, b8: 40, b9: 50, b10: 10, b11: 10, b12: 30, b13: null,
  dtnasc: '1980-05-15', dtexame: '2026-08-27',
};

function laudoWrapper(tabelaHtml) {
  return `<!doctype html><html><head><title>Laudo</title></head><body>
<h1>Paciente Teste</h1><p>Ecocardiograma transtorácico</p>
${tabelaHtml}
<p>Assinado eletronicamente.</p></body></html>`;
}

describe('extrairRowsDoSnapshot — round-trip com montarParamsHtml', () => {
  test('devolve as MESMAS 10×8 strings que alimentaram montarParamsHtml', () => {
    const rows = simularTabelaLegado(PADRAO);
    const tabelaHtml = montarParamsHtml(rows, '#0A7C71', { pdf: true });
    const html = laudoWrapper(tabelaHtml);
    assert.deepEqual(extrairRowsDoSnapshot(html), rows);
  });

  test('round-trip também vale pro template "copiar formatado" (pdf:false)', () => {
    const rows = simularTabelaLegado(PADRAO);
    const tabelaHtml = montarParamsHtml(rows, '#0A7C71', { pdf: false });
    const html = laudoWrapper(tabelaHtml);
    assert.deepEqual(extrairRowsDoSnapshot(html), rows);
  });

  test('HTML sem a tabela → null', () => {
    const html = laudoWrapper('<p>sem tabela nenhuma aqui</p>');
    assert.equal(extrairRowsDoSnapshot(html), null);
  });

  test('tabela com linha de 7 células (snapshot velho/estranho) → null', () => {
    const html = laudoWrapper(`<table style="border-collapse:collapse;table-layout:fixed;">
<colgroup><col/><col/><col/><col/><col/><col/><col/><col/></colgroup>
<tbody><tr><td>a</td><td>b</td><td>c</td><td>d</td><td>e</td><td>f</td><td>g</td></tr></tbody>
</table>`);
    assert.equal(extrairRowsDoSnapshot(html), null);
  });

  test('decodifica &amp;/&lt;/&gt; das células', () => {
    const rows = [['A & B', '< 5', '> 10', '', 'x', 'y', 'z', 'w']];
    const tabelaHtml = montarParamsHtml(rows, '#0A7C71', { pdf: true });
    const html = laudoWrapper(tabelaHtml);
    assert.deepEqual(extrairRowsDoSnapshot(html), rows);
  });
});
