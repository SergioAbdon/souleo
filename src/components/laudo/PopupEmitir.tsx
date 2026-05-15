'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Popup Salvar/Emitir + Modo Emitido + Exportações
// ══════════════════════════════════════════════════════════════════

import { useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onRascunho: () => void;
  /**
   * Callback chamado ao clicar "Emitir". Recebe `incluirImagens: boolean`
   * — se médico marcou o toggle de incluir imagens DICOM no PDF.
   * Adicionado em 15/05/2026 (Sergio: "PODE MANTER A SUGESTAO" V1).
   */
  onEmitir: (incluirImagens: boolean) => void;
  /**
   * Quantidade de imagens DICOM selecionadas pra impressão. Quando > 0,
   * mostra checkbox "Incluir imagens (N)" — marcado por default. Quando 0,
   * esconde o checkbox (não há o que incluir).
   */
  totalImagensSelecionadas?: number;
};

export function PopupSalvarEmitir({ open, onClose, onRascunho, onEmitir, totalImagensSelecionadas = 0 }: Props) {
  // Toggle do checkbox — marcado por default quando há imagens
  const [incluirImagens, setIncluirImagens] = useState(true);

  // Reset quando o popup abre
  if (open && totalImagensSelecionadas === 0 && incluirImagens) {
    // (sem imagens: força false pra não passar true por engano)
    setIncluirImagens(false);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/45 z-[99999] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-[14px] p-7 w-[340px] shadow-[0_12px_40px_rgba(0,0,0,.25)]" onClick={e => e.stopPropagation()}>
        <div className="text-center text-[16px] font-bold text-[#1E3A5F] mb-[18px]">Finalizar Laudo</div>

        {/* Toggle "Incluir imagens DICOM" — só aparece se médico selecionou imagens */}
        {totalImagensSelecionadas > 0 && (
          <label className="flex items-center gap-2 mb-4 p-2.5 rounded-md bg-cyan-50 border border-cyan-200 cursor-pointer hover:bg-cyan-100 transition">
            <input
              type="checkbox"
              checked={incluirImagens}
              onChange={(e) => setIncluirImagens(e.target.checked)}
              className="w-4 h-4 accent-cyan-600 cursor-pointer"
            />
            <span className="text-[12px] text-[#1E3A5F] font-medium">
              Incluir imagens DICOM no PDF
              <span className="text-[10px] text-[#6B7280] ml-1">
                ({totalImagensSelecionadas} selecionada{totalImagensSelecionadas === 1 ? '' : 's'} · 8/A4)
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-col gap-2.5">
          <button onClick={onRascunho}
            className="flex items-center gap-3.5 p-3.5 rounded-[10px] border-[1.5px] border-[#E5E7EB] bg-white cursor-pointer text-left hover:border-[#1E3A5F] hover:bg-[#1E3A5F]/[.04] transition">
            <span className="text-[22px]">📝</span>
            <div>
              <div className="text-[13px] font-bold text-[#1E3A5F]">Salvar Rascunho</div>
              <div className="text-[11px] text-[#6B7280] mt-0.5">Salva e continua editando</div>
            </div>
          </button>
          <button onClick={() => onEmitir(incluirImagens)}
            className="flex items-center gap-3.5 p-3.5 rounded-[10px] border-[1.5px] border-[#059669] bg-white cursor-pointer text-left hover:border-[#059669] hover:bg-[#059669]/[.06] transition">
            <span className="text-[22px]">✅</span>
            <div>
              <div className="text-[13px] font-bold text-[#059669]">Emitir Laudo</div>
              <div className="text-[11px] text-[#6B7280] mt-0.5">
                {totalImagensSelecionadas > 0 && incluirImagens
                  ? `Finaliza, assina e inclui ${totalImagensSelecionadas} imagens`
                  : 'Finaliza e assina o laudo'}
              </div>
            </div>
          </button>
        </div>
        <button onClick={onClose}
          className="block w-full mt-3.5 py-2 bg-transparent border-none text-[#6B7280] text-xs font-medium cursor-pointer hover:text-[#1E3A5F]">
          Cancelar
        </button>
      </div>
    </div>
  );
}

type ModoEmitidoProps = {
  onFinalizar: () => void;
  onEditar: () => void;
  onImprimir: () => void;
  onCopiarFormatado: () => void;
  onCopiarTexto: () => void;
  onBaixarWord?: () => void;
};

export function ModoEmitido({ onFinalizar, onEditar, onImprimir, onCopiarFormatado, onCopiarTexto, onBaixarWord }: ModoEmitidoProps) {
  const [prontuarioOpen, setProntuarioOpen] = useState(false);

  return (
    <div className="px-4 py-2">
      {/* Badge compacto */}
      <div className="bg-[#059669] text-white text-center py-1 rounded text-[10px] font-bold tracking-wide mb-2">
        🔒 Emitido
      </div>

      {/* Botões em grid compacto */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        <BtnMini onClick={onImprimir}>🖨️ PDF</BtnMini>
        <BtnMini onClick={() => setProntuarioOpen(!prontuarioOpen)}>📋 Copiar</BtnMini>
        <BtnMini onClick={onEditar} cor="amber">✏️ Editar</BtnMini>
      </div>

      {/* Submenu copiar */}
      {prontuarioOpen && (
        <div className="mb-2 bg-gray-50 border border-[#E5E7EB] rounded overflow-hidden text-[10px]">
          <button onClick={() => { onCopiarFormatado(); setProntuarioOpen(false); }}
            className="w-full px-3 py-1.5 text-left hover:bg-white transition border-b border-[#E5E7EB] text-[#333] cursor-pointer">
            📄 Formatado <span className="text-[#999]">· Tasy, MV, Word</span>
          </button>
          <button onClick={() => { onCopiarTexto(); setProntuarioOpen(false); }}
            className="w-full px-3 py-1.5 text-left hover:bg-white transition border-b border-[#E5E7EB] text-[#333] cursor-pointer">
            📋 Texto simples <span className="text-[#999]">· Hapvida</span>
          </button>
          {onBaixarWord && (
            <button onClick={() => { onBaixarWord(); setProntuarioOpen(false); }}
              className="w-full px-3 py-1.5 text-left hover:bg-white transition text-[#333] cursor-pointer">
              📄 Word (.docx)
            </button>
          )}
        </div>
      )}

      <button onClick={onFinalizar}
        className="w-full py-1.5 rounded text-[10px] font-semibold text-[#059669] border border-[#059669] bg-white hover:bg-[#059669]/5 transition cursor-pointer">
        ✅ Finalizar
      </button>
    </div>
  );
}

function BtnMini({ onClick, cor, children }: { onClick: () => void; cor?: 'navy' | 'amber'; children: React.ReactNode }) {
  const cores = {
    navy: 'border-[#E5E7EB] text-[#1E3A5F] hover:bg-gray-50',
    amber: 'border-[#D97706] text-[#D97706] hover:bg-[#D97706]/5',
  };
  return (
    <button onClick={onClick}
      className={`py-1.5 px-2 rounded border bg-white cursor-pointer text-center text-[10px] font-semibold transition ${cores[cor || 'navy']}`}>
      {children}
    </button>
  );
}
