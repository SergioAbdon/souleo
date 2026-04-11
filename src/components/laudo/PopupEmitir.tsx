'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Popup Salvar/Emitir + Modo Emitido + Exportações
// ══════════════════════════════════════════════════════════════════

import { useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onRascunho: () => void;
  onEmitir: () => void;
};

export function PopupSalvarEmitir({ open, onClose, onRascunho, onEmitir }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/45 z-[99999] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-[14px] p-7 w-[340px] shadow-[0_12px_40px_rgba(0,0,0,.25)]" onClick={e => e.stopPropagation()}>
        <div className="text-center text-[16px] font-bold text-[#1E3A5F] mb-[18px]">Finalizar Laudo</div>
        <div className="flex flex-col gap-2.5">
          <button onClick={onRascunho}
            className="flex items-center gap-3.5 p-3.5 rounded-[10px] border-[1.5px] border-[#E5E7EB] bg-white cursor-pointer text-left hover:border-[#1E3A5F] hover:bg-[#1E3A5F]/[.04] transition">
            <span className="text-[22px]">📝</span>
            <div>
              <div className="text-[13px] font-bold text-[#1E3A5F]">Salvar Rascunho</div>
              <div className="text-[11px] text-[#6B7280] mt-0.5">Salva e continua editando</div>
            </div>
          </button>
          <button onClick={onEmitir}
            className="flex items-center gap-3.5 p-3.5 rounded-[10px] border-[1.5px] border-[#059669] bg-white cursor-pointer text-left hover:border-[#059669] hover:bg-[#059669]/[.06] transition">
            <span className="text-[22px]">✅</span>
            <div>
              <div className="text-[13px] font-bold text-[#059669]">Emitir Laudo</div>
              <div className="text-[11px] text-[#6B7280] mt-0.5">Finaliza e assina o laudo</div>
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
  onVoltar: () => void;
  onFinalizar: () => void;
  onEditar: () => void;
  onImprimir: () => void;
  onCopiarFormatado: () => void;
  onCopiarTexto: () => void;
};

export function ModoEmitido({ onVoltar, onFinalizar, onEditar, onImprimir, onCopiarFormatado, onCopiarTexto }: ModoEmitidoProps) {
  const [prontuarioOpen, setProntuarioOpen] = useState(false);

  return (
    <div className="px-5 py-4">
      {/* Badge */}
      <div className="bg-gradient-to-r from-[#059669] to-[#047857] text-white text-center py-2.5 rounded-lg font-bold text-sm tracking-wide mb-3">
        🔒 Laudo Emitido
      </div>

      {/* Botões */}
      <div className="flex flex-col gap-2">
        <BtnEmitido onClick={onVoltar} cor="navy">📋 Voltar ao Worklist</BtnEmitido>
        <BtnEmitido onClick={onFinalizar} cor="green">✅ Finalizar Atendimento</BtnEmitido>
        <BtnEmitido onClick={onEditar} cor="amber">✏️ Editar Laudo</BtnEmitido>
        <BtnEmitido onClick={onImprimir} cor="navy">🖨️ Imprimir / PDF</BtnEmitido>

        {/* Copiar para Prontuário */}
        <div className="relative">
          <BtnEmitido onClick={() => setProntuarioOpen(!prontuarioOpen)} cor="navy">
            📋 Copiar para Prontuário {prontuarioOpen ? '▴' : '▾'}
          </BtnEmitido>
          {prontuarioOpen && (
            <div className="mt-1 bg-white border border-[#E5E7EB] rounded-lg shadow-lg overflow-hidden">
              <button onClick={() => { onCopiarFormatado(); setProntuarioOpen(false); }}
                className="w-full flex items-start gap-2.5 px-3.5 py-2.5 cursor-pointer border-b border-[#E5E7EB] hover:bg-[#F9FAFB] transition text-left">
                <span className="text-[15px] shrink-0 pt-0.5">📄</span>
                <div>
                  <div className="text-[12px] font-semibold text-[#111827]">Copiar formatado</div>
                  <div className="text-[10px] text-[#6B7280] mt-0.5">Tasy · MV · Soul · Word · Google Docs</div>
                </div>
              </button>
              <button onClick={() => { onCopiarTexto(); setProntuarioOpen(false); }}
                className="w-full flex items-start gap-2.5 px-3.5 py-2.5 cursor-pointer hover:bg-[#F9FAFB] transition text-left">
                <span className="text-[15px] shrink-0 pt-0.5">📋</span>
                <div>
                  <div className="text-[12px] font-semibold text-[#111827]">Copiar texto simples</div>
                  <div className="text-[10px] text-[#6B7280] mt-0.5">Hapvida · prontuários básicos</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BtnEmitido({ onClick, cor, children }: { onClick: () => void; cor: 'navy' | 'green' | 'amber'; children: React.ReactNode }) {
  const cores = {
    navy: 'border-[#1E3A5F] text-[#1E3A5F] hover:bg-[#1E3A5F]/[.04]',
    green: 'border-[#059669] text-[#059669] hover:bg-[#059669]/[.06]',
    amber: 'border-[#D97706] text-[#D97706] hover:bg-[#D97706]/[.06]',
  };
  return (
    <button onClick={onClick}
      className={`w-full py-2.5 px-3.5 rounded-lg border-[1.5px] bg-white cursor-pointer text-left text-xs font-semibold transition ${cores[cor]}`}>
      {children}
    </button>
  );
}
