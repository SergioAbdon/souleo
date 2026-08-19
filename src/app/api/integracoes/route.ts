// ══════════════════════════════════════════════════════════════════
// LEO · API Route — testar/salvar/remover integração (Sub-plano 5,
// Tasks 3-4). O segredo mora em workspaces/{wsId}/privado/{tipo}
// (`if false` nas regras) — esta rota é o único caminho que alcança e
// SÓ o dono do local mexe. Nenhum segredo volta ao navegador: nem no
// corpo de sucesso, nem no erro — src/lib/integracoes-admin.ts sanitiza
// tudo antes de responder ou gravar.
//
// Ordem de gates preservada pras 3 ações: 401 (sem uid) → 400 (acao/wsId
// invalidos) → 403 (papel != dono) → só então qualquer leitura de
// segredo ou escrita. Nenhuma ação nova pula essa ordem.
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';
import { executarTeste, salvarIntegracao, removerCredencial } from '@/lib/integracoes-admin';

const dbAdmin = adminDb();

const ACOES = ['testar', 'salvar', 'remover'] as const;
type Acao = typeof ACOES[number];

export async function POST(req: NextRequest) {
  // 1. Exige Authorization: Bearer <idToken>.
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, mensagem: 'Não autorizado.' }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    const { acao, wsId, tipo, credencial, config } = (body ?? {}) as Record<string, unknown>;

    if (typeof acao !== 'string' || !ACOES.includes(acao as Acao)) {
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

    const tipoStr = typeof tipo === 'string' ? tipo : '';

    if (acao === 'testar') {
      // credencial precisa ser objeto de verdade — não-nulo, não-array, com pelo
      // menos uma chave — senão {} ou [] entram no ramo do corpo com conn vazio.
      const credencialValida = credencial !== null && typeof credencial === 'object' && !Array.isArray(credencial)
        && Object.keys(credencial as Record<string, unknown>).length > 0;

      // 3-6: ler segredo/corpo, bater no alvo, gravar resultado, sanitizar.
      const r = await executarTeste(dbAdmin, {
        wsId, tipo: tipoStr,
        credencialBody: credencialValida ? credencial as Record<string, unknown> : undefined,
      });
      return NextResponse.json({ ok: r.ok, status: r.status, mensagem: r.mensagem }, { status: r.httpStatus });
    }

    if (acao === 'salvar') {
      const r = await salvarIntegracao(dbAdmin, { wsId, tipo: tipoStr, config, credencial });
      return NextResponse.json({ ok: r.ok, mensagem: r.mensagem, integracao: r.integracao }, { status: r.httpStatus });
    }

    // acao === 'remover'
    const r = await removerCredencial(dbAdmin, { wsId, tipo: tipoStr });
    return NextResponse.json({ ok: r.ok, mensagem: r.mensagem, integracao: r.integracao }, { status: r.httpStatus });
  } catch {
    // Catch genérico: NUNCA devolve mensagem/stack crua (pode carregar segredo).
    return NextResponse.json({ ok: false, mensagem: 'Erro interno ao processar integração.' }, { status: 500 });
  }
}
