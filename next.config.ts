import type { NextConfig } from "next";

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

export default nextConfig;
