// ══════════════════════════════════════════════════════════════════
// LEO · Imagens DICOM — signed URL + remoção no Storage (D5b, achado 20)
// Objetos nascem privados desde apps/wader/src/adapters/storage-uploader.ts
// (D5b): a URL canônica gravada no exame (storage.googleapis.com/...) virou
// IDENTIFICADOR ESTÁVEL, não mais link direto. Quem exibe/imprime troca por
// signed URL de curta duração via Admin SDK — este arquivo é o ponto único,
// usado por /api/exame/imagens-urls (galeria, Task 12), pdf-server.ts
// (emissão/correção de laudo) e exame-admin.ts (exclusão do exame).
// ══════════════════════════════════════════════════════════════════
import type { Bucket } from '@google-cloud/storage';
import type { Firestore } from 'firebase-admin/firestore';

const UMA_HORA_MS = 60 * 60 * 1000;

// URL canônica → path relativo no bucket. Formato gravado pelo upload
// (storage-uploader.ts): https://storage.googleapis.com/{bucket}/{path
// url-encoded}. Serve tanto pros 182 exames legados (sem imagensDicomDetalhes)
// quanto de conferência pro path já resolvido.
export function derivarPathDeUrl(url: string, bucketName: string): string | null {
  const prefixo = `https://storage.googleapis.com/${bucketName}/`;
  if (!url.startsWith(prefixo)) return null;
  try {
    return decodeURIComponent(url.slice(prefixo.length));
  } catch {
    return null;
  }
}

type ImagemDetalhe = { url?: string; path?: string };

// Path por imagem: prefere imagensDicomDetalhes[].path (gravado pelo Wader
// junto da URL — dicom-ingest.ts); cai pra derivar da própria URL canônica
// em imagensDicom pros exames legados sem detalhes.
//
// Confinamento (achado CRITICAL da revisão): url/path vêm do doc do exame,
// editável pelo médico-autor via regra — sem confinamento a rota assinaria
// QUALQUER objeto do bucket (ex.: laudo de outra clínica). Mesmo padrão do
// vizinho apagadorDePdf em src/app/api/exame/route.ts:16-30: wsId/exameId
// SEMPRE vêm do chamador (nunca do doc), e todo path fora do prefixo é
// descartado antes de assinar.
function paresUrlPath(
  exame: Record<string, unknown>, bucketName: string, wsId: string, exameId: string,
): Array<{ url: string; path: string }> {
  const urls = ((exame.imagensDicom as string[] | undefined) ?? []).filter(Boolean);
  if (urls.length === 0) return [];
  const detalhes = (exame.imagensDicomDetalhes as ImagemDetalhe[] | undefined) ?? [];
  const porUrl = new Map(detalhes.filter((d) => d.url && d.path).map((d) => [d.url as string, d.path as string]));
  const prefixo = `dicom/${wsId}/${exameId}/`;
  const pares: Array<{ url: string; path: string }> = [];
  for (const url of urls) {
    const path = porUrl.get(url) ?? derivarPathDeUrl(url, bucketName);
    if (path && path.startsWith(prefixo)) pares.push({ url, path });
  }
  return pares;
}

// { urlCanonica: urlAssinada } pras imagens do exame, válidas por 1h.
// Exame sem imagens (ou inexistente) → {}.
export async function assinarImagensExame(
  db: Firestore, bucket: Bucket, wsId: string, exameId: string,
): Promise<Record<string, string>> {
  const snap = await db.doc(`workspaces/${wsId}/exames/${exameId}`).get();
  if (!snap.exists) return {};
  const pares = paresUrlPath(snap.data()!, bucket.name, wsId, exameId);
  if (pares.length === 0) return {};
  const expires = Date.now() + UMA_HORA_MS;
  const entradas = await Promise.all(pares.map(async ({ url, path }) => {
    const [assinada] = await bucket.file(path).getSignedUrl({ action: 'read', expires });
    return [url, assinada] as const;
  }));
  return Object.fromEntries(entradas);
}

// Troca cada URL canônica pela signed URL correspondente dentro de um HTML
// (usado no PDF: Puppeteer busca as imagens via rede, sem a credencial do
// Admin SDK — <img src> na URL canônica privada daria 403).
export function assinarUrlsNoHtml(html: string, urls: Record<string, string>): string {
  let out = html;
  for (const [canonica, assinada] of Object.entries(urls)) {
    out = out.split(canonica).join(assinada);
  }
  return out;
}

// Remove todas as imagens do exame no Storage (exclusão — achado 20: hoje
// ninguém chama isso do lado web). Mesmo prefixo do Wader (storage-uploader.ts
// / removerImagensExame).
export async function apagarImagensExame(bucket: Bucket, wsId: string, exameId: string): Promise<number> {
  const prefix = `dicom/${wsId}/${exameId}/`;
  const [files] = await bucket.getFiles({ prefix });
  if (files.length === 0) return 0;
  await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
  return files.length;
}
