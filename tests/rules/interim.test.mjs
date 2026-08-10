// Testes da TRANCA PROVISORIA (firestore.rules).
// Usa os IDs REAIS do inventario de 09/08/2026 para provar duas coisas:
//   A) o Dr. Sergio continua trabalhando exatamente como hoje
//   B) qualquer outro usuario logado para de enxergar os dados dele
// Roda no emulador. Nao toca producao.
import { test, before, after, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where,
} from 'firebase/firestore';
import { payloadCreateProfile } from './fixtures.mjs';

// IDs reais (inventario 09/08/2026)
const SERGIO = 'PK7UMR0fBDOdiaRLA9XzxtsUVQw2';   // superadmin, dono do MedCardio
const OUTRO  = 'w3FQAZG4DnbcWxo1X4jotPr7Udl1';   // dono do "Consultorio"
const INVASOR = 'uidRecemCadastrado';            // qualquer um que se cadastre hoje

const WS_MEDCARDIO = 'LDRtedkanx3bUvxpdmiL';     // 191 exames, 208 pacientes, segredos
const WS_OUTRO     = '5RmlZvXtJSeHlPi4ll9q';
const WS_WADER     = 'wader-dev';                // sem ownerUid

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'leo-testes',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'profissionais', SERGIO), { nome: 'SERGIO', superadmin: true });
    await setDoc(doc(db, 'profissionais', OUTRO), { nome: 'Outro', superadmin: false });
    await setDoc(doc(db, 'profissionais', INVASOR), { nome: 'Invasor', superadmin: false });

    // contaId presente porque a migracao de 09/08 ja marcou os locais reais
    await setDoc(doc(db, 'workspaces', WS_MEDCARDIO), {
      ownerUid: SERGIO, contaId: 'contaMedCardio', nomeClinica: 'Grupo MedCardio',
      feegowToken: 'TOKEN-SECRETO', ortancUser: 'orthanc', ortancPass: 'SENHA-SECRETA',
    });
    await setDoc(doc(db, 'workspaces', WS_OUTRO), {
      ownerUid: OUTRO, contaId: 'contaOutro', nomeClinica: 'Consultorio',
    });
    await setDoc(doc(db, 'workspaces', WS_WADER), { nomeClinica: 'Wader Dev' }); // sem ownerUid

    await setDoc(doc(db, `workspaces/${WS_MEDCARDIO}/exames`, 'ex1'), {
      pacienteNome: 'Paciente Real', medicoUid: SERGIO, status: 'emitido',
    });
    await setDoc(doc(db, `workspaces/${WS_MEDCARDIO}/pacientes`, 'pac1'), { nome: 'Paciente Real', cpf: '000' });
    await setDoc(doc(db, `workspaces/${WS_MEDCARDIO}/config`, 'honorarios'), { UNIMED: 120 });
    await setDoc(doc(db, `workspaces/${WS_WADER}/exames`, 'exw'), { pacienteNome: 'Teste Wader' });

    await setDoc(doc(db, 'subscriptions', 'sub-medcardio'), {
      workspaceId: WS_MEDCARDIO, tipo: 'trial', franquiaMensal: 600, franquiaUsada: 225,
    });

    // Modelo novo (migracao 09/08). OUTRO nao e superadmin — e com ele que se
    // prova a regra de dono; com o SERGIO o superadmin curto-circuita tudo.
    await setDoc(doc(db, 'contas', 'contaMedCardio'), { ownerUid: SERGIO, nome: 'Grupo MedCardio' });
    await setDoc(doc(db, 'contas', 'contaOutro'), { ownerUid: OUTRO, nome: 'Consultorio' });
    await setDoc(doc(db, 'subscriptions', 'contaMedCardio'), {
      contaId: 'contaMedCardio', tipo: 'trial', franquiaMensal: 600, franquiaUsada: 225,
    });
    await setDoc(doc(db, 'subscriptions', 'contaOutro'), {
      contaId: 'contaOutro', tipo: 'trial', franquiaMensal: 600, franquiaUsada: 0,
    });
    await setDoc(doc(db, 'empresas', 'emp1'), { cnpj: '00000000000000', razaoSocial: 'MedCardio Ltda' });
    await setDoc(doc(db, 'vinculos', 'v-sergio'), {
      medicoUid: SERGIO, workspaceId: WS_MEDCARDIO, role: 'medico', status: 'ativo',
    });
    await setDoc(doc(db, 'configPlanos', 'atual'), { planos: [] });

    // Membros da conta do MedCardio (modelo migrado): recepcao e um 2o medico.
    await setDoc(doc(db, 'profissionais', 'uidRecepcao'), { nome: 'Recepcao', superadmin: false });
    await setDoc(doc(db, 'profissionais', 'uidMedico2'), { nome: 'Medico 2', superadmin: false });
    await setDoc(doc(db, 'vinculos', 'contaMedCardio_uidRecepcao'), {
      contaId: 'contaMedCardio', medicoUid: 'uidRecepcao',
      papel: 'recepcao', locais: [], status: 'ativo',
    });
    await setDoc(doc(db, 'vinculos', 'contaMedCardio_uidMedico2'), {
      contaId: 'contaMedCardio', medicoUid: 'uidMedico2',
      papel: 'medico', locais: [], status: 'ativo',
    });
    await setDoc(doc(db, 'vinculos', 'contaMedCardio_uidInativo'), {
      contaId: 'contaMedCardio', medicoUid: 'uidInativo',
      papel: 'medico', locais: [], status: 'inativo',
    });
    // Vinculo malformado: ativo, mas sem papel. Nao pode valer.
    await setDoc(doc(db, 'vinculos', 'contaMedCardio_uidSemPapel'), {
      contaId: 'contaMedCardio', medicoUid: 'uidSemPapel', locais: [], status: 'ativo',
    });
  });
});

