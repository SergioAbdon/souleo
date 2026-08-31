'use client';
// ══════════════════════════════════════════════════════════════════
// LEO · Laudo por TEXTO (Sub-plano 3, Task 6)
// Carótidas e demais tipos de modalidade 'texto': editor TipTap
// carregado com o modelo do catálogo — sem motor de medidas.
// Emissão via /api/emitir com pdfHtml (billing idêntico ao motor).
// Tela cheia, fora do route group (plataforma) — como o motor.
// ══════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getExame, saveExame } from '@/lib/firestore';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ehMedico } from '@/lib/permissoes';
import { TIPOS_LAUDO_PADRAO, TipoLaudo, modalidadeDe } from '@/lib/tipos-laudo';
import EditorLaudo from '@/components/laudo/EditorLaudo';
import type { EditorLaudoRef } from '@/components/laudo/EditorLaudo';
import MolduraA4 from '@/components/laudo/MolduraA4';
import { gerarPdfHtmlTexto } from '@/lib/pdf-texto';
import { corSegura } from '@/lib/html-escape';
import { idadeLabel, fmtData, fmtCep, fmtTel } from '@/lib/paciente-fmt';

export default function LaudoTextoPage() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, workspace, loading } = useAuth();
  const [exame, setExame] = useState<Record<string, unknown> | null>(null);
  const [tipo, setTipo] = useState<TipoLaudo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [emitindo, setEmitindo] = useState(false);
  const editorRef = useRef<EditorLaudoRef>(null);
  const pendingHtml = useRef<string | null>(null);
  // S7-T0.3 (E1): mesma trava do laudo do motor — chave por TENTATIVA de
  // emissão, mantida no erro (o retry vira replay sem cobrar) e zerada no
  // sucesso (reemissão deliberada = chave nova = cobra).
  // Presa ao id do exame (M1, mesmo padrão do AnexarPdfModal): navegar de
  // /laudo-texto/A para /laudo-texto/B reusa a instância do componente (mesmo
  // segmento de rota), e o ref sobreviveria — a chave de A viraria trava no B.
  const emissaoKeyRef = useRef<{ id: string; key: string } | null>(null);
  // X18: dirty flag do editor (mesmo padrão do motor) — setada pelo onDirty
  // do EditorLaudo, zerada em salvamento/emissão COM sucesso. Lida só pelo
  // beforeunload abaixo (não há autosave aqui).
  const dirtyRef = useRef(false);

  const exameId = params.id as string;
  // Cabeçalho/rodapé da folha — mesmos dados que vão pro PDF (moldura única).
  const p1 = corSegura((workspace?.corPrimaria as string) || '#8B1A1A');
  const clinicaNome = (workspace?.nomeClinica as string) || 'Consultório';
  const tituloExame = ((tipo?.nome as string) || (exame?.tipoExame as string) || 'LAUDO').toUpperCase();
  const especialidade = ((profile?.especialidade as string) || '').replace(/\\/g, ' e ').replace(/\//g, ' e ');
  const sigTexto = profile
    ? `${profile.nome || ''}\n${especialidade}\nCRM/${profile.ufCrm || ''} ${profile.crm || ''}`
    : '';
  // Idade NA DATA DO EXAME (paridade com o motor) — ver paciente-fmt.
  const idade = idadeLabel(exame?.pacienteDtnasc as string | undefined, exame?.dataExame as string | undefined);
  // Documento FECHADO pro rascunho (trava o "Salvar rascunho").
  //
  // X17: por `status`, não por `emitidoEm` — mesmo critério e razão do
  // `docFechado` do motor (laudo/[id]/page.tsx). `transferirExame` devolve o
  // consumo, apaga o `pdfUrl` e põe `status:'andamento'`, mas MANTÉM o
  // `emitidoEm` — o médico que recebeu o laudo justamente pra refazê-lo
  // ficaria sem "Salvar rascunho" com `|| !!emitidoEm`.
  // Tríade onda-4 (Ponytail item 8): renomeado `emitidoDoc`→`docFechado` e
  // critério ganhou `cancelado` — paridade REAL com o motor, que já travava
  // os dois status (a regra do Firestore recusa gravar em cima de cancelado
  // de qualquer jeito; sem isso aqui o médico só descobria pelo erro cru do
  // servidor em vez de uma mensagem honesta na hora do clique).
  const docFechado = ['emitido', 'cancelado'].includes((exame?.status as string) || '');
  const clinicaEnd = fmtCep((workspace?.endereco as string) || '');
  // 2º telefone do local entrava no rodapé do motor e sumia no laudo-texto —
  // uma folha só, mesmo rodapé (S5-T10).
  const telCompleto = [fmtTel((workspace?.telefone as string) || ''), fmtTel((workspace?.telefone2 as string) || '')]
    .filter(Boolean).join(' / ');

  // Guards em useEffect (padrão do shell — nada de setState no render).
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);
  useEffect(() => {
    // Laudar é ato do médico — recepção volta pra agenda.
    if (profile && !ehMedico(profile)) router.replace('/agenda');
  }, [profile, router]);

  // Carregar exame + tipo do catálogo (rascunho salvo > modelo do tipo > vazio).
  useEffect(() => {
    if (!workspace?.id || !exameId) return;
    // Tríade onda-4 (Codex item 3): zera NA TROCA de exame — mesmo escopo do
    // reset do `emissaoKeyRef` (mais abaixo, comparado por `.id === exameId`
    // no uso). Sem isso, SPA A→B (sem desmontar a página) herdava a dirty-
    // flag do exame A: `handleSalvarRascunho`/beforeunload liam "sujo" pro
    // exame B mesmo sem edição nenhuma nele ainda.
    dirtyRef.current = false;
    (async () => {
      const ex = await getExame(workspace.id, exameId) as Record<string, unknown> | null;
      setExame(ex);
      const tipoId = (ex?.tipoExame as string) || '';
      let t: TipoLaudo | null = null;
      try {
        const snap = await getDoc(doc(db, 'workspaces', workspace.id, 'tiposLaudo', tipoId));
        if (snap.exists()) t = snap.data() as TipoLaudo;
      } catch { /* fallback abaixo */ }
      if (!t) t = TIPOS_LAUDO_PADRAO.find(x => x.id === tipoId) || null;
      setTipo(t);
      // Validação de modalidade: exame de motor não pode usar rota /laudo-texto.
      // `modalidadeDe` (S5-T10) é o mesmo despacho da Worklist/ficha — doc do
      // catálogo sem `modalidade` não cai mais em 'motor' se for carótidas.
      // Aperta de propósito (review M5): antes, tipo COM doc mas SEM
      // `modalidade` ficava aqui; agora segue a mesma resolução da Worklist e
      // da ficha — um só veredito de modalidade no produto inteiro. Tipo
      // desconhecido (`t === null`) continua não sendo expulso da tela.
      if (t && modalidadeDe(t, tipoId) !== 'texto') {
        router.replace('/laudo/' + exameId);
        return;
      }
      pendingHtml.current = (ex?.laudoTextoHtml as string) ?? t?.modeloTexto ?? '';
    })();
  }, [workspace?.id, exameId, router]);

  // Aplicar conteúdo quando o TipTap montar (mesmo padrão do motor:
  // interval vivo enquanto montado — cobre remontagens do editor).
  useEffect(() => {
    const iv = setInterval(() => {
      if (pendingHtml.current !== null && editorRef.current) {
        editorRef.current.setContent(pendingHtml.current);
        pendingHtml.current = null;
      }
    }, 200);
    return () => clearInterval(iv);
  }, []);

  // X18 (beforeunload): portado do motor (laudo/[id]/page.tsx) — avisa se há
  // mudança não salva e o laudo não está emitido. Emitido é documento
  // fechado (reemitir é ato explícito, não fechar a aba); não há o que
  // perder ao sair.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current && !docFechado) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [docFechado]);

  function toast(msg: string) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1E293B;color:#fff;padding:10px 20px;border-radius:9px;font-size:13px;font-weight:600;font-family:IBM Plex Sans,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  async function handleSalvarRascunho() {
    if (!workspace?.id || !user?.uid) return;
    // Laudo ASSINADO não volta pra rascunho (tríade final, I6): este save
    // grava `status:'andamento'` — num emitido isso des-emite em 1 clique
    // (correção administrativa passa a dar 409, some das listas de emitido,
    // não dá mais pra cancelar/estornar). O caminho de mudar um laudo emitido
    // aqui é REEMITIR (botão ao lado, consome 1 franquia) — por isso o editor
    // continua editável, só o "Salvar rascunho" some. Guard além do
    // `disabled` do botão: estado pode chegar depois do render.
    if (docFechado) {
      // Mensagem honesta por status: cancelado nunca teve "Reemitir" (a
      // regra do Firestore recusa gravar em cima dele de qualquer jeito).
      toast((exame?.status as string) === 'cancelado'
        ? 'Laudo cancelado — não é possível salvar rascunho'
        : 'Laudo já emitido — use "Reemitir" para alterar');
      return;
    }
    setSalvando(true);
    const ok = await saveExame(workspace.id, {
      id: exameId,
      laudoTextoHtml: editorRef.current?.getHTML() || '',
      status: 'andamento',
      medicoUid: user.uid,
    }, user.uid);
    setSalvando(false);
    if (ok) dirtyRef.current = false;
    toast(ok ? 'Rascunho salvo' : 'Erro ao salvar rascunho');
  }

  async function handleEmitir() {
    if (!workspace?.id || !user?.uid || !exame) return;
    const jaEmitido = (exame.status as string) === 'emitido';
    const msg = jaEmitido
      ? 'Reemitir o laudo? Uma NOVA franquia será consumida (1 laudo).'
      : 'Emitir o laudo? A emissão consome 1 laudo da franquia.';
    if (!confirm(msg)) return;
    setEmitindo(true);

    const laudoTextoHtml = editorRef.current?.getHTML() || '';

    const pdfHtml = gerarPdfHtmlTexto({
      p1,
      clinicaNome,
      clinicaSlogan: (workspace.slogan as string) || '',
      clinicaEnd,
      clinicaTel: telCompleto,
      logoB64: (workspace.logoB64 as string) || '',
      tituloExame,
      identificacao: {
        nome: (exame.pacienteNome as string) || '—',
        nasc: (exame.pacienteDtnasc as string) || '',
        convenio: (exame.convenio as string) || '',
        solicitante: (exame.solicitante as string) || '',
        dataExame: (exame.dataExame as string) || '',
      },
      htmlCorpo: laudoTextoHtml,
      assinatura: {
        nome: (profile?.nome as string) || '',
        especialidade: (profile?.especialidade as string) || '',
        crm: (profile?.crm as string) || '',
        ufCrm: (profile?.ufCrm as string) || '',
        sigB64: (profile?.sigB64 as string) || '',
      },
    });

    let resultado: { ok: boolean; motivo?: string; pdfErro?: string };
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({
          wsId: workspace.id,
          exameId,
          medicoUid: user.uid,
          dadosFinais: {
            laudoTextoHtml,
            pacienteNome: (exame.pacienteNome as string) || '',
            tipoExame: (exame.tipoExame as string) || '',
            convenio: (exame.convenio as string) || '',
            // `reemissao` não vai mais no corpo — o servidor deriva sozinho
            // (exameSnap × dadosFinais na transação); mandar o flag daqui só
            // reabriria o canal que o achado E3 fechou do lado do cliente.
          },
          // `nomeArq` sai daqui (S5-T14, I3): o servidor deriva o nome do
          // objeto no Storage a partir do tipo + nome do paciente.
          pdfHtml,
          emissaoKey: (emissaoKeyRef.current?.id === exameId
            ? emissaoKeyRef.current
            : (emissaoKeyRef.current = { id: exameId, key: crypto.randomUUID() })).key,
        }),
      });
      resultado = await res.json();
    } catch {
      setEmitindo(false);
      alert('Erro de conexão ao emitir. Tente novamente.');
      return;
    }
    setEmitindo(false);

    if (!resultado.ok) {
      const msgs: Record<string, string> = {
        sem_plano: 'Sem plano ativo. Assine um plano para emitir laudos.',
        expirado: 'Seu plano expirou. Renove para continuar emitindo.',
        sem_saldo: 'Franquia esgotada e sem créditos extras.',
        nao_autenticado: 'Sessão expirada. Entre de novo para emitir.',
        sem_permissao: 'Você não tem permissão de emitir neste local.',
        nao_medico: 'Somente perfil médico assina laudo.',
        exame_de_outro_medico: 'Este laudo é de outro médico. Peça a transferência ao responsável.',
        nao_encontrado: 'Exame não encontrado. Recarregue a lista.',
        cancelado: 'Este laudo foi cancelado. Emitir de novo exige recriar o exame.',
      };
      alert(msgs[resultado.motivo || ''] || 'Erro ao emitir. Tente novamente.');
      return;
    }

    emissaoKeyRef.current = null;   // S7-T0.3: próxima emissão é intenção nova (cobra)
    dirtyRef.current = false;       // X18: emitido com sucesso — nada mais a perder
    alert('Laudo emitido com sucesso!' + (resultado.pdfErro ? '\n(Aviso: o PDF falhou ao gerar — reemita ou contate o suporte.)' : ''));
    router.replace('/agenda');
  }

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center bg-surface"><span className="text-4xl animate-pulse">🫀</span></div>;
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Topo fino — mesmo padrão da mobile-bar do shell */}
      <div className="sticky top-0 z-40 bg-card border-b border-borda px-4 py-2.5 flex items-center gap-3">
        <button onClick={() => router.push('/agenda')} aria-label="Voltar para a agenda"
          className="text-ink-2 hover:text-ink text-sm shrink-0 cursor-pointer">← Voltar</button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-p1 text-sm truncate">{(exame?.pacienteNome as string) || 'Carregando…'}</div>
          <div className="text-xs text-ink-3 truncate">
            {tipo?.nome || (exame?.tipoExame as string) || ''}
            {exame?.acc ? ` · ACC ${exame.acc as string}` : ''}
          </div>
        </div>
        <button onClick={handleSalvarRascunho} disabled={salvando || emitindo || docFechado}
          title={docFechado ? 'Laudo emitido — para alterar, use "Reemitir"' : undefined}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-borda bg-card text-ink text-xs font-semibold hover:bg-surface disabled:opacity-50 cursor-pointer">
          {salvando ? 'Salvando…' : 'Salvar rascunho'}
        </button>
        <button onClick={handleEmitir} disabled={salvando || emitindo}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-p2 text-white text-xs font-semibold hover:bg-p2-deep disabled:opacity-50 cursor-pointer">
          {emitindo ? 'Emitindo…' : (exame?.status === 'emitido' ? 'Reemitir (consome 1 franquia)' : 'Emitir laudo')}
        </button>
      </div>

      {/* Editor dentro da MESMA folha A4 do motor (S5-T10/D6): o médico
          escreve já vendo a moldura que vai sair no PDF. */}
      <div className="bg-[#D8DEE8] overflow-auto p-5">
        <MolduraA4
          p1={p1}
          clinicaNome={clinicaNome}
          clinicaSlogan={(workspace?.slogan as string) || ''}
          clinicaEnd={clinicaEnd}
          clinicaTel={telCompleto}
          sigTexto={sigTexto}
          logoB64={(workspace?.logoB64 as string) || ''}
          sigB64={(profile?.sigB64 as string) || ''}
          titulo={tituloExame}
          identificacao={[
            [
              { label: 'NOME', valor: (exame?.pacienteNome as string) || '', flex: 2 },
              { label: 'IDADE', valor: idade },
              { label: 'DATA DE NASCIMENTO', valor: fmtData(exame?.pacienteDtnasc as string | undefined) },
            ],
            [
              { label: 'CONVÊNIO', valor: (exame?.convenio as string) || '' },
              { label: 'MÉDICO SOLICITANTE', valor: (exame?.solicitante as string) || '' },
              { label: 'DATA DO EXAME', valor: fmtData(exame?.dataExame as string | undefined) },
            ],
          ]}
        >
          <EditorLaudo ref={editorRef} placeholder="Digite o laudo…"
            onDirty={() => { dirtyRef.current = true; }} />
        </MolduraA4>
      </div>
    </div>
  );
}
