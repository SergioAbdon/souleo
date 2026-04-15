// ══════════════════════════════════════════════════════════════════
// SOULEO · API Route — Orthanc (servidor DICOM)
// Proxy seguro para comunicação com Orthanc REST API
// Etapa 1: teste de conexão
// Etapa 3 (futuro): criar MWL, buscar DICOM SR
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// ── Firebase Admin ──
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'leo-sistema-laudos',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const fbAuth = getAuth();
const dbAdmin = getFirestore();

const TIMEOUT_MS = 5000; // 5s timeout (Orthanc é local, deve ser rápido)

// ── Auth: verificar token Firebase do usuario ──
async function verificarAuth(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const decoded = await fbAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

// ── Resolver URL do Orthanc (header ou workspace) ──
async function resolverUrl(req: NextRequest): Promise<string | null> {
  // 1. Header X-Orthanc-Url (usado no teste de conexao do LocalModal)
  const headerUrl = req.headers.get('x-orthanc-url');
  if (headerUrl) return headerUrl.replace(/\/+$/, ''); // remover trailing slash

  // 2. Buscar do workspace via query param wsId
  const wsId = req.nextUrl.searchParams.get('wsId');
  if (wsId) {
    const wsDoc = await dbAdmin.doc(`workspaces/${wsId}`).get();
    const data = wsDoc.data();
    if (data?.ortancAtivo && data?.ortancUrl) {
      return (data.ortancUrl as string).replace(/\/+$/, '');
    }
  }

  return null;
}

// ── Fetch genérico ao Orthanc ──
async function orthancFetch(baseUrl: string, endpoint: string, options?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) throw new Error(`Orthanc ${res.status}: ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  // Auth
  const uid = await verificarAuth(req);
  if (!uid) {
    return NextResponse.json({ ok: false, error: 'Nao autorizado.' }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get('action');

  // Resolver URL do Orthanc
  const ortancUrl = await resolverUrl(req);
  if (!ortancUrl) {
    return NextResponse.json({ ok: false, error: 'URL do Orthanc nao configurada.' }, { status: 400 });
  }

  try {
    switch (action) {
      // Testar conexão — GET /system retorna versão e nome do Orthanc
      case 'teste': {
        const data = await orthancFetch(ortancUrl, '/system');
        return NextResponse.json({
          ok: true,
          message: 'Orthanc conectado!',
          version: data.Version || data.version || '?',
          name: data.Name || data.name || 'Orthanc',
        });
      }

      // Futuro: Etapa 3 — criar entrada MWL
      // case 'criar_mwl': { ... }

      // Futuro: Etapa 5 — buscar DICOM SR por Accession Number
      // case 'buscar_sr': { ... }

      // Futuro: listar estudos de um paciente
      // case 'studies': { ... }

      default:
        return NextResponse.json({ ok: false, error: 'action invalida. Use: teste' }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    if (msg.includes('aborted') || msg.includes('abort')) {
      return NextResponse.json({ ok: false, error: 'Timeout — Orthanc nao respondeu em 5s. Verifique IP e porta.' }, { status: 504 });
    }
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return NextResponse.json({ ok: false, error: 'Conexao recusada — Orthanc nao encontrado nesse endereco.' }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
