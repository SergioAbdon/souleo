// Fechadura DEFINITIVA (modelo de contas). Le firestore.rules — a regra publicada.
import { test, before, after, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where,
} from 'firebase/firestore';
import { payloadCreateProfile, payloadCadastroExame, payloadEditarExame, payloadTipoLaudo } from './fixtures.mjs';

let env;

// Conta A (clinica): Dr. A dono+medico, Dr. A2 medico, Rita recepcao, 2 locais.
// Conta B (outra clinica): Dr. B.
const CONTA_A = 'contaA', CONTA_B = 'contaB';
const LOCAL_A1 = 'localA1', LOCAL_A2 = 'localA2', LOCAL_B = 'localB';
const DR_A = 'uidDrA', DR_A2 = 'uidDrA2', RITA = 'uidRita', DR_B = 'uidDrB', ADMIN = 'uidAdmin';
const INATIVO = 'uidInativo'; // vinculo com status != 'ativo', usado na secao 11
// Conta C: gestor NAO-medico como dono + medico membro (trava do CRM, secao 12).
const CONTA_C = 'contaC', LOCAL_C = 'localC', GESTOR = 'uidGestor', DR_C = 'uidDrC';
// Medico-de-perfil com papel recepcao: nao atende no local, so administra a fila
// (furo B do create — conteudo clinico exige medico-no-local, nao so tipoPerfil).
const MEDREC = 'uidMedRec';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'leo-testes-definitiva',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
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
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/extratos`, '2026-08'), { emitidos: 3 });

    // Exame cadastrado pela recepcao, ainda sem medico definido (secao 10).
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'exSemAutor'), {
      pacienteNome: 'Sem Autor', status: 'aguardando',
    });

    // Fila da Secao 2 (secao 14): exames aguardando + um rascunho COM autor.
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'exFila1'), {
      pacienteNome: 'Fila Um', status: 'aguardando', cpf: '11111111111',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'exFila2'), {
      pacienteNome: 'Fila Dois', status: 'aguardando',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), {
      pacienteNome: 'Rascunho do Dr A', status: 'rascunho', medicoUid: DR_A,
    });
    // Dedicado a secao 14: 'ex1' e mutado pela secao 12 (reabre p/ 'andamento')
    // antes da secao 14 rodar, entao nao serve mais pra testar "emitido".
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'exEmitidoS14'), {
      pacienteNome: 'Emitido Intocado', status: 'emitido', medicoUid: DR_A,
    });

    // Log ja existente, pra testar update contra um doc real (secao 8, item 3).
    await setDoc(doc(db, 'logs', 'log1'), { tipo: 'evento original' });

    // Vinculos com id deterministico. Rita so alcanca o LOCAL_A1.
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${DR_A}`),  { contaId: CONTA_A, medicoUid: DR_A,  papel: 'dono',     locais: [], status: 'ativo' });
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${DR_A2}`), { contaId: CONTA_A, medicoUid: DR_A2, papel: 'medico',   locais: [], status: 'ativo' });
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${RITA}`),  { contaId: CONTA_A, medicoUid: RITA,  papel: 'recepcao', locais: [LOCAL_A1], status: 'ativo' });
    await setDoc(doc(db, 'vinculos', `${CONTA_B}_${DR_B}`),  { contaId: CONTA_B, medicoUid: DR_B,  papel: 'dono',     locais: [], status: 'ativo' });
    // Usuario novo, vinculado a conta A mas ainda nao ativado (secao 11).
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${INATIVO}`), { contaId: CONTA_A, medicoUid: INATIVO, papel: 'medico', locais: [], status: 'inativo' });

    await setDoc(doc(db, 'profissionais', DR_A), {
      nome: 'Dr A', superadmin: false, crm: '111', ufCrm: 'PA',
      crmVerificacao: { status: 'pendente' },
    });
    // DR_A2 e medico (sem tipoPerfil = default medico). O perfil precisa existir:
    // ehMedicoDeVerdade confere profissionais/{uid} para liberar edicao de laudo.
    await setDoc(doc(db, 'profissionais', DR_A2), { nome: 'Dr A2', superadmin: false });
    await setDoc(doc(db, 'profissionais', DR_B), { nome: 'Dr B', superadmin: false });
    await setDoc(doc(db, 'profissionais', RITA), { nome: 'Rita', superadmin: false });
    await setDoc(doc(db, 'profissionais', ADMIN), { nome: 'Direx', superadmin: true });

    await setDoc(doc(db, 'subscriptions', CONTA_A), { contaId: CONTA_A, tipo: 'expert', franquiaMensal: 600, franquiaUsada: 10 });
    await setDoc(doc(db, 'subscriptions', CONTA_B), { contaId: CONTA_B, tipo: 'trial', franquiaMensal: 600, franquiaUsada: 0 });

    // ── Conta C: gestor NAO-medico como dono (o caso que a trava do CRM protege) ──
    await setDoc(doc(db, 'contas', CONTA_C), { tipo: 'PJ', nome: 'Clinica C', ownerUid: GESTOR });
    await setDoc(doc(db, 'workspaces', LOCAL_C), { contaId: CONTA_C, nomeClinica: 'Clinica C' });
    await setDoc(doc(db, 'vinculos', `${CONTA_C}_${GESTOR}`), { contaId: CONTA_C, medicoUid: GESTOR, papel: 'dono', locais: [], status: 'ativo' });
    await setDoc(doc(db, 'vinculos', `${CONTA_C}_${DR_C}`),   { contaId: CONTA_C, medicoUid: DR_C,   papel: 'medico', locais: [], status: 'ativo' });
    // GESTOR e assistente (nao tem CRM); DR_C e medico.
    await setDoc(doc(db, 'profissionais', GESTOR), { nome: 'Gestor', superadmin: false, tipoPerfil: 'assistente' });
    await setDoc(doc(db, 'profissionais', DR_C),   { nome: 'Dr C',   superadmin: false, tipoPerfil: 'medico' });
    await setDoc(doc(db, `workspaces/${LOCAL_C}/exames`, 'exCemitido'), { pacienteNome: 'Pac C', medicoUid: DR_C, status: 'emitido' });
    await setDoc(doc(db, `workspaces/${LOCAL_C}/exames`, 'exCfila'),    { pacienteNome: 'Fila C', status: 'aguardando' });
    // Medico-de-perfil, mas papel recepcao no local: nao atende, so administra a fila.
    await setDoc(doc(db, 'profissionais', MEDREC), { nome: 'Med Recepcao', superadmin: false, tipoPerfil: 'medico' });
    await setDoc(doc(db, 'vinculos', `${CONTA_C}_${MEDREC}`), { contaId: CONTA_C, medicoUid: MEDREC, papel: 'recepcao', locais: [LOCAL_C], status: 'ativo' });
    await setDoc(doc(db, 'configPlanos', 'atual'), { planos: [] });
    await setDoc(doc(db, 'pagamentos', 'pg1'), { valor: 100 });

    // Convite real, para provar que o cliente nao le nem escreve (secao 13).
    await setDoc(doc(db, 'convites', 'conv1'), { contaId: CONTA_A, papel: 'medico', locais: [], usado: false });
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
  test('recepcao nao le honorarios (financeiro)', async () => {
    await assertFails(getDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/config`, 'honorarios')));
  });
  test('medico le e escreve honorarios', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/config`, 'honorarios')));
    await assertSucceeds(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/config`, 'honorarios'), { UNIMED: 150 }));
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
  test('dono medico NAO ajusta laudo EMITIDO de outro pelo cliente (vai pela /api/corrigir-laudo)', async () => {
    await assertFails(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A2}/exames`, 'ex2'), { convenio: 'UNIMED' }));
  });
  test('dono administra a fila: ajusta exame NAO-emitido', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/exames`, 'exSemAutor'), { convenio: 'UNIMED' }));
  });
  test('medico comum (nao dono), autor do exame, edita com sucesso', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A2}/exames`, 'ex2'), { conclusoes: 'medico comum ok' }));
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
  // Furo A: o cadastro real cria o perfil pelo servidor (Admin SDK). O create
  // client-side NUNCA pode nascer 'verificado' — senao forja o selo do CRM.
  test('NAO cria o proprio perfil ja com crmVerificacao verificado', async () => {
    await assertFails(setDoc(doc(como('uidSelo'), 'profissionais', 'uidSelo'), {
      nome: 'Selo Forjado', tipoPerfil: 'medico',
      crmVerificacao: { status: 'verificado', fonte: 'x', checadoEm: '2026-01-01' },
    }));
  });
  test('cria o proprio perfil com crmVerificacao nao_verificado', async () => {
    await assertSucceeds(setDoc(doc(como('uidSeloNv'), 'profissionais', 'uidSeloNv'), {
      nome: 'Selo Ok', tipoPerfil: 'medico', crmVerificacao: { status: 'nao_verificado' },
    }));
  });
  test('cria o proprio perfil SEM crmVerificacao', async () => {
    await assertSucceeds(setDoc(doc(como('uidSemSelo'), 'profissionais', 'uidSemSelo'), { nome: 'Sem Selo' }));
  });
});

// crmVerificacao (selo "CRM verificado no CFM"), crm e ufCrm sao do servidor:
// se o proprio usuario grava, um medico forja o selo ou troca o proprio CRM.
describe('7.2 crmVerificacao/crm/ufCrm imutaveis no self-update (Plano 2B-B1)', () => {
  test('usuario NAO forja o selo crmVerificacao em si mesmo', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'profissionais', DR_A), {
      crmVerificacao: { status: 'verificado', fonte: 'x', checadoEm: '2026-01-01' },
    }));
  });
  test('usuario NAO muda o proprio crm', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { crm: '999' }));
  });
  test('usuario NAO muda a propria ufCrm', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { ufCrm: 'SP' }));
  });
  test('usuario edita o proprio nome (crm/crmVerificacao intactos no merge)', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { nome: 'Dr A Renomeado' }));
  });
  test('superadmin muda o crmVerificacao de outro (servidor seta o selo)', async () => {
    await assertSucceeds(updateDoc(doc(como(ADMIN), 'profissionais', DR_A), {
      crmVerificacao: { status: 'verificado', fonte: 'cfm', checadoEm: '2026-08-11' },
    }));
  });
});

describe('7.1 sincronia com a regra publicada (achados da auditoria)', () => {

  test('cadastro real (superadmin:false) e aceito', async () => {
    await assertSucceeds(setDoc(doc(como('uidCadastroReal'), 'profissionais', 'uidCadastroReal'),
      payloadCreateProfile('uidCadastroReal')));
  });

  test('cadastro com superadmin:true e negado', async () => {
    await assertFails(setDoc(doc(como('uidEsperto2'), 'profissionais', 'uidEsperto2'), {
      ...payloadCreateProfile('uidEsperto2'), superadmin: true,
    }));
  });

  test('vinculo ativo SEM papel nao concede acesso', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'vinculos', `${CONTA_A}_uidSemPapel`), {
        contaId: CONTA_A, medicoUid: 'uidSemPapel', locais: [], status: 'ativo',
      });
    });
    await assertFails(getDoc(doc(como('uidSemPapel'), `workspaces/${LOCAL_A1}/exames`, 'ex1')));
    await assertFails(getDoc(doc(como('uidSemPapel'), 'contas', CONTA_A)));
  });

  test('empresas: so o Direx le', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'empresas', 'emp1'), { cnpj: '000', razaoSocial: 'X' });
    });
    await assertFails(getDoc(doc(como(DR_A), 'empresas', 'emp1')));
    await assertSucceeds(getDoc(doc(como(ADMIN), 'empresas', 'emp1')));
  });

  test('recepcao NAO cria exame ja carimbado como emitido', async () => {
    await assertFails(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFraude'), {
      pacienteNome: 'Fraude', status: 'emitido', conclusoes: 'laudo inventado',
    }));
  });

  test('recepcao cria exame na fila normalmente', async () => {
    await assertSucceeds(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFilaOk'), {
      pacienteNome: 'Na fila', status: 'aguardando',
    }));
  });

  test('medico cria exame ja emitido (caminho legitimo)', async () => {
    await assertSucceeds(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'exMedico'), {
      pacienteNome: 'Emitido', status: 'emitido', medicoUid: DR_A2,
    }));
  });

  test('autor NAO transfere o laudo trocando medicoUid na edicao', async () => {
    await assertFails(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/exames`, 'ex1'), {
      medicoUid: DR_A2, conclusoes: 'transferido na surdina',
    }));
  });

  test('dono NAO troca o medicoUid ao ajustar o administrativo', async () => {
    await assertFails(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A2}/exames`, 'ex2'), {
      medicoUid: DR_A, convenio: 'UNIMED',
    }));
  });

  // Antes o dono ajustava o administrativo de qualquer exame; agora, se o laudo
  // esta EMITIDO, a correcao vai pela /api/corrigir-laudo (ADR 8.4). A fila
  // continua com o dono — coberto por '4. dono administra a fila'.
  test('dono NAO ajusta o administrativo de laudo EMITIDO pelo cliente (vai pela /api/corrigir-laudo)', async () => {
    await assertFails(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A2}/exames`, 'ex2'), {
      convenio: 'PARTICULAR',
    }));
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
    // log1 existe de verdade (criado na fixture) — testa a regra, nao um
    // doc inexistente que falharia de qualquer jeito.
    await assertFails(updateDoc(doc(como(ADMIN), 'logs', 'log1'), { tipo: 'adulterado' }));
  });
  test('todos leem a tabela de planos; so o Direx escreve', async () => {
    await assertSucceeds(getDoc(doc(como(RITA), 'configPlanos', 'atual')));
    await assertFails(setDoc(doc(como(DR_A), 'configPlanos', 'atual'), { planos: ['pirata'] }));
  });
});

