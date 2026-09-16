# ADR — Seção 7 onda 0: velocidade + dinheiro (PDF/Puppeteer + billing)

**Data:** 29/08/2026 · **Branch:** `feat/secao7-onda0-triade` (base master `f3025d2`)
**Merge onda-0:** `f3025d2` (Chromium/fontes/gru1/trava anti-cobrança-dupla)
**Esteira:** implementação + revisão final da tríade (Codex 2×, Ruflo, Ponytail)
**Status:** fixes da tríade aplicados nesta branch, aguardando merge+deploy.

## Contexto

Seção 7 (motor-shadow à parte) é a rota `/api/emitir` + o pipeline de PDF do
Puppeteer — o único trecho do app onde uma requisição lenta custa dinheiro de
verdade (franquia debitada) e onde o servidor físico importa (região da
function). A onda 0 atacou 4 coisas antes de qualquer refactor maior:

1. **Function em `gru1` (São Paulo), junto do Firestore.** Antes a function
   rodava na região default da Vercel (EUA) enquanto o Firestore do projeto
   mora em São Paulo — cada leitura/escrita da transação de emissão cruzava o
   hemisfério, e o Puppeteer some ainda mais tempo dentro do mesmo
   `maxDuration`. Corrigido em `vercel.json`.
2. **Chromium reutilizado entre invocações** (`src/lib/pdf-browser.ts`). Antes
   cada emissão pagava `puppeteer.launch()` + `close()` — o binário do
   `@sparticuz/chromium` é descompactado de um brotli de 66MB pra ~180MB em
   `/tmp` a cada vez. Com `obterBrowser()`/`descartarBrowser()` isso acontece
   uma vez por instância de lambda quente; o cold start continua pagando (não
   tem como evitar — a instância nasce com `/tmp` vazio).
3. **Teto de 8s pra fontes** (`pdf-server.ts`, achado P8). A moldura espera as
   fontes (IBM Plex) carregarem antes do `page.pdf()`; sem teto, uma fonte que
   não carrega prende o Puppeteer até o `networkidle0` estourar (~30s) com a
   franquia já debitada (P4). Com o teto, o PDF sai em fonte de fallback e um
   `console.warn` identifica qual laudo.
4. **Trava anti-cobrança-dupla** (`emitir-admin.ts`, achado E1). A transação
   de billing comita em ~1s; o Puppeteer leva 15-60s dentro do mesmo
   `maxDuration`. Timeout de rede/aba fechada = médico vê "erro de conexão"
   com a franquia já debitada, clica de novo, paga 2×. Solução: o cliente
   manda uma `emissaoKey` (UUID) por TENTATIVA; o retry da mesma tentativa
   reusa a key e vira replay (sem novo débito); reemissão deliberada manda
   key nova e cobra (política registrada).

Bug vivo achado no meio da onda: `/api/corrigir-laudo` (a rota irmã que
reemite PDF de laudo já emitido) tinha o MESMO pipeline de Puppeteer mas sem
o Chromium reutilizado — cada correção administrativa pagava launch+close de
novo, e em produção às vezes falhava o PDF (P2). Corrigido no mesmo commit
(`ae9866d`) — as duas rotas compartilham `pdf-server.ts` agora.

## Critical C1 (achado pela tríade) e o redesenho

A trava do E1 comparava a `emissaoKey` guardada no próprio doc do exame. A
tríade achou dois furos ligados:

- **C1 — replay mentiroso.** Se a 1ª chamada morresse no Puppeteer DEPOIS da
  transação de billing já ter comitado (`status: 'emitido'`), o retry (mesma
  key) batia na trava, via "já emitido" e devolvia `pdfUrl: null` como
  **sucesso**. O laudo ficava emitido e cobrado, sem PDF assinado, e a tela
  não tinha como saber.
- **I1 — autoridade errada.** A `emissaoKey` morava no doc do exame, que o
  médico-autor pode escrever pelo próprio SDK (`firestore.rules:204-208`). Se
  o replay ganhasse o direito de regerar o PDF, um cliente adulterado que
  plantasse a key certa no próprio exame ganharia reemissão de graça.

**Redesenho:** o estado de idempotência saiu do doc do exame e foi para uma
gaveta server-only, `workspaces/{ws}/privado/emissao/exames/{exameId}`
(`refEmissaoPrivada`, deny-by-default — `firestore.rules` já tinha
`privado/{documento=**} { allow read, write: if false }`, nenhuma regra
nova). Essa gaveta carrega `emissaoKey` **e** `pdfPendente`. A transação de
billing grava as duas no mesmo commit do débito; a rota baixa `pdfPendente`
SÓ depois de um PDF de fato salvo. Um replay com `pdfPendente: true` agora
manda a rota REGERAR o PDF a partir do `pdfHtml` da própria requisição, em
vez de devolver sucesso vazio — e como só o Admin SDK escreve na gaveta,
nenhum cliente forja o direito de regerar.

## Fixes da tríade (esta branch)

- **Ponytail R3:** sem `emissaoKey` (cliente legado), a transação não grava
  mais na gaveta privada — nada pra comparar num replay futuro, gravar só
  criava doc morto.
- **Ponytail R2:** a regex de "erro de conexão do Chromium"
  (`ehErroDeConexao`) só reconhece frases que o `puppeteer-core` realmente
  lança (`target/session/connection closed`, `frame was detached`) — as
  outras três (`target detached`, `session detached`, `browser has
  disconnected`) nunca saem dele; eram cobertura morta.
- **Ruflo I1:** `pdfPendente: false` (baixar a bandeira) virou
  `marcarPdfPronto()`, exportado de `emitir-admin.ts` — a rota parou de
  importar `refEmissaoPrivada` direto. O nome do campo mora num arquivo só.
- **Ruflo M3:** `apagarExame` (exame-admin.ts) agora apaga a gaveta privada
  junto no mesmo batch do doc do exame — era um satélite órfão do mesmo tipo
  do `accIndex` (achado 8 anterior), sem isso ficava doc morto pra sempre.
- **Ruflo M4:** `Lancador` e `lancarChromium` pararam de ser exportados de
  `pdf-browser.ts` — nenhum chamador fora do arquivo usava.
- Dois comentários `ponytail:`/explicativos documentando ceilings conhecidos
  (retry sem `comPagina()` extraído; por que o `emissaoKeyRef` simples da
  tela do laudo é seguro — a página remonta por exame via `key=`).

## Placar

| Bateria | Antes da onda | Depois (esta branch) |
|---|---|---|
| `test:unit` | 684 | 683 (−1 caso morto do R2 trimado) |
| `test:api` | 248 | 249 (+1 caso M3) |
| `test:rules` | 142 | 142 |
| tsc / build | limpos | limpos |

Tríade completa: **Codex** revisou 2× (implementação + verificação
adversarial das correções), **Ruflo** (fronteiras/arquitetura: I1, M3, M4),
**Ponytail** (o que cortar: R2, R3, os dois comentários de ceiling).
