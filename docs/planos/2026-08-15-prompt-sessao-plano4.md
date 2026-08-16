# Prompt de abertura — Sessão do Sub-plano 4 (Pacientes)

> Copiar tudo abaixo da linha e colar como primeira mensagem da nova sessão do Claude Code em `C:\Users\sergi\Desktop\souleo`.

---

Executar o **Sub-plano 4 (seção Pacientes)** da reestruturação do LEO.

**Estado do projeto (15/08/2026):** Sub-planos 1, 2 e 3 do roadmap estão NO AR em produção (shell por seções V7 com sidebar branca; Agenda com as 11 correções de segurança da Seção 2; catálogo de tipos de laudo com carótidas por texto e ECG/MAPA/Holter/Ergométrico por PDF anexado). Roadmap: `docs/planos/2026-08-13-reestruturacao-roadmap.md`. Ledger do que já foi feito: `.superpowers/sdd/progress.md`. Memória local e Obsidian (`Leo/Decisões/`) têm o histórico.

**O que fazer:** executar `docs/planos/2026-08-15-plano4-pacientes.md` (5 tasks, ~4-5h) com a esteira `superpowers:subagent-driven-development` — 1 subagente implementador por task (modelo barato quando o código está no plano) + revisor por task + revisão final de branch. Registrar cada task no ledger (seção "Sub-plano 4"). Branch: `feat/reestruturacao-plataforma` (a atual — NÃO criar branch nova).

**Ajustes/lições das sessões anteriores (respeitar):**
- Motor (`src/app/laudo/[id]/page.tsx`) e Direx: INTOCÁVEIS.
- Tooling: `node --test` não resolve import relativo encadeado entre `.ts` — se um teste importar um TS que importa outro TS local, quebra (soluções usadas: import type + inline, ou arquivo sem imports locais).
- NÃO usar `git stash` (daemon engole edições). Commit+push após cada task (Dual Claude). `.superpowers/` é git-ignored — subagentes não podem commitá-lo.
- Verificação manual: conta Gmail PJ de teste (NUNCA a Yahoo — dados reais da clínica). O trial da conta teste está vencido: emitir laudo real falha com "plano expirado" (esperado; não é bug).
- Emulador: se `test:rules` falhar com porta ocupada, matar o java zumbi na 8080 — NUNCA trocar a porta no repo.
- Teste E2E: existe Playwright em `tests/e2e/` (etapa 3); roda com `npm run test:e2e` SE `tests/e2e/.auth/state.json` existir (Sergio gera com `npm run test:e2e:login` — abre navegador, ele loga 1x, o script salva com IndexedDB; codegen NÃO serve pro Firebase Auth — instruções em `tests/e2e/auth.setup.md`); sem o state, os specs se auto-pulam.
- Sub-plano 4 NÃO muda regra nem índice (já existem) — deploy é só código, sem publicação.

**Autorizações a pedir ao Sergio LOGO NO INÍCIO (em lote, pra rodar sem interrupções):** (1) executar as 5 tasks com subagentes + commits/pushes; (2) ao final, merge na master + deploy Vercel + verificação. [Sem regra e sem migração neste sub-plano.]

**Ao concluir:** atualizar roadmap (Sub-plano 4 ✅), ledger, nota no Obsidian (`Leo/Decisões/AAAA-MM-DD ...`, direto no disco — o MCP do Obsidian trava), memória local, e reportar ao Sergio o placar do sprint (ficam 5-Integrações, 6-Clínica, 7-Login+tríade final; o follow-up de segurança dos GETs do Feegow com wsId está anotado pro Sub-plano 5).