after(async () => { await env.cleanup(); });

const como = (uid) => env.authenticatedContext(uid).firestore();

// ══════════════════════════════════════════════════════════════════
// A) O QUE NAO PODE QUEBRAR — o dia a dia do Dr. Sergio
// ══════════════════════════════════════════════════════════════════
describe('A) o trabalho do Dr. Sergio continua', () => {
  test('le o proprio local (timbre, config)', async () => {
    await assertSucceeds(getDoc(doc(como(SERGIO), 'workspaces', WS_MEDCARDIO)));
  });

  test('lista os exames do proprio local (worklist)', async () => {
    await assertSucceeds(getDocs(collection(como(SERGIO), `workspaces/${WS_MEDCARDIO}/exames`)));
  });

  test('cria exame (cadastro manual / import Feegow)', async () => {
    await assertSucceeds(setDoc(doc(como(SERGIO), `workspaces/${WS_MEDCARDIO}/exames`, 'novo1'), {
      pacienteNome: 'Novo', status: 'aguardando',
    }));
  });

  test('atualiza exame (salvar laudo)', async () => {
    await assertSucceeds(updateDoc(doc(como(SERGIO), `workspaces/${WS_MEDCARDIO}/exames`, 'ex1'), {
      conclusoes: 'texto',
    }));
  });

  test('apaga exame (remover da fila)', async () => {
    await assertSucceeds(deleteDoc(doc(como(SERGIO), `workspaces/${WS_MEDCARDIO}/exames`, 'novo1')));
  });

  test('cria e le paciente', async () => {
    await assertSucceeds(setDoc(doc(como(SERGIO), `workspaces/${WS_MEDCARDIO}/pacientes`, 'pac2'), { nome: 'X' }));
    await assertSucceeds(getDoc(doc(como(SERGIO), `workspaces/${WS_MEDCARDIO}/pacientes`, 'pac1')));
  });

  test('salva honorarios (subcolecao config, usada pelo Extrato)', async () => {
    await assertSucceeds(setDoc(doc(como(SERGIO), `workspaces/${WS_MEDCARDIO}/config`, 'honorarios'), { UNIMED: 130 }));
  });

  test('le a assinatura por consulta (franquia no dashboard)', async () => {
    await assertSucceeds(getDocs(query(
      collection(como(SERGIO), 'subscriptions'), where('workspaceId', '==', WS_MEDCARDIO),
    )));
  });

  test('consome franquia (updateDoc na assinatura)', async () => {
    await assertSucceeds(updateDoc(doc(como(SERGIO), 'subscriptions', 'sub-medcardio'), { franquiaUsada: 226 }));
  });

  test('le e edita o proprio perfil', async () => {
    await assertSucceeds(getDoc(doc(como(SERGIO), 'profissionais', SERGIO)));
    await assertSucceeds(updateDoc(doc(como(SERGIO), 'profissionais', SERGIO), { telefone: '91999' }));
  });

  test('grava log de auditoria', async () => {
    await assertSucceeds(addDoc(collection(como(SERGIO), 'logs'), { tipo: 'teste', ts: 1 }));
  });

  test('le a tabela de planos', async () => {
    await assertSucceeds(getDoc(doc(como(SERGIO), 'configPlanos', 'atual')));
  });

  test('Direx: superadmin lista todos os locais e assinaturas', async () => {
    await assertSucceeds(getDocs(collection(como(SERGIO), 'workspaces')));
    await assertSucceeds(getDocs(collection(como(SERGIO), 'subscriptions')));
    await assertSucceeds(getDocs(collection(como(SERGIO), 'profissionais')));
  });

  test('o outro usuario continua dono do local dele', async () => {
    await assertSucceeds(getDoc(doc(como(OUTRO), 'workspaces', WS_OUTRO)));
  });
});

