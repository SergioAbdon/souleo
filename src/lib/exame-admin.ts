// ══════════════════════════════════════════════════════════════════
// LEO · Exame server-side — apagar / cancelar / transferir (Plano 2A)
// A fechadura definitiva tem `exames delete: if false`: estas funcoes,
// atras do /api/exame, sao O UNICO caminho — com papel, log em `logs`,
// devolucao de consumo (D8) e limpeza do PDF publico (P2).
// Sem imports relativos (testado direto pelo node --test).
// `subRef` vem do chamador (resolverAssinatura de billing-admin) e
// `apagarPdf` tambem — DI que mantem Storage fora dos testes.
// ══════════════════════════════════════════════════════════════════
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export type Papel = 'dono' | 'medico' | 'recepcao' | null;
type Resultado = { ok: true } | { ok: false; motivo: string };
type Params = {
  wsId: string; exameId: string; uid: string;
  subRef: DocumentReference | null;
  apagarPdf: (url: string) => Promise<void>;
  motivo?: string; novoMedicoUid?: string;
};

export async function resolverPapel(db: Firestore, wsId: string, uid: string): Promise<Papel> {
  const ws = await db.doc(`workspaces/${wsId}`).get();
  if (!ws.exists) return null;
  const contaId = ws.data()!.contaId as string | undefined;
  if (contaId) {
    const v = await db.doc(`vinculos/${contaId}_${uid}`).get();
    const d = v.data();
    if (v.exists && d!.status === 'ativo' && ['dono', 'medico', 'recepcao'].includes(d!.papel)) {
      return d!.papel as Papel;
    }
  }
  // Legado: dono do local sem vinculo migrado.
  return ws.data()!.ownerUid === uid ? 'dono' : null;
}

// Autor ou sem autor: o que um medico pode mexer alem do que e do dono.
function medicoAlcanca(exame: Record<string, unknown>, uid: string) {
  return !exame.medicoUid || exame.medicoUid === uid;
}

// Devolve TODOS os consumos do exame (P1/D8) e registra a devolucao em
// `consumo` (append-only). Transacao: contadores nunca ficam pela metade.
async function devolverConsumo(db: Firestore, p: Params, acao: string) {
  const snap = await db.collection('consumo').where('exameId', '==', p.exameId).get();
  // P7: sem indice composto — filtra o workspace em codigo.
  const doExame = snap.docs.map(d => d.data()).filter(c => c.workspaceId === p.wsId);
  const nFranquia = doExame.filter(c => c.tipo === 'franquia').length;
  const nCredito = doExame.filter(c => c.tipo === 'credito').length;
  if (!nFranquia && !nCredito) return;
  if (p.subRef) {
    await db.runTransaction(async (t) => {
      const sub = await t.get(p.subRef!);
      if (!sub.exists) return;
      const usada = (sub.data()!.franquiaUsada as number) || 0;
      t.update(p.subRef!, {
        franquiaUsada: Math.max(0, usada - nFranquia),
        creditosExtras: FieldValue.increment(nCredito),
      });
    });
  }
  await db.collection('consumo').add({
    workspaceId: p.wsId, exameId: p.exameId, tipo: 'cancelamento', acao,
    devolvidoFranquia: nFranquia, devolvidoCreditos: nCredito,
    por: p.uid, emitidoEm: FieldValue.serverTimestamp(),
  });
}

async function limparPdf(exame: Record<string, unknown>, p: Params) {
  if (typeof exame.pdfUrl === 'string' && exame.pdfUrl) {
    try { await p.apagarPdf(exame.pdfUrl); }
    catch (e) { console.error('apagarPdf:', e); }   // nunca bloqueia a acao
  }
}

