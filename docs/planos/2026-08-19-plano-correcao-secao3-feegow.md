# Correção da Seção 3 (Feegow) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fechar os 22 achados da revisão da Seção 3 — a importação para de corromper dado de paciente, para de falhar em silêncio, e a nuvem para de fingir que alcança o Orthanc.

**Architecture:** Seis doenças, seis remédios (spec `docs/superpowers/specs/2026-08-19-secao3-correcao-design.md`, D1–D6): a rota `/api/orthanc` morre e o estado do Orthanc passa a ser reportado pelo Wader; a identidade do exame importado vira `fg-{agendamento_id}-{dataExame}`; a reconciliação entra na própria importação; toda falha ganha contagem visível; o Wader ganha fonte única de "hoje" em Belém; `montarCandidatos` desce para a camada testável.

**Tech Stack:** o existente. Nada novo.

## Global Constraints

- Branch: criar `feat/secao3-feegow` a partir da master. NÃO usar `git stash`. Commit + push por task.
- Motor (`src/app/laudo/[id]/page.tsx`), `src/components/laudo/**` e Direx: INTOCÁVEIS. O endurecimento do `atualizar_status` é 100% na rota — o corpo que o motor envia não muda.
- Nomes canônicos: `privado/feegow`→`token`; `privado/orthanc`→`user`/`pass` (o Wader continua lendo — salvar/remover credencial do Orthanc CONTINUA existindo); `integracoes/feegow`→`procMap`, `profMap`, `ativo`; `integracoes/orthanc`→`url`, `ativo`, `status`, `ultimoTeste`, `ultimoErro`.
- Nenhum segredo em nenhum caminho de saída (resposta, erro, log, `ultimoErro`).
- Ordem nos handlers: 401 → 400 → 403 → só então segredo. `decidirGetFeegow` roda ANTES do despacho de ação — preservar.
- Tooling: `node --test` não resolve import relativo encadeado entre `.ts` — `feegow-admin.ts` não pode importar outro `.ts` local; helpers novos ficam DENTRO dele.
- Emulador: porta 8080 ocupada → matar o java zumbi. NUNCA trocar a porta.
- Tokens V7, zero hex. Verificação manual: conta Gmail de teste, NUNCA a Yahoo.
- Ledger em `.superpowers/sdd/progress.md`, seção "Correção Seção 3".
- Placar de partida: unit 67, api 140, rules 127, wader vitest 30. `tsc` e build limpos.

## Estrutura de arquivos

| Arquivo | O que acontece |
|---|---|
| `src/lib/feegow-admin.ts` | ganha `montarCandidatos` (movida), `normalizarNascimento`, `cpfValido`, `reconciliarCancelados`; `gravarImportacao` muda identidade + #7c + dedup por CPF |
| `src/app/api/feegow/route.ts` | perde `montarCandidatos` e `PROC_MAP`; importar devolve contagens; `atualizar_status` endurecido; gate de `ativo` |
| `src/app/api/orthanc/route.ts` | **DELETADO** |
| `src/components/Worklist.tsx` | perde `enviarMwlOrthanc`; alert com contagens verdadeiras |
| `src/lib/integracoes-admin.ts` | `executarTeste` recusa orthanc; `CAMPOS_CONFIG.feegow` ganha `profMap` e `ativo`; `testarOrthanc`/`resolverConfigOrthanc` morrem |
| `src/app/(plataforma)/integracoes/page.tsx` | cartão Orthanc sem botão testar; cartão Feegow ganha profMap + toggle |
| `src/components/LocalModal.tsx` | perde o editor de profMap (fica só dados do local + timbre) |
| `apps/wader/src/lib/clinica-tempo.ts` | **novo** — `CLINIC_TZ` + `hojeClinica()` |
| `apps/wader/src/workers/worklist-sync.ts`, `apps/wader/src/ui/api/agendamentos.ts`, `apps/wader/src/ui/api/reconciliacao.ts` | usam a fonte única |
| `apps/wader/src/adapters/heartbeat.ts` | batimento também verifica o Orthanc e grava `integracoes/orthanc.status` |
| `apps/wader/src/workers/wl-writer.ts` (ou chamador em `worklist-sync.ts`) | grava `mwlStatus:'ok'` ao escrever o `.wl` |
| `firestore.rules` + `tests/rules/regras.test.mjs` | `intacto('ortancAtivo')` no update de workspaces |
| `tests/api/feegow-admin.test.mjs`, `tests/api/integracoes.test.mjs`, `apps/wader/src/**/*.test.ts` | cobertura nova |

