// /api/signup — logica de servidor testada no emulador (Firestore + Auth).
// Importa o .ts direto: Node 24 remove os tipos sozinho (type stripping).
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { executarSignup } from '../../src/lib/signup-server.ts';

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
