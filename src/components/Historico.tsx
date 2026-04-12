'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Histórico de Laudos Emitidos
// Filtros: workspace, período, convênio, busca nome
// Ações: Ver, Imprimir, Editar (reabrir), Excluir
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getHistorico, saveExame, logAction, getExame } from '@/lib/firestore';
import { abrirPdfUrl } from '@/lib/pdfUtils';
import { db } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

type ExameItem = Record<string, unknown> & {
  id: string; pacienteNome?: string; tipoExame?: string;
  dataExame?: string; convenio?: string; solicitante?: string;
  emitidoEm?: { toDate?: () => Date };
};

const TIPOS_EXAME: Record<string, string> = {
  'eco_tt': 'Eco TT',
  'doppler_carotidas': 'Carótidas',
  'eco_te': 'Eco TE',
  'eco_stress': 'Eco Stress',
};

export default function Historico() {
  const { workspace, contextos, user } = useAuth();
  const router = useRouter();

  const [wsIdSel, setWsIdSel] = useState(workspace?.id || '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [convenioSel, setConvenioSel] = useState('');
  const [busca, setBusca] = useState('');
  const [exames, setExames] = useState<ExameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteNome, setDeleteNome] = useState('');

  // Sincronizar wsIdSel com workspace ativo
  useEffect(() => {
    if (workspace?.id && !wsIdSel) setWsIdSel(workspace.id);
  }, [workspace?.id, wsIdSel]);

  // Buscar dados
  const fetchData = useCallback(async () => {
    if (!wsIdSel) return;
    setLoading(true);
    const filtros: Record<string, unknown> = {};
    if (dateFrom) filtros.dateFrom = dateFrom;
    if (dateTo) filtros.dateTo = dateTo;
    if (convenioSel) filtros.convenio = convenioSel;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = await getHistorico(wsIdSel, filtros as any);
    setExames(items as ExameItem[]);
    setLoading(false);
  }, [wsIdSel, dateFrom, dateTo, convenioSel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Convênios disponíveis nos resultados
  const conveniosUnicos = [...new Set(exames.map(e => e.convenio).filter(Boolean))] as string[];

  // Filtro client-side por nome
  const filtrados = busca
    ? exames.filter(ex => (ex.pacienteNome || '').toLowerCase().includes(busca.toLowerCase()))
    : exames;

  function limparFiltros() {
    setDateFrom(''); setDateTo(''); setConvenioSel(''); setBusca('');
  }

  // ── Ações ──

  async function imprimirPdf(exameId: string) {
    if (!wsIdSel) return;
    try {
      const ex = await getExame(wsIdSel, exameId);
      const dados = ex as Record<string, unknown>;
      if (dados?.pdfUrl) {
        abrirPdfUrl(dados.pdfUrl as string);
      } else {
        router.push('/laudo/' + exameId);
      }
    } catch (e) {
      console.error('Erro ao abrir PDF:', e);
      router.push('/laudo/' + exameId);
    }
  }

  async function handleEditar(ex: ExameItem) {
    if (!confirm('Reabrir laudo para edição?\nApenas o corpo do laudo poderá ser alterado.')) return;
    if (!wsIdSel || !user?.uid) return;
    await saveExame(wsIdSel, { id: ex.id, status: 'andamento' }, user.uid);
    await logAction('reabertura_laudo', { exameId: ex.id, wsId: wsIdSel, pacienteNome: ex.pacienteNome }, user.uid);
    router.push('/laudo/' + ex.id);
  }

  function abrirConfirmDelete(ex: ExameItem) {
    setDeleteId(ex.id);
    setDeleteNome(ex.pacienteNome || 'sem nome');
  }

  async function confirmarDelete() {
    if (!deleteId || !wsIdSel || !user?.uid) return;
    await logAction('exclusao_laudo', { exameId: deleteId, wsId: wsIdSel, pacienteNome: deleteNome }, user.uid);
    await deleteDoc(doc(db, 'workspaces', wsIdSel, 'exames', deleteId));
    setExames(prev => prev.filter(e => e.id !== deleteId));
    setDeleteId(null);
  }

  // ── Formatação ──

  function fmtDate(d: string | undefined): string {
    if (!d) return '—';
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
  }

  function fmtEmitido(ex: ExameItem): string {
    try {
      const dt = ex.emitidoEm?.toDate?.();
      if (dt) return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch { /* */ }
    return '—';
  }

  return (
    <div>
      {/* Seletor de workspace */}
      {contextos.length > 1 && (
        <div className="mb-3">
          <select value={wsIdSel} onChange={e => setWsIdSel(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm font-semibold text-[#1E3A5F] focus:outline-none focus:border-[#1E3A5F] w-full">
            {contextos.map(ctx => (
              <option key={ctx.workspace.id} value={ctx.workspace.id}>
                {ctx.workspace.nomeClinica || 'Consultório'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F] w-36"
          title="De" />
        <span className="text-xs text-gray-400">até</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F] w-36"
          title="Até" />
        <select value={convenioSel} onChange={e => setConvenioSel(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F] w-36">
          <option value="">Todos convênios</option>
          {conveniosUnicos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" placeholder="Buscar nome..." value={busca} onChange={e => setBusca(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F] min-w-[150px]" />
        {(dateFrom || dateTo || convenioSel || busca) && (
          <button onClick={limparFiltros}
            className="text-xs text-[#2563EB] hover:underline whitespace-nowrap">Limpar</button>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="text-center py-12 text-gray-300">
          <span className="text-3xl animate-pulse">🫀</span>
          <p className="text-sm mt-2">Carregando histórico...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 text-gray-300">
          <p className="text-3xl mb-2">📁</p>
          <p className="text-sm">{busca ? `Nenhum resultado para "${busca}"` : 'Nenhum laudo emitido'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg overflow-hidden border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-400 uppercase bg-gray-50">
                <th className="py-2 px-3 text-left w-24">Data</th>
                <th className="py-2 px-3 text-left">Paciente</th>
                <th className="py-2 px-3 text-left w-24">Tipo</th>
                <th className="py-2 px-3 text-left w-28">Convênio</th>
                <th className="py-2 px-3 text-left w-36">Emitido em</th>
                <th className="py-2 px-3 text-right w-52">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(ex => (
                <tr key={ex.id} className="border-b hover:bg-gray-50 transition">
                  <td className="py-3 px-3 text-gray-500 text-xs font-mono">{fmtDate(ex.dataExame)}</td>
                  <td className="py-3 px-3">
                    <div className="font-semibold text-[#1E3A5F]">{ex.pacienteNome || '—'}</div>
                  </td>
                  <td className="py-3 px-3 text-gray-500 text-xs">{TIPOS_EXAME[ex.tipoExame as string] || ex.tipoExame}</td>
                  <td className="py-3 px-3 text-gray-500 text-xs">{ex.convenio || '—'}</td>
                  <td className="py-3 px-3 text-gray-400 text-xs">{fmtEmitido(ex)}</td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => router.push('/laudo/' + ex.id)}
                        className="bg-green-100 text-green-700 px-2.5 py-1 rounded text-xs font-semibold hover:bg-green-200 transition">
                        👁 Ver
                      </button>
                      <button onClick={() => imprimirPdf(ex.id)}
                        className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200 transition">
                        🖨️
                      </button>
                      <button onClick={() => abrirConfirmDelete(ex)}
                        className="bg-red-50 text-red-500 px-2.5 py-1 rounded text-xs font-semibold hover:bg-red-100 transition">
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-center text-xs text-gray-400 py-2">
            {filtrados.length} laudo{filtrados.length !== 1 ? 's' : ''} encontrado{filtrados.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Modal confirmar exclusão */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="bg-red-600 text-white px-5 py-3 rounded-t-xl">
              <h2 className="font-bold text-sm">Excluir laudo</h2>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-700">
                Tem certeza que deseja excluir o laudo de <strong>{deleteNome}</strong>?
              </p>
              <p className="text-xs text-red-500 mt-2">Esta ação não pode ser desfeita.</p>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-500 border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={confirmarDelete}
                className="px-6 py-2 text-sm bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
