// ══════════════════════════════════════════════════════════════════
// LEO · PDF storage puro (sem Puppeteer) — onda-3 P9
// Extraído de pdf-server.ts: a sombra (shadow/deps-admin.ts) só precisa LER
// o snapshot HTML pra comparar com o motor novo, mas importar de
// pdf-server.ts arrastava puppeteer-core + @sparticuz/chromium pro bundle do
// cron — que nunca renderiza PDF nenhum. Aqui só fica o que fala com o
// Storage/Firestore; pdf-server.ts fica só com o pipeline do Puppeteer.
// ══════════════════════════════════════════════════════════════════
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { sanitizarNomeArq, pathPdf } from './pdf-path';
// lerSnapshotHtml resolve o path certo lendo a gaveta de idempotencia —
// mesmo dono do estado de emissao. Sem ciclo: emitir-admin.ts so importa
// billing-admin.ts e correcao-admin.ts (nenhum dos dois importa
// pdf-storage), e ambos ja sao relativos/sem `@/`.
import { refEmissaoPrivada, emissaoKeyValida } from './emitir-admin';

// ── Salvar buffer de PDF pronto no Storage (Task 5: reusado pelo caminho
// Puppeteer em pdf-server.ts E pelo caminho de anexo direto em /api/emitir) ──
export async function salvarPdfBuffer(
  buf: Buffer,
  wsId: string,
  exameId: string,
  nomeArq: string
): Promise<string> {
  const bucket = getStorage().bucket();
  // Formato do path (com exameId) e sanitização do nome: `pdf-path.ts`.
  const nomeArquivo = sanitizarNomeArq(nomeArq, exameId);
  const filePath = pathPdf(wsId, exameId, nomeArquivo);
  const file = bucket.file(filePath);

  await file.save(buf, {
    resumable: false,               // P19: buffer pequeno, um request só
    predefinedAcl: 'publicRead',    // P19: mata o segundo round-trip do makePublic
    metadata: {
      contentType: 'application/pdf',
      contentDisposition: `inline; filename="${nomeArquivo}.pdf"`,
      // P3: a correção administrativa regrava o MESMO objeto público — com o
      // default do GCS (max-age=3600) o link já entregue servia o PDF ERRADO
      // por até 1h depois da correção, sem sinal nenhum.
      cacheControl: 'no-cache',
    },
  });

  return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}

// Apaga o objeto do PDF pelo MESMO trio (wsId, exameId, nomeArq) que
// salvarPdfBuffer usa pra escrever — path unico, pdf-path.ts (round 3, Codex
// Critical/item 2). Usada quando a tentativa perde a corrida de publicacao
// (publicarPdfSeAindaDono/publicarCorrecaoSeAindaEmitido devolve false): a
// tentativa apaga o objeto que ELA MESMA acabou de subir. Em /api/emitir o
// path e exclusivo desta tentativa (sufixo de emissaoKey no nomeArq) —
// ninguem mais escreve nele, entao o delete e seguro POR CONSTRUCAO, sem
// precisar de precondicao de generation (round-trip extra caro que o SDK
// exigiria pra comparar geracao do objeto). Nunca lanca: limpeza de orfao
// nao pode derrubar a resposta da rota — pior caso, o objeto fica ate uma
// limpeza manual.
export async function apagarPdfObjeto(wsId: string, exameId: string, nomeArq: string): Promise<void> {
  try {
    const nomeArquivo = sanitizarNomeArq(nomeArq, exameId);
    await getStorage().bucket().file(pathPdf(wsId, exameId, nomeArquivo)).delete({ ignoreNotFound: true });
  } catch (e) {
    console.error('apagarPdfObjeto (nao-critico):', e);
  }
}

