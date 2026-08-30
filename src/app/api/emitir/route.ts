// ══════════════════════════════════════════════════════════════════
// LEO v3 · API Route — Emissao atomica de laudo + PDF
// Transacao server-side: emitir exame + cobrar billing atomicamente
// + gerar PDF via Puppeteer e salvar pdfUrl tudo em uma chamada
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { gerarESalvarPdf, salvarPdfBuffer, salvarSnapshotHtml } from '@/lib/pdf-server';
import { sanitizarNomeArq } from '@/lib/pdf-path';
import { validarPdfBase64 } from '@/lib/pdf-validacao';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';
import { emitirComCobranca, emissaoKeyValida, marcarPdfPronto } from '@/lib/emitir-admin';
import { prefixoArquivoPorTipo } from '@/lib/dicom-sr-mapping';

// ── Config Next.js ──
export const runtime = 'nodejs';
export const maxDuration = 60;

// PDF server-side extraído p/ src/lib/pdf-server.ts
// (reuso entre /api/emitir e /api/corrigir-laudo — 1 pipeline só)

// ── POST Handler ──
export async function POST(req: NextRequest) {
  // Rota aberta ate 10/08/2026: qualquer um POSTava e queimava a franquia de
  // uma clinica alheia (ou emitia laudo assinado no nome de outro medico).
  const uid = await requireUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  const dbAdmin = adminDb();
  try {
    const body = await req.json();
    const { wsId, exameId, dadosFinais, medicoUid, pdfHtml, pdfBase64, motorNumeros, emissaoKey } = body as {
      wsId: string;
      exameId: string;
      dadosFinais: Record<string, unknown>;
      medicoUid: string;
      pdfHtml?: string;
      pdfBase64?: string;
      motorNumeros?: string;
      emissaoKey?: string;
    };
    // F3-T5 (proveniência): carimbo de QUEM produziu os números do laudo.
    // Vem do cliente, então entra só se for uma das duas palavras conhecidas
    // — qualquer outra coisa (string livre, objeto, tamanho arbitrário) é
    // ignorada em silêncio, o campo simplesmente não é gravado.
    // 27/08 (achado do teste ao vivo): o carimbo é gravado na TRANSAÇÃO, junto
    // de `status: 'emitido'` — antes ia no update pós-PDF e sumia quando a
    // geração do PDF falhava (laudo emitido sem saber quem fez os números).
    const carimboMotor = (motorNumeros === 'senna93' || motorNumeros === 'legado')
      ? { motorNumeros }
      : {};

    if (!wsId || !exameId || !medicoUid) {
      return NextResponse.json(
        { ok: false, motivo: 'dados_invalidos', error: 'wsId, exameId e medicoUid sao obrigatorios' },
        { status: 400 }
      );
    }
    // S7-T0.3 (E1): chave de idempotencia da tentativa. Opcional (cliente
    // antigo continua emitindo do mesmo jeito), mas se vier tem que ser UUID —
    // string livre viraria trava permanente no doc do laudo.
    if (emissaoKey !== undefined && !emissaoKeyValida(emissaoKey)) {
      return NextResponse.json(
        { ok: false, motivo: 'dados_invalidos', error: 'emissaoKey invalida' },
        { status: 400 }
      );
    }

    // Nome do arquivo do PDF: DERIVADO NO SERVIDOR (S5-T14, fix I3/ARQ-I2).
    // Antes vinha no corpo da requisicao — o cliente escolhia a chave do
    // objeto do documento legal, e a /api/corrigir-laudo (irma, dona do
    // proprio alvo desde a T5) tinha modelo de confianca oposto no mesmo
    // bucket. Deriva do que o servidor acabou de gravar no exame; o path
    // ainda leva o exameId (pdf-path.ts), entao nome repetido nao colide.
    const nomeArq = `${prefixoArquivoPorTipo((dadosFinais?.tipoExame as string) || '')} ${String(dadosFinais?.pacienteNome || '').trim().toUpperCase()}`.trim();

    // PDF anexado (modalidade 'pdf', Task 5): valida ANTES da transacao de
    // billing abaixo — nao debita franquia de um upload invalido.
    let pdfAnexadoBuf: Buffer | null = null;
    if (pdfBase64) {
      const validacao = validarPdfBase64(pdfBase64);
      if (!validacao.ok) {
        return NextResponse.json({ ok: false, motivo: validacao.motivo }, { status: validacao.status });
      }
      pdfAnexadoBuf = validacao.buf;
    }

    // Autorizacao: papel de medico/dono NESTE local (mesmo criterio da regra
    // `ehMedicoNoLocal`), e o laudo sai assinado por quem esta logado.
    const [papel, perfil] = await Promise.all([
      resolverPapel(dbAdmin, wsId, uid),
      dbAdmin.doc(`profissionais/${uid}`).get(),
    ]);
    if (papel !== 'dono' && papel !== 'medico') {
      return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    }
    if (medicoUid !== uid) {
      return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    }
    // Matriz §4 (D2): quem assina laudo e medico. Dono da conta que e assistente
    // administra tudo menos a caneta. Campo ausente conta como medico — e o
    // default do resto do app (createProfile, dashboard, painel Direx), e exigir
    // presenca travaria perfil antigo em producao.
    if ((perfil.data()?.tipoPerfil ?? 'medico') !== 'medico') {
      return NextResponse.json({ ok: false, motivo: 'nao_medico' }, { status: 403 });
    }

    // ══ 1. TRANSACAO ATOMICA: emitir + cobrar + ledger ══
    // Corpo em src/lib/emitir-admin.ts (S7-T0.3): o unico caminho de dinheiro
    // sem teste de servidor (E9) — extraido pra ganhar bateria, e la mora a
    // trava anti-cobranca-dupla da `emissaoKey` (E1).
    const resultado = await emitirComCobranca(dbAdmin, {
      wsId, exameId, uid, medicoUid, dadosFinais, extras: carimboMotor, emissaoKey,
    });

    if (!resultado.ok) {
      const status: Record<string, number> = { nao_encontrado: 404, exame_de_outro_medico: 403, cancelado: 409 };
      return NextResponse.json(resultado, { status: status[resultado.motivo] ?? 200 });
    }

    // Retry da MESMA tentativa (E1): a emissao ja commitou antes.
    // PDF JA SALVO → devolve o que existe, sem log novo e sem Puppeteer.
    if (resultado.replay && !resultado.pdfPendente) {
      return NextResponse.json({ ok: true, tipo: resultado.tipo, pdfUrl: resultado.pdfUrl, pdfErro: null, replay: true });
    }
    // PDF PENDENTE (C1) → cai no bloco 3 e GERA. Era aqui que o retry dizia
    // "sucesso" com `pdfUrl: null`: a 1a chamada morria no Puppeteer depois da
    // transacao (lambda estourou o maxDuration, aba fechada) e o laudo ficava
    // emitido, cobrado e sem PDF assinado — com as 3 telas dizendo que deu
    // certo. Quem manda regerar e a gaveta server-only, nao a requisicao.

    // ══ 2. AUDIT LOG (nao critico) ══
    // So na emissao NOVA: o replay nao e um ato novo de emissao.
    if (!resultado.replay) {
      try {
        await dbAdmin.collection('logs').add({
          tipo: 'emissao',
          exameId,
          wsId,
          reemissao: !!(dadosFinais.reemissao),
          identificacaoAlterada: !!(dadosFinais.identificacaoAlterada),
          ts: FieldValue.serverTimestamp(),
          medicoUid,
        });
      } catch { /* log nao pode quebrar emissao */ }
    }

    // ══ 3. PDF: gerado do HTML (motor/texto) OU anexado pronto (modalidade
    // 'pdf') — nao critico, a emissao ja foi confirmada na transacao acima.
    // Anexo pula o Puppeteer mas passou pela MESMA transacao — franquia,
    // ledger e log num lugar so (decisao: anexo CONSOME franquia, 15/08/2026).
    let pdfUrl: string | null = null;
    let pdfErro: string | null = null;
    if (pdfAnexadoBuf) {
      try {
        pdfUrl = await salvarPdfBuffer(pdfAnexadoBuf, wsId, exameId, nomeArq);
        await dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`).update({ pdfUrl, pdfErro: FieldValue.delete() });
      } catch (e) {
        pdfErro = 'erro_pdf';   // P10: detalhe (bucket/path) so no log do servidor
        console.error('PDF anexo save error:', e);
        // P4/E4: a emissao JA cobrou. Sem HTML aqui (e anexo pronto) — nao ha
        // o que congelar em snapshot, so a marca no doc pra tela deixar de
        // mentir que o laudo emitido tem PDF.
        await dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`).update({ pdfErro: 'erro_pdf' })
          .catch((e2) => console.error('marcar pdfErro (nao-critico):', e2));
      }
    } else if (pdfHtml) {
      try {
        pdfUrl = await gerarESalvarPdf(pdfHtml, wsId, exameId, nomeArq);
        await dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`).update({ pdfUrl, pdfErro: FieldValue.delete() });
      } catch (e) {
        pdfErro = 'erro_pdf';   // P10: detalhe so no log do servidor
        console.error('PDF gen error:', e);
        // P4/E4: a emissao JA cobrou. Congela o snapshot (sem ele a correcao
        // administrativa deste exame morre pra sempre) e deixa marca no doc —
        // a tela passa a ver o laudo emitido-sem-PDF em vez de ninguem saber.
        // Sem .catch aqui: salvarSnapshotHtml nunca lanca (proprio contrato
        // da funcao, pdf-server.ts) — o .catch(() => {}) era morto.
        await salvarSnapshotHtml(pdfHtml, wsId, exameId, sanitizarNomeArq(nomeArq, exameId));
        await dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`).update({ pdfErro: 'erro_pdf' })
          .catch((e2) => console.error('marcar pdfErro (nao-critico):', e2));
      }
    }

    // Baixa a bandeira de "PDF pendente" (C1) — SO com um PDF salvo de fato,
    // pra bandeira baixa significar exatamente "existe PDF assinado". Dai em
    // diante o retry da mesma tentativa e replay puro. Se esta escrita falhar
    // (ou o lambda morrer aqui), o pior caso e o proximo retry regerar o PDF:
    // mesmo efeito, nunca cobranca nova.
    if (pdfUrl) {
      await marcarPdfPronto(dbAdmin, wsId, exameId)
        .catch((e) => console.error('marcar PDF pronto (nao-critico):', e));
    }

    return NextResponse.json({
      ok: true,
      tipo: resultado.tipo,
      pdfUrl,
      pdfErro,
      ...(resultado.replay ? { replay: true } : {}),
    });
  } catch (e) {
    console.error('API /emitir error:', e);
    const msg = (e as Error).message || 'Erro interno';
    return NextResponse.json({ ok: false, motivo: 'erro', error: msg }, { status: 500 });
  }
}
