// ══════════════════════════════════════════════════════════════════
// LEO · Billing server-side — resolucao da assinatura (Secao 1, Plano 2A)
// A partir daqui a assinatura oficial e subscriptions/{contaId}. O doc
// antigo (por workspaceId) e fallback para workspace nao migrado.
// QUEM DEBITA (/api/emitir) E QUEM DEVOLVE (/api/exame) USAM ESTA FUNCAO —
// mesma chave, ou a devolucao cai no doc errado.
// Sem imports relativos (testado direto pelo node --test — ver signup-server.ts).
// ══════════════════════════════════════════════════════════════════
import type { Firestore, DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';

// `snap` (Ruflo-3, S7-triade-2b): a funcao ja LIA o doc pra confirmar
// existencia e jogava a leitura fora — os handlers da Marina faziam um
// segundo `.ref.get()` logo em seguida pra ler os mesmos dados. Devolver o
// snapshot que ja foi buscado poupa esse round-trip; quem precisa reler
// DENTRO de uma transacao (emitirComCobranca, /api/exame) continua
// destructurando so `ref` — a transacao tem que reler de qualquer forma.
export async function resolverAssinatura(
  db: Firestore, wsId: string
): Promise<{ ref: DocumentReference; snap: DocumentSnapshot; contaId: string | null } | null> {
  const ws = await db.doc(`workspaces/${wsId}`).get();
  const contaId = ws.exists ? (ws.data()!.contaId as string | undefined) : undefined;
  if (contaId) {
    const ref = db.doc(`subscriptions/${contaId}`);
    const snap = await ref.get();
    if (snap.exists) return { ref, snap, contaId };
  }
  const q = await db.collection('subscriptions')
    .where('workspaceId', '==', wsId).limit(1).get();
  if (!q.empty) return { ref: q.docs[0].ref, snap: q.docs[0], contaId: contaId ?? null };
  return null;
}
