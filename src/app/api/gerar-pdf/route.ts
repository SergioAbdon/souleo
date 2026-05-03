// ══════════════════════════════════════════════════════════════════
// SOULEO · API Route — Gerar PDF via Puppeteer (server-side)
// PDF profissional com texto vetorial, gerado no Vercel
// Usa @sparticuz/chromium (Chromium otimizado pra serverless)
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser } from 'puppeteer-core';

// ── Config Next.js ──
export const runtime = 'nodejs';
export const maxDuration = 60; // Vercel Pro: 60s, Hobby: 10s (degrada graciosamente)

// ── Firebase Admin (server-side) ──
if (!getApps().length) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'leo-sistema-laudos';
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'leo-sistema-laudos.firebasestorage.app';
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

  if (privateKey && clientEmail) {
    initializeApp({
      credential: cert({ projectId, privateKey, clientEmail }),
      storageBucket,
    });
  } else {
    initializeApp({ projectId, storageBucket });
  }
}

// ── Resolver executavel do Chrome ──
// Vercel/serverless: @sparticuz/chromium
// Local dev: usa Chrome do sistema (Windows/Mac/Linux)
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

  // Tenta primeira opcao que existir
  for (const path of localPaths) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(path)) {
        return {
          executablePath: path,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          headless: true,
        };
      }
    } catch { /* tenta proximo */ }
  }

  throw new Error('Chrome nao encontrado no sistema. Instale Chrome ou rode em Vercel.');
}

// ── POST Handler ──
export async function POST(req: NextRequest) {
  let browser: Browser | null = null;

  try {
    const { pdfHtml, wsId, exameId, nomeArq } = await req.json();

    if (!pdfHtml || !wsId || !exameId) {
      return NextResponse.json(
        { ok: false, error: 'pdfHtml, wsId e exameId sao obrigatorios' },
        { status: 400 }
      );
    }

    // ── Inicializar Puppeteer ──
    const { executablePath, args, headless } = await resolverExecutavel();

    browser = await puppeteer.launch({
      args,
      executablePath,
      headless,
      defaultViewport: { width: 1240, height: 1754 }, // ~A4 a 150 DPI
    });

    const page = await browser.newPage();

    // Renderizar HTML completo (com estilos, fontes, imagens base64)
    await page.setContent(pdfHtml, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Aguardar fontes carregarem (caso use webfonts)
    await page.evaluateHandle('document.fonts.ready');

    // Gerar PDF A4 sem margens (HTML ja controla layout)
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });

    await browser.close();
    browser = null;

    // ── Upload pro Firebase Storage ──
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

    const pdfUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    const tamanhoKB = Math.round(pdfBuffer.length / 1024);

    return NextResponse.json({
      ok: true,
      pdfUrl,
      tamanhoKB,
      gerador: 'puppeteer',
    });
  } catch (e) {
    if (browser) {
      try { await browser.close(); } catch { /* */ }
    }
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    console.error('gerar-pdf error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
