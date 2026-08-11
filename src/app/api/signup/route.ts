// ══════════════════════════════════════════════════════════════════
// LEO · API Route — /api/signup (Secao 1, Plano 2A)
// Auth + Admin SDK vem de @/lib/auth-admin (init unico).
// Falta so /api/corrigir-laudo verificar token (registrado pro Plano 2B).
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, requireUid } from '@/lib/auth-admin';
import { executarSignup, type DadosSignup } from '@/lib/signup-server';
import { verificarCrmNoOp } from '@/lib/verificar-crm';

export const runtime = 'nodejs';

const STATUS: Record<string, number> = { dados_invalidos: 400, ja_cadastrado: 409, erro: 500 };

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  try {
    const dados = (await req.json()) as DadosSignup;
    const r = await executarSignup(adminDb(), adminAuth(), uid, dados, verificarCrmNoOp);
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.motivo] ?? 500 });
  } catch (e) {
    console.error('API /signup:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
