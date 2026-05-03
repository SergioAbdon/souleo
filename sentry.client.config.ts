// ══════════════════════════════════════════════════════════════════
// SOULEO · Sentry — Browser
// Captura erros do navegador (React, eventos, fetch)
// ══════════════════════════════════════════════════════════════════

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || 'https://8f0865d182a151f84852be0c7c1bf857@o4511327639437312.ingest.us.sentry.io/4511327652282368',

  // Sample rate baixo pra economizar quota gratuita
  tracesSampleRate: 0.1,

  // Replay desabilitado por enquanto (consome muito da cota)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Ambiente
  environment: process.env.NODE_ENV,

  // Ignorar erros conhecidos / ruidosos
  ignoreErrors: [
    'ResizeObserver loop',
    'Network request failed',
    'Load failed',
    'cancelled',
    'AbortError',
  ],

  // Filtrar PII basico
  beforeSend(event) {
    // Remover dados sensiveis dos breadcrumbs
    if (event.request?.cookies) delete event.request.cookies;
    return event;
  },
});
