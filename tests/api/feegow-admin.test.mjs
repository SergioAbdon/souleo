// Importacao Feegow server-side (Secao 2, A7/A9/A10/A14). Emulador Firestore.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { gravarImportacao, resolverTokenFeegow, resolverProcMap, gateAcessoWs, decidirGetFeegow, cpfValido, montarCandidatos, normalizarNascimento, reconciliarCancelados, marcarAtendido } from '../../src/lib/feegow-admin.ts';

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
    const ex1 = (await db.doc(`workspaces/${WS}/exames/fg-1-2026-08-12`).get()).data();
    assert.equal(ex1.status, 'aguardando');
    assert.equal(ex1.medicoUid, undefined); // quem nao assina NAO carimba autor
    assert.equal(ex1.medicoExecutor, '');
    assert.ok((await db.doc(`workspaces/${WS}/accIndex/${ex1.acc}`).get()).exists, 'reserva de ACC criada');
    assert.match(ex1.acc, /^EX\d{14}$/); // contrato DICOM: EX + 14 digitos = 16 chars (Vivid/Wader)
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
    assert.equal((await db.doc(`workspaces/${WS}/exames/fg-3-2026-08-12`).get()).data().sexo, '');
  });
  test('appointId nao-numerico e descartado (path safety), e contado em descartados (Task 3)', async () => {
    const { criados, descartados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato('7/../x')], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 0);
    assert.equal(descartados, 1);
  });
  test('dataExame invalida e descartada e contada em descartados (Task 3 — nunca dispara no fluxo real, montarCandidatos sempre gera data valida)', async () => {
    const { criados, descartados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(85, { dataExame: 'lixo' })], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 0);
    assert.equal(descartados, 1);
  });
  test('candidatos validos -> descartados 0', async () => {
    const { criados, descartados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(86)], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 1);
    assert.equal(descartados, 0);
  });
  test('medico importando carimba medicoUid e ACCs nao colidem', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(4), candidato(5)], uid: 'uidDrA', ehMed: true, nomeCriador: 'Dr A',
    });
    assert.equal(criados.length, 2);
    const ex4 = (await db.doc(`workspaces/${WS}/exames/fg-4-2026-08-12`).get()).data();
    const ex5 = (await db.doc(`workspaces/${WS}/exames/fg-5-2026-08-12`).get()).data();
    assert.equal(ex4.medicoUid, 'uidDrA');
    assert.notEqual(ex4.acc, ex5.acc);
  });
});

