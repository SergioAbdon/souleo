// ══════════════════════════════════════════════════════════════════
// SOULEO · Cron diário da sombra Senna93 (Vercel Cron)
// Roda 1x/dia às 23:30 Belém (02:30 UTC) — janela de 25h sobre
// `emitidoEm`, todos os workspaces. Reusa as MESMAS deps reais da rota
// `/api/admin/shadow-retroativo` (src/lib/shadow/deps-admin.ts).
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/auth-admin';
import { rodarShadow } from '@/lib/shadow/rodar';
import { depsAdmin } from '@/lib/shadow/deps-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET || '';
const JANELA_HORAS = 25; // folga do horário do cron; overlap de 1h entre rodadas é aceitável

export async function GET(req: NextRequest) {
  // FAIL-CLOSED (mesmo padrão do cleanup-worklist): sem secret em
  // producao, NAO roda. Em dev (NODE_ENV != production) fica liberado.
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'CRON_SECRET ausente' }, { status: 500 });
    }
  } else if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dbAdmin = adminDb();
  const to = new Date();
  const from = new Date(to.getTime() - JANELA_HORAS * 60 * 60 * 1000);

  const workspaces: { wsId: string; execId: string; resumo: unknown }[] = [];
  const erros: string[] = [];

  try {
    const wsSnap = await dbAdmin.collection('workspaces').get();

    for (const wsDoc of wsSnap.docs) {
      const wsId = wsDoc.id;
      try {
        const deps = depsAdmin();
        // Workspace com 0 exames emitidos na janela → não roda `rodarShadow`
        // (que sempre persiste): checa antes, sem gravar lixo. Cacheia os
        // docs pra não repetir a mesma query pro rodarShadow.
        const docs = await deps.listarExames(wsId, from, to);
        if (docs.length === 0) continue;

        const { execId, exec } = await rodarShadow(
          { ...deps, listarExames: async () => docs },
          { wsId, from, to, origem: 'cron', uid: null },
        );
        workspaces.push({ wsId, execId, resumo: exec.resumo });
      } catch (e) {
        erros.push(`${wsId}: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }

    // Erro parcial = 500 (mesmo padrão do cleanup-worklist): 2xx faria o
    // monitor do Vercel tratar como sucesso mesmo com workspaces faltando.
    return NextResponse.json({
      ok: erros.length === 0,
      workspaces,
      erros,
    }, { status: erros.length > 0 ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500 });
  }
}
