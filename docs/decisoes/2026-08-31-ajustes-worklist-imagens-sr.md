# Ajustes 31/08 — worklist por chegada real, imagens em ordem, laudo vivo de verdade

**Data:** 31/08–01/09/2026 · **Branch:** `ajustes-worklist-imagens-sr` · **Status:** tríade APPROVED (Codex READY FOR MERGE em 2 rodadas, Ruflo sem crítico/médio, Ponytail 2/3 aplicados) · aguardando merge+deploy com Sergio

Sergio relatou 5 problemas. O item 1 (nome "ECO TRANSTORACICO" no laudo) **não precisou de código**: o título vem do catálogo Clínica → Tipos de Exame (`workspaces/{ws}/tiposLaudo`), basta renomear lá — Sergio faz. Itens 2–5 abaixo.

## Item 2 — Worklist fora de ordem de chegada

**Causa:** `horarioChegada` de exame Feegow **nunca foi chegada** — é `ag.horario`, o slot AGENDADO. A worklist ordenava por ele.

**Decisão:** campo novo `chegouEm` (serverTimestamp) gravado no `tx.create` da importação (`feegow-admin.ts`) — como a importação só aceita `status_id=4` (sala de espera), o 1º import **é** o check-in; `tx.create` garante write-once. Ordenação client-side (`src/lib/worklist-ordem.ts`): `chegouEm ?? criadoEm` (manual/legado), sem timestamp → fim da fila. `horarioChegada` mantém semântica única (slot agendado) e segue alimentando o MWL do Wader. Coluna Hora e cronômetro de espera usam a chegada real; chegada de OUTRO dia cala o cronômetro (não finge com o slot).

- Sem mudança de regra/whitelist: só Admin SDK escreve `chegouEm`. Nota de vigilância do Ruflo: o branch de update do médico-autor nas rules não tem `hasOnly` — se um dia alguém criar auto-save "doc inteiro", proteger o campo.
- Sentinela em `listenWorklist`: se um dia paginar, o corte tem que ser por `chegouEm`, não pelo `orderBy` de `horarioChegada`.

## Item 3 — Imagens fora da ordem de aquisição

**Causa:** o Wader usava `/studies/{id}/series` cru — ordem interna do banco do Orthanc; nenhum lugar lia `SeriesNumber`/`InstanceNumber`; merge anexava imagem tardia no fim.

**Decisão:** expand por série (`getSeriesInstances`, novo no orthanc-client) e ordenação por `(SeriesNumber, InstanceNumber, IndexInSeries)`. Os 3 campos (`serie`, `instancia`, `posicao`) são **persistidos** em `imagensDicomDetalhes` (opcionais; omitidos quando ausentes — Admin SDK rejeita `undefined`) e o array é re-ordenado pós-merge — imagem tardia entra no lugar certo, empate de InstanceNumber sobrevive a rodadas diferentes. Tag vazia (`''`) é ausente, não zero; `Number.isFinite` filtra lixo. Expand falhando cai na ordem interna sem derrubar a etapa 2. Tela e PDF herdam a ordem sem mudança no app.

## Item 4 — Imagem chegando com o laudo aberto não entrava no PDF

**Causa:** a seleção default (primeiras 8) era fotografada na 1ª snapshot com imagem (`selecaoInicializada`) e nunca crescia — reabrir "consertava".

**Decisão:** ref virou `selecaoPersonalizada`: enquanto o médico não personalizou (seleção salva no doc ou 1º clique), o default recalcula a cada snapshot; depois disso, só poda (escolha soberana, nunca re-marca o desmarcado).

## Item 5 — Botão "Importar SR" travava após a 1ª importação

**Causa:** boolean `dicomImportado` virava `true` no 1º import e só resetava no Limpar/reabrir; medida nova ficava presa no contador.

**Decisão:** estado guarda o **conjunto de assinaturas** `chave|valor|unidade` oferecidas na última importação — chave nova OU valor corrigido reabre o botão sozinho. Desmarcadas pelo médico não reabrem (decisão dele). No modal aberto, medida recém-chegada entra MARCADA sem desfazer escolhas (ref de chaves conhecidas por abertura).

## Tríade (pré-merge, regra fixa)

- **Codex** (adversarial, 2 rodadas): 5 achados → 4 corrigidos (empate+merge tardio via `posicao`; assinatura com valor; cronômetro mudo em outro dia; `Number('')`), 1 pré-existente fora de escopo (retry de upload falhado — "achado 9" deliberado; task registrada). Bônus da execução: `undefined` no write do Admin SDK. **READY FOR MERGE.**
- **Ruflo** (arquitetura): sem crítico/médio; sentinela de paginação aplicada; vigilância sobre branch do médico sem `hasOnly`.
- **Ponytail:** 2 cortes aplicados (export só-de-teste, teste trivial); corte dos pré-sorts **rejeitado** — o pré-sort é onde o `IndexInSeries` está em mãos.

## Pendências

- Retry limitado pra imagem com falha transitória de upload (task chip criada).
- Wader: mudança só vale na clínica após atualizar o executável (próxima visita).
- Testes: unit 763 · api 0 fail · wader 33 · tsc limpo (app+wader).
