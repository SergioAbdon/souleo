import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireUid, adminAuth } from '@/lib/auth-admin';
import { aceitarConvite } from '@/lib/convite-server';
import { verificarCrmNoOp } from '@/lib/verificar-crm';

export const runtime = 'nodejs';
const STATUS: Record<string, number> = {
  invalido: 404, expirado: 410, ja_usado: 409, ja_membro: 409,
  perfil_incompativel: 409, dados_invalidos: 400, email_nao_verificado: 403, erro: 500,
};

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const { token, dadosPerfil } = await req.json();
    if (!token) return NextResponse.json({ ok: false, motivo: 'invalido' }, { status: 400 });
    // E-mail do perfil vem do Auth (fonte da verdade), nao do corpo — o nome ainda vem do corpo.
    const userRecord = await adminAuth().getUser(uid);
    if (!userRecord.emailVerified) {
      return NextResponse.json({ ok: false, motivo: 'email_nao_verificado' }, { status: 403 });
    }
    const email = userRecord.email ?? '';
    const r = await aceitarConvite(adminDb(), {
      uid, token, dadosPerfil: { ...(dadosPerfil ?? {}), email }, verificarCrm: verificarCrmNoOp, agora: new Date(),
    });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[(r as { motivo: string }).motivo] ?? 500 });
  } catch (e) {
    console.error('API /convite/aceitar:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
