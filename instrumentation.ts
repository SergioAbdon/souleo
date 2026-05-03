// ══════════════════════════════════════════════════════════════════
// SOULEO · Next.js Instrumentation
// Carrega o Sentry no servidor de acordo com o runtime
// ══════════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captura erros nao tratados em requisicoes
export const onRequestError = Sentry.captureRequestError;
