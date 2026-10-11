# Coluna do laudo unificada — geometria antiga, pele minimalista (11/10/2026)

**Status:** NO AR em produção desde 11/10/2026. Merge 21ee2ce na master com aval do Sergio ("vamos colocar online"); Vercel serviu o CSS novo em ~45 s, verificado por sonda no souleo.com.br.
**Spec aprovada:** `docs/superpowers/specs/2026-10-11-coluna-laudo-unificada-design.md`.

## Contexto

A publicação do layout em 11/10 (8ac762c) tirou o cabeçalho e os botões do laudo ECO da
coluna lateral e os pôs numa faixa branca de largura total. O bloco do estado emitido
(`ModoEmitido`: selo verde + três botões miúdos + Finalizar) continuou empilhado como na
coluna estreita antiga e ficou quebrado na faixa. A validação visual de 09/10 nunca o
exercitou: a fixture injetava um botão falso "Desbloquear teste". O laudo de texto tinha um
terceiro padrão (barra fina).

## Decisão (Sergio, 11/10, após três rodadas de esboço)

1. **Geometria de ontem em todo laudo**, existente ou futuro: coluna de 390 px à esquerda
   com cabeçalho, comandos e conteúdo; folha A4 à direita.
2. **Pele de hoje**: botões de contorno fino com ícones Lucide, sem emoji, cartões brancos
   sobre azul claro `#EAF1FA`, fundo da folha `#F1F5F9`.
3. **Azul-marinho `#1E3A5F` volta ao cabeçalho da coluna** (com o Voltar dentro) e passa a
   ser a cor da ação principal (Salvar/Emitir, Finalizar, Emitir laudo). O azul vivo
   `#2563EB` sai dessas telas. Notas (ACC, Feegow) ganham filete navy na borda esquerda.
4. **Estado emitido em duas linhas**: selo + PDF + Copiar + Editar com a mesma largura;
   Finalizar na largura inteira. Submenu do Copiar e "Gerar novamente" continuam abaixo.
5. **Laudo de texto adota a coluna** com cartão de identificação só de leitura (escolha
   explícita do Sergio entre "com cartão" e "só cabeçalho e botões").

## Implementação

| Arquivo | O que mudou |
|---|---|
| `src/app/globals.css` | Casca compartilhada: `.laudo-workspace`, `.laudo-coluna`, `.laudo-cabecalho*`, `.laudo-command-*`, `.laudo-emitido-selo`, `.laudo-fields`, `.laudo-nota`, `.laudo-folha*`, media queries (< 900 px empilha; toque 44 px) |
| `src/components/laudo/CabecalhoLaudo.tsx` | Novo. Cabeçalho navy + Voltar (`aria-label="Voltar para a agenda"`, usado pelo e2e) |
| `src/components/laudo/SidebarLaudo.tsx` | `#laudo-sidebar` vira coluna flex (antes `display:contents`); usa CabecalhoLaudo; notas ACC/Feegow/emitido sem emoji; rótulos sem cadeado |
| `src/components/laudo/PopupEmitir.tsx` | `ModoEmitido` em duas linhas, `BtnMini` removido, ícones no lugar de emoji |
| `src/components/laudo/EditorIcon.tsx` | Ícones novos: link, lock, file, copy, edit, check |
| `src/components/laudo/SheetA4.tsx` | Só o invólucro da área da folha (`.laudo-folha` + legenda). Folha A4 intacta |
| `src/app/laudo/[id]/page.tsx` | CSS da casca saiu do `<style jsx global>`; `.laudo-locked` e `.sf` ficam lá (o teste da trava lê de lá) |
| `src/app/laudo-texto/[id]/page.tsx` | Adota `.laudo-workspace` + coluna + cartão de identificação (`Dado`) |
| `tests/visual/layout-entry.tsx`, `layout-check.mjs` | Fixture ECO usa o `ModoEmitido` real; o teste abre o submenu do Copiar e destrava pelo Editar |

**Não mudou:** motor, cálculos, PDF, MolduraA4, trava do emitido (CSS + disabled-setter),
créditos, rotas, handlers.

## Verificação

- `tsc --noEmit` limpo.
- `tests/unit/laudo-trava-emitido` + `contrato-ponte-ids`: 44/44.
- Visual (`layout-check.mjs`) ECO e carótidas em 1440 e 390 px sem overflow; estado emitido
  real conferido ao vivo no dev server (duas linhas, submenu abre abaixo).
- Lint dos arquivos tocados: só o erro pré-existente `set-state-in-effect` em
  `PopupEmitir.tsx:47` (fora deste diff).

## Tríade (sobre a3251f1, cada ótica instruída a não repetir a outra)

| Revisor | Veredito | Achados e destino |
|---|---|---|
| **Codex** (bugs/edge cases, adversarial) | CHANGES REQUESTED → atendido em e73be8f | 1) `flex:1 1 auto` dava larguras desiguais a PDF/Copiar/Editar → `flex:1 1 0; min-width:0`. 2) Fixture ECO do teste visual injetava botão falso no `modoEmitido` e o `resultado.json` commitado só tinha carótidas → fixture usa o `ModoEmitido` real (abre submenu do Copiar, destrava pelo Editar), suíte completa 26/26. 3) `layout-check.mjs` lê CSS dos chunks do `.next` sem buildar → limite pré-existente, procedimento documentado é `npm run build` antes; não alterado. Refutados sem achado: delegação de eventos em `#laudo-sidebar`, `.laudo-locked #modo-edicao`, disabled-setter, `aria-label` do Voltar, `profile` ausente, idade/fmtData, `#laudo-sheet`, usos do SheetA4. |
| **Ruflo** (arquitetura/fronteiras) | APPROVED | Casca em `globals.css` é o lugar certo (2 consumidores reais). Troca de `display:contents` por caixa própria (`.laudo-coluna`) removeu o seletor `#laudo-sidebar + div` que acoplava o DOM do filho ao CSS da página: melhora de fronteira. Contratos `#laudo-sidebar`/`.laudo-fields` intactos. Menor: moldura do cartão de identificação repetia a string de classes do `Sec` → extraída em `.laudo-cartao`/`.laudo-cartao-titulo` (commit seguinte). Info: hex literal em vez de `var(--color-*)` segue a convenção vigente (20+ arquivos), dívida pré-existente. |
| **Ponytail** (o que deletar) | APPROVED → cortes em 68d0fda | font-family e background redundantes, par de regras focus-visible com override, ids `hdr-*` órfãos, `text-[#1E3A5F]`/`disabled:opacity-50` já cobertos pela casca, comentário que repetia o JSX. Mantidos por decisão: `CabecalhoLaudo.tsx` (2 consumidores), helper `Dado` (7 usos), `.laudo-command-ajustavel` e `.laudo-emitido-selo` (casca no CSS vence utilitário em camada). |

## Pendente

Emissão real não exercitada nesta entrega: o primeiro laudo emitido na clínica confirma o estado emitido com dados reais.