function log(db: Firestore, tipo: string, p: Params, exame: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return db.collection('logs').add({
    tipo, exameId: p.exameId, wsId: p.wsId,
    pacienteNome: (exame.pacienteNome as string) ?? '',
    medicoUidExame: (exame.medicoUid as string) ?? null,
    por: p.uid, ts: FieldValue.serverTimestamp(),
    // P3: cancelamento nao reverte o Feegow — divergencia fica registrada.
    feegowDivergencia: !!exame.feegowAppointId,
    ...extra,
  }).catch(e => console.error('log:', e));
}

async function carregar(db: Firestore, p: Params) {
  const [papel, exameSnap] = await Promise.all([
    resolverPapel(db, p.wsId, p.uid),
    db.doc(`workspaces/${p.wsId}/exames/${p.exameId}`).get(),
  ]);
  return { papel, exameSnap };
}

export async function apagarExame(db: Firestore, p: Params): Promise<Resultado> {
  const { papel, exameSnap } = await carregar(db, p);
  if (!exameSnap.exists) return { ok: false, motivo: 'nao_encontrado' };
  const exame = exameSnap.data()!;
  const emitido = exame.status === 'emitido';
  const pode = emitido
    ? papel === 'dono'                                             // matriz: apagar emitido e so do dono
    : papel === 'dono' || (papel === 'medico' && medicoAlcanca(exame, p.uid));
  if (!pode) return { ok: false, motivo: 'sem_permissao' };

  if (emitido) await devolverConsumo(db, p, 'apagar');
  await limparPdf(exame, p);
  await exameSnap.ref.delete();
  await log(db, 'exclusao_exame', p, exame, { estavaEmitido: emitido });
  return { ok: true };
}

export async function cancelarExame(db: Firestore, p: Params): Promise<Resultado> {
  const { papel, exameSnap } = await carregar(db, p);
  if (!exameSnap.exists) return { ok: false, motivo: 'nao_encontrado' };
  const exame = exameSnap.data()!;
  if (exame.status !== 'emitido') return { ok: false, motivo: 'nao_emitido' };
  const pode = papel === 'dono' || (papel === 'medico' && exame.medicoUid === p.uid);
  if (!pode) return { ok: false, motivo: 'sem_permissao' };

  await devolverConsumo(db, p, 'cancelar');
  await limparPdf(exame, p);
  await exameSnap.ref.update({
    status: 'cancelado',
    canceladoEm: FieldValue.serverTimestamp(),
    canceladoPor: p.uid,
    motivoCancelamento: p.motivo ?? '',
    pdfUrl: FieldValue.delete(),
  });
  await log(db, 'cancelamento_laudo', p, exame, { motivo: p.motivo ?? '' });
  return { ok: true };
}

export async function transferirExame(db: Firestore, p: Params): Promise<Resultado> {
  if (!p.novoMedicoUid) return { ok: false, motivo: 'alvo_invalido' };
  const { papel, exameSnap } = await carregar(db, p);
  if (!exameSnap.exists) return { ok: false, motivo: 'nao_encontrado' };
  const exame = exameSnap.data()!;
  const pode = papel === 'dono' || (papel === 'medico' && medicoAlcanca(exame, p.uid));
  if (!pode) return { ok: false, motivo: 'sem_permissao' };
  const papelAlvo = await resolverPapel(db, p.wsId, p.novoMedicoUid);
  if (papelAlvo !== 'medico' && papelAlvo !== 'dono') return { ok: false, motivo: 'alvo_invalido' };

  const emitido = exame.status === 'emitido';
  if (emitido) {
    // D8: o laudo anterior sai da conta; o novo medico consome ao emitir.
    await devolverConsumo(db, p, 'transferir');
    await limparPdf(exame, p);
  }
  await exameSnap.ref.update({
    medicoUid: p.novoMedicoUid,
    ...(emitido ? { status: 'andamento', pdfUrl: FieldValue.delete() } : {}),
    atualizadoEm: FieldValue.serverTimestamp(),
  });
  await log(db, 'transferencia_exame', p, exame, { de: (exame.medicoUid as string) ?? null, para: p.novoMedicoUid, estavaEmitido: emitido });
  return { ok: true };
}
