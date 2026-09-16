# Revisão da Seção 2 — Worklist (agenda do dia)

**Data:** 12/08/2026 · **Status:** ✅ **FECHADA** — 22 de 22 achados corrigidos.

Achados 1-15 e 17-22 saíram no plano de correção (`2026-08-12-plano-correcao-secao2-worklist.md`,
12 tarefas), executado no Sub-plano 2 da reestruturação (regras 8a2d6730, merge e2804a5, 15/08).
O achado 16 não entrou em tarefa nenhuma na época e ficou aberto até 19/08 — fechado no commit
`7d67796` (whitelist espelhada em `src/lib/campos-exame.ts` + teste que lê `firestore.rules` e
falha se divergir + `soAdministrativos()` nas escritas do cliente).
**Método:** leitura do fluxo de ponta a ponta (Worklist.tsx → firestore.ts → firestore.rules → /api/exame → cron) + tríade (Codex = bugs/segurança com verificação adversarial · revisor de arquitetura/fronteiras · Ponytail = o que cortar). Codex confirmou os 8 candidatos levantados na leitura inicial e achou 6 bugs novos.

**Contexto:** o código da Worklist é ANTERIOR à fechadura da Seção 1 (regras publicadas 10/08). Vários achados são exatamente esse desalinhamento: a tela ainda opera com premissas do modelo antigo.

---

## ONDA 1 — Quebra o fluxo diário da clínica (fazer primeiro)

### 1. [ALTO] Exame cadastrado pela recepção fica "preso" à secretária
- `Worklist.tsx:273` (manual), `:429` (Feegow), `firestore.ts:326`, `firestore.rules:161-164`
- `saveExame` grava `medicoUid` em TODA criação com o uid de quem está logado. Se a secretária (papel recepcao) cadastra, o exame nasce com `medicoUid` = secretária → a regra de update (`medicoUid == uid` ou ausente) NEGA o médico salvar medidas no rascunho. O "exame sem autor que qualquer médico assume" (previsto na própria regra, linha 152) nunca acontece, porque o campo nunca fica ausente.
- Agravante: `medicoExecutor` e `solicitante` também recebem o NOME da secretária (`:270`, `:424-425`).
- O sintoma só aparece em rascunho/andamento (o /api/emitir usa Admin SDK e "conserta" na emissão) — fácil passar em teste rápido, certo de estourar em produção.
- **Fix mínimo:** na criação, só gravar `medicoUid`/`medicoExecutor` quando quem cria é médico de perfil (`ehMedico`); senão omitir os campos.

### 2. [ALTO] Recepção não consegue usar o botão "👤 Editar"
- `Worklist.tsx:668-684`, `firestore.rules:161-170`
- A regra de update de /exames só tem caminho pra médico-autor ou dono. Papel recepcao não tem ramo nenhum → editar convênio/nome pela secretária = `permission-denied`.
- **Fix mínimo:** ramo de update pra recepcao restrito a `affectedKeys().hasOnly(camposAdministrativos())` E exame não-emitido. **Regra + código no MESMO commit, com teste de payload real** (`tests/rules/fixtures.mjs`) — regra de ouro do projeto.

### 3. [ALTO] Mensagem "Nada foi gravado" mente — a ficha JÁ mudou
- `Worklist.tsx:223-253`, `firestore.ts:259-271`
- Na edição, `savePaciente` grava a ficha primeiro; se `saveExame` falhar depois (ex.: achado 2), a tela diz "Nada foi gravado", mas ficha e worklist já divergem.
- **Fix mínimo:** operação composta atômica (batch) ou, no mínimo, mensagem honesta sobre estado parcial.

### 4. [ALTO] Cron destrutivo fica público se `CRON_SECRET` faltar
- `cleanup-worklist/route.ts:23-32`
- `if (CRON_SECRET)` = fail-open: deploy sem a env var → endpoint público com Admin SDK varrendo todos os workspaces.
- **Fix mínimo:** falhar fechado — sem secret configurado, retorna erro e não executa.

---

## ONDA 2 — Integridade de dados do paciente (CPF é a chave DICOM)

### 5. [ALTO] Corrida no modal de edição pode misturar dois pacientes
- `Worklist.tsx:188-213` — abrir "Editar" de Alice dispara `getPaciente` assíncrono; fechar e abrir Bruno antes da resposta → CPF/telefone de Alice caem no modal de Bruno. Salvar grava CPF de Alice em Bruno.
- **Fix mínimo:** guardar o `pacienteId` da requisição e só aplicar a resposta se ainda for o paciente do modal.

### 6. [ALTO] Corrida na busca de CPF no Feegow → identidade híbrida
- `Worklist.tsx:167-185` — digitar CPF A, corrigir pra B rápido; se A responder por último, nome/nascimento/sexo de A + CPF B no mesmo cadastro.
- **Fix mínimo:** conferir se o CPF pesquisado ainda é o CPF do campo antes de aplicar (ou AbortController).

### 7. [ALTO] Colisão de ACC entre máquinas continua possível
- `firestore.ts:301-322`, `gerarAccessionNumber.ts`, `Worklist.tsx:384-436`
- O cinto anti-colisão é ler-depois-escrever SEM transação (duas máquinas passam juntas na checagem) e a importação Feegow (writeBatch) nem passa por ele. Contador é por aba. Wader pode parear estudo DICOM com exame errado.
- Ponytail sugeriu deletar o cinto; arquitetura sugeriu torná-lo transacional. **Decisão da síntese: trocar por `runTransaction`** (fecha a janela sem infra nova) — deletar deixaria o furo multi-máquina aberto e o pareamento DICOM depende disso.