// ── Snapshot do HTML do laudo (S5-T5 / D4) ──
// O HTML que virou PDF fica congelado no Storage. É ele que a correção
// administrativa reescreve (só convênio/solicitante) — em vez de confiar num
// HTML mandado pelo cliente, que deixava reescrever o laudo assinado inteiro.
// Path NÃO usa campo nenhum do doc pra LER (o doc é editável pelo navegador
// — apontaria pro snapshot de outro exame); a resolução é só pela GAVETA
// (ver lerSnapshotHtml abaixo). Onda-3 (P9/R3, Ponytail): o campo
// `pdfHtmlPath` que era gravado no doc só como marca/auditoria saiu — zero
// leitores em todo o repo, uma escrita morta.
// Prefixo `laudos-html/` (fix I3): cai no DENY DEFAULT do storage.rules — o
// laudo clínico completo não fica legível sem autenticação como fica em
// `laudos/` (onde o PDF é público de propósito). Admin SDK bypassa a regra.
//
// Round 5 (Codex Critical): o snapshot ERA canônico por exameId — mesmo
// salvo só DEPOIS da publicação confirmada (round 4), duas tentativas
// (A publica, B reemite+publica+snapshota, o snapshot ATRASADO de A chega
// DEPOIS) escreviam o MESMO objeto — A sobrescrevia o snapshot de B mesmo
// perdendo a corrida no Firestore. Path por TENTATIVA agora (sufixo da
// emissaoKey), igual ao PDF desde o round 3 — sem `emissaoKey`, cai no
// canônico (exame pré-onda-0, que nunca teve key nenhuma).
// Exportada (round 5): pura, sem I/O — testável direto sem depender do
// Storage (não emulado nesta bateria), mesmo padrão de `pathPdf`/
// `sanitizarNomeArq` em pdf-path.ts. A key (UUID já validado por
// `emissaoKeyValida` no trust boundary da rota) entra CRUA no path — sem `/`
// nem caractere especial possível num UUID, não precisa sanitizar.
export function pathSnapshotHtml(wsId: string, exameId: string, emissaoKey?: string | null): string {
  // Round 7 (Ruflo item 2): key fora do formato UUID (gaveta corrompida/
  // adulterada) cai no canonico em vez de virar path esquisito — devolve a
  // garantia de dono do path pro seu dono de verdade (emissaoKeyValida).
  return emissaoKey && emissaoKeyValida(emissaoKey)
    ? `laudos-html/${wsId}/${exameId}-${emissaoKey}.html`
    : `laudos-html/${wsId}/${exameId}.html`;
}

// Nunca lança: emissão não pode falhar porque o snapshot falhou — o PDF é o
// produto. Sem snapshot, a correção só grava os campos e avisa o médico.
// `nomeArq` vai na metadata do OBJETO (Storage é admin-write-only): é o alvo
// que a correção regrava. Guardar isso no doc do exame seria dar o volante
// de volta ao cliente — o médico-autor pode editar o doc emitido e apontar
// pro PDF de outro paciente (fix I1).
// Exportada (Task 6 / P4+E4): o catch do /api/emitir também precisa congelar
// o snapshot quando o Puppeteer falha DEPOIS da franquia cobrada — sem ele a
// correção administrativa deste exame (única via de recuperação sem 2a
// franquia) morre pra sempre.
// Round 4 (Codex Critical, item 3): chamada SÓ pela ROTA agora — nunca mais
// de dentro de `gerarESalvarPdf`. Cada caller só chama isto DEPOIS que a
// transação de publicação (round 2/3) devolveu `true` — ver /api/emitir e
// /api/corrigir-laudo.
// Round 5 (item 2/4): `destino` escolhe o path — `emissaoKey` deriva o path
// da TENTATIVA (uso normal, /api/emitir: quem está escrevendo sabe a própria
// key, sem precisar reler nada); `path` usa um path JÁ RESOLVIDO direto (uso
// de /api/corrigir-laudo: reescreve exatamente onde `lerSnapshotHtml` leu —
// nunca deriva de novo, senão uma correção de exame pré-round-5, onde a
// gaveta já tem key mas o snapshot ainda mora no canônico, "migraria" o
// snapshot pro path sufixado sem avisar). Um objeto de opções (não um 5º
// parâmetro solto) porque os dois usos são mutuamente exclusivos — assinatura
// mais enxuta que dois métodos quase iguais.
// ponytail: snapshots de tentativas PERDEDORAS (e o canônico de um exame já
// migrado pro sufixado) só saem do bucket quando o exame INTEIRO é apagado
// (`apagarSnapshotsExame` abaixo, chamada por `apagarExame` — Task 14/P5).
// Cancelar/transferir não limpa: o snapshot pode ser de correção futura do
// mesmo laudo.
export async function salvarSnapshotHtml(
  html: string, wsId: string, exameId: string, nomeArq: string,
  destino?: { emissaoKey?: string | null } | { path: string },
): Promise<void> {
  try {
    const filePath = destino && 'path' in destino
      ? destino.path
      : pathSnapshotHtml(wsId, exameId, destino?.emissaoKey);
    // Ruflo-5/Ponytail-11: sanitiza AQUI, ponto único — os callers (as duas
    // rotas, desde o round 4) passam o nomeArq CRU. Idempotente
    // (sanitizarNomeArq 2x não muda nada), então não há dupla-sanitização —
    // só um lugar decide o nome do objeto.
    const nomeSanitizado = sanitizarNomeArq(nomeArq, exameId);
    await getStorage().bucket().file(filePath).save(html, {
      metadata: { contentType: 'text/html; charset=utf-8', metadata: { nomeArq: nomeSanitizado } },
    });   // sem makePublic(): só o Admin SDK lê
  } catch (e) {
    console.error('snapshot HTML (nao-critico):', e);
  }
}

