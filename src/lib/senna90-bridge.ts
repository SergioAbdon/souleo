// ══════════════════════════════════════════════════════════════════
// SOULEO · Bridge — chama o Senna90 (server-side) e devolve tipado
// ══════════════════════════════════════════════════════════════════
//
// O motor Senna90 roda NO SERVIDOR (`/api/laudo/calcular`) — o código
// nunca vai pro bundle do cliente (proteção de IP, ver route.ts).
// Este módulo é só o "telefone": lê os campos do DOM, manda pro
// servidor, devolve `ResultadoLaudo` tipado.
//
// Espelha `calcularServerSide()` do shadow-runner.ts de propósito —
// duplicar ~12 linhas evita editar shadow-runner.ts (arquivo no
// congelamento da migração) e mantém o bridge independente.
//
// Usado pelo orquestrador em page.tsx quando a flag
// `senna90Primario()` está ligada. Debounce é responsabilidade do
// chamador (criarDebounce abaixo) — Senna90 é uma chamada de rede,
// não pode rodar a cada tecla.
//
// Decisão 16/05/2026 (migração Senna90): ADR + memória local.
// ══════════════════════════════════════════════════════════════════

import { lerMedidasDoDOM } from './motor-ts-adapter';
import type { ResultadoLaudo } from '@/senna90/types';
import { auth } from './firebase';

/**
 * Lê o DOM, chama o Senna90 no servidor, devolve `ResultadoLaudo`.
 * Retorna `null` em qualquer falha (sem auth, rede, 4xx/5xx) — o
 * chamador decide o fallback (manter motor antigo, não re-renderizar).
 */
export async function calcularSenna90(): Promise<ResultadoLaudo | null> {
  try {
    const medidas = lerMedidasDoDOM();
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null; // sem auth = sem call (silencioso)

    const res = await fetch('/api/laudo/calcular', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(medidas),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok) return null;
    return {
      derivados: data.derivados,
      achados: data.achados,
      conclusoes: data.conclusoes,
      alertas: data.alertas,
    };
  } catch (e) {
    console.warn('[Senna90] falha ao chamar /api/laudo/calcular:', e);
    return null;
  }
}

/**
 * Cria um disparador com debounce. Cada chamada reinicia o timer;
 * `fn` só roda `ms` após a ÚLTIMA chamada. Essencial porque o médico
 * digita rápido e cada tecla dispara recalc — sem debounce estoura
 * o rate limit (60/min) do `/api/laudo/calcular` e trava a UI.
 *
 * @example
 *   const agendar = criarDebounce(300, async () => {
 *     const r = await calcularSenna90();
 *     if (r) renderizar(r);
 *   });
 *   input.addEventListener('input', agendar);
 */
export function criarDebounce(ms: number, fn: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}
