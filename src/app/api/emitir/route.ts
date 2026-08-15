// ══════════════════════════════════════════════════════════════════
// LEO v3 · API Route — Emissao atomica de laudo + PDF
// Transacao server-side: emitir exame + cobrar billing atomicamente
// + gerar PDF via Puppeteer e salvar pdfUrl tudo em uma chamada
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { gerarESalvarPdf, salvarPdfBuffer } from '@/lib/pdf-server';
import { validarPdfBase64 } from '@/lib/pdf-validacao';
import { resolverAssinatura } from '@/lib/billing-admin';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';

// ── Config Next.js ──
export const runtime = 'nodejs';
export const maxDuration = 60;

// PDF server-side extraído p/ src/lib/pdf-server.ts
// (reuso entre /api/emitir e /api/corrigir-laudo — 1 pipeline só)

// ── POST Handler ──
export async function POST(req: NextRequest) {
  // Rota aberta ate 10/08/2026: qualquer um POSTava e queimava a franquia de
  // uma clinica alheia (ou emitia laudo assinado no nome de outro medico).
  const uid = await requireUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  const dbAdmin = adminDb();
  try {
    const body = await req.json();
    const { wsId, exameId, dadosFinais, medicoUid, pdfHtml, pdfBase64, nomeArq } = body as {
      wsId: string;
      exameId: string;
      dadosFinais: Record<string, unknown>;
      medicoUid: string;
      pdfHtml?: string;
      pdfBase64?: string;
      nomeArq?: string;
    };

    if (!wsId || !exameId || !medicoUid) {
      return NextResponse.json(
        { ok: false, motivo: 'dados_invalidos', error: 'wsId, exameId e medicoUid sao obrigatorios' },
        { status: 400 }
      );
    }

    // PDF anexado (modalidade 'pdf', Task 5): valida ANTES da transacao de
    // billing abaixo — nao debita franquia de um upload invalido.
    let pdfAnexadoBuf: Buffer | null = null;
    if (pdfBase64) {
      const validacao = validarPdfBase64(pdfBase64);
      if (!validacao.ok) {
        return NextResponse.json({ ok: false, motivo: validacao.motivo }, { status: validacao.status });
      }
      pdfAnexadoBuf = validacao.buf;
    }

    // Autorizacao: papel de medico/dono NESTE local (mesmo criterio da regra
    // `ehMedicoNoLocal`), e o laudo sai assinado por quem esta logado.
    const [papel, perfil] = await Promise.all([
      resolverPapel(dbAdmin, wsId, uid),
      dbAdmin.doc(`profissionais/${uid}`).get(),
    ]);
    if (papel !== 'dono' && papel !== 'medico') {
      return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    }
    if (medicoUid !== uid) {
      return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    }
    // Matriz §4 (D2): quem assina laudo e medico. Dono da conta que e assistente
    // administra tudo menos a caneta. Campo ausente conta como medico — e o
    // default do resto do app (createProfile, dashboard, painel Direx), e exigir
    // presenca travaria perfil antigo em producao.
    if ((perfil.data()?.tipoPerfil ?? 'medico') !== 'medico') {
      return NextResponse.json({ ok: false, motivo: 'nao_medico' }, { status: 403 });
    }

    // ══ 1. TRANSACAO ATOMICA: emitir + cobrar + ledger ══
    // O doc de `consumo` entra NA transacao: era um add() depois, dentro de
    // try/catch silencioso — se falhava, a franquia ficava debitada sem
    // registro e a devolucao liquida (/api/exame) nao tinha o que devolver.
    const consumoRef = dbAdmin.collection('consumo').doc();
    const exameRef = dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`);
    const resultado = await dbAdmin.runTransaction(async (transaction) => {
      // Assinatura por contaId (fallback legado) — mesma chave do /api/exame.
      const assinatura = await resolverAssinatura(dbAdmin, wsId);
      if (!assinatura) {
        return { ok: false, motivo: 'sem_plano' as const };
      }
      const subRef = assinatura.ref;
      // Leituras ANTES de qualquer escrita (exigencia da transacao).
      const [subSnap, exameSnap] = await Promise.all([
        transaction.get(subRef),
        transaction.get(exameRef),
      ]);
      if (!subSnap.exists) {
        return { ok: false, motivo: 'sem_plano' as const };
      }
      if (!exameSnap.exists) {
        return { ok: false, motivo: 'nao_encontrado' as const };
      }
      // Caneta do autor (D2): laudo com autor definido so o proprio emite —
      // igual a regra publicada ("autor ou sem autor"). Sem autor pode assumir.
      const autor = exameSnap.data()!.medicoUid as string | undefined;
      if (autor && autor !== uid) {
        return { ok: false, motivo: 'exame_de_outro_medico' as const };
      }

      const sub = subSnap.data()!;
      const agora = new Date();
      const cicloFim = sub.cicloFim ? (sub.cicloFim as Timestamp).toDate() : null;
      const franquiaUsada = (sub.franquiaUsada as number) || 0;
      const franquiaMensal = (sub.franquiaMensal as number) || 0;
      const creditosExtras = (sub.creditosExtras as number) || 0;

      let tipo: 'franquia' | 'creditos' | null = null;
      if (cicloFim && agora <= cicloFim && franquiaUsada < franquiaMensal) {
        tipo = 'franquia';
      } else if (creditosExtras > 0) {
        tipo = 'creditos';
      } else if (cicloFim && agora > cicloFim && creditosExtras <= 0) {
        return { ok: false, motivo: 'expirado' as const };
      } else {
        return { ok: false, motivo: 'sem_saldo' as const };
      }

      transaction.update(exameRef, {
        ...dadosFinais,
        status: 'emitido',
        emitidoEm: FieldValue.serverTimestamp(),
        medicoUid,
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      if (tipo === 'franquia') {
        transaction.update(subRef, { franquiaUsada: FieldValue.increment(1) });
      } else {
        transaction.update(subRef, { creditosExtras: FieldValue.increment(-1) });
      }

      transaction.set(consumoRef, {
        workspaceId: wsId,
        exameId,
        medicoUid,
        pacienteNome: (dadosFinais.pacienteNome as string) || '',
        tipoExame: (dadosFinais.tipoExame as string) || '',
        convenio: (dadosFinais.convenio as string) || '',
        tipo: tipo === 'franquia' ? 'franquia' : 'credito',
        reemissao: !!(dadosFinais.reemissao),
        emitidoEm: FieldValue.serverTimestamp(),
      });

      return { ok: true, tipo };
    });

    if (!resultado.ok) {
      const status: Record<string, number> = { nao_encontrado: 404, exame_de_outro_medico: 403 };
      return NextResponse.json(resultado, { status: status[resultado.motivo ?? ''] ?? 200 });
    }

    // ══ 2. AUDIT LOG (nao critico) ══
    try {
      await dbAdmin.collection('logs').add({
        tipo: 'emissao',
        exameId,
        wsId,
        reemissao: !!(dadosFinais.reemissao),
        identificacaoAlterada: !!(dadosFinais.identificacaoAlterada),
        ts: FieldValue.serverTimestamp(),
        medicoUid,
      });
    } catch { /* log nao pode quebrar emissao */ }

    // ══ 3. PDF: gerado do HTML (motor/texto) OU anexado pronto (modalidade
    // 'pdf') — nao critico, a emissao ja foi confirmada na transacao acima.
    // Anexo pula o Puppeteer mas passou pela MESMA transacao — franquia,
    // ledger e log num lugar so (decisao: anexo CONSOME franquia, 15/08/2026).
    let pdfUrl: string | null = null;
    let pdfErro: string | null = null;
    if (pdfAnexadoBuf && nomeArq) {
      try {
        pdfUrl = await salvarPdfBuffer(pdfAnexadoBuf, wsId, exameId, nomeArq);
        await dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`).update({ pdfUrl });
      } catch (e) {
        pdfErro = e instanceof Error ? e.message : 'erro_pdf';
        console.error('PDF anexo save error:', pdfErro);
      }
    } else if (pdfHtml && nomeArq) {
      try {
        pdfUrl = await gerarESalvarPdf(pdfHtml, wsId, exameId, nomeArq);
        // Salvar pdfUrl no exame
        await dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`).update({ pdfUrl });
      } catch (e) {
        pdfErro = e instanceof Error ? e.message : 'erro_pdf';
        console.error('PDF gen error:', pdfErro);
      }
    }

    return NextResponse.json({
      ok: true,
      tipo: resultado.tipo,
      pdfUrl,
      pdfErro,
    });
  } catch (e) {
    console.error('API /emitir error:', e);
    const msg = (e as Error).message || 'Erro interno';
    return NextResponse.json({ ok: false, motivo: 'erro', error: msg }, { status: 500 });
  }
}
