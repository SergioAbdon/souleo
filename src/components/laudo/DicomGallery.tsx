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
};

export default function DicomGallery({ imagens, open, onClose, pacienteNome, tipoExame }: Props) {
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
              ({imagens.length} {imagens.length === 1 ? 'imagem' : 'imagens'})
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
            {imagens.map((url, i) => (
              <button
                key={`${i}-${url}`}
                onClick={() => setZoomIdx(i)}
                className="group relative aspect-square bg-gray-900 rounded overflow-hidden hover:ring-2 hover:ring-cyan-400 transition cursor-zoom-in"
                title={`Imagem ${i + 1} de ${imagens.length}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  loading="lazy"
                  alt={`Imagem DICOM ${i + 1}`}
                  className="w-full h-full object-contain bg-black"
                />
                <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                  {i + 1}
                </span>
                <span className="absolute inset-0 bg-cyan-400/0 group-hover:bg-cyan-400/5 transition" />
              </button>
            ))}
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
