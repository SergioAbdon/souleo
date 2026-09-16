# ADR — Senna93 Fase 4: sombra persistida

**Data:** 28/08/2026 · **Branch:** `feat/senna93-unificacao` (base master d76dd99, head b5cc77c)
**Esteira:** SDD — 6 tasks + 3 fix waves + revisão final de branch (opus adversarial por task)
**Placar:** unit **611** · api **228** · rules 142 · wader 104 · tsc+build limpos (partida: 576/212)
**Status:** código PRONTO (revisão final: READY FOR MERGE) · retroativo GRAVADO · aguardando OK
do Sergio para merge+deploy (liga o cron e abre a janela de ~7 dias)

## O que a F4 entregou

- **Sombra das DUAS metades**: frases (comparação estrita por conjunto, movida da rota) E a
  metade dos números — `montarRowsTabela` (Senna93) × **simulador do legado**
  (`src/lib/shadow/legado-tabela.ts`, porte VERBATIM de motorv8mp4.js, bugs inclusos: B24
  +0,6mg, ASC 71,74, toFixed/ponto, WASE ♀>65=37). Zero toque no motor (diff vazio, provado).
- **Allowlist executável com tripwire**: `docs/planos/2026-08-27-senna93-divergencias-esperadas.md`
  é A fonte; `src/lib/shadow/allowlist.ts` espelha (matchers de frase + 7 pares de VR +
  tolerâncias por célula) e o teste de cobertura falha se md e código divergirem (38 refs).
- **Persistência**: `workspaces/{ws}/privado/shadow/execucoes/{execId}` (+ subcoleção
  `exames/` só p/ divergentes) via Admin SDK. **Nenhuma regra Firestore nova** (`privado/**`
  segue deny recursivo). **Nenhum identificador de paciente no Firestore** (nome só na
  resposta HTTP da página Direx, que ficou intocada e back-compatible campo a campo).
- **Gate de papel na rota** (`resolverPapel` dono|medico, 401→400→403): fechou furo real —
  antes QUALQUER autenticado lia achados/conclusões+nome de QUALQUER workspace.
- **Validação contínua do simulador**: exames pós-25/08 pintados pelo legado têm o snapshot
  `laudos-html/` comparado byte a byte com o simulador (`snapshotCheck {pintado,simulado}`).
- **Cron diário** `/api/cron/shadow-diario` (02:30 UTC = 23:30 Belém, CRON_SECRET
  fail-closed, janela 25h, 0 exames = não grava) + **script CLI**
  `npm run shadow:retroativo -- --ws X --from AAAA-MM-DD [--to AAAA-MM-DD] [--commit]`
  (ensaio por padrão; args estritos; relatório agrupado por divergência).

## Decisões técnicas da fase

1. **Era-bucketing**: frases só contam inesperadas p/ exames emitidos ≥ 17/05/2026
   (senna90 primário em produção desde 16/05 — docblock do primary-engine-flag); antes disso
   o texto é do legado e re-litigaria as 22 divergências de maio → balde informativo.
   Números comparam motor×motor em TODAS as eras.
2. **TZ determinístico**: `T12:00` nas datas passadas ao simulador — idade de calendário em
   qualquer TZ de servidor. Os 8/691.920 pares do off-by-one do legado na clínica NÃO são
   reproduzidos (divergência ali = bug real do legado aflorando, que é o que a sombra quer).
3. **Tolerância de células**: mm coluna esquerda 0,91 (casas 1→0 declarada no md — o plano
   dizia 0,11 e estava errado; o md vence). Realce/oor NÃO comparado (deslocado 3 linhas no
   legado, adjudicado).
4. **Allowlist só cresce com justificativa + linha no md** (tripwire força os dois juntos).
   Cresceu 1 vez no fechamento: flip diastólico A12/B12 (abaixo), matcher DIRECIONAL.
5. Consolidação do init Admin na rota (auth-admin) corrigiu de carona bug latente de
   `storageBucket` (lambda fria quebraria o snapshotCheck).
6. `npm run shadow:retroativo` depende de `--import ./tests/unit/register-ts-resolve-hook.mjs`
   (node cru não resolve import relativo sem extensão de .ts) — registrado como pedido na T6.

## Retroativo real (28/08, --commit, 3 workspaces)

| ws | exames | células | frases era-senna90 | era-legado |
|---|---|---|---|---|
| MedCardio (LDRt…) | 175 comparados | **3.664 esperadas · 0 INESPERADAS** | 101 esperadas · **19 inesperadas (todas explicadas)** | 112 (informativo) |
| dIJf… | 2 | 10 esperadas · 0 | 0 | 0 |
| wader-dev | 1 (pulado sem-medidas) | — | — | — |

**A metade dos números fechou LIMPA no histórico inteiro.** As 19 inesperadas de frase:

- **Edições manuais do médico** (a maioria): "Septo interventricular com movimento atípico"
  é frase do BANCO do legado (id:7), nunca gerada pelo motor; "Septo interatrial
  aneursmatico… 10mm" tem typo = digitada à mão. Merge por linha é feature — o motor não
  gera essas frases e nunca vai.
- **1 exame pré-S5 inconsistente** (2xAl…, emitido 03/08): texto dizia "normal + PSAP 24",
  medidas salvas dizem IAo leve + placas + PSAP vazia. O fluxo pré-S5 não travava medidas na
  emissão. O motor de hoje está CERTO para as medidas salvas. Sem ação (S5 já fechou isso).
- **Flip diastólico A12/B12** (2 exames): a F1 mudou a entrada do algoritmo
  (`calculos/diastologia.ts:86-92` — FE-baixa 50→52/54 por sexo; massa alta 102/88→115/95)
  → o RAMO da classificação troca e "Indeterminada"/"índices preservados" aparecem.
  Deliberado (spec §2.1 A12/§2.3 B12), entrou na allowlist (só a APARIÇÃO; o sumiço segue
  alarmando). A conclusão-irmã do átrio esquerdo NÃO foi allowlistada (mascararia bug real
  de LAVI) — fica explicada caso a caso.
- snapshot: 0 conferidos ainda (nenhum emitido pós-25/08 com o legado pintando) — a janela
  de 7 dias alimenta essa validação com os exames novos da clínica.

**Leitura operacional da meta**: "0 divergências inesperadas" = 0 NÃO-EXPLICADAS. Edição
manual de laudo é feature e sempre vai aparecer; o relatório agrupa por texto e cada grupo
novo da janela exige explicação (bug do Senna93 OU do legado OU edição).

## Próximo (gates)

1. **Sergio**: OK p/ merge master + deploy Vercel (fora do horário) → cron liga → janela de
   ~7 dias acumulando exames novos. Pré-deploy: conferir `CRON_SECRET` no Vercel.
2. Janela fecha limpa → relatório final → **F5a virada** (herda os gates: smoke offline,
   cartão do kill-switch no runbook, e2e item 8 ramificado, re-teste do modal do banco).
3. Registrados p/ F5: remap b59/b60/b61 engolido pela família F1-T8 (linha no md ou matcher
   estreito); guard direcional a≥b nas células mm; puppeteer no bundle da rota/cron
   (3 linhas resolvem); réplicas script×deps-admin sem tripwire; limit 200/500 silencioso.