// Correcao da Task 1 (revisao da triade): identidade fg-{id}-{data} (D2) +
// #7c na ficha (achado 1) + CPF validado (achado 11) + dedup por CPF
// (achado 10) + criadoEm preservado (achado 12).
describe('gravarImportacao — Task 1 (identidade fg-{id}-{data}, #7c, CPF, dedup)', () => {
  test('remarcado ENTRA: agendamento preserva o id no Feegow, mas dia diferente e um exame novo (achado 7b)', async () => {
    await db.doc(`workspaces/${WS}/exames/fg-77-2026-08-19`).set({ status: 'nao-realizado' });
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(77, { dataExame: '2026-08-26' })],
      uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 1);
    assert.ok((await db.doc(`workspaces/${WS}/exames/fg-77-2026-08-26`).get()).exists);
    // o exame antigo (remarcado) nao foi tocado
    assert.equal((await db.doc(`workspaces/${WS}/exames/fg-77-2026-08-19`).get()).data().status, 'nao-realizado');
  });

  test('mesmo dia NAO duplica: reimportar o mesmo candidato cria 1 doc so (identidade nova)', async () => {
    const primeira = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(78)], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    const segunda = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(78)], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(primeira.criados.length, 1);
    assert.equal(segunda.criados.length, 0);
  });

  test('#7c: candidato com cpf/nome vazio NAO apaga o que a secretaria corrigiu na ficha (achado 1)', async () => {
    await db.doc(`workspaces/${WS}/pacientes/fg-500`).set({
      id: 'fg-500', cpf: '11144477735', nome: 'MARIA CORRIGIDA',
    });
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(79, { feegowPacienteId: 500, cpf: '', pacienteNome: '' })],
      uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 1);
    const pac = (await db.doc(`workspaces/${WS}/pacientes/fg-500`).get()).data();
    assert.equal(pac.cpf, '11144477735');
    assert.equal(pac.nome, 'MARIA CORRIGIDA');
  });

  test('cpf invalido vira vazio, nunca grava lixo (achado 11)', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(80, { cpf: '11111111111' })],
      uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 1);
    const ex = (await db.doc(`workspaces/${WS}/exames/fg-80-2026-08-12`).get()).data();
    assert.equal(ex.cpf, '');
  });

  test('dedup por CPF: ficha manual com o mesmo CPF e reusada, nao nasce ficha fg-<id> duplicada (achado 10)', async () => {
    const cpfDaPessoa = '52998224725';
    const pacManual = db.collection(`workspaces/${WS}/pacientes`).doc();
    await pacManual.set({ id: pacManual.id, cpf: cpfDaPessoa, nome: 'JOAO MANUAL' });

    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(81, { feegowPacienteId: 600, cpf: cpfDaPessoa })],
      uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 1);
    assert.equal((await db.doc(`workspaces/${WS}/pacientes/fg-600`).get()).exists, false);
    const ex = (await db.doc(`workspaces/${WS}/exames/fg-81-2026-08-12`).get()).data();
    assert.equal(ex.pacienteId, pacManual.id);
    // achado MAJOR: dedup por CPF nao pode reescrever a identidade da ficha
    // encontrada (CPF trocado no Feegow apontaria pra pessoa errada).
    const pacDepois = (await pacManual.get()).data();
    assert.equal(pacDepois.nome, 'JOAO MANUAL');
  });

  test('MINOR 1: candidato sem nome cria ficha com nome (campo presente, vazio) — getPacientes usa orderBy(nome)', async () => {
    await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(83, { pacienteNome: '' })],
      uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    const pac = (await db.doc(`workspaces/${WS}/pacientes/fg-983`).get()).data();
    assert.equal(pac.nome, '');
    assert.ok('nome' in pac);
  });

  test('MINOR 2: cpf formatado com pontuacao grava so os digitos', async () => {
    await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(84, { cpf: '111.444.777-35' })],
      uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    const ex = (await db.doc(`workspaces/${WS}/exames/fg-84-2026-08-12`).get()).data();
    assert.equal(ex.cpf, '11144477735');
  });

  test('criadoEm preservado: reimportar nao reescreve a data de criacao original da ficha (achado 12)', async () => {
    const antigo = Timestamp.fromDate(new Date('2020-01-01T00:00:00Z'));
    await db.doc(`workspaces/${WS}/pacientes/fg-501`).set({ id: 'fg-501', criadoEm: antigo });
    await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(82, { feegowPacienteId: 501 })],
      uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    const pac = (await db.doc(`workspaces/${WS}/pacientes/fg-501`).get()).data();
    assert.equal(pac.criadoEm.toMillis(), antigo.toMillis());
  });
});

describe('cpfValido', () => {
  test('CPF valido (digitos verificadores corretos)', () => {
    assert.equal(cpfValido('11144477735'), true);
  });
  test('todos os digitos iguais e invalido mesmo com "checksum por acaso"', () => {
    assert.equal(cpfValido('11111111111'), false);
  });
  test('tamanho errado e invalido', () => {
    assert.equal(cpfValido('123'), false);
  });
  test('digito verificador errado e invalido', () => {
    assert.equal(cpfValido('11144477736'), false);
  });
});

// Sub-plano 5, Task 7 — furo 1 (token do header) + item A (procMap dual-owner) + furo 3 (gate dos GETs).
// Re-revisao (Critical): fallback pro FEEGOW_API_TOKEN do .env removido —
// a migracao roda ANTES do deploy, entao nao ha mais "durante a virada" pra
// cobrir, e o fallback vazava o token real da MedCardio pro dono de
// qualquer workspace sem token proprio na gaveta.
describe('resolverTokenFeegow (furo 1 — token SEMPRE da gaveta, SEM fallback de ambiente)', () => {
  test('privado/feegow.token existe -> usa o da gaveta (nao ha parametro de header: estruturalmente impossivel um x-feegow-token de cliente vencer)', async () => {
    await db.doc(`workspaces/${WS}/privado/feegow`).set({ token: 'token-da-gaveta-123' });
    const tok = await resolverTokenFeegow(db, WS);
    assert.equal(tok, 'token-da-gaveta-123');
  });
  test('sem privado/feegow (ou sem token) -> string vazia (sem fallback nenhum)', async () => {
    const tok = await resolverTokenFeegow(db, 'wsSemGaveta');
    assert.equal(tok, '');
  });
  test('sem wsId -> string vazia', async () => {
    const tok = await resolverTokenFeegow(db, null);
    assert.equal(tok, '');
  });
});