describe('9. campos protegidos resistem a setDoc sem merge', () => {
  test('setDoc sem merge nao apaga superadmin do proprio perfil', async () => {
    // Sem merge: so 'nome' e enviado. superadmin (que era false) some do
    // resultado se intacto() so checar ausencia — tem que negar.
    await assertFails(setDoc(doc(como(DR_A), 'profissionais', DR_A), { nome: 'Dr A sem campo' }));
  });
  test('setDoc sem merge nao apaga contaId do proprio local', async () => {
    // O dono do local nao pode, nem sem querer, apagar contaId do local —
    // isso travaria o acesso de todo mundo (inclusive dele) aquele local.
    await assertFails(setDoc(doc(como(DR_A), 'workspaces', LOCAL_A1), { nomeClinica: 'Sala sem contaId' }));
  });
});

describe('10. autoria do exame: create nao forja, update sem autor pode ser assumido', () => {
  test('recepcao nao cria exame carimbado com medicoUid de outra pessoa', async () => {
    await assertFails(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exForjado'), {
      pacienteNome: 'Forjado', status: 'aguardando', medicoUid: DR_A2,
    }));
  });
  test('recepcao cria exame sem medicoUid', async () => {
    await assertSucceeds(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exSemAutorNovo'), {
      pacienteNome: 'Sem Autor Novo', status: 'aguardando',
    }));
  });
  test('medico assume e edita exame sem medicoUid', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'exSemAutor'), {
      medicoUid: DR_A2, conclusoes: 'assumido',
    }));
  });
  test('medico continua sem editar exame de outro medico', async () => {
    await assertFails(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'ex1'), { conclusoes: 'y' }));
  });
});

