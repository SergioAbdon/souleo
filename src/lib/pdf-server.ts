// ══════════════════════════════════════════════════════════════════
// LEO · PDF server-side (Puppeteer + Storage)
// Extraído de /api/emitir em 17/05 — reusado por /api/emitir e
// /api/corrigir-laudo (1 pipeline de PDF só, fonte única).
// ══════════════════════════════════════════════════════════════════
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { assinarImagensExame, assinarUrlsNoHtml } from './imagens-dicom-admin';
import { sanitizarNomeArq, pathPdf } from './pdf-path';
import { obterBrowser, descartarBrowser, ehErroDeConexao } from './pdf-browser';

// Teto da espera pelas fontes (S7-T0.2, achado P8). A moldura carrega IBM Plex
// do fonts.googleapis.com em TODO render; `document.fonts.ready` espera o woff2
// chegar. Com CDN fora do ar isso não pode segurar a emissão: estourado o teto,
// o PDF sai na fonte de fallback — exatamente o que já acontecia hoje, só que
// depois de 30s do `networkidle0` (e, pelo P4, com a franquia já cobrada).
const TETO_FONTES_MS = 8000;

// P1: o pdfHtml vem do cliente — o Chrome do servidor não pode ser o proxy
// dele. Só o que o laudo legitimamente usa: data: (logo/assinatura), o
// próprio bucket (signed URLs das imagens DICOM) e as fontes da moldura.
// Prefixo com barra no bucket: "meu-bucketX" não passa.
export function urlPermitidaNoRender(url: string, bucketName: string): boolean {
  return url.startsWith('data:')
    || url.startsWith(`https://storage.googleapis.com/${bucketName}/`)
    || url.startsWith('https://fonts.googleapis.com/')
    || url.startsWith('https://fonts.gstatic.com/');
}

// ── Salvar buffer de PDF pronto no Storage (Task 5: reusado pelo caminho
// Puppeteer abaixo E pelo caminho de anexo direto em /api/emitir) ──
export async function salvarPdfBuffer(
  buf: Buffer,
  wsId: string,
  exameId: string,
  nomeArq: string
): Promise<string> {
  const bucket = getStorage().bucket();
  // Formato do path (com exameId) e sanitização do nome: `pdf-path.ts`.
  const nomeArquivo = sanitizarNomeArq(nomeArq, exameId);
  const filePath = pathPdf(wsId, exameId, nomeArquivo);
  const file = bucket.file(filePath);

  await file.save(buf, {
    metadata: {
      contentType: 'application/pdf',
      contentDisposition: `inline; filename="${nomeArquivo}.pdf"`,
    },
  });
  await file.makePublic();

  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}

// ── Snapshot do HTML do laudo (S5-T5 / D4) ──
// O HTML que virou PDF fica congelado no Storage. É ele que a correção
// administrativa reescreve (só convênio/solicitante) — em vez de confiar num
// HTML mandado pelo cliente, que deixava reescrever o laudo assinado inteiro.
// Path CANÔNICO por exameId: a leitura NÃO usa o campo `pdfHtmlPath` do doc
// como caminho (o doc é editável pelo navegador — apontaria pro snapshot de
// outro exame); o campo fica só como marca/auditoria.
// Prefixo `laudos-html/` (fix I3): cai no DENY DEFAULT do storage.rules — o
// laudo clínico completo não fica legível sem autenticação como fica em
// `laudos/` (onde o PDF é público de propósito). Admin SDK bypassa a regra.
function pathSnapshotHtml(wsId: string, exameId: string): string {
  return `laudos-html/${wsId}/${exameId}.html`;
}

