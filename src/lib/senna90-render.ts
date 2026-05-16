// ══════════════════════════════════════════════════════════════════
// SOULEO · Renderizador Senna90 → HTML do TipTap
// ══════════════════════════════════════════════════════════════════
//
// O Senna90 (server-side) retorna `ResultadoLaudo` com `achados: string[]`
// e `conclusoes: string[]`. O editor TipTap (EditorLaudo.tsx) espera um
// HTML unificado com esta estrutura (ver CSS `.tiptap *` no page.tsx e
// `getConclusoesLines()` em EditorLaudo.tsx que procura `<h3>` + `<ol><li>`):
//
//   <p>achado 1</p>
//   <p>achado 2</p>
//   <p>__WILKINS__{...json...}</p>      ← sentinela; page.tsx troca por bloco
//   <h3>CONCLUSÃO</h3>
//   <ol><li>conclusão 1</li><li>conclusão 2</li></ol>
//
// O sentinela `__WILKINS__{json}` é mantido INLINE de propósito: o
// page.tsx já tem `renderWilkinsHtml()` + regex que substitui isso pelo
// bloco formatado (mesma lógica do `_onLaudoGerado` legado). Não
// duplicamos a renderização do Wilkins aqui — só preservamos o sentinela.
//
// Decisão 16/05/2026 (migração Senna90): ver ADR + memória local.
// ══════════════════════════════════════════════════════════════════

/** Escapa texto pra HTML seguro (achados/conclusões são strings cruas). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Detecta linha de Wilkins (sentinela emitido pelo Senna90 achados/wilkins.ts). */
function ehWilkins(linha: string): boolean {
  return typeof linha === 'string' && linha.startsWith('__WILKINS__');
}

/**
 * Monta o HTML unificado (achados + conclusões) que o TipTap consome.
 *
 * - Achados normais: `<p>texto escapado</p>`
 * - Achado Wilkins (`__WILKINS__{json}`): `<p>__WILKINS__{json}</p>` SEM
 *   escapar (o JSON tem `{ } "` que são seguros em texto HTML; e o
 *   page.tsx faz regex `/<p>__WILKINS__(\{.*?\})<\/p>/` pra trocar).
 * - Conclusões: `<h3>CONCLUSÃO</h3>` + `<ol>` numerada. Só emite a
 *   seção se houver ≥1 conclusão (Senna90 quase sempre retorna ≥1).
 *
 * @param achados   ResultadoLaudo.achados (Senna90)
 * @param conclusoes ResultadoLaudo.conclusoes (Senna90)
 * @returns HTML string pra `editorRef.setContent()`
 */
export function montarLaudoHtml(achados: string[], conclusoes: string[]): string {
  const partesAchados = (achados || []).map((linha) => {
    if (ehWilkins(linha)) {
      // Mantém sentinela cru — page.tsx (renderWilkinsHtml) troca depois.
      return `<p>${linha}</p>`;
    }
    return `<p>${esc(linha)}</p>`;
  });

  let html = partesAchados.join('');

  const concs = (conclusoes || []).filter((c) => c && c.trim().length > 0);
  if (concs.length > 0) {
    html += `<h3>CONCLUSÃO</h3>`;
    html += `<ol>${concs.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>`;
  }

  return html;
}
