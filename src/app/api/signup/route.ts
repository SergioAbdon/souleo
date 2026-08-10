// ══════════════════════════════════════════════════════════════════
// LEO · API Route — /api/signup (Secao 1, Plano 2A)
// PRIMEIRA rota com verificacao de idToken. E o padrao a seguir:
// as rotas antigas (/api/emitir, /api/corrigir-laudo) ainda nao verificam.
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { executarSignup, type DadosSignup } from '@/lib/signup-server';

export const runtime = 'nodejs';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'leo-sistema-laudos',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const dbAdmin = getFirestore();
const authAdmin = getAuth();

const STATUS: Record<string, number> = { dados_invalidos: 400, ja_cadastrado: 409, erro: 500 };

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
    const dados = (await req.json()) as DadosSignup;
    const r = await executarSignup(dbAdmin, authAdmin, uid, dados);
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.motivo] ?? 500 });
  } catch (e) {
    console.error('API /signup:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
