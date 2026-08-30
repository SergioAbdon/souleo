# ADR — Seção 7 onda 1: bugs com dente (documento assinado + dinheiro)

**Data:** 30/08/2026 · **Branch:** `feat/secao7-onda1` · **Merge:** `18ae790` (master)
**Esteira:** plano (`docs/planos/2026-08-30-secao7-plano-correcao.md`) → SDD (1 implementador
+ 1 revisor adversarial por task) → TRÍADE COMPLETA PRÉ-merge (Codex 7 rodadas adversariais,
Ruflo arquitetura, Ponytail deletar) → fix wave → merge com OK do Sergio.
**Placar final:** unit 723 · api 279 · rules 142 · tsc+build limpos (piso 683/249/142).

## As 6 tasks

1. **X1 — corte achados/conclusão com um dono só.** O `EditorLaudo` cortava no primeiro
   `<h3>` qualquer: um `### ` digitado nos comentários jogava o resto do laudo na caixa
   CONCLUSÃO do PDF ASSINADO, enquanto Word/texto saíam certos. Agora as 4 saídas usam
   `cortarAchadosConclusoes` de `laudo-linhas.ts` (só `<h3>CONCLUS…` corta). Teto conhecido
   e agora CONSISTENTE: título renomeado/negritado → conclusão vazia nas 4 saídas
   (upgrade real = atributo próprio via extensão TipTap; registrado, não feito).
2. **X10+P17 — `corSegura()` + imagens só `data:`.** `corPrimaria` (gravada pelo dono do
   local sem validação de formato) entrava crua em atributos `style` de todas as saídas —
   injeção no Chrome do SERVIDOR, congelada no snapshot. Validada em 5 pontos de entrada
   (hex ou fallback `#8B1A1A`); `logoB64`/`sigB64` só renderizam `data:`.
3. **P1 — Chrome do servidor blindado.** `setJavaScriptEnabled(false)` + interception com
   allowlist (`data:`, o bucket, fontes) em todo render. Provado ao vivo: metadata endpoint,
   beacon e bucket-parecido abortados; PDF continua saindo. Deny loga `ws=/exame=`.
4. **X20+X21 — despacho por modalidade + anexo grava o ID.** `rotaDoLaudo()` é o dono único
   nas 3 telas (modalidade `pdf` → `null`, sem editor); guard do motor por
   `status === 'emitido'`; `AnexarPdfModal` deixou de gravar o NOME de exibição por cima de
   `tipoExame` (corrompia o dado e mandava ECG pro motor de eco).
5. **E8+E6 — cancelar × emitir fechada de verdade.** Emitir recusa `status 'cancelado'`
   (guard ANTES do replay). `cancelarExame`/`transferirExame` viraram UMA transação:
   CAS de `status`+`emitidoEm` contra os valores lidos + devolução líquida no MESMO commit
   — conflito = zero writes (`conflito_emissao` 409). Antes, o perdedor da corrida devolvia
   a cobrança do vencedor (laudo de graça) e apagava o PDF novo.
6. **P4+E4 — falha de PDF recuperável sem 2ª franquia.** Falha pós-transação grava
   `pdfErro` no doc + congela o snapshot; botão **Regerar PDF** (Worklist E Histórico, pra
   dono/recepção/médico-autor) reusa `/api/corrigir-laudo` com `acao:'regerar'` (log
   próprio `regeracao_pdf`, sem fingir correção) — zero franquia nova.

## O redesenho da publicação (fix wave da tríade, 7 rodadas do Codex)

O Codex recusou 4 versões da correção até a publicação do PDF ficar à prova de corrida em
TODAS as camadas. Resultado:

- **3 transações condicionais** em `emitir-admin.ts` (agora o "dono do slot de emissão"):
  `publicarPdfSeAindaDono`, `publicarCorrecaoSeAindaEmitido`, `marcarPdfErroSeAindaDono` —
  ponteiro (`pdfUrl`) e bandeiras (`pdfPendente`, `snapshotSufixado`) gravados no MESMO
  commit, condicionados a `status === 'emitido'` + posse (key da gaveta / `emitidoEm`).
  O perdedor de qualquer corrida escreve ZERO.
- **Objeto por tentativa:** o path do PDF e o do snapshot levam a `emissaoKey` inteira —
  duas emissões concorrentes nunca dividem objeto no Storage; o perdedor apaga o próprio
  órfão (`apagarPdfObjeto`). Continuidade de link preservada (a correção regrava o mesmo
  objeto via metadata do snapshot).
- **Snapshot só pós-publicação confirmada**, e a gaveta declara `snapshotSufixado` — o
  leitor (`lerSnapshotHtml` → `candidatosSnapshotHtml`) nunca cai num snapshot canônico
  VELHO para emissão moderna (ausente = `null` = `pdfDesatualizado` honesto). Fallback
  canônico preservado pros 2 regimes legados (pré-onda-0 e pré-round-5).

## ⚠️ Decisão de contrato: `emissaoKey` OBRIGATÓRIA

`/api/emitir` responde **400** sem `emissaoKey` válida (posição do Codex: a janela do
"cliente sem key" não é dívida aceitável enquanto a API a aceitar). Os 3 clientes mandam a
key desde a onda 0; efeito prático único: aba do LEO aberta desde antes de 29/08 precisa de
F5 pra emitir. Aprovado pelo Sergio junto do merge (30/08).

## Dívidas de fronteira registradas (entrarão nas ondas 2-3)

`publicarEArquivar` dono da sequência publicar→snapshot · par `pathParaEscrita/Leitura` ·
`apagarPdfObjeto` sem DI (consolidar "storage-laudos" antes da onda 3) · `lerSnapshotHtml`
com `getFirestore` ambiente (DI) · invariante key↔emitidoEm (registrar+testar) ·
`podeRegerarPdf` em `permissoes.ts` · `acaoDoLaudo` tipado · `pdfHtmlPath` = escrita morta
(cortar) · falha de PDF numa REEMISSÃO fica escondida pelo gate `!pdfUrl` (decisão leve).

## Próximo

Onda 2 do plano: E3 (carimbos derivados no servidor), E15/P10/E16 (máscara+HTTP), X22/E18
(UI reanexo) e os 2 DESIGNS com parada — E11 (renovação de ciclo, POLÍTICA) e E10/E14/E22
(regra Firestore) — ambos só com decisão do Sergio.
