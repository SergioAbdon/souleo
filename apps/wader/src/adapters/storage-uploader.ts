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
 * Privado por padrão (D5b, achado 20 — 22/08/2026): objeto nasce SEM
 * `predefinedAcl: 'publicRead'`. Até aqui (decisão 14/05/2026) o upload
 * setava ACL pública porque `storage.googleapis.com/{bucket}/{path}` é
 * acessado via IAM, não pelas Firebase Storage Rules — a regra `match
 * /dicom/...` em storage.rules nunca bastou sozinha. Isso funcionava, mas
 * deixava laudo de paciente acessível por qualquer um que tivesse a URL,
 * pra sempre.
 *
 * A URL `storage.googleapis.com/{bucket}/{path}` devolvida abaixo CONTINUA
 * sendo gravada no exame — mas agora é só um IDENTIFICADOR ESTÁVEL, não
 * mais um link direto. Quem exibe/imprime (galeria, PDF) troca essa URL
 * canônica por uma signed URL de curta duração via Admin SDK (Task 12 e
 * src/lib/imagens-dicom-admin.ts no lado web). `scripts/imagens-privar.mjs`
 * migra os objetos antigos que ainda têm a ACL pública de antes.
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
    // Sem predefinedAcl (D5b): objeto nasce privado. A URL abaixo vira
    // identificador, não link direto — ver comentário do topo do arquivo.
    metadata: {
      // `private` desde D5b: o objeto não é mais público, e é servido por
      // signed URL de 1h. Um `public, max-age=1 ano` autorizaria proxies
      // compartilhados a guardar imagem de paciente — e a cachear além da
      // validade da assinatura. 1h casa com a vida da URL.
      cacheControl: 'private, max-age=3600',
      metadata: {
        wsId: opts.wsId,
        exameId: opts.exameId,
        seq: String(opts.seq),
      },
    },
  });

  // URL canônica via storage.googleapis.com — desde D5b NÃO é mais link
  // direto (objeto é privado): serve só de identificador estável, gravado
  // no exame. Exibição/impressão trocam por signed URL (getSignedUrl).
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
