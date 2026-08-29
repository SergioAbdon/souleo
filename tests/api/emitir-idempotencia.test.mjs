// ══════════════════════════════════════════════════════════════════
// S7-T0.3 · Trava anti-cobranca-dupla do /api/emitir (achado E1)
// A transacao de dinheiro do emitir era o unico caminho de billing SEM
// teste de servidor (E9). Aqui ela e testada direto (mesma DI de
// exame.test.mjs: db do emulador, funcao pura de lib).
// O cenario real: a transacao commita em ~1s, o Puppeteer leva 15-60s;
// timeout de rede -> o medico ve "Erro de conexao" com a franquia JA
// debitada -> clica de novo -> 2a franquia. Com a emissaoKey, o retry da
// MESMA tentativa e replay (nao cobra); reemissao deliberada (outra key)
// continua cobrando (politica P3/I2, registrada).
// ══════════════════════════════════════════════════════════════════
import { test, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { emitirComCobranca, emissaoKeyValida } from '../../src/lib/emitir-admin.ts';

let db;
const CONTA = 'contaE', WS = 'wsE';
const MED = 'uidMedE', MED2 = 'uidMed2E';
const KEY_A = '11111111-2222-4333-8444-555555555555';
const KEY_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: CONTA, ownerUid: MED });
  await db.doc(`contas/${CONTA}`).set({ ownerUid: MED });
});

beforeEach(async () => {
  await db.doc(`subscriptions/${CONTA}`).set({
    contaId: CONTA, franquiaMensal: 600, franquiaUsada: 0, creditosExtras: 0,
    cicloFim: new Date(Date.now() + 30 * 864e5),
  });
});

let n = 0;
async function seedExame() {
  const id = `exE${++n}_${Date.now()}`;
  await db.doc(`workspaces/${WS}/exames/${id}`).set({
    pacienteNome: 'Paciente E', tipoExame: 'ECOTT', status: 'andamento', medicoUid: MED,
  });
  // Limpa ledger anterior deste exame (id e unico, mas o filtro e por exameId).
  return id;
}

const emitir = (exameId, emissaoKey, extra = {}) => emitirComCobranca(db, {
  wsId: WS, exameId, uid: MED, medicoUid: MED,
  dadosFinais: { pacienteNome: 'Paciente E', tipoExame: 'ECOTT', convenio: 'PART', ...extra },
  emissaoKey,
});

const usada = async () => ((await db.doc(`subscriptions/${CONTA}`).get()).data().franquiaUsada) || 0;
const consumos = async (exameId) =>
  (await db.collection('consumo').where('exameId', '==', exameId).get()).size;
const exameDoc = async (exameId) => (await db.doc(`workspaces/${WS}/exames/${exameId}`).get()).data();

describe('emissaoKeyValida (formato UUID — rota devolve 400 no resto)', () => {
  test('UUID v4 passa', () => assert.equal(emissaoKeyValida(KEY_A), true));
  test('lixo nao passa', () => {
    for (const k of ['', 'abc', '11111111-2222-4333-8444-55555555555', 42, null, undefined,
      { a: 1 }, 'x'.repeat(300), '11111111-2222-4333-8444-555555555555 ']) {
      assert.equal(emissaoKeyValida(k), false, `deveria recusar: ${String(k)}`);
    }
  });
});

describe('E1 — replay da MESMA tentativa nao cobra de novo', () => {
  test('(a) mesma key apos emissao commitada: sem 2o debito, sem 2o consumo', async () => {
    const id = await seedExame();
    const r1 = await emitir(id, KEY_A);
    assert.equal(r1.ok, true);
    assert.equal(r1.tipo, 'franquia');
    assert.equal(r1.replay, false);
    assert.equal(await usada(), 1);
    assert.equal(await consumos(id), 1);

    const r2 = await emitir(id, KEY_A);
    assert.equal(r2.ok, true);
    assert.equal(r2.replay, true);
    assert.equal(await usada(), 1, 'franquia debitada 2x');
    assert.equal(await consumos(id), 1, 'ledger com consumo duplicado');
  });

  test('replay devolve o pdfUrl ja gravado (o retry nao regera nada)', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ pdfUrl: 'https://x/laudo.pdf' });
    const r = await emitir(id, KEY_A);
    assert.equal(r.replay, true);
    assert.equal(r.pdfUrl, 'https://x/laudo.pdf');
  });

  test('replay NAO reescreve o laudo assinado (dadosFinais do retry sao ignorados)', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const antes = await exameDoc(id);
    await emitir(id, KEY_A, { convenio: 'OUTRO' });
    const depois = await exameDoc(id);
    assert.equal(depois.convenio, 'PART');
    assert.equal(depois.emitidoEm.toMillis(), antes.emitidoEm.toMillis(), 'emitidoEm remexido');
  });

  test('(c) a key e gravada NA MESMA transacao do debito', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const exame = await exameDoc(id);
    assert.equal(exame.emissaoKeyAtual, KEY_A);
    assert.equal(exame.status, 'emitido');
    assert.equal(await usada(), 1);
  });

  test('key so vale com o exame EMITIDO (cancelado/reaberto cobra de novo)', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ status: 'andamento' });
    const r = await emitir(id, KEY_A);
    assert.equal(r.replay, false);
    assert.equal(await usada(), 2);
  });
});

