// ══════════════════════════════════════════════════════════════════
// LEO v3 · API Route — Emissao atomica de laudo + PDF
// Transacao server-side: emitir exame + cobrar billing atomicamente
// + gerar PDF via Puppeteer e salvar pdfUrl tudo em uma chamada
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser } from 'puppeteer-core';

// ── Config Next.js ──
export const runtime = 'nodejs';
export const maxDuration = 60;

// ── Firebase Admin (server-side) ──
if (!getApps().length) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'leo-sistema-laudos';
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'leo-sistema-laudos.firebasestorage.app';
  initializeApp({
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket,
  });
}
const dbAdmin = getFirestore();

// ── Resolver executavel do Chrome (Vercel ou local) ──
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
async function gerarESalvarPdf(
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

// ── POST Handler ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wsId, exameId, dadosFinais, medicoUid, pdfHtml, nomeArq } = body as {
      wsId: string;
      exameId: string;
      dadosFinais: Record<string, unknown>;
      medicoUid: string;
      pdfHtml?: string;
      nomeArq?: string;
    };

    if (!wsId || !exameId || !medicoUid) {
      return NextResponse.json(
        { ok: false, motivo: 'dados_invalidos', error: 'wsId, exameId e medicoUid sao obrigatorios' },
        { status: 400 }
      );
    }

    // ══ 1. TRANSACAO ATOMICA: emitir + cobrar ══
    const resultado = await dbAdmin.runTransaction(async (transaction) => {
      const subsQuery = await dbAdmin.collection('subscriptions')
        .where('workspaceId', '==', wsId).limit(1).get();

      if (subsQuery.empty) {
        return { ok: false, motivo: 'sem_plano' as const };
      }

      const subDoc = subsQuery.docs[0];
      const subRef = subDoc.ref;
      const subSnap = await transaction.get(subRef);
      if (!subSnap.exists) {
        return { ok: false, motivo: 'sem_plano' as const };
      }

      const sub = subSnap.data()!;
      const agora = new Date();
      const cicloFim = sub.cicloFim ? (sub.cicloFim as Timestamp).toDate() : null;
      const franquiaUsada = (sub.franquiaUsada as number) || 0;
      const franquiaMensal = (sub.franquiaMensal as number) || 0;
      const creditosExtras = (sub.creditosExtras as number) || 0;

      let tipo: 'franquia' | 'creditos' | null = null;
      if (cicloFim && agora <= cicloFim && franquiaUsada < franquiaMensal) {
        tipo = 'franquia';
      } else if (creditosExtras > 0) {
        tipo = 'creditos';
      } else if (cicloFim && agora > cicloFim && creditosExtras <= 0) {
        return { ok: false, motivo: 'expirado' as const };
      } else {
        return { ok: false, motivo: 'sem_saldo' as const };
      }

      const exameRef = dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`);
      transaction.update(exameRef, {
        ...dadosFinais,
        status: 'emitido',
        emitidoEm: FieldValue.serverTimestamp(),
        medicoUid,
        atualizadoEm: FieldValue.serverTimestamp(),
      });

      if (tipo === 'franquia') {
        transaction.update(subRef, { franquiaUsada: FieldValue.increment(1) });
      } else {
        transaction.update(subRef, { creditosExtras: FieldValue.increment(-1) });
      }

      return { ok: true, tipo };
    });

    if (!resultado.ok) {
      return NextResponse.json(resultado);
    }

    // ══ 2. AUDIT LOG (nao critico) ══
    try {
      await dbAdmin.collection('consumo').add({
        workspaceId: wsId,
        exameId,
        medicoUid,
        pacienteNome: (dadosFinais.pacienteNome as string) || '',
        tipoExame: (dadosFinais.tipoExame as string) || '',
        convenio: (dadosFinais.convenio as string) || '',
        tipo: resultado.tipo === 'franquia' ? 'franquia' : 'credito',
        reemissao: !!(dadosFinais.reemissao),
        emitidoEm: FieldValue.serverTimestamp(),
      });
    } catch { /* consumo nao pode quebrar emissao */ }

    try {
      await dbAdmin.collection('logs').add({
        tipo: 'emissao',
        exameId,
        wsId,
        reemissao: !!(dadosFinais.reemissao),
        identificacaoAlterada: !!(dadosFinais.identificacaoAlterada),
        ts: FieldValue.serverTimestamp(),
        medicoUid,
      });
    } catch { /* log nao pode quebrar emissao */ }

    // ══ 3. GERAR PDF (nao critico - emissao ja foi confirmada) ══
    let pdfUrl: string | null = null;
    let pdfErro: string | null = null;
    if (pdfHtml && nomeArq) {
      try {
        pdfUrl = await gerarESalvarPdf(pdfHtml, wsId, exameId, nomeArq);
        // Salvar pdfUrl no exame
        await dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`).update({ pdfUrl });
      } catch (e) {
        pdfErro = e instanceof Error ? e.message : 'erro_pdf';
        console.error('PDF gen error:', pdfErro);
      }
    }

    return NextResponse.json({
      ok: true,
      tipo: resultado.tipo,
      pdfUrl,
      pdfErro,
    });
  } catch (e) {
    console.error('API /emitir error:', e);
    const msg = (e as Error).message || 'Erro interno';
    return NextResponse.json({ ok: false, motivo: 'erro', error: msg }, { status: 500 });
  }
}
