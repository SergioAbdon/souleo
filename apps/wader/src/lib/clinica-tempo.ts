/**
 * Fonte única de "hoje" pro Wader (Task 8, D1 — corrige o bug das 21h).
 *
 * `new Date().toISOString().slice(0,10)` calcula a data em UTC. Belém é
 * UTC-3: às 21h de lá já é meia-noite em UTC, então o servidor concluía
 * "não há mais nada pra hoje" e o `worklist-sync` apagava a worklist
 * inteira do aparelho (eco marcado pras 21h30 sumia do Vivid).
 *
 * `Intl.DateTimeFormat` com `timeZone` calcula a data no fuso da clínica,
 * não no fuso do processo Node.
 */
export const CLINIC_TZ = 'America/Belem';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data de hoje (YYYY-MM-DD) no fuso da clínica. */
export function hojeClinica(agora: Date = new Date()): string {
  return formatter.format(agora);
}
