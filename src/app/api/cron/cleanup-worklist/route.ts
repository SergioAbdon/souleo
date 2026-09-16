// ══════════════════════════════════════════════════════════════════
// SOULEO · Cron auto-cleanup worklist (Vercel Cron)
// Roda 1x/dia a meia-noite BRT (03:00 UTC)
// Exames com dataExame<hoje E status='aguardando' viram 'nao-realizado'
// Wader detecta a mudança e remove .wl da pasta worklists/
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/auth-admin';
import { dataLocalHoje } from '@/lib/utils';

export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET || '';
const CHUNK = 400; // limite Firestore = 500 ops/batch

export async function GET(req: NextRequest) {
  // FAIL-CLOSED (Achado 4): sem secret configurado em producao, NAO roda.
  // Em dev (NODE_ENV != production) continua liberado pra teste local.
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'CRON_SECRET ausente' }, { status: 500 });
    }
  } else if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dbAdmin = adminDb();
  const dataHoje = dataLocalHoje();

  let total = 0;
  const detalhes: { wsId: string; marcados: number }[] = [];
  const erros: string[] = [];

  try {
    const wsSnap = await dbAdmin.collection('workspaces').get();

    for (const wsDoc of wsSnap.docs) {
      const wsId = wsDoc.id;
      try {
        const examesSnap = await dbAdmin
          .collection(`workspaces/${wsId}/exames`)
          .where('status', '==', 'aguardando')
          .where('dataExame', '<', dataHoje)
          .get();
        if (examesSnap.empty) continue;

        // Chunking (Achado 9): batch unico estourava o limite de 500 e
        // NENHUM exame era marcado — com a resposta ainda dizendo ok.
        const docs = examesSnap.docs;
        for (let i = 0; i < docs.length; i += CHUNK) {
          const batch = dbAdmin.batch();
          docs.slice(i, i + CHUNK).forEach(d => {
            batch.update(d.ref, {
              status: 'nao-realizado',
              naoRealizadoEm: new Date().toISOString(),
            });
          });
          await batch.commit();
        }
        total += docs.length;
        detalhes.push({ wsId, marcados: docs.length });
      } catch (e) {
        erros.push(`${wsId}: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }

    // Erro parcial = 500 (Codex-10): 2xx faria monitor/log do Vercel tratar
    // como sucesso. O corpo preserva o que JA foi processado.
    return NextResponse.json({
      ok: erros.length === 0,
      hoje: dataHoje,
      totalMarcados: total,
      detalhes,
      erros: erros.length > 0 ? erros : undefined,
    }, { status: erros.length > 0 ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500 });
  }
}
