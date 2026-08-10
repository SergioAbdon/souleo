'use client';
// Barreira pos-login (A2): 0 locais → aviso; 2+ sem escolha → escolher;
// com local ativo → deixa passar. Fim da fila-vazia-silenciosa (incidente 10/08).
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export default function EscolherLocalGate({ children }: { children: ReactNode }) {
  const { contextos, localAtivo, precisaEscolher, semLocal, selecionarLocal } = useAuth();
  const router = useRouter();

  if (semLocal) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white rounded-xl shadow p-8 text-center">
        <p className="text-4xl">🔒</p>
        <h2 className="text-lg font-bold text-[#1E3A5F] mt-3">Esta conta não tem nenhum local</h2>
        <p className="text-sm text-gray-500 mt-2">
          Você entrou numa conta sem clínica/consultório vinculado. Saia e entre com
          a conta certa para ver a fila.
        </p>
        <button onClick={() => { auth.signOut(); router.replace('/login'); }}
          className="mt-5 bg-[#1E3A5F] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#2563EB] transition">
          Sair e trocar de conta
        </button>
      </div>
    );
  }

  if (precisaEscolher && !localAtivo) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white rounded-xl shadow p-8">
        <h2 className="text-lg font-bold text-[#1E3A5F] text-center">Em qual local você está hoje?</h2>
        <p className="text-sm text-gray-500 text-center mt-1 mb-5">Escolha para ver a fila e emitir laudos.</p>
        <div className="space-y-2">
          {contextos.map(ctx => (
            <button key={ctx.workspace.id} onClick={() => selecionarLocal(ctx.workspace.id)}
              className="w-full text-left border rounded-lg px-4 py-3 hover:border-[#1E3A5F] hover:bg-blue-50 transition">
              <p className="font-semibold text-sm text-[#1E3A5F]">{ctx.workspace.nomeClinica || 'Consultório'}</p>
              <p className="text-xs text-gray-400 uppercase">{(ctx.workspace.tipo as string) || 'PF'}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
