// ══════════════════════════════════════════════════════════════════
// SOULEO · Sentry — Edge Runtime
// Captura erros de middleware e edge functions (no momento, nenhum)
// Mantido por compatibilidade com o SDK
// ══════════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || 'https://8f0865d182a151f84852be0c7c1bf857@o4511327639437312.ingest.us.sentry.io/4511327652282368',

  tracesSampleRate: 0.1,

  environment: process.env.NODE_ENV,
});
