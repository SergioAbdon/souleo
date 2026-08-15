# Sub-plano 4: Seção Pacientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Escrito 15/08 para execução em NOVA SESSÃO — o prompt de abertura está em `docs/planos/2026-08-15-prompt-sessao-plano4.md`.

**Goal:** A seção 👥 Pacientes que o Sergio pediu: busca por nome/CPF → ficha do paciente → linha do tempo de TODOS os exames dele (qualquer modalidade), com PDFs e ações — sobre dados que JÁ existem no banco.

**Architecture:** Tela nova sobre APIs prontas: `getPacientes(wsId)` (lista ordenada por nome), `getPaciente`, `getExames(wsId, pacienteId)` (timeline desc — índice `pacienteId+dataExame` JÁ EXISTE em `firestore.indexes.json:46-53`), `savePaciente` (regra: membro edita). Reusa `StatusPill`, `PageHeader`, tokens V7 e o catálogo `tiposLaudo` (rótulos + dispatch por modalidade). **ZERO mudança de regra/índice → sem publicação; deploy é só código.**

**Tech Stack:** o existente. Nada novo.

## Global Constraints

- Branch `feat/reestruturacao-plataforma` (atual); sem stash; commit+push por task; verificação com conta Gmail PJ (NUNCA Yahoo).
- Motor e Direx intocáveis. `/laudo/[id]` e `/laudo-texto/[id]` não mudam — a ficha só NAVEGA pra eles.
- Privacidade: a ficha mostra dados reais de pacientes — nenhum dado de paciente em URL query (usar path `/pacientes/{id}`), nenhum log de dados pessoais no console.
- Tokens V7 obrigatórios (`bg-card`, `border-borda`, `text-ink*`, `bg-p2`, `bg-ativo`…); zero hex hardcoded.
- Papéis: TODOS os membros veem Pacientes (mesma visão da fila — D7); edição de cadastro segue a regra existente de `pacientes` (membro edita).
- Ledger em `.superpowers/sdd/progress.md` (seção nova "Sub-plano 4"), esteira: implementador por task + revisor + revisão final de branch.

---

### Task 1: Nav + rota `/pacientes` com busca e lista

**Files:**
- Modify: `src/lib/nav.ts` (item `{ href: '/pacientes', rotulo: 'Pacientes', icone: '👥' }` entre Agenda e Laudos)
- Modify: `tests/unit/nav.test.mjs` (todos os papéis veem /pacientes)
- Create: `src/app/(plataforma)/pacientes/page.tsx`

**Contrato da página:**
- `getPacientes(wsId)` no mount (client). Busca client-side: input único filtra por nome (case-insensitive) OU CPF (só dígitos — mesmo padrão da busca da Worklist pós-S2-T8).
- Tabela: Nome · CPF (mascarado `***.***.***-NN` — só os 2 últimos dígitos visíveis na LISTA; a ficha mostra completo) · Nascimento · Telefone · ação "Abrir ficha" → `router.push('/pacientes/' + id)`.
- Vazio: estado "Nenhum paciente ainda — eles entram automaticamente pelo cadastro da Agenda".
- `PageHeader titulo="Pacientes"`; card branco padrão; `overflow-x-auto` na tabela.

- [ ] Steps: teste nav (falha→passa) → página → `npx tsc --noEmit` + `npm run test:unit` → commit `feat(pacientes): secao com busca por nome/CPF` + push.

---

### Task 2: Ficha do paciente `/pacientes/[id]` com linha do tempo

**Files:**
- Create: `src/app/(plataforma)/pacientes/[id]/page.tsx`

**Contrato:**
- Carrega `getPaciente(wsId, id)` + `getExames(wsId, id)` (já ordenado `dataExame desc`).
- Cabeçalho da ficha: nome, CPF completo, nascimento (com idade calculada), sexo, telefone, convênio; botão "✏️ Editar cadastro" (Task 3).
- **Linha do tempo**: um card por exame — data (dd/mm/aaaa), tipo (rótulo do catálogo `tiposLaudo`, fallback id cru), `<StatusPill status={...} />`, ACC (mono), e ações por estado:
  - `emitido` + `pdfUrl` → "🖨️ Abrir PDF" (`abrirPdfUrl`);
  - `emitido` sem pdfUrl / `rascunho` / `andamento` → "Abrir laudo" com dispatch por modalidade (texto → `/laudo-texto/`, senão `/laudo/`) — resolver a modalidade pelo catálogo carregado 1x (`getDocs tiposLaudo`, fallback `TIPOS_LAUDO_PADRAO`);
  - `aguardando` → sem ação de laudo (paciente ainda na fila) — link "Ver na Agenda" (`/agenda`);
  - `nao-realizado` → só a pílula (POLÍTICA da sessão 09/05: histórico do paciente NÃO mostra não-realizados → **FILTRAR fora da timeline**; manter contagem discreta "N não realizados nos últimos 30 dias" no rodapé da ficha, sem lista).
- Paciente inexistente → "Paciente não encontrado" + voltar.
- Timeline vazia → "Nenhum exame registrado".

- [ ] Steps: página → tsc → verificação no preview (ficha de paciente real da conta teste) → commit `feat(pacientes): ficha com linha do tempo de exames` + push.

---

### Task 3: Editar cadastro na ficha (reuso do fluxo da Worklist)

**Files:**
- Create: `src/components/pacientes/EditarPacienteModal.tsx`
- Modify: `src/app/(plataforma)/pacientes/[id]/page.tsx` (plugar o modal)

**Contrato:**
- Modal com os MESMOS campos do modal da Worklist (nome, CPF, nascimento, sexo, telefone, convênio) e as MESMAS defesas: CPF vazio = "não mexer" (filosofia #7c), `savePaciente` com `atualizadoEm`.
- NÃO toca nos exames (a ficha é cadastro; propagação de CPF pra exame é do fluxo da fila, já resolvido na S2-T3).
- Guard de corrida não precisa (a ficha carrega 1 paciente por rota — sem troca de contexto).
- Ao salvar: recarrega a ficha.

- [ ] Steps: modal → tsc → preview (editar telefone de paciente de teste e reverter) → commit `feat(pacientes): editar cadastro na ficha` + push.

---

### Task 4: Ponte Agenda→Ficha (link no nome do paciente)

**Files:**
- Modify: `src/components/Worklist.tsx` (nome do paciente na tabela vira link pra `/pacientes/{pacienteId}` quando `pacienteId` existe — senão texto puro como hoje)

- [ ] Steps: 1 edit → tsc + `npm run test:unit` → commit `feat(agenda): nome do paciente linka pra ficha` + push.

---

### Task 5: Fechamento

- [ ] Bateria completa (unit + rules + api + tsc + build) — nada de regra mudou: rules/api devem manter 118/83.
- [ ] `npm run test:e2e` (Playwright da etapa 3) se o storageState existir — os specs antigos não podem quebrar com o link novo da Agenda.
- [ ] Revisão FINAL da branch (visão de conjunto; atenção: exposição de dados pessoais — CPF mascarado na lista? nada em query string? nada em console.log?).
- [ ] Merge master + deploy + verificação (/pacientes 200, ficha carrega, timeline com filtro de não-realizados) + ledger/roadmap/Obsidian/memória.
- [ ] SEM publicação de regra e SEM migração — deploy é só código (menor risco do sprint).

**Estimativa: ~4–5h de esteira (T1 1h · T2 1,5h · T3 45min · T4 15min · T5 1h).**
