# 2026-05-16 — Bugs: cadastro manual sumindo + convênio duplicado + reconciliação Feegow

Sessão com Dr. Sérgio (Claude notebook). Diagnóstico data-backed (Firestore +
API Feegow reais). **Ler antes de mexer em Worklist / cadastro / convênio.**

## Bug 1 — Cadastro manual não ia pro worklist  ✅ CORRIGIDO (Fase A, commit 3f405dd)

Causa (provada — nenhum exame `origem=MANUAL` ou criado hoje no Firestore):
- `Worklist.tsx > handleSalvarPaciente`: ignorava o retorno de `saveExame`.
  Se falhava (retorna `null`), o modal fechava como sucesso → médico achava
  que cadastrou, exame nunca criado, **sem aviso**. Feegow funciona porque
  usa `writeBatch` direto (não passa por `saveExame`).
- `firestore.ts > saveExame`: `status:'rascunho'` fixo **depois** de `...dados`
  → sobrescrevia o `status:'aguardando'` do cadastro manual.

Fix aplicado: tratar `saveExame` vazio (erro + modal aberto, 2 ramos);
`status: (dados.status as string) || 'rascunho'`. Causa raiz exata da
falha do `saveExame` ainda desconhecida — a Fase A faz ela **aparecer**
(erro na tela + Console F12) na próxima tentativa.

## Bug 2 — Convênio: campo DUPLICADO (causa raiz provada)

`exame.convenio` (topo) ≠ `exame.medidas.convenio` (aninhado). Manoel real:
topo `""`, `medidas.convenio="PARTICULAR"` (Dr. Sérgio digitou na confecção).

| Campo | Lido por |
|---|---|
| `exame.convenio` (topo) | Worklist + Extrato/faturamento |
| `exame.medidas.convenio` | Laudo (tela + PDF) — load aplica `medidas` primeiro |

**Arma do crime:** `app/laudo/[id]/page.tsx` **linha ~616** —
`convenio: (exame?.convenio as string) || ''` em `dadosFinais` sobrescreve
o `...identificacao` (valor do DOM) com o valor stale do exame carregado.
Load: linhas ~416-432 (aplica `medidas`, fallback topo só "se vazio").
`coletarMedidas` (linha ~441) inclui `'convenio'` → duplica em `medidas`.

Carótidas sem convênio = **dado do Feegow, NÃO bug LEO**: o agendamento
de Carótida no Feegow tem `convenio_id` null (só o Eco tem id=3 UNIMED).

## Status possíveis no Feegow (oficial, `/appoints/status`, 11)

| id | status | id | status |
|---|---|---|---|
| 1 | Marcado - não confirmado | 7 | Marcado - confirmado |
| 2 | Em atendimento | 11 | Desmarcado pelo paciente |
| 3 | Atendido (**LEO seta isso ao emitir**) | 15 | Remarcado |
| 4 | Aguardando (LEO importa só este) | 22 | Cancelado pelo profissional |
| 5 | Chamando | 208 | Aguardando pagamento |
| 6 | Não compareceu | | |

Uso real 01–16/05 (388 ag.): 315 Atendido, 28 (1), 21 NãoCompareceu,
10 Desmarcado, 7 Aguardando, 6 (7), 1 Remarcado.

## Plano de fases (decidido com Dr. Sérgio)

| Fase | Itens | Status |
|---|---|---|
| **A** | #1 erro visível no cadastro · #2 status correto | ✅ FEITO 3f405dd |
| **B** | #5a apagar page.tsx L616 · #5b tirar 'convenio' de coletarMedidas | ✅ FEITO 5e0ce8e |
| **C** | #5c migração: `medidas.convenio`→topo onde topo vazio | ✅ APLICADO 17/05 — 2 docs (Manoel→PARTICULAR, Ana→UNIMED), marcador `_migracaoConvenio` (reversível, `medidas.convenio` intacto) |
| D | #4 trocar texto "corrija no Feegow" (SidebarLaudo L279-281) | ⏳ |
| E | #3 editar convênio/solicitante em emitido (só esses 2; nome/datas 🔒; **sem crédito** = caminho novo, NÃO /api/emitir que sempre cobra; regerar PDF) | ⏳ discutir |
| #6 | Reconciliar Feegow no clique "🔗 Feegow" | ⏳ futuro |

**#6 regra (segura):** só `origem=FEEGOW` + só `status LEO=aguardando`;
status Feegow {6,11,22,15} → marcar `nao-realizado` (NÃO apagar);
{2,3,5} → não mexer (3 é o próprio LEO); nunca "≠4 → remover".

## Teste 17/05 (data-layer, Firestore real) — 6/6 PASS

`teste-cadastro-cancelar.cjs`: 2 simulações (Feegow + Manual). Cada uma:
cria → aparece na query exata do `listenWorklist` → cancela (=`deleteDoc`,
igual `removerDaFila`) → some. + checa que status manual = 'aguardando'
(fix #2). Docs marcados `_teste`, auto-limpos. **Não cobre** a UI do
`handleSalvarPaciente` (#1 silent-fail) — validar com cadastro manual
real na clínica.

## Diagnóstico (scripts untracked, raiz do repo — não commitar)
`check-bug-cadastro.cjs`, `check-convenio-carotidas.cjs`,
`check-feegow-appoints.cjs`, `check-manoel-full.cjs`,
`check-feegow-status.cjs`, `check-feegow-status2.cjs`,
`check-migracao-convenio-dryrun.cjs`, `migrar-convenio-5c.cjs`,
`teste-cadastro-cancelar.cjs`.