// ══════════════════════════════════════════════════════════════════
// B) O QUE TEM QUE FECHAR — o buraco de 06/04/2026
// ══════════════════════════════════════════════════════════════════
describe('B) o estranho para de enxergar', () => {
  test('nao le exame de outra clinica', async () => {
    await assertFails(getDoc(doc(como(INVASOR), `workspaces/${WS_MEDCARDIO}/exames`, 'ex1')));
  });

  test('nao lista exames de outra clinica', async () => {
    await assertFails(getDocs(collection(como(INVASOR), `workspaces/${WS_MEDCARDIO}/exames`)));
  });

  test('nao le paciente de outra clinica', async () => {
    await assertFails(getDoc(doc(como(INVASOR), `workspaces/${WS_MEDCARDIO}/pacientes`, 'pac1')));
  });

  test('nao escreve nem apaga exame de outra clinica', async () => {
    await assertFails(updateDoc(doc(como(INVASOR), `workspaces/${WS_MEDCARDIO}/exames`, 'ex1'), { status: 'x' }));
    await assertFails(deleteDoc(doc(como(INVASOR), `workspaces/${WS_MEDCARDIO}/exames`, 'ex1')));
  });

  test('nao le o documento do local (onde moram token Feegow e senha Orthanc)', async () => {
    await assertFails(getDoc(doc(como(INVASOR), 'workspaces', WS_MEDCARDIO)));
  });

  test('nao lista todos os locais', async () => {
    await assertFails(getDocs(collection(como(INVASOR), 'workspaces')));
  });

  test('nao se promove a superadmin', async () => {
    await assertFails(updateDoc(doc(como(INVASOR), 'profissionais', INVASOR), { superadmin: true }));
  });

  test('nao se da adminRole', async () => {
    await assertFails(updateDoc(doc(como(INVASOR), 'profissionais', INVASOR), { adminRole: 'financeiro' }));
  });

  test('nao lista profissionais (vazamento de CPF)', async () => {
    await assertFails(getDocs(collection(como(INVASOR), 'profissionais')));
  });

  test('nao le nem altera assinatura alheia', async () => {
    await assertFails(getDoc(doc(como(INVASOR), 'subscriptions', 'sub-medcardio')));
    await assertFails(updateDoc(doc(como(INVASOR), 'subscriptions', 'sub-medcardio'), { franquiaUsada: 0 }));
  });

  test('nao le o vinculo de outra pessoa', async () => {
    await assertFails(getDoc(doc(como(INVASOR), 'vinculos', 'v-sergio')));
  });

  test('nao forja vinculo para entrar em local alheio', async () => {
    await assertFails(setDoc(doc(como(INVASOR), 'vinculos', 'forjado'), {
      medicoUid: SERGIO, workspaceId: WS_MEDCARDIO, role: 'medico', status: 'ativo',
    }));
  });

  test('nao cria local no nome de outro', async () => {
    await assertFails(setDoc(doc(como(INVASOR), 'workspaces', 'wsFalso'), { ownerUid: SERGIO }));
  });

  test('nao le o ambiente de testes do Wader (sem dono)', async () => {
    await assertFails(getDoc(doc(como(INVASOR), `workspaces/${WS_WADER}/exames`, 'exw')));
  });

  test('nao le o financeiro do Direx', async () => {
    await assertFails(getDocs(collection(como(INVASOR), 'pagamentos')));
    await assertFails(getDocs(collection(como(INVASOR), 'historicoFinanceiro')));
    await assertFails(getDocs(collection(como(INVASOR), 'logs')));
  });

  test('o dono de OUTRO local tambem nao enxerga o MedCardio', async () => {
    await assertFails(getDoc(doc(como(OUTRO), `workspaces/${WS_MEDCARDIO}/exames`, 'ex1')));
    await assertFails(getDoc(doc(como(OUTRO), 'workspaces', WS_MEDCARDIO)));
  });

  test('nao autenticado nao le nada', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, `workspaces/${WS_MEDCARDIO}/exames`, 'ex1')));
  });
});

