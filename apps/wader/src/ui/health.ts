import { calcularAviso } from '../lib/aviso';
import type { EstadoWader } from '../lib/estado';

/** Contrato do /health (spec §9). Mudou campo → sobe HEALTH_SCHEMA e a fixture. */
export const HEALTH_SCHEMA = 1;

export interface Health {
  schema: typeof HEALTH_SCHEMA;
  status: 'ok';
  service: 'wader';
  timestamp: string;
  versao: string;
  versaoDisponivel: string | null;
  lider: boolean;
  outraMaquina: string | null;
  aviso: string | null;
  versaoRejeitada: string | null;
  erroLancador: string | null;
  ultimaSaida: { motivo: string; em: string } | null;
  prevExiste: boolean;
}

export function montarHealth(e: EstadoWader, agora: Date = new Date()): Health {
  const versaoRejeitada = e.lancador?.versaoRejeitada ?? null;
  const versaoDisponivel = e.versaoDisponivel?.versao ?? null;
  return {
    schema: HEALTH_SCHEMA,
    status: 'ok',
    service: 'wader',
    timestamp: agora.toISOString(),
    versao: e.versao,
    versaoDisponivel,
    lider: e.souLider(),
    outraMaquina: e.outraMaquina(),
    aviso: calcularAviso({
      agoraMs: agora.getTime(),
      ultimoOrthancOkEm: e.ultimoOrthancOkEm()?.getTime() ?? e.iniciadoEm,
      versaoDisponivel,
      souLider: e.souLider(),
      outraMaquina: e.outraMaquina(),
      versaoRejeitada,
      versaoAtual: e.versao,
    }),
    versaoRejeitada,
    erroLancador: e.lancador?.erro ?? null,
    ultimaSaida: e.lancador?.ultimaSaida ?? null,
    prevExiste: e.prevExiste(),
  };
}
