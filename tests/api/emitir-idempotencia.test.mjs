// ══════════════════════════════════════════════════════════════════
// S7-T0.3 · Trava anti-cobranca-dupla do /api/emitir (achado E1)
// A transacao de dinheiro do emitir era o unico caminho de billing SEM
// teste de servidor (E9). Aqui ela e testada direto (mesma DI de
// exame.test.mjs: db do emulador, funcao pura de lib).
// O cenario real: a transacao commita em ~1s, o Puppeteer leva 15-60s;
// timeout de rede -> o medico ve "Erro de conexao" com a franquia JA
// debitada -> clica de novo -> 2a franquia. Com a emissaoKey, o retry da
// MESMA tentativa e replay (nao cobra); reemissao deliberada (outra key)
// continua cobrando (politica P3/I2, registrada).
//
// Revisao onda-0 (C1+I1): o estado de idempotencia mora na gaveta
// `workspaces/{ws}/privado/emissao/exames/{exameId}` (deny-by-default pra todo
// cliente) e carrega `pdfPendente` — replay de emissao com PDF pendente manda
// a rota REGERAR em vez de dizer "sucesso" com pdfUrl nulo.
// ══════════════════════════════════════════════════════════════════
import { test, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  emitirComCobranca, emissaoKeyValida, refEmissaoPrivada,
  publicarPdfSeAindaDono, publicarCorrecaoSeAindaEmitido, marcarPdfErroSeAindaDono,
} from '../../src/lib/emitir-admin.ts';

let db;
const CONTA = 'contaE', WS = 'wsE';
const MED = 'uidMedE', MED2 = 'uidMed2E';
const KEY_A = '11111111-2222-4333-8444-555555555555';
const KEY_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: CONTA, ownerUid: MED });
  await db.doc(`contas/${CONTA}`).set({ ownerUid: MED });
});

beforeEach(async () => {
  // E11: tipo:'paid' e o default aqui (conta ja convertida, o caso comum)
  // porque agora `sub.tipo` entra na decisao de giro do ciclo (opcao D) —
  // os testes que precisam de trial setam `tipo: 'trial'` explicitamente.
  await db.doc(`subscriptions/${CONTA}`).set({
    contaId: CONTA, franquiaMensal: 600, franquiaUsada: 0, creditosExtras: 0,
    cicloFim: new Date(Date.now() + 30 * 864e5), tipo: 'paid',
  });
});

let n = 0;
async function seedExame() {
  const id = `exE${++n}_${Date.now()}`;
  await db.doc(`workspaces/${WS}/exames/${id}`).set({
    pacienteNome: 'Paciente E', tipoExame: 'ECOTT', status: 'andamento', medicoUid: MED,
  });
  // Limpa ledger anterior deste exame (id e unico, mas o filtro e por exameId).
  return id;
}

// Round 4 (item 4): exame EMITIDO antes da onda-0 nunca teve gaveta privada
// (o mecanismo nasceu depois) — direto no doc, sem passar por emitir(), pra
// nao criar a gaveta junto. keyNoGuard capturado contra um exame desses e
// null (gaveta ausente), nao string vazia nem undefined por acidente.
async function seedExameEmitidoSemGaveta() {
  const id = `exELegado${++n}_${Date.now()}`;
  await db.doc(`workspaces/${WS}/exames/${id}`).set({
    pacienteNome: 'Paciente Legado', tipoExame: 'ECOTT', status: 'emitido', medicoUid: MED,
    emitidoEm: FieldValue.serverTimestamp(),
  });
  return id;
}

const emitir = (exameId, emissaoKey, extra = {}) => emitirComCobranca(db, {
  wsId: WS, exameId, uid: MED, medicoUid: MED,
  dadosFinais: { pacienteNome: 'Paciente E', tipoExame: 'ECOTT', convenio: 'PART', ...extra },
  emissaoKey,
});

const usada = async () => ((await db.doc(`subscriptions/${CONTA}`).get()).data().franquiaUsada) || 0;
const consumos = async (exameId) =>
  (await db.collection('consumo').where('exameId', '==', exameId).get()).size;
const exameDoc = async (exameId) => (await db.doc(`workspaces/${WS}/exames/${exameId}`).get()).data();
// Gaveta server-only: a fonte da verdade da idempotencia (I1).
const privDoc = async (exameId) => (await refEmissaoPrivada(db, WS, exameId).get()).data();
// O que a rota faz depois de salvar o PDF (baixa a bandeira de pendente).
const pdfSalvo = (exameId) =>
  refEmissaoPrivada(db, WS, exameId).set({ pdfPendente: false }, { merge: true });

describe('emissaoKeyValida (formato UUID — rota devolve 400 no resto)', () => {
  test('UUID v4 passa', () => assert.equal(emissaoKeyValida(KEY_A), true));
  test('lixo nao passa', () => {
    for (const k of ['', 'abc', '11111111-2222-4333-8444-55555555555', 42, null, undefined,
      { a: 1 }, 'x'.repeat(300), '11111111-2222-4333-8444-555555555555 ']) {
      assert.equal(emissaoKeyValida(k), false, `deveria recusar: ${String(k)}`);
    }
  });
});

