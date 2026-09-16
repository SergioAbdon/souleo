# Plano de Correção — Seção 2 (Worklist) Implementation Plan · v2 (pós-tríade)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 22 achados da revisão tríade da Seção 2 (`docs/planos/2026-08-12-revisao-secao2-worklist.md`): destravar o fluxo recepção→médico, fechar corridas de CPF/ACC (chave DICOM), alinhar a Worklist ao modelo da Seção 1.

**Architecture:** Regra + código + teste com payload real no MESMO commit; lógica de servidor em `src/lib/*-admin.ts` (testável no emulador, importando TS direto — padrão `billing-admin.test.mjs`), rota só compõe; a importação Feegow migra pro servidor com autorização por vínculo (`resolverPapel`) e criação atômica por transação; reserva de ACC (`accIndex/{acc}`) vive SÓ no servidor.

**Tech Stack:** Next.js (App Router) · Firebase Web SDK + Admin SDK · Firestore Rules · `node --test` + `@firebase/rules-unit-testing` (emulador).

## Revisão da tríade sobre o plano (v1 → v2)

Aplicado: **[Codex-1]** autorização por vínculo na rota de importação (crítico — cross-tenant); **[Codex-2]** autor só com perfil médico E papel dono/medico (caso MEDREC); **[Codex-3]** `salvarLaudo` assume o exame órfão; **[Codex-4]** regras publicadas ANTES do merge (são aditivas, seguras com código velho); **[Codex-5/6]** criação Feegow por transação atômica e idempotente (`tx.create`), só `ALREADY_EXISTS` vira retry; **[Codex-9]** teste de mwlStatus em exame com autor; **[Codex-10]** cron devolve 500 em erro parcial; **[Codex-11]** validação numérica dos ids Feegow; **[Codex-14/Arq-1]** testes explícitos MEDREC + médico não-autor; **[Pony-1]** reserva de ACC só no servidor (sem `runTransaction`/regra/testes client — cinto manual atual fica, com comentário `ponytail:`); **[Pony-2]** tarefa de sincronia por regex cortada (a seção 14 do emulador JÁ roda os payloads reais contra a regra real); **[Pony-3]** teste de fuso importa o TS real; **[Pony-4]** edição morta no batch client cortada; **[Pony-5/Arq-4]** `agoraBelem` nasce em utils; **[Pony-6]** um build só, na T12; **[Arq-2]** MWL client com `await` sequencial + teto documentado; **[Arq-3]** init do Admin em `feegow/route.ts` migra pra `auth-admin`; **[Arq-6]** assinatura de `montarCandidatos` explícita.

Rejeitado (com motivo): **[Codex-8]** gravar `cpf:''` no exame quando o campo é esvaziado — contraria a decisão #7c (campo vazio = "não mexer", proteção contra apagão de CPF); limitação documentada em comentário. **[Arq-1 parcial]** restringir o ramo administrativo pra excluir papel `medico` — o dono já tinha esse poder, recepção precisa dele, e médico corrigir convênio de fila é fluxo real; o risco fica limitado por whitelist + não-emitido + `medicoUid` intacto, e os testes novos documentam a concessão. **[Arq-2 total]** mover MWL pro servidor — fica no cliente por ora (o `/api/orthanc` já autentica; mwlStatus da T10 dá visibilidade); teto anotado.

## Global Constraints

- **Regra de ouro:** mudança de segurança entra em `firestore.rules` E no código no MESMO commit, com teste usando payload REAL (`tests/rules/fixtures.mjs`).
- **NÃO usar `git stash`** (daemon `.claude-flow` engole edições).
- **Commit + push após cada tarefa** (protocolo Dual Claude).
- **Publicar regras em produção** (`scripts/secao1/04-publicar-regras.mjs --commit`) é ação sensível: SÓ com confirmação do Sergio, uma única vez, na Task 12 — e ANTES do merge do código (as regras novas são aditivas: código velho continua funcionando com elas; código novo NÃO funciona com regras velhas).
- Branch de trabalho: `feat/secao2-worklist-fixes`, criada a partir de `feat/secao1-plano2b-b2`.
- Testes: `npm run test:rules` · `npm run test:unit` · `npm run test:api`. `npx tsc --noEmit` por tarefa; `npm run build` UMA vez, na T12.
- Ponytail full: menor diff que funciona; corner cortado de propósito ganha comentário `ponytail:`.
- Fuso da clínica: `America/Belem` (UTC-3 fixo, sem horário de verão).

**Mapa achado → tarefa:** A2→T1 · A1→T2 · A3,A5,A8,A21→T3 · A6→T4 · A12→T5 · A4,A9(cron),A19→T6 · A7,A9(import),A10,A14,A18→T7 · A11→T8 · A13→T9 · A15→T10 · A16→T1+T10 (payloads reais no emulador SÃO o teste de sincronia) · A17,A20,A22→T11 · deploy→T12.

---

### Task 0: Branch de trabalho

- [ ] **Step 1: Criar a branch**

```bash
git checkout feat/secao1-plano2b-b2 && git pull && git checkout -b feat/secao2-worklist-fixes && git push -u origin feat/secao2-worklist-fixes
```

---

### Task 1: Regra — membro do local edita o administrativo da fila (Achado 2)

A regra de update de `/exames` não tem caminho pra papel `recepcao`: "👤 Editar" falha com `permission-denied` pra secretária. O ramo do dono já faz o necessário (só administrativo, só não-emitido, `medicoUid` intacto) — abrir esse ramo pra qualquer membro que alcança o local. **Decisão consciente:** isso também deixa médico não-autor editar campos administrativos de exame de colega (fluxo real de fila); o teto é whitelist + não-emitido + autor intacto.

**Files:**
- Modify: `firestore.rules:165-170`
- Modify: `tests/rules/fixtures.mjs`
- Modify: `tests/rules/regras.test.mjs`

**Interfaces:**
- Produces: `payloadCadastroExame(extra)` e `payloadEditarExame(extra)` em fixtures.mjs — usados pelas Tasks 2 e 10; docs `exFila1`, `exComAutor` no seed — usados pela Task 10.

- [ ] **Step 1: Payloads reais em `tests/rules/fixtures.mjs`** (anexar ao fim)

