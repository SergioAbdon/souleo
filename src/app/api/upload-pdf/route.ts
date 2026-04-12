// ══════════════════════════════════════════════════════════════════
// SOULEO · API Route — Upload PDF para Firebase Storage (server-side)
// Evita CORS: navegador envia pra Next.js, Next.js envia pro Storage
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

// Inicializar Firebase Admin (server-side)
if (!getApps().length) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'leo-sistema-laudos';
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'leo-sistema-laudos.firebasestorage.app';

  // Em dev, usa Application Default Credentials ou variáveis de ambiente
  try {
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;

    if (privateKey && clientEmail) {
      initializeApp({
        credential: cert({ projectId, privateKey, clientEmail }),
        storageBucket,
      });
    } else {
      // Fallback: usar o SDK client-side via REST
      initializeApp({ projectId, storageBucket });
    }
  } catch {
    initializeApp({ projectId, storageBucket });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { pdfBase64, wsId, exameId, nomeArq } = await req.json();

    if (!pdfBase64 || !wsId || !exameId) {
      return NextResponse.json({ error: 'pdfBase64, wsId e exameId obrigatórios' }, { status: 400 });
    }

    // Converter base64 para buffer
    const buffer = Buffer.from(pdfBase64, 'base64');

    // Upload para Firebase Storage
    const bucket = getStorage().bucket();
    const nomeArquivo = (nomeArq || `laudo_${exameId}`).replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').replace(/\s+/g, '_');
    const filePath = `laudos/${wsId}/${nomeArquivo}.pdf`;
    const file = bucket.file(filePath);

    await file.save(buffer, {
      metadata: {
        contentType: 'application/pdf',
        contentDisposition: `inline; filename="${nomeArquivo}.pdf"`,
      },
    });

    // Tornar público para leitura
    await file.makePublic();

    // URL pública
    const pdfUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    return NextResponse.json({ ok: true, pdfUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    console.error('upload-pdf:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
