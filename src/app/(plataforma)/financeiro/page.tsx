'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { podeVerFinanceiro } from '@/lib/permissoes';
import PageHeader from '@/components/shell/PageHeader';
import Extrato from '@/components/Extrato';

export default function FinanceiroPage() {
  const { papel, loading } = useAuth();
  const router = useRouter();
  // Recepcao nao ve financeiro (P4/matriz §4) — mesmo gate da aba antiga.
  // Redirect em effect, não no render (evita setState-in-render do Router).
  useEffect(() => {
    if (!loading && !podeVerFinanceiro(papel)) router.replace('/agenda');
  }, [loading, papel, router]);
  if (loading || !podeVerFinanceiro(papel)) return null;

  return (
    <>
      <PageHeader titulo="Financeiro" />
      <div className="bg-card border border-borda rounded-xl p-4">
        <Extrato />
      </div>
    </>
  );
}