// ══════════════════════════════════════════════════════════════════
// C) O CADASTRO ATUAL (browser) TEM QUE CONTINUAR FUNCIONANDO
//    ate o Plano 2 mover isso para o servidor
// ══════════════════════════════════════════════════════════════════
describe('C) cadastro pelo navegador ainda funciona', () => {
  const NOVO = 'uidNovoCadastro';


  test('cria o proprio perfil com o payload REAL do app (superadmin:false)', async () => {
    await assertSucceeds(setDoc(doc(como(NOVO), 'profissionais', NOVO), payloadCreateProfile(NOVO)));
  });

  test('cria o proprio perfil sem o campo superadmin', async () => {
    await assertSucceeds(setDoc(doc(como('uidSemCampo'), 'profissionais', 'uidSemCampo'), { nome: 'Novo', crm: '123' }));
  });

  test('nao nasce com adminRole', async () => {
    await assertFails(setDoc(doc(como('uidAdminRole'), 'profissionais', 'uidAdminRole'), {
      ...payloadCreateProfile('uidAdminRole'), adminRole: 'financeiro',
    }));
  });

  test('nao consegue nascer superadmin', async () => {
    await assertFails(setDoc(doc(como('uidEsperto'), 'profissionais', 'uidEsperto'), {
      nome: 'Esperto', superadmin: true,
    }));
  });

  test('cria o proprio local, vinculo e assinatura', async () => {
    await assertSucceeds(setDoc(doc(como(NOVO), 'workspaces', 'wsNovo'), {
      ownerUid: NOVO, tipo: 'PF', nomeClinica: 'Consultorio',
    }));
    await assertSucceeds(setDoc(doc(como(NOVO), 'vinculos', 'vNovo'), {
      medicoUid: NOVO, workspaceId: 'wsNovo', role: 'medico', status: 'ativo',
    }));
    await assertSucceeds(setDoc(doc(como(NOVO), 'subscriptions', 'subNovo'), {
      workspaceId: 'wsNovo', tipo: 'trial', franquiaMensal: 600, franquiaUsada: 0,
    }));
  });

  test('nao cria assinatura pendurada em local alheio', async () => {
    await assertFails(setDoc(doc(como(NOVO), 'subscriptions', 'subPirata'), {
      workspaceId: WS_MEDCARDIO, tipo: 'remido',
    }));
  });

  test('nao cria vinculo apontando para local alheio', async () => {
    await assertFails(setDoc(doc(como(NOVO), 'vinculos', 'vPirata'), {
      medicoUid: NOVO, workspaceId: WS_MEDCARDIO, role: 'medico', status: 'ativo',
    }));
  });

  test('nao reescreve o proprio vinculo depois de criado', async () => {
    await assertFails(updateDoc(doc(como(NOVO), 'vinculos', 'vNovo'), { role: 'master' }));
  });
});

