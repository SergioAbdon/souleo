// ══════════════════════════════════════════════════════════════════
// LEO v3 · API Route — Emissao atomica de laudo + PDF
// Transacao server-side: emitir exame + cobrar billing atomicamente
// + gerar PDF via Puppeteer e salvar pdfUrl tudo em uma chamada
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { gerarESalvarPdf } from '@/lib/pdf-server';
import { salvarPdfBuffer, salvarSnapshotHtml, apagarPdfObjeto } from '@/lib/pdf-storage';
import { validarPdfBase64 } from '@/lib/pdf-validacao';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';
import {
  emitirComCobranca, emissaoKeyValida, publicarPdfSeAindaDono, marcarPdfErroSeAindaDono, refEmissaoPrivada,
} from '@/lib/emitir-admin';
import { prefixoArquivoPorTipo } from '@/lib/dicom-sr-mapping';

// ── Config Next.js ──
export const runtime = 'nodejs';
export const maxDuration = 60;

// PDF server-side extraído p/ src/lib/pdf-server.ts (Puppeteer) e
// src/lib/pdf-storage.ts (Storage puro) — reuso entre /api/emitir e
// /api/corrigir-laudo, 1 pipeline só.

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
    // S7-T0.3 (E1): chave de idempotencia da tentativa.
    // Round 4 (Codex): OBRIGATORIA — os 3 clientes de producao (laudo/[id],
    // laudo-texto/[id], AnexarPdfModal) mandam desde a onda 0; "legado sem
    // key" nunca foi um cliente real, so uma janela aberta enquanto a API
    // aceitasse a chamada sem ela (idempotencia, ponteiro/bandeira atomicos e
    // path unico por tentativa dependem TODOS da key existir). Aba aberta
    // antes deste deploy so precisa de F5.
    if (!emissaoKeyValida(emissaoKey)) {
      return NextResponse.json(
        { ok: false, motivo: 'dados_invalidos', error: 'emissaoKey obrigatoria — recarregue a pagina' },
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

    // Round 3 (Codex Critical, item 1) + round 4 (item 2): PATH ÚNICO POR
    // TENTATIVA. Sem isto, 2 uploads do MESMO paciente/tipo (retry, corrida
    // de reemissão) escrevem o MESMO objeto no Storage — o perdedor podia
    // sobrescrever os BYTES do vencedor, ou ressuscitar a URL já distribuída
    // de um laudo cancelado (reemissão → cancel → upload atrasado). Sufixo
    // com a emissaoKey INTEIRA (round 4 — 8 chars era colidível de propósito,
    // a key vem do cliente) ANTES de sanitizar; `sanitizarNomeArq` preserva
    // hifens/hex (só filtra fora de `[A-Za-z0-9À-ÿ _-]`, e `-` está na
    // lista). Sempre presente agora — emissaoKey é obrigatória (round 4,
    // item 1), sem ramo "legado sem sufixo" pra reabrir a janela. Efeito
    // colateral cosmético aceito (Ponytail — mudar a assinatura de
    // salvarPdfBuffer só pra manter o `contentDisposition` limpo não vale a
    // complexidade): o nome de download que o paciente vê também carrega a key.
    const nomeArqTentativa = `${nomeArq} ${emissaoKey}`;

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
      // E16: recusa de billing (sem_plano/sem_saldo/expirado) saia como HTTP
      // 200 — corpo `ok:false` dizia a verdade, mas o status mentia "deu
      // certo" pra qualquer proxy/monitoramento que olhasse so o codigo.
      // 402 (Payment Required) e o status honesto pra recusa de cobranca.
      const status: Record<string, number> = {
        nao_encontrado: 404, exame_de_outro_medico: 403, cancelado: 409,
        sem_plano: 402, sem_saldo: 402, expirado: 402,
      };
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
    // E3: os carimbos vem de `resultado` (derivados no servidor dentro da
    // transacao, exameSnap x dadosFinais) — nao mais de `dadosFinais`, que e
    // o corpo cru que o cliente mandou e podia mentir (reemitir trocando
    // nome/CPF e logar identificacaoAlterada:false). Os clientes podem
    // continuar mandando os flags; o servidor simplesmente ignora.
    if (!resultado.replay) {
      try {
        await dbAdmin.collection('logs').add({
          tipo: 'emissao',
          exameId,
          wsId,
          reemissao: resultado.reemissao,
          identificacaoAlterada: resultado.identificacaoAlterada,
          ts: FieldValue.serverTimestamp(),
          medicoUid,
        });
      } catch { /* log nao pode quebrar emissao */ }

      // E11 opcao D (ADR 2026-08-30): o giro ja commitou DENTRO da transacao
      // acima — isto e so auditoria, mesmo padrao do log 'emissao' logo
      // acima (nao critico, fora da transacao).
      if (resultado.girou) {
        try {
          await dbAdmin.collection('logs').add({
            tipo: 'renovacao_ciclo',
            wsId,
            exameId,
            cicloFimAnterior: resultado.cicloFimAnterior,
            cicloFimNovo: resultado.cicloFimNovo,
            ts: FieldValue.serverTimestamp(),
            medicoUid,
          });
        } catch { /* log nao pode quebrar emissao */ }
      }
    }

    // ══ 3. PDF: gerado do HTML (motor/texto) OU anexado pronto (modalidade
    // 'pdf') — nao critico, a emissao ja foi confirmada na transacao acima.
    // Anexo pula o Puppeteer mas passou pela MESMA transacao — franquia,
    // ledger e log num lugar so (decisao: anexo CONSOME franquia, 15/08/2026).
    let pdfUrl: string | null = null;
    let pdfErro: string | null = null;

    // Cerca de publicacao PRE-upload (triade C1/C2): a transacao acima
    // commitou ha 15-60s quando o Puppeteer termina — nesse meio tempo o
    // exame pode ter sido CANCELADO ou TRANSFERIDO (limparPdf ja rodou;
    // publicar agora ressuscitaria um PDF publico de laudo cancelado) ou
    // REEMITIDO com key nova. So chama Puppeteer/Storage se o exame ainda
    // esta emitido E se a gaveta privada ainda pertence a ESTA tentativa —
    // poupa trabalho na corrida mais comum.
    // ATENCAO (round 2, Codex): esta cerca sozinha e check-then-write — quem
    // decide o PONTEIRO de verdade e `publicarPdfSeAindaDono` mais abaixo,
    // atomica com a baixa da bandeira `pdfPendente` (fecha o C4: reemissao
    // nova commitando durante o Puppeteer da tentativa perdedora nao tem
    // mais a bandeira dela apagada pelo perdedor).
    const podePublicar = async (): Promise<boolean> => {
      const [d, g] = await Promise.all([
        dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`).get(),
        refEmissaoPrivada(dbAdmin, wsId, exameId).get(),
      ]);
      return d.data()?.status === 'emitido' && g.data()?.emissaoKey === emissaoKey;
    };

    if (pdfAnexadoBuf) {
      // Sem Puppeteer aqui — janela menor, mas o mesmo buraco (achado C1/C2):
      // confere a cerca ANTES de subir o buffer.
      if (await podePublicar()) {
        try {
          const url = await salvarPdfBuffer(pdfAnexadoBuf, wsId, exameId, nomeArqTentativa);
          // Round 7 (Ruflo item 1): declaraSnapshotSufixado:true mesmo aqui
          // — o anexo NUNCA tem HTML/snapshot pra congelar, mas sem a flag
          // um leitor futuro (lerSnapshotHtml) cairia no canonico de uma
          // emissao ANTERIOR deste mesmo exame. Declarar "sufixado, sem
          // fallback" e o correto mesmo sem nada sufixado existir: honesto
          // (devolve null) em vez de recuperar corpo clinico velho.
          if (await publicarPdfSeAindaDono(dbAdmin, { wsId, exameId, pdfUrl: url, emissaoKey, declaraSnapshotSufixado: true })) {
            pdfUrl = url;
          } else {
            // Round 3 (Codex Critical, item 2): perdeu a corrida DEPOIS da
            // cerca pre-upload — apaga o objeto que ELA MESMA acabou de
            // subir. Seguro por construcao: o path e exclusivo desta
            // tentativa (sufixo de emissaoKey), ninguem mais escreve nele.
            pdfErro = 'conflito_pos_emissao';
            await apagarPdfObjeto(wsId, exameId, nomeArqTentativa);
            console.warn(`emitir: PDF (anexo) perdeu a corrida — objeto orfao apagado (ws=${wsId} exame=${exameId})`);
          }
        } catch (e) {
          pdfErro = 'erro_pdf';   // P10: detalhe (bucket/path) so no log do servidor
          console.error('PDF anexo save error:', e);
          // P4/E4: a emissao JA cobrou. Sem HTML aqui (e anexo pronto) — nao ha
          // o que congelar em snapshot, so a marca no doc pra tela deixar de
          // mentir que o laudo emitido tem PDF. Round 3 (Codex Important,
          // item 3): marca dentro de transacao condicional — sem isto o
          // catch da tentativa A podia carimbar pdfErro no exame que B
          // acabou de reemitir com sucesso enquanto A ainda falhava.
          await marcarPdfErroSeAindaDono(dbAdmin, { wsId, exameId, emissaoKey })
            .catch((e2) => console.error('marcar pdfErro (nao-critico):', e2));
        }
      } else {
        // C1/C2: o exame ja nao e mais desta emissao (cancelado/transferido/
        // reemitido) — nao escreve NADA no doc, ele nao pertence mais a esta
        // tentativa.
        pdfErro = 'conflito_pos_emissao';
      }
    } else if (pdfHtml) {
      try {
        // podeSalvar (I4, mesmo mecanismo de corrigir-laudo): checado DEPOIS
        // do page.pdf e ANTES de salvarPdfBuffer, dentro de gerarESalvarPdf —
        // ordem certa, nao reordenar. O TOCTOU residual entre o check e o
        // save e a mesma janela ja aceita pelo fix I4/P15 — fechado pro
        // path unico (round 3+4, item 1/2): 2 tentativas nunca escrevem o
        // MESMO objeto, entao a janela vira so higiene de orfao, nao corrupcao.
        const url = await gerarESalvarPdf(pdfHtml, wsId, exameId, nomeArqTentativa, podePublicar);
        if (url === null) {
          // C1/C2: podePublicar recusou — mesmo raciocinio do braco de anexo
          // acima, nao escreve nada no doc.
          pdfErro = 'conflito_pos_emissao';
        } else if (await publicarPdfSeAindaDono(dbAdmin, { wsId, exameId, pdfUrl: url, emissaoKey, declaraSnapshotSufixado: true })) {
          pdfUrl = url;
          // Round 4 (Codex Critical, item 3): o snapshot SO congela DEPOIS
          // da publicacao CONFIRMADA — gravar antes (dentro de
          // gerarESalvarPdf, como era ate o round 3) deixava uma tentativa
          // PERDEDORA sobrescrever o snapshot da VENCEDORA. Round 5 (Codex
          // Critical): isso sozinho nao bastava — o snapshot era canonico
          // POR EXAME, entao um snapshot ATRASADO de uma tentativa A (que
          // publicou, mas demorou pra chegar aqui) ainda sobrescrevia o de
          // uma tentativa B que reemitiu e publicou DEPOIS. `{ emissaoKey }`
          // sufixa o path por TENTATIVA (igual ao PDF desde o round 3) — o
          // snapshot atrasado de A vai pro objeto de A, nunca toca o de B.
          await salvarSnapshotHtml(pdfHtml, wsId, exameId, nomeArqTentativa, { emissaoKey });
        } else {
          // Round 3 (item 2): mesma limpeza do braco de anexo. Perdedor
          // NUNCA chega perto do snapshot (round 4, item 3) — so o vencedor,
          // no braco acima.
          pdfErro = 'conflito_pos_emissao';
          await apagarPdfObjeto(wsId, exameId, nomeArqTentativa);
          console.warn(`emitir: PDF perdeu a corrida — objeto orfao apagado (ws=${wsId} exame=${exameId})`);
        }
      } catch (e) {
        pdfErro = 'erro_pdf';   // P10: detalhe so no log do servidor
        console.error('PDF gen error:', e);
        // P4/E4: a emissao JA cobrou. Congela o snapshot (sem ele a correcao
        // administrativa deste exame morre pra sempre) e deixa marca no doc —
        // a tela passa a ver o laudo emitido-sem-PDF em vez de ninguem saber.
        // Round 4 (Codex Critical, item 3): o snapshot de RECUPERACAO so e
        // salvo se marcarPdfErroSeAindaDono confirmar que AINDA somos donos
        // — antes o snapshot era gravado incondicionalmente aqui, e uma
        // tentativa perdedora podia sobrescrever o snapshot da vencedora do
        // MESMO jeito que o braco de sucesso (mesmo bug, caminho de erro).
        try {
          // Round 6: declaraSnapshotSufixado:true — este e o UNICO dos 3 call
          // sites de marcarPdfErroSeAindaDono que realmente tenta salvar um
          // snapshot sufixado logo depois (o catch do anexo nunca tem HTML; o
          // catch de corrigir-laudo nunca regrava snapshot).
          if (await marcarPdfErroSeAindaDono(dbAdmin, { wsId, exameId, emissaoKey, declaraSnapshotSufixado: true })) {
            // Nome CRU e JA COM O SUFIXO da tentativa: salvarSnapshotHtml
            // sanitiza sozinha (Ruflo-5). `{ emissaoKey }` sufixa o OBJETO do
            // snapshot por tentativa tambem (round 5) — mesmo raciocinio do
            // braco de sucesso acima.
            await salvarSnapshotHtml(pdfHtml, wsId, exameId, nomeArqTentativa, { emissaoKey });
          }
        } catch (e2) {
          console.error('marcar pdfErro (nao-critico):', e2);
        }
      }
    }

    // A bandeira `pdfPendente` ja foi baixada ATOMICAMENTE com o pdfUrl
    // dentro de `publicarPdfSeAindaDono` acima (round 2) — nao ha mais
    // escrita separada aqui (era o C4: escrita separada deixava o PERDEDOR
    // de uma corrida apagar a bandeira do VENCEDOR).

    return NextResponse.json({
      ok: true,
      tipo: resultado.tipo,
      pdfUrl,
      pdfErro,
      ...(resultado.replay ? { replay: true } : {}),
    });
  } catch (e) {
    // E15: espelho exato de corrigir-laudo — detalhe (stack, path de bucket,
    // mensagem crua do Firestore/Puppeteer) so no log do servidor. Antes a
    // mensagem do erro ia inteira pro corpo da resposta (`error: msg`).
    console.error('API /emitir error:', e);
    return NextResponse.json({ ok: false, motivo: 'erro', error: 'erro_interno' }, { status: 500 });
  }
}
