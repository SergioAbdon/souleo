---
description: Sincroniza este Claude com o estado atual do repo + decisões do outro Claude (notebook)
---

Execute em ordem, sem modificar nada (apenas leitura):

1. `git status` — branch atual + mudanças locais não commitadas
2. `git pull origin master` — puxar updates do GitHub
3. `git log --oneline -10` — últimos 10 commits
4. Ler `docs/dual-claude-protocolo.md` se existir
5. Listar arquivos em `docs/decisoes/` se a pasta existir. Ler os **3 mais recentes** ordenando pela data no nome do arquivo (formato `AAAA-MM-DD-*.md`)
6. Ler o `MEMORY.md` local em `~/.claude/projects/C--souleo/memory/MEMORY.md`

Depois entregue um resumo de **até 200 palavras** neste formato exato:

- 📊 **Mudanças recentes:** commits novos, PRs mergeados, decisões novas em `docs/decisoes/`
- 🌿 **Estado atual:** branch, mudanças não commitadas, PRs pendentes, ponto em que o outro Claude estava
- ➡️ **Sugestão:** próxima ação plausível (NÃO execute — apenas sugira)

Regras:
- **NÃO** escreva código, **NÃO** modifique arquivos, **NÃO** crie commits
- Se algum passo falhar (pasta/arquivo inexistente, pull com conflito), reporte no resumo em vez de tentar resolver
- Se houver conflito de merge no pull, pare e avise — não tente resolver sozinho
