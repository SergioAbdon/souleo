// ══════════════════════════════════════════════════════════════════
// LEO · Emissao server-side — dono do slot de emissao: cobranca + ponteiro
// do PDF + bandeiras da gaveta (emissaoKey, pdfPendente, snapshotSufixado)
// (S7-T0.3)
// Extraida da /api/emitir para ganhar teste (achado E9: o caminho de
// dinheiro era o unico sem rede de servidor). Mesmo corpo de antes, mais
// a TRAVA ANTI-COBRANCA-DUPLA (E1).
//
// Por que a trava: a transacao commita em ~1s, o Puppeteer leva 15-60s
// dentro do mesmo maxDuration. Timeout de rede/aba fechada = o medico ve
// "Erro de conexao" com a franquia JA debitada; clica de novo e paga 2x.
// O cliente manda uma `emissaoKey` (UUID) por TENTATIVA — o retry da mesma
// tentativa reusa a key, uma reemissao deliberada gera key nova.
// Aqui dentro: key igual a do exame JA emitido = replay (devolve o que
// existe, nao cobra, nao reescreve o laudo assinado); key diferente =
// reemissao de verdade e COBRA (politica P3/I2, registrada).
//
// ROUND 4 (Codex, 30/08): emissaoKey e OBRIGATORIA — a rota recusa 400 sem
// ela. Clientes de producao mandam desde a onda 0 (laudo/[id], laudo-texto/
// [id], AnexarPdfModal); "legado sem key" nunca foi dado do mundo real, so
// janela aberta enquanto a API aceitasse. O ramo condicional morreu daqui
// (Ponytail R3 aposentado): a gaveta e gravada SEMPRE.
//
// REVISAO ONDA-0 (C1+I1, 29/08): a key NAO mora mais no doc do exame.
//  - C1: o replay devolvia `pdfUrl: null` quando a 1a chamada morreu no
//    Puppeteer DEPOIS da transacao — o retry dizia "sucesso" e o laudo
//    ficava emitido/cobrado e sem PDF assinado. Agora a transacao marca
//    `pdfPendente` e o replay de uma emissao com PDF pendente devolve
//    `pdfPendente: true` para a rota REGERAR o PDF.
//  - I1: `emissaoKeyAtual` ficava no doc do exame, que o medico-autor
//    atualiza pelo SDK (firestore.rules:204-208) — com "regera no replay"
//    isso viraria reemissao de graca com key forjada. O estado de
//    idempotencia foi movido para a gaveta `workspaces/{ws}/privado/**`
//    (deny-by-default para TODO cliente, so Admin SDK escreve). O direito
//    de regerar deriva de estado que so o servidor escreve.
// Sem imports @/ (testado direto pelo node --test — ver exame-admin.ts).
// ══════════════════════════════════════════════════════════════════
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { resolverAssinatura } from './billing-admin';
import { emissaoMudou } from './correcao-admin';
import { podeGirar, proximoCicloFim } from './ciclo';
// Tríade onda-3 (Ruflo-A2): emissaoKeyValida morava aqui — moveu pra
// pdf-path.ts (dono declarado do FORMATO de chave/path, puro, zero
// imports). Re-exportada abaixo: /api/emitir/route.ts e
// tests/api/emitir-idempotencia.test.mjs continuam importando daqui, sem
// mudar chamador nenhum.
import { emissaoKeyValida } from './pdf-path';
export { emissaoKeyValida };

