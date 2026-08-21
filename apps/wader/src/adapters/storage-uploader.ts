import { getFbStorage } from './firebase';
import { createLogger } from '../logger';

const log = createLogger({ module: 'storage-uploader' });

export interface UploadResult {
  path: string; // caminho relativo no bucket (ex: dicom/wader-dev/abc123/{orthancInstanceId}.jpg)
  url: string; // signed URL pra acesso (válida por 7 dias) OU public URL
  bytes: number;
}

/**
 * Sobe imagem JPG/PNG pro Firebase Storage.
 *
 * Layout do bucket (alinhado com schema do LEO web):
 *   dicom/{wsId}/{exameId}/{orthancInstanceId}.jpg
 *
 * Path por instância (achado 18/12, ADR 2026-08-21): antes era `{seq}.jpg`
 * (posição no array) — reprocesso mudava a ordem/sobrava lixo quando o
 * conjunto de instances mudava entre tentativas. Agora o nome do arquivo É
 * o id da instance no Orthanc: reprocessar a mesma instance sobrescreve o
 * mesmo objeto (idempotente) e o cache de 1 ano vira verdade (nome =
 * conteúdo). `seq` continua existindo só pra ordenar o array no Firestore.
 *
 * Visibilidade pública via `predefinedAcl: 'publicRead'` (decisão 14/05/2026):
 * - URLs `storage.googleapis.com/{bucket}/{path}` são acessadas via IAM, não
 *   pelas Firebase Storage Rules. Por isso a regra `match /dicom/...` em
 *   storage.rules NÃO basta — também precisa flag de ACL pública no objeto.
 * - Comentário antigo dizia que as rules sozinhas resolviam — mentira: o
 *   `<img src={url}>` no browser sempre dava 403 antes deste fix.
 *
 * Escrita continua bloqueada pelo browser (regras do storage.rules); só o
 * Wader (admin SDK) sobe.
 */
export async function uploadDicomPreview(opts: {
  wsId: string;
  exameId: string;
  instanceId: string;
  seq: number;
  buffer: Buffer;
  contentType?: string;
}): Promise<UploadResult> {
  const ext = (opts.contentType ?? 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `dicom/${opts.wsId}/${opts.exameId}/${opts.instanceId}.${ext}`;

  const bucket = getFbStorage().bucket();
  const file = bucket.file(path);

  await file.save(opts.buffer, {
    contentType: opts.contentType ?? 'image/jpeg',
    predefinedAcl: 'publicRead', // ⬅️ libera leitura anônima via storage.googleapis.com
    metadata: {
      cacheControl: 'public, max-age=31536000', // 1 ano (imagens DICOM são imutáveis)
      metadata: {
        wsId: opts.wsId,
        exameId: opts.exameId,
        seq: String(opts.seq),
      },
    },
  });

  // URL pública direta via storage.googleapis.com — funciona porque o objeto
  // tem ACL `publicRead` (setada no `.save()` acima).
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
