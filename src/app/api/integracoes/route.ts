// ══════════════════════════════════════════════════════════════════
// LEO · API Route — Testar conexão de integração (Sub-plano 5, Task 3)
// O segredo mora em workspaces/{wsId}/privado/{tipo} (`if false` nas
// regras) — esta rota é o único caminho que alcança e SÓ o dono do
// local pode testar. Nenhum segredo volta ao navegador: nem no corpo
// de sucesso, nem no erro — src/lib/integracoes-admin.ts sanitiza tudo
// antes de responder ou gravar.
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';
import { executarTeste } from '@/lib/integracoes-admin';

const dbAdmin = adminDb();

export async function POST(req: NextRequest) {
  // 1. Exige Authorization: Bearer <idToken>.
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, mensagem: 'Não autorizado.' }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    const { acao, wsId, tipo, credencial } = (body ?? {}) as Record<string, unknown>;

    if (acao !== 'testar') {
      return NextResponse.json({ ok: false, mensagem: 'Ação inválida.' }, { status: 400 });
    }
    if (typeof wsId !== 'string' || !wsId) {
      return NextResponse.json({ ok: false, mensagem: 'wsId obrigatório.' }, { status: 400 });
    }

    // 2. Exige papel dono no wsId.
    const papel = await resolverPapel(dbAdmin, wsId, uid);
    if (papel !== 'dono') {
      return NextResponse.json({ ok: false, mensagem: 'Apenas o responsável pela conta acessa Integrações.' }, { status: 403 });
    }

    // credencial precisa ser objeto de verdade — não-nulo, não-array, com pelo
    // menos uma chave — senão {} ou [] entram no ramo do corpo com conn vazio.
    const credencialValida = credencial !== null && typeof credencial === 'object' && !Array.isArray(credencial)
      && Object.keys(credencial as Record<string, unknown>).length > 0;

    // 3-6: ler segredo/corpo, bater no alvo, gravar resultado, sanitizar.
    const r = await executarTeste(dbAdmin, {
      wsId,
      tipo: typeof tipo === 'string' ? tipo : '',
      credencialBody: credencialValida ? credencial as Record<string, unknown> : undefined,
    });
    return NextResponse.json({ ok: r.ok, status: r.status, mensagem: r.mensagem }, { status: r.httpStatus });
  } catch {
    // Catch genérico: NUNCA devolve mensagem/stack crua (pode carregar segredo).
    return NextResponse.json({ ok: false, mensagem: 'Erro interno ao testar conexão.' }, { status: 500 });
  }
}