// ══════════════════════════════════════════════════════════════════
// D) MODELO NOVO (migracao de 09/08) convivendo com a tranca
//    A conta e a assinatura por conta precisam ser legiveis pelo dono,
//    senao o AuthContext novo trava a tela de carregamento.
// ══════════════════════════════════════════════════════════════════
describe('D) contas e assinatura por conta', () => {
  // ⚠️ Os testes de PERMITIDO usam OUTRO, que NAO e superadmin. Com o SERGIO
  // (superadmin) a regra libera antes de olhar o dono — passaria mesmo se a
  // checagem de dono estivesse quebrada.

  test('dono nao-superadmin le a propria conta', async () => {
    await assertSucceeds(getDoc(doc(como(OUTRO), 'contas', 'contaOutro')));
  });

  test('dono nao le a conta de outro', async () => {
    await assertFails(getDoc(doc(como(OUTRO), 'contas', 'contaMedCardio')));
  });

  test('estranho nao le conta nenhuma', async () => {
    await assertFails(getDoc(doc(como(INVASOR), 'contas', 'contaMedCardio')));
  });

  test('ninguem escreve em contas pelo navegador, nem o superadmin', async () => {
    await assertFails(setDoc(doc(como(SERGIO), 'contas', 'contaFalsa'), { ownerUid: SERGIO }));
    await assertFails(updateDoc(doc(como(OUTRO), 'contas', 'contaOutro'), { nome: 'Renomeada' }));
  });

  test('dono nao-superadmin le a assinatura por conta (sem workspaceId)', async () => {
    await assertSucceeds(getDoc(doc(como(OUTRO), 'subscriptions', 'contaOutro')));
  });

  test('nao le a assinatura por conta de outro', async () => {
    await assertFails(getDoc(doc(como(OUTRO), 'subscriptions', 'contaMedCardio')));
    await assertFails(getDoc(doc(como(INVASOR), 'subscriptions', 'contaMedCardio')));
  });

  test('consulta de locais por contaId funciona para o dono nao-superadmin', async () => {
    await assertSucceeds(getDocs(query(collection(como(OUTRO), 'workspaces'), where('contaId', '==', 'contaOutro'))));
  });

  test('empresas: so o Direx le', async () => {
    await assertFails(getDocs(collection(como(INVASOR), 'empresas')));
    await assertFails(getDocs(collection(como(OUTRO), 'empresas')));
    await assertSucceeds(getDocs(collection(como(SERGIO), 'empresas')));
  });
});

