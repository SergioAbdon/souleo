# Reestruturação do LEO — Roadmap de Sub-planos (5 dias)

**Spec:** `docs/superpowers/specs/2026-08-13-reestruturacao-leo-design.md` (aprovada pelo Sergio 13/08)
**Branch única:** `feat/reestruturacao-plataforma` (a partir de `feat/secao1-plano2b-b2`)
**Regra:** sub-planos 2–7 são escritos just-in-time (quando o anterior fecha), no padrão bite-sized, e executados com `superpowers:subagent-driven-development`. Publicação de regras Firestore: UMA vez, com confirmação do Sergio, antes do merge (regras aditivas primeiro).

| # | Sub-plano | Entrega | Depende de | Dia alvo | Status |
|---|-----------|---------|------------|----------|--------|
| 1 | **Fundação/Shell** | Tokens V7 em `globals.css` + shell `(plataforma)` com sidebar branca + rotas `/agenda` `/laudos` `/financeiro` `/clinica` (telas atuais dentro, sem redesign interno) + `/dashboard`→redirect + drawer responsivo | — | 1 | **PLANO PRONTO** (`2026-08-13-plano1-fundacao-shell.md`) |
| 2 | Agenda + Seção 2 | Migração visual da Worklist pro padrão novo + execução do plano de correção já revisado pela tríade (`docs/planos/2026-08-12-plano-correcao-secao2-worklist.md` — 12 tarefas: recepção destravada, corridas CPF/ACC, import Feegow no servidor) | 1 | 2 | plano v2 pronto; adaptação de anchors pós-shell |
| 3 | Catálogo de tipos de laudo | `tiposLaudo/{id}` + seed (eco/carótidas/ecg/mapa/holter/ergométrico) + subseção Clínica→Tipos de laudo + fluxo laudo `texto` (TipTap c/ modelo) e `pdf` (anexo via rota server) + regra+teste | 1 | 3 | a escrever |
| 4 | Pacientes | `/pacientes`: busca nome/CPF + ficha + linha do tempo dos exames (dados existentes) | 1 | 3–4 | a escrever |
| 5 | Integrações | `/integracoes`: cartões Feegow/Orthanc/Wader com estado, testar conexão, credencial write-only, mapeamentos migrados do LocalModal | 1 | 4 | a escrever |
| 6 | Clínica completa | Subseções viram páginas de verdade (Dados do local, Equipe, Plano & franquia) — conteúdo dos modais LocalModal/PerfilModal reorganizado | 1, 3 | 4–5 | a escrever |
| 7 | Login/cadastro + fechamento | Pele nova em `/login` e `/convite/[token]` + tríade da reestruturação inteira + bateria completa + publicar regras (confirmação Sergio) + deploy | 1–6 | 5 | a escrever |

**Fora do sprint (Fase 2, nomeada na spec §8):** motor de carótidas portado, ECG estruturado, 2º motor no registry, dark mode, Direx nos componentes novos, comparativo seriado, pacientes cross-local, landing pública, cofre `privado/` completo, WhatsApp/TISS.

**Decisão pendente do Sergio (bloqueia só o Sub-plano 3):** exame por PDF anexado consome franquia? Default proposto: SIM.
