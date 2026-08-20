'use client';
// ══════════════════════════════════════════════════════════════════
// LEO · Integrações — Feegow, Orthanc e Wader (Sub-plano 5, Tasks 2-4)
// Task 2: tela só lê. Task 3: botão "Testar conexão" (exceto Wader, que
// avisa sozinho por batimento) chama /api/integracoes — a credencial
// nunca passa pelo cliente, só o resultado (ok/erro + mensagem). Task 4:
// formulários de Salvar/Remover — write-only (defesa #7c): o campo de
// credencial NUNCA vem preenchido do servidor, só "Cadastrado em X" ou
// "Não cadastrado"; um campo vazio no salvar NÃO apaga o segredo, só
// `acao:'remover'` (com confirm()) apaga. Editor de procedimentos
// migrado do LocalModal (mesmo comportamento, ver ADR Sub-plano 5).
// Gate de tela ecoa podeVerIntegracoes/regra do Firestore, não a substitui.
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { podeVerIntegracoes } from '@/lib/permissoes';
import { TIPOS_INTEGRACAO, rotuloEstado, tomEstado, type Integracao, type TipoIntegracao } from '@/lib/integracoes';
import type { AcaoFeegow } from '@/lib/feegow-admin';
import PageHeader from '@/components/shell/PageHeader';
import CartaoIntegracao from '@/components/integracoes/CartaoIntegracao';

// Timestamp do Firestore -> ms; já em number ou ausente passa direto.
const ms = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | number | null | undefined;
  if (t && typeof t === 'object' && typeof t.toMillis === 'function') return t.toMillis();
  return typeof t === 'number' ? t : null;
};

function normalizar(tipo: TipoIntegracao, data: Record<string, unknown>): Integracao {
  return {
    ...data,
    tipo,
    ultimoTeste: ms(data.ultimoTeste),
    ultimaSync: ms(data.ultimaSync),
    visto: ms(data.visto),
    credencialCadastradaEm: ms(data.credencialCadastradaEm),
  } as Integracao;
}

// Migrado do LocalModal (mesmo comportamento) — smart default por nome do procedimento.
function detectarTipoExame(nome: string): string {
  const n = nome.toLowerCase();
  if (n.includes('transesof')) return 'eco_te';
  if (n.includes('estresse') || n.includes('stress')) return 'eco_stress';
  if (n.includes('carótida') || n.includes('carotida') || n.includes('cervicais')) return 'doppler_carotidas';
  if (n.includes('transtor') || n.includes('trastor')) return 'eco_tt';
  if (n.includes('ecocardiograma') && !n.includes('sincronismo') && !n.includes('marcapasso')) return 'eco_tt';
  return 'ignorar';
}

