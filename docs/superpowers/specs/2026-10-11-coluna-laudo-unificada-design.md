# Coluna do laudo unificada — design aprovado 11/10/2026

Aprovado por Sergio em 11/10/2026 após três rodadas de esboço (texto + prévias inline).

## Problema

A publicação do layout (8ac762c) puxou o cabeçalho e os botões do laudo ECO para uma
faixa branca de largura total, mas o bloco do estado emitido (`ModoEmitido`) continuou
empilhado como na coluna estreita antiga e ficou quebrado. O laudo de texto tem outro
padrão (barra fina). Sergio quer **um só padrão para todo laudo**, existente ou futuro.

## Decisão

**Geometria de ontem, pele de hoje.**

- Coluna da esquerda com **390 px** (como antes de 8ac762c). Dentro, de cima para baixo:
  1. **Cabeçalho azul-marinho** `#1E3A5F`: "Tipo do exame · Clínica" em branco, médico e
     CRM em `#B5D4F4`, botão **Voltar** dentro do cabeçalho com contorno branco fino.
  2. **Fileira de comandos** em branco, botões de contorno fino `#D6E2F1`, ícones Lucide
     (EditorIcon), sem emoji. **Ação principal em azul-marinho** `#1E3A5F` (o azul vivo
     `#2563EB` sai dessas telas).
  3. **Conteúdo** rolável sobre azul claro `#EAF1FA`: cartões brancos das seções.
- Folha A4 à direita, fundo `#F1F5F9`, legenda "Pré-visualização" mantida nas duas telas.
- **Estado emitido** em duas linhas dentro da coluna: linha 1 = selo verde "Emitido" +
  PDF + Copiar + Editar (mesma largura); linha 2 = Finalizar na largura inteira.
  Submenu do Copiar e link "Gerar novamente" continuam abaixo da fileira.
- **Notas** (ACC, "Veio do Feegow") viram filete azul-marinho na borda esquerda sobre
  `#F1F5F9`; a caixa roxa com emoji sai.
- **Laudo de texto** adota a mesma coluna: cabeçalho + comandos (Rascunho, Emitir) +
  **cartão de identificação só de leitura** (ACC, nome, idade e nascimento, convênio,
  data do exame). Escolha explícita do Sergio.
- **Celular (< 900 px)**: coluna empilha acima da folha, como hoje.

## Fora do escopo

Motor, cálculos, PDF, folha A4 (`MolduraA4`/`SheetA4`), trava do emitido, créditos,
rotas e handlers. Só a casca da tela muda.

## Implementação (mínima)

- CSS compartilhado da casca (`.laudo-workspace`, `.laudo-command-*`) sai do
  `<style jsx global>` da página ECO e vai para `globals.css`, para as duas páginas e
  qualquer laudo futuro usarem.
- Novo `CabecalhoLaudo.tsx` (cabeçalho azul-marinho + Voltar), usado por `SidebarLaudo`
  e pela página de texto.
- `ModoEmitido` reescrito em grade de duas linhas com ícones.
- Ícones novos no `EditorIcon`: lock, file, copy, edit, check.
- Testes: `tests/visual/layout-check.mjs` (eco + carotidas) e
  `tests/unit/laudo-trava-emitido.test.mjs` continuam valendo; o CSS `.laudo-locked`
  permanece em `page.tsx` porque o teste unitário o lê de lá.
