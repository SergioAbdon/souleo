// Formatação de datas das telas de Histórico/Extrato (P2 — era copiada 2x).
export function fmtDataExame(d: string | undefined): string {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

export function fmtDataHora(t: { toDate?: () => Date } | undefined): string {
  try {
    const dt = t?.toDate?.();
    if (dt) return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { /* */ }
  return '—';
}
