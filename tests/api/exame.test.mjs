// /api/exame — apagar/cancelar/transferir com papel, devolucao e log.
import { test, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolverPapel, apagarExame, cancelarExame, transferirExame } from '../../src/lib/exame-admin.ts';

let db;
const CONTA = 'contaT', WS = 'wsT';
const DONO = 'uidDono', MED = 'uidMed', MED2 = 'uidMed2', RITA = 'uidRita';

// Spy do apagador de PDF: registra as URLs, nao toca Storage.
let pdfsApagados;
const apagarPdf = async (url) => { pdfsApagados.push(url); };

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: CONTA, ownerUid: DONO, nomeClinica: 'T' });
  await db.doc(`contas/${CONTA}`).set({ ownerUid: DONO });
  for (const [uid, papel] of [[DONO, 'dono'], [MED, 'medico'], [MED2, 'medico'], [RITA, 'recepcao']]) {
    await db.doc(`vinculos/${CONTA}_${uid}`).set({ contaId: CONTA, medicoUid: uid, papel, locais: [], status: 'ativo' });
  }
});

beforeEach(async () => {
  pdfsApagados = [];
  await db.doc(`subscriptions/${CONTA}`).set({ contaId: CONTA, franquiaMensal: 600, franquiaUsada: 10, creditosExtras: 3 });
});

const subRef = () => db.doc(`subscriptions/${CONTA}`);

async function seedEmitido(id, { consumos = 1 } = {}) {
  await db.doc(`workspaces/${WS}/exames/${id}`).set({
    pacienteNome: 'P', medicoUid: MED, status: 'emitido',
    pdfUrl: `https://storage.googleapis.com/bucket-t/laudos/${WS}/laudo_${id}.pdf`,
  });
  for (let i = 0; i < consumos; i++) {
    await db.collection('consumo').add({ workspaceId: WS, exameId: id, medicoUid: MED, tipo: 'franquia' });
  }
}

describe('resolverPapel', () => {
  test('resolve pelo vinculo deterministico', async () => {
    assert.equal(await resolverPapel(db, WS, DONO), 'dono');
    assert.equal(await resolverPapel(db, WS, MED), 'medico');
    assert.equal(await resolverPapel(db, WS, RITA), 'recepcao');
    assert.equal(await resolverPapel(db, WS, 'uidForasteiro'), null);
  });
  test('ownerUid do workspace SEM vinculo nao vale papel (paridade com a regra)', async () => {
    await db.doc('workspaces/wsLeg').set({ ownerUid: 'uidLegado' });
    assert.equal(await resolverPapel(db, 'wsLeg', 'uidLegado'), null);
  });
  test('vinculo com locais restritos nao alcanca local fora da lista', async () => {
    await db.doc(`vinculos/${CONTA}_uidPreso`).set({
      contaId: CONTA, medicoUid: 'uidPreso', papel: 'medico', locais: ['outroLocal'], status: 'ativo',
    });
    assert.equal(await resolverPapel(db, WS, 'uidPreso'), null);
  });
});

