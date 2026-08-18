// /api/integracoes — testar conexao (Sub-plano 5, Task 3). Emulador Firestore.
// A rota (src/app/api/integracoes/route.ts) importa 'next/server' + '@/lib/*'
// em tempo de execucao — nao resolve em node --test puro (padrao ja
// estabelecido: nenhuma rota de tests/api/ e importada direto, so a lib).
// Auth (requireUid) e papel (resolverPapel) sao os MESMOS usados pela rota
// (import direto de src/lib/auth-admin.ts e src/lib/exame-admin.ts — zero
// verificacao nova). O contrato 3-6 (ler segredo/bater no alvo/gravar/
// sanitizar) mora em integracoes-admin.ts e e testado direto aqui.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolverPapel } from '../../src/lib/exame-admin.ts';
import { requireUid } from '../../src/lib/auth-admin.ts';
import { executarTeste, sanitizar, testarFeegow, testarOrthanc } from '../../src/lib/integracoes-admin.ts';

let db;
const CONTA = 'contaInt', WS = 'wsInt';
const DONO = 'uidDonoInt', MED = 'uidMedInt', RITA = 'uidRitaInt';

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: CONTA, nomeClinica: 'Integracoes Teste' });
  for (const [uid, papel] of [[DONO, 'dono'], [MED, 'medico'], [RITA, 'recepcao']]) {
    await db.doc(`vinculos/${CONTA}_${uid}`).set({ contaId: CONTA, medicoUid: uid, papel, locais: [], status: 'ativo' });
  }
});

describe('autorizacao (contrato pontos 1-2 — a rota so segue com dono)', () => {
  test('sem Authorization -> requireUid resolve null (rota devolve 401)', async () => {
    const req = new Request('http://localhost/api/integracoes', { method: 'POST' });
    assert.equal(await requireUid(req), null);
  });
  test('token invalido -> requireUid resolve null (rota devolve 401)', async () => {
    const req = new Request('http://localhost/api/integracoes', {
      method: 'POST', headers: { authorization: 'Bearer token-invalido' },
    });
    assert.equal(await requireUid(req), null);
  });
  test('papel medico -> resolverPapel resolve medico (rota trata como 403)', async () => {
    assert.equal(await resolverPapel(db, WS, MED), 'medico');
  });
  test('papel recepcao -> resolverPapel resolve recepcao (rota trata como 403)', async () => {
    assert.equal(await resolverPapel(db, WS, RITA), 'recepcao');
  });
  test('dono resolve dono (unico papel que a rota deixa passar)', async () => {
    assert.equal(await resolverPapel(db, WS, DONO), 'dono');
  });
});