```js
/**
 * Payload identico ao cadastro manual da Worklist (handleSalvarPaciente →
 * saveExame create, src/components/Worklist.tsx + src/lib/firestore.ts).
 * SEM medicoUid: apos a correcao do Achado 1, exame criado por quem nao
 * assina nasce orfao (um medico do local assume depois, no salvarLaudo).
 */
export const payloadCadastroExame = (extra = {}) => ({
  id: 'exNovo',
  acc: 'EX12082610300000',
  pacienteId: 'pac1',
  pacienteNome: 'PACIENTE NOVO',
  pacienteDtnasc: '1980-01-02',
  cpf: '12345678900',
  tipoExame: 'eco_tt',
  dataExame: '2026-08-12',
  horarioChegada: '10:30',
  status: 'aguardando',
  convenio: 'UNIMED',
  solicitante: '',
  medicoExecutor: '',
  sexo: 'F',
  origem: 'MANUAL',
  versao: 1,
  criadoEm: new Date(),
  ...extra,
});

/**
 * Payload identico a EDICAO de paciente pela Worklist (handleSalvarPaciente
 * com editExameId → writeBatch, Task 3). Inclui cpf (Achado 8) e atualizadoEm.
 */
export const payloadEditarExame = (extra = {}) => ({
  pacienteNome: 'PACIENTE CORRIGIDO',
  pacienteDtnasc: '1980-01-02',
  cpf: '22222222222',
  convenio: 'BRADESCO',
  solicitante: 'DR FULANO',
  tipoExame: 'doppler_carotidas',
  sexo: 'F',
  atualizadoEm: new Date(),
  ...extra,
});
```

- [ ] **Step 2: Seeds + testes que falham (`tests/rules/regras.test.mjs`)**

No `before()`, depois de `exSemAutor`:

```js
    // Fila da Secao 2 (secao 14): exames aguardando + um rascunho COM autor.
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'exFila1'), {
      pacienteNome: 'Fila Um', status: 'aguardando', cpf: '11111111111',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'exFila2'), {
      pacienteNome: 'Fila Dois', status: 'aguardando',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), {
      pacienteNome: 'Rascunho do Dr A', status: 'rascunho', medicoUid: DR_A,
    });
```

Import: `import { payloadCreateProfile, payloadCadastroExame, payloadEditarExame } from './fixtures.mjs';`

Seção nova ao fim do arquivo:

```js
describe('14. worklist — administracao da fila por membro do local (Secao 2)', () => {
  test('recepcao edita administrativo de exame aguardando (payload real)', async () => {
    await assertSucceeds(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFila1'), payloadEditarExame()));
  });
  test('recepcao edita administrativo de rascunho COM autor (autor intacto)', async () => {
    await assertSucceeds(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), { convenio: 'UNIMED' }));
  });
  test('recepcao NAO toca campo clinico', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFila1'), { medidas: { fe: 60 } }));
  });
  test('recepcao NAO edita exame emitido', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'ex1'), payloadEditarExame()));
  });
  test('recepcao NAO promove status a emitido', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFila1'), { status: 'emitido' }));
  });
  test('recepcao NAO troca o medicoUid', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), { medicoUid: RITA }));
  });
  test('medico NAO-autor edita administrativo do rascunho do colega (concessao documentada)', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), { horarioChegada: '11:00' }));
  });
  test('medico NAO-autor continua SEM tocar o clinico do colega', async () => {
    await assertFails(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), { medidas: { fe: 60 } }));
  });
  // MEDREC: medico de perfil com papel recepcao — administra a fila, nao assina.
  test('MEDREC edita administrativo de exame aguardando', async () => {
    await assertSucceeds(updateDoc(doc(como(MEDREC), `workspaces/${LOCAL_C}/exames`, 'exCfila'), { convenio: 'UNIMED' }));
  });
  test('MEDREC NAO grava conteudo clinico via update', async () => {
    await assertFails(updateDoc(doc(como(MEDREC), `workspaces/${LOCAL_C}/exames`, 'exCfila'), { medidas: { fe: 60 } }));
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm run test:rules`
Expected: os 4 `assertSucceeds` de recepção/MEDREC/médico-não-autor FALHAM; os `assertFails` passam.

- [ ] **Step 4: Mudança mínima na regra** — em `firestore.rules` (~linha 165), trocar `ehDonoDoLocal(wsId)` por `alcancaLocal(wsId)` no ramo administrativo do update e ajustar o comentário:

```
                          || (alcancaLocal(wsId) && intacto('medicoUid')
                              && resource.data.get('status', '') != 'emitido'
                              && request.resource.data.get('status', '') != 'emitido'
                              // Qualquer MEMBRO do local (dono, medico, recepcao) mexe
                              // no ADMINISTRATIVO da fila pre-assinatura (Secao 2, A2).
                              // Campo clinico tocado aqui e negado (ADR 8.4); autor
                              // intacto; emitido corrige via /api/corrigir-laudo.
                              && request.resource.data.diff(resource.data).affectedKeys().hasOnly(camposAdministrativos())));
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test:rules`
Expected: PASS — inclusive TODAS as seções antigas (o dono continua coberto por `alcancaLocal`).

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/rules/fixtures.mjs tests/rules/regras.test.mjs
git commit -m "fix(regras): membro do local edita administrativo da fila (recepcao destravada)" && git push
```

---

### Task 2: Autor só nasce de quem assina; médico assume o órfão no primeiro save (Achado 1 + Codex-2/3)

`saveExame` grava `medicoUid` em toda criação com o uid de quem cadastra — secretária cadastra, exame "prende" nela. Correção em três pontas: (1) `saveExame` só grava `medicoUid` se veio preenchido; (2) a Worklist só preenche quando quem cria tem perfil médico **E papel dono/medico** (o MEDREC — médico de perfil com papel recepcao — NÃO carimba); (3) `salvarLaudo` do motor passa a incluir `medicoUid` — é assim que o médico ASSUME o exame órfão no primeiro save (sem isso o exame ficava órfão até a emissão).

**Files:**
- Modify: `src/lib/firestore.ts:323-329` (create do saveExame)
- Modify: `src/components/Worklist.tsx` (cadastro manual, default do solicitante)
- Modify: `src/app/laudo/[id]/page.tsx:481-485` (salvarLaudo)
- Test: `tests/rules/regras.test.mjs` (seção 14)

**Interfaces:**
- Consumes: `payloadCadastroExame` (Task 1); `ehMedico(perfil)` de `src/lib/permissoes.ts`; `papel` do `useAuth()` (já destructurado na Worklist).
- Produces: contrato de `saveExame`: `medicoUid=''` ⇒ campo AUSENTE no doc criado.

- [ ] **Step 1: Testes de regra (contrato do fluxo recepção→médico)**

Na seção 14:

```js
  test('recepcao cadastra exame SEM medicoUid (payload real do cadastro)', async () => {
    await assertSucceeds(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exNovoRita'),
      payloadCadastroExame({ id: 'exNovoRita' })));
  });
  test('medico assume o orfao no primeiro save do laudo (payload real do salvarLaudo)', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'exNovoRita'),
      { medidas: { ddve: 50 }, pacienteNome: 'PACIENTE NOVO', status: 'andamento', medicoUid: DR_A2 }));
  });