describe('11. vinculo inativo nao alcanca nada', () => {
  test('vinculo inativo nao le exame', async () => {
    await assertFails(getDoc(doc(como(INATIVO), `workspaces/${LOCAL_A1}/exames`, 'ex1')));
  });
  test('vinculo inativo nao le o local', async () => {
    await assertFails(getDoc(doc(como(INATIVO), 'workspaces', LOCAL_A1)));
  });
  test('vinculo inativo nao le a conta', async () => {
    await assertFails(getDoc(doc(como(INATIVO), 'contas', CONTA_A)));
  });
});

describe('9. correcoes do Plano 2A (Lacuna 1 + Direx)', () => {
  test('superadmin le e escreve config (honorarios) de local alheio', async () => {
    await assertSucceeds(getDoc(doc(como(ADMIN), `workspaces/${LOCAL_A1}/config`, 'honorarios')));
    await assertSucceeds(setDoc(doc(como(ADMIN), `workspaces/${LOCAL_A1}/config`, 'honorarios'), { UNIMED: 130 }));
  });
  test('superadmin le extratos de local alheio', async () => {
    await assertSucceeds(getDoc(doc(como(ADMIN), `workspaces/${LOCAL_A1}/extratos`, '2026-08')));
  });
  test('superadmin atualiza assinatura (Direx: troca de plano, creditos)', async () => {
    await assertSucceeds(updateDoc(doc(como(ADMIN), 'subscriptions', CONTA_A), { creditosExtras: 10 }));
  });
  test('dono NAO atualiza a propria assinatura', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'subscriptions', CONTA_A), { franquiaUsada: 0 }));
  });
  test('recepcao NAO le config nem extratos', async () => {
    await assertFails(getDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/config`, 'honorarios')));
    await assertFails(getDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/extratos`, '2026-08')));
  });
  test('dono da conta le o vinculo de um membro da propria conta', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A), 'vinculos', `${CONTA_A}_${RITA}`)));
  });
  test('dono de OUTRA conta nao le vinculo alheio', async () => {
    await assertFails(getDoc(doc(como(DR_B), 'vinculos', `${CONTA_A}_${RITA}`)));
  });
});

