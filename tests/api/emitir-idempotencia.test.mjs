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
  await db.doc(`subscriptions/${CONTA}`).set({
    contaId: CONTA, franquiaMensal: 600, franquiaUsada: 0, creditosExtras: 0,
    cicloFim: new Date(Date.now() + 30 * 864e5),
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
// Task 7 (E3): reemissao e identificacaoAlterada eram COPIADOS do navegador
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

  // Revisao (achado Important): exame.emitidoEm sozinho nao e fonte segura —
  // o medico-autor pode apagar esse campo pelo SDK (firestore.rules:204-207
  // nao inclui emitidoEm em `intacto`). Testado direto contra o emulador,
  // escrita fora de emitirComCobranca (simula o cliente adulterado).
  test('emitidoEm apagado do doc (cliente adulterado) mas a gaveta privada ainda tem key — reemissao deriva true mesmo assim', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A);   // 1a emissao real: privDoc ganha emissaoKey=KEY_A
    await db.doc(`workspaces/${WS}/exames/${id}`).update({ emitidoEm: FieldValue.delete() });
    const r = await emitir(id, KEY_B);   // key nova = reemissao deliberada, emitidoEm sumiu do doc
    assert.equal(r.ok, true);
    assert.equal(r.replay, false);
    assert.equal(r.reemissao, true,
      'privSnap.emissaoKey (server-only) ainda prova que ja foi emitido antes — apagar emitidoEm nao engana mais');
    const consumoSnap = await db.collection('consumo').where('exameId', '==', id).get();
    assert.equal(consumoSnap.docs.length, 2);
    assert.ok(consumoSnap.docs.some((d) => d.data().reemissao === true), 'ledger tem que ter a reemissao true');
  });

  // Revisao (Minor): feegow-admin grava pacienteNome sem trim — sem
  // normalizar os dois lados, toda reemissao de exame importado do Feegow
  // dava falso positivo de troca de identidade so por um espaco a mais.
  test('pacienteNome com espaco/caixa diferente (Feegow sem trim) x mesmo nome normalizado — identificacaoAlterada false', async () => {
    const id = await seedExame();
    await emitir(id, KEY_A, { pacienteNome: 'PACIENTE FEEGOW ' });   // grava sem trim (como o Feegow)
    const r = await emitir(id, KEY_B, { pacienteNome: 'Paciente Feegow' });   // mesmo nome, so trim/caixa diferentes
    assert.equal(r.ok, true);
    assert.equal(r.reemissao, true);
    assert.equal(r.identificacaoAlterada, false, 'so trim/caixa diferente — nao e troca de identidade de verdade');
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
  test('ciclo vencido sem credito → expirado', async () => {
    await db.doc(`subscriptions/${CONTA}`).update({ cicloFim: new Date(Date.now() - 864e5) });
    const id = await seedExame();
    assert.equal((await emitir(id, KEY_A)).motivo, 'expirado');
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
