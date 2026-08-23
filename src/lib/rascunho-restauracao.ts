// ══════════════════════════════════════════════════════════════════
// LEO · Restauração do laudo — rascunho local vs. servidor (S5-T1)
//
// Ao abrir o laudo, dois candidatos podem preencher a tela: o rascunho
// local (localStorage, plano B offline) e o exame do servidor (que agora
// também carrega `laudoHtml`, gravado por `salvarLaudo`). O `confirm()`
// que pergunta "deseja recuperar?" é impuro e fica na tela — esta função
// só resolve QUAL fonte vence, já com a resposta do médico em mãos.
//
// nº8: identificação (nome/dtnasc/convênio/...) é preenchida pela tela
// SEMPRE depois, incondicional a esta decisão — não é responsabilidade
// desta função.
// nº9: recusar o rascunho local NÃO o apaga — não há "remover" aqui.
// ══════════════════════════════════════════════════════════════════

export type RascunhoLocal = {
  medidas?: Record<string, string>;
  laudoHtml?: string;
  timestamp?: number;
} | null | undefined;

export type ExameParaRestauracao = {
  medidas?: Record<string, string>;
  laudoHtml?: string;
} | null | undefined;

export type FontePreenchimento = {
  medidas: Record<string, string> | undefined;
  laudoHtml: string | undefined;
  origem: 'rascunho-local' | 'exame';
};

/**
 * Rascunho local só vence quando existe E o médico aceitou no `confirm()`.
 * Em qualquer outro caso (sem rascunho local, ou recusado) o exame do
 * servidor é a fonte — inclusive o `laudoHtml` que `salvarLaudo` gravou lá.
 */
export function decidirFontePreenchimento(
  rascunhoLocal: RascunhoLocal,
  aceitouRascunho: boolean,
  exame: ExameParaRestauracao,
): FontePreenchimento {
  if (rascunhoLocal && aceitouRascunho) {
    return { medidas: rascunhoLocal.medidas, laudoHtml: rascunhoLocal.laudoHtml || undefined, origem: 'rascunho-local' };
  }
  return { medidas: exame?.medidas, laudoHtml: exame?.laudoHtml || undefined, origem: 'exame' };
}
