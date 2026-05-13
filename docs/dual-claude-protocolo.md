# Protocolo Dual Claude — sincronia entre 2 sessões

> Criado 12/05/2026. Sergio rodou Claude paralelos em 2 máquinas durante a Fase 5 (DICOM SR pipeline).

## Contexto

Existem 2 Claudes que podem estar trabalhando neste projeto simultaneamente:

| Claude | Onde roda | Foco |
|--------|-----------|------|
| **Notebook Sergio** | `C:\Users\sergi\Desktop\souleo` | Planejamento, arquitetura, code review, estratégia |
| **PC Clínica MedCardio** | `C:\souleo` | Execução prática: Wader rodando, logs ao vivo, Orthanc, Firebase Storage |

## ⚠️ Pegadinha crítica

A pasta `~/.claude/projects/.../memory/` é **PER-MÁQUINA**. Memórias salvas lá NÃO sincronizam via git entre as 2 máquinas.

Só sincronizam automaticamente:
- Código do projeto (git push/pull)
- Arquivos em `apps/wader/CLAUDE.md`, `AGENTS.md`, `docs/` (git-tracked)
- Comunicação humana mediada pelo Sergio

## Regras de sincronia

Toda sessão de Claude trabalhando neste projeto deve:

### 1. Código

Todo edit:
```
git add -A
git commit -m "msg descritiva"
git push
```

Antes de seguir pra próxima task. Outro Claude vê via `git pull`.

### 2. Decisões arquiteturais

Quando bater martelo em algo importante (escolha entre abordagens, mudança de schema, padrão a seguir):

1. Documentar em **`docs/decisoes/AAAA-MM-DD-titulo.md`** (vai pro git, todos veem)
2. Linkar essa decisão em `docs/decisoes/INDEX.md` (criar se não houver)
3. **Também** salvar em sua memória local (`~/.claude/...memory/project_NOME.md`) pra você lembrar
4. Avisar ao Sergio: "salvei em docs/decisoes/X.md, lembra de pull no outro lado"

### 3. Nova feature

Antes de começar:

1. `git pull --rebase`
2. Ler `docs/decisoes/` (recentes)
3. Ler sua memória local (`MEMORY.md`)
4. Conferir branch atual: `git status` e `git log -5 --oneline`

## Para o Sergio (humano)

Você é a ponte humana entre os 2 Claudes. Recomendado:

- Cole atualizações importantes de um Claude pro outro
- Após sessão importante, manda mensagem curta ao Claude "do outro lado" tipo "decidimos X, lê docs/decisoes/AAAA-MM-DD-X.md"
- Mantenha 1 Claude por máquina por vez (mesmo terminal, mesma janela do Desktop)

## Limites

Este protocolo NÃO resolve:
- Race conditions (dois Claudes mexendo no mesmo arquivo ao mesmo tempo) → use 1 por vez
- Memória de conversa (cada Claude esquece a conversa do outro) → use `docs/decisoes/`

## Resultado esperado

Cada Claude consegue trabalhar produtivamente sabendo o que o outro fez/decidiu, sem duplicar esforço ou contradizer decisões anteriores.
