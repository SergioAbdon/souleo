'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Pagamentos — Dashboard financeiro completo
// Cards, PF/PJ, DRE, graficos evolucao, snapshots mensais
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, getDoc, doc, setDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { registrarPagamento } from '@/lib/billing';
import { useDirexAuth } from '@/contexts/DirexAuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

type WsData = { id: string; nomeClinica?: string; tipo?: string; [k: string]: unknown };
type SubData = { id: string; workspaceId?: string; planoId?: string; tipo?: string; franquiaMensal?: number; franquiaUsada?: number; creditosExtras?: number; excedente?: number; maxLocais?: number; localAdicional?: number; cicloFim?: Timestamp; [k: string]: unknown };
type PagData = { id: string; workspaceId?: string; valor?: number; metodo?: string; status?: string; plano?: string; referencia?: string; obs?: string; criadoEm?: Timestamp; [k: string]: unknown };
type VincData = { id: string; medicoUid?: string; workspaceId?: string; status?: string; [k: string]: unknown };
type CustosConfig = { firebase: number; vercel: number; claude: number; dominio: number; outros: number; aliquotaImpostos: number };
type SnapshotMes = { receitaBruta: number; receitaPF: number; receitaPJ: number; assinantesPF: number; assinantesPJ: number; ticketMedioPF: number; ticketMedioPJ: number; cancelamentos: number; excedenteLaudos: number; locaisAdicionais: number; custos: number; impostos: number; lucro: number; };

