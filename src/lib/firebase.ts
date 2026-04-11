// ══════════════════════════════════════════════════════════════════
// SOULEO · Firebase Configuration
// Auth + Firestore + Storage — Projeto: leo-sistema-laudos
// ══════════════════════════════════════════════════════════════════

import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            "AIzaSyB-TS54JTDs6J_4mtB3j3NgOTs7NiFnpUU",
  authDomain:        "leo-sistema-laudos.firebaseapp.com",
  projectId:         "leo-sistema-laudos",
  storageBucket:     "leo-sistema-laudos.firebasestorage.app",
  messagingSenderId: "11492013422",
  appId:             "1:11492013422:web:bc3f707d8b410660e9bd7f"
};

// Inicializar apenas uma vez (Next.js pode re-renderizar)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