// Task 3 (D4, achado 15): PROC_MAP default morreu — mapa ausente/vazio
// devolve {} (nao mais um fallback chumbado). E {} e o gatilho que route.ts
// usa pra devolver 400 'feegow_sem_procmap' ANTES de montarCandidatos (o
// handler em si nao e importavel por node --test — sem rota Next real neste
// runtime — entao a leitura de route.ts documenta esse contrato: `if
// (Object.keys(procMap).length === 0) return 400 feegow_sem_procmap`; os
// testes abaixo cobrem o lado testavel, resolverProcMap devolvendo {}).
describe('resolverProcMap (Task 3 — sem fallback: mapa ausente/vazio -> {})', () => {
  test('le o mapa do lugar NOVO (integracoes/feegow.procMap)', async () => {
    await db.doc(`workspaces/${WS}/integracoes/feegow`).set({ procMap: { '10': 'eco_tt', '20': 'doppler_carotidas' } });
    const mapa = await resolverProcMap(db, WS);
    assert.deepEqual(mapa, { 10: 'eco_tt', 20: 'doppler_carotidas' });
  });
  test('campo antigo workspaces/{wsId}.feegowProcMap e IGNORADO (mesmo com dado la)', async () => {
    const wsAntigo = 'wsComCampoAntigo';
    await db.doc(`workspaces/${wsAntigo}`).set({ feegowProcMap: { '77': 'eco_te' } });
    // integracoes/feegow nao existe pra este ws -> {} (nao o campo antigo).
    const mapa = await resolverProcMap(db, wsAntigo);
    assert.deepEqual(mapa, {});
  });
  test('integracoes/feegow.procMap vazio ({}) -> {}', async () => {
    await db.doc(`workspaces/${WS}/integracoes/feegow`).set({ procMap: {} });
    const mapa = await resolverProcMap(db, WS);
    assert.deepEqual(mapa, {});
  });
  test('sem wsId -> {}', async () => {
    const mapa = await resolverProcMap(db, null);
    assert.deepEqual(mapa, {});
  });
});

describe('gateAcessoWs (furo 3 — GETs sensiveis exigem wsId + papel)', () => {
  test('sem wsId -> 400', () => {
    const r = gateAcessoWs(null, 'dono');
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  });
  test('com wsId mas sem papel (usuario sem acesso ao local) -> 403', () => {
    const r = gateAcessoWs(WS, null);
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
  });
  test('wsId + papel resolvido -> ok', () => {
    const r = gateAcessoWs(WS, 'recepcao');
    assert.equal(r.ok, true);
  });
});

// Correcao pos-revisao da Task 7 — Critical 1 (gate incondicional, sem lista
// de acoes) + Important 2 (gate de papel roda ANTES de tocar o token).
describe('decidirGetFeegow (Critical 1 + Important 2 — gate roda pra QUALQUER acao, antes do token)', () => {
  test('Critical 1: sem papel -> 403 e resolverToken NUNCA e chamado (a gaveta nao e lida por quem nao tem acesso, seja qual for a acao que viria depois — ex.: "profissionais", que antes escapava da lista ACOES_COM_GATE)', async () => {
    let chamou = false;
    const resolverToken = async () => { chamou = true; return 'tok-nao-deveria-ser-lido'; };
    const r = await decidirGetFeegow(WS, null, resolverToken);
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
    assert.equal(chamou, false, 'resolverToken (leitura de privado/feegow) nao pode rodar sem papel');
  });

  test('Important 2: sem papel -> 403 tanto pra clinica QUE TEM token quanto pra clinica SEM token (o status nao vaza se a clinica tem Feegow configurado)', async () => {
    const comToken = await decidirGetFeegow(WS, null, async () => 'token-existe-nesta-clinica');
    const semToken = await decidirGetFeegow('wsFeegowSemToken', null, async () => '');
    assert.equal(comToken.status, 403);
    assert.equal(semToken.status, 403);
  });

  test('sem wsId -> 400 (validacao antes do papel), resolverToken tambem nao roda', async () => {
    let chamou = false;
    const r = await decidirGetFeegow(null, null, async () => { chamou = true; return 'x'; });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
    assert.equal(chamou, false);
  });

  test('com papel mas sem token cadastrado -> 400 (so agora, com acesso ja confirmado, o token entra em jogo)', async () => {
    const r = await decidirGetFeegow(WS, 'recepcao', async () => '');
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  });

  test('com papel e token -> ok, devolve o token pro chamador despachar a acao', async () => {
    const r = await decidirGetFeegow(WS, 'dono', async () => 'tok-valido-123');
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.token, 'tok-valido-123');
  });
});

