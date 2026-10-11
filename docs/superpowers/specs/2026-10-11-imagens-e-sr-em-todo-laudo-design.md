# Imagens e SR em todo laudo — design aprovado 11/10/2026

Aprovado por Sergio após planejamento pela tríade (Codex riscos · Ruflo arquitetura · Ponytail mínimo).
Complementa `2026-10-11-coluna-laudo-unificada-design.md`.

## Problema

1. Laudo ECO **emitido** não mostra "Imagens (N)" nem "Importar medidas (N)": a fileira troca o
   bloco inteiro de edição pelo bloco do emitido, e os dois botões de *dado do exame* foram junto.
   Pré-existente, não regressão da coluna unificada.
2. Laudo de **texto** (carótidas etc.) não tem nenhum acesso às imagens DICOM, nem no PDF.

## Decisões do Sergio

- **A.** No ECO emitido, Importar e Imagens aparecem numa **3ª linha abaixo do Finalizar**; as duas
  linhas aprovadas (selo + PDF + Copiar + Editar / Finalizar) não mudam.
- **Importar medidas** no emitido: visível com a contagem, **desabilitado**, dica "Clique em Editar
  para importar e reemitir". Guarda explícita no handler (`if (emitido) return`), não só CSS.
- **Galeria no emitido é só leitura**: ver e ampliar, sem trocar a seleção do PDF. O PDF emitido é o
  documento; qualquer edição passa por Editar → novo laudo, com nova seleção de imagens.
- **Laudo de texto segue o mesmo padrão de emissão do ECO**: botão Imagens em rascunho e emitido,
  galeria com seleção no rascunho (só leitura no emitido), popup de emissão com "Incluir imagens
  DICOM", páginas de imagem no PDF, seleção persistida como no ECO.

## Fase 1 — botões e galeria

| Arquivo | Mudança |
|---|---|
| `SidebarLaudo.tsx` | Importar/Imagens saem do ternário `emitido ? modoEmitido : modo-edicao` e ficam sempre renderizados, depois do bloco de estado (3ª linha no emitido). Importar `disabled` também quando `emitido`. |
| `laudo/[id]/page.tsx` | Guarda `emitido` em `handleImportarDicom`/confirmação do SR import; `DicomGallery permitirSelecao={!emitido}` e sem `onToggleSelecao` no emitido; remove CSS morto `.laudo-locked #modo-edicao`. |
| `laudo-texto/[id]/page.tsx` | Botão Imagens (N) na fileira + `DicomGallery` (fase 1 só leitura). |
| Testes | Visual: ECO emitido com Imagens habilitado e Importar desabilitado; carótidas com Imagens. Unit (laudo-trava-emitido): guarda do import presente. |

## Fase 2 — emissão do texto igual ao ECO

| Arquivo | Mudança |
|---|---|
| `src/hooks/useImagensExameDicom.ts` (novo) | Estado de seleção/inclusão, load do Firestore, toggle, montagem das páginas (`renderPaginas` + URLs assinadas). ECO e texto consomem. |
| `laudo-texto/[id]/page.tsx` | `PopupSalvarEmitir` no lugar do `confirm()`; `incluirImagensNoPdf` + `imagensSelecionadasPdf` nos `dadosFinais`; galeria com seleção no rascunho. |
| `src/lib/pdf-texto.ts` | `htmlPosTabela?: string` passthrough para `montarPdfMoldura` (moldura intocada). |
| `src/lib/emitir-admin.ts` | `imagensSelecionadasPdf` entra na whitelist de `dadosFinais`, validada: subconjunto de `exame.imagensDicom`, sem duplicata, limite. Teste-pin atualizado. |
| `firestore.rules` | Exame emitido: cliente não altera `imagensSelecionadasPdf` (só servidor, dentro da emissão). Teste com payload real em `tests/rules/fixtures.mjs`. |
| Testes | Unit do PDF do texto com 0/1/8/9 imagens; API de emissão/reemissão gravando lista + flag + PDF + cobrança única; rules. |

## Fora do escopo

`ModoEmitido` (PDF/Copiar/Editar/Finalizar) no laudo de texto emitido: não pedido. `pdf-moldura.ts`
intocado. Motor, trava do emitido e créditos inalterados. `onSnapshot` no texto: não (ceiling marcado).
