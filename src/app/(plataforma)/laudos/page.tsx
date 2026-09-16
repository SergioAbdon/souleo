'use client';
import PageHeader from '@/components/shell/PageHeader';
import Historico from '@/components/Historico';

export default function LaudosPage() {
  return (
    <>
      <PageHeader titulo="Laudos emitidos" />
      <div className="bg-card border border-borda rounded-xl p-4">
        <Historico />
      </div>
    </>
  );
}
