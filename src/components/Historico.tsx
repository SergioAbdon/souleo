'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Histórico de Laudos Emitidos
// Filtros: workspace, período, convênio, busca nome
// Ações: Ver, Imprimir, Excluir (reabrir é na própria tela do laudo)
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getHistorico, getExame, type HistoricoResult } from '@/lib/firestore';
import { abrirPdfUrl } from '@/lib/pdfUtils';
import { podeCancelarLaudo, podeCorrigirAdministrativo } from '@/lib/permissoes';
import { DocumentSnapshot } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { rotaDoLaudo } from '@/lib/tipos-laudo';
import { postCorrigirLaudo, msgErroCorrecao } from '@/lib/corrigir-laudo-client';
import { useTiposLaudo } from '@/hooks/useTiposLaudo';

type ExameItem = Record<string, unknown> & {
  id: string; pacienteNome?: string; tipoExame?: string;
  dataExame?: string; convenio?: string; solicitante?: string;
  emitidoEm?: { toDate?: () => Date }; medicoUid?: string; status?: string;
  pdfUrl?: string; pdfErro?: string;
};

const TIPOS_EXAME: Record<string, string> = {
  'eco_tt': 'Eco TT',
  'doppler_carotidas': 'Carótidas',
  'eco_te': 'Eco TE',
  'eco_stress': 'Eco Stress',
};

