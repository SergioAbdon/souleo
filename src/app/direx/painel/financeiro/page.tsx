'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Financeiro — MRR, receita, cancelamentos, exportacao CSV
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { getConfigPlanos, type PlanoConfig } from '@/lib/billing';
import { saveAs } from 'file-saver';
import Link from 'next/link';

type WsData = { id: string; nomeClinica?: string; tipo?: string; ownerUid?: string; [k: string]: unknown };
type SubData = { id: string; workspaceId?: string; tipo?: string; franquiaMensal?: number; franquiaUsada?: number; creditosExtras?: number; cicloFim?: Timestamp; [k: string]: unknown };
type ProfData = { id: string; uid?: string; nome?: string; email?: string; [k: string]: unknown };
type PagData = { id: string; workspaceId?: string; valor?: number; metodo?: string; status?: string; plano?: string; referencia?: string; obs?: string; criadoEm?: Timestamp; [k: string]: unknown };
type ConsumoData = { id: string; workspaceId?: string; pacienteNome?: string; tipoExame?: string; convenio?: string; tipo?: string; reemissao?: boolean; emitidoEm?: Timestamp; [k: string]: unknown };

// ── Helpers ──
function fmtDate(ts: Timestamp | undefined) {
  if (!ts) return '\u2014';
  const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as string);
  return d.toLocaleDateString('pt-BR');
}

function fmtValor(v: number | undefined) {
  if (v == null) return 'R$ 0,00';
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = '\uFEFF';
  const csv = bom + [headers.join(';'), ...rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, filename);
}

function MetricCard({ label, value, sub, cor }: { label: string; value: string | number; sub?: string; cor?: string }) {
  return (
    <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-4">
      <div className="text-[11px] text-[#64748B] uppercase tracking-wider font-semibold mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color: cor || '#F8FAFC' }}>{value}</div>
      {sub && <div className="text-[11px] text-[#64748B] mt-1">{sub}</div>}
    </div>
  );
}

