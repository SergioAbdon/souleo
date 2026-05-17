// ══════════════════════════════════════════════════════════════════
// LEO · PDF server-side (Puppeteer + Storage)
// Extraído de /api/emitir em 17/05 — reusado por /api/emitir e
// /api/corrigir-laudo (1 pipeline de PDF só, fonte única).
// ══════════════════════════════════════════════════════════════════
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser } from 'puppeteer-core';
import { getStorage } from 'firebase-admin/storage';

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
    await page.setContent(pdfHtml, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });

    await browser.close();
    browser = null;

    const bucket = getStorage().bucket();
    const nomeArquivo = (nomeArq || `laudo_${exameId}`)
      .replace(/[^a-zA-Z0-9À-ÿ _-]/g, '')
      .replace(/\s+/g, '_');
    const filePath = `laudos/${wsId}/${nomeArquivo}.pdf`;
    const file = bucket.file(filePath);

    await file.save(Buffer.from(pdfBuffer), {
      metadata: {
        contentType: 'application/pdf',
        contentDisposition: `inline; filename="${nomeArquivo}.pdf"`,
      },
    });
    await file.makePublic();

    return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* */ }
    }
  }
}
