# Senna93 F5b — Aposentadoria do motor legado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.
> 1 implementador + 1 revisor adversarial por task; a T3 (o corte) tem revisor DEDICADO
> linha a linha (é a ÚNICA task da esteira inteira que toca o legado).

**Goal:** o motor antigo sai do ar de vez: `public/motor/motorv8mp4.js` deletado, flags e
kill-switch mortos (Senna93 incondicional), shadow-runner client morto deletado, órfãos
do banco extintos, Contrato da Ponte encolhe SEM afrouxar, e2e ganha o roteiro Senna93.
Depois disso, NENHUM código de motor viaja pro navegador (fecha a vitrine de IP).

**Contexto de risco:** F5a está no ar desde 28/08 (Senna93 global) e o legado hoje só
existe como plano B do kill-switch. Esta fase REMOVE o plano B — o rollback vira
`git revert` + redeploy (~3 min). **GATE DE DEPLOY: recomendação do controller é mergear/
deployar só APÓS o primeiro dia real de clínica (segunda 31/08 à noite), com OK do
Sergio — o kill-switch merece viver o primeiro plantão.** O código fica pronto antes.

## Global Constraints

- Placar-piso: unit **665** · api 228 · rules 142 · wader 104 · tsc/build limpos.
- Pré-condições (verificadas): pin 9.4 verde (motor define refluxoPulmonar mas não chama);
  flag ON global estável desde 28/08; sombra noturna limpa; teste ao vivo F5 6/6 (29/08).
- **Direx INTOCÁVEL** — `src/app/direx/painel/motor-shadow/page.tsx:63` cita o motor só
  em TEXTO (fica); se qualquer página Direx IMPORTAR um módulo a deletar, o módulo FICA
  e só o call-site fora do Direx morre (declarar no report).
- **A sombra servidor (F4) FICA nesta fase**: `src/lib/shadow/**` (simulador
  `legado-tabela.ts` é porte independente — continua válido como rede de regressão),
  cron, rota, allowlist. Aposentar a sombra é decisão FUTURA com o Sergio. Só o
  shadow-runner CLIENT morto (`src/lib/shadow-runner.ts`, 0 importadores) morre aqui.
- Contrato da Ponte (`tests/unit/contrato-ponte-ids.test.mjs`, 32 invariantes): as do
  legado saem; as do Senna93 ficam SEM afrouxar (mutation-test das sobreviventes).
- Nenhuma frase/número de laudo muda NADA nesta fase — é remoção de caminho morto.
  Qualquer flip observável = bug da task (a sombra noturna é o tripwire).
- Citações históricas `motorv8mp4.js:NNN` em COMENTÁRIOS (refValues, tabela,
  legado-tabela, params-render etc.) FICAM — são proveniência de porte, não referência
  viva. Só código executável morre.
- NUNCA `git add -A`; branch `feat/senna93-f5b` da master; commit+push por task.

## Âncoras de código (recon 29/08)

`page.tsx:567` injeção do script (com retry) · `:967` limpeza no unmount · interceptação
`window.calc` + restore (F3-T5) · `sc()` wrapper (~:717) · `shadowModeAtivo()/
executarEReportar` (~:769, client shadow) · override `window.alertaIT` · nó legado
`#alerta-psap` "de plantão" (SidebarLaudo ~:469, condicional `!paramsOn ||
!alertasMotor.length`) · flags em `src/lib/primary-engine-flag.ts` com call sites em
page.tsx, SidebarLaudo, params-render, senna90-bridge (e comentário em shadow/rodar.ts —
comentário fica) · e2e item 8 (caminho OFF) vs item 8-ON.

---

### Task 1 — A rede ANTES do bisturi: e2e roteiro Senna93 (spec F5b)

`tests/e2e/secao5-roteiro.spec.ts` ganha os itens Senna93 (rodando com a flag ON via
addInitScript, como o item 8-ON): (a) tabela pinta com VR por sexo (♂ vs ♀ trocando o
sexo: FE ≥52%/≥54%, DDVE 42-58/38-52); (b) VIDE quando b12 vazio com b9 presente;
(c) identificação `#out-idade` calculada ("46 anos" p/ 15/05/1980); (d) 12 linhas com
Aorta Ascendente/Arco. Estes testes DEVEM passar antes E depois do corte (são a rede).
Rodar `-g "setup|senna93"` com o dev server + state.json. Commit
`test(senna93-f5b): e2e roteiro senna93 — a rede antes do corte`.

### Task 2 — As flags morrem (Senna93 incondicional)

