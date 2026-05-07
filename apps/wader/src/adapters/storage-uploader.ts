import { getFbStorage } from './firebase';
import { createLogger } from '../logger';

const log = createLogger({ module: 'storage-uploader' });

export interface UploadResult {
  path: string; // caminho relativo no bucket (ex: dicom/wader-dev/abc123/001.jpg)
  url: string; // signed URL pra acesso (válida por 7 dias) OU public URL
  bytes: number;
}

/**
 * Sobe imagem JPG/PNG pro Firebase Storage.
 *
 * Layout do bucket (alinhado com schema do LEO web):
 *   dicom/{wsId}/{exameId}/{seq}.jpg
 *
 * As regras do Storage (storage.rules) já permitem leitura pública em `dicom/`
 * pra que o LEO web e o PDF puppeteer possam ler sem autenticação extra.
 */
export async function uploadDicomPreview(opts: {
  wsId: string;
  exameId: string;
  seq: number;
  buffer: Buffer;
  contentType?: string;
}): Promise<UploadResult> {
  const ext = (opts.contentType ?? 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const seqStr = String(opts.seq).padStart(3, '0');
  const path = `dicom/${opts.wsId}/${opts.exameId}/${seqStr}.${ext}`;

  const bucket = getFbStorage().bucket();
  const file = bucket.file(path);

  await file.save(opts.buffer, {
    contentType: opts.contentType ?? 'image/jpeg',
    metadata: {
      cacheControl: 'public, max-age=31536000', // 1 ano (imagens DICOM são imutáveis)
      metadata: {
        wsId: opts.wsId,
        exameId: opts.exameId,
        seq: String(opts.seq),
      },
    },
  });

  // Public URL via storage.googleapis.com
  // Em produção, dependendo das storage.rules, a URL pública direta funciona.
  // Alternativamente, signed URL pra controle de tempo.
  const url = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(path)}`;

  log.info(
    { path, bytes: opts.buffer.length, exameId: opts.exameId, seq: opts.seq },
    'Preview enviado pro Storage',
  );

  return { path, url, bytes: opts.buffer.length };
}

/**
 * Remove todas as imagens de um exame (cleanup quando exame é deletado/cancelado).
 */
export async function removerImagensExame(wsId: string, exameId: string): Promise<number> {
  const bucket = getFbStorage().bucket();
  const prefix = `dicom/${wsId}/${exameId}/`;
  const [files] = await bucket.getFiles({ prefix });
  if (files.length === 0) return 0;
  await Promise.all(files.map((f) => f.delete()));
  log.info({ wsId, exameId, removidos: files.length }, 'Imagens removidas do Storage');
  return files.length;
}
