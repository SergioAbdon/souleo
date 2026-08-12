// Convite por link + aceite (Plano 2B-B2). Emulador Firestore.
import { test, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { criarConvite, aceitarConvite, listarMembros, editarMembro, revogarMembro, cancelarConvite } from '../../src/lib/convite-server.ts';

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
  test('concorrencia: dois aceites do mesmo token, so um vinculo (uso unico)', async () => {
    const token = await novoConvite('recepcao', []);
    const [r1, r2] = await Promise.all([
      aceitarConvite(db, { uid: 'uidRace', token, dadosPerfil: { nome: 'R', email: 'r@x.com' }, verificarCrm: noop, agora: HOJE }),
      aceitarConvite(db, { uid: 'uidRace', token, dadosPerfil: { nome: 'R', email: 'r@x.com' }, verificarCrm: noop, agora: HOJE }),
    ]);
    const oks = [r1, r2].filter(r => r.ok).length;
    assert.equal(oks, 1, 'exatamente um aceite vence');
  });
  test('token inexistente → invalido', async () => {
    const r = await aceitarConvite(db, { uid: 'uidZ', token: 'naoexiste', dadosPerfil: {}, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'invalido');
  });
  test('token com barra (remonta path do Admin SDK) → invalido, sem excecao', async () => {
    const r = await aceitarConvite(db, { uid: 'uidBarra', token: 'a/b/c', dadosPerfil: {}, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'invalido');
  });
});

describe('gestão de membros', () => {
  test('listarMembros traz membros ativos com nome + pendentes', async () => {
    await db.doc('profissionais/uidM1').set({ uid: 'uidM1', nome: 'Membro 1', tipoPerfil: 'medico' });
    await db.doc(`vinculos/${CONTA}_uidM1`).set({ contaId: CONTA, medicoUid: 'uidM1', papel: 'medico', locais: [], status: 'ativo' });
    const token = await novoConvite('recepcao', []);
    const r = await listarMembros(db, CONTA);
    const m1 = r.membros.find(m => m.uid === 'uidM1');
    assert.equal(m1.nome, 'Membro 1');
    assert.ok(r.pendentes.some(p => p.token === token));
  });
  test('editarMembro muda papel/locais', async () => {
    await db.doc(`vinculos/${CONTA}_uidE1`).set({ contaId: CONTA, medicoUid: 'uidE1', papel: 'recepcao', locais: [], status: 'ativo' });
    const r = await editarMembro(db, { contaId: CONTA, alvoUid: 'uidE1', papel: 'recepcao', locais: ['wsConv'] });
    assert.equal(r.ok, true);
    assert.deepEqual((await db.doc(`vinculos/${CONTA}_uidE1`).get()).data().locais, ['wsConv']);
  });
  test('revogarMembro inativa o vínculo', async () => {
    await db.doc(`vinculos/${CONTA}_uidR1`).set({ contaId: CONTA, medicoUid: 'uidR1', papel: 'medico', locais: [], status: 'ativo' });
    const r = await revogarMembro(db, { contaId: CONTA, alvoUid: 'uidR1', donoUid: DONO });
    assert.equal(r.ok, true);
    assert.equal((await db.doc(`vinculos/${CONTA}_uidR1`).get()).data().status, 'inativo');
  });
  test('dono NÃO revoga a si mesmo', async () => {
    const r = await revogarMembro(db, { contaId: CONTA, alvoUid: DONO, donoUid: DONO });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'nao_pode_a_si');
  });
  test('cancelarConvite marca pendente como usado (não aceitável)', async () => {
    const token = await novoConvite('recepcao', []);
    const r = await cancelarConvite(db, { contaId: CONTA, token });
    assert.equal(r.ok, true);
    assert.equal((await db.doc(`convites/${token}`).get()).data().usado, true);
  });
  test('cancelarConvite de outra conta é recusado', async () => {
    const token = await novoConvite('recepcao', []);
    const r = await cancelarConvite(db, { contaId: 'outraConta', token });
    assert.equal(r.ok, false);
  });
  test('cancelarConvite NAO apaga rastro de convite ja aceito', async () => {
    const token = await novoConvite('recepcao', []);
    await aceitarConvite(db, { uid: 'uidAceitou', token, dadosPerfil: { nome: 'A', email: 'a@x.com' }, verificarCrm: noop, agora: HOJE });
    const r = await cancelarConvite(db, { contaId: CONTA, token });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'ja_usado');
    assert.equal((await db.doc(`convites/${token}`).get()).data().usadoPor, 'uidAceitou');
  });
  test('editarMembro NAO edita vinculo de dono (outro dono)', async () => {
    await db.doc(`vinculos/${CONTA}_uidDono2`).set({ contaId: CONTA, medicoUid: 'uidDono2', papel: 'dono', locais: [], status: 'ativo' });
    const r = await editarMembro(db, { contaId: CONTA, alvoUid: 'uidDono2', papel: 'medico' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'dono_imutavel');
  });
  test('revogarMembro NAO revoga outro dono', async () => {
    await db.doc(`vinculos/${CONTA}_uidDono3`).set({ contaId: CONTA, medicoUid: 'uidDono3', papel: 'dono', locais: [], status: 'ativo' });
    const r = await revogarMembro(db, { contaId: CONTA, alvoUid: 'uidDono3', donoUid: DONO });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'dono_imutavel');
  });
});
