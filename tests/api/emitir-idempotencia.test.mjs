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
//
// Revisao onda-0 (C1+I1): o estado de idempotencia mora na gaveta
// `workspaces/{ws}/privado/emissao/exames/{exameId}` (deny-by-default pra todo
// cliente) e carrega `pdfPendente` — replay de emissao com PDF pendente manda
// a rota REGERAR em vez de dizer "sucesso" com pdfUrl nulo.
// ══════════════════════════════════════════════════════════════════
import { test, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { emitirComCobranca, emissaoKeyValida, refEmissaoPrivada } from '../../src/lib/emitir-admin.ts';

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
// Gaveta server-only: a fonte da verdade da idempotencia (I1).
const privDoc = async (exameId) => (await refEmissaoPrivada(db, WS, exameId).get()).data();
// O que a rota faz depois de salvar o PDF (baixa a bandeira de pendente).
const pdfSalvo = (exameId) =>
  refEmissaoPrivada(db, WS, exameId).set({ pdfPendente: false }, { merge: true });

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

  test('(g) PDF ja salvo: replay devolve o pdfUrl que existe e NAO manda regerar', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ pdfUrl: 'https://x/laudo.pdf' });
    await pdfSalvo(id);
    const r = await emitir(id, KEY_A);
    assert.equal(r.replay, true);
    assert.equal(r.pdfPendente, false, 'replay com PDF pronto nao pode pedir regeracao');
    assert.equal(r.pdfUrl, 'https://x/laudo.pdf');
  });

  test('(f) C1 — PDF pendente: replay manda REGERAR, sem cobrar e sem escrever', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);           // a rota morreu no Puppeteer: pdfPendente fica true
    const antes = await exameDoc(id);
    const r = await emitir(id, KEY_A, { convenio: 'OUTRO' });
    assert.equal(r.ok, true);
    assert.equal(r.replay, true);
    assert.equal(r.pdfPendente, true, 'sem isto a rota devolve "sucesso" com pdfUrl nulo (C1)');
    assert.equal(r.pdfUrl, null);
    assert.equal(await usada(), 1, 'replay cobrou de novo');
    assert.equal(await consumos(id), 1);
    const depois = await exameDoc(id);
    assert.equal(depois.convenio, 'PART', 'replay reescreveu o laudo assinado');
    assert.equal(depois.emitidoEm.toMillis(), antes.emitidoEm.toMillis(), 'emitidoEm remexido');
  });

  test('replay NAO reescreve o laudo assinado (dadosFinais do retry sao ignorados)', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await pdfSalvo(id);
    const antes = await exameDoc(id);
    await emitir(id, KEY_A, { convenio: 'OUTRO' });
    const depois = await exameDoc(id);
    assert.equal(depois.convenio, 'PART');
    assert.equal(depois.emitidoEm.toMillis(), antes.emitidoEm.toMillis(), 'emitidoEm remexido');
  });

  test('(i) a key vai pra gaveta privada NA MESMA transacao do debito', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const priv = await privDoc(id);
    assert.equal(priv.emissaoKey, KEY_A);
    assert.equal(priv.pdfPendente, true, 'emissao nova nasce devendo o PDF');
    assert.equal((await exameDoc(id)).status, 'emitido');
    assert.equal(await usada(), 1);
  });

  test('(j) I1 — o doc do exame (editavel pelo medico-autor) NAO guarda a key', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    assert.equal((await exameDoc(id)).emissaoKeyAtual, undefined,
      'a key voltou pro doc que o cliente escreve pelo SDK');
  });

  // (h) I1 — o medico-autor consegue carimbar campos no PROPRIO exame pelo SDK
  // (firestore.rules:204-208). Se a autoridade do replay fosse o doc do exame,
  // plantar key/bandeira ali daria reemissao (ou regeracao) de graca.
  test('(h) key forjada no doc do exame nao vira replay — cobra como reemissao', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await pdfSalvo(id);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ emissaoKeyAtual: KEY_B });
    const r = await emitir(id, KEY_B);
    assert.equal(r.replay, false, 'key plantada no doc do exame virou replay');
    assert.equal(await usada(), 2);
  });

  test('(h) bandeira pdfPendente forjada no doc do exame nao autoriza regeracao', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ pdfUrl: 'https://x/laudo.pdf' });
    await pdfSalvo(id);                                        // gaveta: pdfPendente = false
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ pdfPendente: true });   // forjado
    const r = await emitir(id, KEY_A);
    assert.equal(r.replay, true);
    assert.equal(r.pdfPendente, false, 'a bandeira do cliente mandou na regeracao');
    assert.equal(r.pdfUrl, 'https://x/laudo.pdf');
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
    const priv = await privDoc(id);
    assert.equal(priv.emissaoKey, KEY_B, 'key da reemissao nao assumiu');
    assert.equal(priv.pdfPendente, true, 'reemissao volta a dever o PDF');
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
    assert.equal((await privDoc(id)).emissaoKey, null, 'sem key nao cria trava');
  });

  test('(d) key malformada nao vira trava (a rota ja devolveu 400; a lib ignora)', async () => {
    const id = await seedExame();
    await emitir(id, 'nao-e-uuid');
    assert.equal((await privDoc(id)).emissaoKey, null);
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
