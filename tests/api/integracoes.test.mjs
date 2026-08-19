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
import {
  executarTeste, sanitizar, testarFeegow, testarOrthanc,
  salvarIntegracao, removerCredencial, resolverConfigOrthanc,
} from '../../src/lib/integracoes-admin.ts';

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
  test('a MESMA falha duas vezes seguidas nao se auto-mascara', async () => {
    // O ultimoErro da tentativa anterior fica no documento publico. Se os segredos
    // fossem derivados de `conn` (publico + gaveta), a 2a falha identica viraria
    // "***" e apagaria o diagnostico justo quando o dono tenta entender a falha.
    await db.doc(`workspaces/${WS}/privado/orthanc`).set({ user: 'leo', pass: 'senhaLonga123' });
    await db.doc(`workspaces/${WS}/integracoes/orthanc`).set({ url: 'http://orthanc.repetido.local' }, { merge: true });
    const fetch401 = async () => new Response('nao autorizado', { status: 401 });
    await executarTeste(db, { wsId: WS, tipo: 'orthanc', fetchImpl: fetch401 });
    const r2 = await executarTeste(db, { wsId: WS, tipo: 'orthanc', fetchImpl: fetch401 });
    assert.equal(r2.mensagem, 'Orthanc 401', 'a 2a falha identica tem de continuar legivel');
    const doc = (await db.doc(`workspaces/${WS}/integracoes/orthanc`).get()).data();
    assert.equal(doc.ultimoErro, 'Orthanc 401');
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
  // Minor 5 (Sub-plano 5, Task 7 revisao): "testar antes de salvar" tem que
  // recusar esquema nao-http(s) igual resolverConfigOrthanc (SSRF) — os dois
  // caminhos nao podem discordar sobre a mesma regra.
  test('testarOrthanc recusa esquema file:// mesmo com credencial valida (SSRF no caminho de teste)', async () => {
    const fetchImpl = async () => { throw new Error('NUNCA deveria chegar a rede'); };
    await assert.rejects(testarOrthanc({ url: 'file:///etc/passwd' }, fetchImpl), /http/i);
  });
  test('testarOrthanc recusa esquema gopher:// mesmo com credencial valida', async () => {
    const fetchImpl = async () => { throw new Error('NUNCA deveria chegar a rede'); };
    await assert.rejects(testarOrthanc({ url: 'gopher://interno.local:70/' }, fetchImpl), /http/i);
  });
});

