// ══════════════════════════════════════════════════════════════════
// LEO · API — Corrigir dados ADMINISTRATIVOS de laudo emitido
// SOMENTE convênio + médico solicitante (balde "não-fraude").
// SEM transação de billing, SEM crédito. Regera o PDF.
// Identidade (nome/CPF/datas) NÃO passa por aqui — segue travada.
// Decidido c/ Dr. Sérgio 17/05 (Phase E).
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { gerarESalvarPdf } from '@/lib/pdf-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

if (!getApps().length) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'leo-sistema-laudos';
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'leo-sistema-laudos.firebasestorage.app';
  initializeApp({
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket,
  });
}
const dbAdmin = getFirestore();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wsId, exameId, convenio, solicitante, pdfHtml, nomeArq, medicoUid } = body as {
      wsId: string;
      exameId: string;
      convenio?: string;
      solicitante?: string;
      pdfHtml?: string;
      nomeArq?: string;
      medicoUid: string;
    };

    if (!wsId || !exameId || !medicoUid) {
      return NextResponse.json(
        { ok: false, error: 'wsId, exameId e medicoUid sao obrigatorios' },
        { status: 400 },
      );
    }

    const ref = dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'exame nao encontrado' }, { status: 404 });
    }
    const antes = snap.data() || {};

    // Atualiza SÓ os 2 campos administrativos no TOPO (fonte única — Phase B).
    // NÃO toca emitidoEm/status/medidas/billing. Sem crédito.
    await ref.update({
      convenio: convenio ?? '',
      solicitante: solicitante ?? '',
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    // Regera o PDF (decisão Dr. Sérgio: o PDF tem que sair corrigido também,
    // não só o banco). Não-crítico — a correção do dado já foi gravada.
    let pdfUrl: string | null = null;
    let pdfErro: string | null = null;
    if (pdfHtml && nomeArq) {
      try {
        pdfUrl = await gerarESalvarPdf(pdfHtml, wsId, exameId, nomeArq);
        await ref.update({ pdfUrl });
      } catch (e) {
        pdfErro = e instanceof Error ? e.message : 'erro_pdf';
        console.error('corrigir-laudo PDF error:', pdfErro);
      }
    }

    // Auditoria (não-crítico) — mantém glosa/extrato confiáveis (de→para).
    try {
      await dbAdmin.collection('logs').add({
        tipo: 'correcao_admin',
        wsId,
        exameId,
        medicoUid,
        de: { convenio: antes.convenio ?? '', solicitante: antes.solicitante ?? '' },
        para: { convenio: convenio ?? '', solicitante: solicitante ?? '' },
        ts: FieldValue.serverTimestamp(),
      });
    } catch { /* log nao pode quebrar a correcao */ }

    return NextResponse.json({ ok: true, pdfUrl, pdfErro });
  } catch (e) {
    console.error('API /corrigir-laudo error:', e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'Erro interno' },
      { status: 500 },
    );
  }
}
