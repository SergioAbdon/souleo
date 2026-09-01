// ════════════════════════════════════════════════════════════════════
// SOULEO · Ordem de chegada da worklist (ajuste 31/08/2026, item 2)
// ════════════════════════════════════════════════════════════════════
//
// `horarioChegada` NUNCA foi hora de chegada pra exame FEEGOW: e o horario
// do SLOT agendado (`ag.horario`). Ordenar por ele misturava agenda com
// fila real — paciente das 08:00 que chegou 10:30 furava a fila de quem
// chegou 08:50. A chegada de verdade e:
//   - FEEGOW → `chegouEm` (serverTimestamp gravado na importacao, que so
//     aceita quem ja esta na sala de espera — status_id=4);
//   - MANUAL → `criadoEm` (recepcao cadastra na chegada);
//   - legado sem nenhum dos dois → fim da fila, na ordem que o Firestore
//     ja devolveu (sort estavel preserva o orderBy('horarioChegada')).

type TsLike = { toMillis?: () => number; toDate?: () => Date } | null | undefined;

function tsChegada(item: Record<string, unknown>): TsLike {
  return (item.chegouEm ?? item.criadoEm) as TsLike;
}

/** Millis da chegada; sem timestamp (pending write/legado) vai pro fim. */
function millisChegada(item: Record<string, unknown>): number {
  const ms = tsChegada(item)?.toMillis?.();
  return typeof ms === 'number' ? ms : Number.MAX_SAFE_INTEGER;
}

/** Ordena por chegada real, asc (quem chegou primeiro no topo). */
export function ordenarPorChegada<T extends Record<string, unknown>>(items: T[]): T[] {
  return [...items].sort((a, b) => millisChegada(a) - millisChegada(b));
}

/**
 * "HH:MM" da chegada real pra coluna Hora — a lista e ordenada por
 * `chegouEm`, entao exibir o horario AGENDADO faria a coluna parecer fora
 * de ordem. Fallback: `horarioChegada` (manual/legado, onde ele e real).
 */
export function horaChegadaExibicao(item: Record<string, unknown>): string {
  const d = (item.chegouEm as TsLike)?.toDate?.();
  if (d instanceof Date && !isNaN(d.getTime())) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return (item.horarioChegada as string) || '';
}