describe('E1 — replay da MESMA tentativa nao cobra de novo', () => {
  test('(a) mesma key apos emissao commitada: sem 2o debito, sem 2o consumo', async () => {
    const id = await seedExame();
    const r1 = await emitir(id, KEY_A);
    assert.equal(r1.ok, true);
    assert.equal(r1.tipo, 'franquia');
    assert.equal(r1.replay, false);
    assert.equal(await usada(), 1);
    assert.equal(await consumos(id), 1);

    const r2 = await emitir(id, KEY_A);
    assert.equal(r2.ok, true);
    assert.equal(r2.replay, true);
    assert.equal(await usada(), 1, 'franquia debitada 2x');
    assert.equal(await consumos(id), 1, 'ledger com consumo duplicado');
  });

  test('(g) PDF ja salvo: replay devolve o pdfUrl que existe e NAO manda regerar', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ pdfUrl: 'https://x/laudo.pdf' });
    await pdfSalvo(id);
    const r = await emitir(id, KEY_A);
    assert.equal(r.replay, true);
    assert.equal(r.pdfPendente, false, 'replay com PDF pronto nao pode pedir regeracao');
    assert.equal(r.pdfUrl, 'https://x/laudo.pdf');
  });

  test('(f) C1 — PDF pendente: replay manda REGERAR, sem cobrar e sem escrever', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);           // a rota morreu no Puppeteer: pdfPendente fica true
    const antes = await exameDoc(id);
    const r = await emitir(id, KEY_A, { convenio: 'OUTRO' });
    assert.equal(r.ok, true);
    assert.equal(r.replay, true);
    assert.equal(r.pdfPendente, true, 'sem isto a rota devolve "sucesso" com pdfUrl nulo (C1)');
    assert.equal(r.pdfUrl, null);
    assert.equal(await usada(), 1, 'replay cobrou de novo');
    assert.equal(await consumos(id), 1);
    const depois = await exameDoc(id);
    assert.equal(depois.convenio, 'PART', 'replay reescreveu o laudo assinado');
    assert.equal(depois.emitidoEm.toMillis(), antes.emitidoEm.toMillis(), 'emitidoEm remexido');
  });

  test('replay NAO reescreve o laudo assinado (dadosFinais do retry sao ignorados)', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await pdfSalvo(id);
    const antes = await exameDoc(id);
    await emitir(id, KEY_A, { convenio: 'OUTRO' });
    const depois = await exameDoc(id);
    assert.equal(depois.convenio, 'PART');
    assert.equal(depois.emitidoEm.toMillis(), antes.emitidoEm.toMillis(), 'emitidoEm remexido');
  });

  test('(i) a key vai pra gaveta privada NA MESMA transacao do debito', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const priv = await privDoc(id);
    assert.equal(priv.emissaoKey, KEY_A);
    assert.equal(priv.pdfPendente, true, 'emissao nova nasce devendo o PDF');
    assert.equal((await exameDoc(id)).status, 'emitido');
    assert.equal(await usada(), 1);
  });

  test('(j) I1 — o doc do exame (editavel pelo medico-autor) NAO guarda a key', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    assert.equal((await exameDoc(id)).emissaoKeyAtual, undefined,
      'a key voltou pro doc que o cliente escreve pelo SDK');
  });

  // (h) I1 — o medico-autor consegue carimbar campos no PROPRIO exame pelo SDK
  // (firestore.rules:204-208). Se a autoridade do replay fosse o doc do exame,
  // plantar key/bandeira ali daria reemissao (ou regeracao) de graca.
  test('(h) key forjada no doc do exame nao vira replay — cobra como reemissao', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await pdfSalvo(id);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ emissaoKeyAtual: KEY_B });
    const r = await emitir(id, KEY_B);
    assert.equal(r.replay, false, 'key plantada no doc do exame virou replay');
    assert.equal(await usada(), 2);
  });

  test('(h) bandeira pdfPendente forjada no doc do exame nao autoriza regeracao', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ pdfUrl: 'https://x/laudo.pdf' });
    await pdfSalvo(id);                                        // gaveta: pdfPendente = false
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ pdfPendente: true });   // forjado
    const r = await emitir(id, KEY_A);
    assert.equal(r.replay, true);
    assert.equal(r.pdfPendente, false, 'a bandeira do cliente mandou na regeracao');
    assert.equal(r.pdfUrl, 'https://x/laudo.pdf');
    assert.equal(await usada(), 1);
  });

  test('key so vale com o exame EMITIDO (cancelado/reaberto cobra de novo)', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ status: 'andamento' });
    const r = await emitir(id, KEY_A);
    assert.equal(r.replay, false);
    assert.equal(await usada(), 2);
  });
});

describe('E2 — reemissao deliberada continua cobrando', () => {
  test('(b) outra key no exame ja emitido cobra 1 franquia nova', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const r = await emitir(id, KEY_B);
    assert.equal(r.ok, true);
    assert.equal(r.replay, false);
    assert.equal(await usada(), 2);
    assert.equal(await consumos(id), 2);
    const priv = await privDoc(id);
    assert.equal(priv.emissaoKey, KEY_B, 'key da reemissao nao assumiu');
    assert.equal(priv.pdfPendente, true, 'reemissao volta a dever o PDF');
  });
});

// Round 4 (Codex): emissaoKey virou OBRIGATORIA na rota — o ramo "cliente
// legado sem key" que morava aqui (2 testes) foi removido junto com o codigo
// que testava. A rota agora recusa 400 sem key (pin de fonte em
// emitir-pdf-erro.test.mjs); emitirComCobranca confia no tipo (`emissaoKey:
// string`, sem revalidar) — o trust boundary e so a rota.