describe('12. triade do Plano 2A: ledger e cancelamento sao do servidor', () => {
  test('autenticado NAO cria doc em consumo (ledger e so do Admin SDK)', async () => {
    await assertFails(addDoc(collection(como(DR_A), 'consumo'), {
      workspaceId: LOCAL_A1, exameId: 'ex1', tipo: 'cancelamento',
      devolvidoFranquia: 999, emitidoEm: new Date(),
    }));
  });
  test('autor NAO seta status cancelado no proprio exame emitido', async () => {
    await assertFails(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/exames`, 'ex1'), {
      status: 'cancelado', motivoCancelamento: 'sem devolver franquia',
    }));
  });
  test('autor AINDA reabre o proprio emitido para andamento', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/exames`, 'ex1'), {
      status: 'andamento',
    }));
  });
});

// tipoPerfil e o gate de "quem assina laudo" no /api/emitir. Se o proprio
// usuario pode troca-lo, um assistente com papel dono se autopromove a medico
// e o gate nao vale nada.
describe('13. tipoPerfil nao e autoeditavel', () => {
  const ASSIST = 'uidAssistente';
  before(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      // Assistente realista: sem CRM (crm/ufCrm vazios). O PerfilModal reenvia
      // esses mesmos valores no save — intacto permite igual, nao trava o modal.
      await setDoc(doc(ctx.firestore(), 'profissionais', ASSIST), {
        ...payloadCreateProfile(ASSIST), tipoPerfil: 'assistente', crm: '', ufCrm: '',
      });
    });
  });
  test('assistente NAO se promove a medico', async () => {
    await assertFails(updateDoc(doc(como(ASSIST), 'profissionais', ASSIST), { tipoPerfil: 'medico' }));
  });
  test('edita o proprio nome reenviando o mesmo tipoPerfil (PerfilModal)', async () => {
    await assertSucceeds(updateDoc(doc(como(ASSIST), 'profissionais', ASSIST), {
      nome: 'Assistente Editado', crm: '', ufCrm: '', rqe: '',
      especialidade: 'Secretaria', telefone: '91999990000',
      tipoPerfil: 'assistente', atualizadoEm: new Date(),
    }));
  });
  test('superadmin muda o tipoPerfil de outro', async () => {
    await assertSucceeds(updateDoc(doc(como(ADMIN), 'profissionais', ASSIST), { tipoPerfil: 'medico' }));
  });
});