// ══════════════════════════════════════════════════════════════════
// E) MEMBRO DA CONTA (a recepcao entra segunda-feira)
//    A tranca so reconhecia o dono. Agora reconhece quem tem vinculo
//    ativo na conta do local, com limite por papel.
// ══════════════════════════════════════════════════════════════════
describe('E) membro da conta', () => {
  const RECEPCAO = 'uidRecepcao', MEDICO2 = 'uidMedico2', INATIVO = 'uidInativo';

  test('recepcao ve a fila do local (worklist)', async () => {
    await assertSucceeds(getDocs(collection(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`)));
  });

  test('recepcao cadastra paciente e exame', async () => {
    await assertSucceeds(setDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/pacientes`, 'pacR'), { nome: 'Novo' }));
    await assertSucceeds(setDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`, 'exR'), {
      pacienteNome: 'Novo', status: 'aguardando',
    }));
  });

  test('recepcao le o local (precisa do timbre e do nome da clinica)', async () => {
    await assertSucceeds(getDoc(doc(como(RECEPCAO), 'workspaces', WS_MEDCARDIO)));
  });

  test('recepcao NAO edita o local', async () => {
    await assertFails(updateDoc(doc(como(RECEPCAO), 'workspaces', WS_MEDCARDIO), { nomeClinica: 'X' }));
  });

  test('recepcao NAO le a assinatura (financeiro)', async () => {
    await assertFails(getDoc(doc(como(RECEPCAO), 'subscriptions', 'contaMedCardio')));
    await assertFails(getDoc(doc(como(RECEPCAO), 'subscriptions', 'sub-medcardio')));
  });

  test('recepcao NAO le honorarios nem extratos', async () => {
    await assertFails(getDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/config`, 'honorarios')));
  });

  test('medico da conta le a assinatura e os honorarios', async () => {
    await assertSucceeds(getDoc(doc(como(MEDICO2), 'subscriptions', 'contaMedCardio')));
    await assertSucceeds(getDoc(doc(como(MEDICO2), `workspaces/${WS_MEDCARDIO}/config`, 'honorarios')));
  });

  test('membro le a conta a que pertence', async () => {
    await assertSucceeds(getDoc(doc(como(RECEPCAO), 'contas', 'contaMedCardio')));
  });

  test('vinculo INATIVO nao da acesso a nada', async () => {
    await assertFails(getDoc(doc(como(INATIVO), `workspaces/${WS_MEDCARDIO}/exames`, 'ex1')));
    await assertFails(getDoc(doc(como(INATIVO), 'workspaces', WS_MEDCARDIO)));
    await assertFails(getDoc(doc(como(INATIVO), 'contas', 'contaMedCardio')));
  });

  test('membro da conta A nao alcanca o local da conta B', async () => {
    await assertFails(getDoc(doc(como(RECEPCAO), `workspaces/${WS_OUTRO}`)));
  });

  test('membro nao vira dono reescrevendo o proprio vinculo', async () => {
    await assertFails(updateDoc(doc(como(RECEPCAO), 'vinculos', 'contaMedCardio_uidRecepcao'), { papel: 'dono' }));
  });

  test('estranho sem vinculo continua sem ver nada', async () => {
    await assertFails(getDocs(collection(como(INVASOR), `workspaces/${WS_MEDCARDIO}/exames`)));
  });

  // ── Laudo emitido e documento assinado ──
  test('recepcao NAO altera laudo emitido', async () => {
    await assertFails(updateDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`, 'ex1'), {
      conclusoes: 'alterado pela recepcao',
    }));
  });

  test('recepcao NAO apaga laudo emitido', async () => {
    await assertFails(deleteDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`, 'ex1')));
  });

  test('recepcao altera e remove exame ainda NAO emitido (fila do dia)', async () => {
    await assertSucceeds(setDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`, 'exFila'), {
      pacienteNome: 'Na fila', status: 'aguardando',
    }));
    await assertSucceeds(updateDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`, 'exFila'), {
      status: 'nao-realizado',
    }));
    await assertSucceeds(deleteDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`, 'exFila')));
  });

  test('medico da conta altera laudo emitido', async () => {
    await assertSucceeds(updateDoc(doc(como(MEDICO2), `workspaces/${WS_MEDCARDIO}/exames`, 'ex1'), {
      conclusoes: 'revisado pelo medico',
    }));
  });

  // ── O 2o medico precisa ler a assinatura ANTIGA para conseguir emitir ──
  test('medico nao-dono le a assinatura antiga (a que o billing consulta)', async () => {
    await assertSucceeds(getDocs(query(
      collection(como(MEDICO2), 'subscriptions'), where('workspaceId', '==', WS_MEDCARDIO),
    )));
  });

  test('recepcao NAO le a assinatura antiga', async () => {
    await assertFails(getDocs(query(
      collection(como(RECEPCAO), 'subscriptions'), where('workspaceId', '==', WS_MEDCARDIO),
    )));
  });

  // ── A recepcao nao pode "emitir" por fora do /api/emitir ──
  test('recepcao NAO cria exame ja marcado como emitido', async () => {
    await assertFails(setDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`, 'exFalso'), {
      pacienteNome: 'Fraude', status: 'emitido', conclusoes: 'laudo inventado',
    }));
  });

  test('recepcao NAO marca exame da fila como emitido', async () => {
    await assertSucceeds(setDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`, 'exFila2'), {
      pacienteNome: 'Na fila', status: 'aguardando',
    }));
    await assertFails(updateDoc(doc(como(RECEPCAO), `workspaces/${WS_MEDCARDIO}/exames`, 'exFila2'), {
      status: 'emitido', conclusoes: 'laudo inventado',
    }));
  });

  test('medico marca como emitido normalmente', async () => {
    await assertSucceeds(updateDoc(doc(como(MEDICO2), `workspaces/${WS_MEDCARDIO}/exames`, 'exFila2'), {
      status: 'emitido',
    }));
  });

  // ── intacto() robusto: setDoc sem merge nao apaga campo protegido ──
  test('dono NAO apaga o ownerUid do proprio local com setDoc sem merge', async () => {
    await assertFails(setDoc(doc(como(OUTRO), 'workspaces', WS_OUTRO), {
      nomeClinica: 'Sem dono agora', contaId: 'contaOutro',
    }));
  });

  // ── Vinculo malformado nao vale ──
  test('vinculo ativo SEM papel nao concede acesso', async () => {
    await assertFails(getDoc(doc(como('uidSemPapel'), `workspaces/${WS_MEDCARDIO}/exames`, 'ex1')));
    await assertFails(getDoc(doc(como('uidSemPapel'), 'workspaces', WS_MEDCARDIO)));
  });
});
