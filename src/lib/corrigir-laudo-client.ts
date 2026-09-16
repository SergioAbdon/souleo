// ══════════════════════════════════════════════════════════════════
// LEO · Cliente de /api/corrigir-laudo — Worklist e Histórico (Ponytail-6)
// O fetch+token+mapa de erro estava duplicado entre salvarCorrecaoAdm e
// regerarPdf no Worklist; o Histórico ganhou o MESMO botão "Regerar PDF"
// (S7 onda-1, Ruflo-2) e reusa este caminho em vez de reimplementar.
// ══════════════════════════════════════════════════════════════════
import { auth } from '@/lib/firebase';

export type CorrigirLaudoBody = {
  wsId: string;
  exameId: string;
  convenio?: string;
  solicitante?: string;
  // Ruflo-4: 'regerar' e o botao "Regerar PDF" — o servidor ignora
  // convenio/solicitante do corpo e usa o que ja esta gravado no exame.
  acao?: 'regerar';
};

export type CorrigirLaudoResposta = {
  ok: boolean;
  error?: string;
  pdfUrl?: string | null;
  pdfErro?: string | null;
  pdfDesatualizado?: boolean;
};

// POST autenticado — token sempre pego na hora (getIdToken() renova sozinho
// perto do vencimento, nunca cacheia entre chamadas).
export async function postCorrigirLaudo(body: CorrigirLaudoBody): Promise<CorrigirLaudoResposta> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch('/api/corrigir-laudo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Mapa motivo→mensagem, mesmo texto nos 2 botoes (correcao e regerar): um
// erro de permissao/corrida NAO e "sem snapshot" — mandar reemitir nesses
// casos cobraria uma 2a franquia por engano (achado do reviewer, 27/08).
export function msgErroCorrecao(error: string | undefined, modo: 'correcao' | 'regerar' = 'correcao'): string {
  if (error === 'nao_emitido') return 'Este laudo não está emitido.';
  if (error === 'sem_permissao') {
    return modo === 'regerar' ? 'Você não tem permissão para regerar aqui.' : 'Você não tem permissão para corrigir aqui.';
  }
  if (error === 'reemitido_durante_correcao') {
    return 'O médico reemitiu o laudo neste instante — a reemissão usa os dados da tela dele e pode ter desfeito esta correção. Confira o laudo novo e refaça se preciso.';
  }
  return modo === 'regerar' ? 'Snapshot indisponível — reemita o laudo.' : 'Não foi possível salvar a correção. Tente de novo.';
}
