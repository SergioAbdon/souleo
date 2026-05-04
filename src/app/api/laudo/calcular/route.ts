// ══════════════════════════════════════════════════════════════════
// SOULEO · API Route — Cálculo do Laudo (Senna90)
// ══════════════════════════════════════════════════════════════════
// Roda o motor Senna90 NO SERVIDOR.
// O código fonte do motor NUNCA chega ao navegador do cliente.
//
// PROTEÇÃO:
// - Motor server-side (não vai pro bundle)
// - Auth Firebase obrigatória (token Bearer)
// - Rate limit por IP (60 calls/min)
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { calcular } from '@/senna90/motor';
import type { MedidasEcoTT } from '@/senna90/types';

// Roda em Node.js (server-side)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Firebase Admin (server-side) ──
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

// ── Rate Limiter (in-memory por IP) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 60;       // 60 cálculos por minuto
const RATE_LIMIT_WINDOW = 60000; // 1 minuto

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ── Auth: verificar token Firebase ──
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

/**
 * POST /api/laudo/calcular
 *
 * Headers: Authorization: Bearer <firebase-id-token>
 * Body: MedidasEcoTT
 * Response: ResultadoLaudo
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Rate limit por IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { ok: false, error: 'Rate limit excedido (60/min). Aguarde 1 minuto.' },
        { status: 429 }
      );
    }

    // 2. Auth obrigatória
    const uid = await verificarAuth(req);
    if (!uid) {
      return NextResponse.json(
        { ok: false, error: 'Autenticação requerida' },
        { status: 401 }
      );
    }

    // 3. Body
    const body = await req.json() as MedidasEcoTT;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Body inválido' },
        { status: 400 }
      );
    }

    // 4. Calcular (motor protegido server-side)
    const resultado = calcular(body);

    return NextResponse.json({
      ok: true,
      ...resultado,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    console.error('[/api/laudo/calcular] error:', msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}
