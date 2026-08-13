'use client';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/shell/PageHeader';
import MetricCard from '@/components/shell/MetricCard';
import Worklist from '@/components/Worklist';

export default function AgendaPage() {
  const { subscription } = useAuth();
  const usada = (subscription?.franquiaUsada as number) || 0;
  const mensal = (subscription?.franquiaMensal as number) || 100;

  return (
    <>
      <PageHeader titulo="Agenda do dia" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <MetricCard label="Plano" valor={String((subscription?.tipo as string) || 'Trial')} />
        <MetricCard label="Franquia do mês" valor={usada} sub={`/ ${mensal}`} barraPct={(usada / mensal) * 100} />
        <MetricCard label="Créditos extras" valor={(subscription?.creditosExtras as number) || 0} />
      </div>
      <div className="bg-card border border-borda rounded-xl p-4">
        <Worklist />
      </div>
    </>
  );
}
