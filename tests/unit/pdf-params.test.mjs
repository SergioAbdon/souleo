// ══════════════════════════════════════════════════════════════════
// Tabela de parâmetros do laudo (S5-T13) — igualdade byte-a-byte com os
// dois templates que existiam antes da extração: `gerarPdfHtml()` (PDF)
// e `handleCopiarFormatado()` (prontuário), ambos em
// src/app/laudo/[id]/page.tsx. `legadoPdf`/`legadoCopiar` abaixo são
// cópias VERBATIM (usando innerHTML puro, sem escape — o comportamento
// real de antes) do que cada função montava a partir das mesmas rows.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { montarParamsHtml } from '../../src/lib/pdf-params.ts';

// ── Padrão-ouro: reconstrução verbatim do laço de `gerarPdfHtml`/
// `handleCopiarFormatado` (pré-T13), usando innerHTML (sem escape) —
// que é o que a raspagem original fazia.
function legadoRows(rows, p1) {
  let paramsRows = '';
  rows.forEach((cells) => {
    let rowHTML = '<tr>';
    cells.forEach((cell, idx) => {
      const divider = idx === 4 ? `border-left:2px solid ${p1};` : '';
      rowHTML += `<td style="border:0.5px solid #ccc;padding:2px 5px;${divider}">${cell}</td>`;
    });
    rowHTML += '</tr>';
    paramsRows += rowHTML;
  });
  return paramsRows;
}

function legadoPdf(rows, p1) {
  const paramsRows = legadoRows(rows, p1);
  return `<table style="border-collapse:collapse;width:100%;font-size:7.5pt;table-layout:fixed;">
<colgroup><col style="width:22%"/><col style="width:8%"/><col style="width:6%"/><col style="width:14%"/><col style="width:22%"/><col style="width:8%"/><col style="width:6%"/><col style="width:14%"/></colgroup>
<thead><tr>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Parâmetro</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Valor</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Unid.</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Referência</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;border-left:2px solid #fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Parâmetro</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Valor</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Unid.</th>
<th style="background:${p1}!important;color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;">Referência</th>
</tr></thead><tbody>${paramsRows}</tbody></table>
<div style="font-size:5.5pt;color:#888;line-height:1.4;padding:2px 4px;border-top:0.5px solid #ddd;">
DDVE= Diâmetro diastólico do VE. DSVE= Diâmetro sistólico do VE. VE= Ventrículo esquerdo. VD= Ventrículo direito.<br/>
Valores de referência: ASE/EACVI 2015; ASE 2025.
</div>`;
}

function legadoCopiar(rows, p1) {
  const paramsRows = legadoRows(rows, p1);
  return `<table style="border-collapse:collapse;width:100%;font-size:7.5pt;table-layout:fixed;">
<colgroup><col style="width:22%"/><col style="width:8%"/><col style="width:6%"/><col style="width:14%"/><col style="width:22%"/><col style="width:8%"/><col style="width:6%"/><col style="width:14%"/></colgroup>
<thead><tr>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Parâmetro</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Valor</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Unid.</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Referência</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;border-left:2px solid #fff;">Parâmetro</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Valor</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Unid.</th>
<th style="background:${p1};color:#fff;padding:2px 5px;font-weight:600;text-align:left;">Referência</th>
</tr></thead><tbody>${paramsRows}</tbody></table>
<div style="font-size:5.5pt;color:#888;padding:2px 4px;">Valores de referência: ASE/EACVI 2015; ASE 2025.</div>`;
}

const P1 = '#0B5FA5';
const ROWS = [
  ['Sexo', 'M', '', '', 'Índice de Massa Corporal', '24.1', 'kg/m²', '<25 kg/m²'],
  ['Peso', '80', 'Kg', '', 'Relação Ao/AE', '1.20', '', ''],
  ['Fração de Ejeção', '65%', '', '', 'x', '1', '', '>51%'],
];

describe('montarParamsHtml — igualdade byte-a-byte com os templates legados (rows sem "<"/">"/"&")', () => {
  test('opts.pdf=true reproduz gerarPdfHtml() legado', () => {
    // Linhas SEM "<"/">"/"&" — innerHTML e textContent coincidem, então o
    // legado (innerHTML cru) e a nova função (textContent + escape) têm
    // que produzir bytes idênticos.
    const rowsSemEscape = [
      ['Sexo', 'M', '', '', 'Índice de Massa Corporal', '24.1', 'kg/m²', ''],
      ['Peso', '80', 'Kg', '', 'Relação Ao/AE', '1.20', '', ''],
    ];
    assert.equal(montarParamsHtml(rowsSemEscape, P1, { pdf: true }), legadoPdf(rowsSemEscape, P1));
  });

  test('opts.pdf=false reproduz handleCopiarFormatado() legado', () => {
    const rowsSemEscape = [
      ['Sexo', 'M', '', '', 'Índice de Massa Corporal', '24.1', 'kg/m²', ''],
      ['Peso', '80', 'Kg', '', 'Relação Ao/AE', '1.20', '', ''],
    ];
    assert.equal(montarParamsHtml(rowsSemEscape, P1, { pdf: false }), legadoCopiar(rowsSemEscape, P1));
  });
});

describe('montarParamsHtml — escapa "<"/">"/"&" do textContent (referências como "<25 kg/m²")', () => {
  test('reference com "<" e ">" cru vira entidade HTML na tabela', () => {
    const html = montarParamsHtml(ROWS, P1, { pdf: true });
    assert.ok(html.includes('&lt;25 kg/m²'), 'esperava &lt;25 kg/m² escapado');
    assert.ok(html.includes('&gt;51%'), 'esperava &gt;51% escapado');
    assert.ok(!html.includes('<25 kg/m²'), 'não deveria sobrar "<" cru dentro do texto');
  });
});

describe('montarParamsHtml — quinta coluna (idx 4) leva o divisor', () => {
  test('divider aparece só na quinta célula de cada linha', () => {
    const html = montarParamsHtml(ROWS, P1, { pdf: false });
    // Header divide com #fff (não p1) — só as 3 linhas de dado usam ${p1}.
    const dividerRows = (html.match(new RegExp(`border-left:2px solid ${P1};`, 'g')) || []).length;
    const dividerHeader = (html.match(/border-left:2px solid #fff;/g) || []).length;
    assert.equal(dividerRows, ROWS.length);
    assert.equal(dividerHeader, 1);
  });
});
