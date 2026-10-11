'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Modal Editar Perfil
// Campos: nome, tipo, CRM, UF, RQE, telefone, especialidade, assinatura
// Salva direto no Firestore
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { updateProfile } from '@/lib/firestore';
import { auth } from '@/lib/firebase';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function PerfilModal({ open, onClose }: Props) {
  const { profile, reloadProfile } = useAuth();

  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('medico');
  const [crm, setCrm] = useState('');
  const [uf, setUf] = useState('');
  const [rqe, setRqe] = useState('');
  const [tel, setTel] = useState('');
  const [titulo, setTitulo] = useState('');
  const [sigB64, setSigB64] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Preencher com dados atuais
  useEffect(() => {
    if (profile && open) {
      setNome(profile.nome as string || '');
      setTipo(profile.tipoPerfil as string || 'medico');
      setCrm(profile.crm as string || '');
      setUf(profile.ufCrm as string || '');
      setRqe(profile.rqe as string || '');
      setTel(profile.telefone as string || '');
      setTitulo(profile.especialidade as string || profile.titulo as string || '');
      setSigB64(profile.sigB64 as string || '');
    }
  }, [profile, open]);

  async function handleSalvar() {
    setErro('');
    if (!nome) { setErro('Nome é obrigatório.'); return; }
    if (tipo === 'medico' && (!crm || !uf)) { setErro('CRM e UF são obrigatórios para médicos.'); return; }

    setLoading(true);
    const uid = auth.currentUser?.uid;
    if (!uid) { setErro('Usuário não autenticado.'); setLoading(false); return; }

    const ok = await updateProfile(uid, {
      nome, crm, ufCrm: uf.toUpperCase(), rqe,
      especialidade: titulo, titulo,
      telefone: tel, tipoPerfil: tipo,
      sigB64
    });

    if (ok) {
      await reloadProfile();
      onClose();
    } else {
      setErro('Erro ao salvar. Tente novamente.');
    }
    setLoading(false);
  }

  function handleUploadSig(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setErro('Assinatura máx 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setSigB64(ev.target?.result as string || '');
    reader.readAsDataURL(file);
  }

  if (!open) return null;

  const ehMedico = tipo === 'medico';

  return (
    <div className="fixed inset-0 bg-[#1E3A5F]/35 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[calc(100dvh-2rem)] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#EAF1FA] text-[#1E3A5F] px-6 py-5 rounded-t-xl border-b border-[#D6E2F1] flex items-center justify-between">
          <h2 className="font-semibold text-lg">Editar perfil</h2>
          <button onClick={onClose} aria-label="Fechar perfil" className="text-[#526277] hover:text-[#1E3A5F] text-2xl px-2">&times;</button>
        </div>

        <div className="p-6 space-y-5 min-h-0 overflow-y-auto">
          {erro && <div className="bg-red-50 text-red-700 text-sm p-2 rounded flex items-center gap-2"><span>⚠️</span>{erro}</div>}

          {/* Nome */}
          <h3 className="text-sm font-semibold text-[#1E3A5F]">Dados pessoais</h3>
          <div>
            <label className="block text-sm font-medium text-[#526277] mb-2">Nome completo *</label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)}
              className="w-full min-w-0 border border-[#D5DFEB] rounded-lg px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-2 focus:outline-offset-2 focus:outline-[#2563EB]" />
          </div>

            <div>
              <label className="block text-sm font-medium text-[#526277] mb-2">Telefone</label>
              <input type="text" value={tel} onChange={e => setTel(e.target.value)} placeholder="(00) 00000-0000"
                className="w-full min-w-0 border border-[#D5DFEB] rounded-lg px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-2 focus:outline-offset-2 focus:outline-[#2563EB]" />
            </div>

          {/* Tipo */}
          <h3 className="text-sm font-semibold text-[#1E3A5F] border-t border-[#E2E8F0] pt-5">Identificação profissional</h3>
          <div>
            <label className="block text-sm font-medium text-[#526277] mb-2">Tipo de profissional</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              className="w-full min-w-0 border border-[#D5DFEB] rounded-lg px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-2 focus:outline-offset-2 focus:outline-[#2563EB]">
              <option value="medico">Médico</option>
              <option value="assistente">Assistente</option>
            </select>
          </div>

          {/* CRM + UF + RQE */}
          {ehMedico && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-[#526277] mb-2">CRM *</label>
                <input type="text" value={crm} onChange={e => setCrm(e.target.value)}
                  className="w-full min-w-0 border border-[#D5DFEB] rounded-lg px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-2 focus:outline-offset-2 focus:outline-[#2563EB]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#526277] mb-2">UF *</label>
                <input type="text" value={uf} onChange={e => setUf(e.target.value.toUpperCase())} maxLength={2}
                  className="w-full min-w-0 border border-[#D5DFEB] rounded-lg px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-2 focus:outline-offset-2 focus:outline-[#2563EB]" placeholder="PA" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#526277] mb-2">RQE</label>
                <input type="text" value={rqe} onChange={e => setRqe(e.target.value)}
                  className="w-full min-w-0 border border-[#D5DFEB] rounded-lg px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-2 focus:outline-offset-2 focus:outline-[#2563EB]" />
              </div>
            </div>
          )}

          {/* Especialidade */}
          <div className="grid gap-5">

            <div>
              <label className="block text-sm font-medium text-[#526277] mb-2">Especialidade</label>
              <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)}
                className="w-full min-w-0 border border-[#D5DFEB] rounded-lg px-3 py-2.5 text-sm text-[#1E3A5F] focus:outline-2 focus:outline-offset-2 focus:outline-[#2563EB]"
                placeholder="Cardiologia e Ecocardiografia" />
            </div>
          </div>

          {/* Assinatura */}
          <div>
            <label className="block text-sm font-medium text-[#526277] mb-2">Assinatura digital</label>
            <div className="border border-dashed border-[#CFDAEA] rounded-lg p-6 text-center cursor-pointer hover:border-[#1E3A5F] transition"
              onClick={() => fileRef.current?.click()}>
              {sigB64 ? (
                <img src={sigB64} alt="Assinatura" className="max-h-16 mx-auto" />
              ) : (
                <p className="text-[#526277] text-sm"> Clique para upload (PNG, máx 2MB)</p>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUploadSig} />
            </div>
            {sigB64 && (
              <button onClick={() => setSigB64('')} className="text-xs text-red-500 mt-1 hover:underline">Remover assinatura</button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#E2E8F0] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSalvar} disabled={loading}
            className="px-6 py-2 text-sm bg-[#2563EB] text-white rounded-lg font-semibold hover:bg-[#1D4ED8] transition disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar perfil'}
          </button>
        </div>
      </div>
    </div>
  );
}