describe('apagar', () => {
  test('medico apaga o proprio nao-emitido; doc some; log fica; pdf nao (nao tinha)', async () => {
    await db.doc(`workspaces/${WS}/exames/fila1`).set({ pacienteNome: 'F', medicoUid: MED, status: 'aguardando' });
    const r = await apagarExame(db, { wsId: WS, exameId: 'fila1', uid: MED, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    assert.equal((await db.doc(`workspaces/${WS}/exames/fila1`).get()).exists, false);
    const logs = await db.collection('logs').where('exameId', '==', 'fila1').get();
    assert.equal(logs.size, 1);
    assert.equal(pdfsApagados.length, 0);
  });
  test('recepcao NAO apaga nem da fila (P4)', async () => {
    await db.doc(`workspaces/${WS}/exames/fila2`).set({ pacienteNome: 'F', status: 'aguardando' });
    const r = await apagarExame(db, { wsId: WS, exameId: 'fila2', uid: RITA, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'sem_permissao');
    assert.equal((await db.doc(`workspaces/${WS}/exames/fila2`).get()).exists, true);
  });
  test('medico NAO apaga emitido (nem o proprio); dono apaga e devolve', async () => {
    await seedEmitido('em1', { consumos: 2 });   // reemitido: consumiu 2
    const neg = await apagarExame(db, { wsId: WS, exameId: 'em1', uid: MED, subRef: subRef(), apagarPdf });
    assert.equal(neg.ok, false);
    const r = await apagarExame(db, { wsId: WS, exameId: 'em1', uid: DONO, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    const sub = (await subRef().get()).data();
    assert.equal(sub.franquiaUsada, 8, 'devolveu os 2 consumos (P1)');
    assert.equal(pdfsApagados.length, 1, 'PDF publico apagado (P2)');
    const canc = await db.collection('consumo').where('exameId', '==', 'em1').where('tipo', '==', 'cancelamento').get();
    assert.equal(canc.size, 1, 'devolucao registrada em consumo, append-only');
  });
});

describe('cancelar', () => {
  test('medico autor cancela: status, devolucao, pdf, log', async () => {
    await seedEmitido('em2');
    const r = await cancelarExame(db, { wsId: WS, exameId: 'em2', uid: MED, motivo: 'exame repetido', subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    const ex = (await db.doc(`workspaces/${WS}/exames/em2`).get()).data();
    assert.equal(ex.status, 'cancelado');
    assert.equal(ex.motivoCancelamento, 'exame repetido');
    assert.equal('pdfUrl' in ex, false, 'pdfUrl limpo');
    assert.equal((await subRef().get()).data().franquiaUsada, 9);
    assert.equal(pdfsApagados.length, 1);
  });
  test('medico NAO cancela laudo do colega; dono cancela', async () => {
    await seedEmitido('em3');
    const neg = await cancelarExame(db, { wsId: WS, exameId: 'em3', uid: MED2, motivo: 'x', subRef: subRef(), apagarPdf });
    assert.equal(neg.ok, false);
    const r = await cancelarExame(db, { wsId: WS, exameId: 'em3', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
  });
  test('cancelar duas vezes nao devolve duas vezes', async () => {
    await seedEmitido('em4');
    await cancelarExame(db, { wsId: WS, exameId: 'em4', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    const r2 = await cancelarExame(db, { wsId: WS, exameId: 'em4', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    assert.equal(r2.ok, false);
    assert.equal(r2.motivo, 'nao_emitido');
    assert.equal((await subRef().get()).data().franquiaUsada, 9, 'so 1 devolucao');
  });
  test('devolucao de credito volta como credito', async () => {
    await db.doc(`workspaces/${WS}/exames/em5`).set({ pacienteNome: 'P', medicoUid: MED, status: 'emitido' });
    await db.collection('consumo').add({ workspaceId: WS, exameId: 'em5', tipo: 'credito' });
    await cancelarExame(db, { wsId: WS, exameId: 'em5', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    const sub = (await subRef().get()).data();
    assert.equal(sub.creditosExtras, 4, 'credito devolvido');
    assert.equal(sub.franquiaUsada, 10, 'franquia intacta');
  });
});

describe('transferir', () => {
  test('emitido: devolve, volta pra andamento com o novo medico, pdf apagado', async () => {
    await seedEmitido('tr1');
    const r = await transferirExame(db, { wsId: WS, exameId: 'tr1', uid: DONO, novoMedicoUid: MED2, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    const ex = (await db.doc(`workspaces/${WS}/exames/tr1`).get()).data();
    assert.equal(ex.medicoUid, MED2);
    assert.equal(ex.status, 'andamento');
    assert.equal((await subRef().get()).data().franquiaUsada, 9, 'D8: novo medico consome de novo');
    assert.equal(pdfsApagados.length, 1);
  });
  test('nao-emitido: so troca o medico, sem devolucao', async () => {
    await db.doc(`workspaces/${WS}/exames/tr2`).set({ pacienteNome: 'P', medicoUid: MED, status: 'aguardando' });
    const r = await transferirExame(db, { wsId: WS, exameId: 'tr2', uid: MED, novoMedicoUid: MED2, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    assert.equal((await subRef().get()).data().franquiaUsada, 10);
  });
  test('alvo precisa ser medico/dono da conta', async () => {
    await db.doc(`workspaces/${WS}/exames/tr3`).set({ pacienteNome: 'P', medicoUid: MED, status: 'aguardando' });
    const r = await transferirExame(db, { wsId: WS, exameId: 'tr3', uid: DONO, novoMedicoUid: RITA, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'alvo_invalido');
  });
});

describe('devolucao liquida (anti double-refund)', () => {
  test('reemissao pos-cancelamento: 2o cancelamento devolve SO o consumo novo', async () => {
    await seedEmitido('dr1');                                    // 1 consumo franquia
    await cancelarExame(db, { wsId: WS, exameId: 'dr1', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    // reemissao: novo consumo + status emitido de novo
    await db.collection('consumo').add({ workspaceId: WS, exameId: 'dr1', tipo: 'franquia' });
    await db.doc(`workspaces/${WS}/exames/dr1`).set({ pacienteNome: 'P', medicoUid: MED, status: 'emitido' });
    await cancelarExame(db, { wsId: WS, exameId: 'dr1', uid: DONO, motivo: 'y', subRef: subRef(), apagarPdf });
    // beforeEach zera em 10; 1a devolucao: 10-1=9; 2a: devolve SO 1 → 8 (nao 7)
    assert.equal((await subRef().get()).data().franquiaUsada, 8);
  });
  test('sem assinatura: ledger registra 0 e a devolucao cheia ainda cabe depois', async () => {
    await seedEmitido('dr3');
    await cancelarExame(db, { wsId: WS, exameId: 'dr3', uid: DONO, motivo: 'x', subRef: null, apagarPdf });
    const canc = await db.collection('consumo').where('exameId', '==', 'dr3').where('tipo', '==', 'cancelamento').get();
    assert.equal(canc.size, 1);
    assert.equal(canc.docs[0].data().devolvidoFranquia, 0, 'ledger honesto: nada foi devolvido');
    // Assinatura reaparece e o exame volta a emitido: a 2a tentativa devolve o valor CHEIO.
    await db.doc(`workspaces/${WS}/exames/dr3`).set({ pacienteNome: 'P', medicoUid: MED, status: 'emitido' });
    await cancelarExame(db, { wsId: WS, exameId: 'dr3', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    assert.equal((await subRef().get()).data().franquiaUsada, 9, 'devolveu o consumo inteiro');
  });
  test('retry apos falha parcial: chamar a devolucao 2x nao devolve 2x', async () => {
    await seedEmitido('dr2', { consumos: 2 });
    await cancelarExame(db, { wsId: WS, exameId: 'dr2', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    // simula retry apos falha: exame de volta a 'emitido' sem consumo novo
    await db.doc(`workspaces/${WS}/exames/dr2`).set({ pacienteNome: 'P', medicoUid: MED, status: 'emitido' });
    await cancelarExame(db, { wsId: WS, exameId: 'dr2', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    assert.equal((await subRef().get()).data().franquiaUsada, 8, 'liquido: nada a devolver na 2a');
  });
});
