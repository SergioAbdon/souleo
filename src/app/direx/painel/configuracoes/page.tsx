'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Configuracoes — Equipe admin + Planos
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { setAdminRole, logAction } from '@/lib/firestore';
import { getConfigPlanos, saveConfigPlanos, type PlanoConfig, type ConfigPlanos } from '@/lib/billing';
import { useDirexAuth } from '@/contexts/DirexAuthContext';

type ProfData = { id: string; uid?: string; nome?: string; email?: string; superadmin?: boolean; adminRole?: string; [k: string]: unknown };

const ROLES = [
  { id: 'suporte', nome: 'Suporte', desc: 'Ve clientes, profissionais, logs. Sem billing.' },
  { id: 'financeiro', nome: 'Financeiro', desc: 'Ve/edita licencas, pagamentos, creditos.' },
  { id: 'viewer', nome: 'Viewer', desc: 'Somente visualiza. Nao altera nada.' },
];

function Pill({ texto, cor }: { texto: string; cor: 'verde' | 'amarelo' | 'azul' | 'roxo' }) {
  const cls: Record<string, string> = {
    verde: 'bg-[#064E3B] text-[#6EE7B7]', amarelo: 'bg-[#78350F] text-[#FDE68A]',
    azul: 'bg-[#1E3A5F] text-[#93C5FD]', roxo: 'bg-[#4C1D95] text-[#C4B5FD]',
  };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls[cor]}`}>{texto}</span>;
}

export default function ConfiguracoesPage() {
  const { profile } = useDirexAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Equipe
  const [equipe, setEquipe] = useState<ProfData[]>([]);
  const [allProfs, setAllProfs] = useState<ProfData[]>([]);
  const [addModal, setAddModal] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('suporte');
  const [addErro, setAddErro] = useState('');
  const [editModal, setEditModal] = useState<{ open: boolean; prof: ProfData | null; role: string }>({ open: false, prof: null, role: '' });

  // Planos
  const [config, setConfig] = useState<ConfigPlanos | null>(null);

  async function carregarDados() {
    const [profSnap, cfg] = await Promise.all([
      getDocs(collection(db, 'profissionais')),
      getConfigPlanos(),
    ]);
    const profs = profSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProfData));
    setAllProfs(profs);
    setEquipe(profs.filter(p => p.superadmin === true || !!p.adminRole));
    setConfig(cfg);
    setLoading(false);
  }

  useEffect(() => { carregarDados(); }, []);

  // ── Equipe: Adicionar ──
  async function adicionarMembro() {
    setAddErro('');
    const email = addEmail.trim().toLowerCase();
    if (!email) { setAddErro('Digite um email.'); return; }

    const prof = allProfs.find(p => (p.email || '').toLowerCase() === email);
    if (!prof) { setAddErro('Profissional nao encontrado no sistema. Ele precisa estar cadastrado primeiro.'); return; }
    if (prof.superadmin || prof.adminRole) { setAddErro('Este profissional ja tem acesso ao Direx.'); return; }

    setSaving(true);
    const ok = await setAdminRole(prof.id, addRole);
    if (ok) {
      await logAction('equipe_adicionado', { profId: prof.id, email, role: addRole }, profile?.id);
      setAddModal(false);
      setAddEmail('');
      setAddRole('suporte');
      await carregarDados();
    }
    setSaving(false);
  }

  // ── Equipe: Editar role ──
  async function salvarRole() {
    if (!editModal.prof) return;
    setSaving(true);
    const ok = await setAdminRole(editModal.prof.id, editModal.role);
    if (ok) {
      await logAction('equipe_role_alterado', { profId: editModal.prof.id, novoRole: editModal.role }, profile?.id);
      setEditModal({ open: false, prof: null, role: '' });
      await carregarDados();
    }
    setSaving(false);
  }

  // ── Equipe: Remover ──
  async function removerMembro(prof: ProfData) {
    if (prof.superadmin) return; // nao pode remover superadmin
    if (!confirm(`Remover ${prof.nome || prof.email} da equipe Direx?`)) return;
    setSaving(true);
    const ok = await setAdminRole(prof.id, null);
    if (ok) {
      await logAction('equipe_removido', { profId: prof.id, email: prof.email }, profile?.id);
      await carregarDados();
    }
    setSaving(false);
  }

  // ── Planos: Editar campo ──
  function editarPlano(idx: number, campo: keyof PlanoConfig, valor: string | number) {
    if (!config) return;
    const novos = [...config.planos];
    if (campo === 'nome' || campo === 'id') {
      novos[idx] = { ...novos[idx], [campo]: valor as string };
    } else {
      novos[idx] = { ...novos[idx], [campo]: Number(valor) || 0 };
    }
    setConfig({ ...config, planos: novos });
  }

  async function salvarPlanos() {
    if (!config) return;
    setSaving(true);
    const ok = await saveConfigPlanos(config, profile?.id || 'admin');
    if (ok) {
      await logAction('planos_atualizados', { planos: config.planos.map(p => p.id) }, profile?.id);
    }
    setSaving(false);
  }

  if (loading) return <div className="text-[#64748B] text-sm animate-pulse py-10">Carregando configuracoes...</div>;
  if (!profile?.superadmin) return <div className="text-[#F87171] text-sm py-10">Acesso restrito. Somente superadmin pode acessar configuracoes.</div>;

  return (
    <div>
      <h1 className="text-lg font-bold text-[#F8FAFC] mb-6">Configuracoes</h1>

      {/* ════════ SECAO A: EQUIPE ════════ */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#F8FAFC]">Equipe Direx</h2>
          <button onClick={() => setAddModal(true)}
            className="px-4 py-2 bg-[#3B82F6] text-white text-xs font-semibold rounded-md hover:bg-[#2563EB] transition-colors">
            + Adicionar
          </button>
        </div>

        <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#334155]">
                {['Nome', 'Email', 'Role', 'Acoes'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipe.map(p => {
                const role = p.superadmin ? 'superadmin' : (p.adminRole || '?');
                const roleCor = role === 'superadmin' ? 'amarelo' : role === 'financeiro' ? 'verde' : role === 'suporte' ? 'azul' : 'roxo';
                return (
                  <tr key={p.id} className="border-b border-[#0F172A] hover:bg-[#0F172A]/50">
                    <td className="px-4 py-2.5 text-[#CBD5E1] font-medium">{p.nome || '\u2014'}</td>
                    <td className="px-4 py-2.5 text-[#64748B] text-[11px]">{p.email || '\u2014'}</td>
                    <td className="px-4 py-2.5"><Pill texto={role} cor={roleCor as 'verde' | 'amarelo' | 'azul' | 'roxo'} /></td>
                    <td className="px-4 py-2.5">
                      {p.superadmin ? (
                        <span className="text-[#64748B] text-[11px]">Dono do sistema</span>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => setEditModal({ open: true, prof: p, role: p.adminRole || 'suporte' })}
                            className="px-3 py-1 bg-[#334155] text-[#94A3B8] text-[11px] font-semibold rounded-md hover:bg-[#475569] hover:text-[#F8FAFC] transition-colors">
                            Editar
                          </button>
                          <button onClick={() => removerMembro(p)}
                            className="px-3 py-1 bg-[#7F1D1D] text-[#FCA5A5] text-[11px] font-semibold rounded-md hover:bg-[#991B1B] transition-colors">
                            Remover
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════════ SECAO B: PLANOS ════════ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-[#F8FAFC]">Configuracao de Planos</h2>
          <button onClick={salvarPlanos} disabled={saving}
            className="px-4 py-2 bg-[#22C55E] text-white text-xs font-semibold rounded-md hover:bg-[#16A34A] transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar alteracoes'}
          </button>
        </div>

        <div className="bg-[#1E293B] border border-[#334155] rounded-lg overflow-x-auto mb-4">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[#334155]">
                {['Plano', 'Preco (R$)', 'Franquia', 'Excedente (R$)'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {config?.planos.map((p, i) => (
                <tr key={p.id} className="border-b border-[#0F172A]">
                  <td className="px-4 py-2 text-[#F8FAFC] font-medium">{p.nome}</td>
                  <td className="px-4 py-2">
                    <input type="number" step="0.01" value={p.preco} onChange={e => editarPlano(i, 'preco', e.target.value)}
                      className="w-24 px-2 py-1 bg-[#0F172A] border border-[#334155] rounded text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6]" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" value={p.franquia} onChange={e => editarPlano(i, 'franquia', e.target.value)}
                      className="w-20 px-2 py-1 bg-[#0F172A] border border-[#334155] rounded text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6]" />
                  </td>
                  <td className="px-4 py-2">
                    <input type="number" step="0.01" value={p.excedente} onChange={e => editarPlano(i, 'excedente', e.target.value)}
                      className="w-20 px-2 py-1 bg-[#0F172A] border border-[#334155] rounded text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div>
            <label className="text-[11px] text-[#64748B] uppercase block mb-1">Carencia (dias)</label>
            <input type="number" value={config?.carenciaDias || 3}
              onChange={e => config && setConfig({ ...config, carenciaDias: Number(e.target.value) || 3 })}
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6]" />
          </div>
          <div>
            <label className="text-[11px] text-[#64748B] uppercase block mb-1">Rate limit (emissoes/hora)</label>
            <input type="number" value={config?.rateLimitEmissao || 20}
              onChange={e => config && setConfig({ ...config, rateLimitEmissao: Number(e.target.value) || 20 })}
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-[#E2E8F0] text-sm outline-none focus:border-[#3B82F6]" />
          </div>
        </div>
      </div>

      {/* ── Modal Adicionar Membro ── */}
      {addModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setAddModal(false)}>
          <div className="bg-[#1E293B] rounded-xl p-6 max-w-[400px] w-[90%]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#F8FAFC] mb-4">Adicionar a equipe Direx</h3>

            <label className="text-[12px] text-[#94A3B8] block mb-1">Email do profissional</label>
            <input value={addEmail} onChange={e => { setAddEmail(e.target.value); setAddErro(''); }}
              placeholder="email@exemplo.com"
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-3 outline-none placeholder:text-[#64748B]" />

            <label className="text-[12px] text-[#94A3B8] block mb-1">Role</label>
            <select value={addRole} onChange={e => setAddRole(e.target.value)}
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-1 outline-none">
              {ROLES.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
            <p className="text-[10px] text-[#64748B] mb-3">{ROLES.find(r => r.id === addRole)?.desc}</p>

            {addErro && <p className="text-[#F87171] text-xs mb-3">{addErro}</p>}

            <div className="flex gap-2.5">
              <button onClick={() => setAddModal(false)}
                className="px-4 py-2 border border-[#475569] text-[#94A3B8] text-xs font-semibold rounded-md hover:bg-[#334155] transition-colors">
                Cancelar
              </button>
              <button onClick={adicionarMembro} disabled={saving}
                className="px-4 py-2 bg-[#3B82F6] text-white text-xs font-semibold rounded-md hover:bg-[#2563EB] transition-colors disabled:opacity-50">
                {saving ? 'Adicionando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar Role ── */}
      {editModal.open && editModal.prof && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setEditModal({ open: false, prof: null, role: '' })}>
          <div className="bg-[#1E293B] rounded-xl p-6 max-w-[380px] w-[90%]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[#F8FAFC] mb-2">Editar role</h3>
            <p className="text-[12px] text-[#64748B] mb-4">{editModal.prof.nome} ({editModal.prof.email})</p>

            <select value={editModal.role} onChange={e => setEditModal(m => ({ ...m, role: e.target.value }))}
              className="w-full px-3 py-2 bg-[#0F172A] border border-[#334155] rounded-md text-[#E2E8F0] text-sm mb-1 outline-none">
              {ROLES.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
            <p className="text-[10px] text-[#64748B] mb-4">{ROLES.find(r => r.id === editModal.role)?.desc}</p>

            <div className="flex gap-2.5">
              <button onClick={() => setEditModal({ open: false, prof: null, role: '' })}
                className="px-4 py-2 border border-[#475569] text-[#94A3B8] text-xs font-semibold rounded-md hover:bg-[#334155] transition-colors">
                Cancelar
              </button>
              <button onClick={salvarRole} disabled={saving}
                className="px-4 py-2 bg-[#3B82F6] text-white text-xs font-semibold rounded-md hover:bg-[#2563EB] transition-colors disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
