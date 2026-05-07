// ══════════════════════════════════════════════════════════════════
// SOULEO · Direx — Análise Retroativa Shadow Mode
// ══════════════════════════════════════════════════════════════════
// Pega exames emitidos num período e compara com Senna90.
// Sem precisar abrir cada exame manualmente.
// ══════════════════════════════════════════════════════════════════

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';

interface Divergencia {
  categoria: string;
  linha: number;
  velho: string;
  novo: string;
  esperada: boolean;
}

interface ExameAnalise {
  id: string;
  pacienteNome: string;
  emitidoEm: string;
  total: number;
  esperadas: number;
  inesperadas: number;
  divergencias: Divergencia[];
}

interface Resultado {
  resumo: {
    totalExames: number;
    match: number;
    diverge: number;
    totalDivergencias: number;
    totalEsperadas: number;
    totalInesperadas: number;
  };
  exames: ExameAnalise[];
}

export default function RetroativoPage() {
  const { workspace } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Resultado | null>(null);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Default: últimos 7 dias
  useEffect(() => {
    const now = new Date();
    const week = new Date(now);
    week.setDate(week.getDate() - 7);
    setFrom(week.toISOString().slice(0, 10));
    setTo(now.toISOString().slice(0, 10));
  }, []);

  async function rodar() {
    if (!workspace?.id) {
      setError('Workspace não selecionado');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/shadow-retroativo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ wsId: workspace.id, from, to }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'Erro');
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1E3A5F] mb-2">
          🔍 Análise Retroativa — Shadow Mode
        </h1>
        <p className="text-sm text-gray-600">
          Pega os exames emitidos no período e compara com o Senna90.
          Não precisa abrir cada exame — análise direta no banco.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">De:</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Até:</label>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={rodar}
            disabled={loading || !workspace?.id}
            className="px-5 py-2 bg-[#1E3A5F] text-white rounded-lg font-semibold text-sm hover:bg-[#2563EB] transition disabled:opacity-50"
          >
            {loading ? 'Analisando...' : '🔬 Analisar exames'}
          </button>
        </div>
        {workspace && (
          <p className="text-xs text-gray-400 mt-3">
            Workspace: <strong>{String(workspace.nome || workspace.id)}</strong>
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 mt-3">⚠️ {error}</p>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center text-gray-500 py-10">
          Rodando Senna90 em todos os exames do período...
        </div>
      )}

      {/* Resultados */}
      {result && (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-6 gap-3 mb-6">
            <Card titulo="Exames analisados" valor={String(result.resumo.totalExames)} cor="blue" />
            <Card titulo="Match perfeito" valor={String(result.resumo.match)} cor="green" />
            <Card titulo="Divergem" valor={String(result.resumo.diverge)} cor="orange" />
            <Card titulo="Total Divergências" valor={String(result.resumo.totalDivergencias)} cor="purple" />
            <Card titulo="Esperadas" valor={String(result.resumo.totalEsperadas)} cor="blue" />
            <Card titulo="🚨 Inesperadas" valor={String(result.resumo.totalInesperadas)} cor={result.resumo.totalInesperadas > 0 ? 'red' : 'gray'} />
          </div>

          {/* Lista de exames */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-5 py-3 border-b border-gray-200">
              <h2 className="text-base font-semibold text-[#1E3A5F]">
                Exames analisados ({result.exames.length})
              </h2>
            </div>

            {result.exames.length === 0 ? (
              <div className="p-10 text-center text-gray-400 text-sm">
                Nenhum exame emitido no período.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {result.exames.map(ex => (
                  <div key={ex.id}>
                    <div
                      className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition"
                      onClick={() => setExpandedId(expandedId === ex.id ? null : ex.id)}
                    >
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-[#1E3A5F]">
                          {ex.pacienteNome}
                        </p>
                        <p className="text-xs text-gray-500">
                          {ex.emitidoEm ? new Date(ex.emitidoEm).toLocaleString('pt-BR') : '—'} · ID: {ex.id.slice(0, 12)}…
                        </p>
                      </div>
                      <div className="flex gap-3 items-center">
                        {ex.total === 0 ? (
                          <span className="text-green-600 text-sm font-bold">✅ Match</span>
                        ) : (
                          <>
                            <span className="text-xs text-gray-500">Total: <strong>{ex.total}</strong></span>
                            {ex.esperadas > 0 && (
                              <span className="text-xs text-blue-600">Esperadas: <strong>{ex.esperadas}</strong></span>
                            )}
                            {ex.inesperadas > 0 && (
                              <span className="text-xs text-red-600 font-bold">🚨 Inesperadas: {ex.inesperadas}</span>
                            )}
                          </>
                        )}
                        <span className="text-gray-400 text-lg">{expandedId === ex.id ? '▼' : '▸'}</span>
                      </div>
                    </div>

                    {/* Expandido — mostrar divergências */}
                    {expandedId === ex.id && ex.divergencias.length > 0 && (
                      <div className="px-5 py-3 bg-gray-50 border-t border-gray-200">
                        <p className="text-xs font-semibold text-gray-600 mb-2">
                          Divergências detalhadas:
                        </p>
                        <div className="space-y-2">
                          {ex.divergencias.map((d, i) => (
                            <div
                              key={i}
                              className={`text-xs border-l-4 pl-3 py-2 ${
                                d.esperada
                                  ? 'border-blue-400 bg-blue-50'
                                  : 'border-red-500 bg-red-50'
                              }`}
                            >
                              <p className="font-semibold mb-1">
                                {d.esperada ? '✓ Esperada' : '🚨 Inesperada'} · {d.categoria} #{d.linha}
                              </p>
                              <p className="text-gray-600">
                                <strong>Antigo:</strong> {d.velho || '<vazio>'}
                              </p>
                              <p className="text-gray-600">
                                <strong>Senna90:</strong> {d.novo || '<vazio>'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Card({ titulo, valor, cor }: { titulo: string; valor: string; cor: 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'gray' }) {
  const cores = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-700',
    orange: 'bg-orange-50 text-orange-600',
    gray: 'bg-gray-50 text-gray-500',
  };
  return (
    <div className={`rounded-lg p-3 ${cores[cor]}`}>
      <p className="text-[10px] uppercase font-semibold mb-1 opacity-70">{titulo}</p>
      <p className="text-xl font-bold">{valor}</p>
    </div>
  );
}
