'use client';
// ══════════════════════════════════════════════════════════════════
// LEO · AnexarPdfModal — modalidade 'pdf' (ECG/MAPA/Holter/Ergométrico)
//
// Anexa o PDF do aparelho como laudo. Passa pelo MESMO /api/emitir do
// motor de laudo texto/estruturado — decisao 15/08/2026: anexo CONSOME
// franquia (transacao unica de billing/ledger/log no servidor).
// Gate de UI: só entra aqui quem já é assinaComoAutor no Worklist (a
// rota também recusa não-médico com 403 nao_medico, defesa em profundidade).
// ══════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { auth } from '@/lib/firebase';

const LIMITE_BYTES = 10 * 1024 * 1024; // 10MB — mesmo limite do servidor

const MENSAGENS_ERRO: Record<string, string> = {
  pdf_grande: 'PDF maior que 10MB. Reduza o arquivo e tente novamente.',
  nao_e_pdf: 'Arquivo não é um PDF válido.',
  sem_saldo: 'Franquia do mês esgotada. Adquira créditos extras.',
  expirado: 'Seu plano expirou. Renove para continuar emitindo laudos.',
  nao_medico: 'Anexar o PDF é ato do médico.',
  sem_plano: 'Nenhum plano ativo encontrado.',
  exame_de_outro_medico: 'Este exame já tem outro médico como autor.',
  sem_permissao: 'Sem permissão para emitir neste local.',
};

type ExameRef = { id: string; pacienteNome?: string; tipoExame?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  exame: ExameRef | null;
  wsId: string;
  medicoUid: string;
};

export default function AnexarPdfModal({ open, onClose, exame, wsId, medicoUid }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!open || !exame) return null;

  function onSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setErro('');
    if (f && f.size > LIMITE_BYTES) {
      setErro(MENSAGENS_ERRO.pdf_grande);
      setArquivo(null);
      return;
    }
    setArquivo(f);
  }

  async function enviar() {
    if (!arquivo || !exame) return;
    setEnviando(true);
    setErro('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(((reader.result as string) || '').split(',')[1] || '');
        reader.onerror = () => reject(new Error('erro_leitura'));
        reader.readAsDataURL(arquivo);
      });

      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token || ''}` },
        body: JSON.stringify({
          wsId,
          exameId: exame.id,
          medicoUid,
          dadosFinais: {},
          pdfBase64: base64,
          nomeArq: `laudo-${exame.id}`,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErro(MENSAGENS_ERRO[data.motivo as string] || 'Erro ao anexar o PDF. Tente novamente.');
        return;
      }
      alert('PDF anexado — laudo emitido (1 franquia consumida)');
      setArquivo(null);
      onClose();
    } catch {
      setErro('Erro de conexão. Verifique a internet e tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="bg-p1 text-white px-5 py-3 rounded-t-xl">
          <h2 className="font-bold text-sm">📎 Anexar PDF do laudo</h2>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-600">
            {exame.pacienteNome || 'Paciente'}
            {exame.tipoExame ? ` · ${exame.tipoExame}` : ''}
          </p>

          {erro && <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{erro}</div>}

          <input
            type="file"
            accept="application/pdf"
            onChange={onSelecionar}
            className="w-full text-sm border rounded-lg px-3 py-2"
          />
          {arquivo && (
            <p className="text-xs text-gray-500">
              {arquivo.name} · {(arquivo.size / 1024 / 1024).toFixed(2)}MB
            </p>
          )}
          <p className="text-xs text-gray-400">Anexar consome 1 franquia do mês, como emitir um laudo.</p>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm rounded-lg text-gray-600 hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={!arquivo || enviando}
            className="px-4 py-1.5 text-sm rounded-lg bg-p1 text-white font-semibold disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : 'Emitir laudo'}
          </button>
        </div>
      </div>
    </div>
  );
}