describe('executarTeste (contrato pontos 3-6 — dono ja resolvido pela rota)', () => {
  test("tipo invalido ('qualquer') -> 400", async () => {
    const r = await executarTeste(db, { wsId: WS, tipo: 'qualquer' });
    assert.equal(r.httpStatus, 400);
    assert.equal(r.ok, false);
  });
  test("tipo 'wader' -> 400 (o Wader avisa sozinho por batimento)", async () => {
    const r = await executarTeste(db, { wsId: WS, tipo: 'wader' });
    assert.equal(r.httpStatus, 400);
    assert.equal(r.ok, false);
  });
  test('feegow sem credencial cadastrada e sem credencial no corpo -> 400 com mensagem util', async () => {
    const r = await executarTeste(db, { wsId: WS, tipo: 'feegow' });
    assert.equal(r.httpStatus, 400);
    assert.equal(r.ok, false);
    assert.match(r.mensagem, /credencial/i);
    assert.equal((await db.doc(`workspaces/${WS}/privado/feegow`).get()).exists, false);
  });
  test('credencial no corpo ("testar antes de salvar") -> privado/{tipo} continua ausente', async () => {
    const fetchOk = async () => new Response('{}', { status: 200 });
    await executarTeste(db, {
      wsId: WS, tipo: 'feegow', credencialBody: { token: 'tok-do-corpo-123' }, fetchImpl: fetchOk,
    });
    assert.equal((await db.doc(`workspaces/${WS}/privado/feegow`).get()).exists, false,
      'testar antes de salvar nao grava privado/{tipo}');
  });
  test('credencial no corpo com sucesso tambem NAO grava em integracoes/{tipo} (Important 3 — cartao nao pode mentir)', async () => {
    const fetchOk = async () => new Response('{}', { status: 200 });
    const antes = (await db.doc(`workspaces/${WS}/integracoes/orthanc`).get()).data();
    const r = await executarTeste(db, {
      wsId: WS, tipo: 'orthanc',
      credencialBody: { url: 'http://orthanc.corpo.local', pass: 'segredoOrthanc123' },
      fetchImpl: fetchOk,
    });
    assert.equal(r.httpStatus, 200);
    assert.equal(r.ok, true);
    assert.equal(r.status, 'ok');
    const depois = (await db.doc(`workspaces/${WS}/integracoes/orthanc`).get()).data();
    assert.deepEqual(depois, antes, 'testar com credencial do corpo nao grava em integracoes/{tipo}, mesmo com sucesso');
  });
  test('gaveta privado/orthanc {user,pass} monta Basic Auth correto e grava status ok (Critical 1 + Important 2)', async () => {
    await db.doc(`workspaces/${WS}/privado/orthanc`).set({ user: 'leo', pass: 'senhaLonga123' });
    await db.doc(`workspaces/${WS}/integracoes/orthanc`).set({ url: 'http://orthanc.gaveta.local' }, { merge: true });
    let headersRecebidos;
    const fetchCaptura = async (_url, opts) => { headersRecebidos = opts.headers; return new Response('{}', { status: 200 }); };
    const r = await executarTeste(db, { wsId: WS, tipo: 'orthanc', fetchImpl: fetchCaptura });
    assert.equal(r.httpStatus, 200);
    assert.equal(r.ok, true);
    const esperado = 'Basic ' + Buffer.from('leo:senhaLonga123').toString('base64');
    assert.equal(headersRecebidos.Authorization, esperado, 'nomes de campo user/pass da gaveta (Critical 1) chegam ao Basic Auth');
    const doc = (await db.doc(`workspaces/${WS}/integracoes/orthanc`).get()).data();
    assert.equal(doc.status, 'ok');
    assert.equal(doc.ultimoErro, null);
  });
  test('credencial no corpo so com senha combina com o endereco publico ja salvo (Minor 2)', async () => {
    await db.doc(`workspaces/${WS}/integracoes/orthanc`).set({ url: 'http://orthanc.publico.local' }, { merge: true });
    const fetchOk = async () => new Response('{}', { status: 200 });
    const r = await executarTeste(db, {
      wsId: WS, tipo: 'orthanc', credencialBody: { pass: 'somenteSenha123' }, fetchImpl: fetchOk,
    });
    assert.equal(r.ok, true, 'endereco publico + senha do corpo devem se combinar sem "Endereço do Orthanc ausente"');
  });
  test('erro do alvo contendo a credencial do corpo -> mensagem devolvida nao contem a credencial e nada e gravado (Important 1 + 3)', async () => {
    const SEGREDO = 'tokenSuperSecreto999';
    const fetchVazando = async () => new Response(`acesso negado para o token ${SEGREDO}`, { status: 401 });
    const antes = (await db.doc(`workspaces/${WS}/integracoes/feegow`).get()).data();
    const r = await executarTeste(db, {
      wsId: WS, tipo: 'feegow', credencialBody: { token: SEGREDO }, fetchImpl: fetchVazando,
    });
    assert.equal(r.status, 'erro');
    assert.equal(r.mensagem.includes(SEGREDO), false, 'resposta da rota nao pode conter a credencial');
    assert.equal(r.mensagem, 'Feegow 401', 'mensagem nao embute o corpo da resposta do alvo');
    const depois = (await db.doc(`workspaces/${WS}/integracoes/feegow`).get()).data();
    assert.deepEqual(depois, antes, 'testar com credencial do corpo nao grava em integracoes/{tipo}');
  });
  test('gaveta com senha curta (abaixo do piso de 6 do sanitizar) — corpo do erro do alvo nao vaza (Important 1, raiz)', async () => {
    await db.doc(`workspaces/${WS}/privado/orthanc`).set({ user: 'leo', pass: 'ad123' });
    await db.doc(`workspaces/${WS}/integracoes/orthanc`).set({ url: 'http://orthanc.curta.local' }, { merge: true });
    const fetchVazando = async () => new Response('acesso negado, senha usada: ad123', { status: 401 });
    const r = await executarTeste(db, { wsId: WS, tipo: 'orthanc', fetchImpl: fetchVazando });
    assert.equal(r.status, 'erro');
    assert.equal(r.mensagem.includes('ad123'), false);
    const doc = (await db.doc(`workspaces/${WS}/integracoes/orthanc`).get()).data();
    assert.equal(doc.ultimoErro.includes('ad123'), false, 'senha curta nao pode vazar mesmo abaixo do piso do sanitizar');
    assert.equal(doc.ultimoErro, 'Orthanc 401', 'mensagem gravada nao embute o corpo da resposta do alvo');
  });
});

describe('sanitizar', () => {
  test('troca cada segredo (>=6 chars) por *** e ignora segredos curtos', () => {
    assert.equal(sanitizar('token abc123456 falhou', ['abc123456']), 'token *** falhou');
    assert.equal(sanitizar('erro 123', ['12']), 'erro 123'); // curto demais, nao mexe
  });
  test('corta em 300 caracteres', () => {
    const longa = 'x'.repeat(500);
    assert.equal(sanitizar(longa, []).length, 300);
  });
});

describe('testarFeegow / testarOrthanc (bater no alvo)', () => {
  test('testarFeegow lanca so com status quando a resposta nao e ok (nao embute o corpo do alvo)', async () => {
    const fetchImpl = async () => new Response('falhou', { status: 500 });
    await assert.rejects(testarFeegow({ token: 'x'.repeat(10) }, fetchImpl), /Feegow 500/);
    await assert.rejects(testarFeegow({ token: 'x'.repeat(10) }, fetchImpl), (e) => !e.message.includes('falhou'));
  });
  test('testarOrthanc lanca so com status quando a resposta nao e ok (nao embute o corpo do alvo)', async () => {
    const fetchImpl = async () => new Response('falhou', { status: 500 });
    await assert.rejects(testarOrthanc({ url: 'http://x', pass: 'y'.repeat(10) }, fetchImpl), /Orthanc 500/);
    await assert.rejects(testarOrthanc({ url: 'http://x', pass: 'y'.repeat(10) }, fetchImpl), (e) => !e.message.includes('falhou'));
  });
});