```

- [ ] **Step 2: Rodar**

Run: `npm run test:rules`
Expected: PASS já (a regra da Seção 1 sempre permitiu; o bug era o CÓDIGO nunca deixar o campo ausente). Ficam como rede de proteção do contrato.

- [ ] **Step 3: `saveExame` — não gravar autor vazio** (`src/lib/firestore.ts`, ramo de criação; o cinto de ACC fica como está — ver Task 7 Step 6)

```ts
      const ref = doc(collection(db, 'workspaces', wsId, 'exames'));
      // medicoUid vazio = exame sem autor (recepcao cadastra; o medico assume
      // no primeiro salvarLaudo — e o que a regra de update espera).
      await setDoc(ref, {
        id: ref.id, ...dados,
        status: (dados.status as string) || 'rascunho', versao: 1,
        ...(medicoUid ? { medicoUid } : {}),
        criadoEm: now()
      });
      return ref.id;
```

- [ ] **Step 4: Worklist — só quem assina carimba**

a) import: `import { podeEditarLaudo, podeRemoverDaFila, ehMedico } from '@/lib/permissoes';`

b) logo após os states, um derivado (perfil médico E papel que atende — MEDREC fica de fora):

```ts
  // Quem pode nascer como AUTOR de exame: perfil medico E papel dono/medico
  // no local (MEDREC — medico de perfil com papel recepcao — nao assina aqui).
  const assinaComoAutor = ehMedico(profile) && (papel === 'dono' || papel === 'medico');
```

c) no cadastro manual (`handleSalvarPaciente`, ramo novo):

```ts
        medicoExecutor: assinaComoAutor ? (profile?.nome as string || '') : '',
        sexo: pacSexo,
        origem: 'MANUAL',
      }, assinaComoAutor ? (profile?.id as string || '') : '');
```

d) em `abrirNovoPaciente`: `setPacSolicitante(assinaComoAutor ? (profile?.nome as string || '') : '');`

(O batch do `importarFeegow` NÃO muda aqui — a Task 7 o substitui por inteiro; nada vai a produção antes da T12.)

- [ ] **Step 5: `salvarLaudo` assume o órfão** — em `src/app/laudo/[id]/page.tsx`:

```ts
  async function salvarLaudo(status: 'rascunho' | 'andamento', extras?: Record<string, unknown>) {
    if (!workspace?.id || !exameId || !user?.uid) return false;
    // medicoUid no save: assume o exame orfao (cadastrado pela recepcao) no
    // primeiro salvamento. Se ja e o autor, reenvia o mesmo valor (intacto
    // permite); se o autor e OUTRO medico, a regra nega — como deve.
    const dados = { id: exameId, medidas: coletarMedidas(), ...coletarIdentificacao(), status, medicoUid: user.uid, ...extras };
    return await saveExame(workspace.id, dados, user.uid);
  }
```

- [ ] **Step 6: Verificar**

Run: `npm run test:rules && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/firestore.ts src/components/Worklist.tsx src/app/laudo/[id]/page.tsx tests/rules/regras.test.mjs
git commit -m "fix(worklist): autor so nasce de quem assina; salvarLaudo assume exame orfao" && git push
```

---

### Task 3: Edição atômica ficha+exame, corrida do modal, CPF propaga (Achados 3, 5, 8, 21)

**Files:**
- Modify: `src/components/Worklist.tsx` (`editarPaciente`, `abrirNovoPaciente`, `handleSalvarPaciente`)

**Interfaces:**
- Consumes: regra da Task 1 (o batch de edição é exatamente o `payloadEditarExame`).

- [ ] **Step 1: Guard de corrida no modal**

Import: `import { useState, useEffect, useCallback, useRef } from 'react';`

```ts
  // Guard de corrida do modal (Achado 5): cada abertura incrementa a geracao;
  // resposta atrasada de getPaciente de uma abertura anterior e descartada.
  const editReq = useRef(0);
```

Em `abrirNovoPaciente`, primeira linha: `editReq.current++;`

Em `editarPaciente`:

```ts
  async function editarPaciente(item: ExameItem) {
    const req = ++editReq.current;
    setEditPacId(item.pacienteId as string || null);
    // ... (todos os sets existentes, inalterados) ...
    setModalPac(true);
    if (item.pacienteId && workspace?.id) {
      const pac = await getPaciente(workspace.id, item.pacienteId as string) as Record<string, unknown> | null;
      if (req !== editReq.current) return; // modal ja e de OUTRO paciente
      if (pac) {
        if (pac.cpf) setPacCpf(pac.cpf as string);
        if (pac.telefone) setPacTel(pac.telefone as string);
      }
    }
  }
