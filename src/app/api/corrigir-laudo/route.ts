// ══════════════════════════════════════════════════════════════════
// LEO · API — Corrigir dados ADMINISTRATIVOS de laudo emitido
// SOMENTE convênio + médico solicitante (balde "não-fraude").
// SEM transação de billing, SEM crédito. Regera o PDF.
// Identidade (nome/CPF/datas) NÃO passa por aqui — segue travada.
// Decidido c/ Dr. Sérgio 17/05 (Phase E).
//
// S5-T5 (D4, 25/08): a rota NÃO aceita mais `pdfHtml` do cliente. Aceitar
// significava que, sob o pretexto de trocar o nome do convênio, qualquer
// autor autenticado regravava o PDF assinado inteiro (medidas, conclusão,
// assinatura) sem consumir crédito e sem passar pelo /api/emitir. Agora o
// servidor carrega o SNAPSHOT do HTML emitido e troca só os 2 valores.
// E recepção corrige convênio/solicitante — é dado de recepção, não ato médico.
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { gerarESalvarPdf, lerSnapshotHtml } from '@/lib/pdf-server';
import { requireUid, adminDb } from '@/lib/auth-admin';
import { resolverPapel, podeCorrigir } from '@/lib/exame-admin';
import { substituirCamposAdministrativos, nomeArqDoPdfUrl } from '@/lib/correcao-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const dbAdmin = adminDb();

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, error: 'nao_autenticado' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { wsId, exameId, convenio, solicitante } = body as {
      wsId: string;
      exameId: string;
      convenio?: string;
      solicitante?: string;
    };

    if (!wsId || !exameId) {
      return NextResponse.json(
        { ok: false, error: 'wsId e exameId sao obrigatorios' },
        { status: 400 },
      );
    }

    // D4: dono, medico-autor E recepcao do local. Quem nao tem vinculo ativo
    // (papel null) cai no podeCorrigir abaixo como 'sem_permissao'.
    const papel = await resolverPapel(dbAdmin, wsId, uid);
    if (!papel) {
      return NextResponse.json({ ok: false, error: 'sem_permissao' }, { status: 403 });
    }

    const ref = dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'exame nao encontrado' }, { status: 404 });
    }
    const antes = snap.data() || {};

    // Correção é pós-emissão e respeita autoria (matriz §4): dono corrige
    // qualquer um, médico só os seus. Rascunho/aguardando não passa por aqui.
    const decisao = podeCorrigir(papel, antes.status, antes.medicoUid, uid);
    if (!decisao.ok) {
      return NextResponse.json(
        { ok: false, error: decisao.motivo },
        { status: decisao.motivo === 'nao_emitido' ? 409 : 403 },
      );
    }
    // Correção NÃO é ato médico e não consome crédito: recepção corrige o
    // convênio errado sem chamar o médico. Por isso nada aqui toca no
    // conteúdo clínico — o HTML vem do snapshot, não do navegador.

    // Atualiza SÓ os 2 campos administrativos no TOPO (fonte única — Phase B).
    // NÃO toca emitidoEm/status/medidas/billing. Sem crédito.
    await ref.update({
      convenio: convenio ?? '',
      solicitante: solicitante ?? '',
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    // Regera o PDF a partir do SNAPSHOT congelado na emissão (decisão Dr.
    // Sérgio: o PDF tem que sair corrigido também, não só o banco). Não-crítico
    // — a correção do dado já foi gravada. Emitido antigo (sem snapshot) ou
    // template sem os blocos-âncora: NÃO regera, avisa `pdfDesatualizado` e o
    // médico reemite se quiser. Melhor PDF velho que PDF adulterado.
    let pdfUrl: string | null = null;
    let pdfErro: string | null = null;
    let pdfDesatualizado = false;
    const snapshot = await lerSnapshotHtml(wsId, exameId);
    const htmlCorrigido = snapshot && substituirCamposAdministrativos(snapshot, { convenio, solicitante });
    if (htmlCorrigido) {
      try {
        // Mesmo nome de arquivo da emissão: regrava o MESMO objeto, o link já
        // entregue ao paciente/convênio continua valendo.
        pdfUrl = await gerarESalvarPdf(htmlCorrigido, wsId, exameId, nomeArqDoPdfUrl(antes.pdfUrl));
        await ref.update({ pdfUrl });
      } catch (e) {
        pdfErro = e instanceof Error ? e.message : 'erro_pdf';
        console.error('corrigir-laudo PDF error:', pdfErro);
      }
    } else {
      pdfDesatualizado = true;
    }

    // Auditoria (não-crítico) — mantém glosa/extrato confiáveis (de→para).
    try {
      await dbAdmin.collection('logs').add({
        tipo: 'correcao_admin',
        wsId,
        exameId,
        medicoUid: uid,
        papel,
        de: { convenio: antes.convenio ?? '', solicitante: antes.solicitante ?? '' },
        para: { convenio: convenio ?? '', solicitante: solicitante ?? '' },
        pdfDesatualizado,
        ts: FieldValue.serverTimestamp(),
      });
    } catch { /* log nao pode quebrar a correcao */ }

    return NextResponse.json({ ok: true, pdfUrl, pdfErro, pdfDesatualizado });
  } catch (e) {
    console.error('API /corrigir-laudo error:', e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'Erro interno' },
      { status: 500 },
    );
  }
}
