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
`status: (dados.status as string) || 'rascunho'`.

**CAUSA RAIZ FECHADA (17/05):** Phase A #1 funcionou em produção e
revelou no Console: `saveExame: FirebaseError: The query requires an
index`. A consulta anti-colisão de ACC (`saveExame` L303-308:
`where('acc','==') + where('dataExame','==')`) **nunca teve índice
composto**. Manual passa por `saveExame` → quebrava. Feegow não (usa
`writeBatch` direto). Fix: índice `acc+dataExame` add em
`firestore.indexes.json` (commit 3fc1a2d) + `firebase deploy --only
firestore:indexes` (17/05, via service account, sem --force) →
índice confirmado no Firebase. **Bug 1 encerrado.**

Hardening opcional pendente (decisão Dr. Sérgio): trocar a consulta
por `where('acc','==')` só + filtro de data em memória → nunca mais
depende de índice composto.

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

## Bug 7 — Editar paciente apagava CPF/telefone  ✅ CORRIGIDO (aa27b2d)

Observado pelo Dr. Sérgio (17/05). `editarPaciente` fazia
`setPacCpf('')`+`setPacTel('')` (suposição errada no comentário: "CPF
não está no exame"). Mas o exame **tem** `cpf` (gravado no cadastro,
manual e Feegow). Ao Salvar, `savePaciente` (updateDoc) regravava
`cpf:''`/`telefone:''` por cima da ficha do paciente → **perda de
dado**. CPF = chave de pareamento DICOM/Orthanc. Confirmado com dado
real (cadastro de hoje tinha cpf/tel salvos; só a edição não exibia).

Fix: **7a** `editarPaciente` carrega `item.cpf`; **7b** novo
`getPaciente()` (firestore.ts) busca a ficha p/ CPF+telefone reais
(async, modal já abre); **7c** `handleSalvarPaciente` não inclui
cpf/telefone vazios no `pacData` → `updateDoc` não zera o existente.
`savePaciente` só tem 1 caller (Worklist) — fix localizado seguro.

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
| **#7** | Editar paciente apagava CPF/telefone (7a+7b+7c) | ✅ FEITO aa27b2d |

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

## Sessão 17/05 — design D+E, modelo de dados, arquitetura

### Modelo de 2 eixos (decidido c/ Dr. Sérgio)
Escopo e custo são **independentes**:

| Campo | Escopo | Custo edição |
|---|---|---|
| CPF | 🗂️ Paciente (a "pasta") | 🔒 1 crédito |
| Nome | 🗂️ Paciente | 🔒 1 crédito |
| Data nascimento | 🗂️ Paciente | 🔒 1 crédito |
| Data do exame | 📄 Por exame | 🔒 1 crédito |
| Médico solicitante | 📄 Por exame | 🟢 grátis |
| Convênio | 📄 Por exame | 🟢 grátis |

### D + E — plano final (escolhas A+A) — ⏳ aguarda "pode codar" do Dr. Sérgio
- **D**: reescrever as 2 caixas em `SidebarLaudo.tsx` (275-296, FEEGOW e
  não-FEEGOW) com texto verdadeiro: identidade 🔒 (Desbloquear=1 crédito),
  convênio/solicitante corrigíveis aqui sem custo, "editar no Feegow NÃO
  atualiza este exame" (não há auto-sync — confirmado no código).
- **E**: convênio+solicitante editáveis em emitido, **sem crédito**, **regera PDF**:
  - E1 `SidebarLaudo.tsx` 302-303: tirar `disabled={idBloqueado}`+🔒 só de
    convênio/solicitante (nome/datas 297-300 continuam travados).
  - E2 `page.tsx`: `handleCorrigirLaudo()` + botão "💾 Salvar correção (sem custo)"
    visível só se emitido e mudou.
  - E3 **novo** `/api/corrigir-laudo/route.ts`: update `exame.convenio`+
    `exame.solicitante` (topo) + regera PDF + log `correcao_admin`. SEM billing.
  - E4 extrair `gerarESalvarPdf` de `/api/emitir` → `src/lib/pdf-server.ts`
    (1 pipeline; os 2 endpoints importam).
- **D+E saem juntos** (mensagem precisa bater com o comportamento).

### Decididos (futuro, design dedicado)
- **#8a**: `editarPaciente`/save deve gravar `exame.cpf` também (fonte única).
- **Soft-delete** de laudo emitido: arquiva (auditoria), some do Histórico.
- **ACC no Histórico**: coluna informativa (NÃO copiável).
- **#9 ficha-identidade no Histórico** (acesso = equipe): abre ficha (não laudo);
  nome/CPF/datas com 🔒 → clica cadeado → msg custo (1 crédito); resto grátis.
- **#10 re-associar exame**: no modelo CPF-pasta **vira a própria edição
  travada do CPF** (não precisa operação especial). Per-exame → não corrompe
  histórico dos outros.
- **#6** reconciliar Feegow · **#8b** Wader reescrever `.wl` (deploy manual).

### Direção arquitetural (diagnóstico honesto)
Problema-raiz transversal: **dado duplicado sem fonte única + sem
reconciliação** (convênio, CPF, identidade). Não é rewrite — consolidação
incremental (Phase B já fez convênio=fonte-única; CPF a seguir). Norte:
"1 dado = 1 dono" + identidade ancorada em **CPF** (modelo CPF-pasta).
Avaliação: produto real/valioso, motor muito bem feito, dívida
arquitetural conhecida e tratável (~7/10).

### Perguntas abertas do modelo CPF-pasta
1. Paciente sem CPF (estrangeiro) → chave de fallback (feegowId/id).
2. Doc `paciente` vira cache? Verdade = exame agrupado por CPF.
3. Nome divergente entre exames do mesmo CPF → política a definir.

## Diagnóstico (scripts untracked, raiz do repo — não commitar)
`check-bug-cadastro.cjs`, `check-convenio-carotidas.cjs`,
`check-feegow-appoints.cjs`, `check-manoel-full.cjs`,
`check-feegow-status.cjs`, `check-feegow-status2.cjs`,
`check-migracao-convenio-dryrun.cjs`, `migrar-convenio-5c.cjs`,
`teste-cadastro-cancelar.cjs`.
