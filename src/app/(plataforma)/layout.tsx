'use client';
// Shell da plataforma (spec §3): sidebar fixa em telas largas, drawer em
// estreitas. Auth guard + EscolherLocalGate aqui — as páginas só têm conteúdo.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/shell/Sidebar';
import EscolherLocalGate from '@/components/EscolherLocalGate';

export default function PlataformaLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  // Redirect em effect, não no render (o padrão antigo do dashboard disparava
  // "Cannot update Router while rendering" no console).
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><span className="text-4xl animate-pulse">🫀</span></div>;
  if (!user) return null;

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar fixa (lg+) */}
      <div className="hidden lg:block h-full">
        <Sidebar />
      </div>

      {/* Drawer (< lg) */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0" onClick={e => e.stopPropagation()}>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        {/* Barra fina só no mobile, pra abrir o drawer */}
        <div className="lg:hidden sticky top-0 z-40 bg-card border-b border-borda px-4 py-2.5 flex items-center gap-3">
          <button onClick={() => setDrawer(true)} aria-label="Abrir menu"
            className="text-ink-2 text-lg leading-none">☰</button>
          <span className="font-bold text-p1">LEO</span>
        </div>
        <main className="p-5 lg:p-7 max-w-6xl mx-auto">
          <EscolherLocalGate>{children}</EscolherLocalGate>
        </main>
      </div>
    </div>
  );
}