// Gaveta server-only do estado de idempotencia (mesmo formato do shadow:
// `privado/{tipo}/{sub}/{id}`). `firestore.rules` ja tem
// `match /privado/{documento=**} { allow read, write: if false }` no
// workspace — nenhuma regra nova, nenhum cliente escreve isto.
// Modelo do doc (round 6, comentario pedido pelo Codex — 1 linha por campo):
//  - emissaoKey: a key da tentativa VENCEDORA atual (emitirComCobranca grava
//    na cobranca; so muda numa reemissao de verdade — key diferente).
//  - pdfPendente: true = o PDF assinado desta emissao ainda nao foi salvo
//    (publicarPdfSeAindaDono baixa no mesmo commit que grava o ponteiro).
//  - snapshotSufixado: true = o snapshot HTML desta emissao, SE existir, mora
//    SO no path sufixado por `emissaoKey` — o canonico NAO e dela (pode ser
//    de uma emissao ANTERIOR). Gravada por publicarPdfSeAindaDono/
//    marcarPdfErroSeAindaDono no MESMO commit que confirma a emissao, ANTES
//    da rota tentar salvar o snapshot (round 6 — fecha a regressao onde um
//    save do sufixado que falhava em silencio deixava lerSnapshotHtml cair
//    no canonico de uma emissao velha).
//  - identidade: a identidade ASSINADA da emissao vencedora atual
//    (pacienteNome/pacienteDtnasc/dataExame/convenio — ver CAMPOS_IDENTIDADE
//    abaixo), gravada por emitirComCobranca na MESMA transacao que cobra. E
//    o "antes" a prova de SDK que a PROXIMA reemissao compara pra derivar
//    `identificacaoAlterada` (round 2, Codex Important 2).
export function refEmissaoPrivada(db: Firestore, wsId: string, exameId: string) {
  return db.doc(`workspaces/${wsId}/privado/emissao/exames/${exameId}`);
}

// Tríade onda-3 (Ruflo-A3): shape tipado da gaveta — antes cada leitor
// (pdf-storage.ts, pdf-server.ts/routes) lia `.data()` cru e recastava campo
// a campo, sem nada garantindo que o shape batia com o que emitirComCobranca
// de fato grava (documentado 4 linhas acima). `pdfPendente` e as demais
// bandeiras booleanas ficam `unknown`-safe por natureza do Firestore — o
// tipo é a EXPECTATIVA de leitura, não uma validação em runtime (mesmo
// contrato informal que o resto do arquivo já tinha).
export type GavetaEmissao = {
  emissaoKey?: string;
  pdfPendente?: boolean;
  snapshotSufixado?: boolean;
  identidade?: Record<string, string>;
};

/** Lê a gaveta privada de idempotência inteira (ou `undefined` se o exame
 *  nunca emitiu — pré-onda-0). Ponto único de leitura: pdf-storage.ts
 *  (`lerSnapshotHtml`) e qualquer chamador futuro usam ESTE shape, não o
 *  doc cru. */
export async function lerGavetaEmissao(db: Firestore, wsId: string, exameId: string): Promise<GavetaEmissao | undefined> {
  return (await refEmissaoPrivada(db, wsId, exameId).get()).data() as GavetaEmissao | undefined;
}

export type MotivoEmissao =
  | 'sem_plano' | 'nao_encontrado' | 'exame_de_outro_medico' | 'expirado' | 'sem_saldo' | 'cancelado';

export type ResultadoEmissao =
  // `pdfPendente`: o PDF assinado desta emissao ainda NAO esta salvo. Numa
  // emissao nova e sempre true (a rota vai gerar agora); num replay diz se a
  // rota deve REGERAR (C1) ou so devolver o pdfUrl que existe.
  // `reemissao`/`identificacaoAlterada` (E3): carimbos de auditoria DERIVADOS
  // no servidor (nao mais copiados do cliente) — replay devolve false nos
  // dois, replay nao e um ato novo de emissao.
  // `girou`/`cicloFimAnterior`/`cicloFimNovo` (E11 opcao D, ADR 2026-08-30):
  // true quando ESTA emissao girou o ciclo (achou a assinatura vencida e
  // elegivel). A rota (mesmo padrao do log 'emissao') grava o log
  // 'renovacao_ciclo' FORA da transacao com esses dois campos — o giro em si
  // ja commitou aqui dentro, o log e so auditoria, nao critico.
  | {
      ok: true; tipo: 'franquia' | 'creditos' | null; replay: boolean; pdfPendente: boolean; pdfUrl: string | null;
      reemissao: boolean; identificacaoAlterada: boolean;
      girou: boolean; cicloFimAnterior?: string; cicloFimNovo?: string;
    }
  | { ok: false; motivo: MotivoEmissao };

