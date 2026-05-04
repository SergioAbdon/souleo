// ══════════════════════════════════════════════════════════════════
// SOULEO · API Route — Cálculo do Laudo (Senna90)
// ══════════════════════════════════════════════════════════════════
// Roda o motor Senna90 NO SERVIDOR.
// O código fonte do motor NUNCA chega ao navegador do cliente.
//
// Cliente envia: MedidasEcoTT
// Servidor retorna: ResultadoLaudo (achados, conclusões, derivados)
//
// Proteção: motor permanece privado. Cliente só vê inputs/outputs.
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { calcular } from '@/senna90/motor';
import type { MedidasEcoTT } from '@/senna90/types';

// Roda em Node.js (server-side)
export const runtime = 'nodejs';

// Cache control: no cache (cada cálculo é único)
export const dynamic = 'force-dynamic';

/**
 * POST /api/laudo/calcular
 *
 * Body: MedidasEcoTT
 * Response: ResultadoLaudo
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as MedidasEcoTT;

    // Validação básica de estrutura
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Body inválido' },
        { status: 400 }
      );
    }

    // Roda o motor server-side
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
