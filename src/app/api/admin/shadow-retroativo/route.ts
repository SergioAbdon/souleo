// ══════════════════════════════════════════════════════════════════
// SOULEO · API Admin — Análise Retroativa Shadow Mode
// ══════════════════════════════════════════════════════════════════
// Casca fina: auth → papel → `rodarShadow` (src/lib/shadow/rodar.ts) →
// resposta. A comparação (frases + números), a classificação contra a
// allowlist e o resumo vivem no core; aqui só entram as duas deps de
// Firestore (listar exames do período, gravar a execução).
//
// Não modifica os exames — apenas reporta e persiste divergências.
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireUid, adminDb } from '@/lib/auth-admin';
import { resolverPapel, idValido } from '@/lib/exame-admin';
import { rodarShadow } from '@/lib/shadow/rodar';
import { depsAdmin } from '@/lib/shadow/deps-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/shadow-retroativo
 *
 * Body: { wsId, from (ISO date), to (ISO date) }
 * Response: o formato antigo (a página Direx é intocável) + aditivos
 * `execId`, `resumoV2` e `era` por exame.
 */
export async function POST(req: NextRequest) {
  try {
    // Ordem 401 → 400 → 403 (padrão S5-T7).
    const uid = await requireUid(req);
    if (!uid) return NextResponse.json({ ok: false, error: 'Auth requerida' }, { status: 401 });

    const body = await req.json();
    const { wsId, from, to } = body as { wsId: string; from: string; to: string };

    if (!idValido(wsId) || !from) {
      return NextResponse.json({ ok: false, error: 'wsId e from obrigatórios' }, { status: 400 });
    }

    // Gate de papel: antes, QUALQUER usuário autenticado lia achados,
    // conclusões e nome de paciente de QUALQUER workspace. Recepção não lê
    // conteúdo clínico.
    const papel = await resolverPapel(adminDb(), wsId, uid);
    if (papel !== 'dono' && papel !== 'medico') {
      return NextResponse.json({ ok: false, error: 'sem_acesso' }, { status: 403 });
    }

    const fromDate = new Date(from);
    const toDate = to ? new Date(to) : new Date();
    toDate.setHours(23, 59, 59, 999);

    // `pacienteNome` fica SÓ aqui (resposta HTTP) — não entra no core nem
    // no Firestore; a página mostra, o banco não guarda.
    const nomes = new Map<string, string>();
    const deps = depsAdmin((id, nome) => nomes.set(id, nome));

    const { execId, exec } = await rodarShadow(deps, {
      wsId, from: fromDate, to: toDate, origem: 'retroativo', uid,
    });

    // Achatamento no shape antigo: célula vira `categoria:'tabela'`
    // (velho = legado, novo = senna93) e frase da era legado entra como
    // ESPERADA (é o balde informativo — não é alarme).
    const exames = exec.exames
      .filter(e => !e.pulado)   // pulado não tem comparação; aparece em resumoV2
      .map(e => {
        const divergencias = [
          ...e.frases.map(f => ({
            categoria: f.categoria as string, linha: f.linha,
            velho: f.velho, novo: f.novo,
            esperada: f.esperada || e.era === 'legado',
          })),
          ...e.celulas.map(c => ({
            categoria: 'tabela', linha: c.linha,
            velho: c.legado, novo: c.senna93,
            esperada: c.esperada,
          })),
        ];
        const esperadas = divergencias.filter(d => d.esperada).length;
        return {
          id: e.id,
          pacienteNome: nomes.get(e.id) || '—',
          emitidoEm: e.emitidoEm,
          era: e.era,
          total: divergencias.length,
          esperadas,
          inesperadas: divergencias.length - esperadas,
          divergencias,
        };
      });

    const r = exec.resumo;
    return NextResponse.json({
      ok: true,
      execId,
      resumo: {
        totalExames: r.comparados,   // match + diverge (pulados em resumoV2)
        match: r.match,
        diverge: r.diverge,
        totalDivergencias: r.frases.esperadas + r.frases.inesperadas + r.frases.eraLegado
          + r.celulas.esperadas + r.celulas.inesperadas,
        totalEsperadas: r.frases.esperadas + r.celulas.esperadas + r.frases.eraLegado,
        totalInesperadas: r.frases.inesperadas + r.celulas.inesperadas,
      },
      resumoV2: r,
      exames,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    console.error('[/api/admin/shadow-retroativo] error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
