import * as fs from 'node:fs';
import { initializeApp, cert, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createLogger } from '../logger';
import { FirebaseConfig } from '../config/types';

const log = createLogger({ module: 'firebase-adapter' });

let _app: App | null = null;
let _db: Firestore | null = null;

/**
 * Inicializa Firebase Admin SDK com a Service Account configurada.
 *
 * Lê o JSON do disco UMA vez no startup. Se a credencial expirar ou for
 * revogada, o Firebase Admin retornará erros nas chamadas — esses erros
 * sobem pro chamador, que decide se reinicia o serviço ou alerta.
 */
export function initFirebase(config: FirebaseConfig): void {
  if (getApps().length > 0) {
    log.debug('Firebase já inicializado, ignorando initFirebase');
    return;
  }

  if (!fs.existsSync(config.serviceAccountPath)) {
    throw new Error(
      `Service Account não encontrada em ${config.serviceAccountPath}. ` +
      `Confira o caminho em wader.config.json (firebase.serviceAccountPath).`
    );
  }

  const raw = fs.readFileSync(config.serviceAccountPath, 'utf-8');
  let sa: Record<string, unknown>;
  try {
    sa = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Service Account inválida (JSON malformado) em ${config.serviceAccountPath}: ${(err as Error).message}`);
  }

  _app = initializeApp({
    credential: cert(sa as Parameters<typeof cert>[0]),
    projectId: config.projectId,
  });

  log.info({ projectId: config.projectId, clientEmail: sa.client_email }, 'Firebase inicializado');
}

/**
 * Retorna a instância única de Firestore. Lazy.
 */
export function getDb(): Firestore {
  if (!_db) {
    if (!_app && getApps().length === 0) {
      throw new Error('Firebase não inicializado. Chame initFirebase() antes.');
    }
    _db = getFirestore();
  }
  return _db;
}

export { FieldValue, Timestamp };
