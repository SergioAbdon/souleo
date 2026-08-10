// ══════════════════════════════════════════════════════════════════
// LEO v3 · API Route — Emissao atomica de laudo + PDF
// Transacao server-side: emitir exame + cobrar billing atomicamente
// + gerar PDF via Puppeteer e salvar pdfUrl tudo em uma chamada
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { gerarESalvarPdf } from '@/lib/pdf-server';
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
    const { wsId, exameId, dadosFinais, medicoUid, pdfHtml, nomeArq } = body as {
      wsId: string;
      exameId: string;
      dadosFinais: Record<string, unknown>;
      medicoUid: string;
      pdfHtml?: string;
      nomeArq?: string;
    };

    if (!wsId || !exameId || !medicoUid) {
      return NextResponse.json(
        { ok: false, motivo: 'dados_invalidos', error: 'wsId, exameId e medicoUid sao obrigatorios' },
        { status: 400 }
      );
    }

    // Autorizacao: papel de medico/dono NESTE local (mesmo criterio da regra
    // `ehMedicoNoLocal`), e o laudo sai assinado por quem esta logado.
    const papel = await resolverPapel(dbAdmin, wsId, uid);
    if (papel !== 'dono' && papel !== 'medico') {
      return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    }
    if (medicoUid !== uid) {
      return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    }

    // ══ 1. TRANSACAO ATOMICA: emitir + cobrar + ledger ══
    // O doc de `consumo` entra NA transacao: era um add() depois, dentro de
    // try/catch silencioso — se falhava, a franquia ficava debitada sem
    // registro e a devolucao liquida (/api/exame) nao tinha o que devolver.
    const consumoRef = dbAdmin.collection('consumo').doc();
    const resultado = await dbAdmin.runTransaction(async (transaction) => {
      // Assinatura por contaId (fallback legado) — mesma chave do /api/exame.
      const assinatura = await resolverAssinatura(dbAdmin, wsId);
      if (!assinatura) {
        return { ok: false, motivo: 'sem_plano' as const };
      }
      const subRef = assinatura.ref;
      const subSnap = await transaction.get(subRef);
      if (!subSnap.exists) {
        return { ok: false, motivo: 'sem_plano' as const };
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

      const exameRef = dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`);
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
      return NextResponse.json(resultado);
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

    // ══ 3. GERAR PDF (nao critico - emissao ja foi confirmada) ══
    let pdfUrl: string | null = null;
    let pdfErro: string | null = null;
    if (pdfHtml && nomeArq) {
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
