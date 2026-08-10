<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Dual Claude

Pode existir outra sessão de Claude trabalhando neste projeto em paralelo (Sergio usa Claude no notebook + Claude na PC clínica MedCardio). Antes de modificar código ou tomar decisão arquitetural, **lê `docs/dual-claude-protocolo.md`** e **conferir `docs/decisoes/`** (se existir).

Resumo do protocolo: commit + push após cada edit; decisões importantes vão pra `docs/decisoes/AAAA-MM-DD-titulo.md`; memória local (`~/.claude/...memory/`) é per-máquina, não compartilha via git.

## Protocolo de Orquestração (mesmo da Marina)

### Dados reais — quem decide é o operador (Sergio)

Leo trabalha com laudos e dados reais de pacientes — isso é o normal do projeto.
Única regra: **prompt enviado a Perplexity ou Gemini sai da máquina para servidores
de terceiros.** Antes de incluir dado identificável de paciente (nome, exame, CPF)
num prompt para esses MCPs, perguntar ao Sergio — a decisão de expor é dele.

### O Ciclo — toda alteração segue estas 5 etapas

1. **PESQUISAR** (Perplexity MCP) — só quando houver dependência externa: Firebase/
   Firestore, Vercel, breaking changes de Next.js. Pule se a mudança é interna.
2. **PLANEJAR** — proporcional: trivial vai direto; feature que toca 3+ arquivos
   ganha brainstorm curto + plano. Ler o fluxo real de ponta a ponta antes de codar.
3. **IMPLEMENTAR** (Claude + Ponytail full) — menor diff que funciona, reusar o que
   já existe, bug fix na causa raiz, 1 teste mínimo por lógica não-trivial.
4. **REVISAR** (Codex MCP) — antes de commitar features (não triviais): pedir ao
   Codex revisão independente do diff (bugs, segurança, edge cases). Codex é
   revisor, nunca implementador.
5. **DOCUMENTAR** — decisões vão para `docs/decisoes/AAAA-MM-DD-titulo.md`
   (fonte da verdade, compartilha entre máquinas via git, conforme protocolo Dual
   Claude acima). Ao fim da sessão, espelhar um resumo curto no vault Obsidian
   (`Leo/Decisões/`) para visão cross-projeto.

### Pipeline padrão de FEATURE (fechado com o Sergio em 10/08/2026)

Feature não-trivial (toca 3+ arquivos, muda fluxo ou segurança) segue esta esteira,
que é o que deu certo no Plano 2A. Cada etapa é uma skill do superpowers:

1. **`superpowers:brainstorming`** — levantamento (ler o fluxo real de ponta a ponta)
   + design aprovado pelo Sergio ANTES de qualquer código. Escopo grande → decompor
   em sub-planos (ex.: 2A, 2B-A, 2B-B), cada um com spec própria.
2. **`superpowers:writing-plans`** — plano em tarefas bite-sized, com código e testes.
   Salvar em `docs/planos/AAAA-MM-DD-*.md`.
3. **`superpowers:subagent-driven-development`** — 1 subagente implementador por
   tarefa + revisor entre elas (spec + qualidade). Ledger em `.superpowers/sdd/`.
4. **TRÍADE** — no fim, revisão em 3 óticas independentes, cada uma instruída a NÃO
   repetir a outra: **Codex** (bugs/segurança/edge cases, com verificação adversarial
   — tenta refutar cada correção), **Ruflo reviewer** (arquitetura/fronteiras),
   **Ponytail** (o que deletar). Achados críticos → onda de fix + re-verificação.
5. **DOCUMENTAR + SINCRONIZAR** — ADR em `docs/decisoes/`, espelho no Obsidian
   (`Leo/Decisões/`), memória local, e **push (git) para a PC da clínica saber**.

Regra de ouro que atravessa: correção de segurança entra nos arquivos de regra E no
código no mesmo commit, com teste usando payload REAL (`tests/rules/fixtures.mjs`).
Ações sensíveis (push na master/deploy, publicar regras, scripts `--commit`) pedem
confirmação do Sergio — ver `.claude/settings.json`. NÃO usar `git stash` (daemon
`.claude-flow` engole edições).

### Papéis fixos

Claude Code orquestra e implementa · Ponytail segura a simplicidade (sempre on) ·
Perplexity pesquisa com fontes · Codex revisa diffs · Gemini gera assets/diagramas ·
Obsidian guarda decisões cross-projeto · Ruflo só memória/hooks passivos (sem
swarms sem pedido explícito). Um cérebro, várias mãos.
