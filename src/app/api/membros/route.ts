import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';
import { listarMembros } from '@/lib/convite-server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const wsId = req.nextUrl.searchParams.get('wsId');
    if (!wsId) return NextResponse.json({ ok: false, motivo: 'dados_invalidos' }, { status: 400 });
    const db = adminDb();
    if (await resolverPapel(db, wsId, uid) !== 'dono') return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    const contaId = (await db.doc(`workspaces/${wsId}`).get()).data()!.contaId as string;
    const r = await listarMembros(db, contaId);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('API /membros:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
