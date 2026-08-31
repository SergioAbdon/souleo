// ══════════════════════════════════════════════════════════════════
// Tabela de parâmetros do laudo (S5-T13) — igualdade byte-a-byte com os
// dois templates que existiam antes da extração: `gerarPdfHtml()` (PDF)
// e `handleCopiarFormatado()` (prontuário), ambos em
// src/app/laudo/[id]/page.tsx. `legadoPdf`/`legadoCopiar` abaixo são
// cópias VERBATIM (usando innerHTML puro, sem escape — o comportamento
// real de antes) do que cada função montava a partir das mesmas rows.
// ══════════════════════════════════════════════════════════════════
// F3-T3: o rodapé das fontes virou `rodapeFontes()` (B20) — a REDAÇÃO mudou
// de propósito (declarada na allowlist), então os templates legados abaixo
// usam a mesma função: o que este teste pina é a ESTRUTURA byte-a-byte, não
// a redação (essa está pinada em senna93-formatar-pins.test.mjs).
// Também entram aqui os pins de `paramsParaTexto`/`paramsParaDocx`, extraídos
// nesta task de handleCopiarTexto/handleBaixarWord (page.tsx).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { montarParamsHtml, paramsParaTexto, paramsParaDocx } from '../../src/lib/pdf-params.ts';
import { rodapeFontes } from '../../src/senna90/classificacoes/fontes.ts';

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
${rodapeFontes()}
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
<div style="font-size:5.5pt;color:#888;padding:2px 4px;">${rodapeFontes()}</div>`;
}

// ── Padrão-ouro do Copiar Texto: cópia VERBATIM do laço que morava em
// `handleCopiarTexto` (page.tsx, pré-F3-T3). Se `paramsParaTexto` divergir
// em UM byte de padding, este teste cai.
function legadoTexto(rows) {
  let params = '';
  rows.forEach((cells) => {
    if (cells.length >= 8) {
      const left = `${(cells[0] || '').padEnd(22)}${(cells[1] || '').padStart(6)}  ${(cells[2] || '').padEnd(4)}${(cells[3] || '').padEnd(12)}`;
      const right = `${(cells[4] || '').padEnd(24)}${(cells[5] || '').padStart(6)}  ${(cells[6] || '').padEnd(6)}${cells[7] || ''}`;
      params += `${left}  │  ${right}\n`;
    }
  });
  return params;
}

// ── Padrão-ouro do Word: cópia VERBATIM do filtro/map de `handleBaixarWord`.
function legadoDocx(rows) {
  return rows.filter((cells) => cells.length >= 8).map((cells) => ({ cells }));
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

describe('rodapé único (B20) — as duas saídas HTML citam rodapeFontes()', () => {
  test('pdf=true e pdf=false contêm a MESMA string de fontes', () => {
    assert.ok(montarParamsHtml(ROWS, P1, { pdf: true }).includes(rodapeFontes()));
    assert.ok(montarParamsHtml(ROWS, P1, { pdf: false }).includes(rodapeFontes()));
  });
});

describe('paramsParaTexto — byte-idêntico ao handleCopiarTexto legado (F3-T3)', () => {
  const DUAS = [
    ['Sexo', 'M', '', '', 'Índice de Massa Corporal', '24.1', 'kg/m²', '<25'],
    ['Diâmetro diastólico do VE', '48', 'mm', '42-58', 'Fração de Ejeção', '70.4', '%', '>52'],
  ];

  test('fixture de 2 linhas — igualdade exata com o laço antigo', () => {
    assert.equal(paramsParaTexto(DUAS), legadoTexto(DUAS));
  });

  test('padding literal: 22/6/4/12 │ 24/6/6 (falha se alguém mexer num padEnd)', () => {
    assert.equal(
      paramsParaTexto([['A', '1', 'mm', 'ref', 'B', '2', 'cm', 'ref2']]),
      'A                          1  mm  ref           │  B                            2  cm    ref2\n',
    );
  });

  test('linha com menos de 8 células é PULADA (comportamento antigo)', () => {
    const curta = [['Sexo', 'M', '', '', 'IMC', '24.1', 'kg/m²']];
    assert.equal(paramsParaTexto(curta), '');
    assert.equal(paramsParaTexto(curta), legadoTexto(curta));
  });
});

describe('paramsParaDocx — mesmo filtro/forma do handleBaixarWord legado (F3-T3)', () => {
  test('>=8 células viram { cells }, o resto some', () => {
    const mistas = [
      ['A', '1', 'mm', 'ref', 'B', '2', 'cm', 'ref2'],
      ['curta', '1'],
    ];
    assert.deepEqual(paramsParaDocx(mistas), legadoDocx(mistas));
    assert.deepEqual(paramsParaDocx(mistas), [{ cells: mistas[0] }]);
  });
});

describe('montarParamsHtml — flags OOR opcionais (F3-T5)', () => {
  test('SEM `oor` o HTML é byte-idêntico ao de antes do parâmetro existir', () => {
    // O pin de paridade dos templates legados (acima) já cobre o caso pdf=true/
    // false; aqui trava-se que passar `oor: undefined` não muda um byte em
    // relação a não passar nada — quem monta a partir da raspagem do DOM
    // (gerarPdfHtml/handleCopiarFormatado) continua exatamente onde estava.
    for (const pdf of [true, false]) {
      assert.equal(montarParamsHtml(ROWS, P1, { pdf }), montarParamsHtml(ROWS, P1, { pdf, oor: undefined }));
      assert.equal(montarParamsHtml(ROWS, P1, { pdf }), montarParamsHtml(ROWS, P1, { pdf, oor: [] }));
    }
  });

  test('célula marcada ganha class="alert" + cor inline; as outras não mudam', () => {
    const oor = ROWS.map(() => new Array(8).fill(false));
    oor[0][5] = true; // IMC 24.1 (hipotético fora de referência)
    const html = montarParamsHtml(ROWS, P1, { pdf: true, oor });
    assert.equal((html.match(/ class="alert"/g) || []).length, 1);
    assert.equal((html.match(/color:#B91C1C;font-weight:600;/g) || []).length, 1);
    assert.match(html, /<td class="alert" style="[^"]*color:#B91C1C;font-weight:600;">24\.1<\/td>/);
    // Sem a flag, a MESMA célula sai limpa.
    assert.match(montarParamsHtml(ROWS, P1, { pdf: true }), /<td style="[^"]*">24\.1<\/td>/);
  });

  test('matriz curta/irregular não quebra (linha sem entrada = nada aceso)', () => {
    const html = montarParamsHtml(ROWS, P1, { pdf: false, oor: [[false, true]] });
    assert.equal((html.match(/ class="alert"/g) || []).length, 1);
  });
});

describe('montarParamsHtml — linha incompleta some das 4 saídas (X7)', () => {
  test('linha com cells.length < 8 NÃO aparece no HTML (mesmo filtro de paramsParaTexto/paramsParaDocx)', () => {
    const mistas = [
      ['Sexo', 'M', '', '', 'Índice de Massa Corporal', '24.1', 'kg/m²', '<25'],
      ['curta', '1'],
    ];
    for (const pdf of [true, false]) {
      const html = montarParamsHtml(mistas, P1, { pdf });
      assert.ok(!html.includes('>curta<'), 'linha incompleta vazou pro HTML');
      assert.equal((html.match(/<tr>/g) || []).length, 2); // 1 linha de dado + <tr> do <thead>
    }
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

// X10 (tríade onda-0): esta função também é chamável direto (exportada) —
// não dá pra confiar que todo chamador já validou p1 (a page valida, mas
// isolada ela tem que se defender sozinha).
describe('montarParamsHtml — cor travada na entrada (X10)', () => {
  test('p1 fora do vocabulário hex cai no fallback, não entra cru no style', () => {
    const payload = '#fff"><img src=x onerror=alert(1)>';
    const html = montarParamsHtml(ROWS, payload, { pdf: true });
    assert.ok(!html.includes(payload));
    assert.ok(html.includes('#8B1A1A'));
  });
});
