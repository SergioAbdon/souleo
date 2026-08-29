// /api/exame — apagar/cancelar/transferir com papel, devolucao e log.
import { test, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { resolverPapel, apagarExame, cancelarExame, transferirExame } from '../../src/lib/exame-admin.ts';
import { refEmissaoPrivada } from '../../src/lib/emitir-admin.ts';

// E6: simula outra emissao commitando ENTRE a leitura de fora (carregar) e o
// CAS final. cancelarExame/transferirExame fazem 2 runTransaction quando o
// exame esta emitido: 1a e devolverConsumo, 2a e o CAS. Intercepta so a 2a
// e, antes de deixar rodar, escreve de verdade no exame — exatamente o que
// uma 2a requisicao concorrente (uma emissao) teria feito.
function dbComEmissaoNoMeio(dbReal, exameRef, novosCampos) {
  let chamadas = 0;
  return new Proxy(dbReal, {
    get(target, prop) {
      if (prop === 'runTransaction') {
        return async (fn) => {
          chamadas++;
          if (chamadas === 2) await exameRef.update(novosCampos);
          return target.runTransaction(fn);
        };
      }
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

let db;
const CONTA = 'contaT', WS = 'wsT';
const DONO = 'uidDono', MED = 'uidMed', MED2 = 'uidMed2', RITA = 'uidRita';

// Spy do apagador de PDF: registra as URLs, nao toca Storage.
let pdfsApagados;
const apagarPdf = async (url) => { pdfsApagados.push(url); };

// Spy do apagador de imagens (D5b/achado 20): registra wsId/exameId, nao toca Storage.
let imagensApagadas;
const apagarImagens = async (wsId, exameId) => { imagensApagadas.push({ wsId, exameId }); };

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: CONTA, ownerUid: DONO, nomeClinica: 'T' });
  await db.doc(`contas/${CONTA}`).set({ ownerUid: DONO });
  for (const [uid, papel] of [[DONO, 'dono'], [MED, 'medico'], [MED2, 'medico'], [RITA, 'recepcao']]) {
    await db.doc(`vinculos/${CONTA}_${uid}`).set({ contaId: CONTA, medicoUid: uid, papel, locais: [], status: 'ativo' });
  }
  // Vinculo papel:'medico' mas perfil assistente — nao deveria cancelar (C7).
  await db.doc(`vinculos/${CONTA}_uidFalsoMed`).set({ contaId: CONTA, medicoUid: 'uidFalsoMed', papel: 'medico', locais: [], status: 'ativo' });
  await db.doc('profissionais/uidFalsoMed').set({ uid: 'uidFalsoMed', nome: 'Falso', tipoPerfil: 'assistente' });
});

beforeEach(async () => {
  pdfsApagados = [];
  imagensApagadas = [];
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
  test('wsId com barra (remonta path do Admin SDK) → null, sem excecao', async () => {
    assert.equal(await resolverPapel(db, 'a/b', DONO), null);
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
  test('apaga a reserva accIndex/{acc} junto — nao deixa reserva orfa (achado 8)', async () => {
    await db.doc(`workspaces/${WS}/exames/filaAcc`).set({ pacienteNome: 'F', medicoUid: MED, status: 'aguardando', acc: 'EX01010000000001' });
    await db.doc(`workspaces/${WS}/accIndex/EX01010000000001`).set({ exameId: 'filaAcc' });
    const r = await apagarExame(db, { wsId: WS, exameId: 'filaAcc', uid: MED, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    assert.equal((await db.doc(`workspaces/${WS}/accIndex/EX01010000000001`).get()).exists, false, 'reserva de ACC some junto com o exame');
  });
  test('apaga a gaveta privada de idempotencia junto — nao deixa satelite orfao (Ruflo M3)', async () => {
    await db.doc(`workspaces/${WS}/exames/filaPriv`).set({ pacienteNome: 'F', medicoUid: MED, status: 'aguardando' });
    await refEmissaoPrivada(db, WS, 'filaPriv').set({ emissaoKey: 'x', pdfPendente: false });
    const r = await apagarExame(db, { wsId: WS, exameId: 'filaPriv', uid: MED, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    assert.equal((await refEmissaoPrivada(db, WS, 'filaPriv').get()).exists, false, 'gaveta privada some junto com o exame');
  });
  test('exame sem acc: apaga normalmente, sem tentar tocar accIndex', async () => {
    await db.doc(`workspaces/${WS}/exames/filaSemAcc`).set({ pacienteNome: 'F', medicoUid: MED, status: 'aguardando' });
    const r = await apagarExame(db, { wsId: WS, exameId: 'filaSemAcc', uid: MED, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
  });
  // D5b/achado 20: exclusao de exame passa a apagar as imagens no Storage
  // tambem. apagarImagens e opcional (skip silencioso, todos os outros
  // testes acima ja provam isso indiretamente); aqui confere que, quando
  // injetado, e chamado com o wsId/exameId certos.
  test('apagar chama apagarImagens(wsId, exameId) quando injetado (achado 20)', async () => {
    await db.doc(`workspaces/${WS}/exames/filaImg`).set({ pacienteNome: 'F', medicoUid: MED, status: 'aguardando' });
    const r = await apagarExame(db, { wsId: WS, exameId: 'filaImg', uid: MED, subRef: subRef(), apagarPdf, apagarImagens });
    assert.equal(r.ok, true);
    assert.deepEqual(imagensApagadas, [{ wsId: WS, exameId: 'filaImg' }]);
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
  test('papel medico mas tipoPerfil assistente NAO cancela (C7)', async () => {
    await seedEmitido('emC7');
    await db.doc(`workspaces/${WS}/exames/emC7`).update({ medicoUid: 'uidFalsoMed' });
    const r = await cancelarExame(db, { wsId: WS, exameId: 'emC7', uid: 'uidFalsoMed', motivo: 'x', subRef: subRef(), apagarPdf });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'sem_permissao');
  });
  test('devolucao de credito volta como credito', async () => {
    await db.doc(`workspaces/${WS}/exames/em5`).set({ pacienteNome: 'P', medicoUid: MED, status: 'emitido' });
    await db.collection('consumo').add({ workspaceId: WS, exameId: 'em5', tipo: 'credito' });
    await cancelarExame(db, { wsId: WS, exameId: 'em5', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    const sub = (await subRef().get()).data();
    assert.equal(sub.creditosExtras, 4, 'credito devolvido');
    assert.equal(sub.franquiaUsada, 10, 'franquia intacta');
  });

  // Achado 8: sair da fila (FEEGOW, ainda nao emitido) tambem usa cancelar —
  // doc fica (nao apaga), sem consumo/pdf pra devolver (nunca emitiu).
  test('aguardando: dono cancela sem devolver consumo nem mexer em pdf; doc fica', async () => {
    await db.doc(`workspaces/${WS}/exames/fg1`).set({ pacienteNome: 'F', origem: 'FEEGOW', status: 'aguardando' });
    const r = await cancelarExame(db, { wsId: WS, exameId: 'fg1', uid: DONO, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    const ex = (await db.doc(`workspaces/${WS}/exames/fg1`).get()).data();
    assert.equal(ex.status, 'cancelado');
    assert.equal((await subRef().get()).data().franquiaUsada, 10, 'nao mexeu no consumo (nunca emitiu)');
    assert.equal(pdfsApagados.length, 0);
  });
  test('aguardando: medico que alcanca (sem autor travado) cancela; recepcao nao', async () => {
    await db.doc(`workspaces/${WS}/exames/fg2`).set({ pacienteNome: 'F', origem: 'FEEGOW', status: 'aguardando' });
    const neg = await cancelarExame(db, { wsId: WS, exameId: 'fg2', uid: RITA, subRef: subRef(), apagarPdf });
    assert.equal(neg.ok, false);
    assert.equal(neg.motivo, 'sem_permissao');
    const r = await cancelarExame(db, { wsId: WS, exameId: 'fg2', uid: MED, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
  });
  test('aguardando: medico NAO cancela exame de outro medico (autor travado)', async () => {
    await db.doc(`workspaces/${WS}/exames/fg3`).set({ pacienteNome: 'F', origem: 'FEEGOW', status: 'aguardando', medicoUid: MED2 });
    const neg = await cancelarExame(db, { wsId: WS, exameId: 'fg3', uid: MED, subRef: subRef(), apagarPdf });
    assert.equal(neg.ok, false);
    assert.equal(neg.motivo, 'sem_permissao');
  });
  test('rascunho tambem entra no braco aberto (mesmo grupo de acao da tela)', async () => {
    await db.doc(`workspaces/${WS}/exames/fg4`).set({ pacienteNome: 'F', origem: 'FEEGOW', status: 'rascunho' });
    const r = await cancelarExame(db, { wsId: WS, exameId: 'fg4', uid: DONO, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
  });
  test('cancelado nao cancela de novo (nem aberto nem emitido)', async () => {
    await db.doc(`workspaces/${WS}/exames/fg5`).set({ pacienteNome: 'F', origem: 'FEEGOW', status: 'cancelado' });
    const r = await cancelarExame(db, { wsId: WS, exameId: 'fg5', uid: DONO, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'nao_emitido');
  });

  test('E6/CAS: aborta se uma emissao commitou no meio — doc fica emitido, pdf novo intacto', async () => {
    await seedEmitido('cas1');
    const exameRef = db.doc(`workspaces/${WS}/exames/cas1`);
    await exameRef.update({ emitidoEm: FieldValue.serverTimestamp() });
    const dbRace = dbComEmissaoNoMeio(db, exameRef, {
      status: 'emitido',
      emitidoEm: Timestamp.fromMillis(Date.now() + 60000),   // garante diferenca do lido
      pdfUrl: 'https://storage.googleapis.com/bucket-t/laudos/wsT/laudo_novo.pdf',
    });
    const r = await cancelarExame(dbRace, { wsId: WS, exameId: 'cas1', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    assert.deepEqual(r, { ok: false, motivo: 'conflito_emissao' });
    const ex = (await exameRef.get()).data();
    assert.equal(ex.status, 'emitido', 'nao virou cancelado');
    assert.equal(ex.pdfUrl, 'https://storage.googleapis.com/bucket-t/laudos/wsT/laudo_novo.pdf', 'pdf da emissao nova NAO foi apagado');
    assert.equal(pdfsApagados.length, 0, 'apagarPdf nao foi chamado');
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
  test('papel medico mas tipoPerfil assistente NAO transfere (C7)', async () => {
    await db.doc(`workspaces/${WS}/exames/trC7`).set({ pacienteNome: 'P', medicoUid: 'uidFalsoMed', status: 'aguardando' });
    const r = await transferirExame(db, { wsId: WS, exameId: 'trC7', uid: 'uidFalsoMed', novoMedicoUid: MED2, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'sem_permissao');
  });
  test('alvo papel:medico mas perfil assistente NAO recebe (D)', async () => {
    await db.doc(`workspaces/${WS}/exames/trD`).set({ pacienteNome: 'P', medicoUid: MED, status: 'aguardando' });
    const r = await transferirExame(db, { wsId: WS, exameId: 'trD', uid: DONO, novoMedicoUid: 'uidFalsoMed', subRef: subRef(), apagarPdf });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'alvo_invalido');
    assert.equal((await db.doc(`workspaces/${WS}/exames/trD`).get()).data().medicoUid, MED, 'alvo nao herdou');
  });
  test('alvo precisa ser medico/dono da conta', async () => {
    await db.doc(`workspaces/${WS}/exames/tr3`).set({ pacienteNome: 'P', medicoUid: MED, status: 'aguardando' });
    const r = await transferirExame(db, { wsId: WS, exameId: 'tr3', uid: DONO, novoMedicoUid: RITA, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'alvo_invalido');
  });
  test('novoMedicoUid com barra (remonta path do Admin SDK) → alvo_invalido, sem excecao', async () => {
    await db.doc(`workspaces/${WS}/exames/trBarra`).set({ pacienteNome: 'P', medicoUid: MED, status: 'aguardando' });
    const r = await transferirExame(db, { wsId: WS, exameId: 'trBarra', uid: DONO, novoMedicoUid: 'a/b', subRef: subRef(), apagarPdf });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'alvo_invalido');
  });

  test('E6/CAS: aborta se uma emissao commitou no meio — nao transfere, pdf novo intacto', async () => {
    await seedEmitido('cast1');
    const exameRef = db.doc(`workspaces/${WS}/exames/cast1`);
    await exameRef.update({ emitidoEm: FieldValue.serverTimestamp() });
    const dbRace = dbComEmissaoNoMeio(db, exameRef, {
      status: 'emitido',
      emitidoEm: Timestamp.fromMillis(Date.now() + 60000),
      pdfUrl: 'https://storage.googleapis.com/bucket-t/laudos/wsT/laudo_novo_t.pdf',
    });
    const r = await transferirExame(dbRace, { wsId: WS, exameId: 'cast1', uid: DONO, novoMedicoUid: MED2, subRef: subRef(), apagarPdf });
    assert.deepEqual(r, { ok: false, motivo: 'conflito_emissao' });
    const ex = (await exameRef.get()).data();
    assert.equal(ex.medicoUid, MED, 'nao transferiu');
    assert.equal(ex.pdfUrl, 'https://storage.googleapis.com/bucket-t/laudos/wsT/laudo_novo_t.pdf');
    assert.equal(pdfsApagados.length, 0);
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
