// ══════════════════════════════════════════════════════════════════
// LEO · Emissao server-side — transacao atomica de emitir + cobrar (S7-T0.3)
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
// Requisicao sem key = comportamento legado (cliente antigo), aditivo.
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
import type { Firestore, Timestamp } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { resolverAssinatura } from './billing-admin';

// Gaveta server-only do estado de idempotencia (mesmo formato do shadow:
// `privado/{tipo}/{sub}/{id}`). `firestore.rules` ja tem
// `match /privado/{documento=**} { allow read, write: if false }` no
// workspace — nenhuma regra nova, nenhum cliente escreve isto.
export function refEmissaoPrivada(db: Firestore, wsId: string, exameId: string) {
  return db.doc(`workspaces/${wsId}/privado/emissao/exames/${exameId}`);
}

// Formato do `crypto.randomUUID()` do navegador. Vem do cliente e vira
// chave de idempotencia: qualquer outra coisa e recusada (a rota devolve
// 400) e ignorada aqui — garantia para todo chamador, nao so a rota.
export function emissaoKeyValida(k: unknown): boolean {
  return typeof k === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k);
}

export type MotivoEmissao =
  | 'sem_plano' | 'nao_encontrado' | 'exame_de_outro_medico' | 'expirado' | 'sem_saldo';

export type ResultadoEmissao =
  // `pdfPendente`: o PDF assinado desta emissao ainda NAO esta salvo. Numa
  // emissao nova e sempre true (a rota vai gerar agora); num replay diz se a
  // rota deve REGERAR (C1) ou so devolver o pdfUrl que existe.
  | { ok: true; tipo: 'franquia' | 'creditos' | null; replay: boolean; pdfPendente: boolean; pdfUrl: string | null }
  | { ok: false; motivo: MotivoEmissao };

export async function emitirComCobranca(db: Firestore, p: {
  wsId: string;
  exameId: string;
  uid: string;
  medicoUid: string;
  dadosFinais: Record<string, unknown>;
  // Campos derivados no servidor que entram na MESMA escrita (carimbo do motor).
  extras?: Record<string, unknown>;
  emissaoKey?: unknown;
}): Promise<ResultadoEmissao> {
  const key = emissaoKeyValida(p.emissaoKey) ? (p.emissaoKey as string) : null;
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
    // meio, esta transacao repete em vez de cobrar por cima.
    const [subSnap, exameSnap, privSnap] = await Promise.all([
      transaction.get(subRef),
      transaction.get(exameRef),
      transaction.get(privRef),
    ]);
    if (!subSnap.exists) return { ok: false, motivo: 'sem_plano' };
    if (!exameSnap.exists) return { ok: false, motivo: 'nao_encontrado' };
    const exame = exameSnap.data()!;
    // Caneta do autor (D2): laudo com autor definido so o proprio emite —
    // igual a regra publicada ("autor ou sem autor"). Sem autor pode assumir.
    const autor = exame.medicoUid as string | undefined;
    if (autor && autor !== p.uid) return { ok: false, motivo: 'exame_de_outro_medico' };

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
    if (key && exame.status === 'emitido' && privSnap.data()?.emissaoKey === key) {
      return {
        ok: true, tipo: null, replay: true,
        // C1: PDF pendente => a rota REGERA a partir do pdfHtml desta
        // requisicao. Risco aceito e limitado: quem consegue reenviar o retry
        // ja podia mandar o html que quisesse na 1a chamada — nao ha poder
        // novo aqui, e o direito de regerar morre no primeiro PDF salvo.
        pdfPendente: privSnap.data()?.pdfPendente === true,
        pdfUrl: (exame.pdfUrl as string) || null,
      };
    }

    const sub = subSnap.data()!;
    const agora = new Date();
    const cicloFim = sub.cicloFim ? (sub.cicloFim as Timestamp).toDate() : null;
    const franquiaUsada = (sub.franquiaUsada as number) || 0;
    const franquiaMensal = (sub.franquiaMensal as number) || 0;
    const creditosExtras = (sub.creditosExtras as number) || 0;

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
      ...p.dadosFinais,
      ...(p.extras || {}),
      status: 'emitido',
      emitidoEm: FieldValue.serverTimestamp(),
      medicoUid: p.medicoUid,
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    // Estado de idempotencia na MESMA transacao do debito: cobrou => a key
    // vale e o PDF esta devendo. Sai daqui so quando a rota salvar o PDF.
    transaction.set(privRef, {
      emissaoKey: key,
      pdfPendente: true,
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    if (tipo === 'franquia') {
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
      reemissao: !!(p.dadosFinais.reemissao),
      emitidoEm: FieldValue.serverTimestamp(),
    });

    return { ok: true, tipo, replay: false, pdfPendente: true, pdfUrl: (exame.pdfUrl as string) || null };
  });
}
