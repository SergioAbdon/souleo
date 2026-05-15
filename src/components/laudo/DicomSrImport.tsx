'use client';
// ════════════════════════════════════════════════════════════════════
// SOULEO · Modal de Importação de Medidas DICOM SR
// ════════════════════════════════════════════════════════════════════
//
// Aberto pelo botão "📡 Importar (N)" no sidebar do laudo. Mostra TODOS
// os inputs mapeáveis (filtra calculados — motor LEO recalcula) com
// checkbox individual. Médico marca/desmarca cada um e clica "Importar"
// — só as selecionadas vão pros campos do motor.
//
// Decisões UX (Sergio, 15/05/2026):
//   - Sugestão B do plano original (checkboxes individuais, não auto-import)
//   - "VALIDA UM A UM" → cada medida tem seu próprio checkbox
//   - Defaults: TODOS marcados (médico geralmente quer tudo)
//   - Após importar: campos do motor preenchidos, médico edita normal
// ════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { InputImport } from '@/lib/dicom-sr-mapping';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Inputs prontos pra import (já filtrados via `normalizarParaImport`). */
  inputs: InputImport[];
  /** Nome do paciente — só pra header informativo. */
  pacienteNome?: string;
  /**
   * Callback ao confirmar importação. Recebe as URLs selecionadas
   * (subset de `inputs`). Caller (page.tsx) chama
   * `window.importarDICOM({ measurements })` com esses valores.
   */
  onImportar: (selecionados: InputImport[]) => void;
};

export default function DicomSrImport({ open, onClose, inputs, pacienteNome, onImportar }: Props) {
  // Default: todas marcadas (médico geralmente quer importar tudo)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  // Reset quando abre — re-marca todas
  useEffect(() => {
    if (open) {
      setMarcadas(new Set(inputs.map((i) => i.key)));
    }
  }, [open, inputs]);

  // ESC fecha
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function toggle(key: string) {
    setMarcadas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function marcarTodas() {
    setMarcadas(new Set(inputs.map((i) => i.key)));
  }

  function limpar() {
    setMarcadas(new Set());
  }

  function confirmar() {
    const sel = inputs.filter((i) => marcadas.has(i.key));
    onImportar(sel);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[1100] bg-black/60 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="bg-[#1E3A5F] text-white px-5 py-3 rounded-t-lg flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              📡 Importar medidas do Vivid
            </h2>
            {pacienteNome && (
              <p className="text-[11px] text-white/70 mt-0.5">{pacienteNome}</p>
            )}
          </div>
          <button
            onClick={onClose}
            title="Fechar (ESC)"
            className="w-8 h-8 rounded-full bg-white/10 text-white text-base hover:bg-red-600 transition flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* DESCRIÇÃO */}
        <div className="px-5 pt-3 pb-2 text-[11px] text-gray-600 border-b border-gray-100 flex-shrink-0">
          Marque quais inputs importar do exame. Valores calculados (FE, Massa,
          Volumes) são <strong>recalculados automaticamente</strong> pelo motor LEO
          a partir desses inputs — não aparecem aqui.
        </div>

        {/* LISTA */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {inputs.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-8">
              Nenhum input mapeável no DICOM SR deste exame.
              <br />
              <span className="text-[11px]">
                (As medidas podem estar lá mas sem mapeamento conhecido — ver
                memória `feedback_dicom_sr_vivid_logica.md`)
              </span>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {inputs.map((it) => {
                const checked = marcadas.has(it.key);
                return (
                  <li key={it.key}>
                    <label
                      className={`flex items-center gap-3 px-3 py-2 rounded border cursor-pointer transition ${
                        checked
                          ? 'bg-blue-50 border-blue-300'
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(it.key)}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                      <span className="flex-1 text-sm text-gray-800">{it.nomePt}</span>
                      <span className="text-sm font-mono font-semibold text-gray-700 whitespace-nowrap">
                        {it.valor.toFixed(2)}
                        <span className="text-[10px] text-gray-500 ml-1 font-normal">{it.unit}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* FOOTER */}
        <div className="border-t border-gray-200 px-5 py-3 flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-gray-600 flex-1">
            {marcadas.size} de {inputs.length} selecionada{marcadas.size === 1 ? '' : 's'}
          </span>
          {inputs.length > 0 && (
            <>
              <button
                onClick={marcarTodas}
                className="text-[11px] px-2.5 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
              >
                Selecionar tudo
              </button>
              <button
                onClick={limpar}
                className="text-[11px] px-2.5 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
              >
                Limpar
              </button>
            </>
          )}
          <button
            onClick={confirmar}
            disabled={marcadas.size === 0}
            className="text-[12px] px-4 py-1.5 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✅ Importar ({marcadas.size})
          </button>
        </div>
      </div>
    </div>
  );
}
