'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Pagamentos — Historico, registrar manual, metricas
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { registrarPagamento } from '@/lib/billing';
import { useDirexAuth } from '@/contexts/DirexAuthContext';

type WsData = { id: string; nomeClinica?: string; [k: string]: unknown };
type SubData = { id: string; workspaceId?: string; franquiaMensal?: number; franquiaUsada?: number; creditosExtras?: number; cicloFim?: Timestamp; [k: string]: unknown };
type PagData = { id: string; workspaceId?: string; valor?: number; metodo?: string; status?: string; plano?: string; referencia?: string; obs?: string; criadoEm?: Timestamp; [k: string]: unknown };

function Pill({ texto, cor }: { texto: string; cor: 'verde' | 'amarelo' | 'vermelho' | 'azul' }) {
  const cls: Record<string, string> = {
    verde: 'bg-[#064E3B] text-[#6EE7B7]', amarelo: 'bg-[#78350F] text-[#FDE68A]',
    vermelho: 'bg-[#7F1D1D] text-[#FCA5A5]', azul: 'bg-[#1E3A5F] text-[#93C5FD]',
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls[cor]}`}>{texto}</span>;
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

type ModalPag = {
  open: boolean;
  workspaceId: string;
  valor: string;
  metodo: 'pix' | 'cartao' | 'transferencia' | 'cortesia';
  plano: string;
  referencia: string;
  obs: string;
};

export default function PagamentosPage() {
  const { profile } = useDirexAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wsList, setWsList] = useState<WsData[]>([]);
  const [subsList, setSubsList] = useState<SubData[]>([]);
  const [pagList, setPagList] = useState<PagData[]>([]);
  const [filtroWs, setFiltroWs] = useState('');

  const [modal, setModal] = useState<ModalPag>({
    open: false, workspaceId: '', valor: '', metodo: 'pix', plano: '', referencia: '', obs: '',
  });

  async function carregarDados() {
    const [wsSnap, subSnap, pagSnap] = await Promise.all([
      getDocs(collection(db, 'workspaces')),
      getDocs(collection(db, 'subscriptions')),
      getDocs(query(collection(db, 'pagamentos'), orderBy('criadoEm', 'desc'))),
    ]);
    setWsList(wsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WsData)));
    setSubsList(subSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubData)));
    setPagList(pagSnap.docs.map(d => ({ id: d.id, ...d.data() } as PagData)));
    setLoading(false);
  }

  useEffect(() => { carregarDados(); }, []);

  // Metricas
  const totalFranquia = subsList.reduce((a, s) => a + (s.franquiaMensal || 0), 0);
  const totalUsada = subsList.reduce((a, s) => a + (s.franquiaUsada || 0), 0);
  const totalCreditos = subsList.reduce((a, s) => a + (s.creditosExtras || 0), 0);
  const inadimplentes = subsList.filter(s => {
    const fim = s.cicloFim?.toDate ? s.cicloFim.toDate() : null;
    return fim && Date.now() > fim.getTime();
  }).length;
  const pctUso = totalFranquia > 0 ? Math.round((totalUsada / totalFranquia) * 100) : 0;

  // Filtrar pagamentos
  const pagFiltrados = filtroWs ? pagList.filter(p => p.workspaceId === filtroWs) : pagList;

  function fmtDate(ts: Timestamp | undefined) {
    if (!ts) return '\u2014';
    const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as string);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtValor(v: number | undefined) {
    if (v == null) return '\u2014';
    return `R$ ${v.toFixed(2).replace('.', ',')}`;
  }

  function wsNome(wsId: string | undefined) {
    if (!wsId) return '\u2014';
    return wsList.find(w => w.id === wsId)?.nomeClinica || wsId;
  }

  async function salvarPagamento() {
    if (!modal.workspaceId || !modal.valor) return;
    setSaving(true);
    try {
      await registrarPagamento({
        workspaceId: modal.workspaceId,
        valor: parseFloat(modal.valor) || 0,
        metodo: modal.metodo,
        status: 'confirmado',
        gateway: 'manual',
        plano: modal.plano,
        referencia: modal.referencia,
        registradoPor: profile?.id || 'admin',
        obs: modal.obs,
      });
      setModal({ open: false, workspaceId: '', valor: '', metodo: 'pix', plano: '', referencia: '', obs: '' });
      await carregarDados();
    } catch (e) { console.error('salvarPagamento:', e); }
    setSaving(false);
  }

  if (loading) return <div className="text-[#64748B] text-sm animate-pulse py-10">Carregando pagamentos...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-[#F8FAFC]">Pagamentos</h1>
        <button onClick={() => setModal(m => ({ ...m, open: true }))}
          className="px-4 py-2 bg-[#3B82F6] text-white text-xs font-semibold rounded-md hover:bg-[#2563EB] transition-colors">
          + Registrar pagamento
        </button>
      </div>

      {/* ── Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        <MetricCard label="Franquia total" value={totalFranquia} sub="laudos/mes (todos)" />
        <MetricCard label="Consumida" value={totalUsada} sub={`${pctUso}% utilizado`} />
        <MetricCard label="Creditos extras" value={totalCreditos} />
        <MetricCard label="Inadimplentes" value={inadimplentes} cor={inadimplentes > 0 ? '#F87171' : undefined} />
      </div>

      {/* ── Filtro ── */}
      <div className="mb-4">
        <select value={filtroWs} onChange={e => setFiltroWs(e.target.value)}
          className="px-3.5 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6]">
          <option value="">Todos os workspaces</option>
          {wsList.map(w => <option key={w.id} value={w.id}>{w.nomeClinica || w.id}</option>)}
        </select>
      </div>

      {/* ── Tabela historico ── */}
      {pagFiltrados.length === 0 ? (
        <p className="text-[#64748B] text-sm">Nenhum pagamento registrado.</p>
      ) : (
        <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#334155]">
                {['Data', 'Workspace', 'Valor', 'Metodo', 'Plano', 'Status', 'Obs'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagFiltrados.map(p => {
                const stCor = p.status === 'confirmado' ? 'verde' : p.status === 'pendente' ? 'amarelo' : 'vermelho';
                return (
                  <tr key={p.id} className="border-b border-[#0F172A] hover:bg-[#0F172A]/50">
                    <td className="px-4 py-2.5 text-[#CBD5E1] whitespace-nowrap">{fmtDate(p.criadoEm)}</td>
                    <td className="px-4 py-2.5 text-[#CBD5E1]">{wsNome(p.workspaceId)}</td>
                    <td className="px-4 py-2.5 text-[#F8FAFC] font-medium">{fmtValor(p.valor)}</td>
                    <td className="px-4 py-2.5"><Pill texto={p.metodo || '?'} cor="azul" /></td>
                    <td className="px-4 py-2.5 text-[#CBD5E1]">{p.plano || '\u2014'}</td>
                    <td className="px-4 py-2.5"><Pill texto={p.status || '?'} cor={stCor as 'verde' | 'amarelo' | 'vermelho'} /></td>
                    <td className="px-4 py-2.5 text-[#64748B] text-[11px] max-w-[200px] truncate">{p.obs || '\u2014'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal Registrar Pagamento ── */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setModal(m => ({ ...m, open: false }))}>
          <div className="bg-[#1E293B] rounded-xl p-6 max-w-[440px] w-[90%]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#F8FAFC] mb-4">Registrar pagamento</h3>

            <label className="text-[12px] text-[#94A3B8] block mb-1">Workspace</label>
            <select value={modal.workspaceId} onChange={e => setModal(m => ({ ...m, workspaceId: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none">
              <option value="">Selecione...</option>
              {wsList.map(w => <option key={w.id} value={w.id}>{w.nomeClinica || w.id}</option>)}
            </select>

            <label className="text-[12px] text-[#94A3B8] block mb-1">Valor (R$)</label>
            <input type="number" step="0.01" value={modal.valor} onChange={e => setModal(m => ({ ...m, valor: e.target.value }))}
              placeholder="189.99"
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none placeholder:text-[#64748B]" />

            <label className="text-[12px] text-[#94A3B8] block mb-1">Metodo</label>
            <select value={modal.metodo} onChange={e => setModal(m => ({ ...m, metodo: e.target.value as ModalPag['metodo'] }))}
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none">
              <option value="pix">Pix</option>
              <option value="cartao">Cartao</option>
              <option value="transferencia">Transferencia</option>
              <option value="cortesia">Cortesia</option>
            </select>

            <label className="text-[12px] text-[#94A3B8] block mb-1">Plano</label>
            <select value={modal.plano} onChange={e => setModal(m => ({ ...m, plano: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none">
              <option value="">Selecione...</option>
              <option value="basic">Basic</option>
              <option value="profissional">Profissional</option>
              <option value="expert">Expert</option>
            </select>

            <label className="text-[12px] text-[#94A3B8] block mb-1">Referencia (mes/ano)</label>
            <input value={modal.referencia} onChange={e => setModal(m => ({ ...m, referencia: e.target.value }))}
              placeholder="04/2026"
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none placeholder:text-[#64748B]" />

            <label className="text-[12px] text-[#94A3B8] block mb-1">Observacao</label>
            <input value={modal.obs} onChange={e => setModal(m => ({ ...m, obs: e.target.value }))}
              placeholder="Opcional"
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-4 outline-none placeholder:text-[#64748B]" />

            <div className="flex gap-2.5">
              <button onClick={() => setModal(m => ({ ...m, open: false }))}
                className="px-4 py-2 border border-[#475569] text-[#94A3B8] text-xs font-semibold rounded-md hover:bg-[#334155] transition-colors">
                Cancelar
              </button>
              <button onClick={salvarPagamento} disabled={saving || !modal.workspaceId || !modal.valor}
                className="px-4 py-2 bg-[#3B82F6] text-white text-xs font-semibold rounded-md hover:bg-[#2563EB] transition-colors disabled:opacity-50">
                {saving ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
