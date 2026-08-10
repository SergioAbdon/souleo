// resolverAssinatura: a MESMA chave para quem debita (emitir) e quem devolve
// (cancelar). Se cada um resolvesse por conta propria, devolveria no doc errado.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolverAssinatura } from '../../src/lib/billing-admin.ts';

let db;

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc('workspaces/wsMigrado').set({ contaId: 'contaX', ownerUid: 'u1' });
  await db.doc('subscriptions/contaX').set({ contaId: 'contaX', franquiaUsada: 5 });
  await db.doc('workspaces/wsLegado').set({ ownerUid: 'u2' });           // sem contaId
  await db.doc('subscriptions/subAntiga').set({ workspaceId: 'wsLegado', franquiaUsada: 2 });
});

describe('resolverAssinatura', () => {
  test('workspace migrado resolve subscriptions/{contaId}', async () => {
    const r = await resolverAssinatura(db, 'wsMigrado');
    assert.equal(r.ref.id, 'contaX');
    assert.equal(r.contaId, 'contaX');
  });
  test('workspace sem contaId cai no doc legado por workspaceId', async () => {
    const r = await resolverAssinatura(db, 'wsLegado');
    assert.equal(r.ref.id, 'subAntiga');
  });
  test('workspace sem assinatura nenhuma retorna null', async () => {
    await db.doc('workspaces/wsSemNada').set({ ownerUid: 'u3' });
    assert.equal(await resolverAssinatura(db, 'wsSemNada'), null);
  });
  test('contaId sem doc de assinatura cai no legado (migracao pela metade)', async () => {
    await db.doc('workspaces/wsMeio').set({ contaId: 'contaSemSub', ownerUid: 'u4' });
    await db.doc('subscriptions/subMeio').set({ workspaceId: 'wsMeio', franquiaUsada: 1 });
    const r = await resolverAssinatura(db, 'wsMeio');
    assert.equal(r.ref.id, 'subMeio');
  });
});
