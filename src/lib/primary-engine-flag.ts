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
// ATIVADO EM PRODUÇÃO 16/05/2026 (Dr. Sérgio): default global = Senna90.
//   - env var `NEXT_PUBLIC_PRIMARY_ENGINE=senna90` → liga pra TODOS
//   - localStorage `leo:primary-engine`='off' → KILL-SWITCH por device
//     (vence o env, rollback instantâneo zero-deploy)
//   - localStorage `leo:primary-engine`='senna90' → força ON por device
//
// Decisão de migração: docs/decisoes/ (ADR Senna90) + memória local.
// ══════════════════════════════════════════════════════════════════

const LS_KEY = 'leo:primary-engine';
const ENV_VAL = 'senna90';

/**
 * True quando o Senna90 deve ser o motor primário de achados/conclusões.
 *
 * Precedência (rollback instantâneo garantido):
 *  1. localStorage 'off'     → kill-switch por device (vence tudo)
 *  2. localStorage 'senna90' → ON por device
 *  3. env NEXT_PUBLIC_PRIMARY_ENGINE=senna90 → default global (produção)
 *
 * SSR-safe: retorna false no servidor (sem window/localStorage).
 */
export function senna90Primario(): boolean {
  if (typeof window === 'undefined') return false;

  let ls: string | null = null;
  try { ls = localStorage.getItem(LS_KEY); } catch { /* indisponível */ }

  if (ls === 'off') return false;   // kill-switch — rollback instantâneo
  if (ls === ENV_VAL) return true;  // ON por device
  return process.env.NEXT_PUBLIC_PRIMARY_ENGINE === ENV_VAL; // default global
}

/**
 * Força ON/OFF NESTE device. 'off' vence o env global → rollback
 * instantâneo (zero-deploy) mesmo com Senna90 ligado pra todos.
 *
 *   setSenna90Primario(false)  // kill-switch: motor antigo AQUI
 *   setSenna90Primario(true)   // força Senna90 AQUI
 *   limparPrimaryEngine()      // remove override → volta ao default do ambiente
 */
export function setSenna90Primario(ligado: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, ligado ? ENV_VAL : 'off');
  } catch {
    /* localStorage indisponível — ignora */
  }
}

export function limparPrimaryEngine(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(LS_KEY); } catch { /* ignora */ }
}

// ══════════════════════════════════════════════════════════════════
// Kill-switch gêmeo — Senna93 params-engine (F3)
// ══════════════════════════════════════════════════════════════════
//
// REGRA: `senna93Params` só tem efeito com `senna90Primario()` ON — a
// metade dos números (params-tbody + calc-*) depende da ponte já estar
// ligada. Se `senna90Primario()` estiver OFF, `senna93Params()` é SEMPRE
// false, mesmo que o kill-switch abaixo esteja em 'senna93' ou o env
// global esteja ligado. Trocar esta flag exige RECARREGAR a página do
// laudo (não há hot-swap do motor numa sessão já aberta).
// ══════════════════════════════════════════════════════════════════

const PARAMS_KEY = 'leo:params-engine';
const PARAMS_VAL = 'senna93';

/**
 * True quando o Senna93 deve assumir params-tbody + calc-* (metade dos
 * números do laudo). Depende do Senna90 (`senna90Primario()`) estar ON —
 * ver REGRA acima.
 *
 * Precedência (idêntica à de `senna90Primario`, rollback instantâneo):
 *  0. senna90Primario() OFF        → sempre false (a ponte não está ligada)
 *  1. localStorage 'off'           → kill-switch por device (vence tudo)
 *  2. localStorage 'senna93'       → ON por device
 *  3. env NEXT_PUBLIC_PARAMS_ENGINE=senna93 → default global (produção)
 *
 * SSR-safe: retorna false no servidor (sem window/localStorage).
 */
export function senna93Params(): boolean {
  if (!senna90Primario()) return false;  // a metade dos números depende da ponte
  if (typeof window === 'undefined') return false;
  let ls: string | null = null;
  try { ls = localStorage.getItem(PARAMS_KEY); } catch { /* indisponível */ }
  if (ls === 'off') return false;        // kill-switch — rollback instantâneo
  if (ls === PARAMS_VAL) return true;
  return process.env.NEXT_PUBLIC_PARAMS_ENGINE === PARAMS_VAL;
}

/**
 * Força ON/OFF NESTE device. 'off' vence o env global → rollback
 * instantâneo (zero-deploy) mesmo com Senna93 ligado pra todos. Exige
 * recarregar a página do laudo pra ter efeito.
 *
 *   setSenna93Params(false)  // kill-switch: motor antigo AQUI
 *   setSenna93Params(true)   // força Senna93 AQUI
 *   limparParamsEngine()     // remove override → volta ao default do ambiente
 */
export function setSenna93Params(ligado: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PARAMS_KEY, ligado ? PARAMS_VAL : 'off');
  } catch {
    /* localStorage indisponível — ignora */
  }
}

export function limparParamsEngine(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(PARAMS_KEY); } catch { /* ignora */ }
}