describe('12. trava do CRM (ato medico) — Plano 2B-B1', () => {
  test('gestor NAO-medico (dono) NAO edita conteudo de laudo emitido', async () => {
    await assertFails(updateDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCemitido'), { conclusoes: 'x' }));
  });
  test('gestor NAO-medico NAO reabre laudo emitido', async () => {
    await assertFails(updateDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCemitido'), { status: 'andamento' }));
  });
  test('gestor NAO-medico administra a fila (exame nao-emitido)', async () => {
    await assertSucceeds(updateDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCfila'), { convenio: 'BRADESCO' }));
  });
  test('medico autor edita/reabre o proprio laudo emitido', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_C), `workspaces/${LOCAL_C}/exames`, 'exCemitido'), { conclusoes: 'ok', status: 'andamento' }));
  });
  test('gestor NAO-medico NAO marca exame da fila como emitido', async () => {
    await assertFails(updateDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCfila'), { status: 'emitido' }));
  });
  // Conteudo clinico do laudo, ate em rascunho, e ato medico (ADR 8.4): o gestor
  // NAO-medico so administra a fila (paciente, convenio, agendamento).
  test('gestor NAO-medico NAO escreve conclusoes em rascunho', async () => {
    await assertFails(updateDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCfila'), { conclusoes: 'laudo do gestor' }));
  });
  test('gestor NAO-medico NAO escreve medidas em rascunho', async () => {
    await assertFails(updateDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCfila'), { medidas: { b7: '10' } }));
  });
  test('gestor NAO-medico NAO cria exame ja com conteudo clinico', async () => {
    await assertFails(setDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCnovoClinico'), {
      status: 'aguardando', conclusoes: 'laudo inventado',
    }));
  });
  test('gestor NAO-medico cria exame na fila (so administrativo)', async () => {
    await assertSucceeds(setDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCnovoAdmin'), {
      pacienteNome: 'Novo Fila C', status: 'aguardando', convenio: 'UNIMED',
    }));
  });
  test('medico cria exame com conteudo clinico (nao pode quebrar)', async () => {
    await assertSucceeds(setDoc(doc(como(DR_C), `workspaces/${LOCAL_C}/exames`, 'exCmedicoClinico'), {
      pacienteNome: 'Pac Medico', status: 'aguardando', conclusoes: 'laudo do medico', medicoUid: DR_C,
    }));
  });
  // Furo B: medico-DE-PERFIL com papel recepcao NAO atende no local. Conteudo
  // clinico no create exige medico-NO-local (papel dono/medico), igual /api/emitir.
  test('medico-de-perfil com papel recepcao NAO cria exame com conteudo clinico', async () => {
    await assertFails(setDoc(doc(como(MEDREC), `workspaces/${LOCAL_C}/exames`, 'exMedRecClinico'), {
      status: 'aguardando', conclusoes: 'x',
    }));
  });
  test('medico-de-perfil com papel recepcao cria exame administrativo (fila)', async () => {
    await assertSucceeds(setDoc(doc(como(MEDREC), `workspaces/${LOCAL_C}/exames`, 'exMedRecAdmin'), {
      pacienteNome: 'Fila MedRec', status: 'aguardando', convenio: 'UNIMED',
    }));
  });
});