// Nunca lança: emissão não pode falhar porque o snapshot falhou — o PDF é o
// produto. Sem snapshot, a correção só grava os campos e avisa o médico.
// `nomeArq` vai na metadata do OBJETO (Storage é admin-write-only): é o alvo
// que a correção regrava. Guardar isso no doc do exame seria dar o volante
// de volta ao cliente — o médico-autor pode editar o doc emitido e apontar
// pro PDF de outro paciente (fix I1).
// Exportada (Task 6 / P4+E4): o catch do /api/emitir também precisa congelar
// o snapshot quando o Puppeteer falha DEPOIS da franquia cobrada — sem ele a
// correção administrativa deste exame (única via de recuperação sem 2a
// franquia) morre pra sempre.
export async function salvarSnapshotHtml(html: string, wsId: string, exameId: string, nomeArq: string): Promise<void> {
  try {
    const filePath = pathSnapshotHtml(wsId, exameId);
    // Ruflo-5/Ponytail-11: sanitiza AQUI, ponto único — os 2 callers (route.ts
    // e gerarESalvarPdf logo abaixo) passam o nomeArq CRU. Idempotente
    // (sanitizarNomeArq 2x não muda nada), então não há dupla-sanitização —
    // só um lugar decide o nome do objeto.
    const nomeSanitizado = sanitizarNomeArq(nomeArq, exameId);
    await getStorage().bucket().file(filePath).save(html, {
      metadata: { contentType: 'text/html; charset=utf-8', metadata: { nomeArq: nomeSanitizado } },
    });   // sem makePublic(): só o Admin SDK lê
    await getFirestore().doc(`workspaces/${wsId}/exames/${exameId}`).update({ pdfHtmlPath: filePath });
  } catch (e) {
    console.error('snapshot HTML (nao-critico):', e);
  }
}

export async function lerSnapshotHtml(
  wsId: string, exameId: string,
): Promise<{ html: string; nomeArq: string } | null> {
  try {
    const file = getStorage().bucket().file(pathSnapshotHtml(wsId, exameId));
    const [buf] = await file.download();
    const [meta] = await file.getMetadata();
    const nomeArq = meta.metadata?.nomeArq;
    return { html: buf.toString('utf8'), nomeArq: typeof nomeArq === 'string' ? nomeArq : '' };
  } catch {
    return null;   // emitido antigo (antes de 25/08) ou PDF anexado: não tem snapshot
  }
}

