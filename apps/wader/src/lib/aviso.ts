/**
 * A regra do toast mora aqui, no exe (corte Ponytail 2, achado Ruflo 8):
 * o wader-aviso.ps1 só mostra o texto que o /health entrega.
 * Prioridade: não-líder > sem Orthanc > versão rejeitada > versão disponível.
 */
export interface EntradaAviso {
  agoraMs: number;
  ultimoOrthancOkEm: number; // ms; sem resposta desde a subida = iniciadoEm
  versaoDisponivel: string | null;
  souLider: boolean;
  outraMaquina: string | null;
  versaoRejeitada: string | null;
  versaoAtual: string;
}

const SEM_ORTHANC_MS = 5 * 60_000;

export function calcularAviso(e: EntradaAviso): string | null {
  if (!e.souLider && e.outraMaquina) return `Outro Wader ativo em ${e.outraMaquina}`;
  if (e.souLider && e.agoraMs - e.ultimoOrthancOkEm > SEM_ORTHANC_MS) return 'Wader sem Orthanc';
  if (e.versaoRejeitada) return `Wader voltou pra v${e.versaoAtual}: a v${e.versaoRejeitada} caiu 3 vezes`;
  if (e.versaoDisponivel) return `Wader v${e.versaoDisponivel} disponível — abra o painel pra atualizar`;
  return null;
}
