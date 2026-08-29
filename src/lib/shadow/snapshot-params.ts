// ══════════════════════════════════════════════════════════════════
// LEO Senna93 F4-T4 · Parser da tabela pintada no snapshot HTML
// ══════════════════════════════════════════════════════════════════
// `lerSnapshotHtml` (pdf-server.ts) devolve o HTML gravado em laudos-html/
// no momento da emissão — o que o legado REALMENTE pintou. Esta função acha
// e extrai a tabela de parâmetros produzida por `montarParamsHtml`
// (pdf-params.ts:48-87): única `<table>` com `table-layout:fixed` e um
// `<colgroup>` de 8 `<col>`. Formato rígido de propósito — snapshot velho ou
// estranho vira `null`, nunca um chute.
// ponytail: morre na F5b junto com a sombra — não generalizar pra parser
// de HTML genérico.
// ══════════════════════════════════════════════════════════════════

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Devolve as linhas×colunas da tabela de parâmetros, ou `null` se não
 *  achar a tabela (formato de `montarParamsHtml`) ou se alguma linha do
 *  tbody não tiver exatamente 8 células. */
export function extrairRowsDoSnapshot(html: string): string[][] | null {
  // Ancorado na própria marca (`table-layout:fixed` inline) — não na
  // primeira `<table\b>` do documento. A moldura real (`pdf-moldura.ts:116`)
  // envolve TUDO num `<table class="pl">` externo sem essa marca inline (ela
  // só existe na folha de estilo, não no atributo `style` da tag); o scan
  // não-guloso `/<table\b[^>]*>.../` que começasse por QUALQUER abertura
  // pegaria a externa e pararia no primeiro `</table>` — o da tabela de
  // params, ainda dentro da externa — rejeitando o candidato (a abertura
  // capturada seria a de `class="pl"`) e nunca chegando na tabela real.
  // A tabela de params não tem `<table>` aninhada, então o não-guloso a
  // partir da abertura certa fecha exatamente nela.
  const tabelas = html.match(/<table\b[^>]*table-layout:\s*fixed[^>]*>[\s\S]*?<\/table>/gi) || [];

  for (const tabela of tabelas) {
    const abertura = (tabela.match(/^<table\b[^>]*>/i) || [''])[0];
    if (!/table-layout:\s*fixed/i.test(abertura)) continue;

    const colgroup = tabela.match(/<colgroup>([\s\S]*?)<\/colgroup>/i);
    if (!colgroup) continue;
    const nCols = (colgroup[1].match(/<col\b/gi) || []).length;
    if (nCols !== 8) continue;

    const tbody = tabela.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    if (!tbody) continue;

    const trs = tbody[1].match(/<tr>[\s\S]*?<\/tr>/gi) || [];
    const rows: string[][] = [];
    for (const tr of trs) {
      const tds = tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
      const cells = tds.map((td) =>
        decodeEntities(td.replace(/^<td\b[^>]*>/i, '').replace(/<\/td>$/i, '')).trim()
      );
      if (cells.length !== 8) return null;
      rows.push(cells);
    }
    // tbody achado mas sem nenhuma linha: tabela estranha, não um "zero
    // linhas" legítimo — mesmo contrato de "formato bate ou vira null".
    if (rows.length === 0) return null;
    return rows;
  }
  return null;
}