```

- [ ] **Step 2: Edição atômica com CPF propagado** — substituir o ramo `if (editExameId)` inteiro de `handleSalvarPaciente` (o `savePaciente` sai do caminho de edição):

```ts
    if (editExameId) {
      // Edicao: ficha + exame na MESMA escrita (Achado 3 — antes a ficha
      // salvava e o exame falhava, com a tela dizendo que nada gravou).
      try {
        const batch = writeBatch(db);
        const dadosFicha = { ...pacData, atualizadoEm: serverTimestamp() };
        delete dadosFicha.id;
        if (editPacId) {
          batch.update(doc(db, 'workspaces', workspace.id, 'pacientes', editPacId), dadosFicha);
        }
        batch.update(doc(db, 'workspaces', workspace.id, 'exames', editExameId), {
          pacienteNome: pacNome.trim().toUpperCase(),
          pacienteDtnasc: pacDtnasc,
          convenio: pacConvenio,
          solicitante: pacSolicitante,
          tipoExame: pacTipoExame,
          sexo: pacSexo,
          // Achado 8: CPF e a chave de pareamento DICOM — propaga pro exame.
          // Vazio = "nao mexer" (mesma filosofia do #7c da ficha): esvaziar o
          // campo NAO apaga o CPF gravado.
          ...(cpfLimpo ? { cpf: cpfLimpo } : {}),
          atualizadoEm: serverTimestamp(),
        });
        await batch.commit();
      } catch (e) {
        console.error('editar paciente:', e);
        setPacErro('Não foi possível salvar a alteração. Nada foi gravado. (Detalhe no Console — F12.)');
        setPacLoading(false);
        return;
      }
    } else {
```

No ramo de novo paciente: manter `savePaciente` + `saveExame` (Task 2 já ajustou), trocar os dois `pacCpf.replace(/\D/g, '')` restantes por `cpfLimpo` (Achado 21) e corrigir a mensagem de erro pra ser honesta:

```ts
      if (!novoExameId) {
        setPacErro('A ficha do paciente foi salva, mas o exame NÃO entrou na fila. Tente salvar de novo. (Detalhe no Console — F12.)');
        setPacLoading(false);
        return;
      }
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run test:rules`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/Worklist.tsx
git commit -m "fix(worklist): edicao atomica ficha+exame, guard de corrida no modal, CPF propaga" && git push
```

---

### Task 4: Corrida na busca de CPF do Feegow (Achado 6)

**Files:**
- Modify: `src/components/Worklist.tsx` (`buscarCpfFeegow`)

- [ ] **Step 1: Ref com o CPF atual + guard na resposta**

```ts
  // CPF atual do campo, conferido na CHEGADA da resposta (Achado 6): se o
  // usuario corrigiu o CPF enquanto a busca A voava, a resposta de A e descartada.
  const pacCpfRef = useRef('');
  useEffect(() => { pacCpfRef.current = pacCpf.replace(/\D/g, ''); }, [pacCpf]);
```

Em `buscarCpfFeegow`, logo após `const data = await res.json();`:

```ts
      if (pacCpfRef.current !== cpfLimpo) return; // campo ja tem OUTRO cpf
```

- [ ] **Step 2: Verificar e commitar**

Run: `npx tsc --noEmit`

```bash
git add src/components/Worklist.tsx
git commit -m "fix(worklist): descarta resposta atrasada da busca de CPF no Feegow" && git push
```

---

### Task 5: Fonte única de tempo BRT (Achado 12)

Quatro implementações de "hoje" divergem (utils local, feegow Intl-Belém, cron `-3h`, listenNaoRealizados UTC). Unificar em `utils.ts` — que também ganha `agoraBelem()` (a Task 7 consome no servidor; sem isso ela criaria a 4ª implementação de fuso, apontado pela tríade).

**Files:**
- Modify: `src/lib/utils.ts`
- Modify: `src/lib/firestore.ts` (`listenNaoRealizados`)
- Modify: `src/app/api/feegow/route.ts` (remove a cópia local)
- Test: `tests/unit/data-brt.test.mjs` (novo — importa o TS real, padrão `permissoes.test.mjs`)

**Interfaces:**
- Produces: `dataLocalBRT(d: Date): string`, `dataLocalHoje(): string`, `agoraBelem(): Date` em `src/lib/utils.ts` — Tasks 6 e 7 consomem.

- [ ] **Step 1: Teste que falha** — `tests/unit/data-brt.test.mjs`:

```js
// Fonte unica de "hoje/agora" no fuso da clinica (Achado 12 da Secao 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataLocalBRT, agoraBelem } from '../../src/lib/utils.ts';

test('01h30 UTC ainda e o dia anterior em Belem', () => {
  assert.equal(dataLocalBRT(new Date('2026-08-13T01:30:00Z')), '2026-08-12');
});
test('12h UTC e o mesmo dia em Belem', () => {
  assert.equal(dataLocalBRT(new Date('2026-08-12T12:00:00Z')), '2026-08-12');
});
test('agoraBelem devolve Date cuja data local casa com dataLocalHoje', () => {
  const d = agoraBelem();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(ymd, dataLocalBRT(new Date()));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:unit`
Expected: FAIL — `dataLocalBRT`/`agoraBelem` não existem.

- [ ] **Step 3: Implementar em `src/lib/utils.ts`** — substituir a `dataLocalHoje` atual por:

```ts
// Fonte UNICA de tempo no fuso da clinica (America/Belem, UTC-3 fixo).
// Roda igual em cliente e servidor (Vercel = UTC; depois das 21h BRT o
// new Date() do servidor ja virou o dia — bug real de 22/06/2026).
const FUSO_CLINICA = 'America/Belem';

export function dataLocalBRT(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export function dataLocalHoje(): string {
  return dataLocalBRT(new Date());
}

// "Agora" como Date cujos getters LOCAIS devolvem os componentes de Belem —
// pro gerarAccessionNumber funcionar igual no Vercel (UTC) e na clinica (BRT).
export function agoraBelem(): Date {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO_CLINICA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((a, x) => ({ ...a, [x.type]: x.value }), {} as Record<string, string>);
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, new Date().getMilliseconds());
}
```

- [ ] **Step 4: Trocar os call-sites divergentes**

a) `src/lib/firestore.ts` — import vira `import { dataLocalHoje, dataLocalBRT } from './utils';` e o começo de `listenNaoRealizados` vira:

```ts
export function listenNaoRealizados(wsId: string, callback: (items: Record<string, unknown>[]) => void, dias: number = 30): Unsubscribe {
  const dataLimite = dataLocalBRT(new Date(Date.now() - dias * 86400000));
```

b) `src/app/api/feegow/route.ts` — apagar o bloco `const CLINIC_TZ ... function dataLocalHoje() {...}` (linhas ~110-118) e adicionar `import { dataLocalHoje } from '@/lib/utils';` (manter uma linha de comentário apontando o bug de 22/06 pra história).

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test:unit && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils.ts src/lib/firestore.ts src/app/api/feegow/route.ts tests/unit/data-brt.test.mjs
git commit -m "fix(fuso): dataLocalBRT/agoraBelem unicos em America/Belem (cliente e servidor)" && git push
```

---

### Task 6: Cron fail-closed, init compartilhado, chunking, erro visível (Achados 4, 9-cron, 19 + Codex-10)

**Files:**
- Modify: `src/app/api/cron/cleanup-worklist/route.ts` (reescrever)

- [ ] **Step 1: Reescrever a rota**

```ts
// ══════════════════════════════════════════════════════════════════
// SOULEO · Cron auto-cleanup worklist (Vercel Cron)
// Roda 1x/dia a meia-noite BRT (03:00 UTC)
// Exames com dataExame<hoje E status='aguardando' viram 'nao-realizado'
// Wader detecta a mudanca e remove .wl da pasta worklists/
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/auth-admin';
import { dataLocalHoje } from '@/lib/utils';

export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET || '';
const CHUNK = 400; // limite Firestore = 500 ops/batch