// Sub-plano 5, Task 2 (D6) — montarCandidatos desce pra camada testavel.
// Achados fechados aqui: 3 (procedimento fora do mapa descartado sem aviso),
// 4 (erro em UM paciente derrubava o import inteiro em silencio), 9 (dtnasc
// remontada as cegas, sem checar formato), 13 (status/data nunca reconferidos
// — a query confiava cegamente no filtro status_id=4 do Feegow).
describe('normalizarNascimento (achado 9 — dtnasc sem checar formato)', () => {
  test("Feegow manda DD-MM-YYYY -> vira ISO YYYY-MM-DD", () => {
    assert.equal(normalizarNascimento('02-01-1980'), '1980-01-02');
  });
  test('ja em ISO (YYYY-MM-DD) passa direto (guard)', () => {
    assert.equal(normalizarNascimento('1980-01-02'), '1980-01-02');
  });
  test('formato com barra (02/01/1980) nao e reconhecido -> vazio', () => {
    assert.equal(normalizarNascimento('02/01/1980'), '');
  });
  test('lixo -> vazio', () => {
    assert.equal(normalizarNascimento('nao-e-uma-data-9999'), '');
  });
  test('dia impossivel em mes valido (30-02-1980, Fev so tem 28/29) -> vazio, nao rola pro mes seguinte (achado 5)', () => {
    assert.equal(normalizarNascimento('30-02-1980'), '');
  });
  test('mes impossivel (32-13-1980) -> vazio (achado 5 — exemplo original do relato)', () => {
    assert.equal(normalizarNascimento('32-13-1980'), '');
  });
  test('vazio/undefined/null -> vazio', () => {
    assert.equal(normalizarNascimento(''), '');
    assert.equal(normalizarNascimento(undefined), '');
    assert.equal(normalizarNascimento(null), '');
  });
});

function agendamentoFeegow(id, extra = {}) {
  return {
    agendamento_id: id, paciente_id: 100 + id, procedimento_id: 6,
    convenio_id: 1, profissional_id: 50, horario: '10:30:00',
    status_id: 4, ...extra,
  };
}

function pacienteFeegow(extra = {}) {
  return {
    nome: 'Paciente Teste', nascimento: '02-01-1980', sexo: 'Feminino',
    documentos: { cpf: '111.444.777-35' }, telefones: ['91999990000'], ...extra,
  };
}

// fetchImpl stub: sem rede, roteia pela URL como os stubs de integracoes.test.mjs.
// `chamadas` (opcional) recebe cada URL completa chamada — usado pra prender
// a query string de verdade (achado 2 da revisao: o roteamento por includes()
// ignorava a query, entao um &status_id=4 de volta na URL passaria em silencio).
function fetchStubFeegow({ agendamentos = [], pacientesPorId = {}, convenios = [], chamadas } = {}) {
  return async (url) => {
    const u = String(url);
    chamadas?.push(u);
    if (u.includes('/appoints/search')) {
      return { ok: true, status: 200, json: async () => ({ content: agendamentos }) };
    }
    if (u.includes('/insurance/list')) {
      return { ok: true, status: 200, json: async () => ({ content: convenios }) };
    }
    if (u.includes('/patient/search')) {
      const m = u.match(/paciente_id=(\d+)/);
      const id = m ? Number(m[1]) : null;
      const entry = pacientesPorId[id];
      if (entry === 'THROW') throw new Error('rede caiu');
      return { ok: true, status: 200, json: async () => ({ content: entry ?? null }) };
    }
    throw new Error(`endpoint inesperado no stub: ${u}`);
  };
}

