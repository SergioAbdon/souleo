'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Auditoria — Logs do sistema com filtros
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, limit, Timestamp } from 'firebase/firestore';

type LogData = { id: string; tipo?: string; ts?: Timestamp; medicoUid?: string; wsId?: string; [k: string]: unknown };
type WsData = { id: string; nomeClinica?: string; [k: string]: unknown };

function fmtDate(ts: Timestamp | undefined) {
  if (!ts) return '\u2014';
  const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as string);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function AuditoriaPage() {
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [limite, setLimite] = useState(50);
  const [logs, setLogs] = useState<LogData[]>([]);
  const [wsList, setWsList] = useState<WsData[]>([]);

  async function carregarDados(lim: number) {
    setLoading(true);
    const [logSnap, wsSnap] = await Promise.all([
      getDocs(query(collection(db, 'logs'), orderBy('ts', 'desc'), limit(lim))),
      getDocs(collection(db, 'workspaces')),
    ]);
    setLogs(logSnap.docs.map(d => ({ id: d.id, ...d.data() } as LogData)));
    setWsList(wsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WsData)));
    setLoading(false);
  }

  useEffect(() => { carregarDados(limite); }, [limite]);

  function wsNome(wsId: string | undefined) {
    if (!wsId) return '\u2014';
    return wsList.find(w => w.id === wsId)?.nomeClinica || wsId.substring(0, 12);
  }

  const f = busca.toLowerCase();
  const filtered = f
    ? logs.filter(l => JSON.stringify(l).toLowerCase().includes(f))
    : logs;

  if (loading) return <div className="text-[#64748B] text-sm animate-pulse py-10">Carregando logs...</div>;

  return (
    <div>
      <h1 className="text-lg font-bold text-[#F8FAFC] mb-4">Auditoria</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          placeholder="Filtrar logs..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[200px] max-w-[400px] px-3.5 py-2.5 bg-[#0F172A] border border-[#334155] rounded-lg text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6] placeholder:text-[#64748B]"
        />
        <select value={limite} onChange={e => setLimite(Number(e.target.value))}
          className="px-3.5 py-2.5 bg-[#0F172A] border border-[#334155] rounded-lg text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6]">
          <option value={20}>20 logs</option>
          <option value={50}>50 logs</option>
          <option value={100}>100 logs</option>
          <option value={200}>200 logs</option>
        </select>
      </div>

      <p className="text-[11px] text-[#64748B] mb-3">{filtered.length} registro{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</p>

      {filtered.length === 0 ? (
        <p className="text-[#64748B] text-sm">Nenhum log encontrado.</p>
      ) : (
        <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#334155]">
                {['Data/Hora', 'Tipo', 'UID', 'Workspace', 'Detalhes'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const detalhes = Object.entries(log)
                  .filter(([k]) => !['id', 'tipo', 'ts', 'medicoUid', 'wsId'].includes(k))
                  .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                  .join(', ')
                  .substring(0, 150);

                return (
                  <tr key={log.id} className="border-b border-[#0F172A] hover:bg-[#0F172A]/50">
                    <td className="px-4 py-2.5 text-[#CBD5E1] whitespace-nowrap">{fmtDate(log.ts)}</td>
                    <td className="px-4 py-2.5">
                      <span className="bg-[#334155] text-[#94A3B8] px-2 py-0.5 rounded text-[10px] font-semibold">
                        {log.tipo || '?'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#64748B] text-[10px] font-mono">
                      {(log.medicoUid || '').substring(0, 12)}
                    </td>
                    <td className="px-4 py-2.5 text-[#CBD5E1]">{wsNome(log.wsId)}</td>
                    <td className="px-4 py-2.5 text-[#64748B] text-[11px] max-w-[350px] truncate">{detalhes || '\u2014'}</td>
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