function rotuloCadastro(cadastradoEm: number | null | undefined): string {
  if (!cadastradoEm) return 'Não cadastrado';
  const d = new Date(cadastradoEm);
  const p = (n: number) => String(n).padStart(2, '0');
  return `Cadastrado em ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const campoInput = 'w-full border border-borda rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-p1 bg-card text-ink';
const botaoSalvar = 'text-xs font-semibold px-3 py-1.5 rounded-lg bg-p2 text-white hover:bg-p2-deep transition disabled:opacity-50 disabled:cursor-not-allowed';
const botaoRemover = 'text-xs font-medium px-3 py-1.5 rounded-lg border border-borda text-ink-3 hover:bg-ativo transition disabled:opacity-50 disabled:cursor-not-allowed';

export default function IntegracoesPage() {
  const { user, workspace, papel, loading: authLoading } = useAuth();
  const wsId = workspace?.id || '';
  // papel so resolve depois do membership carregar (useAuth().loading) — sem
  // isso o dono via "Esta secao e do responsavel" piscar antes do conteudo.
  const podeVer = podeVerIntegracoes(papel);

  const [porTipo, setPorTipo] = useState<Record<string, Integracao>>({});
  const [loading, setLoading] = useState(true);
  const [testando, setTestando] = useState<TipoIntegracao | null>(null);
  const [erroTeste, setErroTeste] = useState<Record<string, string>>({});
  const [removendo, setRemovendo] = useState<TipoIntegracao | null>(null);

  // Feegow: form write-only + editor do mapa de procedimentos + profissionais + liga/desliga.
  const [feegowToken, setFeegowToken] = useState('');
  const [feegowProcMap, setFeegowProcMap] = useState<Record<string, string>>({});
  const [feegowProcs, setFeegowProcs] = useState<Array<{ procedimento_id: number; nome: string }>>([]);
  const [procsLoading, setProcsLoading] = useState(false);
  // profMap migrado do LocalModal (Task 6, D5) — mesmo comportamento: carrega
  // profissionais do Feegow, mapeia id -> nome a aparecer no laudo/DICOM.
  const [feegowProfMap, setFeegowProfMap] = useState<Record<string, string>>({});
  const [feegowProfs, setFeegowProfs] = useState<Array<{ profissional_id: number; nome: string; tratamento?: string; conselho?: string; documento_conselho?: string; uf_conselho?: string }>>([]);
  const [profsLoading, setProfsLoading] = useState(false);
  const [feegowAtivo, setFeegowAtivo] = useState(true);
  const [feegowSalvando, setFeegowSalvando] = useState(false);
  const [feegowErro, setFeegowErro] = useState('');

  // Orthanc: endereço (público) + usuário/senha (write-only) + liga/desliga.
  const [orthancUrl, setOrthancUrl] = useState('');
  const [orthancUser, setOrthancUser] = useState('');
  const [orthancPass, setOrthancPass] = useState('');
  const [orthancAtivo, setOrthancAtivo] = useState(false);
  const [orthancSalvando, setOrthancSalvando] = useState(false);
  const [orthancErro, setOrthancErro] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!wsId || !podeVer) { setLoading(false); return; }
    setLoading(true);
    getDocs(collection(db, 'workspaces', wsId, 'integracoes')).then(snap => {
      const idx: Record<string, Integracao> = {};
      snap.forEach(d => { idx[d.id] = normalizar(d.id as TipoIntegracao, d.data()); });
      setPorTipo(idx);
      // Semeia os campos publicos editaveis (nunca o segredo) so na carga
      // inicial — recarregar() depois de salvar nao pode sobrescrever o que
      // o dono esteja digitando no meio de outra edicao.
      setFeegowProcMap(idx.feegow?.procMap ?? {});
      setFeegowProfMap((idx.feegow?.profMap as Record<string, string> | undefined) ?? {});
      // Ausente = ligado — a migracao (Sub-plano 5, scripts/integracoes/01-migrar.mjs)
      // gravou ativo:!!token pra quem ja tinha token cadastrado.
      setFeegowAtivo((idx.feegow?.ativo as boolean | undefined) ?? true);
      // Ate a migracao da Task 6 rodar, `integracoes/orthanc` pode nao existir
      // ainda enquanto workspaces/{id}.ortancAtivo/ortancUrl (campo antigo)
      // segue valendo em producao — SidebarLaudo.tsx:187 ainda le
      // workspaces/{id}.ortancAtivo direto pra
      // decidir se mostra "Importar DICOM". Sem este fallback aqui o form
      // mente (toggle desligado, endereco vazio) e "Salvar" gravaria
      // ativo:false por cima do que esta ligado de verdade.
      // Pode sair depois que os campos antigos forem limpos (Task 6/8).
      setOrthancUrl(idx.orthanc?.url ?? (workspace?.ortancUrl as string) ?? '');
      setOrthancAtivo(idx.orthanc?.ativo ?? !!workspace?.ortancAtivo);
      setLoading(false);
    });
    // Fallback de workspace?.ortanc* de proposito fora das deps — so na carga
    // inicial (ver comentario acima); reagir a eles reintroduziria o mesmo problema.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId, podeVer, authLoading]);

  // Recarrega SÓ o doc testado (mesma normalizacao do carregamento inicial —
  // senão o cartão faz conta com Timestamp cru e mostra NaN).
  async function recarregar(tipo: TipoIntegracao) {
    const snap = await getDoc(doc(db, 'workspaces', wsId, 'integracoes', tipo));
    if (snap.exists()) setPorTipo(prev => ({ ...prev, [tipo]: normalizar(tipo, snap.data()) }));
  }

  async function testarConexao(tipo: TipoIntegracao) {
    if (!user || testando) return;
    setTestando(tipo);
    setErroTeste(prev => ({ ...prev, [tipo]: '' }));
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/integracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ acao: 'testar', wsId, tipo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErroTeste(prev => ({ ...prev, [tipo]: data?.mensagem || 'Falha ao testar conexão.' }));
        return;
      }
      await recarregar(tipo);
    } catch {
      setErroTeste(prev => ({ ...prev, [tipo]: 'Falha de rede ao testar conexão.' }));
    } finally {
      setTestando(null);
    }
  }

  // Le do token JA SALVO na gaveta (via wsId) -- Sub-plano 5, Task 7: a rota
  // parou de aceitar X-Feegow-Token de header (furo 1), entao "Carregar
  // procedimentos" so funciona depois de Salvar o token pelo menos uma vez.
  async function carregarProcedimentos() {
    if (!user || !wsId) return;
    setProcsLoading(true);
    setFeegowErro('');
    try {
      const idToken = await user.getIdToken();
      const acao: AcaoFeegow = 'procedimentos';
      const res = await fetch(`/api/feegow?action=${acao}&wsId=${wsId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (data.ok && data.procedimentos?.length) {
        setFeegowProcs(data.procedimentos);
        // Só aplica smart defaults se ainda não tem mapa (salvo ou em edição).
        if (Object.keys(feegowProcMap).length === 0) {
          const defaults: Record<string, string> = {};
          for (const p of data.procedimentos) defaults[String(p.procedimento_id)] = detectarTipoExame(p.nome);
          setFeegowProcMap(defaults);
        }
      } else {
        setFeegowErro('Token não reconhecido pelo Feegow — salve o token (botão Salvar) antes de carregar procedimentos.');
      }
    } catch {
      setFeegowErro('Erro ao carregar procedimentos do Feegow.');
    }
    setProcsLoading(false);
  }

  // Le do token JA SALVO na gaveta (via wsId), mesmo padrao de carregarProcedimentos
  // — "Carregar profissionais" so funciona depois de Salvar o token pelo menos uma vez.
  // Migrado do LocalModal (Task 6, D5): profMap deixa de ser config de local.
  async function carregarProfissionais() {
    if (!user || !wsId) return;
    setProfsLoading(true);
    setFeegowErro('');
    try {
      const idToken = await user.getIdToken();
      const acao: AcaoFeegow = 'profissionais';
      const res = await fetch(`/api/feegow?action=${acao}&wsId=${wsId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!data.ok) {
        setFeegowErro('Token não reconhecido pelo Feegow — salve o token (botão Salvar) antes de carregar profissionais.');
      } else if (data.profissionais?.length) {
        setFeegowProfs(data.profissionais);
        if (Object.keys(feegowProfMap).length === 0) {
          const defaults: Record<string, string> = {};
          for (const p of data.profissionais) {
            const tratamento = p.tratamento ? `${p.tratamento} ` : '';
            defaults[String(p.profissional_id)] = `${tratamento}${p.nome}`.trim();
          }
          setFeegowProfMap(defaults);
        }
      } else {
        setFeegowErro('Feegow conectado, mas nenhum profissional ativo foi encontrado.');
      }
    } catch {
      setFeegowErro('Erro ao carregar profissionais do Feegow.');
    }
    setProfsLoading(false);
  }

  async function salvarFeegow() {
    if (!user || !wsId || feegowSalvando) return;
    setFeegowSalvando(true);
    setFeegowErro('');
    try {
      const idToken = await user.getIdToken();
      const procMapLimpo = Object.fromEntries(Object.entries(feegowProcMap).filter(([, v]) => v && v !== 'ignorar'));
      const res = await fetch('/api/integracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          acao: 'salvar', wsId, tipo: 'feegow',
          config: { procMap: procMapLimpo, profMap: feegowProfMap, ativo: feegowAtivo },
          credencial: feegowToken.trim() ? { token: feegowToken.trim() } : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setFeegowErro(data?.mensagem || 'Falha ao salvar Feegow.'); return; }
      setFeegowToken(''); // write-only: nunca fica na tela depois de salvar
      await recarregar('feegow');
    } catch {
      setFeegowErro('Falha de rede ao salvar Feegow.');
    } finally {
      setFeegowSalvando(false);
    }
  }

  async function salvarOrthanc() {
    if (!user || !wsId || orthancSalvando) return;
    setOrthancSalvando(true);
    setOrthancErro('');
    try {
      const idToken = await user.getIdToken();
      const credencial: Record<string, string> = {};
      if (orthancUser.trim()) credencial.user = orthancUser.trim();
      if (orthancPass.trim()) credencial.pass = orthancPass.trim();
      const res = await fetch('/api/integracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          acao: 'salvar', wsId, tipo: 'orthanc',
          config: { url: orthancUrl.trim(), ativo: orthancAtivo },
          credencial: Object.keys(credencial).length > 0 ? credencial : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setOrthancErro(data?.mensagem || 'Falha ao salvar Orthanc.'); return; }
      setOrthancUser(''); setOrthancPass(''); // write-only
      await recarregar('orthanc');
    } catch {
      setOrthancErro('Falha de rede ao salvar Orthanc.');
    } finally {
      setOrthancSalvando(false);
    }
  }

  async function removerCredencialTipo(tipo: 'feegow' | 'orthanc') {
    if (!user || !wsId || removendo) return;
    const aviso = tipo === 'orthanc'
      ? 'Remover a credencial do Orthanc? O Wader para de achar a senha e a importação de imagens DICOM para de funcionar até você cadastrar uma nova.'
      : 'Remover o token do Feegow? A integração com a agenda para de funcionar até você cadastrar um novo token.';
    if (!confirm(aviso)) return;
    setRemovendo(tipo);
    const setErro = tipo === 'orthanc' ? setOrthancErro : setFeegowErro;
    setErro('');
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/integracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ acao: 'remover', wsId, tipo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setErro(data?.mensagem || 'Falha ao remover credencial.'); return; }
      await recarregar(tipo);
    } catch {
      setErro('Falha de rede ao remover credencial.');
    } finally {
      setRemovendo(null);
    }
  }

  // Uma unica leitura do relogio por render: rotuloEstado e tomEstado usam o
  // mesmo `agora`, senao cor e texto podem divergir num render raro.
  const agora = Date.now();

  return (
    <>
      <PageHeader titulo="Integrações" />
      {authLoading || loading ? (
        <div className="text-center py-12 text-ink-3">
          <span className="text-3xl animate-pulse">🔌</span>
          <p className="text-sm mt-2">Carregando integrações...</p>
        </div>
      ) : !podeVer ? (
        <div className="bg-card border border-borda rounded-xl p-4 text-sm text-ink-3">
          Esta seção é do responsável pela conta.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TIPOS_INTEGRACAO.map(t => {
            const i = porTipo[t.id] ?? { tipo: t.id };
            const estado = rotuloEstado(i, agora);
            const tom = tomEstado(i, agora);
            return (
              <CartaoIntegracao key={t.id} icone={t.icone} titulo={t.rotulo} descricao={t.descricao}
                estado={estado} tomEstado={tom}
                acoes={t.id === 'feegow' ? (
                  <button type="button" onClick={() => testarConexao(t.id)} disabled={testando !== null}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg border border-borda text-ink-2 hover:bg-surface transition disabled:opacity-50 disabled:cursor-not-allowed">
                    {testando === t.id ? 'testando…' : '🔌 Testar conexão'}
                  </button>
                ) : undefined}>

                {t.id === 'feegow' && (
                  <div className="space-y-2 border-t border-borda pt-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-ink-3 uppercase">Ativo</label>
                      <button type="button" onClick={() => setFeegowAtivo(v => !v)}
                        className={`relative w-10 h-5 rounded-full transition ${feegowAtivo ? 'bg-p2' : 'bg-borda'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition ${feegowAtivo ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-ink-3 uppercase mb-1">Token da API</label>
                      <input type="password" value={feegowToken} onChange={e => setFeegowToken(e.target.value)}
                        placeholder="Cole o token para substituir" autoComplete="off" className={`${campoInput} font-mono text-xs`} />
                      <p className="text-[11px] text-ink-3 mt-1">{rotuloCadastro(i.credencialCadastradaEm)}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-ink-3">{Object.values(feegowProcMap).filter(v => v && v !== 'ignorar').length} procedimento(s) mapeado(s)</p>
                      <button type="button" onClick={carregarProcedimentos} disabled={procsLoading || i.credencialCadastradaEm == null}
                        title={i.credencialCadastradaEm == null ? 'Salve o token primeiro' : undefined}
                        className={botaoRemover}>
                        {procsLoading ? 'carregando…' : 'Carregar procedimentos'}
                      </button>
                    </div>

                    {feegowProcs.length > 0 && (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {feegowProcs.map(p => (
                          <div key={p.procedimento_id} className="flex items-center gap-2 text-xs">
                            <span className="flex-1 text-ink-2 truncate" title={p.nome}>{p.nome.replace('Exame - ', '')}</span>
                            <select value={feegowProcMap[String(p.procedimento_id)] || 'ignorar'}
                              onChange={e => setFeegowProcMap(prev => ({ ...prev, [String(p.procedimento_id)]: e.target.value }))}
                              className="w-36 border border-borda rounded-lg px-2 py-1 text-xs bg-card text-ink focus:outline-none focus:border-p1">
                              <option value="ignorar">Ignorar</option>
                              <option value="eco_tt">Eco TT</option>
                              <option value="doppler_carotidas">Carótidas</option>
                              <option value="eco_te">Eco TE</option>
                              <option value="eco_stress">Eco Stress</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <p className="text-xs text-ink-3">{Object.keys(feegowProfMap).length} profissional(is) mapeado(s)</p>
                      <button type="button" onClick={carregarProfissionais} disabled={profsLoading || i.credencialCadastradaEm == null}
                        title={i.credencialCadastradaEm == null ? 'Salve o token primeiro' : undefined}
                        className={botaoRemover}>
                        {profsLoading ? 'carregando…' : 'Carregar profissionais'}
                      </button>
                    </div>

                    {feegowProfs.length > 0 && (
                      <div className="space-y-1.5 max-h-44 overflow-y-auto">
                        {feegowProfs.map(p => (
                          <div key={p.profissional_id} className="flex items-center gap-2 text-xs">
                            <span className="w-28 text-ink-3 truncate" title={`${p.conselho || ''} ${p.documento_conselho || ''}/${p.uf_conselho || ''}`}>
                              {p.tratamento || ''} {p.nome.split(' ').slice(0, 2).join(' ')}
                            </span>
                            <input type="text" value={feegowProfMap[String(p.profissional_id)] || ''}
                              onChange={e => setFeegowProfMap(prev => ({ ...prev, [String(p.profissional_id)]: e.target.value }))}
                              placeholder="Nome a aparecer no laudo / DICOM" className={`${campoInput} flex-1`} />
                          </div>
                        ))}
                      </div>
                    )}

                    {feegowErro && <p className="text-xs text-red-600">{feegowErro}</p>}

                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={salvarFeegow} disabled={feegowSalvando} className={botaoSalvar}>
                        {feegowSalvando ? 'salvando…' : 'Salvar'}
                      </button>
                      {i.credencialCadastradaEm != null && (
                        <button type="button" onClick={() => removerCredencialTipo('feegow')} disabled={removendo !== null}
                          className={botaoRemover}>
                          {removendo === 'feegow' ? 'removendo…' : 'Remover credencial'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {t.id === 'orthanc' && (
                  <div className="space-y-2 border-t border-borda pt-3">
                    {/* D1 (corte estrutural, Task 7): a nuvem parou de bater no
                        Orthanc (rede interna da clinica, nunca alcancavel daqui).
                        Quem verifica e reporta agora e o Wader. */}
                    <p className="text-xs text-ink-3">Estado verificado pela máquina da clínica a cada 5 min.</p>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-ink-3 uppercase">Ativo</label>
                      <button type="button" onClick={() => setOrthancAtivo(v => !v)}
                        className={`relative w-10 h-5 rounded-full transition ${orthancAtivo ? 'bg-p2' : 'bg-borda'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition ${orthancAtivo ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-ink-3 uppercase mb-1">Endereço</label>
                      <input type="text" value={orthancUrl} onChange={e => setOrthancUrl(e.target.value)}
                        placeholder="http://192.168.1.100:8042" className={`${campoInput} font-mono text-xs`} />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-ink-3 uppercase mb-1">Usuário</label>
                        <input type="text" value={orthancUser} onChange={e => setOrthancUser(e.target.value)}
                          placeholder="Substituir" autoComplete="off" className={campoInput} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-ink-3 uppercase mb-1">Senha</label>
                        <input type="password" value={orthancPass} onChange={e => setOrthancPass(e.target.value)}
                          placeholder="Substituir" autoComplete="off" className={campoInput} />
                      </div>
                    </div>
                    <p className="text-[11px] text-ink-3">{rotuloCadastro(i.credencialCadastradaEm)}</p>

                    {orthancErro && <p className="text-xs text-red-600">{orthancErro}</p>}

                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={salvarOrthanc} disabled={orthancSalvando} className={botaoSalvar}>
                        {orthancSalvando ? 'salvando…' : 'Salvar'}
                      </button>
                      {i.credencialCadastradaEm != null && (
                        <button type="button" onClick={() => removerCredencialTipo('orthanc')} disabled={removendo !== null}
                          className={botaoRemover}>
                          {removendo === 'orthanc' ? 'removendo…' : 'Remover credencial'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {t.id === 'wader' && (
                  <p className="text-xs text-ink-3">{i.versao ? `v${i.versao}` : 'Versão desconhecida'} · {i.maquina || 'máquina desconhecida'}</p>
                )}
                {erroTeste[t.id] && <p className="text-xs text-red-600">{t.id === 'wader' ? erroTeste[t.id] : `Teste: ${erroTeste[t.id]}`}</p>}
              </CartaoIntegracao>
            );
          })}
        </div>
      )}
    </>
  );
}
