// ══════════════════════════════════════════════════════════════════
// SOULEO · HTML do editor → linhas (S5-T2 fix, achado IMPORTANT 5)
// ══════════════════════════════════════════════════════════════════
//
// O merge por linha (`laudo-merge.ts`) só preserva o que consegue LER do
// editor: o que a extração não vê é apagado na próxima regeneração do
// motor. A versão anterior caminhava só os irmãos de primeiro nível e
// aceitava `P|LI` — a lista com marcadores / numerada que o médico cria
// pela toolbar vira `<ul><li><p>…`, com os `<li>` ANINHADOS, e sumia
// inteira; conclusão digitada como `<p>` depois do `<ol>` também.
//
// Aqui a leitura é por bloco fechado, não por nível: qualquer `</p>`,
// `</li>`, `</h*>`, `</div>` ou `</blockquote>` fecha uma linha. Blocos
// aninhados saem certos de graça — o fechamento interno vem primeiro e o
// resto do bloco externo fica vazio.
//
// PURO (string → string[]): sem DOM, roda no teste unitário sem jsdom.
// ══════════════════════════════════════════════════════════════════

const FIM_DE_BLOCO = /<\/(?:p|li|h[1-6]|div|blockquote|pre)\s*>/i;

/** Entidades que o `montarLaudoHtml` (esc) e o TipTap produzem. */
function decodificar(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // por último: `&amp;lt;` não vira `<`
}

/** Texto visível de um trecho de HTML, uma linha por bloco fechado. */
function linhas(html: string): string[] {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .split(FIM_DE_BLOCO)
    .map((parte) => decodificar(parte.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Índice do `<h3>` que separa achados de conclusões (-1 = não há).
 * Casa o TÍTULO, não qualquer `<h3>`: o StarterKit tem input rule de heading
 * ("### " + espaço, Ctrl+Alt+3), e um título que o médico escreva no meio dos
 * achados cortava o laudo ali — o resto migrava pra lista da CONCLUSÃO.
 *
 * ponytail: casa por texto ("CONCLUS" pega CONCLUSÃO/Conclusao/CONCLUSAO).
 * Limite conhecido: se o médico RENOMEAR o título ("IMPRESSÃO") ou apagá-lo,
 * isto devolve −1 → a lista inteira é lida como achados e as conclusões
 * voltam vazias, o que faz o merge regerá-las: elas saem DUPLICADAS (uma vez
 * como parágrafos, outra na lista numerada). Ainda assim é melhor que casar
 * qualquer `<h3>` (que truncava o laudo em silêncio). Upgrade, se doer:
 * marcar o título com um atributo próprio no `montarLaudoHtml`.
 */
function corteConclusao(html: string): number {
  return (html || '').search(/<h3[^>]*>\s*CONCLUS/i);
}

/** Linhas de ACHADOS = tudo antes do `<h3>CONCLUSÃO</h3>`. */
export function linhasAchados(html: string): string[] {
  const i = corteConclusao(html);
  return linhas(i < 0 ? html : (html || '').slice(0, i));
}

/** Linhas de CONCLUSÕES = tudo depois do `</h3>` (o `<ol>` e o que vier). */
export function linhasConclusoes(html: string): string[] {
  const i = corteConclusao(html);
  if (i < 0) return [];
  const resto = (html || '').slice(i);
  const fim = /<\/h3\s*>/i.exec(resto);
  return fim ? linhas(resto.slice(fim.index + fim[0].length)) : [];
}
