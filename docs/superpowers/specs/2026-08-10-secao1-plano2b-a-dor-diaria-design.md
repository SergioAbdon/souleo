# Plano 2B-A — Dor diária (seletor de local, papéis na tela, aviso de conta sem local)

> **Status:** ✅ Design aprovado pelo Dr. Sérgio (10/08/2026). Implementação não iniciada.
> **Antecede:** Plano 2B-B (comercial — cadastro PJ + convite por link), fora deste spec.
> **Depende de:** Plano 2A (fechadura definitiva publicada, modelo de contas, `auth-admin.ts`).
> **Ler antes de mexer em:** `src/contexts/AuthContext.tsx`, `src/components/Worklist.tsx`,
> `src/components/Historico.tsx`, `src/components/Extrato.tsx`, `src/app/dashboard/page.tsx`,
> `src/app/api/corrigir-laudo/route.ts`.

---

## 1. Contexto e problema

O Plano 2A fechou a fundação (modelo de contas) e publicou a fechadura definitiva.
Sobrou a camada de **uso diário multiusuário**, que hoje tem três buracos concretos:

1. **Login sem aviso.** Entrar numa conta que não alcança nenhum local (ex.: a conta
   PJ de teste) mostra **fila vazia sem explicação** — foi o incidente de 10/08, que
   pareceu "Feegow quebrado" quando era só a conta errada.
2. **Sem seletor único de local.** Com 2+ locais, a Worklist fica vazia (nada chama
   `selecionarContexto`); Histórico e Extrato têm cada um seu `wsIdSel` isolado, que
   reseta ao trocar de aba e não conversam entre si.
3. **Papel não governa a tela.** A Worklist decide "é médico?" por
   `membership.role === 'medico'`. A migração da Seção 1 gravou o vínculo do Dr. Sérgio
   como `papel: 'dono'` — então **o botão "Editar" de laudo emitido já está sumido na
   clínica hoje**, um bug vivo. E a recepção (Josilene, a partir de 11/08) vê itens que
   a fechadura vai negar de qualquer forma.

Fonte das permissões: matriz §4 de `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md`.

## 2. Decisões (aprovadas com o Dr. Sérgio, 10/08)

| # | Decisão |
|---|---|
| A1 | **Local é contexto de sessão, escolhido ao entrar** (não persiste entre logins). Ao relogar, pergunta de novo se houver 2+ |
| A2 | **Fluxo de entrada unificado:** 0 locais → tela de aviso "conta sem local"; 1 local → entra direto; 2+ → telinha "em qual local você está hoje?" |
| A3 | **Seletor no topo** (só com 2+ locais) troca o local ativo em TODAS as telas de uma vez |
| A4 | **Papéis escondem o que não podem** (não mostram bloqueado). A fechadura no banco continua a trava real |
| A5 | **Gate de assinar/editar laudo = `tipoPerfil === 'medico'` + autoria** — não o papel administrativo. Corrige o botão sumido do dono-médico |
| A6 | **`AuthContext` é a fonte única do local ativo.** Histórico e Extrato perdem o `wsIdSel` privado e leem do contexto |
| A7 | **`/api/corrigir-laudo` ganha auth** (token + papel), fechando a última rota aberta. Validação de CRM fica pro Plano 2B-B |

## 3. Arquitetura

```
AuthContext (fonte única)
 ├── contextos[]        (já existe: um por local acessível)
 ├── localAtivo         (NOVO: o contexto escolhido para a sessão)
 ├── precisaEscolher    (NOVO: 2+ locais e nenhum escolhido ainda)
 ├── semLocal           (NOVO: 0 locais acessíveis)
 └── selecionarLocal(wsId)  (NOVO: troca o local ativo)

Telas (Worklist, Historico, Extrato, Dashboard)
 └── leem workspace/papel/perfil do contexto; NÃO guardam wsIdSel próprio

lib/permissoes.ts (NOVO — helper puro, testável, sem Firestore)
 └── podeEditarLaudo / podeVerFinanceiro / podeEditarLocal / podeGerenciarMembros / ...
```

**Por que estender o `AuthContext` em vez de um provider novo:** ele já tem
`contextos[]`, `workspace`, `membership` e `selecionarContexto`. Um `LocalContext`
separado duplicaria o estado de sessão e criaria duas fontes de verdade para "qual
local". A extensão é o menor diff que resolve — mesma razão do Caminho A da Seção 1.

