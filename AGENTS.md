<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Dual Claude

Pode existir outra sessão de Claude trabalhando neste projeto em paralelo (Sergio usa Claude no notebook + Claude na PC clínica MedCardio). Antes de modificar código ou tomar decisão arquitetural, **lê `docs/dual-claude-protocolo.md`** e **conferir `docs/decisoes/`** (se existir).

Resumo do protocolo: commit + push após cada edit; decisões importantes vão pra `docs/decisoes/AAAA-MM-DD-titulo.md`; memória local (`~/.claude/...memory/`) é per-máquina, não compartilha via git.