// ══════════════════════════════════════════════════════════════════
// E3: reemissao e identificacaoAlterada eram COPIADOS do navegador
// (dadosFinais.reemissao / dadosFinais.identificacaoAlterada) pro ledger de
// consumo e pro log — cliente adulterado reemitia trocando nome/CPF e
// logando identificacaoAlterada:false. O servidor tem antes (exameSnap) x
// depois (dadosFinais) na MESMA transacao: derivado aqui, o cliente nao
// controla mais o carimbo.
// ══════════════════════════════════════════════════════════════════
describe('E3 — reemissao e identificacaoAlterada derivados no servidor (nao do cliente)', () => {
  test('reemissao deriva de emitidoEm do exame — cliente nao manda o flag e mesmo assim vem true', async () => {
    const id = await seedExameEmitidoSemGaveta();   // ja emitido (legado, sem gaveta)
    const r = await emitir(id, KEY_A);               // helper NAO manda dadosFinais.reemissao
    assert.equal(r.ok, true);
    assert.equal(r.reemissao, true, 'exame ja tinha emitidoEm — e reemissao de verdade');
    const consumoSnap = await db.collection('consumo').where('exameId', '==', id).get();
    assert.equal(consumoSnap.docs.length, 1);
    assert.equal(consumoSnap.docs[0].data().reemissao, true, 'ledger precisa refletir o servidor, nao o cliente');
  });

  test('identificacaoAlterada deriva comparando antes (exame) x depois (dadosFinais) — cliente mentindo false e ignorado', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);   // 1a emissao: pacienteNome 'Paciente E'
    const r = await emitir(id, KEY_B, { pacienteNome: 'Paciente Trocado', identificacaoAlterada: false });
    assert.equal(r.ok, true);
    assert.equal(r.replay, false);
    assert.equal(r.reemissao, true);
    assert.equal(r.identificacaoAlterada, true, 'cliente mandou false, mas o nome mudou de verdade — servidor nao confia');
  });

  test('primeira emissao (sem emitidoEm antes): reemissao e identificacaoAlterada vem false', async () => {
    const id = await seedExame();
    const r = await emitir(id, KEY_A);
    assert.equal(r.ok, true);
    assert.equal(r.reemissao, false);
    assert.equal(r.identificacaoAlterada, false);
  });

  test('replay (mesma key) devolve false nos dois carimbos — replay nao e um ato novo de emissao', async () => {
    const id = await seedExameEmitidoSemGaveta();
    await emitir(id, KEY_A);   // vira reemissao real, pdfPendente:true
    const r = await emitir(id, KEY_A);   // replay da mesma tentativa
    assert.equal(r.replay, true);
    assert.equal(r.reemissao, false, 'replay nao e um ato novo de emissao');
    assert.equal(r.identificacaoAlterada, false);
  });

  // exame.emitidoEm sozinho nao e fonte segura — o medico-autor pode apagar
  // esse campo pelo SDK (firestore.rules:204-207 nao inclui emitidoEm em
  // `intacto`). Testado direto contra o emulador, escrita fora de
  // emitirComCobranca (simula o cliente adulterado). A fonte que fecha isto
  // e o LEDGER de consumo (privSnap.emissaoKey e redundante — a gaveta e o
  // consumo sao escritos na mesma transacao, entao este cenario, com gaveta
  // E consumo, ja bate contra as duas fontes de qualquer forma).
  test('emitidoEm apagado do doc (cliente adulterado) mas ja existe consumo desta emissao — reemissao deriva true mesmo assim', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);   // 1a emissao real: grava consumo (franquia) + gaveta
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ emitidoEm: FieldValue.delete() });
    const r = await emitir(id, KEY_B);   // key nova = reemissao deliberada, emitidoEm sumiu do doc
    assert.equal(r.ok, true);
    assert.equal(r.replay, false);
    assert.equal(r.reemissao, true,
      'o ledger de consumo (server-only, colecao que o cliente nem enxerga) ainda prova a emissao anterior');
    const consumoSnap = await db.collection('consumo').where('exameId', '==', id).get();
    assert.equal(consumoSnap.docs.length, 2);
    assert.ok(consumoSnap.docs.some((d) => d.data().reemissao === true), 'ledger tem que ter a reemissao true');
  });

  // feegow-admin grava pacienteNome sem trim — sem normalizar os dois lados,
  // toda reemissao de exame importado do Feegow dava falso positivo de troca
  // de identidade so por um espaco a mais. A gaveta guarda o nome ja
  // NORMALIZADO (identidadeAssinada usa a mesma normalizarCampo), entao
  // comparar contra ela em vez do doc nao reabre o falso positivo.
  test('pacienteNome com espaco/caixa diferente (Feegow sem trim) x mesmo nome normalizado — identificacaoAlterada false', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A, { pacienteNome: 'PACIENTE FEEGOW ' });   // grava sem trim (como o Feegow)
    const r = await emitir(id, KEY_B, { pacienteNome: 'Paciente Feegow' });   // mesmo nome, so trim/caixa diferentes
    assert.equal(r.ok, true);
    assert.equal(r.reemissao, true);
    assert.equal(r.identificacaoAlterada, false, 'so trim/caixa diferente — nao e troca de identidade de verdade');
  });

  // ══════════════════════════════════════════════════════════════════
  // Dois cenarios que a derivacao acima ainda deixava passar:
  //  1. exame PRE-onda-0 sem gaveta: autor apagava emitidoEm pelo SDK e
  //     reemitia -> reemissao false (privSnap.emissaoKey tambem nao existia
  //     nesse exame — nasceu depois). Fix: ledger de consumo como fonte
  //     definitiva.
  //  2. identificacaoAlterada contornavel: autor editava a identidade no
  //     DOC pelo SDK antes de reemitir e mandava o MESMO valor adulterado —
  //     o "antes" (o doc) ja estava errado, nunca detectava. Fix: identidade
  //     ASSINADA mora na gaveta server-only (privSnap.identidade).
  // ══════════════════════════════════════════════════════════════════
  test('exame legado SEM gaveta + consumo existente + emitidoEm apagado -> reemissao true (ledger, nao a gaveta)', async () => {
    const id = await seedExameEmitidoSemGaveta();   // emitido, SEM gaveta (legado pre-onda-0)
    await db.collection('consumo').add({ workspaceId: WS, exameId: id, tipo: 'franquia', emitidoEm: FieldValue.serverTimestamp() });
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ emitidoEm: FieldValue.delete() });   // autor apaga pelo SDK
    assert.equal(await privDoc(id), undefined, 'sanity: continua sem gaveta nenhuma');
    const r = await emitir(id, KEY_A);
    assert.equal(r.ok, true);
    assert.equal(r.reemissao, true,
      'consumo existente prova a emissao anterior mesmo sem gaveta e sem emitidoEm');
  });

  test('autor adultera pacienteNome no doc E manda o MESMO valor adulterado — identificacaoAlterada true (comparado contra a gaveta, nao contra o doc)', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);   // 1a emissao real: gaveta grava identidade assinada (pacienteNome 'PACIENTE E')
    // Autor edita o doc pelo SDK ANTES de reemitir (escrita direta simula isso).
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ pacienteNome: 'Paciente Trocado' });
    // Reemite mandando o MESMO valor que acabou de plantar no doc — contra o
    // doc isso pareceria "sem mudanca"; e exatamente o que a gaveta evita.
    const r = await emitir(id, KEY_B, { pacienteNome: 'Paciente Trocado' });
    assert.equal(r.ok, true);
    assert.equal(r.identificacaoAlterada, true,
      'comparado contra a gaveta (o que foi assinado da ultima vez), nao contra o doc ja adulterado');
  });

  test('reemissao sem mudanca nenhuma na identidade — identificacaoAlterada false', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const r = await emitir(id, KEY_B);   // helper manda os MESMOS valores da 1a emissao
    assert.equal(r.ok, true);
    assert.equal(r.reemissao, true);
    assert.equal(r.identificacaoAlterada, false);
  });

  test('exame legado emitido sem gaveta (pre-onda-0): sem identidade assinada anterior, fallback pro doc funciona', async () => {
    const id = await seedExameEmitidoSemGaveta();   // pacienteNome: 'Paciente Legado', emitido, SEM gaveta/consumo
    const r = await emitir(id, KEY_A, { pacienteNome: 'Paciente Trocado' });   // reemissao real, nome muda vs o DOC (unico "antes" disponivel)
    assert.equal(r.ok, true);
    assert.equal(r.reemissao, true);
    assert.equal(r.identificacaoAlterada, true, 'sem gaveta com identidade assinada — fallback contra o doc');
  });
});

