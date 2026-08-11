// Autorizacao da /api/corrigir-laudo: so dono/medico do local corrigem convenio.
// A rota chama resolverPapel(db, wsId, uid) e recusa recepcao/forasteiro.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolverPapel, podeCorrigir } from '../../src/lib/exame-admin.ts';

let db;
const CONTA = 'contaC', WS = 'wsC';
const DONO = 'uidDonoC', MED = 'uidMedC', RITA = 'uidRitaC';

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: CONTA, ownerUid: DONO });
  for (const [uid, papel] of [[DONO, 'dono'], [MED, 'medico'], [RITA, 'recepcao']]) {
    await db.doc(`vinculos/${CONTA}_${uid}`).set({ contaId: CONTA, medicoUid: uid, papel, locais: [], status: 'ativo' });
  }
});

describe('autorizacao corrigir-laudo (via resolverPapel)', () => {
  test('dono corrige', async () => assert.equal(await resolverPapel(db, WS, DONO), 'dono'));
  test('medico corrige', async () => assert.equal(await resolverPapel(db, WS, MED), 'medico'));
  test('recepcao e negada (papel recepcao nao pode corrigir)', async () => {
    const papel = await resolverPapel(db, WS, RITA);
    assert.equal(papel, 'recepcao');   // a rota trata 'recepcao' como 403
  });
  test('forasteiro sem vinculo → null', async () => {
    assert.equal(await resolverPapel(db, WS, 'uidForasteiro'), null);
  });
});

// resolverPapel so resolve o PAPEL; a autoria + status "emitido" e a regra §4,
// decidida na funcao pura podeCorrigir e checada na rota antes do update.
describe('autoria/emitido corrigir-laudo (podeCorrigir)', () => {
  test('dono + emitido → ok (corrige qualquer autor)', () => {
    assert.deepEqual(podeCorrigir('dono', 'emitido', 'outroMed', DONO), { ok: true });
  });
  test('medico autor + emitido → ok', () => {
    assert.deepEqual(podeCorrigir('medico', 'emitido', MED, MED), { ok: true });
  });
  test('medico sem autor no exame + emitido → ok (assume)', () => {
    assert.deepEqual(podeCorrigir('medico', 'emitido', undefined, MED), { ok: true });
  });
  test('medico nao-autor + emitido → nao_e_autor', () => {
    assert.deepEqual(podeCorrigir('medico', 'emitido', 'outroMed', MED), { ok: false, motivo: 'nao_e_autor' });
  });
  test('qualquer papel + status aguardando → nao_emitido', () => {
    assert.deepEqual(podeCorrigir('dono', 'aguardando', DONO, DONO), { ok: false, motivo: 'nao_emitido' });
    assert.deepEqual(podeCorrigir('medico', 'andamento', MED, MED), { ok: false, motivo: 'nao_emitido' });
  });
});
