import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/auth-admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ ok: false, motivo: 'invalido' }, { status: 400 });
  try {
    const db = adminDb();
    const snap = await db.doc(`convites/${token}`).get();
    if (!snap.exists) return NextResponse.json({ ok: false, motivo: 'invalido' }, { status: 404 });
    const c = snap.data()!;
    if (c.usado) return NextResponse.json({ ok: false, motivo: 'ja_usado' }, { status: 410 });
    if (c.expiraEm.toDate() < new Date()) return NextResponse.json({ ok: false, motivo: 'expirado' }, { status: 410 });
    const conta = await db.doc(`contas/${c.contaId}`).get();
    // Só o mínimo pro convidado se orientar: nome da clínica e papel. Nada sensível.
    return NextResponse.json({ ok: true, clinica: conta.data()?.nome ?? 'Clínica', papel: c.papel });
  } catch (e) {
    console.error('API /convite/info:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