---

### Task 1: Identidade `fg-{id}-{data}` (D2) + #7c na ficha + CPF validado + dedup por CPF

**Files:** Modify `src/lib/feegow-admin.ts`, `tests/api/feegow-admin.test.mjs`

**Interfaces — Produz:** `gravarImportacao` inalterada na assinatura; docs de exame novos nascem com id `fg-{fgId}-{dataExame}`. `cpfValido(cpf: string): boolean` exportada (dígitos verificadores, mesmo algoritmo de `apps/wader/src/ui/api/agendamentos.ts:118` — copiar o corpo, sem import local).

- [ ] **Step 1: testes que falham** (padrão da suíte existente, emulador):

```
- remarcado ENTRA: doc fg-77-2026-08-19 existe (status nao-realizado); importar candidato
  {feegowAppointId:'77', dataExame:'2026-08-26'} cria fg-77-2026-08-26. (achado 7b)
- mesmo dia NAO duplica: importar 2x o mesmo candidato cria 1 doc (identidade nova).
- ficha #7c: pacientes/fg-500 existe com {cpf:'11144477735', nome:'MARIA CORRIGIDA'};
  importar candidato do fgPacId 500 com cpf:'' e nome:'' -> ficha RELÊ com cpf e nome intactos. (achado 1)
- cpf invalido vira vazio: candidato com cpf:'11111111111' -> exame.cpf === ''. (achado 11)
- dedup por CPF: pacientes/{autoId} manual com cpf valido X; candidato SEM fgPacId... 
  (na pratica fgPacId sempre existe) -> candidato COM fgPacId 600 e cpf X:
  NAO cria fg-600; o exame aponta pro doc manual existente. (achado 10)
- criadoEm preservado: ficha existente com criadoEm antigo -> reimportar nao o reescreve. (achado 12)
```

- [ ] **Step 2: rodar e ver falhar** — `npm run test:api`.

- [ ] **Step 3: implementar.** Em `gravarImportacao`:

```ts
const dataEx = String(c.dataExame ?? '');
if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEx)) continue; // sem data valida nao ha identidade
// D2: identidade = agendamento + data. Mesmo agendamento em dias diferentes
// (remarcacao — o Feegow PRESERVA o id, provado 19/08 com o 66890) sao dois
// exames de verdade; a trava so precisa impedir o mesmo exame do MESMO dia.
const exameRef = dbAdmin.doc(`workspaces/${wsId}/exames/fg-${fgId}-${dataEx}`);
```

Dentro da transação, ANTES do `tx.set` da ficha (todas as leituras de transação vêm antes das escritas):

```ts
const cpfOk = c.cpf && cpfValido(c.cpf) ? c.cpf : '';
// Dedup por CPF (achado 10): ficha manual da mesma pessoa e reusada.
let pacRef = fgPacId
  ? dbAdmin.doc(`workspaces/${wsId}/pacientes/fg-${fgPacId}`)
  : dbAdmin.collection(`workspaces/${wsId}/pacientes`).doc();
if (cpfOk) {
  const q = await tx.get(dbAdmin.collection(`workspaces/${wsId}/pacientes`)
    .where('cpf', '==', cpfOk).limit(1));
  if (!q.empty) pacRef = q.docs[0].ref;
}
const pacSnap = await tx.get(pacRef);
// #7c (achado 1): vazio significa "nao mexe" — merge:true NAO protege de
// string vazia, que e valor e sobrescreve o que a secretaria corrigiu na mao.
tx.set(pacRef, {
  id: pacRef.id,
  ...(c.pacienteNome ? { nome: c.pacienteNome } : {}),
  ...(cpfOk ? { cpf: cpfOk } : {}),
  ...(c.pacienteDtnasc ? { dtnasc: c.pacienteDtnasc } : {}),
  ...(c.sexo ? { sexo: c.sexo } : {}),
  ...(c.telefone ? { telefone: c.telefone } : {}),
  ...(fgPacId ? { feegowPacienteId: fgPacId } : {}),
  ...(pacSnap.exists ? {} : { criadoEm: FieldValue.serverTimestamp() }), // achado 12
  atualizadoEm: FieldValue.serverTimestamp(),
}, { merge: true });
```

