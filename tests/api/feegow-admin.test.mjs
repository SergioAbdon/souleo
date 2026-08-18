// Importacao Feegow server-side (Secao 2, A7/A9/A10/A14). Emulador Firestore.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { gravarImportacao, resolverTokenFeegow, resolverProcMap, gateAcessoWs, decidirGetFeegow } from '../../src/lib/feegow-admin.ts';

let db;
const WS = 'wsFeegow';
const candidato = (appointId, extra = {}) => ({
  feegowAppointId: appointId, feegowPacienteId: 900 + appointId,
  pacienteNome: `PACIENTE ${appointId}`, pacienteDtnasc: '1980-01-02', sexo: 'F',
  cpf: `0000000000${appointId}`, telefone: '91999990000', convenio: 'UNIMED',
  tipoExame: 'eco_tt', medicoExecutor: '', horarioChegada: '10:30',
  dataExame: '2026-08-12', ...extra,
});

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: 'contaF', nomeClinica: 'Feegow Teste' });
});

describe('gravarImportacao', () => {
  test('grava exames fg-<appointId>, pacientes e reservas de ACC', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(1), candidato(2)], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 2);
    const ex1 = (await db.doc(`workspaces/${WS}/exames/fg-1`).get()).data();
    assert.equal(ex1.status, 'aguardando');
    assert.equal(ex1.medicoUid, undefined); // quem nao assina NAO carimba autor
    assert.equal(ex1.medicoExecutor, '');
    assert.ok((await db.doc(`workspaces/${WS}/accIndex/${ex1.acc}`).get()).exists, 'reserva de ACC criada');
    assert.match(ex1.acc, /^EX\d{14}$/); // contrato DICOM: EX + 14 digitos = 16 chars (Vivid/Wader)
  });
  test('re-importar os mesmos candidatos e idempotente', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(1), candidato(2)], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 0);
  });
  test('duas importacoes CONCORRENTES nao duplicam nem sobrescrevem', async () => {
    const [a, b] = await Promise.all([
      gravarImportacao(db, { wsId: WS, candidatos: [candidato(6)], uid: 'u1', ehMed: false, nomeCriador: 'X' }),
      gravarImportacao(db, { wsId: WS, candidatos: [candidato(6)], uid: 'u2', ehMed: false, nomeCriador: 'Y' }),
    ]);
    assert.equal(a.criados.length + b.criados.length, 1); // exatamente UM venceu
  });
  test('campo opcional undefined nao derruba a importacao', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(3, { telefone: undefined, sexo: undefined })],
      uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 1);
    assert.equal((await db.doc(`workspaces/${WS}/exames/fg-3`).get()).data().sexo, '');
  });
  test('appointId nao-numerico e descartado (path safety)', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato('7/../x')], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 0);
  });
  test('medico importando carimba medicoUid e ACCs nao colidem', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(4), candidato(5)], uid: 'uidDrA', ehMed: true, nomeCriador: 'Dr A',
    });
    assert.equal(criados.length, 2);
    const ex4 = (await db.doc(`workspaces/${WS}/exames/fg-4`).get()).data();
    const ex5 = (await db.doc(`workspaces/${WS}/exames/fg-5`).get()).data();
    assert.equal(ex4.medicoUid, 'uidDrA');
    assert.notEqual(ex4.acc, ex5.acc);
  });
});

// Sub-plano 5, Task 7 — furo 1 (token do header) + item A (procMap dual-owner) + furo 3 (gate dos GETs).
// Re-revisao (Critical): fallback pro FEEGOW_API_TOKEN do .env removido —
// a migracao roda ANTES do deploy, entao nao ha mais "durante a virada" pra
// cobrir, e o fallback vazava o token real da MedCardio pro dono de
// qualquer workspace sem token proprio na gaveta.
describe('resolverTokenFeegow (furo 1 — token SEMPRE da gaveta, SEM fallback de ambiente)', () => {
  test('privado/feegow.token existe -> usa o da gaveta (nao ha parametro de header: estruturalmente impossivel um x-feegow-token de cliente vencer)', async () => {
    await db.doc(`workspaces/${WS}/privado/feegow`).set({ token: 'token-da-gaveta-123' });
    const tok = await resolverTokenFeegow(db, WS);
    assert.equal(tok, 'token-da-gaveta-123');
  });
  test('sem privado/feegow (ou sem token) -> string vazia (sem fallback nenhum)', async () => {
    const tok = await resolverTokenFeegow(db, 'wsSemGaveta');
    assert.equal(tok, '');
  });
  test('sem wsId -> string vazia', async () => {
    const tok = await resolverTokenFeegow(db, null);
    assert.equal(tok, '');
  });
});

