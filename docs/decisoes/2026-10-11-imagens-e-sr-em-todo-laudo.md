# Imagens e SR em todo laudo — ECO emitido e laudo de texto (11/10/2026)

**Status:** implementado no branch `claude/imagens-e-sr-em-todo-laudo` (6f187b8 fase 1, c9bb0a5 fase 2
+ ajustes da tríade). Merge/push/deploy dependem do aval do Sergio.
**Spec aprovada:** `docs/superpowers/specs/2026-10-11-imagens-e-sr-em-todo-laudo-design.md`.
**Antecedente:** `2026-10-11-coluna-laudo-unificada.md` (no ar desde 11/10).

## Contexto

Com a coluna unificada no ar, Sergio apontou dois buracos sensíveis: o laudo ECO **emitido** não
mostrava "Imagens (N)" nem "Importar medidas (N)" (a fileira trocava o bloco inteiro de edição pelo
bloco do emitido, e os dois botões de *dado do exame* iam junto — pré-existente, não regressão), e o
laudo de **texto** (carótidas) não tinha nenhum acesso às imagens DICOM, nem no PDF.

Pedido explícito: planejar com a tríade ANTES de editar. Codex (riscos), Ruflo (arquitetura) e
Ponytail (mínimo) planejaram em paralelo; Sergio decidiu sobre os três pontos abertos.

## Decisões do Sergio

1. **Posição no ECO emitido:** opção A — Importar e Imagens numa 3ª linha abaixo do Finalizar; as
   duas linhas aprovadas (selo + PDF + Copiar + Editar / Finalizar) não mudam.
2. **Galeria no emitido é só leitura.** "O laudo emitido está em PDF; para qualquer edição será gerado
   novo laudo, com a opção de selecionar as imagens." Importar medidas fica visível com a contagem e
   desabilitado, com dica "clique em Editar para importar e reemitir".
3. **Laudo de texto segue o mesmo padrão de emissão do ECO:** botão Imagens, galeria com seleção no
   rascunho, popup de emissão com "Incluir imagens DICOM", páginas de imagem no PDF.

## Implementação

| Arquivo | Mudança |
|---|---|
| `SidebarLaudo.tsx` | Fileira = bloco de ESTADO (`emitido ? ModoEmitido : Salvar/Limpar`) + bloco de DADOS DO EXAME (Importar, Imagens) sempre renderizado. Importar `disabled={emitido \|\| …}`. |
| `laudo/[id]/page.tsx` | Guarda `if (emitido) return` em `handleImportarDicom` e `handleConfirmarImportSr` (a importação escreve nos inputs por código; a trava CSS/disabled não a alcança). `DicomGallery permitirSelecao={!emitido}`. `imagensSelecionadasPdf` viaja em `dadosFinais`. CSS morto `.laudo-locked #modo-edicao` removido. Usa `renderPaginasPdf`. |
| `src/lib/pdf-imagens.ts` (novo) | `renderPaginas` + `renderPaginasPdf` (CSS + grade 8/A4) saem do `DicomGallery.tsx` (que re-exporta) — sem React, pros dois laudos e pros testes. |
| `laudo-texto/[id]/page.tsx` | Botão Imagens (N), `DicomGallery` (seleção no rascunho, só leitura no emitido), `PopupSalvarEmitir` no lugar do `confirm()` cru, `precisaConfirmarEmissao`, `htmlPosTabela` com as páginas, `incluirImagensNoPdf` + `imagensSelecionadasPdf` em `dadosFinais`. Estado inline com `ponytail:` (vira hook quando o ECO migrar). |
| `src/lib/pdf-texto.ts` | `htmlPosTabela?: string` passthrough para `montarPdfMoldura` (moldura intocada). |
| `src/lib/emitir-admin.ts` + `src/lib/imagens-selecao.ts` (novo) | `imagensSelecionadasPdf` na whitelist de `dadosFinais`, saneada por `sanearSelecaoImagens`: só URLs de `exame.imagensDicom`, sem duplicata, ordem do médico; lista inválida é descartada. |
| `firestore.rules` | Ramo do médico: em exame `emitido`, `imagensSelecionadasPdf` precisa ficar intacto (só o servidor muda, dentro da reemissão). |
| Testes | `imagens-selecao.test` (5), `pdf-texto-imagens.test` (4), pins em `laudo-trava-emitido` (3), rules (2, payload do autosave da galeria), visual eco (emitido com Imagens on / Importar off até Editar) e carótidas (Imagens (3) + popup com toggle). Pin do escape das páginas aponta pra `pdf-imagens.ts`. |

**Não mudou:** `pdf-moldura.ts`, `ModoEmitido`, motor, trava do emitido (CSS + disabled-setter),
créditos, rotas. `onSnapshot` no texto: não (ceiling marcado).

## Verificação

`tsc` limpo · unit 783/783 · rules 164/164 · visual eco 3/3 e carótidas 3/3 (1440 e 390) · lint dos
arquivos tocados sem achado novo (aviso `idMudou` pré-existente). Emissão real não exercitada.

## Tríade sobre o diff (fases 1 + 2)

| Revisor | Veredito | Achados e destino |
|---|---|---|
| **Codex** | CHANGES REQUESTED | Único achado (alto): **replay com PDF pendente** (`emitir-admin.ts` ~419, `route.ts` ~154/271) regenera o PDF a partir do `pdfHtml` do retry enquanto `dadosFinais` ficam os da 1ª transação — a seleção de imagens local pode divergir do que ficou gravado. **Pré-existente e deliberado**: é o "C1 — risco aceito e limitado" do round 4 do próprio Codex em 30/08 (comentário no código + teste "replay NÃO reescreve o laudo assinado"), valia igual pro texto do laudo antes deste diff. Não ampliado aqui (quem reenvia o retry já podia mandar o HTML que quisesse na 1ª chamada). **Fica como decisão leve pro Sergio**: amarrar `emissaoKey` a um hash do `pdfHtml` (recusar replay divergente) é mexer no núcleo da idempotência — fora deste escopo. Demais pontos refutados sem achado: trava CSS/disabled-setter não alcançam os botões; reedição do ECO converge; `renderPaginasPdf` preserva o HTML; saneamento usa o doc da transação; `intacto` correto pra campo ausente e update parcial; correção administrativa não bloqueada; popup não trava. |
| **Ruflo** | APPROVED | Matriz comando × estado × tipo seguida; Importar estruturalmente motor-only (só `SidebarLaudo`), nenhum `if (tipo…)` vazou pra componente compartilhado. Contrato "seleção só vale dentro da emissão" expresso nos 4 pontos que precisam ser separados (rules, emitir-admin, imagens-selecao, UI), com a mesma frase-ponte. Moldura intocada (diff vazio em `pdf-moldura.ts`). Info aplicada: ECO importa `renderPaginasPdf` direto de `@/lib/pdf-imagens`, re-export do `DicomGallery` apagado. Warning registrado: a 3ª cópia da lógica de seleção (texto, `getExame` foto única) já diverge do ECO (`onSnapshot` + poda) — a **próxima tela com imagens não copia nenhum dos dois: extrai o hook** (gatilho no ledger `ponytail:`). |
| **Ponytail** | (preencher) | |

## Pendente

- Aval do Sergio para merge na master, push e deploy.
- Decisão leve: amarrar `emissaoKey` ao conteúdo (hash) do `pdfHtml` no replay com PDF pendente.
- 1º laudo de texto emitido com imagens na clínica confirma o PDF com dados reais.
