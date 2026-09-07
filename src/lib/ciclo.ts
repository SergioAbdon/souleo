// ══════════════════════════════════════════════════════════════════
// LEO · ciclo.ts — fonte UNICA do significado de `cicloFim` (S7-triade-2b,
// Ruflo-1 CRITICAL). PURO: zero imports de SDK, roda em cliente e servidor.
//
// `cicloFim` mudou de significado no E11 opcao D (ADR 2026-08-30-secao7-
// renovacao-ciclo.md): o servidor GIRA o ciclo sozinho dentro da transacao
// de `emitirComCobranca` (emitir-admin.ts) quando acha a assinatura
// elegivel. Isso quer dizer que `cicloFim` deixou de significar "prazo que
// trava emissao" e passou a significar "valido ate a ULTIMA emissao" — uma
// conta paga com `cicloFim` vencido AINDA esta ativa (o proximo emitir gira
// sozinho). Os leitores que faziam `agora <= cicloFim` pra decidir
// ativo/inadimplente ficaram lendo o significado ANTIGO: MRR cai sozinho na
// virada do mes, conta paga em dia vira "inadimplente" nos paineis do Direx.
//
// `vigente()` e o predicado CORRETO pra essas decisoes de dinheiro/churn.
// Onde o leitor mostra a DATA ("expira em X"), `cicloFim` continua sendo a
// data certa — so o boolean ativo/inadimplente precisa de `vigente()`.
//
// `podeGirar`/`proximoCicloFim` sao o MESMO predicado/loop que
// `emitirComCobranca` usa pra girar de verdade e que `checkEmissao`
// (billing.ts) usa na previa do cliente — antes duplicados em texto (pin
// cross-file em giro-ciclo-predicado-pin.test.mjs, agora aposentado: os 2
// arquivos importam daqui, entao so pode haver 1 predicado).
// ══════════════════════════════════════════════════════════════════

export type SubCiclo = {
  cicloFim?: { toDate: () => Date } | Date | string | null;
  franquiaMensal?: number;
  tipo?: string;
};

function comoData(v: SubCiclo['cicloFim']): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

// Conta paga (franquiaMensal > 0), nao-trial, com ciclo vencido: o proximo
// `emitirComCobranca` gira sozinho (ADR §1b/§3 — trial NUNCA gira, o Direx
// converte na mao).
export function podeGirar(sub: SubCiclo, agora: Date): boolean {
  const fim = comoData(sub.cicloFim);
  return !!fim && agora > fim && (sub.franquiaMensal || 0) > 0 && sub.tipo !== 'trial';
}

// O loop +30d do giro (emitir-admin.ts): avanca em passos de 30 dias a
// partir do cicloFim VELHO (nao de "agora") ate ficar no futuro — cobre gap
// de N ciclos ausentes (conta parada 3 meses) sem as datas escorregarem.
export function proximoCicloFim(cicloFimVelhoMs: number, agoraMs: number): number {
  const TRINTA_DIAS_MS = 30 * 864e5;
  let novoFimMs = cicloFimVelhoMs;
  do { novoFimMs += TRINTA_DIAS_MS; } while (novoFimMs <= agoraMs);
  return novoFimMs;
}

// Prévia PURA da decisão de emissão — a MESMA cadeia de braços que
// `emitirComCobranca` (emitir-admin.ts) percorre dentro da transação, menos
// o giro em si (o servidor gira e cobra; aqui `podeGirar` já responde
// 'franquia' porque o servidor VAI girar). É o corpo de `checkEmissao`
// (billing.ts), extraído pra cá na revisão do E13 (Codex): pura = testável
// em unit, e `cicloFim` nulo/ilegível é normalizado por `comoData` — sem a
// divergência do cliente que fazia `new Date(null)` virar 1970.
export type PreviaEmissao =
  | { pode: true; tipo: 'franquia' | 'creditos' }
  | { pode: false; motivo: 'expirado' | 'sem_saldo' };

export function previaEmissao(
  sub: SubCiclo & { franquiaUsada?: number; creditosExtras?: number },
  agora: Date,
): PreviaEmissao {
  const fim = comoData(sub.cicloFim);
  const franquiaUsada = sub.franquiaUsada || 0;
  const franquiaMensal = sub.franquiaMensal || 0;
  const creditosExtras = sub.creditosExtras || 0;

  // E11 opção D: conta paga vencida gira sozinha no próximo emitir.
  if (podeGirar(sub, agora)) return { pode: true, tipo: 'franquia' };
  // E13 (decisão Sergio 01/09): vencida e NÃO-vigente = expirado, mesmo com
  // crédito — trial vencido com crédito emitia pra sempre.
  if (fim && agora > fim && !vigente(sub, agora)) return { pode: false, motivo: 'expirado' };
  if (fim && agora <= fim && franquiaUsada < franquiaMensal) return { pode: true, tipo: 'franquia' };
  // Crédito extra só em conta vigente (sem cicloFim não há vigência).
  if (creditosExtras > 0 && vigente(sub, agora)) return { pode: true, tipo: 'creditos' };
  return { pode: false, motivo: 'sem_saldo' };
}

// "Essa assinatura ainda conta como ativa" pra dinheiro/churn (MRR,
// cancelamentos, inadimplentes, badge Ativo/Expirado). Vencida NAO e mais
// sinonimo de inativa: conta paga gira sozinha no proximo emitir.
export function vigente(sub: SubCiclo, agora: Date): boolean {
  const fim = comoData(sub.cicloFim);
  // Sem cicloFim nao ha vigencia pra contar: nao gira (podeGirar exige a
  // data) nem emite por franquia — mesmo com creditos, sem ciclo pago nao ha
  // mensalidade (MRR/ativo) a declarar.
  if (!fim) return false;
  return agora <= fim || ((sub.franquiaMensal || 0) > 0 && sub.tipo !== 'trial');
}