// ══════════════════════════════════════════════════════════════════
// E14: dadosFinais e corpo CRU do cliente — antes entrava inteiro no
// update que assina o laudo (so reemissao/identificacaoAlterada eram
// filtrados, M3). Um cliente adulterado plantava pdfUrl/status/emitidoEm/
// acc/cpf/medicoUid direto ali. Whitelist (ADR 2026-08-30 §5): so os 13
// campos que os 3 clientes de producao de fato mandam sobrevivem.
// ══════════════════════════════════════════════════════════════════
describe('E14 — whitelist de dadosFinais (campos forjados nao chegam ao doc)', () => {
  test('pdfUrl/status/emitidoEm/acc/cpf/medicoUid em dadosFinais NAO chegam ao doc', async () => {
    const id = await seedExame();
    const r = await emitir(id, KEY_A, {
      pdfUrl: 'https://forjado.example/laudo.pdf',
      status: 'x',
      emitidoEm: new Date('2020-01-01'),
      acc: 'FORJADO',
      cpf: '00000000000',
      medicoUid: 'outroUid',
      canceladoEm: new Date(),
      pdfHtmlPath: 'lixo',
    });
    assert.equal(r.ok, true);
    const doc = await exameDoc(id);
    assert.equal(doc.pdfUrl, undefined, 'pdfUrl forjado nao pode chegar ao doc');
    assert.equal(doc.status, 'emitido', 'status vem do servidor, nao do cliente');
    assert.equal(doc.acc, undefined, 'acc nao esta na whitelist');
    assert.equal(doc.cpf, undefined, 'cpf nao esta na whitelist');
    assert.equal(doc.medicoUid, MED, 'medicoUid vem de p.medicoUid, nao de dadosFinais');
    assert.equal(doc.canceladoEm, undefined);
    assert.equal(doc.pdfHtmlPath, undefined);
    assert.ok(doc.emitidoEm, 'emitidoEm existe mas e o do serverTimestamp, nao o forjado');
    assert.notEqual(doc.emitidoEm.toMillis(), new Date('2020-01-01').getTime());
  });

  test('os campos legitimos continuam chegando ao doc (payload real dos 3 clientes)', async () => {
    const id = await seedExame();
    const r = await emitir(id, KEY_A, {
      medidas: { ddve: 50 }, achados: 'achado x', conclusoes: 'conclusao x',
      laudoHtml: '<p>a</p>', laudoTextoHtml: '<p>b</p>', incluirImagensNoPdf: false,
      pacienteDtnasc: '1980-01-02', dataExame: '2026-08-30', solicitante: 'DR FULANO', sexo: 'F',
    });
    assert.equal(r.ok, true);
    const doc = await exameDoc(id);
    assert.deepEqual(doc.medidas, { ddve: 50 });
    assert.equal(doc.achados, 'achado x');
    assert.equal(doc.conclusoes, 'conclusao x');
    assert.equal(doc.laudoHtml, '<p>a</p>');
    assert.equal(doc.laudoTextoHtml, '<p>b</p>');
    assert.equal(doc.incluirImagensNoPdf, false);
    assert.equal(doc.pacienteDtnasc, '1980-01-02');
    assert.equal(doc.dataExame, '2026-08-30');
    assert.equal(doc.solicitante, 'DR FULANO');
    assert.equal(doc.sexo, 'F');
  });
});

describe('E8 — laudo cancelado recusa emissao (nao revive cobrando)', () => {
  test('status cancelado: recusa sem cobrar, sem tocar consumo/gaveta privada', async () => {
    const id = await seedExame();
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ status: 'cancelado' });
    const r = await emitir(id, KEY_A);
    assert.deepEqual(r, { ok: false, motivo: 'cancelado' });
    assert.equal(await usada(), 0);
    assert.equal(await consumos(id), 0);
    assert.equal(await privDoc(id), undefined, 'nada gravado na gaveta privada');
  });

  test('guard vem ANTES do replay: key de uma emissao cancelada depois nao vira "sucesso"', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);                     // emite e cobra 1
    assert.equal(await usada(), 1);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ status: 'cancelado' });
    const r = await emitir(id, KEY_A);            // mesma key, exame agora cancelado
    assert.deepEqual(r, { ok: false, motivo: 'cancelado' },
      'replay nao pode devolver sucesso pra um exame que foi cancelado depois');
    assert.equal(await usada(), 1, 'nao cobrou de novo');
  });
});