const CUSTOS_DEFAULT: CustosConfig = { firebase: 50, vercel: 100, claude: 15, dominio: 3, outros: 0, aliquotaImpostos: 6 };
const MESES_NOME = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function Pill({ texto, cor }: { texto: string; cor: 'verde' | 'amarelo' | 'vermelho' | 'azul' | 'roxo' }) {
  const cls: Record<string, string> = { verde: 'bg-[#064E3B] text-[#6EE7B7]', amarelo: 'bg-[#78350F] text-[#FDE68A]', vermelho: 'bg-[#7F1D1D] text-[#FCA5A5]', azul: 'bg-[#1E3A5F] text-[#93C5FD]', roxo: 'bg-[#4C1D95] text-[#C4B5FD]' };
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
function fmtR$(v: number) { return `R$ ${v.toFixed(2).replace('.', ',')}`; }

type ModalPag = { open: boolean; workspaceId: string; valor: string; metodo: 'pix' | 'cartao' | 'transferencia' | 'cortesia'; plano: string; referencia: string; obs: string };

export default function PagamentosPage() {
  const { profile } = useDirexAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wsList, setWsList] = useState<WsData[]>([]);
  const [subsList, setSubsList] = useState<SubData[]>([]);
  const [pagList, setPagList] = useState<PagData[]>([]);
  const [vincList, setVincList] = useState<VincData[]>([]);
  const [custos, setCustos] = useState<CustosConfig>(CUSTOS_DEFAULT);
  const [custosOpen, setCustosOpen] = useState(false);
  const [filtroWs, setFiltroWs] = useState('');
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotMes>>({});
  const [snapMes, setSnapMes] = useState('');
  const [snapEdit, setSnapEdit] = useState<SnapshotMes | null>(null);
  const [modal, setModal] = useState<ModalPag>({ open: false, workspaceId: '', valor: '', metodo: 'pix', plano: '', referencia: '', obs: '' });

  async function carregarDados() {
    const [wsSnap, subSnap, pagSnap, vincSnap, custosSnap] = await Promise.all([
      getDocs(collection(db, 'workspaces')),
      getDocs(collection(db, 'subscriptions')),
      getDocs(query(collection(db, 'pagamentos'), orderBy('criadoEm', 'desc'))),
      getDocs(collection(db, 'vinculos')),
      getDoc(doc(db, 'configPlanos', 'custos')),
    ]);
    setWsList(wsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WsData)));
    setSubsList(subSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubData)));
    setPagList(pagSnap.docs.map(d => ({ id: d.id, ...d.data() } as PagData)));
    setVincList(vincSnap.docs.map(d => ({ id: d.id, ...d.data() } as VincData)));
    if (custosSnap.exists()) setCustos(custosSnap.data() as CustosConfig);
    // Carregar snapshots historicos
    const histSnap = await getDocs(collection(db, 'historicoFinanceiro'));
    const snaps: Record<string, SnapshotMes> = {};
    histSnap.docs.forEach(d => { snaps[d.id] = d.data() as SnapshotMes; });
    setSnapshots(snaps);
    setLoading(false);
  }

  useEffect(() => { carregarDados(); }, []);

  // ── Helpers ──
  const agora = Date.now();
  const agoraDate = new Date();
  const inicioMes = new Date(agoraDate.getFullYear(), agoraDate.getMonth(), 1);
  const mesAtualKey = `${agoraDate.getFullYear()}-${String(agoraDate.getMonth() + 1).padStart(2, '0')}`;
  const wsPF = wsList.filter(w => w.tipo === 'PF');
  const wsPJ = wsList.filter(w => w.tipo === 'PJ');

  // Subs ativas pagas
  const subsAtivas = subsList.filter(s => { const f = s.cicloFim?.toDate ? s.cicloFim.toDate() : null; return f && agora <= f.getTime() && s.tipo === 'paid'; });
  const subsPF = subsAtivas.filter(s => wsPF.some(w => w.id === s.workspaceId));
  const subsPJ = subsAtivas.filter(s => wsPJ.some(w => w.id === s.workspaceId));

  // Pagamentos do mes
  const pagsMes = pagList.filter(p => { const ts = p.criadoEm?.toDate ? p.criadoEm.toDate() : null; return ts && ts >= inicioMes && p.status === 'confirmado'; });
  const pagsMesPF = pagsMes.filter(p => wsPF.some(w => w.id === p.workspaceId));
  const pagsMesPJ = pagsMes.filter(p => wsPJ.some(w => w.id === p.workspaceId));
  const receitaMes = pagsMes.reduce((a, p) => a + (p.valor || 0), 0);
  const receitaPF = pagsMesPF.reduce((a, p) => a + (p.valor || 0), 0);
  const receitaPJ = pagsMesPJ.reduce((a, p) => a + (p.valor || 0), 0);

  // MRR
  const precoPlano: Record<string, number> = { basic: 99.99, profissional: 199.99, expert: 249.99 };
  const mrrPF = subsPF.reduce((a, s) => a + (precoPlano[s.planoId || ''] || 0), 0);
  const mrrPJ = subsPJ.reduce((a, s) => a + (precoPlano[s.planoId || ''] || 0), 0);
  const mrrTotal = mrrPF + mrrPJ;

  // Ticket medio PF e PJ
  const ticketPF = pagsMesPF.length > 0 ? receitaPF / pagsMesPF.length : 0;
  const ticketPJ = pagsMesPJ.length > 0 ? receitaPJ / pagsMesPJ.length : 0;
  const ticketMedio = pagsMes.length > 0 ? receitaMes / pagsMes.length : 0;

  // Cancelamentos e inadimplentes
  const cancelamentos = subsList.filter(s => { const f = s.cicloFim?.toDate ? s.cicloFim.toDate() : null; return s.tipo === 'paid' && f && agora > f.getTime(); }).length;
  const inadimplentes = subsList.filter(s => { const f = s.cicloFim?.toDate ? s.cicloFim.toDate() : null; return f && agora > f.getTime(); }).length;

  // Excedente laudos + locais adicionais
  const recExcedente = subsList.reduce((a, s) => { const u = s.franquiaUsada || 0; const f = s.franquiaMensal || 0; return a + (u > f ? (u - f) * (s.excedente || 0) : 0); }, 0);
  const recLocais = subsList.reduce((a, s) => { const vincs = vincList.filter(v => v.workspaceId === s.workspaceId && v.status === 'ativo'); const extras = Math.max(0, vincs.length - (s.maxLocais || 1)); return a + extras * (s.localAdicional || 0); }, 0);

  // DRE
  const receitaBruta = receitaMes + recExcedente + recLocais;
  const impostos = receitaBruta * (custos.aliquotaImpostos / 100);
  const totalCustos = custos.firebase + custos.vercel + custos.claude + custos.dominio + custos.outros;
  const lucro = receitaBruta - impostos - totalCustos;
  const margem = receitaBruta > 0 ? Math.round((lucro / receitaBruta) * 100) : 0;
  const pctPF = receitaBruta > 0 ? Math.round((receitaPF / receitaBruta) * 100) : 0;
  const pctPJ = receitaBruta > 0 ? Math.round((receitaPJ / receitaBruta) * 100) : 0;

  // ── Graficos: ultimos 6 meses ──
  function gerarDadosGrafico() {
    const dados = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(agoraDate.getFullYear(), agoraDate.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${MESES_NOME[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
      const snap = snapshots[key];
      if (i === 0) {
        dados.push({ mes: label, PF: receitaPF, PJ: receitaPJ, assinantes: subsAtivas.length, cancelamentos });
      } else if (snap) {
        dados.push({ mes: label, PF: snap.receitaPF, PJ: snap.receitaPJ, assinantes: snap.assinantesPF + snap.assinantesPJ, cancelamentos: snap.cancelamentos });
      } else {
        dados.push({ mes: label, PF: 0, PJ: 0, assinantes: 0, cancelamentos: 0 });
      }
    }
    return dados;
  }
  const dadosGrafico = gerarDadosGrafico();

  // ── Salvar snapshot do mes atual ──
  async function salvarSnapshot() {
    const snap: SnapshotMes = {
      receitaBruta, receitaPF, receitaPJ, assinantesPF: subsPF.length, assinantesPJ: subsPJ.length,
      ticketMedioPF: ticketPF, ticketMedioPJ: ticketPJ, cancelamentos,
      excedenteLaudos: recExcedente, locaisAdicionais: recLocais,
      custos: totalCustos, impostos, lucro,
    };
    await setDoc(doc(db, 'historicoFinanceiro', mesAtualKey), snap);
    setSnapshots(prev => ({ ...prev, [mesAtualKey]: snap }));
  }

  // ── Editar snapshot ──
  async function salvarSnapEdit() {
    if (!snapMes || !snapEdit) return;
    setSaving(true);
    await setDoc(doc(db, 'historicoFinanceiro', snapMes), snapEdit);
    setSnapshots(prev => ({ ...prev, [snapMes]: snapEdit }));
    setSnapMes('');
    setSnapEdit(null);
    setSaving(false);
  }

  // ── Custos ──
  async function salvarCustos() {
    setSaving(true);
    await setDoc(doc(db, 'configPlanos', 'custos'), custos);
    setSaving(false);
    setCustosOpen(false);
  }

  // ── Pagamento ──
  async function salvarPagamento() {
    if (!modal.workspaceId || !modal.valor) return;
    setSaving(true);
    await registrarPagamento({ workspaceId: modal.workspaceId, valor: parseFloat(modal.valor) || 0, metodo: modal.metodo, status: 'confirmado', gateway: 'manual', plano: modal.plano, referencia: modal.referencia, registradoPor: profile?.id || 'admin', obs: modal.obs });
    setModal({ open: false, workspaceId: '', valor: '', metodo: 'pix', plano: '', referencia: '', obs: '' });
    await carregarDados();
    setSaving(false);
  }

  function fmtDate(ts: Timestamp | undefined) { if (!ts) return '\u2014'; const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as string); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }

  const pagFiltrados = filtroWs ? pagList.filter(p => p.workspaceId === filtroWs) : pagList;

  // ── Meses disponiveis pro seletor ──
  const mesesDisponiveis = Object.keys(snapshots).sort().reverse();

  if (loading) return <div className="text-[#64748B] text-sm animate-pulse py-10">Carregando pagamentos...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-[#F8FAFC]">Pagamentos</h1>
        <div className="flex gap-2">
          <button onClick={salvarSnapshot} className="px-3 py-2 bg-[#334155] text-[#94A3B8] text-xs font-semibold rounded-md hover:bg-[#475569] hover:text-[#F8FAFC] transition-colors">
            Salvar snapshot do mes
          </button>
          <button onClick={() => setModal(m => ({ ...m, open: true }))} className="px-4 py-2 bg-[#3B82F6] text-white text-xs font-semibold rounded-md hover:bg-[#2563EB] transition-colors">
            + Registrar pagamento
          </button>
        </div>
      </div>

      {/* ── Cards financeiros ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        <MetricCard label="Receita do mes" value={fmtR$(receitaMes)} sub={`${pagsMes.length} pagamento${pagsMes.length !== 1 ? 's' : ''}`} />
        <MetricCard label="Assinaturas ativas" value={fmtR$(mrrTotal)} sub={`${subsAtivas.length} assinante${subsAtivas.length !== 1 ? 's' : ''}`} />
        <MetricCard label="Ticket medio" value={fmtR$(ticketMedio)} />
        <MetricCard label="Cancelamentos" value={cancelamentos} cor={cancelamentos > 0 ? '#F87171' : undefined} />
      </div>

      {/* ── PF vs PJ com barra ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-6">
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3"><Pill texto="PF" cor="azul" /><span className="text-sm font-bold text-[#F8FAFC]">Pessoa Fisica</span></div>
          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div><div className="text-[10px] text-[#64748B] uppercase">Clientes</div><div className="text-xl font-bold text-[#F8FAFC]">{subsPF.length}</div></div>
            <div><div className="text-[10px] text-[#64748B] uppercase">Assinaturas</div><div className="text-xl font-bold text-[#93C5FD]">{fmtR$(mrrPF)}</div></div>
            <div><div className="text-[10px] text-[#64748B] uppercase">Receita mes</div><div className="text-lg font-bold text-[#F8FAFC]">{fmtR$(receitaPF)}</div></div>
            <div><div className="text-[10px] text-[#64748B] uppercase">Ticket medio</div><div className="text-lg font-bold text-[#F8FAFC]">{fmtR$(ticketPF)}</div></div>
          </div>
          <div className="w-full bg-[#0F172A] rounded-full h-3">
            <div className="bg-[#3B82F6] h-3 rounded-full transition-all" style={{ width: `${pctPF}%` }} />
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 text-center">{pctPF}% da receita total</div>
        </div>

        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3"><Pill texto="PJ" cor="roxo" /><span className="text-sm font-bold text-[#F8FAFC]">Pessoa Juridica</span></div>
          <div className="grid grid-cols-2 gap-3 text-sm mb-3">
            <div><div className="text-[10px] text-[#64748B] uppercase">Clientes</div><div className="text-xl font-bold text-[#F8FAFC]">{subsPJ.length}</div></div>
            <div><div className="text-[10px] text-[#64748B] uppercase">Assinaturas</div><div className="text-xl font-bold text-[#C4B5FD]">{fmtR$(mrrPJ)}</div></div>
            <div><div className="text-[10px] text-[#64748B] uppercase">Receita mes</div><div className="text-lg font-bold text-[#F8FAFC]">{fmtR$(receitaPJ)}</div></div>
            <div><div className="text-[10px] text-[#64748B] uppercase">Ticket medio</div><div className="text-lg font-bold text-[#F8FAFC]">{fmtR$(ticketPJ)}</div></div>
          </div>
          <div className="w-full bg-[#0F172A] rounded-full h-3">
            <div className="bg-[#8B5CF6] h-3 rounded-full transition-all" style={{ width: `${pctPJ}%` }} />
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 text-center">{pctPJ}% da receita total</div>
        </div>
      </div>

      {/* ── Graficos ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-6">
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#F8FAFC] mb-3">Receita mensal (PF/PJ)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dadosGrafico}>
              <XAxis dataKey="mes" tick={{ fill: '#64748B', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748B', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#F8FAFC' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="PF" stackId="a" fill="#3B82F6" name="PF" radius={[0, 0, 0, 0]} />
              <Bar dataKey="PJ" stackId="a" fill="#8B5CF6" name="PJ" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#F8FAFC] mb-3">Assinantes e cancelamentos</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dadosGrafico}>
              <XAxis dataKey="mes" tick={{ fill: '#64748B', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748B', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#1E293B', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#F8FAFC' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="assinantes" stroke="#22C55E" name="Assinantes" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="cancelamentos" stroke="#EF4444" name="Cancelamentos" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── DRE ── */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[#F8FAFC]">DRE Simplificado (mensal)</h2>
          <button onClick={() => setCustosOpen(!custosOpen)} className="px-3 py-1.5 text-[11px] font-semibold rounded-md bg-[#334155] text-[#94A3B8] hover:bg-[#475569] hover:text-[#F8FAFC] transition-colors">{custosOpen ? 'Fechar custos' : 'Editar custos'}</button>
        </div>
        <table className="w-full text-[13px]"><tbody>
          <tr className="border-b border-[#334155]"><td className="py-2 text-[#F8FAFC] font-semibold" colSpan={2}>RECEITA BRUTA</td><td className="py-2 text-right text-[#F8FAFC] font-bold">{fmtR$(receitaBruta)}</td></tr>
          <tr><td className="py-1.5 pl-4 text-[#94A3B8]">Assinaturas PF</td><td></td><td className="py-1.5 text-right text-[#CBD5E1]">{fmtR$(receitaPF)}</td></tr>
          <tr><td className="py-1.5 pl-4 text-[#94A3B8]">Assinaturas PJ</td><td></td><td className="py-1.5 text-right text-[#CBD5E1]">{fmtR$(receitaPJ)}</td></tr>
          <tr><td className="py-1.5 pl-4 text-[#94A3B8]">Excedente laudos</td><td></td><td className="py-1.5 text-right text-[#CBD5E1]">{fmtR$(recExcedente)}</td></tr>
          <tr className="border-b border-[#334155]"><td className="py-1.5 pl-4 text-[#94A3B8]">Locais adicionais</td><td></td><td className="py-1.5 text-right text-[#CBD5E1]">{fmtR$(recLocais)}</td></tr>
          <tr><td className="py-2 text-[#F87171]">(-) Impostos ({custos.aliquotaImpostos}%)</td><td></td><td className="py-2 text-right text-[#F87171]">-{fmtR$(impostos)}</td></tr>
          <tr className="border-b border-[#334155]"><td className="py-2 text-[#F87171]">(-) Custos operacionais</td><td></td><td className="py-2 text-right text-[#F87171]">-{fmtR$(totalCustos)}</td></tr>
          <tr className="border-t-2 border-[#3B82F6]"><td className="py-3 text-[#6EE7B7] font-bold text-base">= LUCRO</td><td className="py-3 text-right text-[#6EE7B7] text-[11px]">Margem {margem}%</td><td className="py-3 text-right text-[#6EE7B7] font-bold text-base">{fmtR$(lucro)}</td></tr>
        </tbody></table>
      </div>

      {/* ── Custos editaveis ── */}
      {custosOpen && (
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5 mb-6">
          <h3 className="text-sm font-bold text-[#F8FAFC] mb-3">Custos operacionais</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            {([['firebase', 'Firebase (R$)'], ['vercel', 'Vercel (R$)'], ['claude', 'Claude API (R$)'], ['dominio', 'Dominio (R$)'], ['outros', 'Outros (R$)'], ['aliquotaImpostos', 'Impostos (%)']] as const).map(([key, label]) => (
              <div key={key}><label className="text-[10px] text-[#64748B] uppercase block mb-1">{label}</label>
                <input type="number" step="0.01" value={custos[key]} onChange={e => setCustos(c => ({ ...c, [key]: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6]" /></div>
            ))}
          </div>
          <button onClick={salvarCustos} disabled={saving} className="px-4 py-2 bg-[#22C55E] text-white text-xs font-semibold rounded-md hover:bg-[#16A34A] transition-colors disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar custos'}</button>
        </div>
      )}

      {/* ── Historico: seletor de mes ── */}
      {mesesDisponiveis.length > 0 && (
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-5 mb-6">
          <h3 className="text-sm font-bold text-[#F8FAFC] mb-3">Historico mensal</h3>
          <div className="flex gap-3 items-center mb-4">
            <select value={snapMes} onChange={e => { setSnapMes(e.target.value); setSnapEdit(e.target.value ? { ...snapshots[e.target.value] } : null); }}
              className="px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6]">
              <option value="">Selecionar mes...</option>
              {mesesDisponiveis.map(m => { const [a, mm] = m.split('-'); return <option key={m} value={m}>{MESES_NOME[parseInt(mm) - 1]}/{a}</option>; })}
            </select>
          </div>
          {snapEdit && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {([['receitaPF', 'Receita PF'], ['receitaPJ', 'Receita PJ'], ['assinantesPF', 'Assinantes PF'], ['assinantesPJ', 'Assinantes PJ'], ['cancelamentos', 'Cancelamentos'], ['custos', 'Custos'], ['impostos', 'Impostos']] as const).map(([key, label]) => (
                  <div key={key}><label className="text-[10px] text-[#64748B] uppercase block mb-1">{label}</label>
                    <input type="number" step="0.01" value={snapEdit[key]} onChange={e => setSnapEdit(s => s ? { ...s, [key]: parseFloat(e.target.value) || 0, receitaBruta: key === 'receitaPF' || key === 'receitaPJ' ? (key === 'receitaPF' ? parseFloat(e.target.value) || 0 : s.receitaPF) + (key === 'receitaPJ' ? parseFloat(e.target.value) || 0 : s.receitaPJ) + s.excedenteLaudos + s.locaisAdicionais : s.receitaBruta, lucro: key === 'custos' || key === 'impostos' ? s.receitaBruta - (key === 'impostos' ? parseFloat(e.target.value) || 0 : s.impostos) - (key === 'custos' ? parseFloat(e.target.value) || 0 : s.custos) : s.lucro } : null)}
                      className="w-full px-2 py-1.5 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6]" /></div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={salvarSnapEdit} disabled={saving} className="px-4 py-2 bg-[#3B82F6] text-white text-xs font-semibold rounded-md hover:bg-[#2563EB] transition-colors disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar alteracoes'}</button>
                <button onClick={() => { setSnapMes(''); setSnapEdit(null); }} className="px-4 py-2 border border-[#475569] text-[#94A3B8] text-xs font-semibold rounded-md hover:bg-[#334155] transition-colors">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Historico pagamentos ── */}
      <h2 className="text-sm font-bold text-[#F8FAFC] mb-3">Historico de pagamentos</h2>
      <div className="mb-4">
        <select value={filtroWs} onChange={e => setFiltroWs(e.target.value)} className="px-3.5 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6]">
          <option value="">Todos os workspaces</option>
          {wsList.map(w => <option key={w.id} value={w.id}>{w.nomeClinica || w.id} ({w.tipo})</option>)}
        </select>
      </div>
      {pagFiltrados.length === 0 ? <p className="text-[#64748B] text-sm">Nenhum pagamento registrado.</p> : (
        <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-x-auto">
          <table className="w-full text-[13px]"><thead><tr className="border-b border-[#334155]">
            {['Data', 'Workspace', 'Tipo', 'Valor', 'Metodo', 'Plano', 'Status', 'Obs'].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">{h}</th>)}
          </tr></thead><tbody>
            {pagFiltrados.map(p => { const ws = wsList.find(w => w.id === p.workspaceId); const stCor = p.status === 'confirmado' ? 'verde' : p.status === 'pendente' ? 'amarelo' : 'vermelho'; return (
              <tr key={p.id} className="border-b border-[#0F172A] hover:bg-[#0F172A]/50">
                <td className="px-4 py-2.5 text-[#CBD5E1] whitespace-nowrap">{fmtDate(p.criadoEm)}</td>
                <td className="px-4 py-2.5 text-[#CBD5E1]">{ws?.nomeClinica || p.workspaceId}</td>
                <td className="px-4 py-2.5"><Pill texto={ws?.tipo || '?'} cor={ws?.tipo === 'PF' ? 'azul' : 'roxo'} /></td>
                <td className="px-4 py-2.5 text-[#F8FAFC] font-medium">{fmtR$(p.valor || 0)}</td>
                <td className="px-4 py-2.5"><Pill texto={p.metodo || '?'} cor="azul" /></td>
                <td className="px-4 py-2.5 text-[#CBD5E1]">{p.plano || '\u2014'}</td>
                <td className="px-4 py-2.5"><Pill texto={p.status || '?'} cor={stCor as 'verde' | 'amarelo' | 'vermelho'} /></td>
                <td className="px-4 py-2.5 text-[#64748B] text-[11px] max-w-[200px] truncate">{p.obs || '\u2014'}</td>
              </tr>); })}
          </tbody></table>
        </div>
      )}

      {/* ── Modal Registrar Pagamento ── */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setModal(m => ({ ...m, open: false }))}>
          <div className="bg-[#1E293B] rounded-xl p-6 max-w-[440px] w-[90%]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#F8FAFC] mb-4">Registrar pagamento</h3>
            <label className="text-[12px] text-[#94A3B8] block mb-1">Workspace</label>
            <select value={modal.workspaceId} onChange={e => setModal(m => ({ ...m, workspaceId: e.target.value }))} className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none"><option value="">Selecione...</option>{wsList.map(w => <option key={w.id} value={w.id}>{w.nomeClinica || w.id} ({w.tipo})</option>)}</select>
            <label className="text-[12px] text-[#94A3B8] block mb-1">Valor (R$)</label>
            <input type="number" step="0.01" value={modal.valor} onChange={e => setModal(m => ({ ...m, valor: e.target.value }))} placeholder="189.99" className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none placeholder:text-[#64748B]" />
            <label className="text-[12px] text-[#94A3B8] block mb-1">Metodo</label>
            <select value={modal.metodo} onChange={e => setModal(m => ({ ...m, metodo: e.target.value as ModalPag['metodo'] }))} className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none"><option value="pix">Pix</option><option value="cartao">Cartao</option><option value="transferencia">Transferencia</option><option value="cortesia">Cortesia</option></select>
            <label className="text-[12px] text-[#94A3B8] block mb-1">Plano</label>
            <select value={modal.plano} onChange={e => setModal(m => ({ ...m, plano: e.target.value }))} className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none"><option value="">Selecione...</option><option value="basic">Basic</option><option value="profissional">Profissional</option><option value="expert">Expert</option></select>
            <label className="text-[12px] text-[#94A3B8] block mb-1">Referencia (mes/ano)</label>
            <input value={modal.referencia} onChange={e => setModal(m => ({ ...m, referencia: e.target.value }))} placeholder="04/2026" className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none placeholder:text-[#64748B]" />
            <label className="text-[12px] text-[#94A3B8] block mb-1">Observacao</label>
            <input value={modal.obs} onChange={e => setModal(m => ({ ...m, obs: e.target.value }))} placeholder="Opcional" className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-4 outline-none placeholder:text-[#64748B]" />
            <div className="flex gap-2.5">
              <button onClick={() => setModal(m => ({ ...m, open: false }))} className="px-4 py-2 border border-[#475569] text-[#94A3B8] text-xs font-semibold rounded-md hover:bg-[#334155] transition-colors">Cancelar</button>
              <button onClick={salvarPagamento} disabled={saving || !modal.workspaceId || !modal.valor} className="px-4 py-2 bg-[#3B82F6] text-white text-xs font-semibold rounded-md hover:bg-[#2563EB] transition-colors disabled:opacity-50">{saving ? 'Registrando...' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