export async function GET(req: NextRequest) {
  // FAIL-CLOSED (Achado 4): sem secret configurado em producao, NAO roda.
  // Em dev (NODE_ENV != production) continua liberado pra teste local.
  if (!CRON_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'CRON_SECRET ausente' }, { status: 500 });
    }
  } else if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const dbAdmin = adminDb();
  const dataHoje = dataLocalHoje();

  let total = 0;
  const detalhes: { wsId: string; marcados: number }[] = [];
  const erros: string[] = [];

  try {
    const wsSnap = await dbAdmin.collection('workspaces').get();

    for (const wsDoc of wsSnap.docs) {
      const wsId = wsDoc.id;
      try {
        const examesSnap = await dbAdmin
          .collection(`workspaces/${wsId}/exames`)
          .where('status', '==', 'aguardando')
          .where('dataExame', '<', dataHoje)
          .get();
        if (examesSnap.empty) continue;

        // Chunking (Achado 9): batch unico estourava o limite de 500 e
        // NENHUM exame era marcado — com a resposta ainda dizendo ok.
        const docs = examesSnap.docs;
        for (let i = 0; i < docs.length; i += CHUNK) {
          const batch = dbAdmin.batch();
          docs.slice(i, i + CHUNK).forEach(d => {
            batch.update(d.ref, {
              status: 'nao-realizado',
              naoRealizadoEm: new Date().toISOString(),
            });
          });
          await batch.commit();
        }
        total += docs.length;
        detalhes.push({ wsId, marcados: docs.length });
      } catch (e) {
        erros.push(`${wsId}: ${e instanceof Error ? e.message : 'erro'}`);
      }
    }

    // Erro parcial = 500 (Codex-10): 2xx faria monitor/log do Vercel tratar
    // como sucesso. O corpo preserva o que JA foi processado.
    return NextResponse.json({
      ok: erros.length === 0,
      hoje: dataHoje,
      totalMarcados: total,
      detalhes,
      erros: erros.length > 0 ? erros : undefined,
    }, { status: erros.length > 0 ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar e commitar**

Run: `npx tsc --noEmit`. Anotar pra T12: conferir `CRON_SECRET` no painel Vercel.

```bash
git add src/app/api/cron/cleanup-worklist/route.ts
git commit -m "fix(cron): fail-closed sem CRON_SECRET, init compartilhado, chunking, 500 em erro parcial" && git push
```

---

### Task 7: Importação Feegow no SERVIDOR — autorizada, atômica, idempotente (Achados 7, 9-import, 10, 14, 18 + Codex-1/2/5/6/11)

`/api/feegow?action=importar` já monta os candidatos no servidor; a gravação migra pra `src/lib/feegow-admin.ts` (padrão `exame-admin.ts`). Decisões da tríade embutidas: **autorização por vínculo** (`resolverPapel` — sem ela qualquer logado gravaria em qualquer clínica), **autor só se perfil médico E papel dono/medico** (MEDREC não carimba), **transação por candidato** com `tx.create` (idempotente sob concorrência; só `ALREADY_EXISTS` vira retry de ACC), **ids validados** (`/^\d+$/`), reserva `accIndex/{acc}` só no servidor, `agoraBelem` de utils, init do Admin via `auth-admin`.

**Files:**
- Create: `src/lib/feegow-admin.ts`
- Modify: `src/app/api/feegow/route.ts` (init via auth-admin; `montarCandidatos`; POST `action:'importar'`)
- Modify: `src/components/Worklist.tsx` (`importarFeegow` vira um POST; morre o batch client + dedup por nome)
- Modify: `src/lib/firestore.ts` (só comentário `ponytail:` no cinto de ACC)
- Test: `tests/api/feegow-admin.test.mjs` (novo)

**Interfaces:**
- Consumes: `agoraBelem` (Task 5); `resolverPapel`, `ehMedicoDeVerdade` de `src/lib/exame-admin.ts` (já exportados); `gerarAccessionNumber` (existente).
- Produces: `gravarImportacao(dbAdmin, { wsId, candidatos, uid, ehMed, nomeCriador }): Promise<{ criados: Array<{ exameId: string; pac: Candidato }> }>`; convenção `accIndex/{acc}` = `{ exameId, criadoEm }` (SÓ servidor — Admin SDK ignora regras; nenhuma mudança em firestore.rules); resposta do POST: `{ ok, total, criados }`.

- [ ] **Step 1: Teste no emulador — `tests/api/feegow-admin.test.mjs`** (padrão `billing-admin.test.mjs`: importa TS direto, `initializeApp({ projectId: 'leo-testes' })`)

```js
// Importacao Feegow server-side (Secao 2, A7/A9/A10/A14). Emulador Firestore.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { gravarImportacao } from '../../src/lib/feegow-admin.ts';

let db;
const WS = 'wsFeegow';
const candidato = (appointId, extra = {}) => ({
  feegowAppointId: appointId, feegowPacienteId: 900 + appointId,
  pacienteNome: `PACIENTE ${appointId}`, pacienteDtnasc: '1980-01-02', sexo: 'F',
  cpf: `0000000000${appointId}`, telefone: '91999990000', convenio: 'UNIMED',
  tipoExame: 'eco_tt', medicoExecutor: '', horarioChegada: '10:30',
  dataExame: '2026-08-12', ...extra,
});

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: 'contaF', nomeClinica: 'Feegow Teste' });
});

describe('gravarImportacao', () => {
  test('grava exames fg-<appointId>, pacientes e reservas de ACC', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(1), candidato(2)], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 2);
    const ex1 = (await db.doc(`workspaces/${WS}/exames/fg-1`).get()).data();
    assert.equal(ex1.status, 'aguardando');
    assert.equal(ex1.medicoUid, undefined); // quem nao assina NAO carimba autor
    assert.equal(ex1.medicoExecutor, '');
    assert.ok((await db.doc(`workspaces/${WS}/accIndex/${ex1.acc}`).get()).exists, 'reserva de ACC criada');
  });
  test('re-importar os mesmos candidatos e idempotente', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(1), candidato(2)], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 0);
  });
  test('duas importacoes CONCORRENTES nao duplicam nem sobrescrevem', async () => {
    const [a, b] = await Promise.all([
      gravarImportacao(db, { wsId: WS, candidatos: [candidato(6)], uid: 'u1', ehMed: false, nomeCriador: 'X' }),
      gravarImportacao(db, { wsId: WS, candidatos: [candidato(6)], uid: 'u2', ehMed: false, nomeCriador: 'Y' }),
    ]);
    assert.equal(a.criados.length + b.criados.length, 1); // exatamente UM venceu
  });
  test('campo opcional undefined nao derruba a importacao', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(3, { telefone: undefined, sexo: undefined })],
      uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 1);
    assert.equal((await db.doc(`workspaces/${WS}/exames/fg-3`).get()).data().sexo, '');
  });
  test('appointId nao-numerico e descartado (path safety)', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato('7/../x')], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 0);
  });
  test('medico importando carimba medicoUid e ACCs nao colidem', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(4), candidato(5)], uid: 'uidDrA', ehMed: true, nomeCriador: 'Dr A',
    });
    assert.equal(criados.length, 2);
    const ex4 = (await db.doc(`workspaces/${WS}/exames/fg-4`).get()).data();
    const ex5 = (await db.doc(`workspaces/${WS}/exames/fg-5`).get()).data();
    assert.equal(ex4.medicoUid, 'uidDrA');
    assert.notEqual(ex4.acc, ex5.acc);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:api`
Expected: FAIL — `feegow-admin` não existe.

- [ ] **Step 3: Criar `src/lib/feegow-admin.ts`**

```ts
// ══════════════════════════════════════════════════════════════════
// LEO · Importacao Feegow server-side (Secao 2, Achado 14)
// A rota /api/feegow compoe (auth + papel); a logica vive aqui —
// testavel no emulador, padrao exame-admin.ts. Admin SDK ignora regras:
// a AUTORIZACAO (resolverPapel) e responsabilidade do chamador.
// ══════════════════════════════════════════════════════════════════
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { gerarAccessionNumber } from './gerarAccessionNumber';
import { agoraBelem } from './utils';

export type Candidato = {
  feegowAppointId: number | string;
  feegowPacienteId?: number | string;
  pacienteNome?: string; pacienteDtnasc?: string; sexo?: string;
  cpf?: string; telefone?: string; convenio?: string;
  tipoExame?: string; medicoExecutor?: string;
  horarioChegada?: string; dataExame?: string;
};

const jaExiste = (e: unknown) =>
  (e as { code?: number })?.code === 6 || String(e).includes('ALREADY_EXISTS');

export async function gravarImportacao(dbAdmin: Firestore, args: {
  wsId: string; candidatos: Candidato[]; uid: string; ehMed: boolean; nomeCriador: string;
}): Promise<{ criados: Array<{ exameId: string; pac: Candidato }> }> {
  const { wsId, candidatos, uid, ehMed, nomeCriador } = args;
  const base = agoraBelem();
  const criados: Array<{ exameId: string; pac: Candidato }> = [];

  for (let seq = 0; seq < candidatos.length; seq++) {
    const c = candidatos[seq];
    // Path safety (Codex-11): id externo entra em path do Firestore.
    const fgId = String(c.feegowAppointId ?? '');
    if (!/^\d+$/.test(fgId)) continue;
    const fgPacId = /^\d+$/.test(String(c.feegowPacienteId ?? '')) ? String(c.feegowPacienteId) : null;

    const exameRef = dbAdmin.doc(`workspaces/${wsId}/exames/fg-${fgId}`);
    try {
      // Transacao por candidato: exame + reserva de ACC nascem JUNTOS.
      // tx.create falha com ALREADY_EXISTS se o exame ja existe (re-import,
      // 2 POSTs concorrentes) — idempotencia real, nao check-then-write.
      await dbAdmin.runTransaction(async (tx: Transaction) => {
        let acc = '';
        for (let t = 0; t < 5; t++) {
          const tent = gerarAccessionNumber(base, seq * 10 + t * 100);
          const res = await tx.get(dbAdmin.doc(`workspaces/${wsId}/accIndex/${tent}`));
          if (!res.exists) { acc = tent; break; }
        }
        if (!acc) throw new Error('ACC: 5 colisoes seguidas na importacao');

        const pacRef = fgPacId
          ? dbAdmin.doc(`workspaces/${wsId}/pacientes/fg-${fgPacId}`)
          : dbAdmin.collection(`workspaces/${wsId}/pacientes`).doc();
        // `?? ''` em todo opcional: um unico undefined derruba a escrita (A10).
        tx.set(pacRef, {
          id: pacRef.id, nome: c.pacienteNome ?? '', cpf: c.cpf ?? '',
          dtnasc: c.pacienteDtnasc ?? '', sexo: c.sexo ?? '',
          telefone: c.telefone ?? '', feegowPacienteId: fgPacId,
          criadoEm: FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.create(exameRef, {
          id: exameRef.id, acc,
          pacienteId: pacRef.id,
          pacienteNome: c.pacienteNome ?? '', pacienteDtnasc: c.pacienteDtnasc ?? '',
          cpf: c.cpf ?? '', feegowPacienteId: fgPacId,
          tipoExame: c.tipoExame ?? '', dataExame: c.dataExame ?? '',
          horarioChegada: c.horarioChegada ?? '', status: 'aguardando',
          convenio: c.convenio ?? '',
          solicitante: ehMed ? nomeCriador : '',
          medicoExecutor: c.medicoExecutor || (ehMed ? nomeCriador : ''),
          sexo: c.sexo ?? '', origem: 'FEEGOW',
          feegowAppointId: fgId,
          ...(ehMed ? { medicoUid: uid } : {}),
          versao: 1, criadoEm: FieldValue.serverTimestamp(),
        });
        tx.create(dbAdmin.doc(`workspaces/${wsId}/accIndex/${acc}`), {
          exameId: exameRef.id, criadoEm: FieldValue.serverTimestamp(),
        });
      });
      criados.push({ exameId: exameRef.id, pac: c });
    } catch (e) {
      if (jaExiste(e)) continue; // exame ja na fila (re-import/concorrencia) — pula
      throw e; // qualquer outro erro NAO e colisao: propaga (Codex-5)
    }
  }

  if (criados.length > 0) {
    await dbAdmin.collection('logs').add({
      tipo: 'importar_feegow', wsId, quantidade: criados.length,
      por: uid, ts: FieldValue.serverTimestamp(),
    });
  }
  return { criados };
}
```

- [ ] **Step 4: Rodar os testes do emulador**

Run: `npm run test:api`
Expected: PASS (6 casos).

- [ ] **Step 5: Rota — init compartilhado + `montarCandidatos` + POST autorizado**

Em `src/app/api/feegow/route.ts`:

a) **Init:** apagar o bloco `if (!getApps().length) initializeApp({...})` + `const fbAuth/dbAdmin` (linhas ~12-23) e usar o compartilhado (Arq-3):

```ts
import { adminDb, adminAuth } from '@/lib/auth-admin';
import { resolverPapel, ehMedicoDeVerdade } from '@/lib/exame-admin';
import { gravarImportacao, type Candidato } from '@/lib/feegow-admin';

const fbAuth = adminAuth();
const dbAdmin = adminDb();
```

b) **Extração:** mover o corpo do `case 'importar'` do GET (resolução de procMap/profMap/convMap + loop de agendamentos, linhas ~273-343) pra função no mesmo arquivo, `verbatim`:

```ts
// Monta a lista de candidatos da sala de espera Feegow (era o case 'importar'
// do GET — corpo movido sem alteracao). NAO grava nada.
async function montarCandidatos(token: string, wsId: string | null): Promise<Candidato[]> {
  // ... corpo identico ao case atual, terminando em `return pacientes;` ...
}
```

O GET vira: `case 'importar': { const pacientes = await montarCandidatos(token, req.nextUrl.searchParams.get('wsId')); return NextResponse.json({ ok: true, total: pacientes.length, pacientes }); }` — resposta byte-idêntica à atual (conferir chamando o GET no preview antes/depois).

c) **POST:** antes do `return action invalida`:

