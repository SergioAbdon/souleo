// Gera AccessionNumber DICOM no formato EX{ddmmaa}{hhmmsscc} — 16 chars exatos.
// Formato escolhido pra cardio MedCardio (sessão 09/05/2026): único por exame, ordenável,
// legível humano em data/hora brasileiros, cabe no limite DICOM SH (16 chars).
// Usa horário local — function roda no client (Worklist.tsx).
//
// `offsetMs` (default 0): adicionar offset em ms ao timestamp. Útil pra batches
// (ex: importação Feegow) onde múltiplas chamadas em loop rápido pegam o mesmo
// timestamp e geram ACCs idênticos. Passar `i * 10` no loop garante 1 centésimo
// entre cada exame, evitando colisão de até 100 exames por segundo.

export function gerarAccessionNumber(now: Date = new Date(), offsetMs: number = 0): string {
  const t = offsetMs ? new Date(now.getTime() + offsetMs) : now;
  const dd = String(t.getDate()).padStart(2, '0');
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const aa = String(t.getFullYear()).slice(-2);
  const hh = String(t.getHours()).padStart(2, '0');
  const mi = String(t.getMinutes()).padStart(2, '0');
  const ss = String(t.getSeconds()).padStart(2, '0');
  const cc = String(Math.floor(t.getMilliseconds() / 10)).padStart(2, '0');
  return `EX${dd}${mm}${aa}${hh}${mi}${ss}${cc}`;
}
