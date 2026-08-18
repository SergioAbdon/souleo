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
  test('conexao OK grava status ok em integracoes/{tipo} e devolve 200', async () => {
    const fetchOk = async () => new Response('{}', { status: 200 });
    const r = await executarTeste(db, {
      wsId: WS, tipo: 'orthanc',
      credencialBody: { url: 'http://orthanc.local', senha: 'segredoOrthanc123' },
      fetchImpl: fetchOk,
    });
    assert.equal(r.httpStatus, 200);
    assert.equal(r.ok, true);
    assert.equal(r.status, 'ok');
    const doc = (await db.doc(`workspaces/${WS}/integracoes/orthanc`).get()).data();
    assert.equal(doc.status, 'ok');
    assert.equal(doc.ultimoErro, null);
  });
  test('erro do alvo contendo a credencial -> ultimoErro gravado NAO contem a credencial', async () => {
    const SEGREDO = 'tokenSuperSecreto999';
    const fetchVazando = async () => new Response(`acesso negado para o token ${SEGREDO}`, { status: 401 });
    const r = await executarTeste(db, {
      wsId: WS, tipo: 'feegow', credencialBody: { token: SEGREDO }, fetchImpl: fetchVazando,
    });
    assert.equal(r.status, 'erro');
    assert.equal(r.mensagem.includes(SEGREDO), false, 'resposta da rota nao pode conter a credencial');
    const doc = (await db.doc(`workspaces/${WS}/integracoes/feegow`).get()).data();
    assert.equal(doc.ultimoErro.includes(SEGREDO), false, 'ultimoErro gravado nao pode conter a credencial');
    assert.match(doc.ultimoErro, /\*\*\*/);
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
  test('testarFeegow lanca com o texto do alvo quando a resposta nao e ok', async () => {
    const fetchImpl = async () => new Response('falhou', { status: 500 });
    await assert.rejects(testarFeegow({ token: 'x'.repeat(10) }, fetchImpl), /Feegow 500/);
  });
  test('testarOrthanc lanca quando a resposta nao e ok', async () => {
    const fetchImpl = async () => new Response('falhou', { status: 500 });
    await assert.rejects(testarOrthanc({ url: 'http://x', senha: 'y'.repeat(10) }, fetchImpl), /Orthanc 500/);
  });
});