describe('salvarIntegracao / removerCredencial (contrato write-only + espelho — Task 4)', () => {
  test('salvar com credencial vazia (string "") NAO apaga o segredo existente', async () => {
    await db.doc(`workspaces/${WS}/privado/feegow`).set({ token: 'tokenOriginal123' });
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'feegow', config: {}, credencial: { token: '' } });
    assert.equal(r.httpStatus, 200);
    const priv = (await db.doc(`workspaces/${WS}/privado/feegow`).get()).data();
    assert.equal(priv.token, 'tokenOriginal123', 'credencial vazia nao pode apagar o segredo existente');
  });
  test('salvar com credencial ausente (undefined) NAO apaga o segredo existente', async () => {
    await db.doc(`workspaces/${WS}/privado/feegow`).set({ token: 'tokenOriginal456' });
    await salvarIntegracao(db, { wsId: WS, tipo: 'feegow', config: { procMap: { '1': 'eco_tt' } } });
    const priv = (await db.doc(`workspaces/${WS}/privado/feegow`).get()).data();
    assert.equal(priv.token, 'tokenOriginal456', 'credencial ausente nao pode apagar o segredo existente');
  });
  test('salvar com credencial nova SUBSTITUI o segredo', async () => {
    await db.doc(`workspaces/${WS}/privado/feegow`).set({ token: 'tokenAntigo789' });
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'feegow', credencial: { token: 'tokenNovo999' } });
    assert.equal(r.httpStatus, 200);
    const priv = (await db.doc(`workspaces/${WS}/privado/feegow`).get()).data();
    assert.equal(priv.token, 'tokenNovo999');
  });
  test('orthanc: so a senha veio -> so a senha troca, usuario existente continua intacto (Minor 1)', async () => {
    await db.doc(`workspaces/${WS}/privado/orthanc`).set({ user: 'u1', pass: 'p1' });
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'orthanc', credencial: { pass: 'p2' } });
    assert.equal(r.httpStatus, 200);
    const priv = (await db.doc(`workspaces/${WS}/privado/orthanc`).get()).data();
    assert.equal(priv.user, 'u1', 'usuario existente nao pode ser apagado quando so a senha e enviada');
    assert.equal(priv.pass, 'p2');
  });
  test('salvar orthanc com url vazia ("") NAO apaga o endereco salvo (Minor 3)', async () => {
    await salvarIntegracao(db, { wsId: WS, tipo: 'orthanc', config: { url: 'http://orthanc.enderecoOriginal.local' } });
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'orthanc', config: { url: '' } });
    assert.equal(r.httpStatus, 200);
    const pub = (await db.doc(`workspaces/${WS}/integracoes/orthanc`).get()).data();
    assert.equal(pub.url, 'http://orthanc.enderecoOriginal.local', 'endereco em branco nao pode apagar o endereco salvo');
  });
  test('remover apaga o documento de privado/{tipo}', async () => {
    await db.doc(`workspaces/${WS}/privado/feegow`).set({ token: 'paraRemover123' });
    const r = await removerCredencial(db, { wsId: WS, tipo: 'feegow' });
    assert.equal(r.httpStatus, 200);
    assert.equal((await db.doc(`workspaces/${WS}/privado/feegow`).get()).exists, false);
    assert.equal(r.integracao.credencialCadastradaEm, null);
  });
  test('salvar orthanc com ativo=true grava ativo nos DOIS lugares (tripwire do espelho)', async () => {
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'orthanc', config: { url: 'http://orthanc.espelho.local', ativo: true } });
    assert.equal(r.httpStatus, 200);
    const pub = (await db.doc(`workspaces/${WS}/integracoes/orthanc`).get()).data();
    const ws = (await db.doc(`workspaces/${WS}`).get()).data();
    assert.equal(pub.ativo, true);
    assert.equal(ws.ortancAtivo, true, 'workspaces/{wsId}.ortancAtivo tem que ligar junto (SidebarLaudo le esse campo)');
  });
  test('salvar orthanc com ativo=false desliga nos DOIS lugares', async () => {
    await salvarIntegracao(db, { wsId: WS, tipo: 'orthanc', config: { ativo: true } }); // liga primeiro
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'orthanc', config: { ativo: false } });
    assert.equal(r.httpStatus, 200);
    const pub = (await db.doc(`workspaces/${WS}/integracoes/orthanc`).get()).data();
    const ws = (await db.doc(`workspaces/${WS}`).get()).data();
    assert.equal(pub.ativo, false);
    assert.equal(ws.ortancAtivo, false, 'espelho tem que desligar junto');
  });
  test('salvar feegow com procMap grava o mapa em integracoes/feegow', async () => {
    const mapa = { '101': 'eco_tt', '202': 'doppler_carotidas' };
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'feegow', config: { procMap: mapa } });
    assert.equal(r.httpStatus, 200);
    const pub = (await db.doc(`workspaces/${WS}/integracoes/feegow`).get()).data();
    assert.deepEqual(pub.procMap, mapa);
  });
  test('salvar feegow com procMap SUBSTITUI o mapa inteiro (tripwire: nao pode so acumular chave antiga)', async () => {
    await salvarIntegracao(db, { wsId: WS, tipo: 'feegow', config: { procMap: { '999': 'eco_tt', '888': 'eco_te' } } });
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'feegow', config: { procMap: { '101': 'doppler_carotidas' } } });
    assert.equal(r.httpStatus, 200);
    const pub = (await db.doc(`workspaces/${WS}/integracoes/feegow`).get()).data();
    assert.deepEqual(pub.procMap, { '101': 'doppler_carotidas' },
      'o mapa novo tem que substituir o antigo por inteiro — {merge:true} faria deep-merge e as chaves 999/888 vazariam');
  });
  test('tipo invalido em salvar/remover -> 400', async () => {
    const r1 = await salvarIntegracao(db, { wsId: WS, tipo: 'wader', config: {} });
    assert.equal(r1.httpStatus, 400);
    const r2 = await removerCredencial(db, { wsId: WS, tipo: 'qualquer' });
    assert.equal(r2.httpStatus, 400);
  });
  test('salvar credencial nova zera status/ultimoTeste/ultimoErro (cartao nao pode mentir sobre credencial trocada)', async () => {
    await db.doc(`workspaces/${WS}/integracoes/feegow`).set({ tipo: 'feegow', status: 'ok', ultimoTeste: new Date(), ultimoErro: null });
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'feegow', credencial: { token: 'tokenTrocado' } });
    assert.equal(r.httpStatus, 200);
    assert.equal(r.integracao.status, 'nunca_testado');
    const pub = (await db.doc(`workspaces/${WS}/integracoes/feegow`).get()).data();
    assert.equal(pub.status, 'nunca_testado');
    assert.equal(pub.ultimoTeste, null);
    assert.equal(pub.ultimoErro, null);
  });
  test('salvar orthanc com url nova tambem zera status/ultimoTeste/ultimoErro (trocar o alvo invalida o teste)', async () => {
    await db.doc(`workspaces/${WS}/integracoes/orthanc`).set({ tipo: 'orthanc', status: 'ok', ultimoTeste: new Date(), ultimoErro: null });
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'orthanc', config: { url: 'http://orthanc.enderecoNovo.local' } });
    assert.equal(r.httpStatus, 200);
    assert.equal(r.integracao.status, 'nunca_testado');
  });
  test('salvar so procMap NAO zera um status:"ok" existente (nao muda credencial nem alvo)', async () => {
    await db.doc(`workspaces/${WS}/integracoes/feegow`).set({ tipo: 'feegow', status: 'ok', ultimoTeste: new Date(), ultimoErro: null });
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'feegow', config: { procMap: { '1': 'eco_tt' } } });
    assert.equal(r.httpStatus, 200);
    assert.equal(r.integracao.status, 'ok', 'salvar procMap nao mexe na credencial nem no alvo, nao pode zerar o teste');
    const pub = (await db.doc(`workspaces/${WS}/integracoes/feegow`).get()).data();
    assert.equal(pub.status, 'ok');
  });
  test('salvar so ativo (liga/desliga) NAO zera um status:"ok" existente', async () => {
    await db.doc(`workspaces/${WS}/integracoes/orthanc`).set({ tipo: 'orthanc', status: 'ok', ultimoTeste: new Date(), ultimoErro: null });
    const r = await salvarIntegracao(db, { wsId: WS, tipo: 'orthanc', config: { ativo: true } });
    assert.equal(r.httpStatus, 200);
    assert.equal(r.integracao.status, 'ok', 'so ligar/desligar nao muda o alvo, nao pode zerar o teste');
  });
  test('nenhuma resposta (salvar/remover) contem token/user/pass — nem campo, nem valor', async () => {
    const r = await salvarIntegracao(db, {
      wsId: WS, tipo: 'orthanc',
      config: { url: 'http://naovazar.local' },
      credencial: { user: 'usuarioSecreto999', pass: 'senhaSuperSecreta123' },
    });
    const serializado = JSON.stringify(r);
    assert.equal(serializado.includes('usuarioSecreto999'), false, 'valor do usuario nao pode vazar');
    assert.equal(serializado.includes('senhaSuperSecreta123'), false, 'valor da senha nao pode vazar');
    assert.equal(Object.prototype.hasOwnProperty.call(r.integracao, 'user'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(r.integracao, 'pass'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(r.integracao, 'token'), false);

    const r2 = await removerCredencial(db, { wsId: WS, tipo: 'orthanc' });
    const serializado2 = JSON.stringify(r2);
    assert.equal(serializado2.includes('usuarioSecreto999'), false);
    assert.equal(serializado2.includes('senhaSuperSecreta123'), false);
  });
});