describe('billing e autoria seguem intactos (E9: primeira rede do caminho de dinheiro)', () => {
  test('exame de outro medico → exame_de_outro_medico, sem cobrar', async () => {
    const id = await seedExame();
    const r = await emitirComCobranca(db, {
      wsId: WS, exameId: id, uid: MED2, medicoUid: MED2, dadosFinais: {}, emissaoKey: KEY_A,
    });
    assert.deepEqual(r, { ok: false, motivo: 'exame_de_outro_medico' });
    assert.equal(await usada(), 0);
  });
  test('exame inexistente → nao_encontrado', async () => {
    const r = await emitir('naoExisteE', KEY_A);
    assert.equal(r.motivo, 'nao_encontrado');
  });
  test('franquia esgotada com creditos → cobra credito', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({ franquiaUsada: 600, creditosExtras: 2 });
    const id = await seedExame();
    const r = await emitir(id, KEY_A);
    assert.equal(r.tipo, 'creditos');
    assert.equal((await db.doc(`subscriptions/${CONTA}`).get()).data().creditosExtras, 1);
  });
  test('franquia esgotada e sem credito → sem_saldo, sem debito', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({ franquiaUsada: 600, creditosExtras: 0 });
    const id = await seedExame();
    assert.equal((await emitir(id, KEY_A)).motivo, 'sem_saldo');
    assert.equal(await consumos(id), 0);
  });
  // E11 opcao D: trial vencido NAO gira (ADR §3 "Contas em trial" — girar
  // sem filtro vira trial eterno). Continua caindo no braco 'expirado' de
  // sempre. (Conta paid vencida agora RENOVA em vez disso — describe abaixo.)
  test('trial vencido sem credito → expirado (nao renova)', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({ cicloFim: new Date(Date.now() - 864e5), tipo: 'trial' });
    const id = await seedExame();
    const r = await emitir(id, KEY_A);
    assert.equal(r.motivo, 'expirado');
    assert.equal(await usada(), 0);
  });
  test('workspace sem assinatura → sem_plano', async () => {
    await db.doc('workspaces/wsSemPlanoE').set({ contaId: 'contaSemPlanoE' });
    await db.doc('workspaces/wsSemPlanoE/exames/e1').set({ status: 'andamento', medicoUid: MED });
    const r = await emitirComCobranca(db, {
      wsId: 'wsSemPlanoE', exameId: 'e1', uid: MED, medicoUid: MED, dadosFinais: {}, emissaoKey: KEY_A,
    });
    assert.equal(r.motivo, 'sem_plano');
  });
});

// ══════════════════════════════════════════════════════════════════
// E11 — renovacao do ciclo de franquia, OPCAO D (docs/decisoes/
// 2026-08-30-secao7-renovacao-ciclo.md, decisao do Sergio 30/08).
// Sem cron: o proprio emitirComCobranca gira o ciclo DENTRO da transacao de
// emissao quando acha a assinatura vencida e elegivel (paid, franquiaMensal
// > 0 — o marcador de "nao suspensa" que existe hoje, ver ADR §1b). Testes
// diretos contra o emulador, mesmo padrao do resto do arquivo.
// ══════════════════════════════════════════════════════════════════
describe('E11 — renovacao do ciclo (opcao D, giro dentro da transacao)', () => {
  test('(a) ciclo vencido + conta ativa: renova, franquiaUsada reinicia (1 apos esta emissao), cicloFim rola +30d', async () => {
    const cicloVencido = new Date(Date.now() - 5 * 864e5);
    await db.doc(`subscriptions/${CONTA}`).update({ cicloFim: cicloVencido, franquiaUsada: 599 });
    const id = await seedExame();
    const r = await emitir(id, KEY_A);
    assert.equal(r.ok, true);
    assert.equal(r.tipo, 'franquia');
    assert.equal(r.girou, true);
    assert.equal(await usada(), 1, 'franquiaUsada devia reiniciar (0) e so contar esta emissao');
    const novoFim = (await db.doc(`subscriptions/${CONTA}`).get()).data().cicloFim.toDate();
    assert.ok(novoFim.getTime() > Date.now(), 'cicloFim novo tem que estar no futuro');
    assert.ok(
      Math.abs(novoFim.getTime() - (cicloVencido.getTime() + 30 * 864e5)) < 1000,
      'giro de 1 ciclo: +30d a partir do cicloFim ANTIGO, nao de "agora"',
    );
  });

  test('(b) gap de 3 ciclos parado: cicloFim rola em passos de 30d ate o futuro (loop, nao so +30d uma vez)', async () => {
    const cicloVencidoHaMuito = new Date(Date.now() - 95 * 864e5); // ~3 ciclos sem ninguem emitir
    await db.doc(`subscriptions/${CONTA}`).update({ cicloFim: cicloVencidoHaMuito });
    const id = await seedExame();
    const r = await emitir(id, KEY_A);
    assert.equal(r.ok, true);
    assert.equal(r.girou, true);
    const novoFim = (await db.doc(`subscriptions/${CONTA}`).get()).data().cicloFim.toDate();
    assert.ok(novoFim.getTime() > Date.now(), 'um unico +30d nao bastaria pra um gap de ~3 ciclos');
    assert.ok(novoFim.getTime() - Date.now() < 30 * 864e5, 'nao pode pular alem do proximo ciclo futuro');
  });

  test('(d) suspensa (franquiaMensal=0) com ciclo vencido: nao gira, recusa expirado', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({ cicloFim: new Date(Date.now() - 864e5), franquiaMensal: 0 });
    const id = await seedExame();
    const r = await emitir(id, KEY_A);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'expirado');
    assert.equal(await usada(), 0);
  });

  test('(e) creditos extras nao zeram na renovacao do ciclo', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({ cicloFim: new Date(Date.now() - 864e5), creditosExtras: 7 });
    const id = await seedExame();
    const r = await emitir(id, KEY_A);
    assert.equal(r.ok, true);
    assert.equal(r.girou, true);
    assert.equal(r.tipo, 'franquia', 'giro da franquia nova nao consome credito');
    assert.equal((await db.doc(`subscriptions/${CONTA}`).get()).data().creditosExtras, 7, 'creditos intactos');
  });

  test('(f) ciclo vigente: nao gira, franquiaUsada acumula normal', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({ franquiaUsada: 50 }); // cicloFim do beforeEach ja e futuro
    const id = await seedExame();
    const r = await emitir(id, KEY_A);
    assert.equal(r.ok, true);
    assert.equal(r.girou, false);
    assert.equal(await usada(), 51);
  });

  test('emitir 2x seguidas apos vencer: gira so na 1a (a 2a ja ve cicloFim futuro)', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({ cicloFim: new Date(Date.now() - 864e5) });
    const id1 = await seedExame();
    const r1 = await emitir(id1, KEY_A);
    assert.equal(r1.girou, true);
    const id2 = await seedExame();
    const r2 = await emitir(id2, KEY_B);
    assert.equal(r2.girou, false, 'cicloFim ja rolou pro futuro na 1a emissao');
    assert.equal(await usada(), 2);
  });

  // Reviewer follow-up (Minor-5, item 4a): replay retorna ANTES de sequer
  // ler os campos da assinatura (guard da TRAVA ANTI-COBRANCA-DUPLA, mais
  // acima na funcao) — vencer o ciclo DEPOIS que a 1a emissao ja commitou
  // nao pode fazer o replay da MESMA tentativa girar nada.
  test('replay (mesma key) sobre ciclo que venceu DEPOIS da 1a emissao: nao gira, nao mexe no cicloFim', async () => {
    const id = await seedExame();
    const r1 = await emitir(id, KEY_A);   // ciclo vigente (beforeEach) — nao gira
    assert.equal(r1.girou, false);
    const cicloVencido = new Date(Date.now() - 864e5);
    await db.doc(`subscriptions/${CONTA}`).update({ cicloFim: cicloVencido });   // vence DEPOIS
    const r2 = await emitir(id, KEY_A);   // mesma key = replay
    assert.equal(r2.replay, true);
    assert.equal(r2.girou, false, 'replay nao e um ato novo de emissao — nao pode girar o ciclo');
    const cicloAtual = (await db.doc(`subscriptions/${CONTA}`).get()).data().cicloFim.toDate();
    assert.equal(cicloAtual.getTime(), cicloVencido.getTime(), 'replay nao pode ter mexido no cicloFim');
    assert.equal(await usada(), 1, 'replay nao cobra de novo');
  });

  // Reviewer follow-up (Minor-5, item 4b): conta paga LEGADA, criada antes
  // do campo `tipo` existir na assinatura — `sub.tipo` vem `undefined`, nao
  // `'paid'`. O predicado do giro e `sub.tipo !== 'trial'`: undefined passa
  // nesse teste (so trial fica de fora), entao uma conta legada tambem gira.
  test('tipo undefined (conta paga legada, sem o campo tipo): gira normal — so trial e que NAO gira', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({
      tipo: FieldValue.delete(), cicloFim: new Date(Date.now() - 864e5),
    });
    const subAntes = (await db.doc(`subscriptions/${CONTA}`).get()).data();
    assert.equal(subAntes.tipo, undefined, 'sanity: campo tipo realmente ausente');
    const id = await seedExame();
    const r = await emitir(id, KEY_A);
    assert.equal(r.ok, true);
    assert.equal(r.girou, true, 'legado sem campo tipo nao pode ficar preso pra sempre sem girar');
    assert.equal(await usada(), 1);
  });
});

