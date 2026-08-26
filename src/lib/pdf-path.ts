// ══════════════════════════════════════════════════════════════════
// LEO · Caminho do PDF no Storage — as duas metades juntas (S5-T14)
// Construir o path e saber o nome do arquivo eram conhecimentos separados:
// `pdf-server.ts` montava `laudos/{wsId}/{nome}.pdf` e `correcao-admin.ts`
// (feature) fazia o parse de volta pra descobrir o alvo da regravação —
// inversão de camada, e um formato que ninguém segurava dos dois lados.
// Agora o formato mora aqui, sozinho, e quem grava usa o mesmo nome que quem
// regrava (o alvo vai na metadata do snapshot).
//
// `exameId` no PATH (fix I3 da tríade final): o caminho antigo era só
// `laudos/{wsId}/{TIPO NOME}.pdf` — mesmo paciente em duas datas (eco em
// março e em setembro) ou dois homônimos no mesmo local SOBRESCREVIAM um
// laudo assinado pelo outro, sem atacante nenhum, e o link já entregue
// passava a servir o exame errado. PDFs antigos ficam onde estão (URL antiga
// continua válida); só emissão nova nasce no caminho com exameId — e a
// correção administrativa só regera PDF de exame que TEM snapshot, o que só
// existe a partir desta mesma safra (ver lerSnapshotHtml).
//
// Puro, sem import @/ — testado direto por node --test.
// ══════════════════════════════════════════════════════════════════

/** Nome do arquivo, sanitizado e idempotente (aplicar 2× não muda nada). */
export function sanitizarNomeArq(nomeArq: string, exameId: string): string {
  return (nomeArq || `laudo_${exameId}`)
    .replace(/[^a-zA-Z0-9À-ÿ _-]/g, '')
    .replace(/\s+/g, '_');
}

/** Caminho do objeto no bucket. `nomeArquivo` JÁ sanitizado. */
export function pathPdf(wsId: string, exameId: string, nomeArquivo: string): string {
  return `laudos/${wsId}/${exameId}/${nomeArquivo}.pdf`;
}
