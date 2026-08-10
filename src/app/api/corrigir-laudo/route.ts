// ══════════════════════════════════════════════════════════════════
// LEO · API — Corrigir dados ADMINISTRATIVOS de laudo emitido
// SOMENTE convênio + médico solicitante (balde "não-fraude").
// SEM transação de billing, SEM crédito. Regera o PDF.
// Identidade (nome/CPF/datas) NÃO passa por aqui — segue travada.
// Decidido c/ Dr. Sérgio 17/05 (Phase E).
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { gerarESalvarPdf } from '@/lib/pdf-server';
import { requireUid, adminDb } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';

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
    const { wsId, exameId, convenio, solicitante, pdfHtml, nomeArq } = body as {
      wsId: string;
      exameId: string;
      convenio?: string;
      solicitante?: string;
      pdfHtml?: string;
      nomeArq?: string;
    };

    if (!wsId || !exameId) {
      return NextResponse.json(
        { ok: false, error: 'wsId e exameId sao obrigatorios' },
        { status: 400 },
      );
    }

    // So dono/medico do local corrigem dados administrativos (matriz §4).
    const papel = await resolverPapel(dbAdmin, wsId, uid);
    if (papel !== 'dono' && papel !== 'medico') {
      return NextResponse.json({ ok: false, error: 'sem_permissao' }, { status: 403 });
    }

    const ref = dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'exame nao encontrado' }, { status: 404 });
    }
    const antes = snap.data() || {};

    // Atualiza SÓ os 2 campos administrativos no TOPO (fonte única — Phase B).
    // NÃO toca emitidoEm/status/medidas/billing. Sem crédito.
    await ref.update({
      convenio: convenio ?? '',
      solicitante: solicitante ?? '',
      atualizadoEm: FieldValue.serverTimestamp(),
    });

    // Regera o PDF (decisão Dr. Sérgio: o PDF tem que sair corrigido também,
    // não só o banco). Não-crítico — a correção do dado já foi gravada.
    let pdfUrl: string | null = null;
    let pdfErro: string | null = null;
    if (pdfHtml && nomeArq) {
      try {
        pdfUrl = await gerarESalvarPdf(pdfHtml, wsId, exameId, nomeArq);
        await ref.update({ pdfUrl });
      } catch (e) {
        pdfErro = e instanceof Error ? e.message : 'erro_pdf';
        console.error('corrigir-laudo PDF error:', pdfErro);
      }
    }

    // Auditoria (não-crítico) — mantém glosa/extrato confiáveis (de→para).
    try {
      await dbAdmin.collection('logs').add({
        tipo: 'correcao_admin',
        wsId,
        exameId,
        medicoUid: uid,
        de: { convenio: antes.convenio ?? '', solicitante: antes.solicitante ?? '' },
        para: { convenio: convenio ?? '', solicitante: solicitante ?? '' },
        ts: FieldValue.serverTimestamp(),
      });
    } catch { /* log nao pode quebrar a correcao */ }

    return NextResponse.json({ ok: true, pdfUrl, pdfErro });
  } catch (e) {
    console.error('API /corrigir-laudo error:', e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'Erro interno' },
      { status: 500 },
    );
  }
}
