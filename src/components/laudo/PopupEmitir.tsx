'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Popup Salvar/Emitir + Modo Emitido + Exportações
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import EditorIcon from './EditorIcon';
import { abrirPdfUrl } from '@/lib/pdfUtils';

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
  /**
   * Tríade onda-4 (Ruflo item 6): última escolha do médico pro toggle
   * "incluir imagens" (`imagensIncluidasNoPdf` na página, persistida em
   * X2/Task 17). Sem isso o popup nascia com o checkbox sempre marcado, TODA
   * vez que reabria — mesmo com o médico tendo desmarcado antes.
   */
  incluirImagensInicial?: boolean;
};

export function PopupSalvarEmitir({ open, onClose, onRascunho, onEmitir, totalImagensSelecionadas = 0, incluirImagensInicial }: Props) {
  // Toggle do checkbox — marcado por default quando há imagens; lembra a
  // última escolha do médico. `useState(incluirImagensInicial)` só lê a prop
  // na 1ª montagem — o componente NÃO desmonta com `open=false` (o pai
  // renderiza `<PopupSalvarEmitir open={...}/>` sempre; `if (!open) return
  // null` abaixo só pula o JSX, a mesma instância/state continua viva).
  // Achado Codex (fix pós-tríade onda-4): sem re-sincronizar, o checkbox
  // ficava no valor da 1ª abertura mesmo depois do onSnapshot trazer a
  // escolha persistida, ou o médico navegar pra outro exame na mesma
  // instância da página.
  const [incluirImagens, setIncluirImagens] = useState(incluirImagensInicial ?? true);
  useEffect(() => {
    if (open) setIncluirImagens(incluirImagensInicial ?? true);
  }, [open, incluirImagensInicial]);
  // S5-T12: valor derivado (sem setState-no-render) — sem imagens pra
  // selecionar, o efetivo é sempre false, mesmo que `incluirImagens` (o
  // toggle memorizado) ainda esteja true de uma sessão anterior.
  const incluirEfetivo = totalImagensSelecionadas > 0 && incluirImagens;

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
          <button onClick={() => onEmitir(incluirEfetivo)}
            className="flex items-center gap-3.5 p-3.5 rounded-[10px] border-[1.5px] border-[#059669] bg-white cursor-pointer text-left hover:border-[#059669] hover:bg-[#059669]/[.06] transition">
            <span className="text-[22px]">✅</span>
            <div>
              <div className="text-[13px] font-bold text-[#059669]">Emitir Laudo</div>
              <div className="text-[11px] text-[#6B7280] mt-0.5">
                {incluirEfetivo
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
  /**
   * URL do PDF ASSINADO (Storage) desta emissão. Quando presente, o botão
   * primário "🖨️ PDF" abre ELE (mesmo documento que o paciente recebeu) em
   * vez de gerar um PDF novo com a config/imagens atuais do local — Task 17
   * (X4). Sem `pdfUrl` (falha de geração ou laudo legado), o primário cai
   * de volta pro `onImprimir` de sempre.
   */
  pdfUrl?: string;
};

export function ModoEmitido({ onFinalizar, onEditar, onImprimir, onCopiarFormatado, onCopiarTexto, onBaixarWord, pdfUrl }: ModoEmitidoProps) {
  const [prontuarioOpen, setProntuarioOpen] = useState(false);
  const abrirAssinado = pdfUrl ? () => abrirPdfUrl(pdfUrl) : onImprimir;

  // Spec 2026-10-11-coluna-laudo-unificada: duas linhas dentro da coluna de
  // 390px — selo + PDF + Copiar + Editar, e Finalizar na largura inteira.
  // Renderiza dentro da .laudo-command-line (flex-wrap), por isso "contents".
  return (
    <div className="contents">
      <span className="laudo-emitido-selo"><EditorIcon name="lock" /> Emitido</span>
      <button onClick={abrirAssinado} className="laudo-command-secondary laudo-command-ajustavel"><EditorIcon name="file" /> PDF</button>
      <button onClick={() => setProntuarioOpen(!prontuarioOpen)} aria-expanded={prontuarioOpen}
        className="laudo-command-secondary laudo-command-ajustavel"><EditorIcon name="copy" /> Copiar</button>
      <button onClick={onEditar} className="laudo-command-secondary laudo-command-ajustavel"><EditorIcon name="edit" /> Editar</button>
      <button onClick={onFinalizar} className="laudo-command-primary w-full"><EditorIcon name="check" /> Finalizar</button>

      {/* Ação secundária: regerar com dados/config ATUAIS do local (pode
          divergir do assinado se a clínica mudou config, ou o médico
          reeditou as imagens selecionadas depois de emitir). Só aparece
          quando há um assinado pra distinguir do primário — sem `pdfUrl` o
          primário já É esta mesma ação. */}
      {pdfUrl && (
        <button onClick={onImprimir}
          className="w-full bg-transparent border-none text-[11px] text-[#526277] hover:text-[#1E3A5F] cursor-pointer underline decoration-dotted underline-offset-2">
          Gerar novamente (dados atuais do local)
        </button>
      )}

      {/* Submenu copiar */}
      {prontuarioOpen && (
        <div className="w-full overflow-hidden rounded-lg border border-[#D6E2F1] bg-white text-[12px] text-[#1E3A5F]">
          <button onClick={() => { onCopiarFormatado(); setProntuarioOpen(false); }}
            className="w-full px-3 py-2 text-left hover:bg-[#F1F5F9] transition border-b border-[#D6E2F1] cursor-pointer">
            Formatado <span className="text-[#526277]">· Tasy, MV, Word</span>
          </button>
          <button onClick={() => { onCopiarTexto(); setProntuarioOpen(false); }}
            className="w-full px-3 py-2 text-left hover:bg-[#F1F5F9] transition border-b border-[#D6E2F1] cursor-pointer">
            Texto simples <span className="text-[#526277]">· Hapvida</span>
          </button>
          {onBaixarWord && (
            <button onClick={() => { onBaixarWord(); setProntuarioOpen(false); }}
              className="w-full px-3 py-2 text-left hover:bg-[#F1F5F9] transition cursor-pointer">
              Word (.docx)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