describe('resolverProcMap (item A — dual-owner: SO integracoes/feegow.procMap, sem fallback pro campo antigo)', () => {
  test('le o mapa do lugar NOVO (integracoes/feegow.procMap)', async () => {
    await db.doc(`workspaces/${WS}/integracoes/feegow`).set({ procMap: { '10': 'eco_tt', '20': 'doppler_carotidas' } });
    const mapa = await resolverProcMap(db, WS, { 999: 'nao_deveria_aparecer' });
    assert.deepEqual(mapa, { 10: 'eco_tt', 20: 'doppler_carotidas' });
  });
  test('campo antigo workspaces/{wsId}.feegowProcMap e IGNORADO (mesmo com dado la)', async () => {
    const wsAntigo = 'wsComCampoAntigo';
    await db.doc(`workspaces/${wsAntigo}`).set({ feegowProcMap: { '77': 'eco_te' } });
    // integracoes/feegow nao existe pra este ws -> tem que cair no default, NAO no campo antigo.
    const mapa = await resolverProcMap(db, wsAntigo, { 1: 'default_esperado' });
    assert.deepEqual(mapa, { 1: 'default_esperado' });
  });
  test('integracoes/feegow.procMap vazio ({}) -> usa o default', async () => {
    await db.doc(`workspaces/${WS}/integracoes/feegow`).set({ procMap: {} });
    const mapa = await resolverProcMap(db, WS, { 5: 'default' });
    assert.deepEqual(mapa, { 5: 'default' });
  });
  test('sem wsId -> usa o default', async () => {
    const mapa = await resolverProcMap(db, null, { 5: 'default' });
    assert.deepEqual(mapa, { 5: 'default' });
  });
});

describe('gateAcessoWs (furo 3 — GETs sensiveis exigem wsId + papel)', () => {
  test('sem wsId -> 400', () => {
    const r = gateAcessoWs(null, 'dono');
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  });
  test('com wsId mas sem papel (usuario sem acesso ao local) -> 403', () => {
    const r = gateAcessoWs(WS, null);
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
  });
  test('wsId + papel resolvido -> ok', () => {
    const r = gateAcessoWs(WS, 'recepcao');
    assert.equal(r.ok, true);
  });
});

// Correcao pos-revisao da Task 7 — Critical 1 (gate incondicional, sem lista
// de acoes) + Important 2 (gate de papel roda ANTES de tocar o token).
describe('decidirGetFeegow (Critical 1 + Important 2 — gate roda pra QUALQUER acao, antes do token)', () => {
  test('Critical 1: sem papel -> 403 e resolverToken NUNCA e chamado (a gaveta nao e lida por quem nao tem acesso, seja qual for a acao que viria depois — ex.: "profissionais", que antes escapava da lista ACOES_COM_GATE)', async () => {
    let chamou = false;
    const resolverToken = async () => { chamou = true; return 'tok-nao-deveria-ser-lido'; };
    const r = await decidirGetFeegow(WS, null, resolverToken);
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
    assert.equal(chamou, false, 'resolverToken (leitura de privado/feegow) nao pode rodar sem papel');
  });

  test('Important 2: sem papel -> 403 tanto pra clinica QUE TEM token quanto pra clinica SEM token (o status nao vaza se a clinica tem Feegow configurado)', async () => {
    const comToken = await decidirGetFeegow(WS, null, async () => 'token-existe-nesta-clinica');
    const semToken = await decidirGetFeegow('wsFeegowSemToken', null, async () => '');
    assert.equal(comToken.status, 403);
    assert.equal(semToken.status, 403);
  });

  test('sem wsId -> 400 (validacao antes do papel), resolverToken tambem nao roda', async () => {
    let chamou = false;
    const r = await decidirGetFeegow(null, null, async () => { chamou = true; return 'x'; });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
    assert.equal(chamou, false);
  });

  test('com papel mas sem token cadastrado -> 400 (so agora, com acesso ja confirmado, o token entra em jogo)', async () => {
    const r = await decidirGetFeegow(WS, 'recepcao', async () => '');
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  });

  test('com papel e token -> ok, devolve o token pro chamador despachar a acao', async () => {
    const r = await decidirGetFeegow(WS, 'dono', async () => 'tok-valido-123');
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.token, 'tok-valido-123');
  });
});