// O SERVIDOR e o dono do carimbo de identidade (E3): reemissao/
// identificacaoAlterada eram copiados do navegador
// (dadosFinais.reemissao / dadosFinais.identificacaoAlterada) — cliente
// adulterado reemitia trocando nome/CPF do paciente e logando
// identificacaoAlterada:false. Aqui dentro (emitirComCobranca) e onde os
// dois sao de fato DERIVADOS, do antes (exameSnap/gaveta) x depois
// (dadosFinais), na mesma transacao que cobra.
// `identificacaoMudou()` em src/app/laudo/[id]/page.tsx (~linha 1192) e uma
// PREVIA DE UX da MESMA regra (mostra o aviso pro medico antes de emitir) —
// nao e a fonte, e um espelho; a lista de campos tem que bater nos dois
// lados ou a previa mente. Travado por
// tests/unit/identidade-campos-pin.test.mjs (falha se os nomes divergirem).
const CAMPOS_IDENTIDADE = ['pacienteNome', 'pacienteDtnasc', 'dataExame', 'convenio'] as const;

// E14: dadosFinais e corpo CRU do cliente e entrava inteiro no update que
// assina o laudo. Whitelist nascida do grep dos 3 clientes (ADR 2026-08-30
// §5) — so estes 13 campos saem de fato de laudo/[id], laudo-texto/[id] e
// AnexarPdfModal. reemissao/identificacaoAlterada ficam de fora de proposito
// (M3): sao carimbos de auditoria derivados no servidor, o auditado nao os
// escreve.
const CAMPOS_DADOS_FINAIS = new Set([
  'medidas', 'achados', 'conclusoes', 'laudoHtml', 'laudoTextoHtml', 'cfgSnapshot',
  'tipoExame', 'pacienteNome', 'pacienteDtnasc', 'dataExame', 'convenio',
  'solicitante', 'sexo',
  // X2 (Task 17): escolha "incluir imagens DICOM no PDF" — persistida junto
  // com a emissao pra sobreviver a reabertura do laudo (antes so vivia em
  // memoria, resetava pro default a cada F5/reload).
  'incluirImagensNoPdf',
]);

// pacienteNome normalizado (trim+uppercase) — mesmo tratamento do
// identificacaoMudou() do cliente. feegow-admin grava sem trim; sem
// normalizar aqui, toda reemissao de exame importado do Feegow dava falso
// positivo por um espaco a mais no nome. Os outros 3 campos ficam crus — o
// cliente tambem nao normaliza eles.
const normalizarCampo = (campo: string, v: unknown): string => {
  const s = String(v ?? '');
  return campo === 'pacienteNome' ? s.trim().toUpperCase() : s;
};

// ── Publicacao atomica do PDF (fix-wave round 2, achado Codex C4/check-then-
// write) ──
// A cerca PRE-upload (podePublicar/podeSalvar em route.ts) checa ANTES do
// Puppeteer/Storage pra poupar trabalho na corrida mais comum, mas
// check-then-write deixava uma janela de SEGUNDOS entre aquela checagem e o
// `update({pdfUrl})` de fato — cancelamento/transferencia/reemissao ainda
// cabiam ali. E baixar `pdfPendente` como escrita SEPARADA do update do
// pdfUrl (o antigo `marcarPdfPronto`, chamado incondicionalmente com
// `if (pdfUrl)`) tinha o C4: se uma reemissao nova commitasse ENQUANTO o
// Puppeteer da tentativa perdedora ainda rodava, o `marcarPdfPronto` do
// PERDEDOR baixava a bandeira da emissao VENCEDORA — `pdfPendente` mora no
// EXAME, nao na tentativa, e as duas emissoes escrevem a mesma gaveta.
// As duas funcoes abaixo decidem PONTEIRO (pdfUrl) e BANDEIRA (pdfPendente)
// no MESMO commit — sao elas quem manda de verdade; a cerca pre-upload
// continua existindo so pra nao pagar upload/Puppeteer a toa.
// `pdfPendente` mora so aqui: nenhum outro arquivo escreve esse nome de
// campo (achado Ruflo I1, mantido).
//
// Janela bytes-no-path FECHADA (era ponytail no round 2, resolvida nos
// rounds 3+4): o path do PDF em /api/emitir e sufixado com a emissaoKey
// INTEIRA (route.ts) — nenhuma outra tentativa escreve no mesmo objeto, e
// emissaoKey virou obrigatoria (round 4), entao nao ha mais ramo "legado
// sem key" pra reabrir a janela. Perder a corrida so deixa um objeto orfao
// (apagado por `apagarPdfObjeto`, pdf-storage.ts) — nunca corrupcao.