describe('montarCandidatos (achados 3, 4, 13, 20 — particiona no laco, sem filtro de status na query)', () => {
  test('status_id 6 (cancelado/desmarcado) NAO vira candidato, entra em cancelados (D3, Task 4 usa)', async () => {
    const r = await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({ agendamentos: [agendamentoFeegow(301, { status_id: 6 })] }),
    });
    assert.deepEqual(r.candidatos, []);
    assert.deepEqual(r.cancelados, ['301']);
    assert.deepEqual(r.falhas, []);
  });

  test('agendamento com data diferente de hoje NAO vira candidato (defesa achado 13)', async () => {
    const r = await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({ agendamentos: [agendamentoFeegow(302, { data: '11-08-2026' })] }),
    });
    assert.deepEqual(r.candidatos, []);
  });

  test('formato de data desconhecido no agendamento NAO derruba o candidato (achado 5-critico: normalizarData vira "" e nao e comparado como dia diferente)', async () => {
    const r = await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({
        agendamentos: [agendamentoFeegow(314, { paciente_id: 509, data: '2026-08-12 10:30:00' })],
        pacientesPorId: { 509: pacienteFeegow({ nome: 'G' }) },
      }),
    });
    assert.equal(r.candidatos.length, 1, 'formato desconhecido nao pode zerar a importacao');
  });

  test('URL de /appoints/search NAO inclui status_id (a API nao filtra mais por status; o laco particiona — achado 2 da revisao)', async () => {
    const chamadas = [];
    await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({ agendamentos: [], chamadas }),
    });
    const urlSala = chamadas.find((u) => u.includes('/appoints/search'));
    assert.ok(urlSala, 'deveria ter chamado /appoints/search');
    assert.ok(!urlSala.includes('status_id'), `URL nao deveria filtrar por status_id: ${urlSala}`);
  });

  test('procedimento_id ausente no agendamento vai pra ignorados como 0, nunca NaN (achado 5)', async () => {
    const r = await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({
        agendamentos: [agendamentoFeegow(315, { procedimento_id: undefined })],
      }),
    });
    assert.deepEqual(r.candidatos, []);
    assert.deepEqual(r.ignorados, [{ procedimentoId: 0, qtd: 1 }]);
  });

  test('procedimento fora do procMap vai pra ignorados com contagem (achado 3)', async () => {
    const r = await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({
        agendamentos: [
          agendamentoFeegow(303, { procedimento_id: 999 }),
          agendamentoFeegow(304, { procedimento_id: 999 }),
        ],
      }),
    });
    assert.deepEqual(r.candidatos, []);
    assert.deepEqual(r.ignorados, [{ procedimentoId: 999, qtd: 2 }]);
  });

  test('patient/search estourando para UM paciente nao derruba os demais — vai pra falhas (achado 4)', async () => {
    const r = await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({
        agendamentos: [
          agendamentoFeegow(305, { paciente_id: 500 }),
          agendamentoFeegow(306, { paciente_id: 501 }),
        ],
        pacientesPorId: { 500: 'THROW', 501: pacienteFeegow({ nome: 'Maria' }) },
      }),
    });
    assert.deepEqual(r.falhas, ['305']);
    assert.equal(r.candidatos.length, 1);
    assert.equal(r.candidatos[0].pacienteNome, 'MARIA');
  });

  test('paciente sem nome (pac.nome ausente) vira falha, nunca candidato sem nome (achado 4)', async () => {
    const r = await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({
        agendamentos: [agendamentoFeegow(307, { paciente_id: 502 })],
        pacientesPorId: { 502: pacienteFeegow({ nome: '' }) },
      }),
    });
    assert.deepEqual(r.falhas, ['307']);
    assert.deepEqual(r.candidatos, []);
  });

  test("sexo 'Masculino'->'M', 'Feminino'->'F', outro->''", async () => {
    const r = await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({
        agendamentos: [
          agendamentoFeegow(308, { paciente_id: 503 }),
          agendamentoFeegow(309, { paciente_id: 504 }),
          agendamentoFeegow(310, { paciente_id: 505 }),
        ],
        pacientesPorId: {
          503: pacienteFeegow({ nome: 'A', sexo: 'Masculino' }),
          504: pacienteFeegow({ nome: 'B', sexo: 'Feminino' }),
          505: pacienteFeegow({ nome: 'C', sexo: 'Indefinido' }),
        },
      }),
    });
    assert.equal(r.candidatos.find((c) => c.pacienteNome === 'A').sexo, 'M');
    assert.equal(r.candidatos.find((c) => c.pacienteNome === 'B').sexo, 'F');
    assert.equal(r.candidatos.find((c) => c.pacienteNome === 'C').sexo, '');
  });

  test('telefone objeto (nao string) e descartado, nao propaga lixo (achado 16-baixo)', async () => {
    const r = await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({
        agendamentos: [agendamentoFeegow(311, { paciente_id: 506 })],
        pacientesPorId: { 506: pacienteFeegow({ nome: 'D', telefones: [{ numero: '123' }] }) },
      }),
    });
    assert.equal(r.candidatos[0].telefone, '');
  });

  test('candidato NAO carrega convenioId/procedimentoId/profissionalId/origem (achado 20 — 4 campos mortos)', async () => {
    const r = await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({
        agendamentos: [agendamentoFeegow(312, { paciente_id: 507 })],
        pacientesPorId: { 507: pacienteFeegow({ nome: 'E' }) },
      }),
    });
    const c = r.candidatos[0];
    assert.equal('convenioId' in c, false);
    assert.equal('procedimentoId' in c, false);
    assert.equal('profissionalId' in c, false);
    assert.equal('origem' in c, false);
  });

  test('candidato sempre sai com dataExame = hoje (nota do controller: gravarImportacao descarta sem isso)', async () => {
    const r = await montarCandidatos({
      token: 'tok', wsId: WS, hoje: '2026-08-12',
      procMap: { 6: 'eco_tt' }, profMap: {},
      fetchImpl: fetchStubFeegow({
        agendamentos: [agendamentoFeegow(313, { paciente_id: 508 })],
        pacientesPorId: { 508: pacienteFeegow({ nome: 'F' }) },
      }),
    });
    assert.equal(r.candidatos[0].dataExame, '2026-08-12');
  });
});

