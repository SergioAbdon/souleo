'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { podeGerenciarMembros } from '@/lib/permissoes';
import PageHeader from '@/components/shell/PageHeader';
import MetricCard from '@/components/shell/MetricCard';
import Membros from '@/components/Membros';
import LocalModal from '@/components/LocalModal';

export default function ClinicaPage() {
  const { workspace, subscription, papel } = useAuth();
  const [localOpen, setLocalOpen] = useState(false);
  const gerencia = podeGerenciarMembros(papel);
  const usada = (subscription?.franquiaUsada as number) || 0;
  const mensal = (subscription?.franquiaMensal as number) || 100;

  return (
    <>
      <PageHeader titulo={(workspace?.nomeClinica as string) || 'Clínica'}>
        {gerencia && (
          <button onClick={() => setLocalOpen(true)}
            className="border border-borda bg-card rounded-lg px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-surface transition">
            ⚙️ Editar local
          </button>
        )}
      </PageHeader>

      {gerencia && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <MetricCard label="Plano" valor={String((subscription?.tipo as string) || 'Trial')} />
          <MetricCard label="Franquia do mês" valor={usada} sub={`/ ${mensal}`} barraPct={(usada / mensal) * 100} />
          <MetricCard label="Créditos extras" valor={(subscription?.creditosExtras as number) || 0} />
        </div>
      )}

      {gerencia ? (
        <div className="bg-card border border-borda rounded-xl p-4">
          <Membros />
        </div>
      ) : (
        <div className="bg-card border border-borda rounded-xl p-6 text-sm text-ink-2">
          Você faz parte de <b className="text-ink">{(workspace?.nomeClinica as string) || 'uma clínica'}</b>.
          A gestão de equipe e plano é do responsável pela conta.
        </div>
      )}

      <LocalModal open={localOpen} onClose={() => setLocalOpen(false)} onSaved={() => window.location.reload()} />
    </>
  );
}
