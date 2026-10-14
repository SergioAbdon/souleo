// Páginas de imagem DICOM do PDF (8 por A4) — uma fonte pros dois laudos (ECO e
// texto) e pra galeria, sem React (spec 2026-10-11-imagens-e-sr-em-todo-laudo).
import { escaparHtml, corSegura } from './html-escape';

const POR_PAGINA = 8;

/** Só a grade: N páginas de 8 slots (slots vazios no fim invisíveis). */
export function renderPaginas(urls: string[], pacienteNome?: string, tipoExame?: string): string {
  if (urls.length === 0) return '';
  const paginas: string[][] = [];
  for (let i = 0; i < urls.length; i += POR_PAGINA) {
    const pg = urls.slice(i, i + POR_PAGINA);
    // Pad com strings vazias pra ter SEMPRE 8 slots (decisão 15/05/2026)
    while (pg.length < POR_PAGINA) pg.push('');
    paginas.push(pg);
  }
  // Escapado (fix2 do I4): estas páginas entram no PDF (`htmlPosTabela`) e são
  // renderizadas pelo Chrome do servidor, numa página com as signed URLs das
  // imagens do paciente. `pacienteNome`/`tipoExame` são graváveis pela
  // recepção (whitelist administrativa) e aqui NÃO passam por toUpperCase —
  // um `<img src=x onerror=…>` rodava inteiro.
  const cabec = escaparHtml([pacienteNome, tipoExame].filter(Boolean).join(' · '));
  return paginas
    .map(
      (pgUrls, pgIdx) => `<div class="pagina">
${cabec ? `<h1>📸 Imagens DICOM — ${cabec} (página ${pgIdx + 1} de ${paginas.length})</h1>` : ''}
<div class="grid">
${pgUrls
  .map((url, i) => {
    if (!url) return '<div class="slot slot-vazio"></div>'; // slot vazio invisível
    const num = pgIdx * POR_PAGINA + i + 1;
    return `<div class="slot"><img src="${url}" alt="Imagem ${num}" /><span class="num">${num}</span></div>`;
  })
  .join('\n')}
</div>
</div>`,
    )
    .join('\n');
}

/**
 * CSS das páginas + grade — pronto pro `htmlPosTabela` da moldura. `p1` passa
 * por corSegura porque entra cru num <style>. Vazio quando não há imagem.
 */
export function renderPaginasPdf(urls: string[], pacienteNome: string | undefined, tipoExame: string | undefined, p1: string): string {
  if (urls.length === 0) return '';
  const cor = corSegura(p1);
  return `<style>
.pagina{page-break-before:always;display:flex;flex-direction:column;height:calc(100vh - 16mm);padding:8mm;font-family:"IBM Plex Sans",sans-serif;}
.pagina h1{font-size:11pt;font-weight:700;color:${cor};margin-bottom:3mm;padding-bottom:2mm;border-bottom:1.5px solid ${cor};flex-shrink:0;}
.grid{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4, minmax(0, 1fr));gap:3mm;min-height:0;}
.slot{background:#000;border-radius:2px;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;min-height:0;}
.slot-vazio{background:transparent;}
.slot img{max-width:100%;max-height:100%;width:auto;height:auto;display:block;object-fit:contain;}
.slot .num{position:absolute;bottom:2mm;right:2mm;background:rgba(0,0,0,.7);color:#fff;font-size:7.5pt;font-weight:600;padding:1mm 2mm;border-radius:2px;}
</style>${renderPaginas(urls, pacienteNome, tipoExame)}`;
}