describe('E2 — reemissao deliberada continua cobrando', () => {
  test('(b) outra key no exame ja emitido cobra 1 franquia nova', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const r = await emitir(id, KEY_B);
    assert.equal(r.ok, true);
    assert.equal(r.replay, false);
    assert.equal(await usada(), 2);
    assert.equal(await consumos(id), 2);
    assert.equal((await exameDoc(id)).emissaoKeyAtual, KEY_B, 'key da reemissao nao assumiu');
  });
});

describe('cliente antigo / key invalida — comportamento legado (aditivo)', () => {
  test('(e) sem key: 2 POSTs cobram 2x (como hoje), nada e gravado no exame', async () => {
    const id = await seedExame();
    await emitir(id, undefined);
    await emitir(id, undefined);
    assert.equal(await usada(), 2);
    assert.equal(await consumos(id), 2);
    assert.equal((await exameDoc(id)).emissaoKeyAtual, undefined);
  });

  test('(d) key malformada nao vira trava (a rota ja devolveu 400; a lib ignora)', async () => {
    const id = await seedExame();
    await emitir(id, 'nao-e-uuid');
    assert.equal((await exameDoc(id)).emissaoKeyAtual, undefined);
    await emitir(id, 'nao-e-uuid');
    assert.equal(await usada(), 2);
  });
});

describe('billing e autoria seguem intactos (E9: primeira rede do caminho de dinheiro)', () => {
  test('exame de outro medico → exame_de_outro_medico, sem cobrar', async () => {
    const id = await seedExame();
    const r = await emitirComCobranca(db, {
      wsId: WS, exameId: id, uid: MED2, medicoUid: MED2, dadosFinais: {}, emissaoKey: KEY_A,
    });
    assert.deepEqual(r, { ok: false, motivo: 'exame_de_outro_medico' });
    assert.equal(await usada(), 0);
  });
  test('exame inexistente → nao_encontrado', async () => {
    const r = await emitir('naoExisteE', KEY_A);
    assert.equal(r.motivo, 'nao_encontrado');
  });
  test('franquia esgotada com creditos → cobra credito', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({ franquiaUsada: 600, creditosExtras: 2 });
    const id = await seedExame();
    const r = await emitir(id, KEY_A);
    assert.equal(r.tipo, 'creditos');
    assert.equal((await db.doc(`subscriptions/${CONTA}`).get()).data().creditosExtras, 1);
  });
  test('franquia esgotada e sem credito → sem_saldo, sem debito', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({ franquiaUsada: 600, creditosExtras: 0 });
    const id = await seedExame();
    assert.equal((await emitir(id, KEY_A)).motivo, 'sem_saldo');
    assert.equal(await consumos(id), 0);
  });
  test('ciclo vencido sem credito → expirado', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({ cicloFim: new Date(Date.now() - 864e5) });
    const id = await seedExame();
    assert.equal((await emitir(id, KEY_A)).motivo, 'expirado');
  });
  test('workspace sem assinatura → sem_plano', async () => {
    await db.doc('workspaces/wsSemPlanoE').set({ contaId: 'contaSemPlanoE' });
    await db.doc('workspaces/wsSemPlanoE/exames/e1').set({ status: 'andamento', medicoUid: MED });
    const r = await emitirComCobranca(db, {
      wsId: 'wsSemPlanoE', exameId: 'e1', uid: MED, medicoUid: MED, dadosFinais: {}, emissaoKey: KEY_A,
    });
    assert.equal(r.motivo, 'sem_plano');
  });
});
