# ADR — Correção da Seção 5 (Tela do Laudo)

**Data:** 2026-08-25 · **Branch:** `feat/secao5-tela-laudo` (base `df45f05`, head `562cd6a`, 38 commits)
**Status:** código completo, tríade final aprovada. PENDENTE: decisões do Sergio (abaixo), teste ao vivo, merge+deploy.

## Contexto

Quinta seção do mapa de 8. A revisão (tríade de 22/08) achou 7 críticos + 11 altos na tela
do laudo (`/laudo/[id]` + componentes). Sergio decidiu tudo no 1-a-1 (D1–D8 + adendos —
tabela DECISÕES FINAIS em `docs/planos/2026-08-22-revisao-secao5-tela-laudo.md`, que vence
em conflito). Execução em 14 tasks pela esteira SDD (1 implementador + 1 revisor de trace
por task, fix→re-review até Approved), mesma da Seção 4.

## O que mudou (por decisão)

- **D1 (T1)** Rascunho de verdade: autosave 60s no servidor + restauração íntegra
  (F5/outra máquina), guardas `textoRestauradoRef`/`dirtyRef`.
- **D2-c (T2)** Merge por linha "última alteração vence" (`src/lib/laudo-merge.ts`):
  linha do médico fica; linha do motor editada fica até o motor ter conteúdo novo;
  LCS exato + heurística de slot com portões de estrutura (sujeito + lado) sobre os 60%
  de tokens. Wilkins colapsa pra sentinela. Extração lossless (`laudo-linhas.ts`).
- **D3 (T3)** Modo manual da diastólica chega ao laudo (root cause: `calcular()` nunca
  chamava os setters já existentes). Mapeamento 1:1 byte-idêntico ao motor antigo.
- **nº4/5/6/15/23/24 (T4)** `Sec` sempre monta (fim da perda de dados de seção fechada),
  Wilkins persiste (codec checkbox), sexo = trava do MOTOR (decisão nº24), dtexame sem
  default mascarante, change sintético pós-carga sem sujar dirty.
- **D4 (T5)** Correção administrativa congelada: snapshot HTML server-side
  (`laudos-html/`, deny default), `substituirCamposAdministrativos` ancorada, CAS
  `emitidoEm` (409), recepção corrige convênio/solicitante sem crédito (modal na Worklist).
- **nº10 (T6)** Trava única do emitido: lista `livres` dona dos dois mecanismos
  (CSS mouse + disabled teclado), invariante travada por teste; TipTap `editable` real;
  toolbar some quando travado.
- **nº11/12/16/17/21 (T7)** Remount por exame (`key`), guard de emissão dupla, `scRef`,
  poda de seleção de imagens, re-init do motor sem re-injetar, `vivoRef` mata
  debounce/onload órfãos, `prevGer` não nasce de sidebar vazia.
- **D5 (T8)** 3 toques cirúrgicos no motor legado (guards de render, banco de frases
  religado via `_onInserirFrase`, importador podre removido) — revisor dedicado
  linha-a-linha: zero linhas fora dos 3 pontos.
- **nº18 (T9)** Busca Feegow do desbloqueio autenticada (wsId+Bearer) via `buscar_cpf`
  (rota `paciente` estava morta desde o Sub-plano 5), erro visível.
- **D6 (T10)** Espelho A4 unificado (`pdf-moldura.ts` + `MolduraA4.tsx`) para motor E
  laudo-texto, byte-identity provada por fixture verbatim; carótidas → texto livre;
  idade impressa na DATA DO EXAME.
- **D7 (T11)** Contrato da Ponte: ADR próprio
  (`docs/decisoes/2026-08-22-contrato-ponte-tela-motor.md`) + teste fonte-lendo com
  pisos anti-vácuo, sobrevivente a mutation-testing. Seguro da Seção 6.
- **D8 (T12/T13)** Cortes ponytail: mortos removidos, `b24_diast` 6→1 ref (mapeamento
  legado preserva dados), helpers únicos de params/páginas, `src/motor/` (cópia morta)
  apagado.

## Tríade final (bugs opus adversarial · arquitetura opus · ponytail sonnet)

3 Críticos + 12 Importantes achados no diff da branch; onda única de fix + 2 residuais
(commits `e0e1b38`, `d3daff7`, `582503f`, `d386a24`, `562cd6a`). Re-verificação pelos
mesmos revisores: **APPROVED nos dois eixos**, invariantes testadas por mutação.
Destaques fechados: timer órfão escrevendo identidade do paciente A no B; autosave
des-emitindo laudo assinado (gate por `status ∈ {emitido, cancelado}` — fecha também a
ressurreição de cancelado); PDF com `exameId` no path + `nomeArq` derivado no servidor
(homônimo não sobrescreve laudo assinado; fecha o R2 da emissão); escape de TODA
interpolação client-influenced no HTML do PDF (XSS no Chrome do servidor); latch do
desbloqueio deletado (`emitido` dono único); contrato de SAÍDA do motor (`out-*`)
travado por teste (8º contrato). Ponytail: zero cortes obrigatórios.

## Placar final

unit **251** · api **212** · rules **142** · wader **104** · tsc raiz+wader · build — 
partida era 116/196/142/104.

## Pendências para o Sergio (decidir no fechamento)

1. **Regra:** `sexo` segue na whitelist administrativa (`campos-exame.ts` +
   `firestore.rules:95`) — contradiz a decisão nº24 na camada de dados. Fechar exige
   publicar regra.
2. **Publicar `storage.rules`** no deploy (match do path novo
   `laudos/{ws}/{exameId}/` — não-bloqueante, ACL GCS cobre).
3. **Produto:** reemissão desfaz correção administrativa em silêncio (os clientes já
   avisam; fechar de vez?). Editor do laudo-texto deliberadamente não travado em
   emitido (reedição lá é o botão Reemitir).
4. **Dado:** título do PDF do eco agora vem do catálogo — TE/stress pararam de imprimir
   "TRANSTORÁCICO" (bug real); se quiser "ECOCARDIOGRAMA TRANSTORÁCICO" de volta,
   renomear o tipo em Clínica → Tipos de Laudo (sem deploy).
5. **Pré-merge:** varrer o prefixo `laudos/` em produção e apagar qualquer `.html`
   residual (teoricamente zero — branch nunca deployada).

## Roteiro do teste ao vivo (conta Gmail, ~15 min)

1. Rascunho com texto sobrevive a F5 e aparece noutra máquina.
2. Frase manual sobrevive a mudança de medida; linha editada + medida muda → motor vence.
3. Manual da diastólica chega à conclusão; Limpar fecha o painel.
4. Seção fechada não perde acinesia (abrir, digitar, fechar, salvar, reabrir).
5. Correção administrativa (recepção) não muda o corpo do laudo.
6. Carótidas abre no editor livre com a moldura A4.
7. Laudo emitido: Wilkins/Automático/Manual/teclado inertes; desbloqueio reabilita.
8. Alerta PSAP com b37 alto; inserir frase do banco cai no editor.
9. Abrir laudo com texto salvo: nada muda sozinho; troca rápida de exame mantém o texto
   do exame novo.

## Rollback

Branch isolada; master intocada. Reverter = não mergear.
