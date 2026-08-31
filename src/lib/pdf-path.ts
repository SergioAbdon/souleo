// ══════════════════════════════════════════════════════════════════
// LEO · Caminho do PDF e do snapshot HTML no Storage — dono único do
// formato dos dois (S5-T14, rounds 5/6/7 do snapshot, tríade onda-3)
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
// existe a partir desta mesma safra (ver lerSnapshotHtml, pdf-storage.ts).
//
// Tríade onda-3 (Ruflo-A2): `pathSnapshotHtml`, `candidatosSnapshotHtml` e
// `emissaoKeyValida` moraram em pdf-storage.ts/emitir-admin.ts — foram pra cá
// porque SÃO formato de path/chave, o mesmo conhecimento de pathPdf/
// sanitizarNomeArq, não lógica de negócio. pdf-storage.ts e emitir-admin.ts
// importam daqui agora (emitir-admin re-exporta emissaoKeyValida pros
// chamadores antigos — API inalterada).
//
// Puro, SEM IMPORT NENHUM (nem @/, nem relativo) — testado direto por
// node --test, e importável de scripts .mjs fora do Next sem arrastar
// firebase-admin (ver scripts/shadow/retroativo.mjs).
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

// Formato do `crypto.randomUUID()` do navegador. Vem do cliente e vira
// chave de idempotência: qualquer outra coisa é recusada (a rota devolve
// 400) e ignorada aqui — garantia para todo chamador, não só a rota.
export function emissaoKeyValida(k: unknown): k is string {
  return typeof k === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k);
}

// Round 5 (Codex Critical): o snapshot ERA canônico por exameId — mesmo
// salvo só DEPOIS da publicação confirmada (round 4), duas tentativas
// (A publica, B reemite+publica+snapshota, o snapshot ATRASADO de A chega
// DEPOIS) escreviam o MESMO objeto — A sobrescrevia o snapshot de B mesmo
// perdendo a corrida no Firestore. Path por TENTATIVA agora (sufixo da
// emissaoKey), igual ao PDF desde o round 3 — sem `emissaoKey`, cai no
// canônico (exame pré-onda-0, que nunca teve key nenhuma).
// A key (UUID já validado por `emissaoKeyValida` no trust boundary da rota)
// entra CRUA no path — sem `/` nem caractere especial possível num UUID, não
// precisa sanitizar.
export function pathSnapshotHtml(wsId: string, exameId: string, emissaoKey?: string | null): string {
  // Round 7 (Ruflo item 2): key fora do formato UUID (gaveta corrompida/
  // adulterada) cai no canônico em vez de virar path esquisito — devolve a
  // garantia de dono do path pro seu dono de verdade (emissaoKeyValida).
  return emissaoKey && emissaoKeyValida(emissaoKey)
    ? `laudos-html/${wsId}/${exameId}-${emissaoKey}.html`
    : `laudos-html/${wsId}/${exameId}.html`;
}

// Round 6 (Codex Critical): o fallback pro canônico do round 5 era CEGO — se
// o save do sufixado falhasse em silêncio (`salvarSnapshotHtml` nunca
// lança), `lerSnapshotHtml` caía no canônico, que podia ser o corpo clínico
// de uma emissão ANTERIOR (uma correção regeneraria conteúdo desatualizado
// no exame ATUAL). Fix: a gaveta agora DECLARA `snapshotSufixado:true` no
// MESMO commit que confirma a emissão (publicarPdfSeAindaDono/
// marcarPdfErroSeAindaDono, emitir-admin.ts), ANTES da rota tentar o save —
// com a flag, SÓ o sufixado vale (sem fallback: sufixado ausente → null,
// correção honesta avisa `pdfDesatualizado` em vez de regenerar corpo
// velho). Sem a flag, comportamento do round 5 (cobre os 2 regimes antigos:
// pré-onda-0 sem key nenhuma, e a transição onda-0→round-6 com key mas sem a
// flag ainda).
// Exportada: pura, sem I/O — testável direto sem depender do Storage (não
// emulado nesta bateria), mesmo padrão de `pathPdf`/`sanitizarNomeArq`.
export function candidatosSnapshotHtml(
  wsId: string, exameId: string,
  gaveta?: { emissaoKey?: unknown; snapshotSufixado?: unknown } | null,
): string[] {
  const key = typeof gaveta?.emissaoKey === 'string' ? gaveta.emissaoKey : null;
  if (gaveta?.snapshotSufixado === true) {
    return [pathSnapshotHtml(wsId, exameId, key)];   // sem fallback — round 6
  }
  return key
    ? [pathSnapshotHtml(wsId, exameId, key), pathSnapshotHtml(wsId, exameId)]
    : [pathSnapshotHtml(wsId, exameId)];
}

// Tríade onda-3 (Codex-1 Important): `exameId` pode ter hífen (idValido,
// exame-admin.ts, permite) — apagar por PREFIXO cru (`laudos-html/{ws}/
// {exameId}-`) colide com outro exame cujo id COMEÇA com o mesmo texto:
// exameId 'abc' tem prefixo 'abc-', que também bate em 'abc-2.html' (o
// CANÔNICO de um exame totalmente diferente, id 'abc-2') e em
// 'abc-2-<uuid>.html' (um sufixado dele). `apagarSnapshotsExame` (pdf-
// storage.ts) lista os objetos sob um prefixo mais largo e usa ESTE matcher
// pra decidir, objeto a objeto, se é DESTE exame — exato, não prefixo.
// Dono declarado do formato (2 formas possíveis, as únicas que
// pathSnapshotHtml produz): canônico `{exameId}.html` OU sufixado
// `{exameId}-{uuid}.html`. `exameId` entra ESCAPADO na regex — sem isso, um
// id com caractere de regex (não deveria existir hoje, `idValido` é mais
// estrito, mas esta função não pode assumir isso do chamador) quebraria o
// match ou, pior, casaria coisa que não devia.
export function ehSnapshotDoExame(nomeObjeto: string, exameId: string): boolean {
  const basename = nomeObjeto.split('/').pop() ?? '';
  if (basename === `${exameId}.html`) return true;
  const exameIdEscapado = exameId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${exameIdEscapado}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.html$`, 'i')
    .test(basename);
}
