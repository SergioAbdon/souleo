'use client';
// ══════════════════════════════════════════════════════════════════
// LEO · Pacientes — lista com busca por nome/CPF (Sub-plano 4, Task 1)
// CPF mascarado na lista (só os 2 últimos dígitos); ficha completa em
// /pacientes/{id}. Nenhum dado pessoal na URL nem em console.log.
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getPacientes } from '@/lib/firestore';
import PageHeader from '@/components/shell/PageHeader';

type PacienteItem = Record<string, unknown> & {
  id: string; nome?: string; cpf?: string; nascimento?: string; telefone?: string;
};

function maskCpf(cpf?: string): string {
  const digitos = (cpf || '').replace(/\D/g, '');
  if (digitos.length < 2) return '—';
  return `***.***.***-${digitos.slice(-2)}`;
}

function fmtData(d?: string): string {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

export default function PacientesPage() {
  const { workspace } = useAuth();
  const router = useRouter();
  const wsId = workspace?.id || '';

  const [pacientes, setPacientes] = useState<PacienteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!wsId) return;
    setLoading(true);
    getPacientes(wsId).then(lista => {
      setPacientes(lista as PacienteItem[]);
      setLoading(false);
    });
  }, [wsId]);

  const buscaDigitos = busca.replace(/\D/g, '');
  const filtrados = pacientes.filter(p => {
    if (!busca) return true;
    const nome = (p.nome || '').toLowerCase();
    const cpf = (p.cpf || '').replace(/\D/g, '');
    return nome.includes(busca.toLowerCase()) || (buscaDigitos.length > 0 && cpf.includes(buscaDigitos));
  });

  return (
    <>
      <PageHeader titulo="Pacientes" />
      <div className="bg-card border border-borda rounded-xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <input type="text" placeholder="Buscar por nome ou CPF..."
            value={busca} onChange={e => setBusca(e.target.value)}
            className="flex-1 border border-borda rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:border-p1" />
        </div>

        {loading ? (
          <div className="text-center py-12 text-ink-3">
            <span className="text-3xl animate-pulse">🫀</span>
            <p className="text-sm mt-2">Carregando pacientes...</p>
          </div>
        ) : pacientes.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <p className="text-3xl mb-2">👥</p>
            <p className="text-sm">Nenhum paciente ainda — eles entram automaticamente pelo cadastro da Agenda.</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 text-ink-3">
            <p className="text-sm">Nenhum resultado para &quot;{busca}&quot;</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borda text-xs text-ink-3 uppercase">
                  <th className="py-2 px-3 text-left">Nome</th>
                  <th className="py-2 px-3 text-left w-40">CPF</th>
                  <th className="py-2 px-3 text-left w-28">Nascimento</th>
                  <th className="py-2 px-3 text-left w-36">Telefone</th>
                  <th className="py-2 px-3 text-right w-32">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id} className="border-b border-borda hover:bg-ativo transition">
                    <td className="py-3 px-3 font-semibold text-ink">{p.nome || '—'}</td>
                    <td className="py-3 px-3 text-ink-2 text-xs font-mono">{maskCpf(p.cpf)}</td>
                    <td className="py-3 px-3 text-ink-2 text-xs">{fmtData(p.nascimento)}</td>
                    <td className="py-3 px-3 text-ink-2 text-xs">{p.telefone || '—'}</td>
                    <td className="py-3 px-3 text-right">
                      <button onClick={() => router.push('/pacientes/' + p.id)}
                        className="bg-p2 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-p2-deep transition">
                        Abrir ficha
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
