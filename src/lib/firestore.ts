// ══════════════════════════════════════════════════════════════════
// SOULEO · Firestore CRUD
// Profissionais, Empresas, Workspaces, Vinculos, Pacientes, Exames
// ZERO localStorage — tudo no Firestore
// ══════════════════════════════════════════════════════════════════

import { db } from './firebase';
import { dataLocalHoje } from './utils';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  increment, Unsubscribe
} from 'firebase/firestore';

// ── Helpers ──
const now = () => serverTimestamp();
const genId = () => doc(collection(db, '_')).id;

// ══ PROFISSIONAIS ════════════════════════════════════════════════

export async function getProfile(uid: string) {
  try {
    const snap = await getDoc(doc(db, 'profissionais', uid));
    if (snap.exists()) return { id: snap.id, ...snap.data() };
    // fallback coleção antiga
    const snap2 = await getDoc(doc(db, 'profiles', uid));
    if (snap2.exists()) {
      const dados = snap2.data();
      await setDoc(doc(db, 'profissionais', uid), { ...dados, atualizadoEm: now() });
      return { id: uid, ...dados };
    }
    return null;
  } catch (e) { console.error('getProfile:', e); return null; }
}

export async function createProfile(uid: string, dados: Record<string, unknown>) {
  try {
    await setDoc(doc(db, 'profissionais', uid), {
      uid, ...dados,
      cpf: dados.cpf || '',
      ufCrm: dados.ufCrm || '',
      rqe: dados.rqe || '',
      tipoPerfil: dados.tipoPerfil || 'medico',
      superadmin: false,
      criadoEm: now(),
      atualizadoEm: now()
    });
    return true;
  } catch (e) { console.error('createProfile:', e); return false; }
}

export async function updateProfile(uid: string, dados: Record<string, unknown>) {
  try {
    await updateDoc(doc(db, 'profissionais', uid), { ...dados, atualizadoEm: now() });
    return true;
  } catch (e) { console.error('updateProfile:', e); return false; }
}