// Sub-plano 5, Task 7 — furo 2 (config vinha de header, endereco arbitrario) + item D (SSRF).
describe('resolverConfigOrthanc (furo 2 — config SEMPRE de integracoes/orthanc + privado/orthanc, nunca de header)', () => {
  const WSO = 'wsOrthancConfig';
  test('ativo + url + credencial na gaveta -> monta config', async () => {
    await db.doc(`workspaces/${WSO}/integracoes/orthanc`).set({ url: 'http://192.168.1.50:8042/', ativo: true });
    await db.doc(`workspaces/${WSO}/privado/orthanc`).set({ user: 'leo', pass: 'senhaLonga123' });
    const cfg = await resolverConfigOrthanc(db, WSO);
    assert.deepEqual(cfg, { url: 'http://192.168.1.50:8042', user: 'leo', pass: 'senhaLonga123' });
  });
  test('ativo:false -> null (mesmo com url e credencial validas)', async () => {
    await db.doc(`workspaces/${WSO}/integracoes/orthanc`).set({ url: 'http://192.168.1.50:8042', ativo: false });
    const cfg = await resolverConfigOrthanc(db, WSO);
    assert.equal(cfg, null);
  });
  test('sem wsId -> null (sem header pra cair de volta)', async () => {
    const cfg = await resolverConfigOrthanc(db, null);
    assert.equal(cfg, null);
  });
  test('SSRF (item D): esquema file:// e recusado mesmo com ativo:true', async () => {
    const ws2 = 'wsSsrfFile';
    await db.doc(`workspaces/${ws2}/integracoes/orthanc`).set({ url: 'file:///etc/passwd', ativo: true });
    const cfg = await resolverConfigOrthanc(db, ws2);
    assert.equal(cfg, null);
  });
  test('SSRF (item D): esquema gopher:// e recusado', async () => {
    const ws3 = 'wsSsrfGopher';
    await db.doc(`workspaces/${ws3}/integracoes/orthanc`).set({ url: 'gopher://interno.local:70/', ativo: true });
    const cfg = await resolverConfigOrthanc(db, ws3);
    assert.equal(cfg, null);
  });
});
