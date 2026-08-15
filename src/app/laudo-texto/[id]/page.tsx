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
import { TIPOS_LAUDO_PADRAO, TipoLaudo } from '@/lib/tipos-laudo';
import EditorLaudo from '@/components/laudo/EditorLaudo';
import type { EditorLaudoRef } from '@/components/laudo/EditorLaudo';
import { gerarPdfHtmlTexto } from '@/lib/pdf-texto';

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

  const exameId = params.id as string;

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
      pendingHtml.current = (ex?.laudoTextoHtml as string) ?? t?.modeloTexto ?? '';
    })();
  }, [workspace?.id, exameId]);

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

  function toast(msg: string) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1E293B;color:#fff;padding:10px 20px;border-radius:9px;font-size:13px;font-weight:600;font-family:IBM Plex Sans,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  async function handleSalvarRascunho() {
    if (!workspace?.id || !user?.uid) return;
    setSalvando(true);
    const ok = await saveExame(workspace.id, {
      id: exameId,
      laudoTextoHtml: editorRef.current?.getHTML() || '',
      status: 'andamento',
      medicoUid: user.uid,
    }, user.uid);
    setSalvando(false);
    toast(ok ? 'Rascunho salvo' : 'Erro ao salvar rascunho');
  }

  async function handleEmitir() {
    if (!workspace?.id || !user?.uid || !exame) return;
    if (!confirm('Emitir o laudo? A emissão consome 1 laudo da franquia.')) return;
    setEmitindo(true);

    const laudoTextoHtml = editorRef.current?.getHTML() || '';
    const p1 = (workspace.corPrimaria as string) || '#8B1A1A';
    const clinicaNome = (workspace.nomeClinica as string) || 'Consultório';
    const tituloExame = ((tipo?.nome as string) || (exame.tipoExame as string) || 'LAUDO').toUpperCase();

    const pdfHtml = gerarPdfHtmlTexto({
      p1,
      clinicaNome,
      clinicaSlogan: (workspace.slogan as string) || '',
      clinicaEnd: (workspace.endereco as string) || '',
      clinicaTel: (workspace.telefone as string) || '',
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
            cfgSnapshot: {
              clinica: clinicaNome,
              medNome: profile?.nome, medCrm: profile?.crm, medUf: profile?.ufCrm, p1,
            },
          },
          pdfHtml,
          nomeArq: `laudo-${exameId}`,
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
      };
      alert(msgs[resultado.motivo || ''] || 'Erro ao emitir. Tente novamente.');
      return;
    }

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
        <button onClick={handleSalvarRascunho} disabled={salvando || emitindo}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-borda bg-card text-ink text-xs font-semibold hover:bg-surface disabled:opacity-50 cursor-pointer">
          {salvando ? 'Salvando…' : 'Salvar rascunho'}
        </button>
        <button onClick={handleEmitir} disabled={salvando || emitindo}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-p2 text-white text-xs font-semibold hover:bg-p2-deep disabled:opacity-50 cursor-pointer">
          {emitindo ? 'Emitindo…' : 'Emitir laudo'}
        </button>
      </div>

      {/* Editor — folha única, sem motor de medidas */}
      <div className="max-w-3xl mx-auto p-4 lg:p-6">
        <div className="bg-card border border-borda rounded-xl p-5 lg:p-8 min-h-[60vh]">
          <EditorLaudo ref={editorRef} placeholder="Digite o laudo…" />
        </div>
      </div>
    </div>
  );
}
