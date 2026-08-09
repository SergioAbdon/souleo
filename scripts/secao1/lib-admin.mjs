// Inicializa o firebase-admin a partir das variaveis do .env.local.
// Rodar sempre com: node --env-file=.env.local <script>
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const PROJECT_ID = 'leo-sistema-laudos';

function credencial() {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error(
      'FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY ausentes. ' +
      'Rode com: node --env-file=.env.local <script>'
    );
  }
  return cert({ projectId: PROJECT_ID, clientEmail, privateKey });
}

export function getCredential() {
  return credencial();
}

export function getDb() {
  if (!getApps().length) initializeApp({ credential: credencial() });
  return getFirestore();
}

// true = grava de verdade. Padrao e ensaio.
export const COMMIT = process.argv.includes('--commit');
export function modo() {
  return COMMIT ? 'GRAVANDO' : 'ENSAIO (use --commit para gravar)';
}
