// Gera AccessionNumber DICOM no formato EX{ddmmaa}{hhmmsscc} — 16 chars exatos.
// Formato escolhido pra cardio MedCardio (sessão 09/05/2026): único por exame, ordenável,
// legível humano em data/hora brasileiros, cabe no limite DICOM SH (16 chars).
// Usa horário local — function roda no client (Worklist.tsx).

export function gerarAccessionNumber(now: Date = new Date()): string {
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const aa = String(now.getFullYear()).slice(-2);
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const cc = String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0');
  return `EX${dd}${mm}${aa}${hh}${mi}${ss}${cc}`;
}
