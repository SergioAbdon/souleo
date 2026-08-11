// ══════════════════════════════════════════════════════════════════
// LEO · API Route — /api/signup (Secao 1, Plano 2A)
// Auth + Admin SDK vem de @/lib/auth-admin (init unico).
// Falta so /api/corrigir-laudo verificar token (registrado pro Plano 2B).
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, requireUid } from '@/lib/auth-admin';
import { executarSignup, executarSignupPJ, type DadosSignup, type DadosSignupPJ } from '@/lib/signup-server';
import { verificarCrmNoOp } from '@/lib/verificar-crm';

export const runtime = 'nodejs';

const STATUS: Record<string, number> = { dados_invalidos: 400, ja_cadastrado: 409, cnpj_duplicado: 409, erro: 500 };

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as (DadosSignup | DadosSignupPJ) & { tipoConta?: 'PF' | 'PJ' };
    const r = body.tipoConta === 'PJ'
      ? await executarSignupPJ(adminDb(), adminAuth(), uid, body as DadosSignupPJ, verificarCrmNoOp)
      : await executarSignup(adminDb(), adminAuth(), uid, body as DadosSignup, verificarCrmNoOp);
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.motivo] ?? 500 });
  } catch (e) {
    console.error('API /signup:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
