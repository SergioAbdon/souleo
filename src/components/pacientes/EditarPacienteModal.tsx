'use client';
// ══════════════════════════════════════════════════════════════════
// LEO · EditarPacienteModal — editar cadastro a partir da ficha do
// paciente (Sub-plano 4, Task 3; revisão final Fix 2).
//
// Mesmos campos e mesmas defesas do modal de paciente da Worklist
// (handleSalvarPaciente): nome obrigatório (trim + UPPERCASE), CPF
// (só dígitos) e telefone gravados SOMENTE se preenchidos — #7c: CPF
// é a chave de pareamento DICOM, esvaziar o campo aqui NÃO apaga o
// valor já gravado.
//
// Decisão do produto (revisão final): salvar a ficha também corrige
// nome/CPF nos exames do paciente ainda NÃO emitidos — mesmo modelo do
// Worklist (S2-T3): ficha + exames na MESMA writeBatch, pra não repetir
// o bug antigo de "ficha salvou, exame não, tela não avisou nada".
// Exame emitido NUNCA é tocado — o PDF já assinado guarda o nome histórico.
// `cancelado` também fica de fora: a regra do Firestore nega update em
// exame cancelado (status resultante != 'cancelado' é exigido), incluí-lo
// no batch derrubaria a gravação inteira.

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';

type Paciente = Record<string, unknown> & {
  id: string; nome?: string; cpf?: string; dtnasc?: string;
  sexo?: string; telefone?: string; convenio?: string;
};

type ExameRef = { id: string; status?: string };

type Props = {
  open: boolean;
  onClose: () => void;
  wsId: string;
  paciente: Paciente | null;
  exames: ExameRef[];
  onSaved: () => void;
};

export default function EditarPacienteModal({ open, onClose, wsId, paciente, exames, onSaved }: Props) {
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [dtnasc, setDtnasc] = useState('');
  const [sexo, setSexo] = useState('');
  const [telefone, setTelefone] = useState('');
  const [convenio, setConvenio] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  // Preencher com os dados atuais do paciente (`dtnasc` é a única chave
  // real de nascimento — ver Fix 1 da revisão final).
  useEffect(() => {
    if (paciente && open) {
      setNome(paciente.nome || '');
      setCpf(paciente.cpf || '');
      setDtnasc(paciente.dtnasc || '');
      setSexo(paciente.sexo || '');
      setTelefone(paciente.telefone || '');
      setConvenio(paciente.convenio || '');
      setErro('');
    }
  }, [paciente, open]);

  async function handleSalvar() {
    setErro('');
    if (!nome.trim()) { setErro('Nome é obrigatório.'); return; }
    if (!wsId || !paciente?.id) { setErro('Paciente não encontrado.'); return; }

    setLoading(true);
    const nomeSalvo = nome.trim().toUpperCase();
    const cpfLimpo = cpf.replace(/\D/g, '');

    const dadosFicha: Record<string, unknown> = {
      nome: nomeSalvo, dtnasc, sexo, convenio,
      atualizadoEm: serverTimestamp(),
    };
    // #7c defensivo: NÃO regravar cpf/telefone vazios por cima do valor
    // existente — esvaziar o campo aqui não apaga o que já está salvo.
    if (cpfLimpo) dadosFicha.cpf = cpfLimpo;
    if (telefone) dadosFicha.telefone = telefone;

    // Propagação pros exames ABERTOS do paciente (Fix 2): nome sempre,
    // CPF só se preenchido — mesma defesa #7c. `telefone` não existe no
    // exame (não está na whitelist de campos administrativos da regra),
    // então não propaga. Emitido nunca é tocado; cancelado é excluído
    // porque a regra recusa update de exame cancelado (derrubaria o batch).
    const dadosExame: Record<string, unknown> = {
      pacienteNome: nomeSalvo,
      atualizadoEm: serverTimestamp(),
    };
    if (cpfLimpo) dadosExame.cpf = cpfLimpo;
    const abertos = exames.filter(e => e.status !== 'emitido' && e.status !== 'cancelado');

    // ponytail: writeBatch aceita até 500 writes; aqui é `abertos.length + 1`
    // (ficha + exames abertos de UM paciente) — praticamente inatingível, e
    // se estourar falha fechado no catch abaixo (nada é gravado). Se um dia
    // um paciente tiver 500+ exames abertos, dividir `abertos` em lotes de
    // 499 e commitar em sequência.
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'workspaces', wsId, 'pacientes', paciente.id), dadosFicha);
      for (const ex of abertos) {
        batch.update(doc(db, 'workspaces', wsId, 'exames', ex.id), dadosExame);
      }
      await batch.commit();
    } catch (e) {
      console.error('editar paciente:', e);
      // Fix D: batch pode falhar por escrita negada em outra aba (exame
      // emitido/cancelado entre o load da ficha e este salvar) — a régua
      // é "tudo ou nada", então o usuário precisa recarregar pra ver o
      // estado atual antes de tentar de novo, não só re-clicar Salvar.
      setErro('Não foi possível salvar a alteração. Nada foi gravado. Recarregue a página e tente novamente. (Detalhe no Console — F12.)');
      setLoading(false);
      return;
    }

    setLoading(false);
    onSaved();
    onClose();
  }

  if (!open || !paciente) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="bg-p1 text-white px-5 py-3 rounded-t-xl">
          <h2 className="font-bold text-sm">✏️ Editar cadastro</h2>
        </div>

        <div className="p-5 space-y-3">
          {erro && <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{erro}</div>}

          <div>
            <label className="block text-xs font-semibold text-ink-3 uppercase mb-1">Nome completo *</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)}
              className="w-full border border-borda rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-3 uppercase mb-1">CPF</label>
              <input type="text" value={cpf} onChange={e => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full border border-borda rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-3 uppercase mb-1">Sexo</label>
              <select value={sexo} onChange={e => setSexo(e.target.value)}
                className="w-full border border-borda rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1">
                <option value="">—</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-3 uppercase mb-1">Nascimento</label>
              <input type="date" value={dtnasc} onChange={e => setDtnasc(e.target.value)}
                className="w-full border border-borda rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-3 uppercase mb-1">Telefone</label>
              <input type="text" value={telefone} onChange={e => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
                className="w-full border border-borda rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-3 uppercase mb-1">Convênio</label>
              <input type="text" value={convenio} onChange={e => setConvenio(e.target.value)}
                className="w-full border border-borda rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1" />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-borda flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-ink-2 border border-borda rounded-lg hover:bg-ativo">Cancelar</button>
          <button onClick={handleSalvar} disabled={loading}
            className="px-6 py-2 text-sm bg-p2 text-white rounded-lg font-semibold hover:bg-p2-deep transition disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
