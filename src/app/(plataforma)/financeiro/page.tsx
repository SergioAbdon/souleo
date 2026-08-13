'use client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { podeVerFinanceiro } from '@/lib/permissoes';
import PageHeader from '@/components/shell/PageHeader';
import Extrato from '@/components/Extrato';

export default function FinanceiroPage() {
  const { papel, loading } = useAuth();
  const router = useRouter();
  if (loading) return null;
  // Recepcao nao ve financeiro (P4/matriz §4) — mesmo gate da aba antiga.
  if (!podeVerFinanceiro(papel)) { router.replace('/agenda'); return null; }

  return (
    <>
      <PageHeader titulo="Financeiro" />
      <div className="bg-card border border-borda rounded-xl p-4">
        <Extrato />
      </div>
    </>
  );
}