// Task 4 (D3, achado 7a): reconciliacao na importacao — quem o Feegow ja deu
// como cancelado/faltou fecha 'nao-realizado' no LEO, sem apagar (ADR 16/05 #6).
describe('reconciliarCancelados', () => {
  const HOJE = '2026-08-13';
  const ONTEM = '2026-08-12';

  test('exame FEEGOW aguardando de hoje com feegowAppointId em cancelados vira nao-realizado', async () => {
    await db.doc(`workspaces/${WS}/exames/rc1`).set({
      origem: 'FEEGOW', dataExame: HOJE, status: 'aguardando', feegowAppointId: '900',
    });
    const n = await reconciliarCancelados(db, { wsId: WS, hoje: HOJE, cancelados: ['900'] });
    assert.equal(n, 1);
    assert.equal((await db.doc(`workspaces/${WS}/exames/rc1`).get()).data().status, 'nao-realizado');
  });

  test("exame FEEGOW 'andamento' fica INTOCADO (so aguardando)", async () => {
    await db.doc(`workspaces/${WS}/exames/rc2`).set({
      origem: 'FEEGOW', dataExame: HOJE, status: 'andamento', feegowAppointId: '901',
    });
    const n = await reconciliarCancelados(db, { wsId: WS, hoje: HOJE, cancelados: ['901'] });
    assert.equal(n, 0);
    assert.equal((await db.doc(`workspaces/${WS}/exames/rc2`).get()).data().status, 'andamento');
  });

  test('exame MANUAL aguardando fica INTOCADO (so origem FEEGOW)', async () => {
    await db.doc(`workspaces/${WS}/exames/rc3`).set({
      origem: 'MANUAL', dataExame: HOJE, status: 'aguardando', feegowAppointId: '902',
    });
    const n = await reconciliarCancelados(db, { wsId: WS, hoje: HOJE, cancelados: ['902'] });
    assert.equal(n, 0);
    assert.equal((await db.doc(`workspaces/${WS}/exames/rc3`).get()).data().status, 'aguardando');
  });

  test('exame FEEGOW aguardando de ONTEM fica INTOCADO (so dataExame == hoje — Feegow preserva id na remarcacao)', async () => {
    await db.doc(`workspaces/${WS}/exames/rc4`).set({
      origem: 'FEEGOW', dataExame: ONTEM, status: 'aguardando', feegowAppointId: '903',
    });
    const n = await reconciliarCancelados(db, { wsId: WS, hoje: HOJE, cancelados: ['903'] });
    assert.equal(n, 0);
    assert.equal((await db.doc(`workspaces/${WS}/exames/rc4`).get()).data().status, 'aguardando');
  });

  test('cancelados vazio: zero escritas', async () => {
    const n = await reconciliarCancelados(db, { wsId: WS, hoje: HOJE, cancelados: [] });
    assert.equal(n, 0);
  });
});

