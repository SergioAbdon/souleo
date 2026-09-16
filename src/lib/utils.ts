// ══════════════════════════════════════════════════════════════════
// SOULEO · Utilitários
// Funções puras reutilizáveis em todo o projeto
// ══════════════════════════════════════════════════════════════════

// Fonte UNICA de tempo no fuso da clinica (America/Belem, UTC-3 fixo).
// Roda igual em cliente e servidor (Vercel = UTC; depois das 21h BRT o
// new Date() do servidor ja virou o dia — bug real de 22/06/2026).
const FUSO_CLINICA = 'America/Belem';

export function dataLocalBRT(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export function dataLocalHoje(): string {
  return dataLocalBRT(new Date());
}

// "Agora" como Date cujos getters LOCAIS devolvem os componentes de Belem —
// pro gerarAccessionNumber funcionar igual no Vercel (UTC) e na clinica (BRT).
export function agoraBelem(): Date {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((a, x) => ({ ...a, [x.type]: x.value }), {} as Record<string, string>);
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, new Date().getMilliseconds());
}
