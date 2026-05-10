import pino from 'pino';

/**
 * Logger raiz do Wader.
 *
 * Em desenvolvimento usa pino-pretty (legível no terminal).
 * Em produção (NODE_ENV=production) emite JSON estruturado pra ingest no Sentry/cloud.
 */
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.WADER_LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    service: 'wader',
  },
});

/**
 * Cria um logger filho com contexto fixo (ex: módulo, requestId).
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
