'use client';
// Sidebar branca da plataforma (spec §2-3, mockup "sidebar-branca").
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

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile, papel, contextos, workspace, reloadProfile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [contaOpen, setContaOpen] = useState(false);

  const iniciais = (profile?.nome as string || 'U')
    .split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();

  return (
    <aside className="w-56 shrink-0 h-full bg-card border-r border-borda flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-6">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-p1 to-p2 flex items-center justify-center text-base shadow-sm">🫀</div>
        <span className="font-bold text-p1 text-lg tracking-wide">LEO</span>
      </div>

      {/* Seções */}
      <nav className="flex-1 px-3 space-y-1">
        {itensVisiveis(papel).map(item => {
          const ativo = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                ativo ? 'bg-ativo text-p1 font-bold' : 'text-ink-2 font-medium hover:bg-surface'
              }`}>
              <span className="text-base">{item.icone}</span>
              {item.rotulo}
            </Link>
          );
        })}
      </nav>

      {/* Conta (rodapé) */}
      <div className="border-t border-borda px-3 py-3">
        {contaOpen && (
          <div className="mb-2 space-y-1">
            <button onClick={() => { setPerfilOpen(true); setContaOpen(false); }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-ink-2 font-medium hover:bg-surface transition">
              ✏️ Editar perfil
            </button>
            {contextos.length >= 2 && <div className="px-3 py-1"><SeletorLocal /></div>}
            <button onClick={() => { auth.signOut(); router.replace('/login'); }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-critico font-medium hover:bg-red-50 transition">
              ↩ Sair
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