describe('13. convites sao 100% servidor', () => {
  test('cliente NAO le convite (nem com o token)', async () => {
    await assertFails(getDoc(doc(como(DR_A), 'convites', 'conv1')));
  });
  test('cliente NAO cria convite', async () => {
    await assertFails(setDoc(doc(como(DR_A), 'convites', 'forjado'), { contaId: CONTA_A, papel: 'dono', locais: [], usado: false }));
  });
  test('cliente NAO marca convite usado', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'convites', 'conv1'), { usado: true }));
  });
});

describe('14. worklist — administracao da fila por membro do local (Secao 2)', () => {
  test('recepcao edita administrativo de exame aguardando (payload real)', async () => {
    await assertSucceeds(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFila1'), payloadEditarExame()));
  });
  test('recepcao edita administrativo de rascunho COM autor (autor intacto)', async () => {
    await assertSucceeds(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), { convenio: 'UNIMED' }));
  });
  test('recepcao NAO toca campo clinico', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFila1'), { medidas: { fe: 60 } }));
  });
  test('recepcao NAO promove status a emitido', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFila1'), { status: 'emitido' }));
  });
  test('recepcao NAO troca o medicoUid', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), { medicoUid: RITA }));
  });
  test('medico NAO-autor edita administrativo do rascunho do colega (concessao documentada)', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), { horarioChegada: '11:00' }));
  });
  test('medico NAO-autor continua SEM tocar o clinico do colega', async () => {
    await assertFails(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), { medidas: { fe: 60 } }));
  });
  // MEDREC: medico de perfil com papel recepcao — administra a fila, nao assina.
  test('MEDREC edita administrativo de exame aguardando', async () => {
    await assertSucceeds(updateDoc(doc(como(MEDREC), `workspaces/${LOCAL_C}/exames`, 'exCfila'), { convenio: 'UNIMED' }));
  });
  test('MEDREC NAO grava conteudo clinico via update', async () => {
    await assertFails(updateDoc(doc(como(MEDREC), `workspaces/${LOCAL_C}/exames`, 'exCfila'), { medidas: { fe: 60 } }));
  });
  test('recepcao NAO edita exame emitido', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exEmitidoS14'), payloadEditarExame()));
  });
  test('recepcao cadastra exame SEM medicoUid (payload real do cadastro)', async () => {
    await assertSucceeds(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exNovoRita'),
      payloadCadastroExame({ id: 'exNovoRita' })));
  });
  test('medico assume o orfao no primeiro save do laudo (payload real do salvarLaudo)', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'exNovoRita'),
      { medidas: { ddve: 50 }, pacienteNome: 'PACIENTE NOVO', status: 'andamento', medicoUid: DR_A2 }));
  });

  test('recepcao grava mwlStatus (resultado do envio ao aparelho)', async () => {
    await assertSucceeds(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFila1'), { mwlStatus: 'falhou' }));
  });
  test('recepcao grava mwlStatus em exame aguardando COM autor', async () => {
    await assertSucceeds(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), { mwlStatus: 'enviado' }));
  });
});