### 3.1 Módulos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/permissoes.ts` (criar) | Funções puras `pode*(papel, perfil, exame?, uid?)` — a matriz §4 em código, sem I/O. Fonte única de "quem vê/faz o quê" na UI |
| `src/contexts/AuthContext.tsx` (modificar) | Ganha `localAtivo`, `precisaEscolher`, `semLocal`, `selecionarLocal`. Auto-seleciona com 1 local; não auto-seleciona com 2+ |
| `src/components/SeletorLocal.tsx` (criar) | O seletor do topo (só renderiza com 2+ locais). Chama `selecionarLocal` |
| `src/components/EscolherLocalGate.tsx` (criar) | Barreira pós-login: renderiza a tela "qual local hoje?" (2+) ou "conta sem local" (0); deixa passar quando há local ativo |
| `src/app/dashboard/page.tsx` (modificar) | Monta o `SeletorLocal` no topo e envolve o conteúdo no `EscolherLocalGate` |
| `src/components/Worklist.tsx` (modificar) | Lê local do contexto; `ehMedico`/botões via `permissoes.ts`; some o `wsIdSel` implícito |
| `src/components/Historico.tsx` (modificar) | Remove `wsIdSel` próprio → lê do contexto; botões via `permissoes.ts` |
| `src/components/Extrato.tsx` (modificar) | Remove `wsIdSel` próprio → lê do contexto; gate de acesso via `permissoes.ts` |
| `src/app/api/corrigir-laudo/route.ts` (modificar) | `requireUid` + `resolverPapel` (de `auth-admin.ts`/`exame-admin.ts`, do 2A); 401/403 |

## 4. Fluxos

### 4.1 Entrada (A2)

```
onAuthStateChanged resolve os contextos (já existe)
  ├── 0 contextos  → semLocal = true      → EscolherLocalGate mostra "conta sem local"
  ├── 1 contexto   → selecionarLocal(único) → entra direto
  └── 2+ contextos → precisaEscolher = true → EscolherLocalGate mostra "qual local hoje?"
```

A escolha vive só em memória do `AuthContext` (estado React). Reload/relogin
recomeça o fluxo — coerente com A1 (contexto de sessão). **Não** usa localStorage.

### 4.2 Papéis na tela (A4/A5)

Cada tela pergunta a `permissoes.ts` antes de renderizar ação/seção:

| Função | Regra (matriz §4) |
|---|---|
| `podeEditarLaudo(perfil, exame, uid)` | `perfil.tipoPerfil === 'medico'` **e** (`exame.medicoUid === uid` ou exame sem autor) |
| `podeVerFinanceiro(papel)` | `papel` ∈ {dono, medico} |
| `podeEditarLocal(papel)` | `papel === 'dono'` |
| `podeGerenciarMembros(papel)` | `papel === 'dono'` |
| `podeRemoverDaFila(papel)` | `papel` ∈ {dono, medico} (recepção não — P4 do 2A) |

`tipoPerfil` ausente conta como `'medico'` (default do resto do app; mesma lição do
apagão de cadastro de 09/08 — não travar perfis antigos sem o campo).

### 4.3 `/api/corrigir-laudo` autenticada (A7)

Mesmo padrão do `/api/emitir` pós-2A: `requireUid(req)` → 401 se sem token; resolve
`resolverPapel(db, wsId, uid)` → 403 se não for `dono`/`medico` no local. Atualizar o
callsite do cliente para mandar `Authorization: Bearer`.

## 5. Tratamento de erro

| Situação | Comportamento |
|---|---|
| Conta sem local acessível | Tela explícita + botão "sair e trocar de conta" (não fila vazia) |
| Falha ao resolver contextos (rede/regra) | Mensagem "não foi possível carregar seus locais — tentar de novo", não tela vazia (§6 do ADR da Seção 1) |
| Recepção tenta ação escondida por URL direta | A fechadura nega no banco; a UI só não oferece o caminho |

## 6. Testes

| Alvo | Prova |
|---|---|
| `permissoes.ts` (unitário, `node --test`) | A matriz §4 inteira: dono/médico/recepção × cada ação; dono-não-médico não assina; dono-médico assina; `tipoPerfil` ausente = médico |
| `AuthContext` fluxo de entrada | 0 → semLocal; 1 → auto-seleciona; 2+ → precisaEscolher e nenhum auto-selecionado |
| `/api/corrigir-laudo` (emulador, padrão 2A) | Sem token → 401; recepção → 403; médico do local → 200 |

## 7. Pronto quando

1. Logar na conta PJ vazia mostra "conta sem local", não fila vazia.
2. Com 2+ locais, escolher o local abre a fila daquele local em todas as telas; o seletor do topo troca todas de uma vez.
3. O Dr. Sérgio (dono+médico) volta a ver o botão "Editar" no laudo emitido dele.
4. Recepção não vê Extrato, financeiro nem editar/emitir laudo.
5. `/api/corrigir-laudo` recusa sem token e sem papel.

## 8. Fora deste spec

- **Plano 2B-B (comercial):** cadastro PJ, convite por link, validação de CRM, botão "Cancelar laudo" no Histórico (a rota já existe desde o 2A).
- **Plano 3:** limpeza de código morto e fallbacks legados.
- **Fase 6:** segredos + Wader (Claude da clínica).
