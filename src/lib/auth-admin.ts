// ══════════════════════════════════════════════════════════════════
// LEO · Firebase Admin compartilhado + autenticacao de rota (Plano 2A)
// Um init so: tres copias do mesmo bloco em /api/signup, /api/exame e
// /api/emitir davam app com storageBucket diferente conforme QUEM
// inicializava primeiro (getApps() ja tinha app → o segundo init virava
// no-op). Aqui o app nasce sempre igual, com bucket.
//
// requireUid: Bearer + verifyIdToken → uid, ou null (a rota devolve 401).
// ══════════════════════════════════════════════════════════════════
import type { NextRequest } from 'next/server';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

function adminApp(): App {
  return getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'leo-sistema-laudos',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'leo-sistema-laudos.firebasestorage.app',
  });
}

export const adminDb = () => getFirestore(adminApp());
export const adminAuth = () => getAuth(adminApp());
export const adminStorage = () => getStorage(adminApp());

export async function requireUid(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return (await adminAuth().verifyIdToken(header.slice(7))).uid;
  } catch {
    return null;
  }
}
