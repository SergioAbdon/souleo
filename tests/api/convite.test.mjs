// Convite por link + aceite (Plano 2B-B2). Emulador Firestore.
import { test, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { criarConvite, aceitarConvite } from '../../src/lib/convite-server.ts';

let db;
const CONTA = 'contaConv', DONO = 'uidDonoConv';
const noop = async () => ({ status: 'nao_verificado', fonte: 'nenhum', checadoEm: null });
const HOJE = new Date('2026-08-11T12:00:00Z');
const DEPOIS = new Date('2026-08-20T12:00:00Z'); // > 7 dias

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`contas/${CONTA}`).set({ tipo: 'PJ', nome: 'Clinica Conv', ownerUid: DONO });
  await db.doc(`workspaces/wsConv`).set({ contaId: CONTA, ownerUid: DONO });
  await db.doc(`vinculos/${CONTA}_${DONO}`).set({ contaId: CONTA, medicoUid: DONO, papel: 'dono', locais: [], status: 'ativo' });
});

async function novoConvite(papel = 'medico', locais = []) {
  const r = await criarConvite(db, { contaId: CONTA, criadoPor: DONO, papel, locais, agora: HOJE });
  assert.equal(r.ok, true);
  return r.token;
}

describe('criarConvite', () => {
  test('cria doc com papel/locais/expira e uso único', async () => {
    const token = await novoConvite('recepcao', ['wsConv']);
    const c = (await db.doc(`convites/${token}`).get()).data();
    assert.equal(c.contaId, CONTA);
    assert.equal(c.papel, 'recepcao');
    assert.deepEqual(c.locais, ['wsConv']);
    assert.equal(c.usado, false);
    assert.ok(c.expiraEm.toDate() > HOJE);
  });
  test('papel invalido (dono) é recusado', async () => {
    const r = await criarConvite(db, { contaId: CONTA, criadoPor: DONO, papel: 'dono', locais: [], agora: HOJE });
    assert.equal(r.ok, false);
  });
});

describe('aceitarConvite', () => {
  test('novo médico: cria perfil (com CRM) + vínculo, marca usado', async () => {
    const token = await novoConvite('medico', []);
    const r = await aceitarConvite(db, { uid: 'uidMedNovo', token,
      dadosPerfil: { nome: 'Dra Nova', email: 'nova@x.com', crm: '111', ufCrm: 'PA' }, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, true);
    const prof = (await db.doc('profissionais/uidMedNovo').get()).data();
    assert.equal(prof.tipoPerfil, 'medico');
    assert.equal(prof.crm, '111');
    const vinc = (await db.doc(`vinculos/${CONTA}_uidMedNovo`).get()).data();
    assert.equal(vinc.papel, 'medico');
    assert.equal(vinc.status, 'ativo');
    const c = (await db.doc(`convites/${token}`).get()).data();
    assert.equal(c.usado, true);
    assert.equal(c.usadoPor, 'uidMedNovo');
  });
  test('nova recepção: perfil nasce assistente, sem exigir CRM', async () => {
    const token = await novoConvite('recepcao', []);
    const r = await aceitarConvite(db, { uid: 'uidRecNovo', token,
      dadosPerfil: { nome: 'Recep', email: 'r@x.com' }, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, true);
    assert.equal((await db.doc('profissionais/uidRecNovo').get()).data().tipoPerfil, 'assistente');
  });
  test('médico novo SEM CRM é recusado', async () => {
    const token = await novoConvite('medico', []);
    const r = await aceitarConvite(db, { uid: 'uidSemCrm', token,
      dadosPerfil: { nome: 'X', email: 'x@x.com', crm: '', ufCrm: '' }, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'dados_invalidos');
  });
  test('usuário existente: usa o perfil, só cria vínculo', async () => {
    await db.doc('profissionais/uidExistente').set({ uid: 'uidExistente', nome: 'Ja Existo', tipoPerfil: 'medico', crm: '222' });
    const token = await novoConvite('medico', []);
    const r = await aceitarConvite(db, { uid: 'uidExistente', token, dadosPerfil: {}, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, true);
    assert.equal((await db.doc('profissionais/uidExistente').get()).data().nome, 'Ja Existo');
  });
  test('assistente existente aceitando convite de MÉDICO → perfil_incompativel', async () => {
    await db.doc('profissionais/uidAssist').set({ uid: 'uidAssist', nome: 'Assist', tipoPerfil: 'assistente' });
    const token = await novoConvite('medico', []);
    const r = await aceitarConvite(db, { uid: 'uidAssist', token, dadosPerfil: {}, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'perfil_incompativel');
  });
  test('convite usado não aceita de novo', async () => {
    const token = await novoConvite('recepcao', []);
    await aceitarConvite(db, { uid: 'uidA', token, dadosPerfil: { nome: 'A', email: 'a@x.com' }, verificarCrm: noop, agora: HOJE });
    const r = await aceitarConvite(db, { uid: 'uidB', token, dadosPerfil: { nome: 'B', email: 'b@x.com' }, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'ja_usado');
  });
  test('convite expirado não aceita', async () => {
    const token = await novoConvite('recepcao', []);
    const r = await aceitarConvite(db, { uid: 'uidC', token, dadosPerfil: { nome: 'C', email: 'c@x.com' }, verificarCrm: noop, agora: DEPOIS });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'expirado');
  });
  test('já-membro não duplica', async () => {
    const token = await novoConvite('recepcao', []);
    await aceitarConvite(db, { uid: 'uidDup', token, dadosPerfil: { nome: 'D', email: 'd@x.com' }, verificarCrm: noop, agora: HOJE });
    const token2 = await novoConvite('recepcao', []);
    const r = await aceitarConvite(db, { uid: 'uidDup', token: token2, dadosPerfil: {}, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'ja_membro');
  });
  test('token inexistente → invalido', async () => {
    const r = await aceitarConvite(db, { uid: 'uidZ', token: 'naoexiste', dadosPerfil: {}, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'invalido');
  });
});
