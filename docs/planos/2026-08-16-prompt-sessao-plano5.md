# Prompt de abertura — Sessão do Sub-plano 5 (Integrações)

> Copiar tudo abaixo da linha e colar como primeira mensagem da nova sessão do Claude Code em `C:\Users\sergi\Desktop\souleo`.

---

Executar o **Sub-plano 5 (seção Integrações)** da reestruturação do LEO.

**Estado do projeto (16/08/2026):** Sub-planos 1, 2, 3 e 4 do roadmap estão NO AR em produção (shell por seções V7 com sidebar branca; Agenda com as 11 correções de segurança da Seção 2; catálogo de tipos de laudo com texto e PDF anexado; seção Pacientes com busca, ficha, linha do tempo e edição de cadastro). Roadmap: `docs/planos/2026-08-13-reestruturacao-roadmap.md`. Ledger do que já foi feito: `.superpowers/sdd/progress.md`. Memória local e Obsidian (`Leo/Decisões/`) têm o histórico.

**Leia primeiro a spec:** `docs/superpowers/specs/2026-08-16-integracoes-design.md`. Ela tem as seis decisões que o Sergio fechou em 16/08 (D1–D6), com o porquê de cada uma — inclusive as duas que contrariam a ideia original do ADR de 10/08.

**O que fazer:** executar `docs/planos/2026-08-16-plano5-integracoes.md` (8 tasks, ~6h) com a esteira `superpowers:subagent-driven-development` — 1 subagente implementador por task (modelo barato quando o código está no plano) + revisor por task + revisão final de branch com o modelo mais capaz. Registrar cada task no ledger (seção nova "Sub-plano 5").

**Branch: criar `feat/integracoes` a partir da master** (as anteriores reusaram `feat/reestruturacao-plataforma`; esta começa limpa, porque a de reestruturação já foi mergeada).

**O que esta fase tem de diferente das anteriores — leia com atenção:**

1. **Mexe em segredo de verdade.** O objetivo é tirar o token do Feegow e a senha do Orthanc de dentro do documento do local, onde hoje qualquer membro que lê o timbre lê junto. Nenhum caminho pode devolver credencial ao navegador: nem em resposta, nem em mensagem de erro, nem em log.
2. **Tem regra nova para publicar** (com confirmação do Sergio) e **migração de dados em produção**. Diferente do Sub-plano 4, que foi só código.
3. **Tem virada coordenada com a clínica.** Decisão D3: migrar e atualizar o Wader na máquina da clínica **no mesmo dia, fora do horário de exame**, sem código de compatibilidade com o lugar antigo. O Sergio precisa estar disponível para essa janela — combine antes de rodar a migração com `--commit`.
4. **O `ortancAtivo` é uma armadilha.** `src/components/laudo/SidebarLaudo.tsx:187` usa esse campo para mostrar o botão "Importar DICOM" a **qualquer médico**, e a entidade nova só o dono lê. Ele fica no documento do local, espelhado, com teste-tripwire. Apagá-lo na limpeza tira o botão da tela do laudo.

**Ajustes/lições das sessões anteriores (respeitar):**
- Motor (`src/app/laudo/[id]/page.tsx`), `src/components/laudo/**` e Direx: INTOCÁVEIS.
- Tooling: `node --test` não resolve import relativo encadeado entre `.ts` — arquivo coberto por teste unit não pode ter import local (padrão de `src/lib/nav.ts` e `src/lib/paciente-fmt.ts`).
- NÃO usar `git stash` (o daemon `.claude-flow` engole edições). Commit+push após cada task (Dual Claude). `.superpowers/` é git-ignored — subagentes não podem commitá-lo, e já aconteceu de um subagente varrer arquivos temporários para dentro de um commit: confira o `git show --stat` do que eles commitam.
- Verificação manual: conta Gmail PJ de teste (NUNCA a Yahoo — dados reais da clínica).
- Emulador: se `test:rules` falhar com porta ocupada, matar o java zumbi na 8080 — NUNCA trocar a porta no repo.
- E2E: `npm run test:e2e` roda se `tests/e2e/.auth/state.json` existir. **A suíte deixa lixo na conta de teste** — `limparDaFila()` conta as linhas antes de a fila carregar, recebe zero e sai calada. Se falhar com "resolved to 2 elements", é resíduo de rodada anterior, não regressão: apagar os exames `E2E TESTE *` da conta de teste e rodar de novo.
- Escrever no Obsidian **direto no disco** (`C:\Users\sergi\OneDrive\Documentos\Obsidian Vault\Leo\Decisões\`) — o MCP trava e chegou a cair na sessão passada.

**Autorizações a pedir ao Sergio LOGO NO INÍCIO (em lote, pra rodar sem interrupções):** (1) executar as 8 tasks com subagentes + commits/pushes; (2) publicar a regra nova quando a bateria estiver verde; (3) rodar a migração com `--commit` em produção, na janela combinada; (4) merge na master + deploy Vercel + verificação. A limpeza dos campos antigos (`integracoes:limpar --commit`) fica para **depois** da verificação de que uma imagem entra de verdade — não peça autorização antecipada para ela.

**Ao concluir:** atualizar roadmap (Sub-plano 5 ✅), ledger, ADR em `docs/decisoes/`, nota no Obsidian, memória local, e reportar ao Sergio o placar do sprint (ficam 6-Clínica e 7-Login+tríade final).
