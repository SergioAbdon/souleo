// Gera AccessionNumber DICOM no formato EX{ddmmaa}{hhmmsscc} — 16 chars exatos.
// Formato escolhido pra cardio MedCardio (sessão 09/05/2026): único por exame, ordenável,
// legível humano em data/hora brasileiros, cabe no limite DICOM SH (16 chars).
// Usa horário local — function roda no client (Worklist.tsx).
//
// `offsetMs`: adicionar offset em ms ao timestamp. Útil pra batches
// (ex: importação Feegow) onde múltiplas chamadas em loop rápido pegam o mesmo
// timestamp e geram ACCs idênticos. Passar `i * 10` no loop garante 1 centésimo
// entre cada exame, evitando colisão de até 100 exames por segundo.
//
// Quando `offsetMs` NÃO é passado (cadastro manual, re-import Feegow, etc),
// usa contador global incremental (`_autoOffsetCounter * 10`) pra evitar colisão
// entre chamadas separadas no mesmo centésimo de segundo.
// Bug histórico (12/05/2026): 3 exames Feegow colidiram com ACC `EX12052610215916`
// porque o cliente reabriu a página entre tentativas, perdendo o contador.
// Esse mecanismo cobre tanto batch (offsetMs explícito) quanto chamadas avulsas.

// Counter global em memória — reseta no reload da página (intencional: após reload
// os ms da chamada já são diferentes, sem risco de colidir com a sessão anterior).
let _autoOffsetCounter = 0;

export function gerarAccessionNumber(now: Date = new Date(), offsetMs?: number): string {
  // Se offsetMs não foi passado, usa counter global incremental.
  // Caller pode passar 0 explicitamente pra forçar "sem offset" (testes, etc).
  const eff = offsetMs ?? (_autoOffsetCounter++ * 10);
  const t = eff ? new Date(now.getTime() + eff) : now;
  const dd = String(t.getDate()).padStart(2, '0');
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const aa = String(t.getFullYear()).slice(-2);
  const hh = String(t.getHours()).padStart(2, '0');
  const mi = String(t.getMinutes()).padStart(2, '0');
  const ss = String(t.getSeconds()).padStart(2, '0');
  const cc = String(Math.floor(t.getMilliseconds() / 10)).padStart(2, '0');
  return `EX${dd}${mm}${aa}${hh}${mi}${ss}${cc}`;
}
