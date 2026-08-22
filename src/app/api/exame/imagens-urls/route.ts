// ══════════════════════════════════════════════════════════════════
// LEO · API — Signed URLs pras imagens DICOM de um exame (D5b, achado 20)
// Objetos no Storage nascem privados (storage-uploader.ts do Wader); a
// galeria (Task 12) troca a URL canônica gravada no exame por uma destas
// (válida 1h). Mesmo gate de membro das rotas vizinhas (/api/exame).
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminStorage, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';
import { assinarImagensExame } from '@/lib/imagens-dicom-admin';
import { idValido } from '@/lib/convite-server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  try {
    const { wsId, exameId } = await req.json();
    // id malformado (fora do charset de doc-id) reconstruiria um path
    // errado no Admin SDK e estourava 500 mais adiante — 400 aqui, igual
    // /api/convite/info.
    if (!idValido(wsId) || !idValido(exameId)) {
      return NextResponse.json({ ok: false, motivo: 'dados_invalidos' }, { status: 400 });
    }
    const dbAdmin = adminDb();
    // Membro (dono/medico/recepcao) do local — mesmo criterio de acesso
    // usado pra ver o exame na tela, sem exigir papel especifico (leitura
    // de galeria, nao acao destrutiva).
    const papel = await resolverPapel(dbAdmin, wsId, uid);
    if (!papel) {
      return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    }
    const urls = await assinarImagensExame(dbAdmin, adminStorage().bucket(), wsId, exameId);
    return NextResponse.json({ ok: true, urls });
  } catch (e) {
    console.error('API /exame/imagens-urls:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