// Round 5 (item 3) + round 6 (Codex Critical): a GAVETA é a verdade do
// servidor. `snapshotSufixado:true` (gravado por publicarPdfSeAindaDono/
// marcarPdfErroSeAindaDono no MESMO commit que confirma a emissão, ANTES da
// rota tentar o save) declara "o snapshot desta emissão, se existir, SÓ mora
// no sufixado — não caia no canônico". Sem essa declaração, cair no
// canônico é seguro pros 2 regimes antigos: exame pré-onda-0 (nunca teve
// gaveta) e exame emitido ENTRE a onda-0 e o round 6 (gaveta já tem key, mas
// nunca gravou a flag — o snapshot daquela emissão foi salvo antes da flag
// existir, ainda no canônico). COM a flag, o canônico deixa de ser
// candidato: pode ser o corpo clínico de uma emissão ANTERIOR (regressão
// achada pelo Codex — `salvarSnapshotHtml` engole erro em silêncio; sem a
// flag, uma falha nesse save fazia `lerSnapshotHtml` "recuperar" com sucesso
// o snapshot ERRADO em vez de honestamente devolver null).
// Extraída pura (round 6) — testável sem Storage (não emulado nesta
// bateria): a decisão de QUAIS paths tentar, em que ordem, é o cerne do bug
// e do fix.
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

// Assinatura INALTERADA (wsId, exameId) — os 2 consumidores existentes
// (`/api/corrigir-laudo` e a sombra via `shadow/deps-admin.ts`) herdam a
// resolução certa de graça, sem precisar saber de `emissaoKey`/`snapshotSufixado`.
export async function lerSnapshotHtml(
  wsId: string, exameId: string,
): Promise<{ html: string; nomeArq: string; path: string } | null> {
  const gaveta = (await refEmissaoPrivada(getFirestore(), wsId, exameId).get()).data();
  const candidatos = candidatosSnapshotHtml(wsId, exameId, gaveta);
  for (const filePath of candidatos) {
    try {
      const file = getStorage().bucket().file(filePath);
      const [buf] = await file.download();
      const [meta] = await file.getMetadata();
      const nomeArq = meta.metadata?.nomeArq;
      return { html: buf.toString('utf8'), nomeArq: typeof nomeArq === 'string' ? nomeArq : '', path: filePath };
    } catch { /* tenta o proximo candidato (fallback pro canonico, quando existir) */ }
  }
  return null;   // sem snapshot (emitido antigo/PDF anexado), ou flag diz "sufixado" e ele nao existe — honesto: pdfDesatualizado, nao corpo velho
}

// P5/Task 14 (LGPD): "apagar o exame" tem que levar o snapshot clínico
// junto — senão o laudo completo sobrevive órfão em laudos-html/. Path por
// TENTATIVA desde o round 5 (ver pathSnapshotHtml acima): apagar só o
// canônico deixa pra trás os sufixados de emissaoKey (inclusive de
// tentativas perdedoras, que nem a gaveta aponta mais). Apaga os dois: o
// canônico (exato, exame legado pré-onda-0) e tudo sob o prefixo
// `{exameId}-` (o `-` no prefixo é o que impede exameId 'abc' apagar
// também os objetos de 'abc2' — deleteFiles com prefix é um match de
// string crua). Nunca lança: mesmo padrão dos vizinhos (apagarPdfObjeto),
// limpeza de órfão não pode derrubar a exclusão do exame.
export async function apagarSnapshotsExame(wsId: string, exameId: string): Promise<void> {
  try {
    const bucket = getStorage().bucket();
    await bucket.file(pathSnapshotHtml(wsId, exameId)).delete({ ignoreNotFound: true });
    await bucket.deleteFiles({ prefix: `laudos-html/${wsId}/${exameId}-` });
  } catch (e) {
    console.error('apagarSnapshotsExame (nao-critico):', e);
  }
}
