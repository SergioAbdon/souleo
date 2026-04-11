// ══════════════════════════════════════════════════════════════════
// SOULEO · Billing
// Plano, franquia, creditos, verificacao de emissao
// ══════════════════════════════════════════════════════════════════

import { db } from './firebase';
import {
  collection, doc, setDoc, getDocs, updateDoc,
  query, where, limit, increment, serverTimestamp, Timestamp
} from 'firebase/firestore';

// ── Criar subscription trial ──
export async function createSubscription(wsId: string, tipo = 'trial', franquia = 100) {
  const agora = new Date();
  const fimTrial = new Date(agora.getTime() + 30 * 864e5);
  try {
    const ref = doc(collection(db, 'subscriptions'));
    await setDoc(ref, {
      id: ref.id, workspaceId: wsId, tipo,
      franquiaMensal: franquia, franquiaUsada: 0,
      creditosExtras: 0,
      cicloInicio: Timestamp.fromDate(agora),
      cicloFim: Timestamp.fromDate(fimTrial),
      criadoEm: serverTimestamp()
    });
    return ref.id;
  } catch (e) { console.error('createSubscription:', e); return null; }
}

// ── Buscar subscription ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSubscription(wsId: string): Promise<Record<string, any> | null> {
  try {
    const snap = await getDocs(
      query(collection(db, 'subscriptions'), where('workspaceId', '==', wsId), limit(1))
    );
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (e) { console.error('getSubscription:', e); return null; }
}

// ── Verificar se pode emitir ──
export type CheckResult = {
  pode: boolean;
  tipo?: 'franquia' | 'creditos';
  motivo?: 'sem_plano' | 'expirado' | 'sem_saldo' | 'erro';
  sub?: Record<string, unknown>;
};

export async function checkEmissao(wsId: string): Promise<CheckResult> {
  try {
    const sub = await getSubscription(wsId);
    if (!sub) return { pode: false, motivo: 'sem_plano' };

    const agora = new Date();
    const cicloFim = (sub.cicloFim as Timestamp)?.toDate?.()
      || new Date(sub.cicloFim as string);

    const franquiaUsada = (sub.franquiaUsada as number) || 0;
    const franquiaMensal = (sub.franquiaMensal as number) || 0;
    const creditosExtras = (sub.creditosExtras as number) || 0;

    if (agora > cicloFim && creditosExtras <= 0) {
      return { pode: false, motivo: 'expirado', sub };
    }
    if (franquiaUsada < franquiaMensal && agora <= cicloFim) {
      return { pode: true, tipo: 'franquia', sub };
    }
    if (creditosExtras > 0) {
      return { pode: true, tipo: 'creditos', sub };
    }
    return { pode: false, motivo: 'sem_saldo', sub };
  } catch (e) { console.error('checkEmissao:', e); return { pode: false, motivo: 'erro' }; }
}

// ── Consumir 1 emissao ──
export async function consumirEmissao(wsId: string, tipo: 'franquia' | 'creditos') {
  try {
    const sub = await getSubscription(wsId);
    if (!sub) return false;
    if (tipo === 'franquia') {
      await updateDoc(doc(db, 'subscriptions', sub.id as string), {
        franquiaUsada: increment(1)
      });
    } else {
      await updateDoc(doc(db, 'subscriptions', sub.id as string), {
        creditosExtras: increment(-1)
      });
    }
    return true;
  } catch (e) { console.error('consumirEmissao:', e); return false; }
}