describe('15. catalogo de tipos de laudo (Secao 2/Sub-plano 3)', () => {
  test('membro do local LE o catalogo', async () => {
    await assertSucceeds(getDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/tiposLaudo`, 'eco_tt')));
  });
  test('dono cria/edita tipo (payload real)', async () => {
    await assertSucceeds(setDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/tiposLaudo`, 'ecg'), payloadTipoLaudo()));
  });
  test('recepcao NAO escreve no catalogo', async () => {
    await assertFails(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/tiposLaudo`, 'ecg2'), payloadTipoLaudo({ id: 'ecg2' })));
  });
  test('medico nao-dono NAO escreve no catalogo', async () => {
    await assertFails(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/tiposLaudo`, 'ecg3'), payloadTipoLaudo({ id: 'ecg3' })));
  });
  test('fora do local NAO le o catalogo', async () => {
    await assertFails(getDoc(doc(como(DR_B), `workspaces/${LOCAL_A1}/tiposLaudo`, 'eco_tt')));
  });
});

describe('16. Integracoes (Sub-plano 5)', () => {
  test('dono LE a integracao', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/integracoes`, 'feegow')));
  });
  test('dono ESCREVE a integracao', async () => {
    await assertSucceeds(setDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/integracoes`, 'feegow'), { tipo: 'feegow', ativo: true, status: 'nunca_testado' }));
  });
  test('medico do local NAO le a integracao', async () => {
    await assertFails(getDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/integracoes`, 'feegow')));
  });
  test('recepcao NAO le a integracao', async () => {
    await assertFails(getDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/integracoes`, 'feegow')));
  });
  test('medico NAO escreve a integracao', async () => {
    await assertFails(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/integracoes`, 'feegow'), { ativo: false }));
  });
  test('membro de OUTRA conta NAO le a integracao', async () => {
    await assertFails(getDoc(doc(como(DR_B), `workspaces/${LOCAL_A1}/integracoes`, 'feegow')));
  });
  test('anonimo NAO le a integracao', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, `workspaces/${LOCAL_A1}/integracoes`, 'feegow')));
  });
  test('nem o dono le a gaveta de segredo pelo cliente', async () => {
    await assertFails(getDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/privado`, 'feegow')));
  });
  test('nem o dono escreve na gaveta de segredo pelo cliente', async () => {
    await assertFails(setDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/privado`, 'feegow'), { token: 'x' }));
  });
});
