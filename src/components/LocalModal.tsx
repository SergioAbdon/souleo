'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Modal Editar Local de Trabalho
// Campos: nome, slogan, endereço, telefones, logo, cores
// Salva direto no Firestore (workspace)
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { updateWorkspace } from '@/lib/firestore';

const PALETAS = [
  { name: 'Azul LEO', p1: '#1E3A5F', p2: '#2563EB' },
  { name: 'Clássico', p1: '#8B1A1A', p2: '#1E3A5F' },
  { name: 'Verde', p1: '#065F46', p2: '#059669' },
  { name: 'Roxo', p1: '#5B21B6', p2: '#7C3AED' },
  { name: 'Cinza', p1: '#374151', p2: '#6B7280' },
  { name: 'Teal', p1: '#134E4A', p2: '#14B8A6' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export default function LocalModal({ open, onClose, onSaved }: Props) {
  const { workspace } = useAuth();
  const logoRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState('');
  const [slogan, setSlogan] = useState('');
  const [rua, setRua] = useState('');
  const [num, setNum] = useState('');
  const [compl, setCompl] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [cep, setCep] = useState('');
  const [tel, setTel] = useState('');
  const [tel2, setTel2] = useState('');
  const [p1, setP1] = useState('#1E3A5F');
  const [p2, setP2] = useState('#2563EB');
  const [logoB64, setLogoB64] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');

  // Preencher com dados atuais do workspace
  useEffect(() => {
    if (workspace && open) {
      setNome(workspace.nomeClinica as string || '');
      setSlogan(workspace.slogan as string || '');
      setRua(workspace.rua as string || '');
      setNum(workspace.num as string || '');
      setCompl(workspace.compl as string || '');
      setBairro(workspace.bairro as string || '');
      setCidade(workspace.cidade as string || '');
      setUf(workspace.uf as string || '');
      setCep(workspace.cep as string || '');
      setTel(workspace.telefone as string || '');
      setTel2(workspace.telefone2 as string || '');
      setP1(workspace.corPrimaria as string || '#1E3A5F');
      setP2(workspace.corSecundaria as string || '#2563EB');
      setLogoB64(workspace.logoB64 as string || '');
    }
  }, [workspace, open]);

  async function handleSalvar() {
    setErro('');
    if (!nome) { setErro('Nome do local é obrigatório.'); return; }
    if (!workspace?.id) { setErro('Workspace não encontrado.'); return; }

    setLoading(true);
    const endCompleto = [rua + (num ? ' ' + num : ''), compl, bairro, cidade + (uf ? '/' + uf : ''), cep].filter(Boolean).join(' · ');

    const ok = await updateWorkspace(workspace.id, {
      nomeClinica: nome, slogan,
      rua, num, compl, bairro, cidade, uf: uf.toUpperCase(), cep,
      endereco: endCompleto,
      telefone: tel, telefone2: tel2,
      corPrimaria: p1, corSecundaria: p2,
      logoB64
    });

    if (ok) {
      onSaved?.();
      onClose();
    } else {
      setErro('Erro ao salvar. Tente novamente.');
    }
    setLoading(false);
  }

  function handleUploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setErro('Logo máx 2MB.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setLogoB64(ev.target?.result as string || '');
    reader.readAsDataURL(file);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#1E3A5F] text-white px-5 py-3 rounded-t-xl flex items-center justify-between">
          <h2 className="font-bold text-sm">🏥 Editar Local de Trabalho</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-lg">&times;</button>
        </div>

        <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
          {erro && <div className="bg-red-50 text-red-700 text-sm p-2 rounded flex items-center gap-2"><span>⚠️</span>{erro}</div>}

          {/* Nome + Slogan */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nome do local *</label>
              <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Slogan / Subtítulo</label>
              <input type="text" value={slogan} onChange={e => setSlogan(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]"
                placeholder="Consultas e Exames" />
            </div>
          </div>

          {/* Endereço */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Endereço</label>
              <input type="text" value={rua} onChange={e => setRua(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Número</label>
              <input type="text" value={num} onChange={e => setNum(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Complemento</label>
              <input type="text" value={compl} onChange={e => setCompl(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Bairro</label>
              <input type="text" value={bairro} onChange={e => setBairro(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Cidade</label>
              <input type="text" value={cidade} onChange={e => setCidade(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">UF</label>
              <input type="text" value={uf} onChange={e => setUf(e.target.value.toUpperCase())} maxLength={2}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">CEP</label>
              <input type="text" value={cep} onChange={e => setCep(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" placeholder="00000-000" />
            </div>
          </div>

          {/* Telefones */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Telefone 1</label>
              <input type="text" value={tel} onChange={e => setTel(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" placeholder="(00) 00000-0000" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Telefone 2</label>
              <input type="text" value={tel2} onChange={e => setTel2(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" placeholder="(00) 00000-0000" />
            </div>
          </div>

          {/* Logo */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Logo da clínica</label>
            <div className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-[#1E3A5F] transition"
              onClick={() => logoRef.current?.click()}>
              {logoB64 ? (
                <img src={logoB64} alt="Logo" className="max-h-16 mx-auto" />
              ) : (
                <p className="text-gray-400 text-sm">🏥 Clique para upload (PNG/JPG, máx 2MB)</p>
              )}
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleUploadLogo} />
            </div>
            {logoB64 && (
              <button onClick={() => setLogoB64('')} className="text-xs text-red-500 mt-1 hover:underline">Remover logo</button>
            )}
          </div>

          {/* Paleta de cores */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Paleta de cores</label>
            <div className="grid grid-cols-3 gap-2">
              {PALETAS.map(pal => (
                <button key={pal.name}
                  onClick={() => { setP1(pal.p1); setP2(pal.p2); }}
                  className={`flex items-center gap-2 p-2 rounded-lg border-2 transition text-xs font-semibold
                    ${p1 === pal.p1 && p2 === pal.p2 ? 'border-[#1E3A5F] bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <span className="w-4 h-4 rounded" style={{ background: pal.p1 }} />
                  <span className="w-4 h-4 rounded" style={{ background: pal.p2 }} />
                  {pal.name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500">Cor 1:</label>
                <input type="color" value={p1} onChange={e => setP1(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
                <span className="text-xs font-mono text-gray-400">{p1}</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500">Cor 2:</label>
                <input type="color" value={p2} onChange={e => setP2(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
                <span className="text-xs font-mono text-gray-400">{p2}</span>
              </div>
            </div>
          </div>

          {/* Preview cabeçalho */}
          <div className="border rounded-lg p-3 bg-gray-50">
            <p className="text-[10px] text-gray-400 mb-2">Preview do cabeçalho do laudo:</p>
            <div className="flex items-center gap-2 pb-2" style={{ borderBottom: `2.5px solid ${p1}` }}>
              {logoB64 && <img src={logoB64} alt="" className="w-8 h-8 rounded object-contain" />}
              <div>
                <div className="text-sm font-bold" style={{ color: p1 }}>{nome || 'Nome da clínica'}</div>
                <div className="text-[8px] text-gray-400">{slogan}</div>
              </div>
            </div>
            <div className="text-center text-[9px] font-bold mt-1" style={{ color: p1 }}>
              ECOCARDIOGRAMA TRANSTORÁCICO
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSalvar} disabled={loading}
            className="px-6 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg font-semibold hover:bg-[#2563EB] transition disabled:opacity-50">
            {loading ? 'Salvando...' : 'Salvar local'}
          </button>
        </div>
      </div>
    </div>
  );
}
