// ══════════════════════════════════════════════════════════════════
// SOULEO · Direx — Painel Shadow Mode
// ══════════════════════════════════════════════════════════════════
// Mostra histórico de comparações entre motor antigo e Senna90.
// Permite ativar/desativar shadow mode e ver divergências.
// ══════════════════════════════════════════════════════════════════

'use client';

import { useState, useEffect } from 'react';

interface HistoricoEntry {
  timestamp: string;
  exameId?: string;
  matched: boolean;
  totalDivergencias: number;
  inesperadas: number;
  esperadas: number;
}

export default function MotorShadowPage() {
  const [ativo, setAtivo] = useState(false);
  const [historico, setHistorico] = useState<HistoricoEntry[]>([]);

  useEffect(() => {
    try {
      const status = localStorage.getItem('leo:shadow-mode') === 'on';
      setAtivo(status);
      const hist = JSON.parse(localStorage.getItem('leo:shadow-mode:historico') || '[]');
      setHistorico(hist);
    } catch { /* */ }
  }, []);

  function toggleShadowMode() {
    const novo = !ativo;
    try {
      localStorage.setItem('leo:shadow-mode', novo ? 'on' : 'off');
      setAtivo(novo);
    } catch { /* */ }
  }

  function limparHistorico() {
    if (!confirm('Limpar todo histórico de shadow mode?')) return;
    try {
      localStorage.removeItem('leo:shadow-mode:historico');
      setHistorico([]);
    } catch { /* */ }
  }

  // Estatísticas
  const total = historico.length;
  const matched = historico.filter(h => h.matched).length;
  const comInesperadas = historico.filter(h => h.inesperadas > 0).length;
  const taxaMatch = total > 0 ? ((matched / total) * 100).toFixed(1) : '—';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1E3A5F] mb-2">
          🌑 Motor Shadow Mode
        </h1>
        <p className="text-sm text-gray-600">
          Histórico de comparações entre motor antigo (motorv8mp4.js) e Senna90 (TS server-side).
          Quando ativo, cada cálculo dispara verificação invisível.
        </p>
      </div>

      {/* Toggle */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#1E3A5F]">
              Shadow Mode: <span className={ativo ? 'text-green-600' : 'text-gray-400'}>
                {ativo ? '✅ ATIVO' : '⚪ INATIVO'}
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {ativo
                ? 'Cada cálculo do motor antigo dispara verificação invisível com o Senna90.'
                : 'Cálculos do motor antigo NÃO disparam verificação. Ative para começar a coletar dados.'}
            </p>
          </div>
          <button
            onClick={toggleShadowMode}
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition ${
              ativo
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            {ativo ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card titulo="Total de execuções" valor={String(total)} cor="blue" />
        <Card titulo="Match (igual)" valor={String(matched)} cor="green" />
        <Card titulo="Com divergências inesperadas" valor={String(comInesperadas)} cor="red" />
        <Card titulo="Taxa de match" valor={`${taxaMatch}%`} cor="purple" />
      </div>

      {/* Histórico */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-[#1E3A5F]">
            Histórico das últimas {historico.length} execuções
          </h2>
          {historico.length > 0 && (
            <button
              onClick={limparHistorico}
              className="text-xs text-red-500 hover:text-red-700 transition"
            >
              🗑 Limpar histórico
            </button>
          )}
        </div>

        {historico.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">
            Nenhuma execução registrada. Ative o Shadow Mode e use o sistema normalmente.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Timestamp</th>
                <th className="px-4 py-2 text-left">Exame</th>
                <th className="px-4 py-2 text-center">Status</th>
                <th className="px-4 py-2 text-center">Total Div.</th>
                <th className="px-4 py-2 text-center">Esperadas</th>
                <th className="px-4 py-2 text-center">Inesperadas</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h, i) => (
                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 transition">
                  <td className="px-4 py-2 text-gray-700 font-mono text-xs">
                    {new Date(h.timestamp).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-2 text-gray-700 font-mono text-xs">
                    {h.exameId ? h.exameId.slice(0, 12) + '…' : '—'}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {h.matched ? (
                      <span className="text-green-600 font-bold">✅ Match</span>
                    ) : (
                      <span className="text-orange-500 font-bold">⚠️ Diverge</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center font-mono">{h.totalDivergencias}</td>
                  <td className="px-4 py-2 text-center font-mono text-blue-600">
                    {h.esperadas}
                  </td>
                  <td className={`px-4 py-2 text-center font-mono ${
                    h.inesperadas > 0 ? 'text-red-600 font-bold' : 'text-gray-400'
                  }`}>
                    {h.inesperadas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legenda */}
      <div className="mt-6 text-xs text-gray-500 bg-gray-50 p-4 rounded-lg">
        <p className="font-semibold mb-2">📖 Glossário:</p>
        <ul className="space-y-1 list-disc pl-5">
          <li><strong>Match:</strong> motor antigo e Senna90 produziram saída idêntica.</li>
          <li><strong>Esperadas:</strong> divergências previstas pelas 13 alterações clínicas aprovadas (DuBois, GLS -20%, RAVI JASE 2025, etc.).</li>
          <li><strong>Inesperadas:</strong> divergências NÃO previstas — investigar (são enviadas pro Sentry).</li>
          <li><strong>Critério pra cutover:</strong> 0 inesperadas em 7 dias consecutivos com 100+ execuções.</li>
        </ul>
      </div>
    </div>
  );
}

function Card({ titulo, valor, cor }: { titulo: string; valor: string; cor: 'blue' | 'green' | 'red' | 'purple' }) {
  const cores = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-700',
  };
  return (
    <div className={`rounded-lg p-4 ${cores[cor]}`}>
      <p className="text-xs uppercase font-semibold mb-1 opacity-70">{titulo}</p>
      <p className="text-2xl font-bold">{valor}</p>
    </div>
  );
}