// ══════════════════════════════════════════════════════════════════
// Fix-wave round 2 (Codex, achado C4/check-then-write): a cerca pre-upload
// (podePublicar em route.ts) sozinha e check-then-write — entre ela e o
// `update({pdfUrl})` cabiam segundos de cancelamento/transferencia/reemissao.
// E baixar pdfPendente como escrita SEPARADA do pdfUrl deixava o PERDEDOR de
// uma corrida apagar a bandeira do VENCEDOR (pdfPendente e por EXAME, nao
// por tentativa). Testado direto contra o emulador (real, nao fake) — as
// duas funcoes tomam `db` como as outras deste arquivo.
// ══════════════════════════════════════════════════════════════════
describe('publicarPdfSeAindaDono — ponteiro + bandeira atomicos (round 2)', () => {
  test('publica o pdfUrl e baixa pdfPendente no MESMO commit quando ninguem mexeu', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);   // pdfPendente:true na gaveta
    const ok = await publicarPdfSeAindaDono(db, { wsId: WS, exameId: id, pdfUrl: 'https://x/novo.pdf', emissaoKey: KEY_A, declaraSnapshotSufixado: true });
    assert.equal(ok, true);
    assert.equal((await exameDoc(id)).pdfUrl, 'https://x/novo.pdf');
    assert.equal((await privDoc(id)).pdfPendente, false);
    // Round 6 (Codex Critical, item 1): snapshotSufixado grava no MESMO
    // commit — declara pra lerSnapshotHtml que o snapshot desta emissao (a
    // rota salva logo em seguida) mora SO no path sufixado, sem fallback.
    assert.equal((await privDoc(id)).snapshotSufixado, true);
  });

  test('declaraSnapshotSufixado:false (ou omitido) nao grava a flag mesmo publicando o pdfUrl', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const ok = await publicarPdfSeAindaDono(db, { wsId: WS, exameId: id, pdfUrl: 'https://x/anexo.pdf', emissaoKey: KEY_A, declaraSnapshotSufixado: false });
    assert.equal(ok, true);
    assert.equal((await exameDoc(id)).pdfUrl, 'https://x/anexo.pdf');
    assert.equal((await privDoc(id)).snapshotSufixado, undefined,
      'round 7 (Ruflo item 1): contrato explicito — sem a flag, nao mente pra lerSnapshotHtml');
  });

  test('status virou cancelado entre a cerca e a transacao → false, doc intacto, pdfPendente continua true', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ status: 'cancelado' });
    const ok = await publicarPdfSeAindaDono(db, { wsId: WS, exameId: id, pdfUrl: 'https://x/orfao.pdf', emissaoKey: KEY_A, declaraSnapshotSufixado: true });
    assert.equal(ok, false);
    assert.equal((await exameDoc(id)).pdfUrl, undefined, 'doc intacto — nao publicou por cima do cancelado');
    assert.equal((await privDoc(id)).pdfPendente, true, 'bandeira nao foi mexida por quem perdeu');
  });

  test('key trocada (reemissao nova comecou) → false, nao apaga a bandeira da emissao vencedora', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await pdfSalvo(id);              // emissao A "terminou": pdfPendente:false
    await emitir(id, KEY_B);         // reemissao nova: key muda, pdfPendente volta a true
    const ok = await publicarPdfSeAindaDono(db, { wsId: WS, exameId: id, pdfUrl: 'https://x/velho.pdf', emissaoKey: KEY_A, declaraSnapshotSufixado: true });
    assert.equal(ok, false, 'a tentativa A perdeu — a gaveta agora e da B');
    assert.equal((await privDoc(id)).emissaoKey, KEY_B);
    assert.equal((await privDoc(id)).pdfPendente, true, 'C4 fechado: bandeira da B nao foi apagada pela A perdedora');
  });

  test('exame nao existe → false, sem excecao', async () => {
    const ok = await publicarPdfSeAindaDono(db, { wsId: WS, exameId: 'naoExisteE2', pdfUrl: 'https://x/x.pdf', emissaoKey: KEY_A, declaraSnapshotSufixado: true });
    assert.equal(ok, false);
  });
});

