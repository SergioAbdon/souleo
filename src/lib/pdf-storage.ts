// ══════════════════════════════════════════════════════════════════
// LEO · PDF storage puro (sem Puppeteer) — onda-3 P9
// Extraído de pdf-server.ts: a sombra (shadow/deps-admin.ts) só precisa LER
// o snapshot HTML pra comparar com o motor novo, mas importar de
// pdf-server.ts arrastava puppeteer-core + @sparticuz/chromium pro bundle do
// cron — que nunca renderiza PDF nenhum. Aqui só fica o que fala com o
// Storage/Firestore; pdf-server.ts fica só com o pipeline do Puppeteer.
//
// `getStorage()` SEM app explícito (tríade onda-3, Ruflo-A4) — não
// `adminStorage()` de auth-admin.ts: este arquivo é importado tanto pelas
// ROTAS (que inicializam o app default via auth-admin.ts, com
// storageBucket configurado) quanto pela SOMBRA/scripts (shadow/deps-
// admin.ts e scripts/shadow/retroativo.mjs, cada um com o próprio
// `initializeApp()`, bucket incluso). Por qualquer um dos dois caminhos, o
// app default já está inicializado COM bucket antes de qualquer função
// daqui rodar — `getStorage()` sem argumento pega esse mesmo app default.
// Importar `adminStorage()` (que vive atrás do alias `@/`) forçaria este
// arquivo puro-relativo a depender de auth-admin.ts só pra reobter o MESMO
// app que `getStorage()` já acha sozinho, e quebraria o import direto do
// script (que nunca passa por auth-admin.ts).
// ══════════════════════════════════════════════════════════════════
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import { sanitizarNomeArq, pathPdf, pathSnapshotHtml, candidatosSnapshotHtml, ehSnapshotDoExame } from './pdf-path';
// lerGavetaEmissao resolve o doc inteiro da gaveta de idempotência — mesmo
// dono do estado de emissão. Sem ciclo: emitir-admin.ts só importa
// billing-admin.ts, correcao-admin.ts e pdf-path.ts (puro, zero imports —
// nenhum dos três importa pdf-storage), e todos são relativos/sem `@/`.
import { lerGavetaEmissao } from './emitir-admin';

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
    console.error(`apagarPdfObjeto (nao-critico, ws=${wsId} exame=${exameId}):`, e);
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
// Tríade onda-3 (Ruflo-A2): `pathSnapshotHtml`/`candidatosSnapshotHtml`
// moraram aqui até esta onda — moveram pra pdf-path.ts (dono declarado do
// formato de path, puro, sem import nenhum). Este arquivo importa de lá.

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
    console.error(`snapshot HTML (nao-critico, ws=${wsId} exame=${exameId}):`, e);
  }
}

// Assinatura INALTERADA (wsId, exameId) — os 2 consumidores existentes
// (`/api/corrigir-laudo` e a sombra via `shadow/deps-admin.ts`) herdam a
// resolução certa de graça, sem precisar saber de `emissaoKey`/`snapshotSufixado`.
export async function lerSnapshotHtml(
  wsId: string, exameId: string,
): Promise<{ html: string; nomeArq: string; path: string } | null> {
  const gaveta = await lerGavetaEmissao(getFirestore(), wsId, exameId);
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
// TENTATIVA desde o round 5 (ver pathSnapshotHtml, pdf-path.ts): apagar só o
// canônico deixa pra trás os sufixados de emissaoKey (inclusive de
// tentativas perdedoras, que nem a gaveta aponta mais).
//
// Tríade onda-3 (Codex-1 Important — colisão de prefixo): a versão antiga
// apagava por `deleteFiles({ prefix: 'laudos-html/{ws}/{exameId}-' })` — mas
// `exameId` pode ter hífen (idValido, exame-admin.ts, permite), e prefixo é
// match de STRING CRUA: exameId 'abc' gera o prefixo 'abc-', que TAMBÉM bate
// em 'abc-2.html' (o canônico de um exame TOTALMENTE DIFERENTE, id 'abc-2')
// e nos sufixados dele. Apagar o exame 'abc' apagava o snapshot clínico do
// exame 'abc-2' junto — silencioso, sem erro nenhum.
// Fix: LISTA os objetos sob um prefixo mais largo (sem o hífen final, que só
// serve pra reduzir a lista candidata) e só apaga os que o matcher EXATO
// (`ehSnapshotDoExame`, pdf-path.ts — as 2 formas reais que
// `pathSnapshotHtml` produz) confirma como DESTE exame. Nota de escopo: só
// alcança `laudos-html/{wsId}/**` — o PDF público em `laudos/` sai por
// `apagarPdfObjeto` (chamado à parte, mesmo trio wsId/exameId/nomeArq).
// Nunca lança: mesmo padrão dos vizinhos (apagarPdfObjeto), limpeza de órfão
// não pode derrubar a exclusão do exame.
export async function apagarSnapshotsExame(wsId: string, exameId: string): Promise<void> {
  try {
    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: `laudos-html/${wsId}/${exameId}` });
    const doExame = files.filter((f) => ehSnapshotDoExame(f.name, exameId));
    await Promise.all(doExame.map((f) => f.delete({ ignoreNotFound: true })));
  } catch (e) {
    console.error(`apagarSnapshotsExame (nao-critico, ws=${wsId} exame=${exameId}):`, e);
  }
}
