// ══════════════════════════════════════════════════════════════════
// SOULEO · Billing
// Plano, franquia, creditos, verificacao de emissao
// ══════════════════════════════════════════════════════════════════

import { db } from './firebase';
import {
  collection, doc, getDoc, setDoc, getDocs, updateDoc, addDoc,
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

// ══ CONSUMO (registro detalhado de cada emissao) ════════════════

export type DadosConsumo = {
  pacienteNome: string;
  tipoExame: string;
  convenio: string;
  tipo: 'franquia' | 'credito';
  reemissao: boolean;
};

export async function registrarConsumo(
  wsId: string, exameId: string, medicoUid: string, dados: DadosConsumo
) {
  try {
    await addDoc(collection(db, 'consumo'), {
      workspaceId: wsId,
      exameId,
      medicoUid,
      pacienteNome: dados.pacienteNome || '',
      tipoExame: dados.tipoExame || '',
      convenio: dados.convenio || '',
      tipo: dados.tipo,
      reemissao: dados.reemissao || false,
      emitidoEm: serverTimestamp()
    });
  } catch { /* consumo nao pode quebrar emissao */ }
}

// ══ PAGAMENTOS ══════════════════════════════════════════════════

export type DadosPagamento = {
  workspaceId: string;
  valor: number;
  metodo: 'pix' | 'cartao' | 'transferencia' | 'cortesia';
  status: 'confirmado' | 'pendente' | 'falhou';
  gateway: 'stripe' | 'asaas' | 'manual';
  gatewayId?: string;
  plano: string;
  referencia: string;
  registradoPor: string;
  obs?: string;
};

export async function registrarPagamento(dados: DadosPagamento) {
  try {
    const ref = await addDoc(collection(db, 'pagamentos'), {
      ...dados,
      gatewayId: dados.gatewayId || null,
      obs: dados.obs || '',
      criadoEm: serverTimestamp(),
      confirmadoEm: dados.status === 'confirmado' ? serverTimestamp() : null
    });
    return ref.id;
  } catch (e) { console.error('registrarPagamento:', e); return null; }
}

// ══ CREDITOS LOG (auditoria de ajustes) ═════════════════════════

export async function ajustarCreditos(
  wsId: string, quantidade: number,
  tipo: 'cortesia' | 'compra' | 'estorno',
  motivo: string, adminUid: string
) {
  try {
    const sub = await getSubscription(wsId);
    if (!sub) return false;

    const saldoAnterior = (sub.creditosExtras as number) || 0;
    const saldoNovo = saldoAnterior + quantidade;

    // Atualizar subscription
    await updateDoc(doc(db, 'subscriptions', sub.id as string), {
      creditosExtras: saldoNovo < 0 ? 0 : saldoNovo
    });

    // Registrar log
    await addDoc(collection(db, 'creditosLog'), {
      workspaceId: wsId,
      quantidade,
      tipo,
      motivo,
      saldoAnterior,
      saldoNovo: saldoNovo < 0 ? 0 : saldoNovo,
      dadoPor: adminUid,
      criadoEm: serverTimestamp()
    });

    return true;
  } catch (e) { console.error('ajustarCreditos:', e); return false; }
}

// ══ CONFIG PLANOS (configuracao editavel) ═══════════════════════

export type PlanoConfig = {
  id: string;
  nome: string;
  preco: number;
  franquia: number;
  excedente: number;
};

export type ConfigPlanos = {
  planos: PlanoConfig[];
  carenciaDias: number;
  rateLimitEmissao: number;
  atualizadoEm?: unknown;
  atualizadoPor?: string;
};

export async function getConfigPlanos(): Promise<ConfigPlanos> {
  try {
    const snap = await getDoc(doc(db, 'configPlanos', 'atual'));
    if (snap.exists()) return snap.data() as ConfigPlanos;
  } catch (e) { console.error('getConfigPlanos:', e); }
  // Defaults
  return {
    planos: [
      { id: 'basic', nome: 'Basic', preco: 99, franquia: 100, excedente: 1.50 },
      { id: 'profissional', nome: 'Profissional', preco: 189.99, franquia: 350, excedente: 0.75 },
      { id: 'expert', nome: 'Expert', preco: 249.99, franquia: 500, excedente: 0.50 },
    ],
    carenciaDias: 3,
    rateLimitEmissao: 20,
  };
}

export async function saveConfigPlanos(config: ConfigPlanos, adminUid: string) {
  try {
    await setDoc(doc(db, 'configPlanos', 'atual'), {
      ...config,
      atualizadoEm: serverTimestamp(),
      atualizadoPor: adminUid
    });
    return true;
  } catch (e) { console.error('saveConfigPlanos:', e); return false; }
}
