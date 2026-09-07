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

- `StudySignature` ganha `tentativasFalha` (processamentos consecutivos com
  falha de imagem; presença = pendência de retry). Sucesso limpa o campo.
  Estado antigo em disco sem o campo = sem pendência (compatível). O nº de
  imagens falhadas não é persistido (corte Ponytail na tríade — já vai pro
  log/`result.errors`).
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
- **Consulta falhada — a origem da fila decide** (achado M3 do Codex +
  achado 1 da revisão final): `getStudySeries` falhando pra estudo que entrou
  pela fila de retry (sentinela) CONSOME uma tentativa e renova `at` — senão
  um ID apagado direto no Orthanc seria consultado a cada tick pra sempre.
  Já pra estudo `matched` que entrou por `StableStudy` REAL, a falha abre
  geração nova (`tentativasFalha = 1`): o evento — único sinal do conteúdo
  novo — foi consumido, e herdar/estourar o teto antigo travaria a imagem
  nova pra sempre. Cobre também o estudo conhecido SEM pendência cuja
  consulta falhou no StableStudy (metade do achado 2 da revisão final).
  Fica de fora, registrado como pendência pré-existente: estudo NUNCA visto
  (sem assinatura) cuja primeira consulta falha — o evento se perde como
  sempre se perdeu; destravar exige reenvio/reprocesso manual.
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

## Tríade pré-merge (01/09, sessão do notebook)

- **Codex** — adversarial na sessão implementadora (M1 geração nova, M2 tick sobreposto,
  M3 estudo apagado — todos tratados acima) + re-verificação final pós-cortes.
- **Ponytail** — 1 corte aplicado: `nImgFalhadas` era redundante (`tentativasFalha`
  presente já marca a pendência; o nº de falhadas segue no log/`result.errors`).
- **Ruflo** — sem bloqueio; 2 dívidas de fronteira registradas como follow-up:
  (1) `at` acumulou papel duplo (última vez processado + relógio do backoff) —
  documentado na interface; separar num campo próprio se algum dia for exibido;
  (2) a fórmula de "conteúdo novo" existe no worker (`conteudoNovo`) e no store
  (`precisaProcessar`) — se a base mudar num lado, o outro diverge em silêncio;
  candidato a `store.ehGeracaoNova()` numa onda futura.

Merge na master junto com a suíte combinada: wader 120 · tsc limpo (contagem final pós-revisão Codex).