export default function FinanceiroPage() {
  const [loading, setLoading] = useState(true);
  const [wsList, setWsList] = useState<WsData[]>([]);
  const [subsList, setSubsList] = useState<SubData[]>([]);
  const [profsList, setProfsList] = useState<ProfData[]>([]);
  const [pagList, setPagList] = useState<PagData[]>([]);
  const [consumoList, setConsumoList] = useState<ConsumoData[]>([]);
  const [planos, setPlanos] = useState<PlanoConfig[]>([]);

  useEffect(() => {
    (async () => {
      const [wsSnap, subSnap, profSnap, pagSnap, consumoSnap, config] = await Promise.all([
        getDocs(collection(db, 'workspaces')),
        getDocs(collection(db, 'subscriptions')),
        getDocs(collection(db, 'profissionais')),
        getDocs(query(collection(db, 'pagamentos'), orderBy('criadoEm', 'desc'))),
        getDocs(query(collection(db, 'consumo'), orderBy('emitidoEm', 'desc'))),
        getConfigPlanos(),
      ]);
      setWsList(wsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WsData)));
      setSubsList(subSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubData)));
      setProfsList(profSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProfData)));
      setPagList(pagSnap.docs.map(d => ({ id: d.id, ...d.data() } as PagData)));
      setConsumoList(consumoSnap.docs.map(d => ({ id: d.id, ...d.data() } as ConsumoData)));
      setPlanos(config.planos);
      setLoading(false);
    })();
  }, []);

  // ── Calculos ──
  const agora = Date.now();
  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  // MRR: subs pagas ativas × preco
  const subsPagasAtivas = subsList.filter(s => {
    const fim = s.cicloFim?.toDate ? s.cicloFim.toDate() : null;
    return s.tipo === 'paid' && fim && agora <= fim.getTime();
  });
  const mrr = subsPagasAtivas.reduce((total, sub) => {
    const plano = planos.find(p => p.franquia === sub.franquiaMensal);
    return total + (plano?.preco || 0);
  }, 0);

  // Receita do mes
  const pagsMes = pagList.filter(p => {
    const ts = p.criadoEm?.toDate ? p.criadoEm.toDate() : null;
    return ts && ts >= inicioMes && p.status === 'confirmado';
  });
  const receitaMes = pagsMes.reduce((a, p) => a + (p.valor || 0), 0);

  // Cancelamentos: pagas que expiraram
  const cancelamentos = subsList.filter(s => {
    const fim = s.cicloFim?.toDate ? s.cicloFim.toDate() : null;
    return s.tipo === 'paid' && fim && agora > fim.getTime();
  }).length;

  // Ticket medio
  const ticketMedio = pagsMes.length > 0 ? receitaMes / pagsMes.length : 0;

  // Inadimplentes
  const inadimplentes = subsList.filter(s => {
    const fim = s.cicloFim?.toDate ? s.cicloFim.toDate() : null;
    return fim && agora > fim.getTime();
  }).map(s => {
    const ws = wsList.find(w => w.id === s.workspaceId);
    const fim = s.cicloFim!.toDate();
    const diasAtras = Math.ceil((agora - fim.getTime()) / 864e5);
    return { sub: s, ws, diasAtras };
  });

  // ── Exportacoes ──
  function wsNome(wsId: string | undefined) {
    return wsList.find(w => w.id === wsId)?.nomeClinica || wsId || '';
  }
  function ownerNome(ownerUid: string | undefined) {
    return profsList.find(p => p.uid === ownerUid || p.id === ownerUid)?.nome || '';
  }
  function ownerEmail(ownerUid: string | undefined) {
    return profsList.find(p => p.uid === ownerUid || p.id === ownerUid)?.email || '';
  }

  function exportarClientes() {
    const headers = ['Workspace', 'Tipo', 'Dono', 'Email', 'Plano', 'Franquia', 'Usada', 'Creditos', 'Expira', 'Status'];
    const rows = wsList.map(ws => {
      const sub = subsList.find(s => s.workspaceId === ws.id);
      const fim = sub?.cicloFim?.toDate ? sub.cicloFim.toDate() : null;
      const ok = fim && agora <= fim.getTime();
      const status = ok ? (sub?.tipo === 'trial' ? 'Trial' : 'Ativo') : 'Expirado';
      return [
        ws.nomeClinica || ws.id, ws.tipo || '', ownerNome(ws.ownerUid), ownerEmail(ws.ownerUid),
        sub?.tipo || '', String(sub?.franquiaMensal || 0), String(sub?.franquiaUsada || 0),
        String(sub?.creditosExtras || 0), fim ? fim.toLocaleDateString('pt-BR') : '', status,
      ];
    });
    downloadCSV('clientes_leo.csv', headers, rows);
  }

  function exportarPagamentos() {
    const headers = ['Data', 'Workspace', 'Valor', 'Metodo', 'Plano', 'Status', 'Referencia', 'Obs'];
    const rows = pagList.map(p => [
      p.criadoEm?.toDate ? p.criadoEm.toDate().toLocaleDateString('pt-BR') : '',
      wsNome(p.workspaceId), String(p.valor || 0), p.metodo || '', p.plano || '',
      p.status || '', p.referencia || '', p.obs || '',
    ]);
    downloadCSV('pagamentos_leo.csv', headers, rows);
  }

  function exportarConsumo() {
    const headers = ['Data', 'Workspace', 'Paciente', 'Tipo Exame', 'Convenio', 'Tipo', 'Reemissao'];
    const rows = consumoList.map(c => [
      c.emitidoEm?.toDate ? c.emitidoEm.toDate().toLocaleDateString('pt-BR') : '',
      wsNome(c.workspaceId), c.pacienteNome || '', c.tipoExame || '', c.convenio || '',
      c.tipo || '', c.reemissao ? 'Sim' : 'Nao',
    ]);
    downloadCSV('consumo_leo.csv', headers, rows);
  }

  if (loading) return <div className="text-[#64748B] text-sm animate-pulse py-10">Carregando financeiro...</div>;

  return (
    <div>
      <h1 className="text-lg font-bold text-[#F8FAFC] mb-4">Financeiro</h1>

      {/* ── Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        <MetricCard label="MRR" value={fmtValor(mrr)} sub={`${subsPagasAtivas.length} assinante${subsPagasAtivas.length !== 1 ? 's' : ''}`} />
        <MetricCard label="Receita do mes" value={fmtValor(receitaMes)} sub={`${pagsMes.length} pagamento${pagsMes.length !== 1 ? 's' : ''}`} />
        <MetricCard label="Cancelamentos" value={cancelamentos} cor={cancelamentos > 0 ? '#F87171' : undefined} sub={`${cancelamentos} cancelado${cancelamentos !== 1 ? 's' : ''}`} />
        <MetricCard label="Ticket medio" value={fmtValor(ticketMedio)} />
      </div>

      {/* ── Exportacao ── */}
      <div className="mb-6">
        <h2 className="text-sm font-bold text-[#F8FAFC] mb-3">Exportar dados</h2>
        <div className="flex flex-wrap gap-2.5">
          <button onClick={exportarClientes}
            className="px-4 py-2 bg-[#334155] text-[#94A3B8] text-xs font-semibold rounded-md hover:bg-[#475569] hover:text-[#F8FAFC] transition-colors">
            Exportar Clientes (CSV)
          </button>
          <button onClick={exportarPagamentos}
            className="px-4 py-2 bg-[#334155] text-[#94A3B8] text-xs font-semibold rounded-md hover:bg-[#475569] hover:text-[#F8FAFC] transition-colors">
            Exportar Pagamentos (CSV)
          </button>
          <button onClick={exportarConsumo}
            className="px-4 py-2 bg-[#334155] text-[#94A3B8] text-xs font-semibold rounded-md hover:bg-[#475569] hover:text-[#F8FAFC] transition-colors">
            Exportar Consumo (CSV)
          </button>
        </div>
      </div>

      {/* ── Inadimplentes ── */}
      <div>
        <h2 className="text-sm font-bold text-[#F8FAFC] mb-3">Inadimplentes</h2>
        {inadimplentes.length === 0 ? (
          <p className="text-[#64748B] text-sm">Nenhum inadimplente. Boa noticia!</p>
        ) : (
          <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#334155]">
                  {['Workspace', 'Expirou em', 'Dias atras', 'Creditos', 'Acoes'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inadimplentes.map(({ sub, ws, diasAtras }) => (
                  <tr key={sub.id} className="border-b border-[#0F172A] hover:bg-[#0F172A]/50">
                    <td className="px-4 py-2.5 text-[#CBD5E1]">{ws?.nomeClinica || sub.workspaceId}</td>
                    <td className="px-4 py-2.5 text-[#CBD5E1]">{fmtDate(sub.cicloFim)}</td>
                    <td className="px-4 py-2.5 text-[#F87171] font-medium">{diasAtras} dia{diasAtras !== 1 ? 's' : ''}</td>
                    <td className="px-4 py-2.5 text-[#CBD5E1]">{sub.creditosExtras || 0}</td>
                    <td className="px-4 py-2.5">
                      <Link href="/direx/painel/licencas"
                        className="px-3 py-1.5 bg-[#3B82F6] text-white text-[11px] font-semibold rounded-md hover:bg-[#2563EB] transition-colors">
                        Gerenciar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
