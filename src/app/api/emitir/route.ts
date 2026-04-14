// ══════════════════════════════════════════════════════════════════
// LEO v3 · API Route — Emissao atomica de laudo
// Transacao server-side: emitir exame + cobrar billing atomicamente
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

// ── Firebase Admin (server-side) ──
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

// ── POST Handler ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wsId, exameId, dadosFinais, medicoUid } = body as {
      wsId: string;
      exameId: string;
      dadosFinais: Record<string, unknown>;
      medicoUid: string;
    };

    // Validacao basica
    if (!wsId || !exameId || !medicoUid) {
      return NextResponse.json({ ok: false, motivo: 'dados_invalidos', error: 'wsId, exameId e medicoUid sao obrigatorios' }, { status: 400 });
    }

    // ── Transacao atomica ──
    // Dentro da transacao: ler subscription + validar + emitir + cobrar
    // Tudo ou nada — se qualquer etapa falhar, rollback automatico
    const resultado = await dbAdmin.runTransaction(async (transaction) => {
      // 1. Buscar subscription do workspace (com lock)
      const subsQuery = await dbAdmin.collection('subscriptions')
        .where('workspaceId', '==', wsId).limit(1).get();

      if (subsQuery.empty) {
        return { ok: false, motivo: 'sem_plano' as const };
      }

      const subDoc = subsQuery.docs[0];
      const subRef = subDoc.ref;

      // Ler dentro da transacao pra garantir lock
      const subSnap = await transaction.get(subRef);
      if (!subSnap.exists) {
        return { ok: false, motivo: 'sem_plano' as const };
      }

      const sub = subSnap.data()!;
      const agora = new Date();
      const cicloFim = sub.cicloFim ? (sub.cicloFim as Timestamp).toDate() : null;
      const franquiaUsada = (sub.franquiaUsada as number) || 0;
      const franquiaMensal = (sub.franquiaMensal as number) || 0;
      const creditosExtras = (sub.creditosExtras as number) || 0;

      // 2. Validar quota
      let tipo: 'franquia' | 'creditos' | null = null;

      if (cicloFim && agora <= cicloFim && franquiaUsada < franquiaMensal) {
        tipo = 'franquia';
      } else if (creditosExtras > 0) {
        tipo = 'creditos';
      } else if (cicloFim && agora > cicloFim && creditosExtras <= 0) {
        return { ok: false, motivo: 'expirado' as const };
      } else {
        return { ok: false, motivo: 'sem_saldo' as const };
      }

      // 3. Atualizar exame (status = emitido) — DENTRO da transacao
      const exameRef = dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`);
      transaction.update(exameRef, {
        ...dadosFinais,
        status: 'emitido',
        emitidoEm: FieldValue.serverTimestamp(),
        medicoUid,
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      // 4. Cobrar billing — DENTRO da transacao
      if (tipo === 'franquia') {
        transaction.update(subRef, {
          franquiaUsada: FieldValue.increment(1),
        });
      } else {
        transaction.update(subRef, {
          creditosExtras: FieldValue.increment(-1),
        });
      }

      return { ok: true, tipo };
    });

    // ── Fora da transacao (nao critico, pode falhar) ──
    if (resultado.ok && resultado.tipo) {
      // Registrar consumo (audit log)
      try {
        await dbAdmin.collection('consumo').add({
          workspaceId: wsId,
          exameId,
          medicoUid,
          pacienteNome: (dadosFinais.pacienteNome as string) || '',
          tipoExame: (dadosFinais.tipoExame as string) || '',
          convenio: (dadosFinais.convenio as string) || '',
          tipo: resultado.tipo === 'franquia' ? 'franquia' : 'credito',
          reemissao: !!(dadosFinais.reemissao),
          emitidoEm: FieldValue.serverTimestamp(),
        });
      } catch { /* consumo nao pode quebrar emissao */ }

      // Log de auditoria
      try {
        await dbAdmin.collection('logs').add({
          tipo: 'emissao',
          exameId,
          wsId,
          reemissao: !!(dadosFinais.reemissao),
          identificacaoAlterada: !!(dadosFinais.identificacaoAlterada),
          ts: FieldValue.serverTimestamp(),
          medicoUid,
        });
      } catch { /* log nao pode quebrar emissao */ }
    }

    return NextResponse.json(resultado);
  } catch (e) {
    console.error('API /emitir error:', e);
    const msg = (e as Error).message || 'Erro interno';
    return NextResponse.json({ ok: false, motivo: 'erro', error: msg }, { status: 500 });
  }
}
