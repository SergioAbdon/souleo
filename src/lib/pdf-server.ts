// ══════════════════════════════════════════════════════════════════
// LEO · PDF server-side (Puppeteer + Storage)
// Extraído de /api/emitir em 17/05 — reusado por /api/emitir e
// /api/corrigir-laudo (1 pipeline de PDF só, fonte única).
// ══════════════════════════════════════════════════════════════════
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser } from 'puppeteer-core';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { assinarImagensExame, assinarUrlsNoHtml } from './imagens-dicom-admin';

// ── Resolver executável do Chrome (Vercel ou local) ──
async function resolverExecutavel(): Promise<{ executablePath: string; args: string[]; headless: boolean }> {
  const isVercel = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (isVercel) {
    return {
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    };
  }
  // Dev local: Chrome do sistema
  const localPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
  ];
  for (const path of localPaths) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(path)) {
        return { executablePath: path, args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true };
      }
    } catch { /* tenta proximo */ }
  }
  throw new Error('Chrome nao encontrado');
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
  const nomeArquivo = (nomeArq || `laudo_${exameId}`)
    .replace(/[^a-zA-Z0-9À-ÿ _-]/g, '')
    .replace(/\s+/g, '_');
  const filePath = `laudos/${wsId}/${nomeArquivo}.pdf`;
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
function pathSnapshotHtml(wsId: string, exameId: string): string {
  return `laudos/${wsId}/${exameId}.html`;
}

// Nunca lança: emissão não pode falhar porque o snapshot falhou — o PDF é o
// produto. Sem snapshot, a correção só grava os campos e avisa o médico.
async function salvarSnapshotHtml(html: string, wsId: string, exameId: string): Promise<void> {
  try {
    const filePath = pathSnapshotHtml(wsId, exameId);
    await getStorage().bucket().file(filePath).save(html, {
      metadata: { contentType: 'text/html; charset=utf-8' },
    });   // sem makePublic(): só o Admin SDK lê
    await getFirestore().doc(`workspaces/${wsId}/exames/${exameId}`).update({ pdfHtmlPath: filePath });
  } catch (e) {
    console.error('snapshot HTML (nao-critico):', e);
  }
}

export async function lerSnapshotHtml(wsId: string, exameId: string): Promise<string | null> {
  try {
    const [buf] = await getStorage().bucket().file(pathSnapshotHtml(wsId, exameId)).download();
    return buf.toString('utf8');
  } catch {
    return null;   // emitido antigo (antes de 25/08) ou PDF anexado: não tem snapshot
  }
}

// ── Gerar PDF via Puppeteer + upload Storage ──
export async function gerarESalvarPdf(
  pdfHtml: string,
  wsId: string,
  exameId: string,
  nomeArq: string
): Promise<string> {
  let browser: Browser | null = null;
  try {
    const { executablePath, args, headless } = await resolverExecutavel();
    browser = await puppeteer.launch({
      args,
      executablePath,
      headless,
      defaultViewport: { width: 1240, height: 1754 },
    });

    const page = await browser.newPage();
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
    if (htmlAssinado.includes(`https://storage.googleapis.com/${bucket.name}/dicom`)) {
      throw new Error('imagem não assinada — emissão abortada');
    }
    await page.setContent(htmlAssinado, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });

    await browser.close();
    browser = null;

    const url = await salvarPdfBuffer(Buffer.from(pdfBuffer), wsId, exameId, nomeArq);
    // Congela o HTML ORIGINAL (URLs canônicas, não as assinadas — signed URL
    // expira). Depois do PDF salvo e sem poder derrubá-lo.
    await salvarSnapshotHtml(pdfHtml, wsId, exameId);
    return url;
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* */ }
    }
  }
}
