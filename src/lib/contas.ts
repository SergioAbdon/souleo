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

/** Locais da conta que este vinculo alcanca. locais vazio = todos. */
export async function getLocaisDaConta(contaId: string, permitidos: string[]) {
  const snap = await getDocs(query(collection(db, 'workspaces'), where('contaId', '==', contaId)));
  const todos = snap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }));
  return permitidos.length === 0 ? todos : todos.filter(w => permitidos.includes(w.id));
}

/** Assinatura da conta. Doc id = contaId (formato novo). */
export async function getSubscriptionDaConta(contaId: string) {
  const snap = await getDoc(doc(db, 'subscriptions', contaId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
