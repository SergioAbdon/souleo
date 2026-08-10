// ══════════════════════════════════════════════════════════════════
// LEO · Billing server-side — resolucao da assinatura (Secao 1, Plano 2A)
// A partir daqui a assinatura oficial e subscriptions/{contaId}. O doc
// antigo (por workspaceId) e fallback para workspace nao migrado.
// QUEM DEBITA (/api/emitir) E QUEM DEVOLVE (/api/exame) USAM ESTA FUNCAO —
// mesma chave, ou a devolucao cai no doc errado.
// Sem imports relativos (testado direto pelo node --test — ver signup-server.ts).
// ══════════════════════════════════════════════════════════════════
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';

export async function resolverAssinatura(
  db: Firestore, wsId: string
): Promise<{ ref: DocumentReference; contaId: string | null } | null> {
  const ws = await db.doc(`workspaces/${wsId}`).get();
  const contaId = ws.exists ? (ws.data()!.contaId as string | undefined) : undefined;
  if (contaId) {
    const ref = db.doc(`subscriptions/${contaId}`);
    if ((await ref.get()).exists) return { ref, contaId };
  }
  const q = await db.collection('subscriptions')
    .where('workspaceId', '==', wsId).limit(1).get();
  if (!q.empty) return { ref: q.docs[0].ref, contaId: contaId ?? null };
  return null;
}
