// Fechadura DEFINITIVA (modelo de contas). Le firestore.rules.definitiva.
// Nao e a regra publicada — essa e firestore.rules (tranca provisoria).
import { test, before, after, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where,
} from 'firebase/firestore';

let env;

// Conta A (clinica): Dr. A dono+medico, Dr. A2 medico, Rita recepcao, 2 locais.
// Conta B (outra clinica): Dr. B.
const CONTA_A = 'contaA', CONTA_B = 'contaB';
const LOCAL_A1 = 'localA1', LOCAL_A2 = 'localA2', LOCAL_B = 'localB';
const DR_A = 'uidDrA', DR_A2 = 'uidDrA2', RITA = 'uidRita', DR_B = 'uidDrB', ADMIN = 'uidAdmin';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'leo-testes-definitiva',
    firestore: { rules: readFileSync('firestore.rules.definitiva', 'utf8'), host: '127.0.0.1', port: 8080 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, 'contas', CONTA_A), { tipo: 'PJ', nome: 'Clinica A', ownerUid: DR_A });
    await setDoc(doc(db, 'contas', CONTA_B), { tipo: 'PF', nome: 'Dr B', ownerUid: DR_B });

    await setDoc(doc(db, 'workspaces', LOCAL_A1), { contaId: CONTA_A, nomeClinica: 'Sala 1' });
    await setDoc(doc(db, 'workspaces', LOCAL_A2), { contaId: CONTA_A, nomeClinica: 'Sala 2' });
    await setDoc(doc(db, 'workspaces', LOCAL_B), { contaId: CONTA_B, nomeClinica: 'Consultorio B' });

    await setDoc(doc(db, `workspaces/${LOCAL_A1}/privado`, 'integracoes'), {
      feegowToken: 'SEGREDO', ortancUser: 'orthanc', ortancPass: 'SENHA',
    });

    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'ex1'), {
      pacienteNome: 'Paciente A1', medicoUid: DR_A, status: 'emitido',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_A2}/exames`, 'ex2'), {
      pacienteNome: 'Paciente A2', medicoUid: DR_A2, status: 'emitido',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_B}/exames`, 'exB'), {
      pacienteNome: 'Paciente B', medicoUid: DR_B, status: 'emitido',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/pacientes`, 'pac1'), { nome: 'Paciente A1' });
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/config`, 'honorarios'), { UNIMED: 120 });

    // Vinculos com id deterministico. Rita so alcanca o LOCAL_A1.
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${DR_A}`),  { contaId: CONTA_A, medicoUid: DR_A,  papel: 'dono',     locais: [], status: 'ativo' });
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${DR_A2}`), { contaId: CONTA_A, medicoUid: DR_A2, papel: 'medico',   locais: [], status: 'ativo' });
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${RITA}`),  { contaId: CONTA_A, medicoUid: RITA,  papel: 'recepcao', locais: [LOCAL_A1], status: 'ativo' });
    await setDoc(doc(db, 'vinculos', `${CONTA_B}_${DR_B}`),  { contaId: CONTA_B, medicoUid: DR_B,  papel: 'dono',     locais: [], status: 'ativo' });

    await setDoc(doc(db, 'profissionais', DR_A), { nome: 'Dr A', superadmin: false });
    await setDoc(doc(db, 'profissionais', DR_B), { nome: 'Dr B', superadmin: false });
    await setDoc(doc(db, 'profissionais', RITA), { nome: 'Rita', superadmin: false });
    await setDoc(doc(db, 'profissionais', ADMIN), { nome: 'Direx', superadmin: true });

    await setDoc(doc(db, 'subscriptions', CONTA_A), { contaId: CONTA_A, tipo: 'expert', franquiaMensal: 600, franquiaUsada: 10 });
    await setDoc(doc(db, 'subscriptions', CONTA_B), { contaId: CONTA_B, tipo: 'trial', franquiaMensal: 600, franquiaUsada: 0 });
    await setDoc(doc(db, 'configPlanos', 'atual'), { planos: [] });
    await setDoc(doc(db, 'pagamentos', 'pg1'), { valor: 100 });
  });
});

after(async () => { await env.cleanup(); });

const como = (uid) => env.authenticatedContext(uid).firestore();

describe('1. isolamento entre contas', () => {
  test('medico da conta A nao le exame da conta B', async () => {
    await assertFails(getDoc(doc(como(DR_A), `workspaces/${LOCAL_B}/exames`, 'exB')));
  });
  test('medico da conta A nao escreve exame da conta B', async () => {
    await assertFails(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_B}/exames`, 'exB'), { status: 'x' }));
  });
  test('medico da conta A le exame do proprio local', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/exames`, 'ex1')));
  });
  test('nao membro nao le a conta', async () => {
    await assertFails(getDoc(doc(como(DR_B), 'contas', CONTA_A)));
  });
  test('nao autenticado nao le nada', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, `workspaces/${LOCAL_A1}/exames`, 'ex1')));
  });
});

describe('2. papeis', () => {
  test('recepcao nao le a assinatura (financeiro)', async () => {
    await assertFails(getDoc(doc(como(RITA), 'subscriptions', CONTA_A)));
  });
  test('dono le a assinatura', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A), 'subscriptions', CONTA_A)));
  });
  test('medico le a assinatura', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A2), 'subscriptions', CONTA_A)));
  });
  test('medico nao dono nao edita o local', async () => {
    await assertFails(updateDoc(doc(como(DR_A2), 'workspaces', LOCAL_A1), { nomeClinica: 'X' }));
  });
  test('dono edita o local', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), 'workspaces', LOCAL_A1), { nomeClinica: 'Sala 1 nova' }));
  });
  test('recepcao cadastra exame e paciente', async () => {
    await assertSucceeds(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'novo'), { pacienteNome: 'Novo', status: 'aguardando' }));
    await assertSucceeds(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/pacientes`, 'pac9'), { nome: 'Novo' }));
  });
  test('recepcao nao edita o conteudo do laudo', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'ex1'), { conclusoes: 'x' }));
  });
});

