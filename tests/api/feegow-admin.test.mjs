// Importacao Feegow server-side (Secao 2, A7/A9/A10/A14). Emulador Firestore.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { gravarImportacao } from '../../src/lib/feegow-admin.ts';

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
