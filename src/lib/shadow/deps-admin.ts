// ══════════════════════════════════════════════════════════════════
// LEO Senna93 F4 · deps REAIS do `rodarShadow` (Admin SDK)
// ══════════════════════════════════════════════════════════════════
// Extraído da rota `/api/admin/shadow-retroativo` (T5) pra reuso pelo
// cron `/api/cron/shadow-diario` — mesma listagem, mesma persistência,
// um init só do Admin SDK (`@/lib/auth-admin`, não uma cópia local).
// ponytail: morre na F5b junto com a sombra — não generalizar.
// ══════════════════════════════════════════════════════════════════

import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/auth-admin';
import { exameTemDivergencia } from './rodar';
import type { ExecucaoShadow, ShadowDeps } from './rodar';
import { lerSnapshotHtml } from '@/lib/pdf-server';

const CHUNK = 400; // limite Firestore = 500 ops/batch

/**
 * `workspaces/{ws}/privado/shadow/execucoes/{execId}` (gaveta deny-by-default,
 * firestore.rules:116 — nenhum cliente lê, nenhuma regra nova).
 * A subcoleção `exames` só recebe QUEM DIVERGIU, e SEM `pacienteNome`
 * (o exameId basta pra rastrear — minimização de dado clínico).
 */
async function persistirExecucao(wsId: string, exec: ExecucaoShadow): Promise<string> {
  const dbAdmin = adminDb();
  const ref = dbAdmin
    .collection('workspaces').doc(wsId)
    .collection('privado').doc('shadow')
    .collection('execucoes').doc();

  await ref.set({
    rodadaEm: FieldValue.serverTimestamp(),
    origem: exec.origem, uid: exec.uid,
    from: exec.from, to: exec.to,
    resumo: exec.resumo,
  });

  const comDiv = exec.exames.filter(exameTemDivergencia);
  for (let i = 0; i < comDiv.length; i += CHUNK) {
    const batch = dbAdmin.batch();
    for (const e of comDiv.slice(i, i + CHUNK)) {
      batch.set(ref.collection('exames').doc(e.id), {
        emitidoEm: e.emitidoEm, era: e.era, motorNumeros: e.motorNumeros,
        frases: e.frases, celulas: e.celulas,
        ...(e.snapshotCheck !== undefined ? { snapshotCheck: e.snapshotCheck } : {}),
      });
    }
    await batch.commit();
  }
  return ref.id;
}

/**
 * Deps reais do Admin SDK para `rodarShadow`. `onNome` (opcional) recebe
 * `id → pacienteNome` conforme os docs são lidos — a rota usa pra montar a
 * resposta HTTP; o cron não precisa (nome não entra no relatório do cron).
 */
export function depsAdmin(onNome?: (id: string, nome: string) => void): ShadowDeps {
  const dbAdmin = adminDb();
  return {
    listarExames: async (ws, de, ate) => {
      const snap = await dbAdmin
        .collection('workspaces').doc(ws).collection('exames')
        .where('status', '==', 'emitido')
        .where('emitidoEm', '>=', Timestamp.fromDate(de))
        .where('emitidoEm', '<=', Timestamp.fromDate(ate))
        .orderBy('emitidoEm', 'desc')
        .limit(200)
        .get();
      return snap.docs.map(d => {
        const dados = d.data();
        onNome?.(d.id, String(dados.pacienteNome || '—'));
        return { id: d.id, dados };
      });
    },
    persistir: persistirExecucao,
    lerSnapshot: async (ws, exameId) => (await lerSnapshotHtml(ws, exameId))?.html ?? null,
  };
}
