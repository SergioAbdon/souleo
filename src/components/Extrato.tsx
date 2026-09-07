'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Extrato de Honorários
// Filtros: workspace/local, período
// Tabela detalhada + resumo por convênio + valores editáveis
// Billing: 1 extrato grátis/mês/local
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { DocumentSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { getHistorico, getHonorarios, saveHonorarios, getExtratoContador, incrementarExtrato, logAction, anoMesAtual } from '@/lib/firestore';
import { checkExtratoLimit } from '@/lib/billing';
import type { HonorariosConfig } from '@/lib/firestore';
import { podeVerFinanceiro } from '@/lib/permissoes';
// Mesmo escape same-origin do X11/X12 — este HTML vira document.write (about:blank
// herda a origem do app) e paciente/convênio/local são graváveis pela recepção.
import { escaparHtml } from '@/lib/html-escape';

type ExameItem = Record<string, unknown> & {
  id: string; pacienteNome?: string; tipoExame?: string;
  dataExame?: string; convenio?: string;
  emitidoEm?: { toDate?: () => Date };
};

const TIPOS_EXAME: Record<string, string> = {
  'eco_tt': 'Eco TT',
  'doppler_carotidas': 'Carótidas',
  'eco_te': 'Eco TE',
  'eco_stress': 'Eco Stress',
};

export default function Extrato() {
  const { workspace, papel, user } = useAuth();

  const wsIdSel = workspace?.id || '';
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exames, setExames] = useState<ExameItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [honorarios, setHonorarios] = useState<HonorariosConfig>({ convenios: {}, valorUnico: null });
  const [usarValorUnico, setUsarValorUnico] = useState(false);
  const [valorUnicoInput, setValorUnicoInput] = useState('');
  const [editandoValores, setEditandoValores] = useState(false);
  const [salvandoValores, setSalvandoValores] = useState(false);
  const [extratoInfo, setExtratoInfo] = useState({ emitidos: 0, mes: '' });
  const [gerado, setGerado] = useState(false);
  const [gerandoExtrato, setGerandoExtrato] = useState(false);
  // Anti-corrida: troca de local dispara nova carga; a resposta lenta do local
  // anterior nao pode sobrescrever honorarios/contador — o contador stale
  // chegaria a gerar/logar cobranca pro local errado. (Exames: consultaGenRef.)
  const genRef = useRef(0);
  // Corrida da CONSULTA (handleConsultar × troca de filtros): domínio separado
  // do genRef de honorários — na troca de local os dois effects rodam no mesmo
  // commit e um ref único fazia o reset invalidar a resposta de honorários.
  const consultaGenRef = useRef(0);
  // De qual local sao os `exames` exibidos. Na janela de troca, wsIdSel ja e o
  // B mas os exames ainda sao do A; so gera extrato quando batem.
  const carregadoWsId = useRef('');

  // Carregar honorários quando muda workspace
  useEffect(() => {
    if (!wsIdSel) return;
    const meuGen = ++genRef.current;
    getHonorarios(wsIdSel).then(h => {
      if (meuGen !== genRef.current) return;
      setHonorarios(h);
      setUsarValorUnico(h.valorUnico !== null);
      setValorUnicoInput(h.valorUnico !== null ? String(h.valorUnico) : '');
    });
    const anoMes = anoMesAtual();
    setExtratoInfo(prev => ({ ...prev, mes: anoMes }));
    getExtratoContador(wsIdSel, anoMes).then(c => {
      if (meuGen !== genRef.current) return;
      setExtratoInfo({ emitidos: c.emitidos, mes: anoMes });
    });
  }, [wsIdSel]);

  // Buscar exames — só quando clica "Consultar". Percorre TODAS as páginas
  // (C1: teto fixo de 500 truncava período movimentado e o extrato saía com
  // total errado). meuGen = ++consultaGenRef (C3): consulta nova ou troca de
  // datas invalida a resposta lenta da anterior.
  async function handleConsultar() {
    if (!wsIdSel || !dateFrom || !dateTo) return;
    const meuGen = ++consultaGenRef.current;
    setLoading(true);
    setGerado(false);
    const todos: ExameItem[] = [];
    let cursor: DocumentSnapshot | null = null;
    // ponytail: teto de 40 paginas (20.000 laudos) — acima disso é uso fora da
    // curva; se o teto for atingido com dados ainda por vir, ABORTA com aviso
    // em vez de publicar um extrato truncado como se fosse o período inteiro.
    let completo = false;
    for (let pag = 0; pag < 40; pag++) {
      const result = await getHistorico(wsIdSel, { dateFrom, dateTo, limitN: 500, cursor });
      if (meuGen !== consultaGenRef.current) return;
      if (result.erro) {
        setLoading(false);
        alert('Não foi possível consultar os exames. Tente novamente.');
        return;
      }
      todos.push(...(result.items as ExameItem[]));
      cursor = result.lastDoc as DocumentSnapshot | null;
      if (!result.hasMore) { completo = true; break; }
    }
    if (!completo) {
      setLoading(false);
      alert('Período com laudos demais para um único extrato — divida em períodos menores.');
      return;
    }
    setExames(todos);
    carregadoWsId.current = wsIdSel;
    setLoading(false);
    setGerado(true);
  }

  // Resetar quando muda filtros — e invalidar consulta em voo (C3): sem o ++,
  // a resposta lenta do período antigo preenchia a tela e o extrato saía
  // rotulado com as datas novas. setLoading(false) aqui: o runner invalidado
  // sai no guard sem tocar em estado, então o dono do reset é este effect.
  // consultaGenRef (nao genRef): esse effect roda no mesmo commit do effect de
  // honorários na troca de local — um ref compartilhado invalidava a resposta
  // de honorários que acabou de capturar seu proprio meuGen.
  useEffect(() => { consultaGenRef.current++; setLoading(false); setGerado(false); setExames([]); }, [wsIdSel, dateFrom, dateTo]);

  // Nome do workspace selecionado
  const wsNome = workspace?.nomeClinica || 'Consultório';

  // Agrupar por convênio
  const resumo = exames.reduce<Record<string, number>>((acc, ex) => {
    const conv = (ex.convenio as string) || 'SEM CONVÊNIO';
    acc[conv] = (acc[conv] || 0) + 1;
    return acc;
  }, {});

  // Obter valor de um convênio
  function getValor(conv: string): number {
    if (usarValorUnico && honorarios.valorUnico !== null) return honorarios.valorUnico;
    return honorarios.convenios[conv] || 0;
  }

  // Total geral
  const totalGeral = Object.entries(resumo).reduce((sum, [conv, qtd]) => sum + qtd * getValor(conv), 0);

  // Atualizar valor de convênio local
  function setValorConvenio(conv: string, valor: string) {
    const num = Math.max(0, parseFloat(valor) || 0);
    setHonorarios(prev => ({
      ...prev,
      convenios: { ...prev.convenios, [conv]: num }
    }));
  }

  // Salvar valores
  async function handleSalvarValores() {
    if (!wsIdSel) return;
    setSalvandoValores(true);
    const config: HonorariosConfig = {
      convenios: honorarios.convenios,
      valorUnico: usarValorUnico ? Math.max(0, parseFloat(valorUnicoInput) || 0) : null,
    };
    await saveHonorarios(wsIdSel, config);
    setHonorarios(config);
    setEditandoValores(false);
    setSalvandoValores(false);
  }

  // Toggle valor único
  function handleToggleValorUnico() {
    const novo = !usarValorUnico;
    setUsarValorUnico(novo);
    if (novo) {
      const val = Math.max(0, parseFloat(valorUnicoInput) || 0);
      setHonorarios(prev => ({ ...prev, valorUnico: val }));
    } else {
      setHonorarios(prev => ({ ...prev, valorUnico: null }));
    }
  }

  // Gerar extrato (imprimir). Ordem importa: window.open ANTES de qualquer
  // await (C10 — popup fora do gesto do clique era bloqueado e a contagem já
  // tinha acontecido); trava de duplo-clique (C4); erro do checkExtratoLimit
  // aborta em vez de contar às cegas (C14).
  async function handleGerarExtrato() {
    if (!wsIdSel || !user?.uid || gerandoExtrato) return;
    // Nao cobrar/logar o local B com os exames ainda do A (janela de troca).
    if (carregadoWsId.current !== wsIdSel) {
      alert('Aguarde os dados do local carregarem.');
      return;
    }
    const win = window.open('', '_blank');
    if (!win) {
      alert('O navegador bloqueou a janela do extrato. Habilite popups para este site e tente de novo.');
      return;
    }
    setGerandoExtrato(true);
    // Mes calculado UMA vez: viaja do check ao incremento (achado triade —
    // clique na virada do mes verificava um mes e incrementava o seguinte).
    const anoMes = anoMesAtual();
    try {
      const limiteExtrato = await checkExtratoLimit(wsIdSel, anoMes);
      if (!limiteExtrato.pode) {
        win.close();
        alert('Não foi possível verificar seu plano. Tente novamente.');
        return;
      }
      if (!limiteExtrato.gratis && limiteExtrato.custo > 0) {
        const msg = `Voce ja usou ${limiteExtrato.usados} de ${limiteExtrato.franquia} extrato(s) gratis neste mes.\nO proximo custara R$ ${limiteExtrato.custo.toFixed(2)}.\n\nDeseja continuar?`;
        if (!confirm(msg)) { win.close(); return; }
      }
      await incrementarExtrato(wsIdSel, anoMes);
      await logAction('extrato_emitido', { wsId: wsIdSel, periodo: `${dateFrom} a ${dateTo}`, totalExames: exames.length, totalValor: totalGeral }, user.uid);
      setExtratoInfo(prev => prev.mes === anoMes
        ? { mes: anoMes, emitidos: prev.emitidos + 1 }
        : { mes: anoMes, emitidos: 1 });
      win.document.write(gerarHtmlExtrato());
      win.document.close();
    } finally {
      setGerandoExtrato(false);
    }
  }

  // Tríade onda-3 (Codex-2 Important): fmtDate/fmtEmitido entravam CRUS —
  // dataExame é campo administrativo (recepção grava, exame não-emitido) e
  // fmtDate devolve o valor BRUTO sem formatar quando não bate o formato
  // AAAA-MM-DD esperado (`p.length === 3`), então um payload em dataExame
  // chegava intacto no document.write. Regra: todo `${...}` de dado
  // dinâmico passa por escaparHtml, sem exceção "esse aqui é só uma data".
  function gerarHtmlExtrato(): string {
    const wsNomeEsc = escaparHtml(wsNome);
    const linhas = exames.map(ex => {
      const conv = (ex.convenio as string) || 'SEM CONVÊNIO';
      return `<tr>
        <td>${escaparHtml(fmtDate(ex.dataExame))}</td>
        <td>${escaparHtml(fmtEmitido(ex))}</td>
        <td>${escaparHtml(ex.pacienteNome || '—')}</td>
        <td>${escaparHtml(TIPOS_EXAME[ex.tipoExame as string] || ex.tipoExame || '—')}</td>
        <td>${escaparHtml(conv)}</td>
      </tr>`;
    }).join('');

    const resumoLinhas = Object.entries(resumo).map(([conv, qtd]) => {
      const val = getValor(conv);
      return `<tr>
        <td>${qtd}</td>
        <td>${escaparHtml(conv)}</td>
        <td>R$ ${val.toFixed(2)}</td>
        <td><strong>R$ ${(qtd * val).toFixed(2)}</strong></td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Extrato - ${wsNomeEsc}</title>
    <style>
      body { font-family: 'IBM Plex Sans', Arial, sans-serif; padding: 30px; color: #1E3A5F; }
      h1 { font-size: 18px; margin-bottom: 5px; }
      h2 { font-size: 14px; color: #555; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
      th { background: #1E3A5F; color: white; padding: 6px 8px; text-align: left; }
      td { padding: 5px 8px; border-bottom: 1px solid #eee; }
      .resumo th { background: #2563EB; }
      .total { font-size: 16px; font-weight: bold; text-align: right; margin-top: 10px; }
      @media print { body { padding: 10px; } }
    </style></head><body>
    <h1>Extrato de Honorários — ${wsNomeEsc}</h1>
    <h2>Período: ${escaparHtml(fmtDate(dateFrom))} a ${escaparHtml(fmtDate(dateTo))}</h2>
    <table><thead><tr><th>Data Exame</th><th>Emitido em</th><th>Paciente</th><th>Tipo</th><th>Convênio</th></tr></thead>
    <tbody>${linhas}</tbody></table>
    <h2>Resumo por Convênio</h2>
    <table class="resumo"><thead><tr><th>Qtd</th><th>Convênio</th><th>Valor Unit.</th><th>Total</th></tr></thead>
    <tbody>${resumoLinhas}</tbody></table>
    <div class="total">TOTAL: ${exames.length} exames — R$ ${totalGeral.toFixed(2)}</div>
    <script>window.print();</script>
    </body></html>`;
  }

  // Formatação
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

  if (!podeVerFinanceiro(papel)) {
    return (
      <div className="text-center text-gray-400 py-12 text-sm">
        O extrato financeiro é restrito a médicos e ao responsável pela conta.
      </div>
    );
  }

  return (
    <div>
      {/* Filtros de período */}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-xs text-gray-500">De</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F] w-40" />
        <label className="text-xs text-gray-500">Até</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F] w-40" />
        <button onClick={handleConsultar} disabled={!dateFrom || !dateTo || loading}
          className="bg-[#2563EB] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40 whitespace-nowrap">
          {loading ? 'Consultando...' : '🔍 Consultar'}
        </button>
      </div>

      {/* Info billing do extrato */}
      <div className="text-xs text-gray-400 mb-3">
        {extratoInfo.emitidos === 0
          ? `Nenhum extrato emitido em ${wsNome} neste mês (1 grátis)`
          : `${extratoInfo.emitidos} extrato(s) emitido(s) em ${wsNome} neste mês${extratoInfo.emitidos >= 1 ? ' — próximo será cobrado' : ''}`}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="text-center py-12 text-gray-300">
          <span className="text-3xl animate-pulse">🫀</span>
          <p className="text-sm mt-2">Consultando exames...</p>
        </div>
      ) : !gerado ? (
        <div className="text-center py-12 text-gray-300">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm">Selecione o período e clique em Consultar</p>
        </div>
      ) : exames.length === 0 ? (
        <div className="text-center py-12 text-gray-300">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm">Nenhum laudo emitido neste período</p>
        </div>
      ) : (
        <>
          {/* Tabela detalhada */}
          <div className="bg-white rounded-lg overflow-hidden border border-gray-100 mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-400 uppercase bg-gray-50">
                  <th className="py-2 px-3 text-left w-24">Data exame</th>
                  <th className="py-2 px-3 text-left w-36">Emitido em</th>
                  <th className="py-2 px-3 text-left">Paciente</th>
                  <th className="py-2 px-3 text-left w-20">Tipo</th>
                  <th className="py-2 px-3 text-left w-28">Convênio</th>
                </tr>
              </thead>
              <tbody>
                {exames.map(ex => (
                  <tr key={ex.id} className="border-b hover:bg-gray-50 transition">
                    <td className="py-2.5 px-3 text-gray-500 text-xs font-mono">{fmtDate(ex.dataExame)}</td>
                    <td className="py-2.5 px-3 text-gray-400 text-xs">{fmtEmitido(ex)}</td>
                    <td className="py-2.5 px-3 font-semibold text-[#1E3A5F] text-xs">{ex.pacienteNome || '—'}</td>
                    <td className="py-2.5 px-3 text-gray-500 text-xs">{TIPOS_EXAME[ex.tipoExame as string] || ex.tipoExame}</td>
                    <td className="py-2.5 px-3 text-gray-500 text-xs">{ex.convenio || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-center text-xs text-gray-400 py-2">
              {exames.length} exame{exames.length !== 1 ? 's' : ''} no período
            </div>
          </div>

          {/* Resumo por convênio */}
          <div className="bg-white rounded-lg border border-gray-100 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-[#1E3A5F]">Resumo por Convênio</h3>
              <button onClick={() => setEditandoValores(!editandoValores)}
                className="text-xs text-[#2563EB] font-semibold hover:underline">
                {editandoValores ? 'Cancelar' : '⚙️ Editar valores'}
              </button>
            </div>

            {/* Toggle valor único */}
            {editandoValores && (
              <div className="mb-3 p-2 bg-blue-50 rounded-lg">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={usarValorUnico} onChange={handleToggleValorUnico}
                    className="rounded" />
                  <span className="font-semibold text-[#1E3A5F]">Usar valor único para todos os convênios</span>
                </label>
                {usarValorUnico && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500">R$</span>
                    <input type="number" step="0.01" min="0" value={valorUnicoInput}
                      onChange={e => {
                        setValorUnicoInput(e.target.value);
                        setHonorarios(prev => ({ ...prev, valorUnico: Math.max(0, parseFloat(e.target.value) || 0) }));
                      }}
                      className="border rounded px-2 py-1 text-sm w-24 focus:outline-none focus:border-[#1E3A5F]" />
                  </div>
                )}
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-gray-400 uppercase">
                  <th className="py-2 text-left">Qtd</th>
                  <th className="py-2 text-left">Convênio</th>
                  <th className="py-2 text-left w-28">Valor unit.</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(resumo).map(([conv, qtd]) => {
                  const val = getValor(conv);
                  return (
                    <tr key={conv} className="border-b">
                      <td className="py-2 font-semibold text-[#1E3A5F]">{qtd}</td>
                      <td className="py-2 text-gray-600">{conv}</td>
                      <td className="py-2">
                        {editandoValores && !usarValorUnico ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400">R$</span>
                            <input type="number" step="0.01" min="0"
                              value={honorarios.convenios[conv] || ''}
                              onChange={e => setValorConvenio(conv, e.target.value)}
                              className="border rounded px-2 py-0.5 text-sm w-20 focus:outline-none focus:border-[#1E3A5F]" />
                          </div>
                        ) : (
                          <span className="text-gray-500">R$ {val.toFixed(2)}</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-bold text-[#1E3A5F]">R$ {(qtd * val).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Total geral */}
            <div className="flex justify-between items-center mt-3 pt-3 border-t-2 border-[#1E3A5F]">
              <span className="font-bold text-[#1E3A5F]">TOTAL: {exames.length} exames</span>
              <span className="font-bold text-lg text-[#1E3A5F]">R$ {totalGeral.toFixed(2)}</span>
            </div>

            {/* Botão salvar valores */}
            {editandoValores && (
              <div className="mt-3 flex justify-end">
                <button onClick={handleSalvarValores} disabled={salvandoValores}
                  className="bg-[#2563EB] text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 transition disabled:opacity-50">
                  {salvandoValores ? 'Salvando...' : 'Salvar valores'}
                </button>
              </div>
            )}
          </div>

          {/* Botão gerar extrato */}
          <div className="flex justify-center">
            <button onClick={handleGerarExtrato} disabled={gerandoExtrato}
              className="bg-[#1E3A5F] text-white px-8 py-3 rounded-lg font-semibold hover:bg-[#2563EB] transition flex items-center gap-2 disabled:opacity-50">
              {gerandoExtrato ? 'Gerando...' : '🖨️ Gerar Extrato'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
