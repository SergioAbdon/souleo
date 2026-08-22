// ══════════════════════════════════════════════════════════════════
// LEO · API Route — /api/exame: apagar | cancelar | transferir
// Auth verificada (padrao do /api/signup). A logica vive em
// src/lib/exame-admin.ts (testada no emulador); aqui so a composicao:
// token → assinatura (billing-admin) → acao → Storage real.
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage, requireUid } from '@/lib/auth-admin';
import { resolverAssinatura } from '@/lib/billing-admin';
import { apagarExame, cancelarExame, transferirExame } from '@/lib/exame-admin';
import { apagarImagensExame } from '@/lib/imagens-dicom-admin';

export const runtime = 'nodejs';

// pdfUrl publico → caminho no bucket → delete. Formato de pdf-server.ts:85.
// Confinado ao local da acao: o pdfUrl vem do doc do exame, e um doc adulterado
// (o autor edita o proprio exame pela regra) apontaria para o laudo de outra
// clinica. Fora de `laudos/{wsId}/` nao apaga nada.
function apagadorDePdf(wsId: string) {
  return async (url: string) => {
    const bucket = adminStorage().bucket();
    const prefixo = `https://storage.googleapis.com/${bucket.name}/`;
    if (!url.startsWith(prefixo)) return;
    const caminho = decodeURIComponent(url.slice(prefixo.length));
    if (!caminho.startsWith(`laudos/${wsId}/`)) {
      console.error('apagarPdf: caminho fora do local da acao, ignorado:', caminho);
      return;
    }
    await bucket.file(caminho).delete({ ignoreNotFound: true });
  };
}

const ACOES = { apagar: apagarExame, cancelar: cancelarExame, transferir: transferirExame } as const;
const STATUS: Record<string, number> = {
  sem_permissao: 403, nao_encontrado: 404, nao_emitido: 409, alvo_invalido: 400,
};

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  try {
    const { acao, wsId, exameId, motivo, novoMedicoUid } = await req.json();
    const executar = ACOES[acao as keyof typeof ACOES];
    if (!executar || !wsId || !exameId) {
      return NextResponse.json({ ok: false, motivo: 'dados_invalidos' }, { status: 400 });
    }
    const dbAdmin = adminDb();
    const assinatura = await resolverAssinatura(dbAdmin, wsId);
    const r = await executar(dbAdmin, {
      wsId, exameId, uid, motivo, novoMedicoUid,
      subRef: assinatura?.ref ?? null, apagarPdf: apagadorDePdf(wsId),
      apagarImagens: async (w, e) => { await apagarImagensExame(adminStorage().bucket(), w, e); },
    });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[(r as { motivo: string }).motivo] ?? 500 });
  } catch (e) {
    console.error('API /exame:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
