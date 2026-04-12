'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Clientes — Lista de workspaces com busca
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, Timestamp } from 'firebase/firestore';

type WsData = { id: string; nomeClinica?: string; tipo?: string; ownerUid?: string; empresaId?: string; [k: string]: unknown };
type SubData = { id: string; workspaceId?: string; tipo?: string; franquiaMensal?: number; franquiaUsada?: number; creditosExtras?: number; cicloFim?: Timestamp; [k: string]: unknown };
type ProfData = { id: string; uid?: string; nome?: string; email?: string; cpf?: string; [k: string]: unknown };
type EmpData = { id: string; cnpj?: string; razaoSocial?: string; nomeFantasia?: string; [k: string]: unknown };

function Pill({ texto, cor }: { texto: string; cor: 'verde' | 'amarelo' | 'vermelho' | 'azul' | 'roxo' }) {
  const cls: Record<string, string> = {
    verde: 'bg-[#064E3B] text-[#6EE7B7]', amarelo: 'bg-[#78350F] text-[#FDE68A]',
    vermelho: 'bg-[#7F1D1D] text-[#FCA5A5]', azul: 'bg-[#1E3A5F] text-[#93C5FD]', roxo: 'bg-[#4C1D95] text-[#C4B5FD]',
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls[cor]}`}>{texto}</span>;
}

export default function ClientesPage() {
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [wsList, setWsList] = useState<WsData[]>([]);
  const [subsList, setSubsList] = useState<SubData[]>([]);
  const [profsList, setProfsList] = useState<ProfData[]>([]);
  const [empList, setEmpList] = useState<EmpData[]>([]);

  useEffect(() => {
    (async () => {
      const [wsSnap, subSnap, profSnap, empSnap] = await Promise.all([
        getDocs(collection(db, 'workspaces')),
        getDocs(collection(db, 'subscriptions')),
        getDocs(collection(db, 'profissionais')),
        getDocs(collection(db, 'empresas')),
      ]);
      setWsList(wsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WsData)));
      setSubsList(subSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubData)));
      setProfsList(profSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProfData)));
      setEmpList(empSnap.docs.map(d => ({ id: d.id, ...d.data() } as EmpData)));
      setLoading(false);
    })();
  }, []);

  const f = busca.toLowerCase();
  const rows = wsList.map(ws => {
    const sub = subsList.find(s => s.workspaceId === ws.id);
    const owner = profsList.find(p => p.uid === ws.ownerUid || p.id === ws.ownerUid);
    const emp = ws.empresaId ? empList.find(e => e.id === ws.empresaId) : null;
    return { ws, sub, owner, emp };
  }).filter(r => {
    if (!f) return true;
    return [r.ws.nomeClinica, r.owner?.nome, r.owner?.cpf, r.owner?.email, r.emp?.cnpj, r.emp?.razaoSocial]
      .join(' ').toLowerCase().includes(f);
  });

  if (loading) return <div className="text-[#64748B] text-sm animate-pulse py-10">Carregando clientes...</div>;

  return (
    <div>
      <h1 className="text-lg font-bold text-[#F8FAFC] mb-4">Clientes</h1>
      <input
        placeholder="Buscar por nome, CPF, CNPJ ou email..."
        value={busca} onChange={e => setBusca(e.target.value)}
        className="w-full max-w-[400px] px-3.5 py-2.5 bg-[#0F172A] border border-[#334155] rounded-lg text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6] mb-4 placeholder:text-[#64748B]"
      />

      {rows.length === 0 ? (
        <p className="text-[#64748B] text-sm">Nenhum resultado.</p>
      ) : (
        <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#334155]">
                {['Workspace', 'Tipo', 'Dono', 'Plano', 'Uso', 'Expira', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ ws, sub, owner }) => {
                const fim = sub?.cicloFim?.toDate ? sub.cicloFim.toDate() : null;
                const ok = fim && Date.now() <= fim.getTime();
                const stTxt = ok ? (sub?.tipo === 'trial' ? 'Trial' : 'Ativo') : 'Expirado';
                const stCor = ok ? (sub?.tipo === 'trial' ? 'amarelo' : 'verde') : 'vermelho';
                const uso = sub ? `${sub.franquiaUsada || 0}/${sub.franquiaMensal || 0}` : '\u2014';
                return (
                  <tr key={ws.id} className="border-b border-[#0F172A] hover:bg-[#0F172A]/50">
                    <td className="px-4 py-2.5 text-[#CBD5E1]">{ws.nomeClinica || ws.id}</td>
                    <td className="px-4 py-2.5"><Pill texto={ws.tipo || '?'} cor={ws.tipo === 'PF' ? 'azul' : 'roxo'} /></td>
                    <td className="px-4 py-2.5">
                      <span className="text-[#CBD5E1]">{owner?.nome || '\u2014'}</span>
                      <br /><span className="text-[10px] text-[#64748B]">{owner?.email || ''}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[#CBD5E1]">{sub?.tipo || '\u2014'}</td>
                    <td className="px-4 py-2.5 text-[#CBD5E1]">
                      {uso} {sub?.creditosExtras ? <span className="text-[#64748B]">(+{sub.creditosExtras})</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-[#CBD5E1]">{fim ? fim.toLocaleDateString('pt-BR') : '\u2014'}</td>
                    <td className="px-4 py-2.5"><Pill texto={stTxt} cor={stCor as 'verde' | 'amarelo' | 'vermelho'} /></td>
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
