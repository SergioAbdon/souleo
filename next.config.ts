import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Desabilitar Turbopack (causando travamento)
  turbopack: undefined,

  // Garantir que o binario do Chromium seja incluido no deploy serverless
  // Sem isso, /var/task/node_modules/@sparticuz/chromium/bin nao existe na Vercel
  outputFileTracingIncludes: {
    '/api/emitir': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/gerar-pdf': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
};

// ── Sentry config ──
// Wrapper que processa source maps, instrumentacao automatica de tracing,
// e envia o build como release pro dashboard do Sentry.
export default withSentryConfig(nextConfig, {
  // Configuracao da organizacao/projeto (auto-detect via auth token no CI)
  org: 'leo-cy',
  project: 'javascript-nextjs',

  // Suprime logs verbose
  silent: !process.env.CI,

  // Source maps: facilita debug em prod
  widenClientFileUpload: true,

  // Tunnel de eventos (driblar adblock)
  tunnelRoute: '/monitoring',

  webpack: {
    // Desabilitar logger no client (reduz bundle size)
    treeshake: { removeDebugLogging: true },
    // Auto-instrumentacao Vercel
    automaticVercelMonitors: false,
  },
});
