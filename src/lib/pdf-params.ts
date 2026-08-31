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
//
// F3-T3: os outros dois consumidores da mesma raspagem (Copiar Texto e
// Baixar Word) moraram até agora dentro da page com formatação própria —
// agora são `paramsParaTexto`/`paramsParaDocx` aqui, puros e pinados.
// Único import: `rodapeFontes()` (B20) — o rodapé das fontes existia em 4
// lugares com 3 redações. Import RELATIVO de propósito: `node --test`
// resolve `../` (hook de .ts), não resolve o alias `@/`.
// ══════════════════════════════════════════════════════════════════

import { rodapeFontes } from '../senna90/classificacoes/fontes';
// X10/X13: mesma validação e mesmo escape que a moldura usa — sem ciclo
// (html-escape.ts é puro, zero imports, ver cabeçalho do arquivo), então UMA
// definição só, importada aqui. X13 matou a `escHtml` própria (3 entidades)
// que vivia ao lado — divergia da `escaparHtml` da moldura (4 entidades,
// inclui `"`) sem motivo. Tríade onda-3 (Ruflo-A5): escaparHtml/corSegura
// saíram de pdf-moldura.ts pra html-escape.ts — mesma função, novo endereço.
import { corSegura, escaparHtml } from './html-escape';

export type ParamsHtmlOpts = {
  /** true = tabela do PDF (impressão): !important + print-color-adjust
   *  nos <th>, rodapé com a legenda DDVE/DSVE.
   *  false = tabela do "Copiar Formatado" (prontuário): sem
   *  !important/print-color-adjust, rodapé só com a linha de referência. */
  pdf: boolean;
  /** F3-T5: realce fora-de-referência célula a célula (`montarRowsTabela`).
   *  AUSENTE = HTML byte-idêntico ao de sempre (a raspagem por `textContent`
   *  não carrega classe, então quem monta a partir do DOM não tem as flags —
   *  ver `pintarTabelaSenna93`). Presente: `class="alert"` + cor inline (o
   *  PDF/prontuário são HTML avulso, sem a folha de estilo da tela). */
  oor?: boolean[][];
};

export function montarParamsHtml(rows: string[][], p1raw: string, opts: ParamsHtmlOpts): string {
  // X10: cor entra aqui vinda da page (já validada lá) — revalida de novo
  // porque esta função também é chamável direto (é exportada e testada
  // isolada); não dá pra confiar que todo chamador passou pela page.
  const p1 = corSegura(p1raw);
  const paramsRows = rows
    .map((cells, i) => ({ cells, i }))
    // X7: mesmo filtro de paramsParaTexto/paramsParaDocx (linha ~104/117) —
    // row incompleta do motor sairia desalinhada/com colunas faltando; sem
    // isso ela vazava só no HTML (PDF/copiar-formatado), divergindo das
    // outras 2 saídas. Uma linha só é válida nas 4 saídas ou em nenhuma.
    // `i` original preservado (não o índice pós-filtro) — opts.oor é indexado
    // pela posição em `rows`, não pela posição na lista já filtrada.
    .filter(({ cells }) => cells.length >= 8)
    .map(({ cells, i }) => {
      let rowHTML = '<tr>';
      cells.forEach((cell, idx) => {
        const divider = idx === 4 ? `border-left:2px solid ${p1};` : '';
        const alerta = opts.oor?.[i]?.[idx] === true;
        rowHTML += `<td${alerta ? ' class="alert"' : ''} style="border:0.5px solid #ccc;padding:2px 5px;${divider}${alerta ? 'color:#B91C1C;font-weight:600;' : ''}">${escaparHtml(cell)}</td>`;
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
${rodapeFontes()}
</div>`
    : `<div style="font-size:5.5pt;color:#888;padding:2px 4px;">${rodapeFontes()}</div>`}`;

  return paramsHTML;
}

// ── Copiar Texto (texto puro, colunas por padEnd/padStart) ──────────
// Formato BYTE-IDÊNTICO ao que `handleCopiarTexto` montava inline
// (page.tsx, pré-F3-T3): 22/6/4/12 à esquerda, ' │ ' no meio, 24/6/6 à
// direita, linha com menos de 8 células PULADA (row incompleta do motor
// sairia desalinhada). Retorna só o bloco da tabela — cabeçalho, réguas
// e rodapé continuam na page, que é quem sabe o resto do documento.
export function paramsParaTexto(rows: string[][]): string {
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

// ── Baixar Word (docx) ──────────────────────────────────────────────
// Mesmo filtro de linha incompleta do texto puro; `gerarDocx` espera
// `{ cells }` por linha (src/lib/exportDocx.ts).
export function paramsParaDocx(rows: string[][]): { cells: string[] }[] {
  return rows.filter((cells) => cells.length >= 8).map((cells) => ({ cells }));
}