// Task 5 (D4, achados 5/16): marcarAtendido endurece o case 'atualizar_status'
// da rota — agendamento validado contra exame do local, status sempre 3,
// falha do Feegow gravada (nao vira {ok:true} silencioso).
describe('marcarAtendido', () => {
  test('agendamento duplicado (falta antiga + remarcado): feegowStatusOk vai pro exame MAIS RECENTE', async () => {
    // O caso 66890 real: mesmo feegowAppointId em dois exames de dias diferentes.
    await db.doc(`workspaces/${WS}/exames/fg-66890-2026-05-10`).set({
      feegowAppointId: '66890', dataExame: '2026-05-10', status: 'nao-realizado', origem: 'FEEGOW',
    });
    await db.doc(`workspaces/${WS}/exames/fg-66890-2026-08-19`).set({
      feegowAppointId: '66890', dataExame: '2026-08-19', status: 'emitido', origem: 'FEEGOW',
    });
    const r = await marcarAtendido(db, {
      wsId: WS, agendamentoId: '66890', token: 'tok',
      fetchImpl: async () => ({ ok: true, status: 200 }),
    });
    assert.equal(r.httpStatus, 200);
    const novo = (await db.doc(`workspaces/${WS}/exames/fg-66890-2026-08-19`).get()).data();
    const velho = (await db.doc(`workspaces/${WS}/exames/fg-66890-2026-05-10`).get()).data();
    assert.equal(novo.feegowStatusOk, true, 'o exame recente recebe o campo');
    assert.equal(velho.feegowStatusOk, undefined, 'a falta antiga fica intocada');
  });
  test('agendamento_id sem exame correspondente no wsId -> 404, fetchImpl nao chamado', async () => {
    let chamado = false;
    const r = await marcarAtendido(db, {
      wsId: WS, agendamentoId: '777777', token: 'tok',
      fetchImpl: async () => { chamado = true; return { ok: true, status: 200 }; },
    });
    assert.equal(r.httpStatus, 404);
    assert.equal(r.ok, false);
    assert.equal(chamado, false);
  });

  test('exame existe e Feegow responde 200 -> feegowStatusOk: true, httpStatus 200', async () => {
    await db.doc(`workspaces/${WS}/exames/ma1`).set({ feegowAppointId: '1001' });
    const r = await marcarAtendido(db, {
      wsId: WS, agendamentoId: '1001', token: 'tok',
      fetchImpl: async () => ({ ok: true, status: 200 }),
    });
    assert.equal(r.httpStatus, 200);
    assert.equal(r.ok, true);
    assert.equal((await db.doc(`workspaces/${WS}/exames/ma1`).get()).data().feegowStatusOk, true);
  });

  test('exame existe e Feegow responde 401 -> httpStatus 502, feegowStatusOk: false (emissao nao trava, so o registro)', async () => {
    await db.doc(`workspaces/${WS}/exames/ma2`).set({ feegowAppointId: '1002' });
    const r = await marcarAtendido(db, {
      wsId: WS, agendamentoId: '1002', token: 'tok',
      fetchImpl: async () => ({ ok: false, status: 401 }),
    });
    assert.equal(r.httpStatus, 502);
    assert.equal(r.ok, false);
    assert.equal((await db.doc(`workspaces/${WS}/exames/ma2`).get()).data().feegowStatusOk, false);
  });

  test('status enviado ao Feegow e sempre 3, mesmo que o cliente mande outro (achado 16)', async () => {
    await db.doc(`workspaces/${WS}/exames/ma3`).set({ feegowAppointId: '1003' });
    let corpoEnviado;
    await marcarAtendido(db, {
      wsId: WS, agendamentoId: '1003', token: 'tok',
      fetchImpl: async (_url, opts) => { corpoEnviado = JSON.parse(opts.body); return { ok: true, status: 200 }; },
    });
    assert.equal(corpoEnviado.StatusID, 3);
    assert.equal(corpoEnviado.AgendamentoID, '1003');
  });
});
