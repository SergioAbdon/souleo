// ══════════════════════════════════════════════════════════════════
// SOULEO · Cron auto-cleanup worklist (Vercel Cron)
// Roda 1x/dia a meia-noite BRT (03:00 UTC)
// Exames com dataExame<hoje E status='aguardando' viram 'nao-realizado'
// Wader detecta a mudança e remove .wl da pasta worklists/
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'leo-sistema-laudos',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const dbAdmin = getFirestore();

const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(req: NextRequest) {
  // Vercel Cron envia Authorization: Bearer <CRON_SECRET>. Em dev (sem secret), permite.
  if (CRON_SECRET) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  // "Hoje" em BRT (UTC-3 fixo, Brasil sem horário de verão desde 2019)
  const hojeBRT = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dataHoje = hojeBRT.toISOString().slice(0, 10);

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

        const batch = dbAdmin.batch();
        examesSnap.docs.forEach(doc => {
          batch.update(doc.ref, {
            status: 'nao-realizado',
            naoRealizadoEm: new Date().toISOString(),
          });
        });
        await batch.commit();

        total += examesSnap.size;
        detalhes.push({ wsId, marcados: examesSnap.size });
      } catch (e) {
        erros.push(`${wsId}: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }

    return NextResponse.json({
      ok: true,
      hoje: dataHoje,
      totalMarcados: total,
      detalhes,
      erros: erros.length > 0 ? erros : undefined,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'erro',
    }, { status: 500 });
  }
}
