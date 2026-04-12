'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Licencas — Gerenciar planos, franquias e creditos
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { ajustarCreditos } from '@/lib/billing';
import { useDirexAuth } from '@/contexts/DirexAuthContext';

type WsData = { id: string; nomeClinica?: string; ownerUid?: string; [k: string]: unknown };
type SubData = { id: string; workspaceId?: string; tipo?: string; franquiaMensal?: number; franquiaUsada?: number; creditosExtras?: number; cicloFim?: Timestamp; [k: string]: unknown };
type ProfData = { id: string; uid?: string; nome?: string; [k: string]: unknown };

type ModalState = {
  open: boolean;
  wsId: string;
  subId: string;
  wsNome: string;
  tipo: string;
  franquia: number;
  creditos: number;
};

export default function LicencasPage() {
  const { profile } = useDirexAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wsList, setWsList] = useState<WsData[]>([]);
  const [subsList, setSubsList] = useState<SubData[]>([]);
  const [profsList, setProfsList] = useState<ProfData[]>([]);

  const [modal, setModal] = useState<ModalState>({ open: false, wsId: '', subId: '', wsNome: '', tipo: 'trial', franquia: 100, creditos: 0 });
  const [creditosModal, setCreditosModal] = useState(false);
  const [creditosQtd, setCreditosQtd] = useState('');
  const [creditosMotivo, setCreditosMotivo] = useState('');

  async function carregarDados() {
    const [wsSnap, subSnap, profSnap] = await Promise.all([
      getDocs(collection(db, 'workspaces')),
      getDocs(collection(db, 'subscriptions')),
      getDocs(collection(db, 'profissionais')),
    ]);
    setWsList(wsSnap.docs.map(d => ({ id: d.id, ...d.data() } as WsData)));
    setSubsList(subSnap.docs.map(d => ({ id: d.id, ...d.data() } as SubData)));
    setProfsList(profSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProfData)));
    setLoading(false);
  }

  useEffect(() => { carregarDados(); }, []);

  function abrirEditar(wsId: string, subId: string) {
    const ws = wsList.find(w => w.id === wsId);
    const sub = subsList.find(s => s.id === subId);
    setModal({
      open: true, wsId, subId,
      wsNome: ws?.nomeClinica || wsId,
      tipo: sub?.tipo || 'trial',
      franquia: sub?.franquiaMensal || 100,
      creditos: sub?.creditosExtras || 0,
    });
  }

  async function salvarLicenca() {
    if (!modal.subId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'subscriptions', modal.subId), {
        tipo: modal.tipo,
        franquiaMensal: modal.franquia,
      });
      setModal(m => ({ ...m, open: false }));
      await carregarDados();
    } catch (e) { console.error('salvarLicenca:', e); }
    setSaving(false);
  }

  async function darCreditos() {
    const qtd = parseInt(creditosQtd);
    if (!qtd || isNaN(qtd)) return;
    if (!creditosMotivo.trim()) { alert('Motivo e obrigatorio.'); return; }
    setSaving(true);
    try {
      await ajustarCreditos(modal.wsId, qtd, 'cortesia', creditosMotivo.trim(), profile?.id || 'admin');
      setCreditosModal(false);
      setCreditosQtd('');
      setCreditosMotivo('');
      setModal(m => ({ ...m, open: false }));
      await carregarDados();
    } catch (e) { console.error('darCreditos:', e); }
    setSaving(false);
  }

  const rows = wsList.map(ws => ({
    ws,
    sub: subsList.find(s => s.workspaceId === ws.id),
    owner: profsList.find(p => p.uid === ws.ownerUid || p.id === ws.ownerUid),
  }));

  if (loading) return <div className="text-[#64748B] text-sm animate-pulse py-10">Carregando licencas...</div>;

  return (
    <div>
      <h1 className="text-lg font-bold text-[#F8FAFC] mb-2">Licencas</h1>
      <p className="text-[13px] text-[#64748B] mb-4">Gerenciar planos, franquias e creditos</p>

      <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#334155]">
              {['Cliente', 'Tipo', 'Franquia', 'Usada', 'Creditos', 'Expira', 'Acoes'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ ws, sub, owner }) => (
              <tr key={ws.id} className="border-b border-[#0F172A] hover:bg-[#0F172A]/50">
                <td className="px-4 py-2.5">
                  <span className="text-[#CBD5E1]">{ws.nomeClinica || ws.id}</span>
                  <br /><span className="text-[10px] text-[#64748B]">{owner?.nome || ''}</span>
                </td>
                <td className="px-4 py-2.5 text-[#CBD5E1]">{sub?.tipo || '\u2014'}</td>
                <td className="px-4 py-2.5 text-[#CBD5E1]">{sub?.franquiaMensal || 0}</td>
                <td className="px-4 py-2.5 text-[#CBD5E1]">{sub?.franquiaUsada || 0}</td>
                <td className="px-4 py-2.5 text-[#CBD5E1]">{sub?.creditosExtras || 0}</td>
                <td className="px-4 py-2.5 text-[#CBD5E1]">
                  {sub?.cicloFim?.toDate ? sub.cicloFim.toDate().toLocaleDateString('pt-BR') : '\u2014'}
                </td>
                <td className="px-4 py-2.5">
                  {sub?.id ? (
                    <button onClick={() => abrirEditar(ws.id, sub.id)}
                      className="px-3 py-1.5 bg-[#3B82F6] text-white text-[11px] font-semibold rounded-md hover:bg-[#2563EB] transition-colors">
                      Editar
                    </button>
                  ) : <span className="text-[#64748B] text-[11px]">Sem plano</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal Editar Licenca ── */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setModal(m => ({ ...m, open: false }))}>
          <div className="bg-[#1E293B] rounded-xl p-6 max-w-[440px] w-[90%]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#F8FAFC] mb-4">Licenca: {modal.wsNome}</h3>

            <label className="text-[12px] text-[#94A3B8] block mb-1">Tipo</label>
            <select value={modal.tipo} onChange={e => setModal(m => ({ ...m, tipo: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none">
              <option value="trial">Trial</option>
              <option value="paid">Pago</option>
            </select>

            <label className="text-[12px] text-[#94A3B8] block mb-1">Franquia mensal</label>
            <input type="number" min={0} value={modal.franquia} onChange={e => setModal(m => ({ ...m, franquia: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none" />

            <label className="text-[12px] text-[#94A3B8] block mb-1">Creditos extras (atual)</label>
            <input type="number" value={modal.creditos} disabled
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#64748B] text-sm mb-4 outline-none cursor-not-allowed" />

            <div className="flex gap-2.5">
              <button onClick={() => setModal(m => ({ ...m, open: false }))}
                className="px-4 py-2 border border-[#475569] text-[#94A3B8] text-xs font-semibold rounded-md hover:bg-[#334155] transition-colors">
                Cancelar
              </button>
              <button onClick={salvarLicenca} disabled={saving}
                className="px-4 py-2 bg-[#3B82F6] text-white text-xs font-semibold rounded-md hover:bg-[#2563EB] transition-colors disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button onClick={() => setCreditosModal(true)}
                className="px-4 py-2 bg-[#22C55E] text-white text-xs font-semibold rounded-md hover:bg-[#16A34A] transition-colors">
                + Creditos cortesia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Dar Creditos ── */}
      {creditosModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center" onClick={() => setCreditosModal(false)}>
          <div className="bg-[#1E293B] rounded-xl p-6 max-w-[380px] w-[90%]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#F8FAFC] mb-4">Creditos cortesia</h3>
            <p className="text-[12px] text-[#64748B] mb-3">{modal.wsNome} \u2014 Saldo atual: {modal.creditos}</p>

            <label className="text-[12px] text-[#94A3B8] block mb-1">Quantidade</label>
            <input type="number" value={creditosQtd} onChange={e => setCreditosQtd(e.target.value)}
              placeholder="Ex: 10"
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none placeholder:text-[#64748B]" />

            <label className="text-[12px] text-[#94A3B8] block mb-1">Motivo (obrigatorio)</label>
            <input value={creditosMotivo} onChange={e => setCreditosMotivo(e.target.value)}
              placeholder="Ex: compensacao por bug no PDF"
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-4 outline-none placeholder:text-[#64748B]" />

            <div className="flex gap-2.5">
              <button onClick={() => setCreditosModal(false)}
                className="px-4 py-2 border border-[#475569] text-[#94A3B8] text-xs font-semibold rounded-md hover:bg-[#334155] transition-colors">
                Cancelar
              </button>
              <button onClick={darCreditos} disabled={saving || !creditosMotivo.trim()}
                className="px-4 py-2 bg-[#22C55E] text-white text-xs font-semibold rounded-md hover:bg-[#16A34A] transition-colors disabled:opacity-50">
                {saving ? 'Adicionando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