```ts
    if (body.action === 'importar') {
      const wsId = req.nextUrl.searchParams.get('wsId');
      if (!wsId) return NextResponse.json({ ok: false, error: 'wsId obrigatorio' }, { status: 400 });
      const uid = await verificarAuth(req);
      if (!uid) return NextResponse.json({ ok: false, error: 'nao autenticado' }, { status: 401 });
      // AUTORIZACAO (Codex-1): Admin SDK ignora as regras — sem esta checagem
      // qualquer logado gravaria exames em QUALQUER clinica via wsId alheio.
      const papel = await resolverPapel(dbAdmin, wsId, uid);
      if (!papel) return NextResponse.json({ ok: false, error: 'sem_acesso_ao_local' }, { status: 403 });
      // Autor so se perfil medico E papel que atende (MEDREC nao carimba) — Codex-2.
      const ehMed = (papel === 'dono' || papel === 'medico') && await ehMedicoDeVerdade(dbAdmin, uid);
      const perfilSnap = await dbAdmin.doc(`profissionais/${uid}`).get();
      const candidatos = await montarCandidatos(token, wsId);
      const { criados } = await gravarImportacao(dbAdmin, {
        wsId, candidatos, uid, ehMed, nomeCriador: (perfilSnap.data()?.nome as string) || '',
      });
      return NextResponse.json({ ok: true, total: candidatos.length, criados });
    }
```