No `tx.create` do exame, `cpf: cpfOk` (não mais `c.cpf ?? ''`). O leitor de ACC (`tx.get` do accIndex) já roda antes — mover o laço do ACC para depois dos `tx.get` novos se o Firestore reclamar da ordem leitura/escrita.

- [ ] **Step 4: rodar e ver passar** — api 140 → ~146. **Step 5: commit + push.**

---

### Task 2: `montarCandidatos` desce para a camada testável (D6, achados 3, 4, 9, 13, 14, 20, 22)

**Files:** Modify `src/lib/feegow-admin.ts`, `src/app/api/feegow/route.ts`, `tests/api/feegow-admin.test.mjs`

**Interfaces — Produz:**

```ts
export function normalizarNascimento(s: string | undefined | null): string; // '' se invalido
export async function montarCandidatos(args: {
  token: string; wsId: string; hoje: string;
  procMap: Record<string, string>; profMap: Record<number, string>;
  fetchImpl?: typeof fetch;
}): Promise<{
  candidatos: Candidato[];
  ignorados: Array<{ procedimentoId: number; qtd: number }>; // fora do procMap (achado 3)
  falhas: string[];                                          // agendamento_id com erro de busca (achado 4)
  cancelados: string[];                                      // agendamento_id em {6,11,22,15} (D3, Task 4 usa)
}>;
```

- [ ] **Step 1: testes que falham** (com `fetchImpl` stub, sem rede):

```
- nascimento 'DD-MM-YYYY' -> 'YYYY-MM-DD'; 'YYYY-MM-DD' passa direto (guard ISO);
  '02/01/1980' -> ''; lixo -> ''. (achado 9)
- agendamento com status_id 6 NAO vira candidato e entra em cancelados. (achado 13 + D3)
- agendamento com data != hoje NAO vira candidato. (achado 13)
- procedimento fora do procMap -> ignorados[{procedimentoId, qtd}]. (achado 3)
- /patient/search estourando para UM paciente -> falhas contem o agendamento_id,
  os demais candidatos saem normais. (achado 4)
- paciente sem nome (pac.nome ausente) -> falhas, nao candidato sem nome. (achado 4)
- sexo 'Masculino'->'M', 'Feminino'->'F', outro->''.
```

- [ ] **Step 2: ver falhar.** **Step 3: implementar.** Mover as ~65 linhas da rota para `feegow-admin.ts` com as mudanças:

