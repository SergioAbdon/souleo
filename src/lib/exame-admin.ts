// ══════════════════════════════════════════════════════════════════
// LEO · Exame server-side — apagar / cancelar / transferir (Plano 2A)
// A fechadura definitiva tem `exames delete: if false`: estas funcoes,
// atras do /api/exame, sao O UNICO caminho — com papel, log em `logs`,
// devolucao de consumo (D8) e limpeza do PDF publico (P2).
// Sem imports relativos (testado direto pelo node --test).
// `subRef` vem do chamador (resolverAssinatura de billing-admin) e
// `apagarPdf` tambem — DI que mantem Storage fora dos testes.
// ══════════════════════════════════════════════════════════════════
import type { Firestore, DocumentReference, DocumentSnapshot, Timestamp, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { refEmissaoPrivada } from './emitir-admin';

// Ids interpolados no path do Admin SDK (workspaces/${wsId}, profissionais/${uid}):
// um id com '/' remonta o path e escaparia da colecao. Duplicado de convite-server.ts
// (arquivo sem import @/, testado direto por node --test).
export function idValido(s: unknown): s is string {
  return typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
}

export type Papel = 'dono' | 'medico' | 'recepcao' | null;
type Resultado = { ok: true } | { ok: false; motivo: string };
type Params = {
  wsId: string; exameId: string; uid: string;
  subRef: DocumentReference | null;
  apagarPdf: (url: string) => Promise<void>;
  // D5b/achado 20: so apagarExame chama — cancelar/transferir mantem o doc
  // (e as imagens). Opcional pra nao quebrar chamador/teste que ainda nao
  // injeta (skip silencioso, igual limparPdf faz com pdfUrl ausente).
  apagarImagens?: (wsId: string, exameId: string) => Promise<void>;
  motivo?: string; novoMedicoUid?: string;
};

// Paridade com a fechadura publicada: papel vem SO do vinculo deterministico
// (`alcancaConta` na regra), inclusive a lista `locais` — vazia = todos os
// locais da conta. Sem fallback por ownerUid: a regra nao tem esse braco, e
// a producao esta migrada (inventario: zero workspaces sem contaId).
export async function resolverPapel(db: Firestore, wsId: string, uid: string): Promise<Papel> {
  if (!idValido(wsId)) return null;
  const ws = await db.doc(`workspaces/${wsId}`).get();
  if (!ws.exists) return null;
  const contaId = ws.data()!.contaId as string | undefined;
  if (!contaId) return null;
  const v = await db.doc(`vinculos/${contaId}_${uid}`).get();
  const d = v.data();
  if (!v.exists || d!.status !== 'ativo' || !['dono', 'medico', 'recepcao'].includes(d!.papel)) return null;
  const locais = (d!.locais as string[] | undefined) ?? [];
  if (locais.length > 0 && !locais.includes(wsId)) return null;
  return d!.papel as Papel;
}

// Autor ou sem autor: o que um medico pode mexer alem do que e do dono.
function medicoAlcanca(exame: Record<string, unknown>, uid: string) {
  return !exame.medicoUid || exame.medicoUid === uid;
}

// Ato medico = perfil medico (tipoPerfil ausente ou 'medico'). Espelha
// ehMedicoDeVerdade da regra e o gate do /api/emitir. C7: papel:'medico' no
// vinculo nao basta para cancelar/transferir laudo — o perfil tem que ser medico.
export async function ehMedicoDeVerdade(db: Firestore, uid: string): Promise<boolean> {
  const p = await db.doc(`profissionais/${uid}`).get();
  return (p.data()?.tipoPerfil ?? 'medico') === 'medico';
}

// /api/corrigir-laudo: correcao administrativa e SO de laudo EMITIDO; dono e
// RECEPCAO corrigem qualquer um, medico so os seus (autor), exame sem autor
// pode ser assumido. Puro/testavel — a rota resolve papel antes e mapeia o
// motivo em HTTP (nao_emitido→409, nao_e_autor/sem_permissao→403).
// S5-T5/D4: recepcao entrou. Convenio e solicitante sao dado de recepcao —
// trocar o nome do plano nao e ato medico, nao gera credito e nao encosta no
// corpo clinico (o servidor reescreve so esses 2 campos do snapshot).
export function podeCorrigir(
  papel: Papel, antesStatus: unknown, antesMedicoUid: unknown, uid: string,
): { ok: boolean; motivo?: string } {
  if (!papel) return { ok: false, motivo: 'sem_permissao' };
  if (antesStatus !== 'emitido') return { ok: false, motivo: 'nao_emitido' };
  if (papel === 'medico' && antesMedicoUid && antesMedicoUid !== uid) {
    return { ok: false, motivo: 'nao_e_autor' };
  }
  return { ok: true };
}

// Devolve o SALDO LIQUIDO dos consumos do exame (P1/D8): tudo que foi
// consumido MENOS o que ja foi devolvido em registros 'cancelamento'
// anteriores. Idempotente por construcao — retry apos falha parcial e
// reemissao pos-cancelamento devolvem so a diferenca.
// Dividida em leitura (lerDevolucaoLiquida) e escrita (aplicarDevolucaoLiquida)
// pra poder rodar DENTRO da transacao do CAS de cancelar/transferir (FIX 1 da
// revisao E6) sem duplicar a conta — mesma logica, mesmas 2 funcoes, chamadas
// tanto por `devolverConsumo` (transacao propria, usada por apagarExame) quanto
// inline pelo CAS.
async function lerDevolucaoLiquida(t: Transaction, db: Firestore, p: Params) {
  const snap = await t.get(db.collection('consumo').where('exameId', '==', p.exameId));
  // P7: sem indice composto — filtra o workspace em codigo.
  const doExame = snap.docs.map(d => d.data()).filter(c => c.workspaceId === p.wsId);
  const gastoFranquia = doExame.filter(c => c.tipo === 'franquia').length;
  const gastoCredito = doExame.filter(c => c.tipo === 'credito').length;
  const devolvidos = doExame.filter(c => c.tipo === 'cancelamento');
  const jaFranquia = devolvidos.reduce((s, c) => s + ((c.devolvidoFranquia as number) || 0), 0);
  const jaCredito = devolvidos.reduce((s, c) => s + ((c.devolvidoCreditos as number) || 0), 0);
  const nFranquia = Math.max(0, gastoFranquia - jaFranquia);
  const nCredito = Math.max(0, gastoCredito - jaCredito);
  // Le a assinatura AQUI (antes de qualquer escrita, exigencia de transacao)
  // mesmo quando nFranquia/nCredito derem 0 — quem decide se usa e o chamador.
  const subSnap = p.subRef ? await t.get(p.subRef) : null;
  return { nFranquia, nCredito, subSnap };
}

function aplicarDevolucaoLiquida(
  t: Transaction, db: Firestore, p: Params, acao: string,
  nFranquia: number, nCredito: number, subSnap: DocumentSnapshot | null,
) {
  if (!nFranquia && !nCredito) return;
  // O ledger registra o que FOI APLICADO, nao o que era devido: sem
  // assinatura (subRef null ou doc apagado) nada volta, e gravar n>0
  // faria o liquido achar que ja devolveu — bloqueando a correcao depois.
  let feitoFranquia = 0, feitoCredito = 0;
  if (p.subRef && subSnap?.exists) {
    const usada = (subSnap.data()!.franquiaUsada as number) || 0;
    t.update(p.subRef, {
      franquiaUsada: Math.max(0, usada - nFranquia),
      creditosExtras: FieldValue.increment(nCredito),
    });
    feitoFranquia = nFranquia;
    feitoCredito = nCredito;
  }
  t.set(db.collection('consumo').doc(), {
    workspaceId: p.wsId, exameId: p.exameId, tipo: 'cancelamento', acao,
    devolvidoFranquia: feitoFranquia, devolvidoCreditos: feitoCredito,
    por: p.uid, emitidoEm: FieldValue.serverTimestamp(),
  });
}

// E6: o get la em cima (carregar) e FORA de transacao — entre ele e a
// escrita final uma emissao pode commitar (cobranca nova + pdfUrl novo).
// O update final vira CAS DENTRO da mesma transacao da devolucao (FIX 1): so
// devolve/escreve se status e emitidoEm ainda sao os que decidimos
// cancelar/transferir — senao nem a devolucao roda (return true antes de
// aplicarDevolucaoLiquida). Perdendo a corrida: NADA e devolvido (a emissao
// vencedora fica com a cobranca dela intacta) e o PDF dela fica de pe porque
// limparPdf so roda DEPOIS do CAS confirmar, com a URL RE-LIDA na mesma
// transacao (FIX 2). Estado consistente: 1 cobranca pro 1 laudo que ficou
// emitido — nunca um laudo de graca.
function mesmaEmissao(a: unknown, b: unknown): boolean {
  if (!a && !b) return true;
  return !!a && !!b && typeof (a as Timestamp).isEqual === 'function'
    && (a as Timestamp).isEqual(b as Timestamp);
}

async function limparPdf(url: string | undefined, p: Params) {
  if (typeof url === 'string' && url) {
    try { await p.apagarPdf(url); }
    catch (e) { console.error('apagarPdf:', e); }   // nunca bloqueia a acao
  }
}

// Ponytail-5: cancelarExame e transferirExame tinham o MESMO envelope de CAS
// (ler fresco, comparar com o `exame` de fora, devolver liquido, escrever) —
// só os campos gravados e o rótulo da devolução mudavam. Extraído aqui.
// `campos` e o que cada acao grava no update ALEM do pdfUrl/pdfErro (que este
// helper cuida sozinho quando `emitido`, Ruflo-3b: pdfErro tinha que sumir
// junto do pdfUrl — senão um laudo cancelado ficava com a marca de erro do
// PDF que nunca mais vai existir).
async function casComDevolucao(
  db: Firestore, p: Params, exameSnap: DocumentSnapshot, exame: Record<string, unknown>,
  emitido: boolean, acao: string, campos: Record<string, unknown>,
): Promise<{ conflito: boolean; pdfDoCommit: string | null }> {
  let pdfDoCommit: string | null = null;
  const conflito = await db.runTransaction(async (t) => {
    const agora = await t.get(exameSnap.ref);
    if (!agora.exists) return true;
    const d = agora.data()!;
    // Ponytail-8: o guard do CAS vem ANTES de lerDevolucaoLiquida — perder a
    // corrida nao precisa mais consultar a colecao `consumo` a toa (o braco
    // de conflito nunca aplicava a devolucao mesmo antes, so lia sem usar).
    if (d.status !== exame.status || !mesmaEmissao(d.emitidoEm, exame.emitidoEm)) return true;
    const netos = emitido ? await lerDevolucaoLiquida(t, db, p) : null;
    if (emitido && netos) aplicarDevolucaoLiquida(t, db, p, acao, netos.nFranquia, netos.nCredito, netos.subSnap);
    t.update(exameSnap.ref, {
      ...campos,
      ...(emitido ? { pdfUrl: FieldValue.delete(), pdfErro: FieldValue.delete() } : {}),
    });
    pdfDoCommit = (d.pdfUrl as string) || null;   // FIX 2: pdfUrl fresco (re-lido), nao o `exame` de fora
    return false;
  });
  return { conflito, pdfDoCommit };
}

function log(db: Firestore, tipo: string, p: Params, exame: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return db.collection('logs').add({
    tipo, exameId: p.exameId, wsId: p.wsId,
    pacienteNome: (exame.pacienteNome as string) ?? '',
    medicoUidExame: (exame.medicoUid as string) ?? null,
    por: p.uid, ts: FieldValue.serverTimestamp(),
    // P3: cancelamento nao reverte o Feegow — divergencia fica registrada.
    feegowDivergencia: !!exame.feegowAppointId,
    ...extra,
  }).catch(e => console.error('log:', e));
}

async function carregar(db: Firestore, p: Params) {
  const [papel, exameSnap] = await Promise.all([
    resolverPapel(db, p.wsId, p.uid),
    db.doc(`workspaces/${p.wsId}/exames/${p.exameId}`).get(),
  ]);
  return { papel, exameSnap };
}

export async function apagarExame(db: Firestore, p: Params): Promise<Resultado> {
  const { papel, exameSnap } = await carregar(db, p);
  if (!exameSnap.exists) return { ok: false, motivo: 'nao_encontrado' };
  const exame = exameSnap.data()!;
  const emitido = exame.status === 'emitido';
  const pode = emitido
    ? papel === 'dono'                                             // matriz: apagar emitido e so do dono
    : papel === 'dono' || (papel === 'medico' && medicoAlcanca(exame, p.uid));
  if (!pode) return { ok: false, motivo: 'sem_permissao' };

  // Ponytail-10: devolverConsumo tinha 1 caller so (aqui) — inline. Fora do
  // escopo do CAS (o doc some de qualquer jeito, nao ha corrida "emissao x
  // cancelamento" pra fechar ali).
  if (emitido) {
    await db.runTransaction(async (t) => {
      const { nFranquia, nCredito, subSnap } = await lerDevolucaoLiquida(t, db, p);
      aplicarDevolucaoLiquida(t, db, p, 'apagar', nFranquia, nCredito, subSnap);
    });
  }
  await limparPdf(exame.pdfUrl as string | undefined, p);
  // D5b/achado 20: imagens DICOM saem junto do exame — sem status:'emitido'
  // travando (elas existem pra rascunho/andamento tambem, o Wader grava
  // assim que o estudo chega). Nunca bloqueia a exclusao (mesmo padrao do
  // limparPdf acima).
  if (p.apagarImagens) {
    try { await p.apagarImagens(p.wsId, p.exameId); }
    catch (e) { console.error('apagarImagens:', e); }
  }
  // Achado 8: a reserva de ACC (accIndex/{acc}) nasce junto com o exame
  // (gravarImportacao) — some junto tambem, senao fica orfa (ninguem mais
  // aponta pra ela, mas ela trava aquele ACC pra sempre). Mesmo batch:
  // ou os dois somem, ou nenhum.
  const acc = exame.acc as string | undefined;
  const lote = db.batch();
  lote.delete(exameSnap.ref);
  if (acc && idValido(acc)) lote.delete(db.doc(`workspaces/${p.wsId}/accIndex/${acc}`));
  // Ruflo M3: a gaveta privada de idempotencia (emitir-admin.ts) e outro
  // satelite do mesmo tipo do accIndex acima — sem isto ficava orfa (doc
  // morto em privado/emissao/exames/{exameId}, nunca mais lido nem apagado).
  lote.delete(refEmissaoPrivada(db, p.wsId, p.exameId));
  await lote.commit();
  await log(db, 'exclusao_exame', p, exame, { estavaEmitido: emitido });
  return { ok: true };
}

export async function cancelarExame(db: Firestore, p: Params): Promise<Resultado> {
  const { papel, exameSnap } = await carregar(db, p);
  if (!exameSnap.exists) return { ok: false, motivo: 'nao_encontrado' };
  const exame = exameSnap.data()!;
  const emitido = exame.status === 'emitido';
  // Achado 8: sair da fila (Worklist, exame FEEGOW ainda nao emitido) tambem
  // passa por aqui em vez de apagar — doc fica, so o status muda. Mesmos dois
  // status que a tela oferece o botao de remover (grupo 'aguardando' do
  // Worklist.tsx). Fora emitido/aguardando/rascunho — inclusive cancelado ou
  // nao-realizado de novo — continua barrado (teste "cancelar duas vezes").
  const aberto = exame.status === 'aguardando' || exame.status === 'rascunho';
  if (!emitido && !aberto) return { ok: false, motivo: 'nao_emitido' };
  const pode = emitido
    ? papel === 'dono' || (papel === 'medico' && exame.medicoUid === p.uid && await ehMedicoDeVerdade(db, p.uid))
    // nao emitido: mesma matriz do apagar nao-emitido (dono ou medico que alcanca) —
    // e exatamente o que este braco substitui na tela pra origem FEEGOW.
    : papel === 'dono' || (papel === 'medico' && medicoAlcanca(exame, p.uid));
  if (!pode) return { ok: false, motivo: 'sem_permissao' };

  // FIX 1 (revisao E6): devolucao e CAS entram na MESMA transacao (agora no
  // helper casComDevolucao, Ponytail-5) — com os dois separados, uma emissao
  // vencendo a corrida DEPOIS que a devolucao ja rodou (mas ANTES do CAS)
  // devolvia o consumo da emissao nova — laudo de graca.
  const { conflito, pdfDoCommit } = await casComDevolucao(db, p, exameSnap, exame, emitido, 'cancelar', {
    status: 'cancelado',
    canceladoEm: FieldValue.serverTimestamp(),
    canceladoPor: p.uid,
    motivoCancelamento: p.motivo ?? '',
  });
  if (conflito) {
    // FIX 6: aborto tambem fica auditavel — inclusive o pdfUrl que ficou de
    // pe (a emissao vencedora), pra rastrear se um crash aqui deixar orfao.
    await log(db, 'cancelamento_laudo', p, exame, {
      motivo: p.motivo ?? '', estavaEmitido: emitido, conflito: true, pdfUrl: (exame.pdfUrl as string) || null,
    });
    return { ok: false, motivo: 'conflito_emissao' };
  }
  // PDF so e apagado DEPOIS do CAS confirmar, com a URL RE-LIDA na transacao
  // (FIX 2) — apagar antes ou com a URL velha e o que matava/mataria o PDF
  // de uma emissao nova que tivesse vencido a corrida.
  if (emitido && pdfDoCommit) await limparPdf(pdfDoCommit, p);
  await log(db, 'cancelamento_laudo', p, exame, { motivo: p.motivo ?? '', estavaEmitido: emitido, pdfUrl: pdfDoCommit });
  return { ok: true };
}

export async function transferirExame(db: Firestore, p: Params): Promise<Resultado> {
  if (!idValido(p.novoMedicoUid)) return { ok: false, motivo: 'alvo_invalido' };
  const { papel, exameSnap } = await carregar(db, p);
  if (!exameSnap.exists) return { ok: false, motivo: 'nao_encontrado' };
  const exame = exameSnap.data()!;
  const pode = papel === 'dono'
    || (papel === 'medico' && medicoAlcanca(exame, p.uid) && await ehMedicoDeVerdade(db, p.uid));
  if (!pode) return { ok: false, motivo: 'sem_permissao' };
  const papelAlvo = await resolverPapel(db, p.wsId, p.novoMedicoUid);
  if (papelAlvo !== 'medico' && papelAlvo !== 'dono') return { ok: false, motivo: 'alvo_invalido' };
  // C7/D: papel:'medico' no vinculo nao basta — o alvo precisa ser medico de
  // verdade (tipoPerfil), senao herda o laudo e nao consegue emitir.
  if (!(await ehMedicoDeVerdade(db, p.novoMedicoUid))) return { ok: false, motivo: 'alvo_invalido' };

  const emitido = exame.status === 'emitido';
  // D8: o laudo anterior sai da conta; o novo medico consome ao emitir.
  // FIX 1 (revisao E6): devolucao + CAS na MESMA transacao (helper
  // casComDevolucao, Ponytail-5) — mesmo raciocinio do cancelarExame (ver
  // comentario la): devolver fora e deixar a emissao vencedora sem cobranca liquida.
  const { conflito, pdfDoCommit } = await casComDevolucao(db, p, exameSnap, exame, emitido, 'transferir', {
    medicoUid: p.novoMedicoUid,
    ...(emitido ? { status: 'andamento' } : {}),
    atualizadoEm: FieldValue.serverTimestamp(),
  });
  if (conflito) {
    await log(db, 'transferencia_exame', p, exame, {   // FIX 6
      de: (exame.medicoUid as string) ?? null, para: p.novoMedicoUid, estavaEmitido: emitido,
      conflito: true, pdfUrl: (exame.pdfUrl as string) || null,
    });
    return { ok: false, motivo: 'conflito_emissao' };
  }
  if (emitido && pdfDoCommit) await limparPdf(pdfDoCommit, p);   // FIX 2
  await log(db, 'transferencia_exame', p, exame, { de: (exame.medicoUid as string) ?? null, para: p.novoMedicoUid, estavaEmitido: emitido, pdfUrl: pdfDoCommit });
  return { ok: true };
}
