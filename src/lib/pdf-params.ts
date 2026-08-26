// ══════════════════════════════════════════════════════════════════
// LEO · Tabela de parâmetros do laudo — HTML compartilhado (S5-T13)
//
// Antes desta extração, `gerarPdfHtml()` e `handleCopiarFormatado()`
// (ambos em src/app/laudo/[id]/page.tsx) raspavam `#params-tbody` e
// montavam CADA UM sua própria cópia quase-idêntica da tabela — só
// diferindo no cabeçalho (PDF usa !important + print-color-adjust pra
// sobreviver ao motor de impressão do Chrome) e no rodapé (PDF tem a
// legenda DDVE/DSVE; copiar-formatado não). `opts.pdf` cobre essa
// variação — as duas saídas continuam byte-a-byte iguais às de antes
// (tests/unit/pdf-params.test.mjs guarda os dois templates legados).
//
// `rows` vem de `lerParamsDoDOM()` (page.tsx) — textContent cru de cada
// `<td>`, não innerHTML: os valores nunca têm HTML aninhado (o motor só
// escreve texto), então a única diferença prática é que textContent não
// escapa "<"/">"/"&" — por isso esta função escapa antes de reinserir,
// reproduzindo o mesmo HTML final que a raspagem por innerHTML produzia.
// Puro, sem import @/ — testado direto por node --test.
// ══════════════════════════════════════════════════════════════════

export type ParamsHtmlOpts = {
  /** true = tabela do PDF (impressão): !important + print-color-adjust
   *  nos <th>, rodapé com a legenda DDVE/DSVE.
   *  false = tabela do "Copiar Formatado" (prontuário): sem
   *  !important/print-color-adjust, rodapé só com a linha de referência. */
  pdf: boolean;
};

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function montarParamsHtml(rows: string[][], p1: string, opts: ParamsHtmlOpts): string {
  const paramsRows = rows
    .map((cells) => {
      let rowHTML = '<tr>';
      cells.forEach((cell, idx) => {
        const divider = idx === 4 ? `border-left:2px solid ${p1};` : '';
        rowHTML += `<td style="border:0.5px solid #ccc;padding:2px 5px;${divider}">${escHtml(cell)}</td>`;
      });
      rowHTML += '</tr>';
      return rowHTML;
    })
    .join('');

  const bg = opts.pdf ? `${p1}!important` : p1;
  const printAdjust = opts.pdf ? '-webkit-print-color-adjust:exact;print-color-adjust:exact;' : '';
  const th = (label: string, divisorDireita = false) =>
    `<th style="background:${bg};color:#fff;padding:2px 5px;font-weight:600;text-align:left;${divisorDireita ? 'border-left:2px solid #fff;' : ''}${printAdjust}">${label}</th>`;

  const paramsHTML = `<table style="border-collapse:collapse;width:100%;font-size:7.5pt;table-layout:fixed;">
<colgroup><col style="width:22%"/><col style="width:8%"/><col style="width:6%"/><col style="width:14%"/><col style="width:22%"/><col style="width:8%"/><col style="width:6%"/><col style="width:14%"/></colgroup>
<thead><tr>
${th('Parâmetro')}
${th('Valor')}
${th('Unid.')}
${th('Referência')}
${th('Parâmetro', true)}
${th('Valor')}
${th('Unid.')}
${th('Referência')}
</tr></thead><tbody>${paramsRows}</tbody></table>
${opts.pdf
    ? `<div style="font-size:5.5pt;color:#888;line-height:1.4;padding:2px 4px;border-top:0.5px solid #ddd;">
DDVE= Diâmetro diastólico do VE. DSVE= Diâmetro sistólico do VE. VE= Ventrículo esquerdo. VD= Ventrículo direito.<br/>
Valores de referência: ASE/EACVI 2015; ASE 2025.
</div>`
    : `<div style="font-size:5.5pt;color:#888;padding:2px 4px;">Valores de referência: ASE/EACVI 2015; ASE 2025.</div>`}`;

  return paramsHTML;
}