- [ ] **Step 6: Cliente encolhe + comentário no cinto**

a) Em `src/components/Worklist.tsx`, substituir `importarFeegow` INTEIRO (morrem: dedup por nome, `semAppt`, `writeBatch` do import, `getDoc` de existência — Achado 18):

```ts
  async function importarFeegow() {
    if (!workspace?.id) return;
    setFeegowLoading(true);
    try {
      const res = await feegowAuthFetch(`/api/feegow?wsId=${workspace.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'importar' }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error === 'sem_acesso_ao_local'
          ? 'Seu usuário não tem acesso a este local.'
          : (data.error || 'Erro ao importar do Feegow.'));
      } else if (data.criados.length === 0) {
        alert(data.total === 0 ? 'Nenhum paciente aguardando no Feegow.' : 'Todos os pacientes do Feegow já estão na fila.');
      } else {
        // ponytail: MWL continua saindo do cliente (o /api/orthanc ja autentica);
        // fechar a aba no meio = MWL perdido, sem retry — o indicador SEM MWL
        // (mwlStatus) da visibilidade. Mover pro servidor se virar dor real.
        for (const { exameId, pac } of data.criados) {
          await enviarMwlOrthanc({
            wsId: workspace.id, exameId,
            pacienteNome: pac.pacienteNome, pacienteId: pac.cpf,
            pacienteDtnasc: pac.pacienteDtnasc, sexo: pac.sexo,
            tipoExame: pac.tipoExame, dataExame: pac.dataExame,
            horarioChegada: pac.horarioChegada,
            medicoNome: assinaComoAutor ? (profile?.nome as string || '') : '',
          });
        }
        alert(`${data.criados.length} paciente(s) importado(s) do Feegow!`);
      }
    } catch (e) {
      console.error('importarFeegow:', e);
      alert('Erro ao conectar com o Feegow.');
    }
    setFeegowLoading(false);
  }
```

Limpar imports que ficarem órfãos (conferir com tsc — `writeBatch`/`serverTimestamp`/`doc` continuam usados pela Task 3; `getDoc`/`collection`/`DocumentReference` do import provavelmente saem).

b) Em `src/lib/firestore.ts`, no cinto de ACC do `saveExame` (que fica), adicionar uma linha ao comentário existente:

```ts
      // ponytail: check-then-write nao-transacional — janela residual so no
      // cadastro MANUAL simultaneo em 2 maquinas no MESMO centesimo (hhmmsscc
      // + contador de sessao). Import em lote reserva accIndex no servidor
      // (feegow-admin). Trocar por transacao se algum dia colidir de novo.
```

- [ ] **Step 7: Verificar**

Run: `npm run test:api && npx tsc --noEmit`
Expected: PASS. No preview (conta Gmail PJ): GET importar responde igual ao de antes; POST importa; segundo POST responde `criados: []`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/feegow-admin.ts src/app/api/feegow/route.ts src/components/Worklist.tsx src/lib/firestore.ts tests/api/feegow-admin.test.mjs
git commit -m "feat(feegow): importacao no servidor — autorizada por vinculo, atomica, idempotente, auditada" && git push
```

---

### Task 8: Busca por CPF de verdade (Achado 11)

**Files:**
- Modify: `src/components/Worklist.tsx:504-512`

- [ ] **Step 1: Corrigir o filtro** (a variável `cpf` lia `pacienteDtnasc`)

```ts
  const filtrada = fonteDados.filter(it => {
    if (statusSel !== 'todos' && statusSel !== 'nao-realizado' && it.status !== statusSel) return false;
    if (busca) {
      const nome = (it.pacienteNome as string || '').toLowerCase();
      const cpf = String(it.cpf ?? '');
      const buscaDigitos = busca.replace(/\D/g, '');
      if (!nome.includes(busca.toLowerCase()) && !(buscaDigitos && cpf.includes(buscaDigitos))) return false;
    }
    return true;
  });
```

Placeholder do input: `placeholder="Buscar por nome ou CPF..."`.

- [ ] **Step 2: Verificar e commitar**

Run: `npx tsc --noEmit`

```bash
git add src/components/Worklist.tsx
git commit -m "fix(worklist): busca compara CPF de verdade (lia data de nascimento)" && git push
```

---

### Task 9: Timer de espera só no dia de hoje (Achado 13)

**Files:**
- Modify: `src/components/Worklist.tsx:595`

- [ ] **Step 1:**

```ts
              const espera = item.status === 'aguardando' && dataSel === dataLocalHoje()
                ? calcEspera(item.horarioChegada as string)
                : { texto: '', alerta: false };
```

- [ ] **Step 2: Verificar e commitar**

