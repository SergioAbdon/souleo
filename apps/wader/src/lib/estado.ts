// apps/wader/src/lib/estado.ts — o que /health, batimento e aviso leem.
import type { Lancador } from './saida';

export interface ReleaseInfo { versao: string; assets: Record<string, string> }

export interface EstadoWader {
  versao: string;
  iniciadoEm: number;
  versaoDisponivel: ReleaseInfo | null;
  souLider: () => boolean;
  outraMaquina: () => string | null;
  ultimoOrthancOkEm: () => Date | null;
  lancador: Lancador | null;
  prevExiste: () => boolean;
}
