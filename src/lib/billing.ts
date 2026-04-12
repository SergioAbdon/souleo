// ══════════════════════════════════════════════════════════════════
// SOULEO · Billing
// Planos com 3 eixos: Laudos + Locais + Extratos
// Trial = Expert completo por 30 dias
// ══════════════════════════════════════════════════════════════════

import { db } from './firebase';
import {
  collection, doc, getDoc, setDoc, getDocs, updateDoc, addDoc,
  query, where, limit, increment, serverTimestamp, Timestamp
} from 'firebase/firestore';

// ══ TIPOS ════════════════════════════════════════════════════════

export type PlanoConfig = {
  id: string;              // 'trial', 'basic', 'profissional', 'expert'
  nome: string;
  preco: number;           // R$/mes
  franquia: number;        // laudos/mes
  excedente: number;       // R$/laudo excedente
  maxLocais: number;       // locais de trabalho inclusos
  localAdicional: number;  // R$/local extra
  extratosFranquia: number; // extratos gratis/mes (-1 = ilimitado)
  extratoValor: number;    // R$/extrato extra
};

export type ConfigPlanos = {
  planos: PlanoConfig[];
  carenciaDias: number;
  rateLimitEmissao: number;
  atualizadoEm?: unknown;
  atualizadoPor?: string;
};

export type CheckResult = {
  pode: boolean;
  tipo?: 'franquia' | 'creditos';
  motivo?: 'sem_plano' | 'expirado' | 'sem_saldo' | 'erro';
  sub?: Record<string, unknown>;
};

export type DadosConsumo = {
  pacienteNome: string;
  tipoExame: string;
  convenio: string;
  tipo: 'franquia' | 'credito';
  reemissao: boolean;
};

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

// ── Planos defaults ──
const PLANOS_DEFAULT: PlanoConfig[] = [
  { id: 'trial',        nome: 'Trial',        preco: 0,      franquia: 600, excedente: 0,    maxLocais: 5, localAdicional: 0,  extratosFranquia: -1, extratoValor: 0 },
  { id: 'remido',       nome: 'Remido',       preco: 0,      franquia: 9999, excedente: 0,   maxLocais: 99, localAdicional: 0, extratosFranquia: -1, extratoValor: 0 },
  { id: 'basic',        nome: 'Basic',        preco: 99.99,  franquia: 100, excedente: 1.50, maxLocais: 1, localAdicional: 50, extratosFranquia: 2,  extratoValor: 10 },
  { id: 'profissional', nome: 'Profissional', preco: 199.99, franquia: 350, excedente: 0.75, maxLocais: 3, localAdicional: 25, extratosFranquia: 10, extratoValor: 5 },
  { id: 'expert',       nome: 'Expert',       preco: 249.99, franquia: 600, excedente: 0.50, maxLocais: 5, localAdicional: 10, extratosFranquia: -1, extratoValor: 0 },
];

// ══ CONFIG PLANOS (configuracao editavel) ═══════════════════════

