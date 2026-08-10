// Leitura do modelo novo (conta → locais), com fallback para o formato antigo
// enquanto a migracao nao passou em todos os ambientes.
import { db } from './firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

export type Papel = 'dono' | 'medico' | 'recepcao';

export type Conta = { id: string; tipo?: 'PF' | 'PJ'; nome?: string; ownerUid?: string };

export type VinculoNovo = {
  id: string; contaId: string; medicoUid: string;
  papel: Papel; locais: string[]; status: string;
};

/** Vinculos ativos do usuario JA no formato novo (com contaId + papel). */
export async function getVinculosDoUsuario(uid: string): Promise<VinculoNovo[]> {
  const snap = await getDocs(query(
    collection(db, 'vinculos'),
    where('medicoUid', '==', uid),
    where('status', '==', 'ativo'),
  ));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as VinculoNovo))
    .filter(v => !!v.contaId && !!v.papel);
}

export async function getConta(contaId: string): Promise<Conta | null> {
  const snap = await getDoc(doc(db, 'contas', contaId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Conta) : null;
}

/**
 * Locais da conta que este vinculo alcanca. locais vazio = todos.
 * Vinculo restrito busca doc por doc: a regra de `list` em workspaces avalia
 * CADA doc com `alcancaConta(contaId, wsId)`, entao a query por contaId inteira
 * e negada quando um dos locais esta fora da lista — filtrar depois quebrava o
 * login desses usuarios (recepcao de uma sala em clinica de duas).
 */
export async function getLocaisDaConta(contaId: string, permitidos: string[]) {
  if (permitidos.length > 0) {
    const snaps = await Promise.all(
      permitidos.map(id => getDoc(doc(db, 'workspaces', id)).catch(() => null))
    );
    return snaps
      .filter(s => s?.exists() && s.data()!.contaId === contaId)
      .map(s => ({ id: s!.id, ...s!.data() } as Record<string, unknown> & { id: string }));
  }
  const snap = await getDocs(query(collection(db, 'workspaces'), where('contaId', '==', contaId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }));
}

// A assinatura por conta (subscriptions/{contaId}) passou a ser a oficial no
// Plano 2A: getSubscription (billing.ts) resolve workspace → contaId → doc,
// e /api/emitir debita nela. O doc antigo por workspaceId e so fallback.