// /api/emitir: gate por emissaoKey (a "tentativa" desta rota). Round 4:
// emissaoKey virou obrigatoria na rota — sem ramo "legado sem key" aqui.
// Round 7 (Ruflo, simetria de contrato): `declaraSnapshotSufixado` explicito,
// mesmo contrato do irmao `marcarPdfErroSeAindaDono` — o caller decide, nao
// a funcao. A rota passa `true` nos DOIS ramos (anexo e pdfHtml): mesmo o
// anexo (que nunca tem HTML/snapshot) precisa declarar, senao lerSnapshotHtml
// cairia no canonico de uma emissao ANTERIOR do mesmo exame.
export async function publicarPdfSeAindaDono(db: Firestore, p: {
  wsId: string; exameId: string; pdfUrl: string; emissaoKey: string;
  declaraSnapshotSufixado: boolean;
}): Promise<boolean> {
  const exameRef = db.doc(`workspaces/${p.wsId}/exames/${p.exameId}`);
  const privRef = refEmissaoPrivada(db, p.wsId, p.exameId);
  return db.runTransaction<boolean>(async (t) => {
    const [exameSnap, privSnap] = await Promise.all([t.get(exameRef), t.get(privRef)]);
    const exame = exameSnap.data();
    if (exame?.status !== 'emitido') return false;
    if (privSnap.data()?.emissaoKey !== p.emissaoKey) return false;
    t.update(exameRef, { pdfUrl: p.pdfUrl, pdfErro: FieldValue.delete() });
    t.set(privRef, {
      pdfPendente: false,
      ...(p.declaraSnapshotSufixado ? { snapshotSufixado: true } : {}),
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}

// Round 3 (Codex Important): os catches de Puppeteer/upload marcavam pdfErro
// com check-then-update FORA de transacao (le status, decide, escreve) — a
// mesma janela das outras escritas desta rodada: o catch da tentativa A podia
// carimbar pdfErro no exame que a tentativa B acabou de reemitir com sucesso
// ENQUANTO A ainda falhava. Usada pelos catches de /api/emitir (com a
// emissaoKey da tentativa, sempre string a partir do round 4) e pelo catch de
// /api/corrigir-laudo (com `keyNoGuard`, que PODE ser null — exame emitido
// antes da onda-0 nunca teve gaveta).
// `emissaoKey` continua nullable aqui (diferente de publicarPdfSeAindaDono):
// correcao nao e uma "tentativa" com key propria, so empresta a key que a
// gaveta tinha no momento do guard.
// Round 4 (Codex Important): a comparacao e NULL-SAFE — a versao anterior
// (`if (p.emissaoKey && ...)`) PULAVA a checagem inteira quando p.emissaoKey
// era null/undefined, deixando uma correcao iniciada com gaveta SEM key
// (exame pre-onda-0) carimbar pdfErro no exame que uma emissao NOVA (com
// key) tivesse acabado de vencer. Agora null e um valor comparavel como
// qualquer outro: gaveta ainda sem key (os dois lados null) = dono confirma;
// gaveta que GANHOU key durante a correcao = bloqueia.
// Round 7 (Ponytail): so passe `declaraSnapshotSufixado:true` se voce VAI
// salvar o snapshot sufixado logo em seguida — declarar sem salvar faz
// lerSnapshotHtml devolver null.
export async function marcarPdfErroSeAindaDono(db: Firestore, p: {
  wsId: string; exameId: string; emissaoKey: string | null;
  declaraSnapshotSufixado?: boolean;
}): Promise<boolean> {
  const exameRef = db.doc(`workspaces/${p.wsId}/exames/${p.exameId}`);
  const privRef = refEmissaoPrivada(db, p.wsId, p.exameId);
  return db.runTransaction<boolean>(async (t) => {
    const [exameSnap, privSnap] = await Promise.all([t.get(exameRef), t.get(privRef)]);
    const exame = exameSnap.data();
    if (exame?.status !== 'emitido') return false;
    if ((privSnap.data()?.emissaoKey ?? null) !== (p.emissaoKey ?? null)) return false;
    t.update(exameRef, { pdfErro: 'erro_pdf' });
    if (p.declaraSnapshotSufixado) {
      t.set(privRef, { snapshotSufixado: true, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
    }
    return true;
  });
}

// /api/corrigir-laudo: correcao nao tem "tentativa" (nao emite, so regera) —
// o gate principal e `emitidoEm` intacto (mesmo criterio da cerca pre-upload
// I4/Codex-3). A baixa de `pdfPendente` e uma condicao SEPARADA do gate
// principal: so baixa se a gaveta ainda tiver a MESMA key que tinha quando a
// correcao comecou (`keyNoGuard`) — senao a correcao apagaria a bandeira de
// uma emissao NOVA que comecou durante a regeracao (o C4 do lado da correcao).
export async function publicarCorrecaoSeAindaEmitido(db: Firestore, p: {
  wsId: string; exameId: string; pdfUrl: string;
  emitidoEmAntes: unknown; keyNoGuard: string | null;
}): Promise<boolean> {
  const exameRef = db.doc(`workspaces/${p.wsId}/exames/${p.exameId}`);
  const privRef = refEmissaoPrivada(db, p.wsId, p.exameId);
  return db.runTransaction<boolean>(async (t) => {
    const [exameSnap, privSnap] = await Promise.all([t.get(exameRef), t.get(privRef)]);
    const exame = exameSnap.data();
    if (exame?.status !== 'emitido' || emissaoMudou(p.emitidoEmAntes, exame?.emitidoEm)) return false;
    t.update(exameRef, { pdfUrl: p.pdfUrl, pdfErro: FieldValue.delete() });
    if ((privSnap.data()?.emissaoKey ?? null) === p.keyNoGuard) {
      t.set(privRef, { pdfPendente: false, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
    }
    return true;
  });
}

export async function emitirComCobranca(db: Firestore, p: {
  wsId: string;
  exameId: string;
  uid: string;
  medicoUid: string;
  dadosFinais: Record<string, unknown>;
  // Campos derivados no servidor que entram na MESMA escrita (carimbo do motor).
  // server-derived only — NAO passa pela whitelist CAMPOS_DADOS_FINAIS (hoje so carimboMotor).
  extras?: Record<string, unknown>;
  // Round 4: obrigatoria — a rota so chama isto depois de `emissaoKeyValida`
  // recusar 400 sem ela (o formato ja foi validado no trust boundary; aqui
  // dentro e so o dado, sem revalidar).
  emissaoKey: string;
}): Promise<ResultadoEmissao> {
  const key = p.emissaoKey;
  // O doc de `consumo` entra NA transacao: era um add() depois, dentro de
  // try/catch silencioso — se falhava, a franquia ficava debitada sem
  // registro e a devolucao liquida (/api/exame) nao tinha o que devolver.
  const consumoRef = db.collection('consumo').doc();
  const exameRef = db.doc(`workspaces/${p.wsId}/exames/${p.exameId}`);
  const privRef = refEmissaoPrivada(db, p.wsId, p.exameId);
  return db.runTransaction<ResultadoEmissao>(async (transaction) => {
    // Assinatura por contaId (fallback legado) — mesma chave do /api/exame.
    const assinatura = await resolverAssinatura(db, p.wsId);
    if (!assinatura) return { ok: false, motivo: 'sem_plano' };
    const subRef = assinatura.ref;
    // Leituras ANTES de qualquer escrita (exigencia da transacao). A gaveta
    // privada entra no read set: se outra invocacao gravar a mesma chave no
    // meio, esta transacao repete em vez de cobrar por cima. `consumoSnap`
    // (round 2, achado Important 1) entra pelo mesmo motivo — vira a fonte
    // de `reemissao`, ver comentario abaixo.
    const [subSnap, exameSnap, privSnap, consumoSnap] = await Promise.all([
      transaction.get(subRef),
      transaction.get(exameRef),
      transaction.get(privRef),
      transaction.get(db.collection('consumo').where('exameId', '==', p.exameId)),
    ]);
    if (!subSnap.exists) return { ok: false, motivo: 'sem_plano' };
    if (!exameSnap.exists) return { ok: false, motivo: 'nao_encontrado' };
    const exame = exameSnap.data()!;

    // Carimbos anti-fraude derivados aqui (ver CAMPOS_IDENTIDADE acima).
    //
    // ROUND 2 (Codex Important 1): `exame.emitidoEm` (+ o `privSnap.
    // emissaoKey` do round 1) ainda falhava pra exame PRE-onda-0 sem gaveta
    // — o autor apaga `emitidoEm` pelo SDK (rules:204-207 nao protege esse
    // campo) e a gaveta desse exame nunca teve `emissaoKey` nenhuma pra
    // compensar (o mecanismo nasceu depois da onda-0). Fonte definitiva: o
    // LEDGER de `consumo` — toda emissao cobrada grava 1 doc ali na MESMA
    // transacao que esta rodando agora (ver `transaction.set(consumoRef,
    // ...)` mais abaixo); se ja existe um consumo de franquia/credito pra
    // este exame, ele ja foi emitido/cobrado antes, ponto — nao ha SDK que
    // apague um doc de outra colecao que o cliente nem enxerga.
    // `privSnap.emissaoKey` (round 1) virou REDUNDANTE e foi removido daqui:
    // a gaveta e o `consumo` sao escritos na MESMA transacao (a de baixo),
    // entao "gaveta tem key" e sempre um subconjunto de "ha consumo" —
    // uma fonte so, mais simples.
    const consumosDoExame = consumoSnap.docs
      .map((d) => d.data())
      // P7 (mesmo padrao de lerDevolucaoLiquida em exame-admin.ts): sem
      // indice composto por workspace — filtra em codigo. So conta cobranca
      // de verdade (franquia/credito); 'cancelamento' nao e emissao.
      .filter((c) => c.workspaceId === p.wsId && (c.tipo === 'franquia' || c.tipo === 'credito'))
      .length;
    const reemissao = !!exame.emitidoEm || consumosDoExame > 0;

    // ROUND 2 (Codex Important 2): comparar contra o DOC do exame era
    // contornavel — o autor edita a identidade no proprio doc pelo SDK
    // ANTES de reemitir, manda o MESMO valor (ja adulterado) em
    // `dadosFinais`, e o "antes" contra o qual comparamos ja estava errado
    // (nunca detectava nada). Fix: a identidade ASSINADA passa a morar na
    // gaveta server-only (`privSnap.identidade`, gravada mais abaixo na
    // MESMA transacao de CADA emissao — deny-all pra todo cliente, so Admin
    // SDK escreve). Se ela existe, compara contra ELA (a prova de SDK).
    // Exame emitido ANTES desta mudanca nunca teve gaveta com `identidade`
    // — fallback pro doc (legado, best-effort, mesmo criterio do round 1).
    // Nota de semantica: se a recepcao corrigir um typo no DOC entre duas
    // emissoes (fluxo administrativo legitimo, pre-assinatura), a PROXIMA
    // reemissao agora flagra `identificacaoAlterada:true` mesmo que
    // `dadosFinais` bata com o doc corrigido — CORRETO: a identidade que sai
    // assinada de fato mudou em relacao a ultima vez que foi assinada, e e
    // exatamente isso que o carimbo existe pra registrar.
    const identidadeAnterior = privSnap.data()?.identidade as Record<string, string> | undefined;
    const identificacaoAlterada = reemissao && (
      identidadeAnterior
        ? CAMPOS_IDENTIDADE.some(
            (c) => c in p.dadosFinais
              && normalizarCampo(c, p.dadosFinais[c]) !== normalizarCampo(c, identidadeAnterior[c]),
          )
        : CAMPOS_IDENTIDADE.some(
            (c) => c in p.dadosFinais && normalizarCampo(c, p.dadosFinais[c]) !== normalizarCampo(c, exame[c]),
          )
    );

    // E14: whitelist substitui o destructuring de reemissao/
    // identificacaoAlterada (M3) — qualquer chave fora de CAMPOS_DADOS_FINAIS
    // e descartada, entao os dois carimbos de auditoria (e pdfUrl, status,
    // emitidoEm, acc, cpf, medicoUid...) somem daqui junto, de graca.
    const dadosFinaisPermitidos = Object.fromEntries(
      Object.entries(p.dadosFinais).filter(([k]) => CAMPOS_DADOS_FINAIS.has(k)),
    );

    // Caneta do autor (D2): laudo com autor definido so o proprio emite —
    // igual a regra publicada ("autor ou sem autor"). Sem autor pode assumir.
    const autor = exame.medicoUid as string | undefined;
    if (autor && autor !== p.uid) return { ok: false, motivo: 'exame_de_outro_medico' };

    // E8: laudo cancelado nao revive por emissao — o cancelamento ja devolveu
    // o consumo; emitir por cima criaria um doc emitido+cancelado ao mesmo
    // tempo. Voltar do cancelado e ato deliberado — recriar o exame (transferir
    // NAO tira o status 'cancelado': transferirExame so muda status quando o
    // exame estava 'emitido'). ANTES do bloco de replay (abaixo): uma key
    // reusada de uma emissao que foi cancelada DEPOIS nao pode devolver
    // "sucesso" — replay so vale pra exame que continua emitido de verdade.
    if (exame.status === 'cancelado') return { ok: false, motivo: 'cancelado' };

    // ── TRAVA ANTI-COBRANCA-DUPLA (E1) ──
    // Mesma tentativa, exame ja emitido: devolve o estado que existe. Sem
    // debito, sem consumo novo e SEM reescrever o doc — reescrever daria ao
    // cliente uma reemissao de graca por key reusada (e mexeria no
    // `emitidoEm` de que a /api/corrigir-laudo depende para detectar
    // reemissao concorrente).
    // A key comparada e a da GAVETA PRIVADA, nao a do doc do exame (I1): so o
    // Admin SDK escreve ali, entao "esta emissao ainda deve um PDF" e um fato
    // do servidor. Um cliente adulterado que plante campos no proprio exame
    // nao consegue forjar `pdfPendente` e ganhar regeracao de graca.
    if (exame.status === 'emitido' && privSnap.data()?.emissaoKey === key) {
      return {
        ok: true, tipo: null, replay: true,
        // C1: PDF pendente => a rota REGERA a partir do pdfHtml desta
        // requisicao. Risco aceito e limitado: quem consegue reenviar o retry
        // ja podia mandar o html que quisesse na 1a chamada — nao ha poder
        // novo aqui, e o direito de regerar morre no primeiro PDF salvo.
        pdfPendente: privSnap.data()?.pdfPendente === true,
        pdfUrl: (exame.pdfUrl as string) || null,
        // Replay nao e um ato novo de emissao — os carimbos da tentativa
        // VENCEDORA ja foram gravados no consumo/log dela, nao aqui de novo.
        reemissao: false, identificacaoAlterada: false,
        girou: false,
      };
    }

    const sub = subSnap.data()!;
    const agora = new Date();
    let cicloFim = sub.cicloFim ? (sub.cicloFim as Timestamp).toDate() : null;
    let franquiaUsada = (sub.franquiaUsada as number) || 0;
    const franquiaMensal = (sub.franquiaMensal as number) || 0;
    const creditosExtras = (sub.creditosExtras as number) || 0;

    // ── E11 opcao D (ADR docs/decisoes/2026-08-30-secao7-renovacao-ciclo,
    // decisao do Sergio 30/08) — o giro do ciclo acontece AQUI DENTRO, na
    // MESMA transacao que ja cobra: sem cron, sem escritor novo de
    // `subscriptions/{id}` (o 4o escritor do ADR vira "o proprio
    // emitirComCobranca", nao uma rota nova).
    // Predicado (`podeGirar`) e loop (`proximoCicloFim`) moraram em texto
    // duplicado aqui e em billing.ts ate a triade 2b — agora sao a MESMA
    // funcao pura (ciclo.ts), so pode haver 1 definicao de "elegivel pra
    // girar". Motivo das 3 condicoes e do loop +30d: comentario em ciclo.ts.
    const cicloFimAnterior = cicloFim;
    let girou = false;
    if (podeGirar({ cicloFim, franquiaMensal, tipo: sub.tipo as string }, agora)) {
      cicloFim = new Date(proximoCicloFim(cicloFimAnterior!.getTime(), agora.getTime()));
      franquiaUsada = 0; // reinicia ANTES do +1 desta emissao, abaixo
      girou = true;
    }

    let tipo: 'franquia' | 'creditos' | null = null;
    if (cicloFim && agora <= cicloFim && franquiaUsada < franquiaMensal) {
      tipo = 'franquia';
    } else if (creditosExtras > 0) {
      tipo = 'creditos';
    } else if (cicloFim && agora > cicloFim && creditosExtras <= 0) {
      return { ok: false, motivo: 'expirado' };
    } else {
      return { ok: false, motivo: 'sem_saldo' };
    }

    transaction.update(exameRef, {
      ...dadosFinaisPermitidos,
      ...(p.extras || {}),
      status: 'emitido',
      emitidoEm: FieldValue.serverTimestamp(),
      medicoUid: p.medicoUid,
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    // ROUND 2 (Codex Important 2): a identidade ASSINADA desta emissao —
    // vira o "antes" a prova de SDK que a PROXIMA reemissao compara (acima).
    // Valores FINAIS (dadosFinaisPermitidos, com fallback pro doc quando o
    // campo nao veio nesta requisicao — mesmo raciocinio do resto da funcao:
    // o que nao mudou continua valendo o que ja estava no exame). Mesma
    // normalizacao da comparacao (pacienteNome trim+upper; os outros 3 crus
    // — identificacaoMudou() do cliente tambem so normaliza o nome).
    // Privacidade: sem PII nova — o ledger `consumo` ja guarda `pacienteNome`
    // (achado X23) e a gaveta e deny-all pra todo cliente.
    const identidadeAssinada = Object.fromEntries(
      CAMPOS_IDENTIDADE.map((c) => [c, normalizarCampo(c, c in dadosFinaisPermitidos ? dadosFinaisPermitidos[c] : exame[c])]),
    ) as Record<(typeof CAMPOS_IDENTIDADE)[number], string>;

    // Estado de idempotencia na MESMA transacao do debito: cobrou => a key
    // vale e o PDF esta devendo. Sai daqui so quando a rota salvar o PDF.
    // Round 4: SEMPRE grava (emissaoKey e obrigatoria agora — o ramo "sem
    // key nao ha o que travar" morreu junto com o cliente legado).
    transaction.set(privRef, {
      emissaoKey: key,
      pdfPendente: true,
      identidade: identidadeAssinada,
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    if (girou) {
      // Giro + cobranca no MESMO update (`tipo` so pode ser 'franquia' aqui:
      // o giro acabou de garantir `franquiaUsada(0) < franquiaMensal(>0)` e
      // `agora <= cicloFim` novo). Literal `1`, nao `increment(1)`: a
      // transacao ja leu `subRef` acima (read set), entao esta escrita e
      // exclusiva desta invocacao — increment seria redundante.
      transaction.update(subRef, { franquiaUsada: 1, cicloFim: Timestamp.fromDate(cicloFim!) });
    } else if (tipo === 'franquia') {
      transaction.update(subRef, { franquiaUsada: FieldValue.increment(1) });
    } else {
      transaction.update(subRef, { creditosExtras: FieldValue.increment(-1) });
    }

    transaction.set(consumoRef, {
      workspaceId: p.wsId,
      exameId: p.exameId,
      medicoUid: p.medicoUid,
      pacienteNome: (p.dadosFinais.pacienteNome as string) || '',
      tipoExame: (p.dadosFinais.tipoExame as string) || '',
      convenio: (p.dadosFinais.convenio as string) || '',
      tipo: tipo === 'franquia' ? 'franquia' : 'credito',
      reemissao,
      emitidoEm: FieldValue.serverTimestamp(),
    });

    return {
      ok: true, tipo, replay: false, pdfPendente: true, pdfUrl: (exame.pdfUrl as string) || null,
      reemissao, identificacaoAlterada,
      girou,
      ...(girou ? {
        cicloFimAnterior: cicloFimAnterior!.toISOString(),
        cicloFimNovo: cicloFim!.toISOString(),
      } : {}),
    };
  });
}
