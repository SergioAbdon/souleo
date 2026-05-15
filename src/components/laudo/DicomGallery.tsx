'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Galeria DICOM — modal full-screen com grid + lightbox
//
// Mostra as imagens DICOM (preview JPG) que o Wader subiu pro Storage
// e gravou em `exame.imagensDicom` no Firestore.
//
// Estrutura:
//   - Overlay full-screen com backdrop escuro
//   - Modo grid: thumbnails responsivos (2/3/4/6 cols)
//   - Modo lightbox: 1 imagem grande + setas pra navegar
//
// Atalhos teclado (quando modal aberto):
//   - ESC: fecha lightbox (se aberto) OU fecha galeria (se já no grid)
//   - ←/→: navega entre imagens no lightbox
//
// Adicionado em 14/05/2026. Antes desse componente, médico via a
// contagem "📸 Imagens (10)" mas não tinha como abrir as imagens
// dentro do laudo. Ver
// docs/decisoes/2026-05-13-bug-acc-duplicado-remap-e-wader-sr.md §10.6.
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';

/**
 * Quebra um array de URLs em páginas de 8 (2 cols × 4 lin) e gera HTML.
 * Usado pelo `imprimirSelecao()` no Gallery e pelo `gerarPdfHtml()` no
 * page.tsx — exportada pra reuso.
 *
 * SEMPRE 8 slots por página: se N não for múltiplo de 8, última página
 * fica com slots vazios (invisíveis no print). Decisão 15/05/2026 (Sergio):
 * "PAGINAS SEMPRE SEJAM MULTIPLOS DE 8".
 *
 * FIX 15/05/2026: usa `minmax(0, 1fr)` em vez de `1fr` puro nas linhas do
 * grid. Sem o `minmax(0, ...)`, o conteúdo da imagem (com aspect ratio 4:3
 * grande) pode forçar a linha a esticar além do 1/4 da página, fazendo
 * Chrome reposicionar pra 3 linhas/A4 (bug que aconteceu antes — saía 6
 * imgs em vez de 8). `min-height: 0` no slot reforça.
 */