export async function getConfigPlanos(): Promise<ConfigPlanos> {
  try {
    const snap = await getDoc(doc(db, 'configPlanos', 'atual'));
    if (snap.exists()) return snap.data() as ConfigPlanos;
  } catch (e) { console.error('getConfigPlanos:', e); }
  return { planos: PLANOS_DEFAULT, carenciaDias: 3, rateLimitEmissao: 20 };
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

// Helper: busca config de um plano especifico
export async function getPlanoById(planoId: string): Promise<PlanoConfig | null> {
  const config = await getConfigPlanos();
  return config.planos.find(p => p.id === planoId) || null;
}

// ══ SUBSCRIPTION ════════════════════════════════════════════════

export async function createSubscription(wsId: string, planoId = 'trial') {
  const agora = new Date();
  const fimTrial = new Date(agora.getTime() + 30 * 864e5);
  try {
    // Buscar config do plano
    const plano = await getPlanoById(planoId);
    const franquia = plano?.franquia || 600;
    const maxLocais = plano?.maxLocais || 5;
    const localAdicional = plano?.localAdicional || 0;
    const extratosFranquia = plano?.extratosFranquia ?? -1;
    const extratoValor = plano?.extratoValor || 0;
    const excedente = plano?.excedente || 0;

    const ref = doc(collection(db, 'subscriptions'));
    await setDoc(ref, {
      id: ref.id,
      workspaceId: wsId,
      planoId,
      tipo: planoId === 'trial' ? 'trial' : 'paid',
      // Laudos
      franquiaMensal: franquia,
      franquiaUsada: 0,
      creditosExtras: 0,
      excedente,
      // Locais de trabalho
      maxLocais,
      localAdicional,
      // Extratos
      extratosFranquia,
      extratoValor,
      // Ciclo
      cicloInicio: Timestamp.fromDate(agora),
      cicloFim: Timestamp.fromDate(fimTrial),
      criadoEm: serverTimestamp()
    });
    return ref.id;
  } catch (e) { console.error('createSubscription:', e); return null; }
}

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

// ══ CHECK EMISSAO (laudos) ══════════════════════════════════════

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

// ══ CHECK WORKSPACE LIMIT (locais de trabalho) ══════════════════

export type CheckWorkspaceResult = {
  pode: boolean;
  atual: number;
  max: number;
  custoAdicional: number;
};

export async function checkWorkspaceLimit(uid: string, wsId: string): Promise<CheckWorkspaceResult> {
  try {
    const sub = await getSubscription(wsId);
    if (!sub) return { pode: false, atual: 0, max: 0, custoAdicional: 0 };

    // Contar vinculos ativos do usuario
    const vincSnap = await getDocs(
      query(collection(db, 'vinculos'), where('medicoUid', '==', uid), where('status', '==', 'ativo'))
    );
    const atual = vincSnap.size;
    const max = (sub.maxLocais as number) || 1;
    const custoAdicional = (sub.localAdicional as number) || 0;

    return {
      pode: atual < max, // pode adicionar se ainda nao atingiu o limite
      atual,
      max,
      custoAdicional,
    };
  } catch (e) { console.error('checkWorkspaceLimit:', e); return { pode: false, atual: 0, max: 0, custoAdicional: 0 }; }
}

// ══ CHECK EXTRATO LIMIT (extratos financeiros) ══════════════════

export type CheckExtratoResult = {
  pode: boolean;
  gratis: boolean;
  custo: number;
  usados: number;
  franquia: number; // -1 = ilimitado
};

export async function checkExtratoLimit(wsId: string): Promise<CheckExtratoResult> {
  try {
    const sub = await getSubscription(wsId);
    if (!sub) return { pode: false, gratis: false, custo: 0, usados: 0, franquia: 0 };

    const franquia = (sub.extratosFranquia as number) ?? 2;
    const custo = (sub.extratoValor as number) || 0;

    // Ilimitado (-1)
    if (franquia === -1) {
      return { pode: true, gratis: true, custo: 0, usados: 0, franquia: -1 };
    }

    // Buscar contador do mes atual
    const agora = new Date();
    const anoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
    const snap = await getDoc(doc(db, 'workspaces', wsId, 'extratos', anoMes));
    const usados = snap.exists() ? (snap.data().emitidos || 0) : 0;

    if (usados < franquia) {
      return { pode: true, gratis: true, custo: 0, usados, franquia };
    }
    // Pode gerar, mas cobra
    return { pode: true, gratis: false, custo, usados, franquia };
  } catch (e) { console.error('checkExtratoLimit:', e); return { pode: false, gratis: false, custo: 0, usados: 0, franquia: 0 }; }
}

// ══ CONSUMO (registro detalhado de cada emissao) ════════════════

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

    await updateDoc(doc(db, 'subscriptions', sub.id as string), {
      creditosExtras: saldoNovo < 0 ? 0 : saldoNovo
    });

    await addDoc(collection(db, 'creditosLog'), {
      workspaceId: wsId,
      quantidade, tipo, motivo,
      saldoAnterior,
      saldoNovo: saldoNovo < 0 ? 0 : saldoNovo,
      dadoPor: adminUid,
      criadoEm: serverTimestamp()
    });

    return true;
  } catch (e) { console.error('ajustarCreditos:', e); return false; }
}
