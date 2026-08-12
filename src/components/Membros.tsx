'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type Membro = { uid: string; nome: string; papel: string; locais: string[]; status: string };
type Pendente = { token: string; papel: string; locais: string[]; expiraEm: string };

export default function Membros() {
  const { workspace, user } = useAuth();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState('');
  const [papelConvite, setPapelConvite] = useState<'medico' | 'recepcao'>('medico');

  const wsId = workspace?.id;
  const token = useCallback(async () => (await user?.getIdToken()) || '', [user]);

  const carregar = useCallback(async () => {
    if (!wsId) return;
    setLoading(true);
    const res = await fetch(`/api/membros?wsId=${wsId}`, { headers: { Authorization: `Bearer ${await token()}` } });
    const d = await res.json();
    if (d.ok) { setMembros(d.membros); setPendentes(d.pendentes); }
    setLoading(false);
  }, [wsId, token]);

  useEffect(() => { carregar(); }, [carregar]);

  async function convidar() {
    const res = await fetch('/api/convite', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ wsId: workspace!.id, papel: papelConvite, locais: [] }),
    });
    const d = await res.json();
    if (d.ok) { setLink(d.link); carregar(); } else alert('Não foi possível gerar o convite.');
  }

  async function revogar(alvoUid: string) {
    if (!confirm('Remover este membro?')) return;
    const res = await fetch('/api/membro', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ wsId: workspace!.id, alvoUid }),
    });
    const d = await res.json();
    if (d.ok) carregar(); else alert(d.motivo === 'nao_pode_a_si' ? 'Você não pode se remover.' : 'Não foi possível remover.');
  }

  async function cancelarPendente(tok: string) {
    const res = await fetch('/api/convite', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ wsId: workspace!.id, token: tok }),
    });
    if ((await res.json()).ok) carregar();
  }

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Carregando membros...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold text-[#1E3A5F] mb-2">Convidar</h3>
        <div className="flex gap-2 items-center">
          <select value={papelConvite} onChange={e => setPapelConvite(e.target.value as 'medico' | 'recepcao')} className="border rounded-lg px-3 py-2 text-sm">
            <option value="medico">Médico</option>
            <option value="recepcao">Recepção</option>
          </select>
          <button onClick={convidar} className="bg-[#1E3A5F] text-white px-4 py-2 rounded-lg text-sm font-semibold">Gerar link</button>
        </div>
        {link && (
          <div className="mt-2 bg-blue-50 p-3 rounded-lg text-xs break-all">
            <p className="text-gray-500 mb-1">Mande este link no WhatsApp (vale 7 dias, uso único):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1">{link}</code>
              <button onClick={() => navigator.clipboard?.writeText(link)} className="text-blue-600 font-semibold shrink-0">Copiar</button>
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="font-bold text-[#1E3A5F] mb-2">Membros ({membros.length})</h3>
        <div className="space-y-1">
          {membros.map(m => (
            <div key={m.uid} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
              <div><span className="font-semibold">{m.nome}</span> <span className="text-xs text-gray-400 uppercase">· {m.papel}</span></div>
              {m.papel !== 'dono' && <button onClick={() => revogar(m.uid)} className="text-xs text-red-600 hover:underline">Remover</button>}
            </div>
          ))}
        </div>
      </div>

      {pendentes.length > 0 && (
        <div>
          <h3 className="font-bold text-[#1E3A5F] mb-2">Convites pendentes ({pendentes.length})</h3>
          <div className="space-y-1">
            {pendentes.map(p => (
              <div key={p.token} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm bg-amber-50">
                <span className="text-xs">{p.papel === 'medico' ? 'Médico' : 'Recepção'} · expira {new Date(p.expiraEm).toLocaleDateString('pt-BR')}</span>
                <button onClick={() => cancelarPendente(p.token)} className="text-xs text-red-600 hover:underline">Cancelar</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