```ts
export function normalizarNascimento(s: string | undefined | null): string {
  if (!s) return '';
  const p = String(s).split('-');
  if (p.length !== 3) return '';
  const iso = p[0].length === 4 ? String(s) : `${p[2]}-${p[1]}-${p[0]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
}
```

Na busca do dia: **sem `status_id=4`** — a query traz todos e o laço particiona:

```ts
const CANCELADOS_FEEGOW = [6, 11, 22, 15]; // desmarcado/faltou (ADR 16/05 #6)
for (const ag of agendamentos) {
  if (CANCELADOS_FEEGOW.includes(Number(ag.status_id))) { cancelados.push(String(ag.agendamento_id)); continue; }
  if (Number(ag.status_id) !== 4) continue;               // {2,3,5}: nao mexer
  if (ag.data && normalizarData(ag.data) !== hoje) continue; // defesa achado 13
  if (!procMap[ag.procedimento_id]) { contarIgnorado(ag.procedimento_id); continue; }
  try {
    const pac = ...;
    if (!pac?.nome) { falhas.push(String(ag.agendamento_id)); continue; }
    candidatos.push({ ... }); // SEM convenioId/procedimentoId/profissionalId/origem (achado 20)
  } catch { falhas.push(String(ag.agendamento_id)); }
}
```

(`normalizarData` = mesma inversão DD-MM-YYYY→ISO, interna.) A rota passa a chamar `montarCandidatos({ token, wsId, hoje, procMap, profMap })` — `resolverProcMap`/profMap são lidos na rota e passados (o profMap ainda vem do workspace nesta task; muda na Task 6). O bloco duplicado de `buscar_cpf` (dtnasc/sexo) usa `normalizarNascimento` (achado 22).

- [ ] **Step 4: ver passar + `npx tsc --noEmit`.** **Step 5: commit + push.**

---

### Task 3: `PROC_MAP` morre; importar devolve contagens; a tela conta a verdade (D4, achados 3, 15)

**Files:** Modify `src/lib/feegow-admin.ts` (`resolverProcMap`), `src/app/api/feegow/route.ts`, `src/components/Worklist.tsx`, `tests/api/feegow-admin.test.mjs`

**Interfaces — Produz:** `POST importar` → `{ ok, total, criados, ignorados, falhas, naoRealizados }` (naoRealizados chega na Task 4; até lá, 0). `resolverProcMap` sem 3º parâmetro de fallback: mapa ausente/vazio → `{}`.

- [ ] **Step 1: testes que falham:** `resolverProcMap` sem doc → `{}` (não mais o mapa de 3 entradas); importar com procMap vazio → o handler devolve 400 `feegow_sem_procmap` (teste no nível de `montarCandidatos`/decisão — o handler não é importável; documentar a leitura).
- [ ] **Step 2: ver falhar.** **Step 3: implementar.** Apagar `PROC_MAP` da rota (o seed de dev vive em `apps/wader/scripts/setup-dev.ts`, onde é honesto). Na rota, antes de montar candidatos: `if (Object.keys(procMap).length === 0) return NextResponse.json({ ok:false, error:'feegow_sem_procmap' }, { status: 400 })`. Resposta do importar carrega as contagens. Na `Worklist.importarFeegow`, o alert vira:

```ts
const partes = [`${data.criados.length} importado(s)`];
if (data.ignorados?.length) partes.push(`${data.ignorados.reduce((s,i)=>s+i.qtd,0)} ignorado(s) — procedimento não mapeado (ids: ${data.ignorados.map(i=>i.procedimentoId).join(', ')}) — mapeie em Integrações > Feegow`);
if (data.falhas?.length) partes.push(`${data.falhas.length} falha(s) de busca — tente de novo`);
if (data.naoRealizados) partes.push(`${data.naoRealizados} marcado(s) não-realizado (desmarcou/faltou no Feegow)`);
alert(partes.join('\n'));
```

`error 'feegow_sem_procmap'` → alert "Nenhum procedimento mapeado. Vá em Integrações > Feegow e mapeie os procedimentos."

- [ ] **Step 4: bateria + build.** **Step 5: commit + push.**

---

### Task 4: Reconciliação na importação (D3, achado 7a)

**Files:** Modify `src/lib/feegow-admin.ts`, `src/app/api/feegow/route.ts`, `tests/api/feegow-admin.test.mjs`

**Interfaces — Produz:** `reconciliarCancelados(dbAdmin, { wsId, hoje, cancelados }): Promise<number>`.

- [ ] **Step 1: testes que falham (payload real):**

```
- exame FEEGOW aguardando de hoje com feegowAppointId em cancelados -> vira 'nao-realizado'.
- exame FEEGOW 'andamento' -> INTOCADO (so aguardando).
- exame MANUAL aguardando -> INTOCADO (so origem FEEGOW).
- exame FEEGOW aguardando de ONTEM -> INTOCADO (so dataExame == hoje).
- cancelados vazio -> zero escritas.
```

- [ ] **Step 2: ver falhar.** **Step 3: implementar:**

```ts
// D3 + ADR 16/05 #6: marcar nao-realizado (NUNCA apagar) quem desmarcou/faltou.
// So origem FEEGOW, so aguardando, so hoje — regra fechada, nada de "!=4 remove".
export async function reconciliarCancelados(dbAdmin: Firestore, args: {
  wsId: string; hoje: string; cancelados: string[];
}): Promise<number> {
  if (args.cancelados.length === 0) return 0;
  const setC = new Set(args.cancelados);
  const snap = await dbAdmin.collection(`workspaces/${args.wsId}/exames`)
    .where('origem', '==', 'FEEGOW').where('dataExame', '==', args.hoje)
    .where('status', '==', 'aguardando').get();
  const lote = dbAdmin.batch();
  let n = 0;
  for (const d of snap.docs) {
    if (!setC.has(String(d.data().feegowAppointId))) continue;
    lote.update(d.ref, { status: 'nao-realizado', atualizadoEm: FieldValue.serverTimestamp() });
    n++;
  }
  if (n > 0) await lote.commit();
  return n;
}
```

Na rota, depois de `gravarImportacao`: `const naoRealizados = await reconciliarCancelados(dbAdmin, { wsId, hoje, cancelados })` → resposta. (O worklist-sync do Wader já remove o `.wl` de quem sai de `aguardando` — nenhum trabalho extra.)

- [ ] **Step 4 (achado 8): remover da fila não pode destravar reimportação nem deixar reserva órfã.**
  - Teste que falha: `apagarExame` de um exame com `acc` → `accIndex/{acc}` também some. Teste 2 (leitura de código, UI): exame `origem === 'FEEGOW'` removido da fila usa a ação **cancelar** (doc fica, `.wl` some via elegibilidade), não apagar.
  - Implementar: em `src/lib/exame-admin.ts`, `apagarExame` deleta a reserva `workspaces/{wsId}/accIndex/{acc}` junto (mesmo batch/transação). Em `Worklist.tsx`, `removerDaFila`: se `item.origem === 'FEEGOW'`, chamar a ação `cancelar` existente em vez de `apagar`, com o `confirm()` dizendo "sai da fila e fica no histórico como cancelado". Manual continua apagando.

- [ ] **Step 5: ver passar.** **Step 6: commit + push.**

---

### Task 5: `atualizar_status` endurecido + falha visível (D4, achados 5, 16)

**Files:** Modify `src/app/api/feegow/route.ts`, `tests/api/feegow-admin.test.mjs` (função nova em `feegow-admin.ts`)

**Interfaces — Produz:** `marcarAtendido(dbAdmin, { wsId, agendamentoId, token, fetchImpl? }): Promise<{ httpStatus: number; ok: boolean; mensagem: string }>` — o corpo que o MOTOR envia (`{action:'atualizar_status', agendamento_id, status_id}`) **não muda**; a rota ignora o `status_id` do cliente.

- [ ] **Step 1: testes que falham:**

```
- agendamento_id sem exame correspondente no wsId -> httpStatus 404, nada chamado no fetchImpl.
- exame existe + alvo responde 200 -> exame ganha feegowStatusOk: true.
- exame existe + alvo responde 401 -> httpStatus 502 + exame ganha feegowStatusOk: false
  (a emissao NAO trava: o motor ignora a resposta — o campo e o registro).
