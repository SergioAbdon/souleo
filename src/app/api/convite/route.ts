import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';
import { criarConvite } from '@/lib/convite-server';

export const runtime = 'nodejs';

// contaId de um local do dono → confirma que quem chama é dono da conta.
async function contaDoDono(db: ReturnType<typeof adminDb>, wsId: string, uid: string) {
  const papel = await resolverPapel(db, wsId, uid);
  if (papel !== 'dono') return null;
  const ws = await db.doc(`workspaces/${wsId}`).get();
  return ws.exists ? (ws.data()!.contaId as string) : null;
}

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const { wsId, papel, locais } = await req.json();
    const db = adminDb();
    const contaId = await contaDoDono(db, wsId, uid);
    if (!contaId) return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    const r = await criarConvite(db, { contaId, criadoPor: uid, papel, locais: locais ?? [], agora: new Date() });
    if (!r.ok) return NextResponse.json(r, { status: 400 });
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.souleo.com.br';
    return NextResponse.json({ ok: true, token: r.token, link: `${base}/convite/${r.token}` });
  } catch (e) {
    console.error('API /convite:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
