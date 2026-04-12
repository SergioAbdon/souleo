'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Profissionais — Lista individual com busca
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, Timestamp } from 'firebase/firestore';

type ProfData = { id: string; uid?: string; nome?: string; email?: string; cpf?: string; crm?: string; ufCrm?: string; especialidade?: string; tipoPerfil?: string; criadoEm?: Timestamp; [k: string]: unknown };
type VincData = { id: string; medicoUid?: string; workspaceId?: string; role?: string; status?: string; [k: string]: unknown };
type WsData = { id: string; nomeClinica?: string; [k: string]: unknown };

function Pill({ texto, cor }: { texto: string; cor: 'verde' | 'amarelo' | 'azul' | 'roxo' }) {
  const cls: Record<string, string> = {
    verde: 'bg-[#064E3B] text-[#6EE7B7]', amarelo: 'bg-[#78350F] text-[#FDE68A]',
    azul: 'bg-[#1E3A5F] text-[#93C5FD]', roxo: 'bg-[#4C1D95] text-[#C4B5FD]',
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls[cor]}`}>{texto}</span>;
}

export default function ProfissionaisPage() {
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [profs, setProfs] = useState<ProfData[]>([]);
  const [vincs, setVincs] = useState<VincData[]>([]);
  const [wsList, setWsList] = useState<WsData[]>([]);

  useEffect(() => {
    (async () => {
      const [profSnap, vincSnap, wsSnap] = await Promise.all([
        getDocs(collection(db, 'profissionais')),
        getDocs(collection(db, 'vinculos')),
        getDocs(collection(db, 'workspaces')),
      ]);
      setProfs(profSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProfData)));
      setVincs(vincSnap.docs.map(d => ({ id: d.id, ...d.data() } as VincData)));
      setWsList(wsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WsData)));
      setLoading(false);
    })();
  }, []);

  const f = busca.toLowerCase();
  const filtered = profs.filter(p => {
    if (!f) return true;
    return [p.nome, p.email, p.cpf, p.crm].join(' ').toLowerCase().includes(f);
  });

  function wsDoProf(uid: string) {
    const vincAtivos = vincs.filter(v => (v.medicoUid === uid) && v.status === 'ativo');
    return vincAtivos.map(v => {
      const ws = wsList.find(w => w.id === v.workspaceId);
      return ws?.nomeClinica || v.workspaceId || '';
    }).filter(Boolean);
  }

  function fmtCadastro(ts: Timestamp | undefined) {
    if (!ts) return '\u2014';
    const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as string);
    return d.toLocaleDateString('pt-BR');
  }

  if (loading) return <div className="text-[#64748B] text-sm animate-pulse py-10">Carregando profissionais...</div>;

  return (
    <div>
      <h1 className="text-lg font-bold text-[#F8FAFC] mb-4">Profissionais</h1>
      <input
        placeholder="Buscar por nome, CRM, email ou CPF..."
        value={busca} onChange={e => setBusca(e.target.value)}
        className="w-full max-w-[400px] px-3.5 py-2.5 bg-[#0F172A] border border-[#334155] rounded-lg text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6] mb-4 placeholder:text-[#64748B]"
      />

      {filtered.length === 0 ? (
        <p className="text-[#64748B] text-sm">Nenhum resultado.</p>
      ) : (
        <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#334155]">
                {['Nome', 'Email', 'CRM/UF', 'Especialidade', 'Tipo', 'Cadastro', 'Workspaces'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const wsNames = wsDoProf(p.uid || p.id);
                const tipo = p.tipoPerfil || 'medico';
                return (
                  <tr key={p.id} className="border-b border-[#0F172A] hover:bg-[#0F172A]/50">
                    <td className="px-4 py-2.5 text-[#CBD5E1] font-medium">{p.nome || '\u2014'}</td>
                    <td className="px-4 py-2.5 text-[#64748B] text-[11px]">{p.email || '\u2014'}</td>
                    <td className="px-4 py-2.5 text-[#CBD5E1]">
                      {p.crm ? `${p.crm}/${p.ufCrm || ''}` : '\u2014'}
                    </td>
                    <td className="px-4 py-2.5 text-[#CBD5E1]">{p.especialidade || '\u2014'}</td>
                    <td className="px-4 py-2.5">
                      <Pill texto={tipo} cor={tipo === 'medico' ? 'azul' : 'roxo'} />
                    </td>
                    <td className="px-4 py-2.5 text-[#CBD5E1] whitespace-nowrap">{fmtCadastro(p.criadoEm)}</td>
                    <td className="px-4 py-2.5">
                      {wsNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {wsNames.map((n, i) => (
                            <span key={i} className="bg-[#334155] text-[#94A3B8] px-2 py-0.5 rounded text-[10px]">{n}</span>
                          ))}
                        </div>
                      ) : <span className="text-[#64748B] text-[11px]">Nenhum</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