Run: `npx tsc --noEmit`

```bash
git add src/components/Worklist.tsx
git commit -m "fix(worklist): timer de espera so aparece na data de hoje" && git push
```

---

### Task 10: Estado do MWL visível (Achado 15) — regra + código juntos

**Files:**
- Modify: `firestore.rules:92-97` (whitelist ganha `mwlStatus`)
- Modify: `src/components/Worklist.tsx` (`enviarMwlOrthanc` + indicador)
- Test: `tests/rules/regras.test.mjs` (seção 14)

- [ ] **Step 1: Testes que falham** (inclui exame COM autor — Codex-9):

```js
  test('recepcao grava mwlStatus (resultado do envio ao aparelho)', async () => {
    await assertSucceeds(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFila1'), { mwlStatus: 'falhou' }));
  });
  test('recepcao grava mwlStatus em exame aguardando COM autor', async () => {
    await assertSucceeds(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exComAutor'), { mwlStatus: 'enviado' }));
  });
```

Run: `npm run test:rules` → Expected: FAIL (fora da whitelist).

- [ ] **Step 2: Whitelist + código**

a) `firestore.rules`, em `camposAdministrativos()`, acrescentar `'mwlStatus'` (após `'medicoUid'`).

b) `Worklist.tsx`, `enviarMwlOrthanc` (assinatura igual):

```ts
async function enviarMwlOrthanc(dados: { /* assinatura existente inalterada */ }) {
  try {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/orthanc', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token || ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'criar_mwl', ...dados }),
    });
    const result = await res.json();
    // Achado 15: persistir o resultado — a fila mostra quando a worklist
    // NAO chegou ao aparelho (antes era um console.warn que ninguem via).
    await updateDoc(doc(db, 'workspaces', dados.wsId, 'exames', dados.exameId), {
      mwlStatus: result.ok ? 'enviado' : 'falhou',
    });
    if (!result.ok) console.warn('Orthanc MWL falhou:', result.error);
  } catch (e) {
    console.error('Orthanc MWL:', e);
    try {
      await updateDoc(doc(db, 'workspaces', dados.wsId, 'exames', dados.exameId), { mwlStatus: 'falhou' });
    } catch { /* offline total: fica sem status */ }
  }
}
```

(imports `doc`/`updateDoc`/`db` já existem no arquivo.)

c) na célula do paciente (após o span de origem):

```tsx
                      {item.mwlStatus === 'falhou' && (
                        <span title="Worklist não chegou ao aparelho — digite o ACC manualmente no Vivid"
                          className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-600">
                          📡 SEM MWL
                        </span>
                      )}
```

- [ ] **Step 3: Rodar e ver passar**

Run: `npm run test:rules && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules src/components/Worklist.tsx tests/rules/regras.test.mjs
git commit -m "feat(worklist): mwlStatus persistido + indicador SEM MWL (regra+codigo)" && git push
```

---

### Task 11: Cortes Ponytail (Achados 17, 20, 22)

**Files:**
- Modify: `src/components/Worklist.tsx`

- [ ] **Step 1:** Cortar o botão "📋 Laudo rápido" (~:538-541) — clone do "+ Paciente" com rótulo que mente.

- [ ] **Step 2:** Listener de não-realizados sob demanda (Achado 20):

```ts
  // Aba passiva de auditoria: so assina os 30 dias quando o filtro abre
  // (antes rodava em todo mount — leitura Firestore permanente a toa).
  useEffect(() => {
    if (!wsId || statusSel !== 'nao-realizado') return;
    const unsub = listenNaoRealizados(wsId, (items) => {
      setNaoRealizados(items as ExameItem[]);
    }, 30);
    return () => unsub();
  }, [wsId, statusSel]);
```

Contador do botão: `🚫 Não realizados{statusSel === 'nao-realizado' ? ` (${naoRealizados.length})` : ''}`.

- [ ] **Step 3:** Completar `ExameItem` (Achado 22):

```ts
type ExameItem = Record<string, unknown> & {
  id: string; pacienteId?: string; pacienteNome?: string; pacienteDtnasc?: string;
  status?: string; tipoExame?: string; dataExame?: string; horarioChegada?: string;
  convenio?: string; solicitante?: string; sexo?: string; origem?: string;
  feegowAppointId?: string | number; medicoUid?: string;
  acc?: string; cpf?: string; imagensDicom?: string[]; mwlStatus?: string;
};
```

- [ ] **Step 4: Verificar e commitar**

Run: `npx tsc --noEmit`

```bash
git add src/components/Worklist.tsx
git commit -m "chore(worklist): cortes ponytail — botao clone, listener sob demanda, tipo completo" && git push
```

---

### Task 12: Verificação final, publicação de regras ANTES do merge, entrega

**Ordem importa (Codex-4):** as regras novas são ADITIVAS (ramo de membro + `mwlStatus`) — código velho funciona com elas, mas código novo NÃO funciona com regras velhas (recepção editando, mwlStatus). Publicar regras primeiro elimina a janela quebrada.

- [ ] **Step 1: Bateria completa**

```bash
npm run test:unit && npm run test:rules && npm run test:api && npx tsc --noEmit && npm run build
```

Expected: tudo PASS.

- [ ] **Step 2: ⚠️ CONFIRMAR COM O SERGIO e publicar as regras**

```bash
node scripts/secao1/04-publicar-regras.mjs --commit
```

**NÃO rodar sem confirmação explícita.** Conferir também `CRON_SECRET` no painel Vercel (T6 tornou obrigatória em produção).

- [ ] **Step 3: Verificação no preview (fluxo real de ponta a ponta, já com regras novas)**

Conta de teste Gmail PJ — NUNCA a Yahoo: (1) recepção cadastra paciente → exame nasce sem autor; (2) recepção edita paciente → ficha+exame juntos; (3) médico abre o rascunho da recepção, salva → assume o exame (medicoUid dele); (4) importar Feegow → exames via servidor, log `importar_feegow` gravado, re-clique não duplica; (5) buscar por CPF; (6) badge SEM MWL aparece se o Orthanc estiver fora.

- [ ] **Step 4: Encerrar a branch** — usar `superpowers:finishing-a-development-branch` (merge/PR = decisão do Sergio; a base `feat/secao1-plano2b-b2` entra na master primeiro).

- [ ] **Step 5: Documentar** — ADR em `docs/decisoes/2026-08-12-secao2-worklist-correcoes.md` (mudanças de modelo: exame órfão + assunção no salvarLaudo, ramo administrativo de membro, accIndex server-side, import Feegow autorizado no servidor, mwlStatus) + espelho Obsidian (`Leo/Decisões/`) + memória local + push.
