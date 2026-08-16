// Pílula de status do padrão V7 (spec §2). Fonte única — Worklist, Histórico
// e Pacientes usam esta, não badges locais.
const ESTILOS: Record<string, { cor: string; icone: string; texto: string }> = {
  aguardando: { cor: 'bg-amber-100 text-amber-800', icone: '⏳', texto: 'Aguardando' },
  andamento: { cor: 'bg-blue-100 text-blue-800', icone: '✏️', texto: 'Em andamento' },
  rascunho: { cor: 'bg-gray-100 text-gray-600', icone: '📝', texto: 'Rascunho' },
  emitido: { cor: 'bg-green-100 text-green-800', icone: '✅', texto: 'Emitido' },
  'nao-realizado': { cor: 'bg-gray-200 text-gray-500', icone: '🚫', texto: 'Não realizado' },
  cancelado: { cor: 'bg-red-100 text-red-700', icone: '❌', texto: 'Cancelado' },
};

/** Normaliza pra uma chave conhecida de ESTILOS — MESMO fallback que a pill
 * usa internamente. Consumida pelos call sites que precisam decidir a ação
 * (ex.: `[id]/page.tsx`) com o valor exato que a pill vai exibir, pra pill
 * e botão nunca divergirem num status desconhecido/legado. */
export const statusConhecido = (s?: string) => (s && s in ESTILOS ? s : 'aguardando');

export default function StatusPill({ status }: { status: string }) {
  const e = ESTILOS[statusConhecido(status)];
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${e.cor}`}>
      {e.icone} {e.texto}
    </span>
  );
}
