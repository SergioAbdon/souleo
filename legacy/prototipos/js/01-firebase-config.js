// ══════════════════════════════════════════════════════════════════
// LEO v7 · Módulo 01 — Firebase Config
// Inicialização do Firebase Auth, Firestore e Storage
// ══════════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyB-TS54JTDs6J_4mtB3j3NgOTs7NiFnpUU",
  authDomain:        "leo-sistema-laudos.firebaseapp.com",
  projectId:         "leo-sistema-laudos",
  storageBucket:     "leo-sistema-laudos.firebasestorage.app",
  messagingSenderId: "11492013422",
  appId:             "1:11492013422:web:bc3f707d8b410660e9bd7f"
};

// true = emulador local (dev), false = Firebase real (produção)
const FIREBASE_EMULADOR = false;

// Inicializar Firebase
firebase.initializeApp(FIREBASE_CONFIG);
const fbAuth    = firebase.auth();
const fbDb      = firebase.firestore();
const fbStorage = firebase.storage();

if(FIREBASE_EMULADOR){
  fbAuth.useEmulator('http://127.0.0.1:9099');
  fbDb.useEmulator('127.0.0.1', 8080);
  fbStorage.useEmulator('127.0.0.1', 9199);
  console.log('%c🔥 LEO v7 — Firebase Emulador ativo','color:#F9A825;font-weight:bold;font-size:13px;');
}

// ── Estado global do Firebase (var para acesso entre scripts) ──
var _fbUser          = null;  // firebase.auth user
var _fbProfile       = null;  // profissional (Firestore)
var _fbWorkspace     = null;  // workspace ativo
var _fbMembership    = null;  // vínculo ativo
var _fbSubscription  = null;  // subscription ativa
var _fbContextos     = [];    // todos os vínculos ativos
var _unsubListeners  = [];    // listeners Firestore para desinscrever
var _isSuperAdmin    = false; // cache superadmin

console.log('%c🫀 LEO v7 — Firebase inicializado','color:#2563EB;font-weight:bold;font-size:12px;');
