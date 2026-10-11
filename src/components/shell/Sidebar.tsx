'use client';
// Sidebar D da plataforma (decisão visual consolidada em 24/09/2026).
// Navegação vem de nav.ts; rodapé = conta (perfil, trocar local, sair).
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { itensVisiveis } from '@/lib/nav';
import { auth } from '@/lib/firebase';
import PerfilModal from '@/components/PerfilModal';
import SeletorLocal from '@/components/SeletorLocal';
import SeloCrm from '@/components/SeloCrm';
import LeoLogo from './LeoLogo';
import NavIcon from './NavIcon';

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile, papel, contextos, workspace, reloadProfile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [contaOpen, setContaOpen] = useState(false);

  const iniciais = (profile?.nome as string || 'U')
    .split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();

  return (
    <aside className="w-56 shrink-0 h-full bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="px-6 pt-6 pb-8">
        <LeoLogo className="w-28 h-auto" />
      </div>

      {/* Seções */}
      <nav className="flex-1 px-3 space-y-1.5">
        {itensVisiveis(papel).map(item => {
          const ativo = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                ativo ? 'bg-card text-p1 font-medium shadow-sm' : 'text-sidebar-ink font-medium hover:bg-card/60'
              }`}>
              <NavIcon name={item.href} />
              {item.rotulo}
            </Link>
          );
        })}
      </nav>

      {/* Conta (rodapé) */}
      <div className="border-t border-sidebar-border px-3 py-4">
        {contaOpen && (
          <div className="mb-2 space-y-1">
            <button onClick={() => { setPerfilOpen(true); setContaOpen(false); }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-ink-2 font-medium hover:bg-surface transition">
              <span className="flex items-center gap-2"><NavIcon name="profile" /> Editar perfil</span>
            </button>
            {contextos.length >= 2 && <div className="px-3 py-1"><SeletorLocal /></div>}
            <button onClick={() => { auth.signOut(); router.replace('/login'); }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-critico font-medium hover:bg-red-50 transition">
              <span className="flex items-center gap-2"><NavIcon name="logout" /> Sair</span>
            </button>
          </div>
        )}
        <button onClick={() => setContaOpen(o => !o)}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface transition text-left">
          <div className="w-8 h-8 rounded-full bg-p1 text-white flex items-center justify-center text-xs font-bold shrink-0">{iniciais}</div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-ink truncate">{(profile?.nome as string) || user?.email || 'Conta'}</div>
            <div className="text-[10px] text-ink-3 truncate flex items-center gap-1">
              {workspace?.nomeClinica as string || ''}<SeloCrm />
            </div>
          </div>
          <span className="ml-auto text-ink-3 text-xs">{contaOpen ? '▾' : '▴'}</span>
        </button>
      </div>

      <PerfilModal open={perfilOpen} onClose={() => { setPerfilOpen(false); reloadProfile(); }} />
    </aside>
  );
}
