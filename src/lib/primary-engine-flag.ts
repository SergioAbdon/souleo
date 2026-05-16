// ══════════════════════════════════════════════════════════════════
// SOULEO · Feature flag — Motor primário (Senna90 vs motor antigo)
// ══════════════════════════════════════════════════════════════════
//
// CONTEXTO (16/05/2026): o motor antigo (motorv8mp4.js) renderiza
// params-tbody + calc-* corretamente, MAS escreve achados/conclusões
// em `#achados-body` — elemento que NÃO existe mais desde a migração
// TipTap. A ponte `_onLaudoGerado` foi criada mas nunca é chamada
// (código morto). Resultado: achados/conclusões do motor se perdem
// no vazio desde a migração TipTap. Esse é o "bug das frases" imortal.
//
// ESTA FLAG controla se o Senna90 (TS, server-side, 72/72 testes)
// assume a geração de achados/conclusões → TipTap. O motor antigo
// CONTINUA rodando pra params-tbody + calc-* (sem regressão).
//
//   Flag OFF → comportamento de hoje (rollback instantâneo, zero-deploy)
//   Flag ON  → Senna90 preenche achados/conclusões via TipTap
//
// Espelha o padrão de `shadowModeAtivo()` em shadow-runner.ts:
//   - env var `NEXT_PUBLIC_PRIMARY_ENGINE=senna90` (liga pra todos)
//   - localStorage `leo:primary-engine` = 'senna90' (liga por device,
//     pra teste do Sergio sem deploy)
//
// Decisão de migração: docs/decisoes/ (ADR Senna90) + memória local.
// ══════════════════════════════════════════════════════════════════

const LS_KEY = 'leo:primary-engine';
const ENV_VAL = 'senna90';

/**
 * True quando o Senna90 deve ser o motor primário de achados/conclusões.
 *
 * SSR-safe: retorna false no servidor (sem window/localStorage).
 */
export function senna90Primario(): boolean {
  if (typeof window === 'undefined') return false;

  // 1) Env var global (produção, liga pra todos)
  if (process.env.NEXT_PUBLIC_PRIMARY_ENGINE === ENV_VAL) return true;

  // 2) Override por device (localStorage) — pro Sergio testar sem deploy
  try {
    return localStorage.getItem(LS_KEY) === ENV_VAL;
  } catch {
    return false;
  }
}

/**
 * Liga/desliga o Senna90 primário NESTE device (localStorage).
 * Útil pra Sergio alternar no console do navegador durante validação:
 *
 *   import { setSenna90Primario } from '@/lib/primary-engine-flag'
 *   setSenna90Primario(true)   // liga
 *   setSenna90Primario(false)  // rollback instantâneo
 */
export function setSenna90Primario(ligado: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (ligado) localStorage.setItem(LS_KEY, ENV_VAL);
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* localStorage indisponível — ignora */
  }
}