describe('3. locais restritos', () => {
  test('recepcao restrita ao LOCAL_A1 nao le exame do LOCAL_A2', async () => {
    await assertFails(getDoc(doc(como(RITA), `workspaces/${LOCAL_A2}/exames`, 'ex2')));
  });
  test('medico sem restricao le os dois locais da conta', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'ex1')));
    await assertSucceeds(getDoc(doc(como(DR_A2), `workspaces/${LOCAL_A2}/exames`, 'ex2')));
  });
  test('consulta de locais por contaId funciona para membro', async () => {
    await assertSucceeds(getDocs(query(collection(como(DR_A), 'workspaces'), where('contaId', '==', CONTA_A))));
  });
  test('consulta de locais de outra conta e negada', async () => {
    await assertFails(getDocs(query(collection(como(DR_A), 'workspaces'), where('contaId', '==', CONTA_B))));
  });
});

describe('4. autoria do laudo', () => {
  test('medico que nao e autor nao edita', async () => {
    await assertFails(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'ex1'), { conclusoes: 'x' }));
  });
  test('medico que nao e autor LE o laudo do colega', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'ex1')));
  });
  test('o autor edita o proprio laudo', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/exames`, 'ex1'), { conclusoes: 'ok' }));
  });
  test('dono ajusta exame que nao e dele (administrativo)', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A2}/exames`, 'ex2'), { convenio: 'UNIMED' }));
  });
  test('ninguem apaga exame pelo navegador (apagar passa pelo servidor)', async () => {
    await assertFails(deleteDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/exames`, 'ex1')));
  });
});

describe('5. segredos', () => {
  test('dono nao le a gaveta de segredos', async () => {
    await assertFails(getDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/privado`, 'integracoes')));
  });
  test('dono nao escreve na gaveta de segredos', async () => {
    await assertFails(setDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/privado`, 'integracoes'), { feegowToken: 'x' }));
  });
  test('superadmin tambem nao le a gaveta pelo navegador', async () => {
    await assertFails(getDoc(doc(como(ADMIN), `workspaces/${LOCAL_A1}/privado`, 'integracoes')));
  });
});

describe('6. criacao so pelo servidor', () => {
  test('cliente nao cria conta', async () => {
    await assertFails(setDoc(doc(como(DR_A), 'contas', 'contaFalsa'), { tipo: 'PF', ownerUid: DR_A }));
  });
  test('cliente nao cria vinculo (papel forjado)', async () => {
    await assertFails(setDoc(doc(como(DR_B), 'vinculos', `${CONTA_A}_${DR_B}`), {
      contaId: CONTA_A, medicoUid: DR_B, papel: 'dono', locais: [], status: 'ativo',
    }));
  });
  test('cliente nao altera o proprio papel', async () => {
    await assertFails(updateDoc(doc(como(RITA), 'vinculos', `${CONTA_A}_${RITA}`), { papel: 'dono' }));
  });
  test('cliente nao cria nem altera assinatura', async () => {
    await assertFails(setDoc(doc(como(DR_A), 'subscriptions', 'contaFalsa'), { tipo: 'remido' }));
    await assertFails(updateDoc(doc(como(DR_A), 'subscriptions', CONTA_A), { franquiaUsada: 0 }));
  });
  test('cliente nao cria local', async () => {
    await assertFails(setDoc(doc(como(DR_A), 'workspaces', 'wsFalso'), { contaId: CONTA_A }));
  });
});

describe('7. perfil e autopromocao', () => {
  test('nao escreve superadmin em si mesmo', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { superadmin: true }));
  });
  test('nao escreve adminRole em si mesmo', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { adminRole: 'financeiro' }));
  });
  test('edita o proprio nome', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { nome: 'Dr A Silva' }));
  });
  test('nao lista todos os profissionais (vazamento de CPF)', async () => {
    await assertFails(getDocs(collection(como(DR_A), 'profissionais')));
  });
  test('nao nasce superadmin', async () => {
    await assertFails(setDoc(doc(como('uidNovo'), 'profissionais', 'uidNovo'), { nome: 'Novo', superadmin: true }));
  });
  test('cria o proprio perfil sem superadmin', async () => {
    await assertSucceeds(setDoc(doc(como('uidNovo2'), 'profissionais', 'uidNovo2'), { nome: 'Novo 2' }));
  });
});

describe('8. Direx e trilhas', () => {
  test('superadmin lista contas, locais e assinaturas', async () => {
    await assertSucceeds(getDocs(collection(como(ADMIN), 'contas')));
    await assertSucceeds(getDocs(collection(como(ADMIN), 'workspaces')));
    await assertSucceeds(getDocs(collection(como(ADMIN), 'subscriptions')));
  });
  test('usuario comum nao le o financeiro do Direx', async () => {
    await assertFails(getDocs(collection(como(DR_A), 'pagamentos')));
    await assertFails(getDocs(collection(como(DR_A), 'historicoFinanceiro')));
  });
  test('qualquer autenticado grava log; so o Direx le', async () => {
    await assertSucceeds(addDoc(collection(como(RITA), 'logs'), { tipo: 'teste' }));
    await assertFails(getDocs(collection(como(RITA), 'logs')));
    await assertSucceeds(getDocs(collection(como(ADMIN), 'logs')));
  });
  test('log nao pode ser alterado depois de escrito', async () => {
    await assertFails(updateDoc(doc(como(ADMIN), 'logs', 'qualquer'), { tipo: 'adulterado' }));
  });
  test('todos leem a tabela de planos; so o Direx escreve', async () => {
    await assertSucceeds(getDoc(doc(como(RITA), 'configPlanos', 'atual')));
    await assertFails(setDoc(doc(como(DR_A), 'configPlanos', 'atual'), { planos: ['pirata'] }));
  });
});
