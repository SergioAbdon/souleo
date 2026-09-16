import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';
import { editarMembro, revogarMembro } from '@/lib/convite-server';

export const runtime = 'nodejs';
const STATUS: Record<string, number> = { nao_encontrado: 404, dono_imutavel: 409, nao_pode_a_si: 409, nada_a_mudar: 400 };

async function donoDaConta(req: NextRequest, uid: string) {
  const { wsId } = await req.clone().json();
  const db = adminDb();
  if (!wsId || await resolverPapel(db, wsId, uid) !== 'dono') return null;
  const contaId = (await db.doc(`workspaces/${wsId}`).get()).data()?.contaId as string | undefined;
  return contaId ? { db, contaId } : null;
}

export async function PATCH(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const ctx = await donoDaConta(req, uid);
    if (!ctx) return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    const { alvoUid, papel, locais } = await req.json();
    const r = await editarMembro(ctx.db, { contaId: ctx.contaId, alvoUid, papel, locais });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.motivo!] ?? 500 });
  } catch (e) { console.error('API /membro PATCH:', e); return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const ctx = await donoDaConta(req, uid);
    if (!ctx) return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    const { alvoUid } = await req.json();
    const r = await revogarMembro(ctx.db, { contaId: ctx.contaId, alvoUid, donoUid: uid });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.motivo!] ?? 500 });
  } catch (e) { console.error('API /membro DELETE:', e); return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 }); }
}
