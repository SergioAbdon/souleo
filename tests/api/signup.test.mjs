// /api/signup — logica de servidor testada no emulador (Firestore + Auth).
// Importa o .ts direto: Node 24 remove os tipos sozinho (type stripping).
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { executarSignup, executarSignupPJ } from '../../src/lib/signup-server.ts';

let db, authAdmin;

before(() => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  authAdmin = getAuth();
});

const DADOS = {
  nome: 'Dra. Nova', email: 'nova@exemplo.com', crm: '999', ufCrm: 'PA',
  especialidade: 'Cardiologia e Ecocardiografia', tipoPerfil: 'medico',
};

describe('executarSignup', () => {
  test('caminho feliz: 5 docs no modelo novo, atomico', async () => {
    const { uid } = await authAdmin.createUser({ email: DADOS.email, password: 'x'.repeat(8) });
    const r = await executarSignup(db, authAdmin, uid, DADOS);
    assert.equal(r.ok, true);

    const prof = await db.doc(`profissionais/${uid}`).get();
    assert.equal(prof.exists, true);
    assert.equal(prof.data().superadmin, false);
    assert.equal(prof.data().nome, DADOS.nome);

    const conta = await db.doc(`contas/${r.contaId}`).get();
    assert.equal(conta.data().ownerUid, uid);
    assert.equal(conta.data().tipo, 'PF');
    assert.equal(conta.data().status, 'ativa');

    const ws = await db.doc(`workspaces/${r.wsId}`).get();
    assert.equal(ws.data().contaId, r.contaId);   // o buraco antigo: nascia sem contaId
    assert.equal(ws.data().ownerUid, uid);        // a tranca provisoria depende dele

    const vinc = await db.doc(`vinculos/${r.contaId}_${uid}`).get();
    assert.equal(vinc.exists, true, 'vinculo tem id deterministico {contaId}_{uid}');
    assert.equal(vinc.data().papel, 'dono');
    assert.deepEqual(vinc.data().locais, []);
    assert.equal(vinc.data().status, 'ativo');

    const sub = await db.doc(`subscriptions/${r.contaId}`).get();
    assert.equal(sub.exists, true, 'assinatura tem doc-id = contaId');
    assert.equal('workspaceId' in sub.data(), false,
      'workspaceId NAO pode ir junto — duas assinaturas casariam na busca antiga');
    assert.equal(sub.data().planoId, 'trial');
    assert.equal(sub.data().franquiaUsada, 0);
  });

  test('ja cadastrado: recusa e NAO apaga o Auth user', async () => {
    const { uid } = await authAdmin.createUser({ email: 'velha@exemplo.com', password: 'x'.repeat(8) });
    await db.doc(`profissionais/${uid}`).set({ uid, nome: 'Ja Existo' });
    const r = await executarSignup(db, authAdmin, uid, { ...DADOS, email: 'velha@exemplo.com' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'ja_cadastrado');
    await assert.doesNotReject(authAdmin.getUser(uid), 'usuario existente jamais e apagado');
  });

  test('dados invalidos: recusa E apaga o Auth user orfao (rollback)', async () => {
    const { uid } = await authAdmin.createUser({ email: 'orfa@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignup(db, authAdmin, uid, { ...DADOS, nome: '', email: 'orfa@exemplo.com' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'dados_invalidos');
    // Sem rollback o email fica preso: retry daria email-already-in-use para sempre.
    await assert.rejects(authAdmin.getUser(uid));
  });

  test('medico sem CRM: dados_invalidos (revalidacao no servidor)', async () => {
    const { uid } = await authAdmin.createUser({ email: 'semcrm@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignup(db, authAdmin, uid, { ...DADOS, crm: '', email: 'semcrm@exemplo.com' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'dados_invalidos');
  });

  test('perfil medico nasce com crmVerificacao nao_verificado', async () => {
    const { uid } = await authAdmin.createUser({ email: 'crm@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignup(db, authAdmin, uid, { ...DADOS, email: 'crm@exemplo.com' });
    assert.equal(r.ok, true);
    const prof = (await db.doc(`profissionais/${uid}`).get()).data();
    assert.equal(prof.crmVerificacao.status, 'nao_verificado');
    assert.equal(prof.crmVerificacao.fonte, 'nenhum');
  });
});

describe('executarSignupPJ', () => {
  const PJ = {
    nome: 'Gestor Clinica', email: 'pj@exemplo.com', tipoPerfil: 'assistente',
    cnpj: '12345678000199', razaoSocial: 'Clinica Exemplo Ltda', nomeLocal: 'Unidade Centro',
  };
  test('caminho feliz: empresa + conta PJ + local + vinculo dono + assinatura', async () => {
    const { uid } = await authAdmin.createUser({ email: PJ.email, password: 'x'.repeat(8) });
    const r = await executarSignupPJ(db, authAdmin, uid, PJ);
    assert.equal(r.ok, true);
    const conta = (await db.doc(`contas/${r.contaId}`).get()).data();
    assert.equal(conta.tipo, 'PJ');
    assert.equal(conta.empresaId, r.empresaId);
    assert.equal(conta.ownerUid, uid);
    const emp = (await db.doc(`empresas/${r.empresaId}`).get()).data();
    assert.equal(emp.cnpj, '12345678000199');
    const ws = (await db.doc(`workspaces/${r.wsId}`).get()).data();
    assert.equal(ws.contaId, r.contaId);
    assert.equal(ws.nomeClinica, 'Unidade Centro');
    const vinc = (await db.doc(`vinculos/${r.contaId}_${uid}`).get()).data();
    assert.equal(vinc.papel, 'dono');
    const sub = (await db.doc(`subscriptions/${r.contaId}`).get()).data();
    assert.equal(sub.tipoPlano, 'PJ');
    assert.equal('workspaceId' in sub, false);
  });
  test('gestor nao-medico NAO precisa de CRM', async () => {
    const { uid } = await authAdmin.createUser({ email: 'pj2@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignupPJ(db, authAdmin, uid, { ...PJ, email: 'pj2@exemplo.com', cnpj: '99888777000166' });
    assert.equal(r.ok, true);
  });
  test('dono que se declara medico SEM CRM e recusado (rollback)', async () => {
    const { uid } = await authAdmin.createUser({ email: 'pj3@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignupPJ(db, authAdmin, uid, { ...PJ, email: 'pj3@exemplo.com', cnpj: '11222333000144', tipoPerfil: 'medico', crm: '', ufCrm: '' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'dados_invalidos');
    await assert.rejects(authAdmin.getUser(uid));
  });
  test('ja cadastrado (PJ): recusa e NAO apaga o Auth user, mesmo com dados invalidos', async () => {
    const { uid } = await authAdmin.createUser({ email: 'pjexiste@exemplo.com', password: 'x'.repeat(8) });
    await db.doc(`profissionais/${uid}`).set({ uid, nome: 'Ja Existo' });
    const r = await executarSignupPJ(db, authAdmin, uid, { ...PJ, email: 'pjexiste@exemplo.com', cnpj: '' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'ja_cadastrado');
    await assert.doesNotReject(authAdmin.getUser(uid), 'usuario ja cadastrado jamais e apagado');
  });
  test('CNPJ duplicado e recusado', async () => {
    const { uid: u1 } = await authAdmin.createUser({ email: 'pjdup1@exemplo.com', password: 'x'.repeat(8) });
    await executarSignupPJ(db, authAdmin, u1, { ...PJ, email: 'pjdup1@exemplo.com', cnpj: '55666777000188' });
    const { uid: u2 } = await authAdmin.createUser({ email: 'pjdup2@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignupPJ(db, authAdmin, u2, { ...PJ, email: 'pjdup2@exemplo.com', cnpj: '55666777000188' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'cnpj_duplicado');
    await assert.rejects(authAdmin.getUser(u2), undefined, 'Auth user do 2o cadastro apagado');
  });
});