describe('publicarCorrecaoSeAindaEmitido — ponteiro condicional a emitidoEm, bandeira condicional a key (round 2)', () => {
  test('emitidoEm e key intactos → publica ponteiro e baixa pdfPendente', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const antes = await exameDoc(id);
    const ok = await publicarCorrecaoSeAindaEmitido(db, {
      wsId: WS, exameId: id, pdfUrl: 'https://x/certo.pdf', emitidoEmAntes: antes.emitidoEm, keyNoGuard: KEY_A,
    });
    assert.equal(ok, true);
    assert.equal((await exameDoc(id)).pdfUrl, 'https://x/certo.pdf');
    assert.equal((await privDoc(id)).pdfPendente, false);
  });

  test('reemitiu durante a regeracao (emitidoEm mudou) → false, doc intacto', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const antes = await exameDoc(id);
    await emitir(id, KEY_B);   // reemissao real: emitidoEm muda de novo
    const ok = await publicarCorrecaoSeAindaEmitido(db, {
      wsId: WS, exameId: id, pdfUrl: 'https://x/velho-corrigido.pdf', emitidoEmAntes: antes.emitidoEm, keyNoGuard: KEY_A,
    });
    assert.equal(ok, false);
    assert.notEqual((await exameDoc(id)).pdfUrl, 'https://x/velho-corrigido.pdf');
  });

  test('status virou cancelado durante a regeracao → false', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const antes = await exameDoc(id);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ status: 'cancelado' });
    const ok = await publicarCorrecaoSeAindaEmitido(db, {
      wsId: WS, exameId: id, pdfUrl: 'https://x/x.pdf', emitidoEmAntes: antes.emitidoEm, keyNoGuard: KEY_A,
    });
    assert.equal(ok, false);
  });

  test('emitidoEm intacto mas a gaveta trocou de key: publica o ponteiro mas NAO baixa pdfPendente (C4 do lado da correcao)', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const antes = await exameDoc(id);
    // Cenario sintetico (escrita direta, nao via emitirComCobranca): prova o
    // CONTRATO da funcao — as 2 condicoes (ponteiro por emitidoEm, bandeira
    // por key) sao independentes. Uma reemissao ORGANICA tambem mudaria
    // emitidoEm (o teste acima ja cobre isso); este cobre a trava da
    // bandeira isoladamente.
    await refEmissaoPrivada(db, WS, id).set({ emissaoKey: KEY_B, pdfPendente: true }, { merge: true });
    const ok = await publicarCorrecaoSeAindaEmitido(db, {
      wsId: WS, exameId: id, pdfUrl: 'https://x/corrigido.pdf', emitidoEmAntes: antes.emitidoEm, keyNoGuard: KEY_A,
    });
    assert.equal(ok, true, 'emitidoEm bateu — o ponteiro publica');
    assert.equal((await exameDoc(id)).pdfUrl, 'https://x/corrigido.pdf');
    assert.equal((await privDoc(id)).pdfPendente, true, 'bandeira da emissao B NAO foi apagada pela correcao');
    assert.equal((await privDoc(id)).emissaoKey, KEY_B, 'key da B intacta');
  });
});

// ══════════════════════════════════════════════════════════════════
// Fix-wave round 3 (Codex Important, item 3): os catches de Puppeteer/upload
// marcavam pdfErro por check-then-update FORA de transacao — a mesma janela
// das outras escritas desta onda: o catch da tentativa A podia carimbar
// pdfErro no exame que a tentativa B acabou de reemitir com sucesso. Testado
// direto contra o emulador (real, mesmo padrao das describes acima).
// ══════════════════════════════════════════════════════════════════
describe('marcarPdfErroSeAindaDono — marca condicional (round 3)', () => {
  test('marca pdfErro quando ainda e dono (status emitido + key bate)', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const ok = await marcarPdfErroSeAindaDono(db, { wsId: WS, exameId: id, emissaoKey: KEY_A });
    assert.equal(ok, true);
    assert.equal((await exameDoc(id)).pdfErro, 'erro_pdf');
  });

  test('key mudou (reemissao em curso) → false, nao marca o exame da emissao vencedora', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await pdfSalvo(id);
    await emitir(id, KEY_B);   // reemissao real: gaveta agora e da B
    const ok = await marcarPdfErroSeAindaDono(db, { wsId: WS, exameId: id, emissaoKey: KEY_A });
    assert.equal(ok, false, 'a tentativa A perdeu — a marca de erro nao e dela');
    assert.equal((await exameDoc(id)).pdfErro, undefined, 'exame da emissao B nao pode herdar erro da A');
  });

  test('status cancelado → false, doc intacto', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ status: 'cancelado' });
    const ok = await marcarPdfErroSeAindaDono(db, { wsId: WS, exameId: id, emissaoKey: KEY_A });
    assert.equal(ok, false);
    assert.equal((await exameDoc(id)).pdfErro, undefined);
  });

});