export function renderPaginas(urls: string[], pacienteNome?: string, tipoExame?: string): string {
  if (urls.length === 0) return '';
  const POR_PAGINA = 8;
  const paginas: string[][] = [];
  for (let i = 0; i < urls.length; i += POR_PAGINA) {
    const pg = urls.slice(i, i + POR_PAGINA);
    // Pad com strings vazias pra ter SEMPRE 8 slots (decisão 15/05/2026)
    while (pg.length < POR_PAGINA) pg.push('');
    paginas.push(pg);
  }
  const cabec = [pacienteNome, tipoExame].filter(Boolean).join(' · ');
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

type Props = {
  /** URLs públicas das imagens (Firebase Storage). Vazio/undefined = modal não renderiza. */
  imagens: string[];
  /** Controle externo do modal. */
  open: boolean;
  onClose: () => void;
  /** Nome do paciente, usado no header pra contexto. */
  pacienteNome?: string;
  /** Tipo de exame, mostrado no header. */
  tipoExame?: string;
  /**
   * Habilita modo seleção (decisão 14/05/2026). Quando true:
   *   - Click numa thumb adiciona/remove da seleção
   *   - Selecionadas ficam com ring verde + badge mostrando ordem (1, 2, 3...)
   *   - Header mostra contador "N selecionadas pra impressão"
   *   - Botão "🖨️ Imprimir Seleção" abre nova janela com layout 2×4
   * Quando false (default — modo secretária no Worklist): só visualização.
   */
  permitirSelecao?: boolean;
  /**
   * Lista de URLs selecionadas pra impressão. Caller (page.tsx) controla
   * — vem de `exame.imagensSelecionadasPdf` ou state local com default.
   * A ordem importa: define a ordem das imagens no PDF.
   */
  selecionadas?: string[];
  /**
   * Chamado quando médico clica em uma thumb (em modo seleção).
   * Caller deve atualizar `selecionadas` adicionando ou removendo a URL.
   */
  onToggleSelecao?: (url: string) => void;
};

export default function DicomGallery({
  imagens,
  open,
  onClose,
  pacienteNome,
  tipoExame,
  permitirSelecao = false,
  selecionadas = [],
  onToggleSelecao,
}: Props) {
  // null = modo grid; número = modo lightbox mostrando aquele índice
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);

  // Resetar zoom ao fechar (evita reabrir já no lightbox da última vez)
  useEffect(() => {
    if (!open) setZoomIdx(null);
  }, [open]);

  // Keyboard: ESC + setas. Só ativo quando o modal está open.
  useEffect(() => {
    if (!open || imagens.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // ESC no lightbox volta pro grid; no grid fecha modal
        if (zoomIdx !== null) setZoomIdx(null);
        else onClose();
      }
      // Setas só funcionam no lightbox (grid ignora)
      if (zoomIdx !== null && imagens.length > 1) {
        if (e.key === 'ArrowRight') {
          setZoomIdx((i) => ((i ?? 0) + 1) % imagens.length);
        } else if (e.key === 'ArrowLeft') {
          setZoomIdx((i) => ((i ?? 0) === 0 ? imagens.length - 1 : (i ?? 0) - 1));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, zoomIdx, imagens.length, onClose]);

  // Map URL → posição na seleção (1-indexed). null se não selecionada.
  // Usado pra renderizar o badge de ordem em vez do número-da-imagem.
  function ordemSelecao(url: string): number | null {
    if (!permitirSelecao) return null;
    const idx = selecionadas.indexOf(url);
    return idx === -1 ? null : idx + 1;
  }

  /** Abre nova janela com layout 2×4 (8 imagens/A4) e dispara print dialog.
      Útil pra médico imprimir SÓ as imagens (sem laudo principal). */
  function imprimirSelecao() {
    if (selecionadas.length === 0) {
      alert('Nenhuma imagem selecionada pra impressão.');
      return;
    }
    const titulo = pacienteNome ? `Imagens · ${pacienteNome}` : 'Imagens DICOM';
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>${titulo}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  @page{size:A4 portrait;margin:8mm;}
  body{font-family:'IBM Plex Sans',Arial,sans-serif;font-size:9pt;color:#1a1a1a;}
  /* height:auto + flex permite o conteúdo definir; page-break controla quebra */
  .pagina{page-break-after:always;display:flex;flex-direction:column;height:calc(100vh - 16mm);}
  .pagina:last-child{page-break-after:auto;}
  h1{font-size:11pt;font-weight:700;margin-bottom:3mm;padding-bottom:2mm;border-bottom:1.5px solid #1E3A5F;color:#1E3A5F;flex-shrink:0;}
  /* FIX 15/05/2026: minmax(0,1fr) + min-height:0 garante 4 linhas mesmo se
     o conteúdo das imagens (aspect ratio 4:3) tentar empurrar pra mais. */
  .grid{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4, minmax(0, 1fr));gap:3mm;min-height:0;}
  .slot{background:#000;border-radius:2px;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;min-height:0;}
  .slot-vazio{background:transparent;}
  .slot img{max-width:100%;max-height:100%;width:auto;height:auto;display:block;object-fit:contain;}
  .slot .num{position:absolute;bottom:2mm;right:2mm;background:rgba(0,0,0,.7);color:#fff;font-size:8pt;font-weight:600;padding:1mm 2mm;border-radius:2px;}
  @media print{.no-print{display:none;} @page{margin:8mm;}}
  /* Aviso pro usuário desativar header/footer do Chrome no print dialog */
  .aviso-print{position:fixed;top:8px;right:8px;background:#fef3c7;border:1px solid #f59e0b;padding:8px 12px;border-radius:4px;font-size:11px;color:#92400e;max-width:280px;}
</style></head><body>
<div class="aviso-print no-print">
  💡 No diálogo de impressão, em <strong>"Mais configurações"</strong>, desmarque
  <strong>"Cabeçalhos e rodapés"</strong> pra não cortar a 4ª linha de imagens.
</div>
${renderPaginas(selecionadas, pacienteNome, tipoExame)}
<script>window.onload=()=>{setTimeout(()=>window.print(),500);};</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) { w.document.write(html); w.document.close(); }
  }

  if (!open) return null;
  if (imagens.length === 0) {
    // Estado vazio (não deveria acontecer porque o botão é desabilitado, mas defensivo)
    return (
      <div
        className="fixed inset-0 z-[1000] bg-black/85 flex items-center justify-center"
        onClick={onClose}
      >
        <div className="bg-white rounded-lg p-6 max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-gray-700 mb-3">Sem imagens DICOM para este exame.</p>
          <button onClick={onClose} className="px-4 py-1.5 bg-gray-200 rounded text-sm font-medium hover:bg-gray-300">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black/90 flex flex-col" role="dialog" aria-modal="true">
      {/* ── HEADER ── */}
      <header className="flex items-center px-4 py-2.5 border-b border-white/10 flex-shrink-0">
        <div className="text-white">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span>📸 Imagens DICOM</span>
            <span className="text-xs text-white/60 font-normal">
              ({imagens.length} {imagens.length === 1 ? 'imagem' : 'imagens'}
              {permitirSelecao
                ? ` · ${selecionadas.length} selecionada${selecionadas.length === 1 ? '' : 's'} pra impressão`
                : ''}
              )
            </span>
          </h2>
          {pacienteNome && (
            <p className="text-[11px] text-white/60 mt-0.5">
              {pacienteNome}
              {tipoExame ? ` · ${tipoExame}` : ''}
            </p>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {permitirSelecao && selecionadas.length > 0 && zoomIdx === null && (
            <button
              onClick={imprimirSelecao}
              title={`Imprimir ${selecionadas.length} imagem(ns) selecionada(s) — 8 por A4`}
              className="px-3 py-1.5 rounded bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-700 transition flex items-center gap-1.5"
            >
              🖨️ Imprimir Seleção ({selecionadas.length})
            </button>
          )}
          {zoomIdx !== null && (
            <button
              onClick={() => setZoomIdx(null)}
              title="Voltar ao grid (ESC)"
              className="px-3 py-1.5 rounded bg-white/10 text-white text-xs font-medium hover:bg-white/20 transition"
            >
              ⊞ Grid
            </button>
          )}
          <button
            onClick={onClose}
            title="Fechar (ESC)"
            className="w-9 h-9 rounded-full bg-white/10 text-white text-lg hover:bg-red-600 transition flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      </header>

      {/* ── CORPO ── */}
      {zoomIdx === null ? (
        // ───── MODO GRID ─────
        <div className="flex-1 overflow-auto px-4 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {imagens.map((url, i) => {
              const ordem = ordemSelecao(url);
              const isSelecionada = ordem !== null;
              return (
                <div
                  key={`${i}-${url}`}
                  className={`group relative aspect-square bg-gray-900 rounded overflow-hidden transition cursor-zoom-in ${
                    isSelecionada
                      ? 'ring-[3px] ring-emerald-400'
                      : 'hover:ring-2 hover:ring-cyan-400'
                  }`}
                  title={
                    permitirSelecao
                      ? isSelecionada
                        ? `Imagem ${i + 1} · selecionada (${ordem}ª) — click pra desmarcar`
                        : `Imagem ${i + 1} — click pra incluir na impressão`
                      : `Imagem ${i + 1} de ${imagens.length}`
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    loading="lazy"
                    alt={`Imagem DICOM ${i + 1}`}
                    onClick={() => setZoomIdx(i)}
                    className="w-full h-full object-contain bg-black cursor-zoom-in"
                  />
                  {/* Badge: número da imagem (cinza) OU ordem na seleção (verde) */}
                  <span
                    className={`absolute bottom-1.5 right-1.5 text-white text-[10px] font-bold px-1.5 py-0.5 rounded select-none ${
                      isSelecionada ? 'bg-emerald-500' : 'bg-black/80'
                    }`}
                  >
                    {isSelecionada ? `${ordem}` : i + 1}
                  </span>
                  {/* Checkbox de seleção (canto superior esquerdo) — SEMPRE
                      VISÍVEL em modo seleção (decisão 15/05/2026).
                      Antes ficava só no hover via opacity-0 group-hover:opacity-100,
                      e Sergio reclamou: "NAO FUNCIONOU AO CLICAR, A IMAGEM AMPLIA".
                      Agora a checkbox é grande, opaca e separada do click pra ampliar. */}
                  {permitirSelecao && onToggleSelecao && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelecao(url);
                      }}
                      title={isSelecionada ? 'Remover da impressão' : 'Incluir na impressão'}
                      className={`absolute top-2 left-2 w-8 h-8 rounded text-base font-bold transition flex items-center justify-center cursor-pointer shadow-md ring-1 ${
                        isSelecionada
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600 ring-emerald-700'
                          : 'bg-white text-gray-700 hover:bg-emerald-50 ring-gray-400'
                      }`}
                    >
                      {isSelecionada ? '☑' : '☐'}
                    </button>
                  )}
                  {!permitirSelecao && (
                    <span className="absolute inset-0 bg-cyan-400/0 group-hover:bg-cyan-400/5 transition" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // ───── MODO LIGHTBOX ─────
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          {imagens.length > 1 && (
            <button
              onClick={() =>
                setZoomIdx((i) => ((i ?? 0) === 0 ? imagens.length - 1 : (i ?? 0) - 1))
              }
              title="Imagem anterior (←)"
              className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white text-2xl hover:bg-white/25 transition flex items-center justify-center z-10"
            >
              ‹
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagens[zoomIdx]}
            alt={`Imagem DICOM ${zoomIdx + 1}`}
            className="max-h-[88vh] max-w-[88vw] object-contain select-none"
            draggable={false}
          />

          {imagens.length > 1 && (
            <button
              onClick={() => setZoomIdx((i) => ((i ?? 0) + 1) % imagens.length)}
              title="Próxima imagem (→)"
              className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white text-2xl hover:bg-white/25 transition flex items-center justify-center z-10"
            >
              ›
            </button>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-3 py-1.5 rounded-full text-xs font-medium select-none">
            {zoomIdx + 1} / {imagens.length}
          </div>
        </div>
      )}
    </div>
  );
}
