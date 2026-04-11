'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Dashboard completo
// Topbar + Sidebar + Billing + Worklist + Histórico + Extrato
// ══════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import PerfilModal from '@/components/PerfilModal';
import LocalModal from '@/components/LocalModal';
import Worklist from '@/components/Worklist';
import Historico from '@/components/Historico';
import Extrato from '@/components/Extrato';

type Tab = 'worklist' | 'historico' | 'extrato';

export default function DashboardPage() {
  const { user, profile, workspace, subscription, loading, reloadProfile } = useAuth();
  const router = useRouter();
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('worklist');

  if (loading) return <div className="min-h-screen flex items-center justify-center"><span className="text-4xl animate-pulse">🫀</span></div>;
  if (!user) { router.replace('/login'); return null; }

  const iniciais = (profile?.nome as string || 'U')
    .split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();

  const franquiaUsada = (subscription?.franquiaUsada as number) || 0;
  const franquiaMensal = (subscription?.franquiaMensal as number) || 100;
  const creditosExtras = (subscription?.creditosExtras as number) || 0;
  const planoTipo = (subscription?.tipo as string) || 'Trial';

  return (
    <div className="min-h-screen bg-gray-100">
      {/* TOPBAR */}
      <div className="bg-[#1E3A5F] text-white px-6 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <span className="text-xl">🫀</span>
          <span className="font-bold text-lg">LEO</span>
        </div>
        <div className="text-sm flex items-center gap-4">
          <div className="text-right">
            <div className="font-semibold">{profile?.nome || 'Usuário'}</div>
            {profile?.crm && <div className="text-xs opacity-70">CRM/{profile.ufCrm} {profile.crm}</div>}
          </div>
          <div className="bg-white/20 px-3 py-1.5 rounded-lg text-xs font-semibold">
            {workspace?.nomeClinica || 'Consultório'}
          </div>
        </div>
        <button onClick={() => { auth.signOut(); router.replace('/login'); }}
          className="bg-red-500 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-red-600 transition">
          Sair
        </button>
      </div>

      <div className="max-w-7xl mx-auto mt-6 px-4 flex gap-6">
        {/* SIDEBAR */}
        <div className="w-60 flex-shrink-0 space-y-4">
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white flex items-center justify-center text-xl font-bold mx-auto shadow-md">
              {iniciais}
            </div>
            <h3 className="font-bold text-sm mt-2 text-[#1E3A5F]">{profile?.nome || 'Usuário'}</h3>
            <p className="text-xs text-blue-600 font-semibold capitalize">{profile?.tipoPerfil || 'Médico'}</p>
            <p className="text-xs text-gray-400 mt-1 truncate">{user.email}</p>
            <button onClick={() => setPerfilOpen(true)}
              className="mt-3 border border-gray-300 rounded-lg px-4 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition w-full">
              Editar perfil
            </button>
          </div>

          <div className="bg-white rounded-xl shadow p-4">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Locais de Trabalho</h4>
            <div className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border border-blue-100">
              <div>
                <p className="text-xs font-bold text-[#1E3A5F]">{workspace?.nomeClinica || 'Consultório'}</p>
                <p className="text-[10px] text-gray-400 uppercase">{workspace?.tipo || 'PF'}</p>
              </div>
              <button onClick={() => setLocalOpen(true)} className="text-[10px] text-blue-600 font-semibold hover:underline">Editar</button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-4">
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Assistentes</h4>
            <button className="w-full text-xs text-gray-400 hover:text-blue-600 transition py-1">+ Convidar assistente</button>
          </div>
        </div>

        {/* CONTEÚDO */}
        <div className="flex-1">
          {/* Billing */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Plano</p>
              <p className="text-2xl font-bold text-[#1E3A5F] capitalize">{planoTipo}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Franquia do Mês</p>
              <p className="text-2xl font-bold text-[#1E3A5F]">{franquiaUsada} <span className="text-sm font-normal text-gray-400">/ {franquiaMensal}</span></p>
              <div className="mt-2 bg-gray-200 rounded-full h-1.5">
                <div className="bg-[#2563EB] h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, (franquiaUsada / franquiaMensal) * 100)}%` }} />
              </div>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Créditos Extras</p>
              <p className="text-2xl font-bold text-[#1E3A5F]">{creditosExtras}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Emitidos Hoje</p>
              <p className="text-2xl font-bold text-[#1E3A5F]">0</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl shadow">
            <div className="flex border-b px-4">
              <button onClick={() => setTab('worklist')}
                className={`py-3 px-4 text-sm font-semibold transition border-b-2 ${tab === 'worklist' ? 'text-[#1E3A5F] border-[#1E3A5F]' : 'text-gray-400 border-transparent'}`}>
                📋 Worklist
              </button>
              <button onClick={() => setTab('historico')}
                className={`py-3 px-4 text-sm font-semibold transition border-b-2 ${tab === 'historico' ? 'text-[#1E3A5F] border-[#1E3A5F]' : 'text-gray-400 border-transparent'}`}>
                📁 Histórico
              </button>
              <button onClick={() => setTab('extrato')}
                className={`py-3 px-4 text-sm font-semibold transition border-b-2 ${tab === 'extrato' ? 'text-[#1E3A5F] border-[#1E3A5F]' : 'text-gray-400 border-transparent'}`}>
                📊 Extrato
              </button>
            </div>
            <div className="p-4">
              {tab === 'worklist' && <Worklist />}
              {tab === 'historico' && <Historico />}
              {tab === 'extrato' && <Extrato />}
            </div>
          </div>
        </div>
      </div>

      {/* Modais */}
      <PerfilModal open={perfilOpen} onClose={() => { setPerfilOpen(false); reloadProfile(); }} />
      <LocalModal open={localOpen} onClose={() => setLocalOpen(false)} onSaved={() => window.location.reload()} />
    </div>
  );
}