- o status enviado ao Feegow e SEMPRE 3, mesmo se o cliente mandar outro. (achado 16)
```

- [ ] **Step 2: ver falhar.** **Step 3: implementar** em `feegow-admin.ts`:

```ts
export async function marcarAtendido(dbAdmin: Firestore, args: {
  wsId: string; agendamentoId: string; token: string; fetchImpl?: typeof fetch;
}): Promise<{ httpStatus: number; ok: boolean; mensagem: string }> {
  const f = args.fetchImpl ?? fetch;
  const agId = String(args.agendamentoId ?? '');
  if (!/^\d+$/.test(agId)) return { httpStatus: 400, ok: false, mensagem: 'agendamento_id invalido' };
  // O agendamento tem de pertencer a um exame DESTE local (achado 16: antes
  // qualquer membro carimbava qualquer status em qualquer agendamento).
  const q = await dbAdmin.collection(`workspaces/${args.wsId}/exames`)
    .where('feegowAppointId', '==', agId).limit(1).get();
  if (q.empty) return { httpStatus: 404, ok: false, mensagem: 'agendamento nao pertence a este local' };
  const res = await f(`${FEEGOW_BASE}/appoints/statusUpdate`, {
    method: 'POST', headers: { 'x-access-token': args.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ AgendamentoID: agId, StatusID: 3 }), // sempre 3: o significado mora aqui
  });
  const ok = res.ok; // achado 5: antes 401/500 viravam {ok:true} e ninguem sabia
  await q.docs[0].ref.set({ feegowStatusOk: ok, atualizadoEm: FieldValue.serverTimestamp() }, { merge: true });
  return ok ? { httpStatus: 200, ok: true, mensagem: 'Atendido marcado no Feegow.' }
            : { httpStatus: 502, ok: false, mensagem: `Feegow ${res.status} ao marcar Atendido — registrado no exame.` };
}
```

`FEEGOW_BASE` já existe na rota — mover a constante para `feegow-admin.ts` (a rota importa de lá). O `case` do POST vira composição: gate (já içado) → `resolverToken` → `marcarAtendido`. `feegowStatusOk` é campo novo do exame gravado por Admin SDK — **não** entra na whitelist administrativa (nenhum cliente o grava).

- [ ] **Step 4: ver passar + tsc.** **Step 5: commit + push.**

---

### Task 6: Config completa no cartão Feegow — `profMap` + toggle `ativo` (D5, achados 18, 21)

**Files:** Modify `src/lib/integracoes-admin.ts`, `src/app/api/feegow/route.ts`, `src/app/(plataforma)/integracoes/page.tsx`, `src/components/LocalModal.tsx`, `tests/api/integracoes.test.mjs`

**Interfaces — Produz:** `CAMPOS_CONFIG.feegow = ['procMap', 'profMap', 'ativo']`; a rota do Feegow lê `profMap` de `integracoes/feegow` (fallback uma-via para o campo antigo do workspace DURANTE a transição, removível na limpeza); importar com `integracoes/feegow.ativo === false` → 400 `feegow_desligado`.

- [ ] **Step 1: testes que falham:** salvar `{profMap}` grava em `integracoes/feegow` (mergeFields — substituição integral, mesmo padrão do procMap); salvar `{ativo:false}` grava; `ativo:'true'` string é descartado; salvar profMap NÃO zera status de teste (a regra da revisão final do Sub-plano 5: só credencial/url zeram).
- [ ] **Step 2: ver falhar.** **Step 3: implementar.**
  - `integracoes-admin.ts`: whitelist `limparConfig` do feegow aceita `procMap` (mapa), `profMap` (mapa id→string) e `ativo` (boolean estrito).
  - Rota: `montarCandidatos` recebe `profMap` lido de `integracoes/feegow.profMap ?? wsData.feegowProfMap ?? {}` (comentário: fallback sai na limpeza); antes de importar, `if (integ?.ativo === false) return 400 'feegow_desligado'` (ausente = ligado — a migração gravou `ativo:!!token`).
  - Tela: o cartão Feegow ganha o editor de profissionais (migrar o comportamento de `LocalModal.tsx` — "Carregar profissionais" via `action=profissionais`, select por médico — mesmo movimento já feito com o procMap) e um toggle liga/desliga idêntico ao do Orthanc (sem espelho — o Feegow não tem `SidebarLaudo`).
  - `LocalModal.tsx`: **remover** o bloco de profissionais (remoção, não reorganização). O modal fica só com dados do local e timbre — fim da configuração de integração fora de Integrações.
- [ ] **Step 4: bateria + tsc + build.** **Step 5: commit + push.**

---

### Task 7: O corte estrutural — a nuvem para de falar com o Orthanc (D1, achados 6 + rota morta)

**Files:** Delete `src/app/api/orthanc/route.ts`. Modify `src/components/Worklist.tsx`, `src/lib/integracoes-admin.ts`, `src/app/(plataforma)/integracoes/page.tsx`, `tests/api/integracoes.test.mjs`

- [ ] **Step 1: prova de que nada órfão sobra.** `grep -rn "api/orthanc" src/ apps/ tests/` — chamadores esperados: `Worklist.tsx` (`enviarMwlOrthanc`) e nada mais. Se aparecer outro, PARAR e reportar.
- [ ] **Step 2: testes que falham:** `executarTeste` com `tipo:'orthanc'` → 400 com mensagem "O estado do Orthanc é verificado pela máquina da clínica (Wader)". Os testes existentes de `testarOrthanc` (Basic auth, senha curta, esquema) são **removidos deliberadamente** — a proteção equivalente vive nos testes do Wader (`workspace-repo.test.ts` cobre `user`/`pass`) e no teste novo do batimento (Task 8).
- [ ] **Step 3: implementar.**
  - Deletar `src/app/api/orthanc/route.ts` inteiro.
  - `Worklist.tsx`: remover `enviarMwlOrthanc` e os dois call sites (criação manual e laço pós-importação) + o comentário ponytail do laço. O indicador "SEM MWL" (leitura de `mwlStatus`) **fica** — quem passa a escrevê-lo é o Wader (Task 8).
  - `integracoes-admin.ts`: `executarTeste` — ramo orthanc vira `return { httpStatus: 400, ok:false, mensagem: 'O estado do Orthanc é verificado pela máquina da clínica (Wader) e aparece no cartão.' }`; apagar `testarOrthanc`, `resolverConfigOrthanc` e `ConexaoOrthanc` se ficarem sem chamador (grep antes). **`salvarIntegracao`/`removerCredencial` do orthanc FICAM** — o Wader lê `privado/orthanc`.
  - Tela: cartão Orthanc perde o botão "Testar conexão"; ganha legenda `text-xs text-ink-3`: "Estado verificado pela máquina da clínica a cada 5 min." O formulário (endereço write-only, user/pass, toggle com espelho) fica como está.
- [ ] **Step 4: bateria + tsc + build (o build acusa import quebrado se sobrou algo).** **Step 5: commit + push.**

---

### Task 8: Wader — fonte única de "hoje" + batimento verifica o Orthanc + `mwlStatus` verdadeiro (D1, E, achado 2)

**Files:** Create `apps/wader/src/lib/clinica-tempo.ts` + `.test.ts`. Modify `apps/wader/src/workers/worklist-sync.ts`, `apps/wader/src/ui/api/agendamentos.ts`, `apps/wader/src/ui/api/reconciliacao.ts`, `apps/wader/src/adapters/heartbeat.ts`, `apps/wader/src/adapters/exames-repo.ts`, `apps/wader/src/index.ts` (fiação do batimento, se a assinatura mudar)

**Interfaces — Produz:** `CLINIC_TZ = 'America/Belem'` e `hojeClinica(agora?: Date): string` (YYYY-MM-DD) em `clinica-tempo.ts`; batimento grava também `integracoes/orthanc.{status, ultimoTeste, ultimoErro}`; `exames-repo` ganha `marcarMwl(exameId: string, status: 'ok' | 'falhou'): Promise<void>`.

- [ ] **Step 1: testes que falham (vitest):**

```
- hojeClinica(new Date('2026-08-19T23:30:00-03:00')) === '2026-08-19'  // 23h30 em Belem
- hojeClinica(new Date('2026-08-20T00:30:00Z'))      === '2026-08-19'  // 21h30 em Belem, UTC ja virou (o bug das 21h)
- batimento com orthanc respondendo -> integracoes/orthanc recebe status 'ok' (mock do fetch/getDb)
- batimento com orthanc caido -> status 'erro', ultimoErro SEM user/pass dentro
- falha na checagem do orthanc NAO derruba o batimento do wader (visto continua sendo gravado)
```

- [ ] **Step 2: ver falhar.** **Step 3: implementar.**
  - `clinica-tempo.ts`: `Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(agora ?? new Date())`. Trocar `new Date().toISOString().slice(0,10)` em `worklist-sync.ts:46` e `agendamentos.ts` (`hojeIso`); `reconciliacao.ts` importa `CLINIC_TZ` daqui (fonte única).
  - `heartbeat.ts` — o `bater` ganha a checagem, isolada em try próprio (o batimento do wader NUNCA depende do orthanc):

```ts
// D1 (correcao Secao 3): a nuvem nao alcanca o Orthanc — quem verifica e o
// Wader, daqui de dentro da rede, e reporta pro cartao da tela de Integracoes.
try {
  const conn = await repo.getOrthancConnection(); // cache de 5 min ja existente
  let status: 'ok' | 'erro' = 'erro';
  let ultimoErro: string | null = 'Orthanc não configurado ou credencial ausente.';
  if (conn) {
    try {
      const r = await client.system();            // GET /system que o orthanc-client ja faz
      status = 'ok'; ultimoErro = null; void r;
    } catch (e) {
      ultimoErro = `Orthanc inacessível: ${(e as Error).message}`.slice(0, 200); // sem user/pass: a msg de erro do fetch nao os carrega, e nunca interpolamos conn aqui
    }
  }
  await getDb().doc(`workspaces/${wsId}/integracoes/orthanc`).set({
    status, ultimoTeste: new Date(), ultimoErro,
  }, { merge: true });
} catch (e) {
  log.warn({ err: (e as Error).message }, 'Checagem do Orthanc falhou (segue o jogo)');
}
```

  (Conferir os nomes reais: como o `heartbeat` obtém `WorkspaceRepo`/`OrthancClient` — injetar pelos parâmetros de `iniciarBatimento`, fiando em `index.ts`, no padrão dos outros workers. `merge:true` preserva `url`/`ativo` que a tela grava.)
  - `exames-repo.ts`: `marcarMwl` = `update({ mwlStatus: status })` no doc do exame, silencioso em erro. No `worklist-sync.ts`, após `salvarWl` com sucesso → `marcarMwl(exame.id, 'ok')`; no catch de escrita → `'falhou'`. (É isso que faz o "SEM MWL" da fila dizer a verdade.)
- [ ] **Step 4: `cd apps/wader && npx tsc --noEmit` + vitest (30 → ~36) + tsc raiz.** **Step 5: commit + push.**

---

### Task 9: Higiene — tipo no contrato, espelho fechado dos dois lados, comentários (achados 17, 19 + nota da revisão)

**Files:** Modify `src/lib/feegow-admin.ts`, `src/app/api/feegow/route.ts`, `src/components/Worklist.tsx`, `src/components/LocalModal.tsx`, `firestore.rules`, `tests/rules/regras.test.mjs`

- [ ] **Step 1: teste de regra que falha:** dono tenta `update` em `workspaces/{LOCAL_A1}` mudando `ortancAtivo` → **negado**; update dos demais campos (nome, timbre) → segue permitido. Usar as fixtures reais (`como()`, `LOCAL_A1`, `DR_A`).
- [ ] **Step 2: ver falhar.** **Step 3: implementar.**
  - `firestore.rules`, update de workspaces: `&& intacto('ortancAtivo')` ao lado do `intacto('contaId')`, com comentário de uma linha (espelho: só `salvarIntegracao` escreve, no mesmo batch de `integracoes/orthanc.ativo`).
  - `feegow-admin.ts`: `export type AcaoFeegow = 'buscar_cpf' | 'procedimentos' | 'profissionais' | 'importar' | 'atualizar_status';` — tipar `decidirGetFeegow`/chamadores da rota e os fetches de `Worklist.tsx`/`LocalModal.tsx`/`integracoes/page.tsx` (o do motor NÃO — intocável).
  - Topo de `route.ts`, comentário de 3 linhas: por que a rota é um despacho por `action` com gate antes do switch (uma ação nova nasce protegida; quebrar em rotas separadas replicaria o gate — foi uma lista esquecida que produziu o furo do `debug_sala`).
- [ ] **Step 4: `npm run test:rules` (127 → 128+) + bateria.** **Step 5: commit + push.**

---

### Task 10: Fechamento

- [ ] Bateria completa: `npx tsc --noEmit`, `npm run test:unit`, `npm run test:api`, `npm run test:rules`, `npm run build`, `cd apps/wader && npx tsc --noEmit` + vitest.
- [ ] Revisão FINAL da branch com o modelo mais capaz. Atenção: (a) sobrou algum caminho nuvem→Orthanc?; (b) a identidade nova colide com algum leitor de doc id (`dicom-ingest` fallback lê por ACC e por doc id — conferir que `fg-{id}-{data}` não quebra o fallback legado); (c) o corpo que o motor envia continua aceito byte a byte?; (d) nenhum segredo em caminho novo (ultimoErro do batimento!); (e) o `.wl` do exame reconciliado some no próximo sync?
- [ ] Onda de fix dos Critical/Important + re-revisão.
- [ ] **Confirmação do Sergio** → publicar a regra (`npm run secao1:publicar-regras -- --commit`). Conferir ruleset.
- [ ] Merge master + deploy + verificação em produção (conta Gmail de teste): importar do Feegow e conferir a contagem nova; cartão Orthanc sem botão de teste.
- [ ] **Wader:** as mudanças pegam a MESMA atualização pendente da clínica (Sub-plano 5). Runbook da visita: atualizar → cartão Wader "No ar" → cartão Orthanc "Conexão OK — verificada pela clínica" → importar um paciente → `.wl` na pasta → "SEM MWL" some → imagem real entra → (só então, decisão já autorizada em separado) `integracoes:limpar -- --commit`.
- [ ] Documentar: ADR em `docs/decisoes/`, revisão da Seção 3 marcada FECHADA (com os nºs dos achados → tasks), Obsidian (disco), memória local, ledger, push.

**Estimativa: ~1 dia de esteira** (T1-T2 as maiores; T7-T8 são o corte estrutural; T10 depende da janela com o Sergio para regra + clínica).
