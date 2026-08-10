// ══════════════════════════════════════════════════════════════════
// LEO · API Route — /api/exame: apagar | cancelar | transferir
// Auth verificada (padrao do /api/signup). A logica vive em
// src/lib/exame-admin.ts (testada no emulador); aqui so a composicao:
// token → assinatura (billing-admin) → acao → Storage real.
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { resolverAssinatura } from '@/lib/billing-admin';
import { apagarExame, cancelarExame, transferirExame } from '@/lib/exame-admin';

export const runtime = 'nodejs';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'leo-sistema-laudos',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'leo-sistema-laudos.firebasestorage.app',
  });
}
const dbAdmin = getFirestore();
const authAdmin = getAuth();

// pdfUrl publico → caminho no bucket → delete. Formato de pdf-server.ts:85.
async function apagarPdf(url: string) {
  const bucket = getStorage().bucket();
  const prefixo = `https://storage.googleapis.com/${bucket.name}/`;
  if (!url.startsWith(prefixo)) return;
  await bucket.file(decodeURIComponent(url.slice(prefixo.length))).delete({ ignoreNotFound: true });
}

const ACOES = { apagar: apagarExame, cancelar: cancelarExame, transferir: transferirExame } as const;
const STATUS: Record<string, number> = {
  sem_permissao: 403, nao_encontrado: 404, nao_emitido: 409, alvo_invalido: 400,
};

export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await authAdmin.verifyIdToken(header.slice(7))).uid;
  } catch {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  try {
    const { acao, wsId, exameId, motivo, novoMedicoUid } = await req.json();
    const executar = ACOES[acao as keyof typeof ACOES];
    if (!executar || !wsId || !exameId) {
      return NextResponse.json({ ok: false, motivo: 'dados_invalidos' }, { status: 400 });
    }
    const assinatura = await resolverAssinatura(dbAdmin, wsId);
    const r = await executar(dbAdmin, {
      wsId, exameId, uid, motivo, novoMedicoUid,
      subRef: assinatura?.ref ?? null, apagarPdf,
    });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[(r as { motivo: string }).motivo] ?? 500 });
  } catch (e) {
    console.error('API /exame:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
