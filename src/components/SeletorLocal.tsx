'use client';
// Seletor do topo: so aparece com 2+ locais. Troca o local ativo em TODAS as
// telas de uma vez (elas leem do AuthContext).
import { useAuth } from '@/contexts/AuthContext';

export default function SeletorLocal() {
  const { contextos, localAtivo, selecionarLocal } = useAuth();
  if (contextos.length < 2) return null;
  return (
    <select
      value={localAtivo?.workspace.id || ''}
      onChange={e => selecionarLocal(e.target.value)}
      className="bg-white/20 text-white text-xs font-semibold rounded-lg px-3 py-1.5 focus:outline-none"
      title="Trocar de local"
    >
      {contextos.map(ctx => (
        <option key={ctx.workspace.id} value={ctx.workspace.id} className="text-gray-800">
          {ctx.workspace.nomeClinica || 'Consultório'}
        </option>
      ))}
    </select>
  );
}