### 8. [MÉDIO] CPF corrigido não propaga pro exame
- `Worklist.tsx:222-248` — edição atualiza a ficha, mas o payload do `saveExame` não inclui `cpf` → exame segue com CPF antigo (chave de pareamento do Wader).
- **Fix mínimo:** incluir `cpf: cpfLimpo` no update do exame.

### 9. [MÉDIO] Limites de batch do Firestore estouram silenciosamente
- Import Feegow: 2 escritas por paciente → >250 pacientes = commit inteiro rejeitado (`Worklist.tsx:384-436`).
- Cron: >500 exames vencidos num workspace = batch rejeitado, e a resposta ainda diz `ok: true` (`cleanup-worklist/route.ts:48-68`).
- **Fix mínimo:** chunking (lotes de ~250/400).

### 10. [MÉDIO] `undefined` pode abortar a importação Feegow inteira
- `Worklist.tsx:398-431` — paciente sem telefone/sexo (`undefined`) em `batch.set` sem `ignoreUndefinedProperties` → batch inteiro lança erro.
- **Fix mínimo:** limpar propriedades `undefined` antes do `set`.

### 11. [MÉDIO] Busca "por CPF" na verdade compara data de nascimento
- `Worklist.tsx:508` — `const cpf = it.pacienteDtnasc`. Buscar CPF nunca funcionou.
- **Decisão do Sergio:** consertar (comparar com `it.cpf`) OU cortar e buscar só por nome (Ponytail). Sugestão: consertar — o campo existe no exame e custa 1 linha.

### 12. [BAIXO] Fuso: 3 implementações de "hoje" divergentes
- `utils.ts` (local do cliente) · `api/feegow/route.ts` (Intl America/Belem — a única certa) · cron (`Date.now()-3h`) · `listenNaoRealizados` (`toISOString()` = UTC, janela errada entre 21h e 00h BRT).
- **Fix mínimo:** mover a `dataLocalHoje()` com `Intl.DateTimeFormat('America/Belem')` pra `src/lib/utils.ts` e usar nos 4 lugares.

### 13. [BAIXO] Timer de espera ignora a data selecionada
- `Worklist.tsx:143-155` — vendo um dia futuro/passado, o timer calcula contra a hora de HOJE ("2h de atraso" pra paciente de amanhã).
- **Fix mínimo:** ocultar o timer quando `dataExame !== dataLocalHoje()`.

---

## ONDA 3 — Fronteiras de arquitetura (alinhar com o modelo da Seção 1)

### 14. Importação Feegow deveria gravar no SERVIDOR
- `/api/feegow` já autentica, busca e monta a lista no servidor — e devolve pro navegador só pra ele fazer o writeBatch. Mover as ~60 linhas do batch pra dentro do handler existente: ganha auditoria (`logAction`), ACC consistente e simetria com apagar/cancelar/transferir. Resolve também os achados 9 e 10 no caminho Feegow.

### 15. MWL Orthanc: falha silenciosa vira estado invisível
- `Worklist.tsx:30-49` — se o envio falha, o rastro é um console.warn. Exame fica na fila sem worklist no aparelho e ninguém sabe.
- **Fix mínimo:** gravar `mwlStatus: 'enviado'|'falhou'` no exame (o dado já está em mãos) + indicador na linha da tabela.

### 16. Whitelist `camposAdministrativos()` sem teste de sincronia — ✅ FECHADO 19/08 (`7d67796`)
- A lista na regra é mantida à mão vs o que o TS escreve. Campo novo só na Worklist = quebra silenciosa pra recepção.
- **Fix mínimo:** exportar `CAMPOS_EXAME_ADMINISTRATIVOS` no TS + teste `node --test` que compara com a regra. Desalinhamento vira erro de CI, não incidente.

---

## ONDA 4 — Cortes Ponytail (menos código, menos custo)

| # | Local | Corte |
|---|-------|-------|
| 17 | `Worklist.tsx:538` | Botão "📋 Laudo rápido" = mesmo handler do "+ Paciente". Cortar. |
| 18 | `Worklist.tsx:340,360,372` | Dedup legado por nome + ramo `semAppt`: `/api/feegow` SEMPRE preenche `feegowAppointId` — caminho morto, ~15 linhas. |
| 19 | `cleanup-worklist/route.ts:12-21` | Init do firebase-admin copiado na mão (projectId hardcoded). Usar `adminDb()` de `auth-admin.ts`. |
| 20 | `Worklist.tsx:129-135` | `listenNaoRealizados` (30 dias) assinado em todo mount. Assinar só quando a aba "Não realizados" abrir. |
| 21 | `Worklist.tsx:263,286` | `pacCpf.replace(/\D/g,'')` recalculado — `cpfLimpo` já existe. |
| 22 | `Worklist.tsx:51-56` | Tipo `ExameItem` decorativo (código casta na mão mesmo assim). Completar ou aceitar o Record. |

**Índices:** conferidos — `acc+dataExame`, `dataExame+horarioChegada` e `status+dataExame` existem em `firestore.indexes.json`. Nada a fazer.
**XSS:** não encontrado (React escapa por padrão).

---

## Ordem sugerida de implementação
1. **Onda 1** (4 itens) — destrava o dia a dia da secretária e fecha o cron. Itens 1+2+3 são um pacote só (mesmo fluxo). Item 2 mexe em REGRA → teste com payload real no mesmo commit.
2. **Onda 2** (itens 5-8 primeiro — CPF/ACC são a chave DICOM).
3. **Onda 3 item 14** junto com os itens 9/10 (migrar o batch pro servidor já resolve os dois).
4. **Onda 4** entra de carona nos commits que já tocarem cada arquivo.