// ── Gerar PDF via Puppeteer + upload Storage ──
export async function gerarESalvarPdf(
  pdfHtml: string,
  wsId: string,
  exameId: string,
  nomeArq: string,
  // Fix I4: última checagem ANTES de publicar o PDF. A correção usa para
  // abortar se o exame foi REEMITIDO durante o Puppeteer — sem isso a escrita
  // atrasada devolveria o corpo clínico antigo por cima do laudo novo.
  // `false` → nada é escrito e a função devolve null.
  podeSalvar?: () => Promise<boolean>,
): Promise<string | null> {
  // D5b: imagens DICOM nascem privadas no Storage — troca a URL canonica
  // embutida no HTML (imagensSelecionadasPdf) por signed URL ANTES do
  // Puppeteer buscar. Sem isso o <img src> da 403: o Chrome headless busca
  // por rede, sem a credencial do Admin SDK. Ponto unico — cobre /api/emitir
  // e /api/corrigir-laudo, os dois chamadores desta funcao.
  const bucket = getStorage().bucket();
  const urlsAssinadas = await assinarImagensExame(getFirestore(), bucket, wsId, exameId);
  const htmlAssinado = assinarUrlsNoHtml(pdfHtml, urlsAssinadas);
  // FAIL-LOUD (S4-T15 fix X4): se sobrou URL canonica de imagem DICOM, a
  // assinatura nao cobriu tudo (imagem fora do exame, doc dessincronizado).
  // Sem isto o Chrome headless toma 403 naquele <img> e o PDF ASSINADO sai
  // com um retangulo vazio no lugar da imagem — sem erro nenhum. Melhor
  // abortar a emissao que publicar laudo com buraco silencioso.
  // Sem a barra final: a URL canonica gravada codifica o path inteiro
  // (encodeURIComponent), entao ela aparece como `/dicom%2F...` — `/dicom`
  // cobre as duas formas.
  // P4/E4: a esta altura a emissão JÁ foi cobrada — o texto antigo ("emissão
  // abortada") mentia dizendo que nada tinha acontecido.
  if (htmlAssinado.includes(`https://storage.googleapis.com/${bucket.name}/dicom`)) {
    throw new Error('imagem não assinada — PDF abortado');
  }
  // S7-T0.2: uma página por emissão, num browser que sobrevive à invocação.
  // Política de retry: UMA repetição, e só se o erro for de conexão — o
  // browser reusado pode ter morrido entre invocações (instância congelada,
  // OOM) e a gente só descobre ao usar. Erro do laudo ou timeout de fonte
  // NÃO repete (dobraria a espera sem chance de dar certo).
  const renderizar = async (): Promise<Uint8Array> => {
    const page = await (await obterBrowser()).newPage();
    try {
      // P1: o laudo não usa JS (o Chrome só pagina e imprime) e não pode fazer
      // o servidor buscar host arbitrário — SSRF/beacon, congelado no snapshot
      // e re-executado a cada correção administrativa. Precisa vir ANTES do
      // setContent: a interceptação só filtra requisições feitas depois dela.
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (r) => {
        if (urlPermitidaNoRender(r.url(), bucket.name)) void r.continue();
        else { console.warn(`render: url bloqueada ${r.url().slice(0, 120)} (ws=${wsId} exame=${exameId})`); void r.abort(); }
      });
      // `load` (não `networkidle0`): o evento já espera o CSS do <link> das
      // fontes e as imagens do laudo — que é o que o PDF precisa —, sem os
      // 500ms de silêncio de rede nem ficar refém de uma conexão pendurada.
      // As fontes em si continuam esperadas explicitamente logo abaixo.
      await page.setContent(htmlAssinado, { waitUntil: 'load', timeout: 30000 });
      let teto: NodeJS.Timeout | undefined;
      await Promise.race([
        page.evaluateHandle('document.fonts.ready'),
        // Com wsId/exameId (M2): sem eles o aviso e anonimo no Sentry e nao da
        // pra saber QUAL laudo saiu em fonte de fallback quando o medico reclama.
        new Promise<void>((r) => { teto = setTimeout(() => { console.warn(`fontes: teto estourado, PDF sai em fallback (ws=${wsId} exame=${exameId})`); r(); }, TETO_FONTES_MS); }),
      ]);
      clearTimeout(teto);
      return await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        preferCSSPageSize: true,
      });
    } finally {
      // Fecha só a PÁGINA. O browser fica de pé para a próxima invocação.
      await page.close().catch(() => { /* browser já morreu */ });
    }
  };

  let pdfBuffer: Uint8Array;
  try {
    pdfBuffer = await renderizar();
  } catch (e) {
    if (!ehErroDeConexao(e)) throw e;
    console.warn('browser reusado morreu, relançando:', e);
    descartarBrowser();
    pdfBuffer = await renderizar();
  }

  if (podeSalvar && !(await podeSalvar())) return null;

  const url = await salvarPdfBuffer(Buffer.from(pdfBuffer), wsId, exameId, nomeArq);
  // Congela o HTML ORIGINAL (URLs canônicas, não as assinadas — signed URL
  // expira) + o alvo real da escrita. Depois do PDF salvo e sem poder
  // derrubá-lo. O alvo é o MESMO nome que `salvarPdfBuffer` acabou de usar
  // (mesma função de sanitização, idempotente) — antes ele era redescoberto
  // fazendo parse da URL lá em `correcao-admin.ts`, com o formato do path
  // sabido em dois lugares. Nome CRU aqui (Ruflo-5): salvarSnapshotHtml
  // sanitiza sozinha.
  await salvarSnapshotHtml(pdfHtml, wsId, exameId, nomeArq);
  return url;
}