// ══════════════════════════════════════════════════════════════════
// Fix-wave round 6 (Codex Critical, item 1): `declaraSnapshotSufixado` grava
// `snapshotSufixado:true` no MESMO commit, mas SO quando o caller vai mesmo
// tentar salvar um snapshot sufixado logo depois — no /api/emitir isso e so
// o braco pdfHtml (anexo nunca tem HTML; o catch de corrigir-laudo nunca
// regrava snapshot). Sem a flag, declarar "sufixado" mentiria pra
// lerSnapshotHtml num exame que na verdade nao ganhou snapshot novo.
// ══════════════════════════════════════════════════════════════════
describe('marcarPdfErroSeAindaDono — declaraSnapshotSufixado (round 6)', () => {
  test('declaraSnapshotSufixado:true grava a flag no MESMO commit que marca pdfErro', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const ok = await marcarPdfErroSeAindaDono(db, { wsId: WS, exameId: id, emissaoKey: KEY_A, declaraSnapshotSufixado: true });
    assert.equal(ok, true);
    assert.equal((await exameDoc(id)).pdfErro, 'erro_pdf');
    assert.equal((await privDoc(id)).snapshotSufixado, true);
  });

  test('sem declaraSnapshotSufixado (omitido): pdfErro marca, mas a flag NAO e gravada', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    const ok = await marcarPdfErroSeAindaDono(db, { wsId: WS, exameId: id, emissaoKey: KEY_A });
    assert.equal(ok, true);
    assert.equal((await exameDoc(id)).pdfErro, 'erro_pdf');
    assert.equal((await privDoc(id)).snapshotSufixado, undefined,
      'anexo (sem HTML) e o catch de corrigir-laudo (nunca regrava snapshot) NAO podem declarar a flag');
  });

  test('perdeu a corrida (false): nao marca pdfErro NEM a flag, mesmo pedindo declaraSnapshotSufixado', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);
    await pdfSalvo(id);
    await emitir(id, KEY_B);   // reemissao real: gaveta agora e da B
    const ok = await marcarPdfErroSeAindaDono(db, { wsId: WS, exameId: id, emissaoKey: KEY_A, declaraSnapshotSufixado: true });
    assert.equal(ok, false);
    assert.equal((await privDoc(id)).snapshotSufixado, undefined, 'A perdeu — nao pode declarar nada na gaveta da B');
    assert.equal((await privDoc(id)).emissaoKey, KEY_B, 'gaveta continua da B, intacta');
  });
});

// ══════════════════════════════════════════════════════════════════
// Fix-wave round 4 (Codex Important, item 4): a comparacao antiga de
// marcarPdfErroSeAindaDono (`if (p.emissaoKey && ...)`) PULAVA a checagem
// inteira quando p.emissaoKey era null/undefined — uma correcao iniciada com
// keyNoGuard null (gaveta ainda ausente, exame emitido ANTES da onda-0)
// carimbava pdfErro no exame mesmo que uma emissao NOVA (com key) tivesse
// vencido a corrida no meio do caminho. Agora null e comparado como
// qualquer outro valor (`?? null` dos 2 lados). publicarCorrecaoSeAindaEmitido
// ja fazia a comparacao certa (verificado abaixo, sem mudanca de codigo la).
// ══════════════════════════════════════════════════════════════════
describe('marcarPdfErroSeAindaDono — round 4: null e um valor comparavel (keyNoGuard)', () => {
  test('exame pre-onda-0 (gaveta nunca existiu): keyNoGuard null e gaveta ainda ausente → dono confirma, marca', async () => {
    const id = await seedExameEmitidoSemGaveta();
    assert.equal(await privDoc(id), undefined, 'sanity: sem gaveta mesmo');
    const ok = await marcarPdfErroSeAindaDono(db, { wsId: WS, exameId: id, emissaoKey: null });
    assert.equal(ok, true);
    assert.equal((await exameDoc(id)).pdfErro, 'erro_pdf');
  });

  test('gaveta GANHOU key depois do guard (null → key nova): bloqueia, nao marca no exame da emissao vencedora', async () => {
    const id = await seedExameEmitidoSemGaveta();
    // Simula: a correcao capturou keyNoGuard=null (gaveta ainda nao existia
    // quando ela comecou); ENQUANTO isso uma emissao nova comecou e criou a
    // gaveta com key.
    await refEmissaoPrivada(db, WS, id).set({ emissaoKey: KEY_A, pdfPendente: true });
    const ok = await marcarPdfErroSeAindaDono(db, { wsId: WS, exameId: id, emissaoKey: null });
    assert.equal(ok, false,
      'antes (`if (p.emissaoKey && ...)`) isto pulava a checagem e marcava mesmo assim — achado Codex Important round 4');
    assert.equal((await exameDoc(id)).pdfErro, undefined, 'exame da emissao vencedora nao pode herdar erro de uma correcao velha');
  });
});

describe('publicarCorrecaoSeAindaEmitido — round 4: ja era null-safe, confirma os mesmos 2 casos', () => {
  test('exame pre-onda-0 (gaveta nunca existiu): keyNoGuard null e gaveta ainda ausente → publica ponteiro E baixa a bandeira (cria a gaveta)', async () => {
    const id = await seedExameEmitidoSemGaveta();
    const antes = await exameDoc(id);
    const ok = await publicarCorrecaoSeAindaEmitido(db, {
      wsId: WS, exameId: id, pdfUrl: 'https://x/legado-corrigido.pdf', emitidoEmAntes: antes.emitidoEm, keyNoGuard: null,
    });
    assert.equal(ok, true);
    assert.equal((await exameDoc(id)).pdfUrl, 'https://x/legado-corrigido.pdf');
    assert.equal((await privDoc(id)).pdfPendente, false);
  });

  test('gaveta GANHOU key durante a correcao (null → key nova, emitidoEm intacto): publica o ponteiro mas NAO baixa a bandeira da emissao nova', async () => {
    const id = await seedExameEmitidoSemGaveta();
    const antes = await exameDoc(id);
    // Escrita direta (nao via emitirComCobranca) pra isolar a trava da
    // bandeira sem tambem mexer em emitidoEm — uma reemissao ORGANICA real
    // ja e coberta pelo teste equivalente do round 2/3 acima.
    await refEmissaoPrivada(db, WS, id).set({ emissaoKey: KEY_A, pdfPendente: true });
    const ok = await publicarCorrecaoSeAindaEmitido(db, {
      wsId: WS, exameId: id, pdfUrl: 'https://x/corrigido.pdf', emitidoEmAntes: antes.emitidoEm, keyNoGuard: null,
    });
    assert.equal(ok, true, 'emitidoEm nao mudou — o ponteiro publica');
    assert.equal((await privDoc(id)).pdfPendente, true, 'bandeira da emissao nova (key A) NAO foi apagada');
    assert.equal((await privDoc(id)).emissaoKey, KEY_A, 'key da emissao nova intacta');
  });
});