export async function getProfileByCPF(cpf: string) {
  try {
    const normalizado = cpf.replace(/\D/g, '');
    const snap = await getDocs(
      query(collection(db, 'profissionais'), where('cpf', '==', normalizado), limit(1))
    );
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (e) { console.error('getProfileByCPF:', e); return null; }
}

export async function isSuperAdmin(uid: string) {
  try {
    const snap = await getDoc(doc(db, 'profissionais', uid));
    return snap.exists() && snap.data().superadmin === true;
  } catch { return false; }
}

// ══ EMPRESAS ═════════════════════════════════════════════════════

export async function createEmpresa(dados: Record<string, unknown>) {
  try {
    const ref = doc(collection(db, 'empresas'));
    await setDoc(ref, {
      id: ref.id,
      cnpj: String(dados.cnpj || '').replace(/\D/g, ''),
      razaoSocial: dados.razaoSocial || '',
      nomeFantasia: dados.nomeFantasia || '',
      tipo: dados.tipo || 'clinica',
      masterUid: dados.masterUid || '',
      telefone: dados.telefone || '',
      endereco: dados.endereco || '',
      status: 'ativa',
      criadoEm: now(), atualizadoEm: now()
    });
    return ref.id;
  } catch (e) { console.error('createEmpresa:', e); return null; }
}

export async function getEmpresa(empId: string) {
  try {
    const snap = await getDoc(doc(db, 'empresas', empId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) { console.error('getEmpresa:', e); return null; }
}

export async function getEmpresaByCNPJ(cnpj: string) {
  try {
    const normalizado = cnpj.replace(/\D/g, '');
    const snap = await getDocs(
      query(collection(db, 'empresas'), where('cnpj', '==', normalizado), limit(1))
    );
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (e) { console.error('getEmpresaByCNPJ:', e); return null; }
}

export async function updateEmpresa(empId: string, dados: Record<string, unknown>) {
  try {
    await updateDoc(doc(db, 'empresas', empId), { ...dados, atualizadoEm: now() });
    return true;
  } catch (e) { console.error('updateEmpresa:', e); return false; }
}

// ══ WORKSPACES ═══════════════════════════════════════════════════

export async function createWorkspace(dados: Record<string, unknown>) {
  try {
    const ref = doc(collection(db, 'workspaces'));
    await setDoc(ref, { id: ref.id, ...dados, criadoEm: now() });
    return ref.id;
  } catch (e) { console.error('createWorkspace:', e); return null; }
}

export async function getWorkspace(wsId: string) {
  try {
    const snap = await getDoc(doc(db, 'workspaces', wsId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) { console.error('getWorkspace:', e); return null; }
}

export async function updateWorkspace(wsId: string, dados: Record<string, unknown>) {
  try {
    await updateDoc(doc(db, 'workspaces', wsId), { ...dados, atualizadoEm: now() });
    return true;
  } catch (e) { console.error('updateWorkspace:', e); return false; }
}

// ══ VINCULOS (memberships) ═══════════════════════════════════════

export async function createMembership(
  uid: string, wsId: string, role: string,
  status = 'ativo', extras: Record<string, unknown> = {}
) {
  try {
    const ref = doc(collection(db, 'vinculos'));
    await setDoc(ref, {
      id: ref.id,
      medicoUid: uid,
      profissionalId: extras.profissionalId || uid,
      workspaceId: wsId,
      empresaId: extras.empresaId || null,
      role, status,
      convitePor: extras.convitePor || null,
      entrou: status === 'ativo' ? now() : null,
      saiu: null,
      criadoEm: now()
    });
    return ref.id;
  } catch (e) { console.error('createMembership:', e); return null; }
}

export async function getMemberships(uid: string) {
  try {
    const snap = await getDocs(
      query(collection(db, 'vinculos'), where('medicoUid', '==', uid), where('status', '==', 'ativo'))
    );
    if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // fallback coleção antiga
    const snap2 = await getDocs(
      query(collection(db, 'memberships'), where('medicoUid', '==', uid), where('status', '==', 'ativo'))
    );
    return snap2.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error('getMemberships:', e); return []; }
}

export async function deactivateMembership(memId: string) {
  try {
    await updateDoc(doc(db, 'vinculos', memId), { status: 'inativo', saiu: now() });
    return true;
  } catch (e) { console.error('deactivateMembership:', e); return false; }
}

// ══ CONVITES ═════════════════════════════════════════════════════

export async function getPendingInvites(uid: string) {
  try {
    const snap = await getDocs(
      query(collection(db, 'vinculos'), where('medicoUid', '==', uid), where('status', '==', 'pendente'))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error('getPendingInvites:', e); return []; }
}

export async function acceptInvite(vincId: string) {
  try {
    await updateDoc(doc(db, 'vinculos', vincId), { status: 'ativo', entrou: now() });
    return true;
  } catch (e) { console.error('acceptInvite:', e); return false; }
}

export async function rejectInvite(vincId: string) {
  try {
    await updateDoc(doc(db, 'vinculos', vincId), { status: 'recusado' });
    return true;
  } catch (e) { console.error('rejectInvite:', e); return false; }
}

// ══ PACIENTES ════════════════════════════════════════════════════

export async function getPacientes(wsId: string) {
  try {
    const snap = await getDocs(
      query(collection(db, 'workspaces', wsId, 'pacientes'), orderBy('nome'))
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error('getPacientes:', e); return []; }
}

export async function savePaciente(wsId: string, dados: Record<string, unknown>) {
  try {
    if (dados.id) {
      await updateDoc(doc(db, 'workspaces', wsId, 'pacientes', dados.id as string), {
        ...dados, atualizadoEm: now()
      });
      return dados.id as string;
    } else {
      const ref = doc(collection(db, 'workspaces', wsId, 'pacientes'));
      await setDoc(ref, { id: ref.id, ...dados, criadoEm: now() });
      return ref.id;
    }
  } catch (e) { console.error('savePaciente:', e); return null; }
}

// ══ EXAMES ═══════════════════════════════════════════════════════

export async function getExames(wsId: string, pacienteId?: string) {
  try {
    let q = pacienteId
      ? query(collection(db, 'workspaces', wsId, 'exames'), where('pacienteId', '==', pacienteId), orderBy('dataExame', 'desc'))
      : query(collection(db, 'workspaces', wsId, 'exames'), orderBy('dataExame', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error('getExames:', e); return []; }
}

export async function getExame(wsId: string, exameId: string) {
  try {
    const snap = await getDoc(doc(db, 'workspaces', wsId, 'exames', exameId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) { console.error('getExame:', e); return null; }
}

export async function saveExame(wsId: string, dados: Record<string, unknown>, medicoUid: string) {
  try {
    if (dados.id) {
      await updateDoc(doc(db, 'workspaces', wsId, 'exames', dados.id as string), {
        ...dados, atualizadoEm: now()
      });
      return dados.id as string;
    } else {
      const ref = doc(collection(db, 'workspaces', wsId, 'exames'));
      await setDoc(ref, {
        id: ref.id, ...dados,
        status: 'rascunho', versao: 1, medicoUid,
        criadoEm: now()
      });
      return ref.id;
    }
  } catch (e) { console.error('saveExame:', e); return null; }
}

export async function emitExame(wsId: string, exameId: string, dadosFinais: Record<string, unknown>, medicoUid: string) {
  try {
    await updateDoc(doc(db, 'workspaces', wsId, 'exames', exameId), {
      ...dadosFinais,
      status: 'emitido',
      emitidoEm: now(),
      medicoUid,
      atualizadoEm: now()
    });
    return true;
  } catch (e) { console.error('emitExame:', e); return false; }
}

// ══ WORKLIST LISTENER (real-time) ════════════════════════════════

export function listenWorklist(wsId: string, callback: (items: Record<string, unknown>[]) => void, data?: string): Unsubscribe {
  const dia = data || dataLocalHoje();
  return onSnapshot(
    query(
      collection(db, 'workspaces', wsId, 'exames'),
      where('dataExame', '==', dia),
      orderBy('horarioChegada', 'asc')
    ),
    snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(items);
    },
    err => console.error('listenWorklist:', err)
  );
}

// ══ HISTÓRICO (exames emitidos) — com filtros ═══════════════

export type FiltrosHistorico = {
  dateFrom?: string;
  dateTo?: string;
  convenio?: string;
  limitN?: number;
};

export async function getHistorico(wsId: string, filtros?: FiltrosHistorico) {
  try {
    const constraints = [
      collection(db, 'workspaces', wsId, 'exames'),
      where('status', '==', 'emitido'),
    ] as unknown[];

    const hasDateRange = filtros?.dateFrom || filtros?.dateTo;

    if (filtros?.convenio) {
      constraints.push(where('convenio', '==', filtros.convenio));
    }
    if (filtros?.dateFrom) {
      constraints.push(where('dataExame', '>=', filtros.dateFrom));
    }
    if (filtros?.dateTo) {
      constraints.push(where('dataExame', '<=', filtros.dateTo));
    }

    constraints.push(orderBy(hasDateRange ? 'dataExame' : 'emitidoEm', 'desc'));
    constraints.push(limit(filtros?.limitN || 200));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap = await getDocs(query(...constraints as [any, ...any[]]));
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  } catch (e) { console.error('getHistorico:', e); return []; }
}

// ══ HONORÁRIOS (valores por convênio por workspace) ═════════════

export type HonorariosConfig = {
  convenios: Record<string, number>;
  valorUnico: number | null;
};

export async function getHonorarios(wsId: string): Promise<HonorariosConfig> {
  try {
    const snap = await getDoc(doc(db, 'workspaces', wsId, 'config', 'honorarios'));
    if (snap.exists()) return snap.data() as HonorariosConfig;
  } catch (e) { console.error('getHonorarios:', e); }
  return { convenios: {}, valorUnico: null };
}

export async function saveHonorarios(wsId: string, config: HonorariosConfig) {
  try {
    await setDoc(doc(db, 'workspaces', wsId, 'config', 'honorarios'), config);
    return true;
  } catch (e) { console.error('saveHonorarios:', e); return false; }
}

// ══ BILLING DO EXTRATO (1 grátis/mês/local) ════════════════════

export type ExtratoContador = {
  emitidos: number;
  ultimoEm?: unknown;
};

export async function getExtratoContador(wsId: string, anoMes: string): Promise<ExtratoContador> {
  try {
    const snap = await getDoc(doc(db, 'workspaces', wsId, 'extratos', anoMes));
    if (snap.exists()) return snap.data() as ExtratoContador;
  } catch (e) { console.error('getExtratoContador:', e); }
  return { emitidos: 0 };
}

export async function incrementarExtrato(wsId: string, anoMes: string) {
  try {
    const ref = doc(db, 'workspaces', wsId, 'extratos', anoMes);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { emitidos: increment(1), ultimoEm: now() });
    } else {
      await setDoc(ref, { emitidos: 1, ultimoEm: now() });
    }
    return true;
  } catch (e) { console.error('incrementarExtrato:', e); return false; }
}

// ══ LOG DE AUDITORIA ═════════════════════════════════════════════

export async function logAction(tipo: string, dados: Record<string, unknown>, medicoUid?: string) {
  try {
    await addDoc(collection(db, 'logs'), {
      tipo, ...dados,
      ts: now(),
      medicoUid: medicoUid || 'sistema'
    });
  } catch { /* log não pode quebrar o sistema */ }
}
