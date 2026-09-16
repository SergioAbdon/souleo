// ══════════════════════════════════════════════════════════════════
// SOULEO · Alertas do motor → o que a tela mostra (F3 Task 2)
// ══════════════════════════════════════════════════════════════════
//
// O Senna90/93 devolve `alertas: AlertaUI[]` em TODA rodada da ponte
// (`/api/laudo/calcular`). Até a F3 esse campo era jogado fora pela
// page — o médico via só o `#alerta-psap` legado (um aviso, hardcoded
// no HTML, ligado por `window.alertaIT`). Esta função é o filtro puro
// entre "o que o motor mandou" e "o que a sidebar renderiza":
//
//   - dedupe por `tipo` (o primeiro do array vence — mesma mensagem
//     duas vezes é ruído, não dois problemas);
//   - ORDEM FIXA, independente da ordem em que o motor empilhou:
//     IT_SEM_PSAP → REFLUXO_PULM_SEM_PMAP → AORTA_SEM_IDADE →
//     WILKINS_INCOMPLETO → SEXO_AUSENTE → MASSA_NAO_INDEXAVEL. A lista
//     é curta e a posição de cada aviso não pode dançar entre uma tecla
//     e a próxima.
//
// `ORDEM` é um `Record<AlertaUI['tipo'], number>` de propósito: se o
// motor ganhar mais um tipo de alerta, o `tsc` quebra AQUI (chave
// faltando) em vez de o alerta novo sumir calado da tela.
//
// Puro (sem DOM, sem window) — testado em tests/unit/alertas-motor.test.mjs.
// ══════════════════════════════════════════════════════════════════

import type { AlertaUI } from '@/senna90/types';

const ORDEM: Record<AlertaUI['tipo'], number> = {
  IT_SEM_PSAP: 0,
  REFLUXO_PULM_SEM_PMAP: 1,
  AORTA_SEM_IDADE: 2,
  WILKINS_INCOMPLETO: 3,
  SEXO_AUSENTE: 4,
  MASSA_NAO_INDEXAVEL: 5,
};

/**
 * Alertas prontos pra render: deduplicados por tipo e em ordem fixa.
 * Tolerante à entrada (a lista vem de JSON da rede): não-array → `[]`,
 * item nulo ou de tipo desconhecido → descartado.
 */
export function alertasVisiveis(alertas: AlertaUI[] | null | undefined): AlertaUI[] {
  if (!Array.isArray(alertas)) return [];
  const porTipo = new Map<string, AlertaUI>();
  for (const a of alertas) {
    if (a && Object.hasOwn(ORDEM, a.tipo) && !porTipo.has(a.tipo)) porTipo.set(a.tipo, a);
  }
  return [...porTipo.values()].sort((x, y) => ORDEM[x.tipo] - ORDEM[y.tipo]);
}
