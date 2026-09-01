# Wader: retry limitado pra falha transitória de imagem no ingest

**Data:** 2026-09-01 · **Origem:** pendência apontada pelo Codex na tríade de 31/08 (comportamento pré-existente ao branch ajustes-worklist-imagens-sr)

## Problema

O Achado 9 gravava `nImgTentadas = processadas + falhadas` e `precisaProcessar`
comparava `curImg > nImgTentadas`. Isso protegia contra loop infinito numa falha
PERMANENTE (instance corrompida), mas engolia a falha TRANSITÓRIA (timeout de
rede no upload): a imagem só voltava se chegasse instance nova ou por reprocesso
manual (`reprocessarDicom`).

## Decisão

Retry automático **limitado**, preservando o teto do Achado 9:

- `StudySignature` ganha `nImgFalhadas` (quantas falharam no último
  processamento) e `tentativasFalha` (processamentos consecutivos com falha).
  Sucesso limpa os dois campos. Estado antigo em disco sem os campos = sem
  pendência (compatível).
- **Teto:** `MAX_TENTATIVAS_FALHA = 3` processamentos falhados (original + 2
  retentativas). Depois disso, só instance nova ou reprocesso manual destravam.
- **Backoff:** `2^tentativas` minutos sobre o `at` da assinatura (2 min após a
  1ª falha, 4 min após a 2ª).
- **Reenfileiramento ativo:** sem instance nova o Orthanc não emite novo
  `StableStudy`, então o tick chama `estudosComRetryPendente()` e injeta esses
  estudos na fila do laço — só mudar `precisaProcessar` não bastava.
- **Geração nova zera o contador:** se o Orthanc ganhou conteúdo
  (`curImg > nImgTentadas` ou `curSR > nSR`), o processamento é uma geração
  nova e `tentativasFalha` recomeça — senão estudo que estourou o teto e depois
  ganhou instance ficava sem os retries prometidos (achado M1 do Codex).
- **Estudo apagado no Orthanc consome tentativa:** `getStudySeries` falhando
  pra estudo na fila de retry incrementa `tentativasFalha` e renova `at` —
  senão o ID seria consultado a cada tick pra sempre (achado M3 do Codex).
- **Guard de tick sobreposto:** `tickEmAndamento` pula o tick que dispararia em
  paralelo com um tick lento — corrida pré-existente que o retry alargava
  (uploads duplicados, contador subcontado; achado M2 do Codex).

## Bug latente corrigido de carona

`IngestStateStore` inicializava com `{ ...EMPTY }` (cópia RASA): todas as
instâncias compartilhavam o MESMO objeto `studies`. Em produção só existe um
store, mas os testes com 2+ stores expuseram o vazamento. Virou factory
`vazio()`.

## Arquivos

- `apps/wader/src/workers/ingest-state.ts` — campos novos, teto/backoff,
  `retryPendente`, `estudosComRetryPendente`, `vazio()`.
- `apps/wader/src/workers/dicom-ingest-worker.ts` — reenfileiramento no tick,
  gravação dos campos de falha, geração nova, estudo sumido, guard de tick.
- Testes: 5 casos novos no worker + 3 no state (112/112 verdes, typecheck OK).

## Fora de escopo (nits do Codex, deliberado)

Reprocesso manual (`reprocessarDicom`) não atualiza a assinatura — um retry
automático redundante após reprocesso manual bem-sucedido é idempotente e
capado pelo teto. Ordenação por aquisição (série/instância) intocada, como
pedido.
