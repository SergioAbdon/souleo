'use client';
// ══════════════════════════════════════════════════════════════════
// DIREX · Layout do Painel (autenticado)
// Auth guard + Topbar + Sidebar + Content area
// ══════════════════════════════════════════════════════════════════

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { DirexAuthProvider, useDirexAuth } from '@/contexts/DirexAuthContext';

// ── Itens da sidebar ──
const NAV_ITEMS = [
  { href: '/direx/painel',               label: 'Dashboard',      icon: '\uD83D\uDCCA' },
  { href: '/direx/painel/clientes',      label: 'Clientes',       icon: '\uD83D\uDC65' },
  { href: '/direx/painel/profissionais', label: 'Profissionais',  icon: '\uD83E\uDE7A' },
  { href: '/direx/painel/licencas',      label: 'Licencas',       icon: '\uD83D\uDCCB' },
  { href: '/direx/painel/pagamentos',    label: 'Pagamentos',     icon: '\uD83D\uDCB3' },
  { href: '__sep__' ,                    label: '',               icon: ''              },
  { href: '/direx/painel/financeiro',    label: 'Financeiro',     icon: '\uD83D\uDCC8' },
  { href: '/direx/painel/auditoria',     label: 'Auditoria',      icon: '\uD83D\uDD0D' },
  { href: '/direx/painel/configuracoes', label: 'Configuracoes',  icon: '\u2699\uFE0F' },
];

function isActive(pathname: string, href: string) {
  if (href === '/direx/painel') return pathname === '/direx/painel';
  return pathname.startsWith(href);
}

// ── Loading screen (sem hooks de router) ──
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3 animate-pulse">&#x1FAC0;</div>
        <div className="text-[#64748B] text-sm">Carregando...</div>
      </div>
    </div>
  );
}

// ── Auth guard (redirect via window.location para evitar setState) ──
function AuthGuard({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useDirexAuth();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (user && profile) {
        setAuthorized(true);
      } else {
        window.location.href = '/direx';
      }
    }
  }, [loading, user, profile]);

  if (loading || !authorized) return <LoadingScreen />;
  return <>{children}</>;
}

// ── Shell com sidebar e topbar (so renderiza quando autenticado) ──
function PainelContent({ children }: { children: ReactNode }) {
  const { profile, logout } = useDirexAuth();
  const pathname = usePathname();

  if (!profile) return null;

  const roleBadge = profile.superadmin ? 'Super Admin' : (profile.adminRole || 'Admin');

  return (
    <div className="min-h-screen bg-[#0F172A]">
      {/* ── TOPBAR ── */}
      <header className="bg-[#1E293B] border-b border-[#334155] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-[22px]">&#x1FAC0;</span>
          <span className="text-base font-bold text-[#F8FAFC]">LEO</span>
          <span className="bg-[#F59E0B] text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase">
            {roleBadge}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-[#94A3B8]">
          <span>{profile.nome || profile.email}</span>
          <button
            onClick={async () => { await logout(); window.location.href = '/direx'; }}
            className="px-3.5 py-1.5 rounded-md border border-[#475569] text-[#94A3B8] hover:bg-[#334155] hover:text-[#F8FAFC] text-xs font-semibold transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-52px)]">
        {/* ── SIDEBAR ── */}
        <nav className="w-[220px] bg-[#1E293B] border-r border-[#334155] py-4 flex-shrink-0">
          {NAV_ITEMS.map((item, i) => {
            if (item.href === '__sep__') {
              return <div key={i} className="border-t border-[#334155] mx-3 my-2.5" />;
            }
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 mx-3 mb-0.5 rounded-md text-[13px] transition-colors ${
                  active
                    ? 'bg-[#3B82F6] text-white'
                    : 'text-[#94A3B8] hover:bg-[#334155] hover:text-[#F8FAFC]'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* ── CONTEUDO ── */}
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

// ── Layout exportado ──
export default function PainelLayout({ children }: { children: ReactNode }) {
  return (
    <DirexAuthProvider>
      <AuthGuard>
        <PainelContent>{children}</PainelContent>
      </AuthGuard>
    </DirexAuthProvider>
  );
}
