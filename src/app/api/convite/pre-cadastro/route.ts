import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireUid, adminAuth } from '@/lib/auth-admin';
import { preCadastrarConvite } from '@/lib/convite-server';
import { verificarCrmNoOp } from '@/lib/verificar-crm';

export const runtime = 'nodejs';
// NÃO exige emailVerified: criar o perfil não é acessar dado de paciente (o
// acesso é o vínculo, criado só no aceite verificado).
const STATUS: Record<string, number> = {
  invalido: 404, ja_usado: 409, expirado: 410, dados_invalidos: 400, erro: 500,
};

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const { token, dadosPerfil } = await req.json();
    if (!token) return NextResponse.json({ ok: false, motivo: 'invalido' }, { status: 400 });
    // E-mail do perfil vem do Auth (fonte da verdade), nao do corpo — o nome/crm continuam do corpo.
    const userRecord = await adminAuth().getUser(uid);
    const email = userRecord.email ?? '';
    const r = await preCadastrarConvite(adminDb(), {
      uid, token, dadosPerfil: { ...(dadosPerfil ?? {}), email }, verificarCrm: verificarCrmNoOp, agora: new Date(),
    });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[(r as { motivo: string }).motivo] ?? 500 });
  } catch (e) {
    console.error('API /convite/pre-cadastro:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