`src/lib/primary-engine-flag.ts` DELETADO; call sites viram caminho único (page.tsx,
SidebarLaudo, params-render, senna90-bridge — `paramsOn`/`senna90Primario()` constantes
true e depois simplificação honesta dos condicionais); e2e item 8 (OFF) morre — só o
8-ON fica, renomeado `item 8 — alerta PSAP estruturado` (sem addInitScript da flag,
que deixa de existir); testes unit do kill-switch (F3-T1, 10 testes) morrem com citação;
`docs/runbook-kill-switch.md` ganha cabeçalho HISTÓRICO ("morreu na F5b — rollback agora
é git revert + redeploy"). NENHUM comportamento visível muda (ON já era o default
global). Commit `feat(senna93-f5b): flags e kill-switch mortos — senna93 incondicional`.

### Task 3 — O CORTE (revisor DEDICADO linha a linha)

`public/motor/motorv8mp4.js` **DELETADO** (1.486 linhas; leva junto `_onInserirFrase` e
as ~9 funções órfãs do banco). page.tsx: injeção (:567 + retry + onload wrappers :508),
limpeza (:967), interceptação `window.calc`/restore, override `window.alertaIT` — tudo
morre; `sc()` simplifica para o caminho Senna93 puro (bridge + pintura + merge por
linha, que NÃO muda). SidebarLaudo: nó legado `#alerta-psap` de plantão morre (nada mais
o acende; a lista `#alertas-motor` é a única fonte). Grep final:
`grep -rn "motorv8mp4\|_onInserirFrase\|window.calc\|alertaIT" src/ public/` — sobras só
em comentários históricos e no texto do Direx. Pin novo no contrato: o ARQUIVO não
existe (`fs.existsSync === false`) — substitui o pin 9.4. Revisor dedicado: diff do
page.tsx hunk a hunk (o merge por linha da S5 e a emissão NÃO podem mudar um byte de
comportamento). Commit `feat(senna93-f5b): motorv8mp4.js DELETADO — nenhum codigo de
motor viaja mais pro navegador`.

### Task 4 — Shadow client morto + Contrato encolhe (mutation-tested)

`src/lib/shadow-runner.ts` deletado (verificar 0 importadores por grep antes);
`src/senna90/shadow-mode.ts`: call site do page.tsx (~:769) morre; o módulo em si só
morre se NENHUMA página Direx o importar (verificar; se Direx importa → módulo fica,
declarar). Contrato (`contrato-ponte-ids.test.mjs`): invariantes do legado saem
(OFF-byte-idêntico, restore do calc, etc. — mapear pelo teste), as do Senna93 ficam e
o revisor roda mutation-test em CADA sobrevivente (mutar o alvo → teste tem que ficar
vermelho). Placar do contrato declarado (32 → N, com a lista do que saiu e por quê).
Commit `feat(senna93-f5b): shadow client morto + contrato da ponte encolhido sem afrouxar`.

### Task 5 — Documental

Spec anotada (F5b concluída; kill-switch morto); allowlist md ganha nota de topo ("motor
legado DELETADO na F5b — o lado 'legado' das comparações vem do simulador
`legado-tabela.ts`, porte congelado; a sombra segue como rede de regressão até decisão
de aposentá-la"); plano marcado; ADR `docs/decisoes/2026-08-31-senna93-f5b.md` (data do
merge); INDEX.md. Commit `docs(senna93-f5b): spec/allowlist/ADR da aposentadoria`.

## Fechamento (controller)

1. Bateria completa (nenhum piso rebaixado; unit MUDA: −kill-switch −contrato-legado
   +e2e não conta no unit — declarar o novo piso honesto por suíte).
2. **TRÍADE FINAL adversarial da branch** (spec F5b exige): Codex-role (bugs/edge no
   diff de remoção — o clássico "removeu de menos/de mais") · Ruflo (fronteiras pós-
   legado) · Ponytail (sobrou o quê para deletar?).
3. e2e completo (`npx playwright test`) — roteiro S5 + senna93 + item 8.
4. **Gate do Sergio:** merge + deploy SÓ após o primeiro plantão real (recomendação:
   segunda 31/08 à noite). Depois do deploy: remover `NEXT_PUBLIC_PARAMS_ENGINE` e
   `NEXT_PUBLIC_PRIMARY_ENGINE` do Vercel (inertes) + **teste ao vivo de DESPEDIDA**
   com o Sergio em produção (tabela, frases, emissão com PDF — o roteiro curto do
   teste F5 de 29/08).
5. Ledger/ADR/Obsidian/memória. A pendência "aposentar a sombra F4" nasce registrada
   como decisão futura.