export default function Historico() {
  const { workspace, user, papel, profile } = useAuth();
  const router = useRouter();

  const wsIdSel = workspace?.id || '';
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [convenioSel, setConvenioSel] = useState('');
  const [busca, setBusca] = useState('');
  const [exames, setExames] = useState<ExameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteNome, setDeleteNome] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  // Ruflo-2: espelho do botao "Regerar PDF" do Worklist — laudo emitido
  // (franquia ja cobrada) sem PDF por falha do Puppeteer. Sem isto a
  // recuperacao so existia no mesmo dia (Worklist filtra por `dataSel`); o
  // Historico e onde o laudo emitido continua vivo depois que o dia vira.
  const [regerandoPdf, setRegerandoPdf] = useState<string | null>(null);
  // Anti-corrida: troca de local dispara nova busca; a resposta lenta do local
  // anterior nao pode sobrescrever a lista do local atual.
  const genRef = useRef(0);

  // Catálogo de tipos de laudo (X20, Ponytail-7) — hook compartilhado com
  // Worklist/ficha do paciente. Sem ele, "Ver"/imprimir não tinham como
  // saber a modalidade real do tipo e caíam sempre no motor de eco
  // (rotaDoLaudo precisa do catálogo pra decidir).
  const { tiposMap } = useTiposLaudo(wsIdSel || undefined);

  // v3: Buscar dados com paginacao
  const fetchData = useCallback(async () => {
    if (!wsIdSel) return;
    const meuGen = ++genRef.current;
    setLoading(true);
    setCursor(null);
    const filtros: Record<string, unknown> = { limitN: 50 };
    if (dateFrom) filtros.dateFrom = dateFrom;
    if (dateTo) filtros.dateTo = dateTo;
    if (convenioSel) filtros.convenio = convenioSel;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: HistoricoResult = await getHistorico(wsIdSel, filtros as any);
    if (meuGen !== genRef.current) return;
    setExames(result.items as ExameItem[]);
    setCursor(result.lastDoc as DocumentSnapshot | null);
    setHasMore(result.hasMore);
    setLoading(false);
  }, [wsIdSel, dateFrom, dateTo, convenioSel]);

  async function carregarMais() {
    if (!wsIdSel || !cursor || loadingMore) return;
    const meuGen = genRef.current;
    setLoadingMore(true);
    const filtros: Record<string, unknown> = { limitN: 50, cursor };
    if (dateFrom) filtros.dateFrom = dateFrom;
    if (dateTo) filtros.dateTo = dateTo;
    if (convenioSel) filtros.convenio = convenioSel;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: HistoricoResult = await getHistorico(wsIdSel, filtros as any);
    if (meuGen !== genRef.current) return;
    setExames(prev => [...prev, ...(result.items as ExameItem[])]);
    setCursor(result.lastDoc as DocumentSnapshot | null);
    setHasMore(result.hasMore);
    setLoadingMore(false);
  }

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
        return;
      }
      // X20: despacha pela modalidade real do tipo, não sempre pro motor.
      const rota = rotaDoLaudo(exameId, dados?.tipoExame as string | undefined, tiposMap);
      if (rota) { router.push(rota); return; }
      // Ruflo-1: modalidade 'pdf' nao tem editor proprio (e o pdfUrl acima ja
      // era nulo) — nao ha o que abrir aqui, so anexar pela Worklist.
      alert('Exame de anexo — use a Worklist para anexar o PDF.');
    } catch (e) {
      console.error('Erro ao abrir PDF:', e);
      // Sem `dados` (a leitura falhou) não há tipo pra despachar.
      router.push('/laudo/' + exameId);
    }
  }

  // Botão "👁 Ver" da tabela: mesma lógica do fallback de imprimirPdf, mas
  // parte do que já está carregado na lista (sem round-trip ao Firestore).
  function verLaudo(ex: ExameItem) {
    const rota = rotaDoLaudo(ex.id, ex.tipoExame, tiposMap);
    if (rota) { router.push(rota); return; }
    if (ex.pdfUrl) { abrirPdfUrl(ex.pdfUrl); return; }
    alert('Exame de anexo — use a Worklist para anexar o PDF.');
  }

  // Ruflo-2: mesmo botão/rota do Worklist (Task 6, P4/E4) — regenera o PDF a
  // partir do snapshot congelado na emissão, sem 2a franquia. Usa os
  // helpers compartilhados (Ponytail-6) em vez de reimplementar fetch+token.
  async function regerarPdf(ex: ExameItem) {
    if (!wsIdSel || regerandoPdf) return;
    setRegerandoPdf(ex.id);
    try {
      const r = await postCorrigirLaudo({ wsId: wsIdSel, exameId: ex.id, acao: 'regerar' });
      if (!r.ok) {
        alert(msgErroCorrecao(r.error, 'regerar'));
        return;
      }
      if (r.pdfDesatualizado || r.pdfErro) {
        alert('Snapshot indisponível — reemita o laudo.');
        return;
      }
      setExames(prev => prev.map(e => e.id === ex.id ? { ...e, pdfUrl: r.pdfUrl ?? undefined, pdfErro: undefined } : e));
      alert('PDF regerado com sucesso.');
    } catch {
      alert('Erro de conexão ao regerar o PDF.');
    } finally {
      setRegerandoPdf(null);
    }
  }

  function abrirConfirmDelete(ex: ExameItem) {
    setDeleteId(ex.id);
    setDeleteNome(ex.pacienteNome || 'sem nome');
  }

  async function confirmarDelete() {
    if (!deleteId || !wsIdSel || !user?.uid) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/exame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acao: 'apagar', wsId: wsIdSel, exameId: deleteId }),
      });
      const data = await res.json();
      if (!data.ok) {
        // Antes a falha era silenciosa: a regra negava e o modal so travava.
        alert(data.motivo === 'sem_permissao'
          ? 'Apagar laudo emitido é ação do responsável pela conta.'
          : 'Não foi possível excluir. Tente novamente.');
        setDeleteId(null);
        return;
      }
      setExames(prev => prev.filter(e => e.id !== deleteId));
      setDeleteId(null);
    } catch (e) {
      console.error('Erro ao excluir:', e);
      alert('Não foi possível excluir. Verifique a conexão e tente novamente.');
      setDeleteId(null);
    }
  }

  async function confirmarCancelamento() {
    if (!cancelId || !wsIdSel || !user?.uid) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/exame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acao: 'cancelar', wsId: wsIdSel, exameId: cancelId, motivo: cancelMotivo }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.motivo === 'sem_permissao' ? 'Cancelar laudo é ação do médico autor ou do responsável.' : 'Não foi possível cancelar. Tente novamente.');
        setCancelId(null); return;
      }
      setExames(prev => prev.map(e => e.id === cancelId ? { ...e, status: 'cancelado' } : e));
      setCancelId(null); setCancelMotivo('');
    } catch (e) {
      console.error('Erro ao cancelar:', e);
      alert('Não foi possível cancelar. Verifique a conexão.');
      setCancelId(null);
    }
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
                      {/* X20: rota por modalidade (rotaDoLaudo) — antes ia sempre pro
                          motor de eco, mesmo com laudo de texto/pdf. */}
                      <button onClick={() => verLaudo(ex)}
                        className="bg-green-100 text-green-700 px-2.5 py-1 rounded text-xs font-semibold hover:bg-green-200 transition">
                        👁 Ver
                      </button>
                      <button onClick={() => imprimirPdf(ex.id)}
                        className="bg-gray-100 text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200 transition">
                        🖨️
                      </button>
                      {/* Ruflo-2 (espelho do Worklist, Task 6/P4/E4): laudo
                          emitido com franquia ja cobrada e sem PDF (falha do
                          Puppeteer). Mesmo gate — dono/recepcao OU o
                          medico-autor, que a rota tambem autoriza. */}
                      {(podeCorrigirAdministrativo(papel) || ex.medicoUid === user?.uid) && ex.pdfErro && !ex.pdfUrl && ex.status === 'emitido' && (
                        <button onClick={() => regerarPdf(ex)}
                          className="bg-red-50 text-red-500 px-2.5 py-1 rounded text-xs font-semibold hover:bg-red-100 transition">
                          {regerandoPdf === ex.id ? 'Regerando...' : '🔁 Regerar PDF'}
                        </button>
                      )}
                      <button onClick={() => abrirConfirmDelete(ex)}
                        className="bg-red-50 text-red-500 px-2.5 py-1 rounded text-xs font-semibold hover:bg-red-100 transition">
                        🗑
                      </button>
                      {podeCancelarLaudo(profile, ex, user?.uid || '', papel) && ex.status !== 'cancelado' && (
                        <button onClick={() => setCancelId(ex.id)}
                          className="text-xs text-orange-600 hover:underline">Cancelar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-center text-xs text-gray-400 py-2">
            {filtrados.length} laudo{filtrados.length !== 1 ? 's' : ''} encontrado{filtrados.length !== 1 ? 's' : ''}
            {hasMore && (
              <button onClick={carregarMais} disabled={loadingMore}
                className="ml-3 px-4 py-1 bg-[#1E3A5F] text-white text-xs rounded-lg hover:bg-[#2563EB] transition disabled:opacity-50">
                {loadingMore ? 'Carregando...' : 'Carregar mais'}
              </button>
            )}
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

      {/* Modal cancelar laudo */}
      {cancelId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setCancelId(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E3A5F]">Cancelar laudo</h3>
            <p className="text-sm text-gray-500 mt-1">O laudo deixa de ser servido, a franquia é devolvida e fica registrado. Informe o motivo:</p>
            <input type="text" value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm mt-3 focus:outline-none focus:border-[#1E3A5F]" placeholder="Ex.: exame repetido" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setCancelId(null)} className="flex-1 border rounded-lg py-2 text-sm">Voltar</button>
              <button onClick={confirmarCancelamento} className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-semibold">Cancelar laudo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
