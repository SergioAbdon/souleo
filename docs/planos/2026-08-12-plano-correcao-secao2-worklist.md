# Plano de Correção — Seção 2 (Worklist) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 22 achados da revisão tríade da Seção 2 (`docs/planos/2026-08-12-revisao-secao2-worklist.md`): destravar o fluxo recepção→médico, fechar corridas de CPF/ACC (chave DICOM), alinhar a Worklist ao modelo da Seção 1.

**Architecture:** O código da Worklist é anterior à fechadura da Seção 1. As correções seguem o modelo estabelecido: regra + código + teste com payload real no MESMO commit; lógica de servidor vive em `src/lib/*-admin.ts` (testável no emulador) e a rota só compõe; escritas sensíveis migram pro servidor (import Feegow), escritas administrativas continuam client-side sob regra.

**Tech Stack:** Next.js (App Router) · Firebase Web SDK + Admin SDK · Firestore Rules · `node --test` + `@firebase/rules-unit-testing` (emulador).

## Global Constraints

- **Regra de ouro:** mudança de segurança entra em `firestore.rules` E no código no MESMO commit, com teste usando payload REAL (`tests/rules/fixtures.mjs`).
- **NÃO usar `git stash`** (daemon `.claude-flow` engole edições).
- **Commit + push após cada tarefa** (protocolo Dual Claude).
- **Publicar regras em produção** (`scripts/secao1/04-publicar-regras.mjs --commit`) é ação sensível: SÓ com confirmação do Sergio, uma única vez, na Tarefa 14.
- Branch de trabalho: `feat/secao2-worklist-fixes`, criada a partir de `feat/secao1-plano2b-b2` (as regras que este plano estende vivem lá).
- Testes: `npm run test:rules` (emulador Firestore) · `npm run test:unit` · `npm run test:api` (emulador Firestore+Auth). Build: `npm run build`.
- Ponytail full: menor diff que funciona; corner cortado de propósito ganha comentário `ponytail:`.
- Fuso da clínica: `America/Belem` (UTC-3 fixo, sem horário de verão).

**Mapa achado → tarefa:** A2→T1 · A1→T2 · A3,A5,A8,A21→T3 · A6→T4 · A12→T5 · A4,A9(cron),A19→T6 · A7→T7 · A14,A9(import),A10,A18→T8 · A11→T9 · A13→T10 · A15→T11 · A16→T12 · A17,A20,A22→T13 · deploy→T14.

---

### Task 0: Branch de trabalho

**Files:** nenhum (só git).

- [ ] **Step 1: Criar a branch**

```bash
git checkout feat/secao1-plano2b-b2 && git pull && git checkout -b feat/secao2-worklist-fixes && git push -u origin feat/secao2-worklist-fixes
```

---

### Task 1: Regra — membro do local edita o administrativo da fila (Achado 2)

A regra de update de `/exames` não tem caminho pra papel `recepcao`: o botão "👤 Editar" falha com `permission-denied` pra secretária. O ramo do dono já faz exatamente o que a recepção precisa (só administrativo, só não-emitido, `medicoUid` intacto) — a correção mínima é abrir esse ramo pra qualquer membro que alcança o local.

**Files:**
- Modify: `firestore.rules:165-170` (ramo dono do update de exames)
- Modify: `tests/rules/fixtures.mjs` (payloads reais novos)
- Modify: `tests/rules/regras.test.mjs` (seção nova + docs no `before()`)

**Interfaces:**
- Produces: `payloadCadastroExame(extra)` e `payloadEditarExame(extra)` em fixtures.mjs — usados pelas Tarefas 2, 11 e 12.

- [ ] **Step 1: Adicionar payloads reais em `tests/rules/fixtures.mjs`**

Espelham exatamente o que `Worklist.tsx` + `saveExame` enviam (cadastro) e o que a edição do modal envia. Anexar ao fim do arquivo:

```js
/**
 * Payload identico ao cadastro manual da Worklist (handleSalvarPaciente →
 * saveExame create, src/components/Worklist.tsx + src/lib/firestore.ts).
 * SEM medicoUid: apos a correcao do Achado 1, exame criado por nao-medico
 * nasce orfao (qualquer medico do local assume depois).
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
 * com editExameId → saveExame update). Inclui cpf (Achado 8) e atualizadoEm.
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

- [ ] **Step 2: Escrever os testes que falham (`tests/rules/regras.test.mjs`)**

No `before()`, depois da linha que cria `exSemAutor`, adicionar dois docs dedicados (não reutilizar `exSemAutor`, que outras seções mutam):

```js
    // Fila da Secao 2: exames aguardando para os testes da worklist (secao 14).
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'exFila1'), {
      pacienteNome: 'Fila Um', status: 'aguardando', cpf: '11111111111',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'exFila2'), {
      pacienteNome: 'Fila Dois', status: 'aguardando',
    });
```

No import do topo, acrescentar os payloads novos:

```js
import { payloadCreateProfile, payloadCadastroExame, payloadEditarExame } from './fixtures.mjs';
```

Ao fim do arquivo, seção nova:

```js
describe('14. worklist — recepcao administra a fila (Secao 2)', () => {
  test('recepcao edita administrativo de exame aguardando (payload real)', async () => {
    await assertSucceeds(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFila1'), payloadEditarExame()));
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
  test('recepcao NAO troca medicoUid de exame com autor', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A2}/exames`, 'ex2'), { medicoUid: RITA }));
  });
  test('medico de outro exame edita administrativo da fila (mesmo ramo)', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'exFila2'), { convenio: 'UNIMED' }));
  });
});
```

(Obs.: `recepcao NAO troca medicoUid` usa `ex2` de LOCAL_A2 — Rita só alcança LOCAL_A1, então falha por alcance E por intacto; trocar para um doc de LOCAL_A1 com autor se quiser isolar: criar `exComAutor` no before com `medicoUid: DR_A2, status: 'rascunho'` em LOCAL_A1 e testar contra ele. Fazer assim.)

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm run test:rules`
Expected: os testes `recepcao edita administrativo...` e `medico de outro exame edita...` FALHAM (permission-denied); os `assertFails` passam.

- [ ] **Step 4: Mudança mínima na regra**

Em `firestore.rules`, no ramo dono do update de `/exames` (linha ~165), trocar `ehDonoDoLocal(wsId)` por `alcancaLocal(wsId)` e ajustar o comentário:

```
                          || (alcancaLocal(wsId) && intacto('medicoUid')
                              && resource.data.get('status', '') != 'emitido'
                              && request.resource.data.get('status', '') != 'emitido'
                              // Qualquer membro do local (dono, medico, recepcao) so
                              // mexe no ADMINISTRATIVO da fila (pre-assinatura);
                              // campo clinico tocado aqui e negado (ADR 8.4).
                              && request.resource.data.diff(resource.data).affectedKeys().hasOnly(camposAdministrativos())));
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test:rules`
Expected: PASS (todas as seções, inclusive as antigas — o ramo dono continua coberto porque `alcancaLocal` inclui o dono).

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/rules/fixtures.mjs tests/rules/regras.test.mjs
git commit -m "fix(regras): membro do local edita administrativo da fila (recepcao destravada)" && git push
```

---

### Task 2: Exame criado por não-médico nasce SEM autor (Achado 1)

`saveExame` grava `medicoUid` em toda criação com o uid de quem cadastra. Secretária cadastra → exame "preso" a ela → médico não consegue salvar rascunho. Correção na causa raiz: `saveExame` só grava `medicoUid` se veio preenchido, e a Worklist só preenche quando quem cria é médico de perfil. Mesmo tratamento para `medicoExecutor` e o default de `solicitante`.

**Files:**
- Modify: `src/lib/firestore.ts:323-329` (create do saveExame)
- Modify: `src/components/Worklist.tsx` (cadastro manual ~:258-273, default do solicitante ~:162, batch Feegow ~:424-429)
- Test: `tests/rules/regras.test.mjs` (seção 14)

**Interfaces:**
- Consumes: `payloadCadastroExame` (Task 1); `ehMedico(perfil)` de `src/lib/permissoes.ts` (já existe).
- Produces: contrato novo de `saveExame`: `medicoUid=''` ⇒ campo AUSENTE no doc.

- [ ] **Step 1: Testes de regra que provam o fluxo recepção→médico**

Na seção 14 de `regras.test.mjs`:

```js
  test('recepcao cadastra exame SEM medicoUid (payload real do cadastro)', async () => {
    await assertSucceeds(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exNovoRita'),
      payloadCadastroExame({ id: 'exNovoRita' })));
  });
  test('medico assume exame orfao da recepcao e grava conteudo clinico', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'exNovoRita'),
      { medicoUid: DR_A2, status: 'andamento', medidas: { ddve: 50 } }));
  });
```

- [ ] **Step 2: Rodar e ver o estado**

Run: `npm run test:rules`
Expected: PASS já (a regra da Seção 1 sempre permitiu criar sem `medicoUid` e assumir órfão — o bug era o CÓDIGO nunca deixar o campo ausente). Os testes ficam como rede de proteção do contrato.

- [ ] **Step 3: `saveExame` — não gravar autor vazio**

Em `src/lib/firestore.ts`, no ramo de criação (após o cinto de ACC), trocar o `setDoc` por:

```ts
      const ref = doc(collection(db, 'workspaces', wsId, 'exames'));
      // medicoUid vazio = exame sem autor (recepcao cadastra; medico assume
      // depois ao abrir o laudo — e o que a regra de update espera).
      await setDoc(ref, {
        id: ref.id, ...dados,
        status: (dados.status as string) || 'rascunho', versao: 1,
        ...(medicoUid ? { medicoUid } : {}),
        criadoEm: now()
      });
      return ref.id;
```

- [ ] **Step 4: Worklist — só médico carimba autor/executor**

Em `src/components/Worklist.tsx`:

a) importar `ehMedico`:

```ts
import { podeEditarLaudo, podeRemoverDaFila, ehMedico } from '@/lib/permissoes';
```

b) no cadastro manual (`handleSalvarPaciente`, ramo novo paciente), trocar as linhas de `medicoExecutor` e a chamada:

```ts
      const novoExameId = await saveExame(workspace.id, {
        acc: gerarAccessionNumber(agora2),
        pacienteId: pacId,
        pacienteNome: pacNome.trim().toUpperCase(),
        pacienteDtnasc: pacDtnasc,
        cpf: cpfLimpo,
        tipoExame: pacTipoExame,
        dataExame: dataLocalHoje(),
        horarioChegada: horaChegada,
        status: 'aguardando',
        convenio: pacConvenio,
        solicitante: pacSolicitante,
        medicoExecutor: ehMedico(profile) ? (profile?.nome as string || '') : '',
        sexo: pacSexo,
        origem: 'MANUAL',
      }, ehMedico(profile) ? (profile?.id as string || '') : '');
```

c) em `abrirNovoPaciente`, default do solicitante só pra médico:

```ts
    setPacTel(''); setPacConvenio(''); setPacSolicitante(ehMedico(profile) ? (profile?.nome as string || '') : '');
```

d) no batch Feegow (`importarFeegow`, dentro do loop — provisório até a Task 8 mover pro servidor):

```ts
          solicitante: ehMedico(profile) ? (profile?.nome as string || '') : '',
          medicoExecutor: pac.medicoExecutor || (ehMedico(profile) ? (profile?.nome as string || '') : ''),
          sexo: pac.sexo,
          origem: 'FEEGOW',
          feegowAppointId: pac.feegowAppointId,
          ...(ehMedico(profile) ? { medicoUid: profile.id as string } : {}),
```

(remover a linha antiga `medicoUid: profile.id as string,`)

- [ ] **Step 5: Verificar**

Run: `npm run test:rules && npx tsc --noEmit`
Expected: PASS / sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/firestore.ts src/components/Worklist.tsx tests/rules/regras.test.mjs
git commit -m "fix(worklist): exame criado por nao-medico nasce sem autor (medico assume depois)" && git push
```

---

### Task 3: Edição atômica ficha+exame, corrida do modal, CPF propaga (Achados 3, 5, 8, 21)

Três defeitos no mesmo fluxo de edição: (a) ficha salva e exame falha → estado parcial com mensagem mentirosa; (b) resposta atrasada de `getPaciente` mistura CPF/telefone de outro paciente; (c) CPF corrigido não vai pro exame. Um `writeBatch` + um guard de geração resolvem os três.

**Files:**
- Modify: `src/components/Worklist.tsx` (`editarPaciente`, `abrirNovoPaciente`, `handleSalvarPaciente`)

**Interfaces:**
- Consumes: regra da Task 1 (recepção pode o update administrativo) e `payloadEditarExame` já cobre `cpf`.

- [ ] **Step 1: Guard de corrida no modal**

No topo do componente (junto aos states), adicionar:

```ts
import { useState, useEffect, useCallback, useRef } from 'react';
```

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
    // ... (mantém todos os sets existentes) ...
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

- [ ] **Step 2: Edição atômica com CPF propagado**

Em `handleSalvarPaciente`, substituir o ramo `if (editExameId)` inteiro (o `savePaciente` sai do caminho de edição — ficha e exame vão juntos num batch):

```ts
    if (editExameId) {
      // Edicao: ficha + exame na MESMA escrita (Achado 3 — antes a ficha
      // salvava e o exame falhava, com mensagem dizendo que nada gravou).
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
          ...(cpfLimpo ? { cpf: cpfLimpo } : {}), // Achado 8: CPF e chave DICOM
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

E no ramo de novo paciente, manter `savePaciente` + `saveExame` como está (Task 2 já mexeu), mas corrigir a mensagem de erro do `saveExame` para ser honesta:

```ts
      if (!novoExameId) {
        setPacErro('A ficha do paciente foi salva, mas o exame NÃO entrou na fila. Tente salvar de novo. (Detalhe no Console — F12.)');
        setPacLoading(false);
        return;
      }
```

Também trocar os dois usos redundantes de `pacCpf.replace(/\D/g, '')` no ramo novo por `cpfLimpo` (Achado 21) — linhas do `cpf:` e do `pacienteId:` do `enviarMwlOrthanc`.

- [ ] **Step 3: Verificar tipos e regras**

Run: `npx tsc --noEmit && npm run test:rules`
Expected: sem erros; seção 14 continua PASS (o batch de edição é exatamente o `payloadEditarExame`).

- [ ] **Step 4: Verificação no preview**

Subir o dev server (preview), logar, abrir a Worklist: editar um paciente, salvar, conferir que ficha e exame mudaram juntos. Abrir "Editar" de A e imediatamente de B: campos de B não podem ser sobrescritos pelos de A.

- [ ] **Step 5: Commit**

```bash
git add src/components/Worklist.tsx
git commit -m "fix(worklist): edicao atomica ficha+exame, guard de corrida no modal, CPF propaga ao exame" && git push
```

---

### Task 4: Corrida na busca de CPF do Feegow (Achado 6)

Resposta atrasada de um CPF anterior sobrescreve nome/nascimento/sexo do CPF atual → identidade híbrida.

**Files:**
- Modify: `src/components/Worklist.tsx` (`buscarCpfFeegow` + ref do CPF)

- [ ] **Step 1: Ref com o CPF atual + guard na resposta**

```ts
  // CPF atual do campo, lido na CHEGADA da resposta (Achado 6): se o usuario
  // corrigiu o CPF enquanto a busca A voava, a resposta de A e descartada.
  const pacCpfRef = useRef('');
  useEffect(() => { pacCpfRef.current = pacCpf.replace(/\D/g, ''); }, [pacCpf]);
```

Em `buscarCpfFeegow`, logo após `const data = await res.json();`:

```ts
      if (pacCpfRef.current !== cpfLimpo) return; // campo ja tem OUTRO cpf
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/Worklist.tsx
git commit -m "fix(worklist): descarta resposta atrasada da busca de CPF no Feegow" && git push
```

---

### Task 5: Uma única fonte de "hoje BRT" (Achado 12)

Quatro implementações de "hoje": `utils.ts` (local), `api/feegow` (Intl Belém — a certa), cron (`-3h` na mão), `listenNaoRealizados` (UTC puro — janela errada 21h–00h). Unificar na `utils.ts`, que roda em cliente E servidor.

**Files:**
- Modify: `src/lib/utils.ts` (dataLocalHoje vira Intl Belém; helper novo)
- Modify: `src/lib/firestore.ts` (`listenNaoRealizados`)
- Modify: `src/app/api/feegow/route.ts` (remove a cópia local, importa de utils)
- Test: `tests/unit/data-brt.test.mjs` (novo)

**Interfaces:**
- Produces: `dataLocalBRT(d: Date): string` e `dataLocalHoje(): string` em `src/lib/utils.ts` — Tarefas 6 e 8 consomem.

- [ ] **Step 1: Teste unitário que falha**

Criar `tests/unit/data-brt.test.mjs`. Obs.: `node --test` não importa TS — o teste valida a MESMA expressão Intl usada em utils (documentado no teste; a Task 12 mostra o padrão de sincronia por leitura de fonte):

```js
// Valida o formato/fuso da fonte unica de "hoje BRT" (src/lib/utils.ts).
// Node nao importa TS: replica a expressao exata e confere contra utils.ts
// por leitura de fonte — se alguem mudar la sem mudar aqui, o grep quebra.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const dataLocalBRT = (d) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Belem', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);

test('01h30 UTC ainda e o dia anterior em Belem', () => {
  assert.equal(dataLocalBRT(new Date('2026-08-13T01:30:00Z')), '2026-08-12');
});
test('12h UTC e o mesmo dia em Belem', () => {
  assert.equal(dataLocalBRT(new Date('2026-08-12T12:00:00Z')), '2026-08-12');
});
test('utils.ts usa a mesma expressao (fuso America/Belem)', () => {
  const src = readFileSync('src/lib/utils.ts', 'utf8');
  assert.ok(src.includes("timeZone: 'America/Belem'"), 'utils.ts deve fixar America/Belem');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:unit`
Expected: o 3º teste FALHA (utils.ts ainda usa data local da máquina).

- [ ] **Step 3: Implementar em `src/lib/utils.ts`**

Substituir a `dataLocalHoje` atual por:

```ts
// Fonte UNICA de "hoje" no fuso da clinica (America/Belem, UTC-3 fixo).
// Roda igual em cliente e servidor (Vercel = UTC; depois das 21h BRT o
// new Date() do servidor ja virou o dia — bug real de 22/06/2026).
export function dataLocalBRT(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Belem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
export function dataLocalHoje(): string {
  return dataLocalBRT(new Date());
}
```

- [ ] **Step 4: Trocar os call-sites divergentes**

a) `src/lib/firestore.ts`, `listenNaoRealizados` — trocar as 3 linhas do cálculo de `dataLimite`:

```ts
import { dataLocalHoje, dataLocalBRT } from './utils';
```

```ts
export function listenNaoRealizados(wsId: string, callback: (items: Record<string, unknown>[]) => void, dias: number = 30): Unsubscribe {
  const dataLimite = dataLocalBRT(new Date(Date.now() - dias * 86400000));
```

b) `src/app/api/feegow/route.ts` — apagar o bloco `const CLINIC_TZ...function dataLocalHoje()` (linhas ~110-118, manter o comentário do bug numa linha acima do import) e importar:

```ts
import { dataLocalHoje } from '@/lib/utils';
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test:unit && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils.ts src/lib/firestore.ts src/app/api/feegow/route.ts tests/unit/data-brt.test.mjs
git commit -m "fix(fuso): dataLocalHoje unica em America/Belem (cliente e servidor)" && git push
```

---

### Task 6: Cron fail-closed, init compartilhado, chunking (Achados 4, 10, 19)

Cron hoje: roda SEM auth se `CRON_SECRET` faltar; init do admin copiado na mão; batch único estoura em >500 docs e a resposta ainda diz `ok:true`.

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

        // Chunking (Achado 10): batch unico estourava o limite de 500 e
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

    return NextResponse.json({
      ok: erros.length === 0,
      hoje: dataHoje,
      totalMarcados: total,
      detalhes,
      erros: erros.length > 0 ? erros : undefined,
    }, { status: erros.length > 0 ? 207 : 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'erro' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros. Conferir no painel Vercel que `CRON_SECRET` está setada em produção ANTES do deploy (anotar pra Task 14).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/cleanup-worklist/route.ts
git commit -m "fix(cron): fail-closed sem CRON_SECRET, init compartilhado, chunking de batch" && git push
```

---

### Task 7: Reserva atômica de ACC (Achado 7)

O cinto atual é ler-depois-escrever sem transação (duas máquinas passam juntas). Trocar por reserva transacional: doc `workspaces/{wsId}/accIndex/{acc}` criado na MESMA transação do exame. O ACC já embute a data (`EXddmmaa...`), então o id do doc de reserva é o próprio ACC.

**Files:**
- Modify: `src/lib/firestore.ts` (`saveExame` — substituir o loop de 5 leituras)
- Modify: `firestore.rules` (subcoleção `accIndex`)
- Test: `tests/rules/regras.test.mjs` (seção 14)

**Interfaces:**
- Produces: convenção `accIndex/{acc}` = `{ exameId, criadoEm }` — a Task 8 (servidor) usa a MESMA convenção via Admin SDK (`.create()`).

- [ ] **Step 1: Testes de regra**

Seção 14 de `regras.test.mjs`:

```js
  test('membro cria reserva de ACC no proprio local', async () => {
    await assertSucceeds(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/accIndex`, 'EX12082611000000'),
      { exameId: 'exFila1', criadoEm: new Date() }));
  });
  test('reserva de ACC e imutavel (update negado)', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/accIndex`, 'EX12082611000000'),
      { exameId: 'outro' }));
  });
  test('fora do local nao cria reserva', async () => {
    await assertFails(setDoc(doc(como(DR_B), `workspaces/${LOCAL_A1}/accIndex`, 'EX12082612000000'), { exameId: 'x' }));
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:rules`
Expected: os dois primeiros FALHAM (accIndex cai no catch-all `if false`).

- [ ] **Step 3: Regra da subcoleção**

Em `firestore.rules`, dentro de `match /workspaces/{wsId}`, depois do bloco de exames:

```
      // Reserva atomica de ACC (Achado 7 da Secao 2): o doc id E o proprio
      // ACC; criar em transacao junto com o exame garante unicidade entre
      // maquinas. Imutavel: reserva nao se edita nem se apaga pelo navegador.
      match /accIndex/{acc} {
        allow read, create: if alcancaLocal(wsId);
        allow update, delete: if false;
      }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:rules`
Expected: PASS.

- [ ] **Step 5: Transação no `saveExame`**

Em `src/lib/firestore.ts`: adicionar `runTransaction` ao import de `firebase/firestore` e substituir TODO o bloco do cinto de ACC + `setDoc` do ramo de criação por:

```ts
    } else {
      const ref = doc(collection(db, 'workspaces', wsId, 'exames'));
      const docExame = {
        id: ref.id, ...dados,
        status: (dados.status as string) || 'rascunho', versao: 1,
        ...(medicoUid ? { medicoUid } : {}),
        criadoEm: now()
      };
      if (dados.acc) {
        // Reserva atomica de ACC (substitui o cinto ler-depois-escrever de
        // 12/05/2026, que tinha janela de corrida entre maquinas). A reserva
        // e o exame nascem na MESMA transacao: se outra maquina reservou o
        // mesmo ACC, o get ve o doc e regenera com offset.
        // ponytail: accIndex acumula 1 doc minusculo por exame; limpeza so
        // se um dia virar custo (nao ha TTL hoje).
        await runTransaction(db, async (tx) => {
          let acc = dados.acc as string;
          for (let t = 0; t < 5; t++) {
            const resSnap = await tx.get(doc(db, 'workspaces', wsId, 'accIndex', acc));
            if (!resSnap.exists()) {
              tx.set(doc(db, 'workspaces', wsId, 'accIndex', acc), { exameId: ref.id, criadoEm: now() });
              tx.set(ref, { ...docExame, acc });
              return;
            }
            acc = gerarAccessionNumber(new Date(), (t + 1) * 100);
          }
          throw new Error('ACC: 5 colisoes seguidas');
        });
      } else {
        await setDoc(ref, docExame);
      }
      return ref.id;
    }
```

(Os imports de `limit`/`where`/`getDocs` continuam usados por outras funções — não remover.)

- [ ] **Step 6: Verificar**

Run: `npm run test:rules && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/firestore.ts firestore.rules tests/rules/regras.test.mjs
git commit -m "fix(acc): reserva atomica em accIndex/{acc} — fecha corrida entre maquinas" && git push
```

---

### Task 8: Importação Feegow grava no SERVIDOR (Achados 14, 9, 18; fecha 7 e 10 no caminho batch)

`/api/feegow?action=importar` já monta os candidatos no servidor e devolve pro navegador fazer o `writeBatch`. Mover a gravação pro servidor: lógica em `src/lib/feegow-admin.ts` (padrão `exame-admin.ts` — testável no emulador), rota compõe, cliente encolhe pra um POST. Ganha: auditoria (`logAction`), chunking, ACC via `.create()` atômico, dedup só por `feegowAppointId` (mata o caminho legado por nome), campos `undefined` saneados.

**Files:**
- Create: `src/lib/feegow-admin.ts`
- Modify: `src/app/api/feegow/route.ts` (POST ganha `action:'importar'`; GET `importar` reutiliza o mesmo montador)
- Modify: `src/components/Worklist.tsx` (`importarFeegow` vira um POST)
- Test: `tests/api/feegow-admin.test.mjs` (novo)

**Interfaces:**
- Consumes: convenção `accIndex/{acc}` (Task 7); `dataLocalHoje` de utils (Task 5); tipo `Candidato` = o objeto que o `case 'importar'` do GET já monta (feegowAppointId, feegowPacienteId, pacienteNome, pacienteDtnasc, sexo, cpf, telefone, convenio, tipoExame, medicoExecutor, horarioChegada, dataExame, origem).
- Produces: `gravarImportacao(dbAdmin, { wsId, candidatos, uid, ehMed, nomeCriador }): Promise<{ criados: Array<{ exameId, pac }> }>`; resposta do POST: `{ ok, criados }`.

- [ ] **Step 1: Teste no emulador (`tests/api/feegow-admin.test.mjs`)**

Padrão dos testes existentes em `tests/api/` (ex.: `billing-admin.test.mjs`): importa o TS direto (`../../src/lib/*.ts`) e usa `initializeApp({ projectId: 'leo-testes' })` contra o emulador.

```js
// Importacao Feegow server-side (Secao 2, Achados 14/9/10). Emulador Firestore.
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
    assert.equal(ex1.medicoUid, undefined); // nao-medico NAO carimba autor
    assert.equal(ex1.medicoExecutor, '');
    const reserva = await db.doc(`workspaces/${WS}/accIndex/${ex1.acc}`).get();
    assert.ok(reserva.exists, 'reserva de ACC criada');
  });
  test('re-importar os mesmos candidatos e idempotente', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(1), candidato(2)], uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 0);
  });
  test('campo opcional undefined nao derruba o batch', async () => {
    const { criados } = await gravarImportacao(db, {
      wsId: WS, candidatos: [candidato(3, { telefone: undefined, sexo: undefined })],
      uid: 'uidRita', ehMed: false, nomeCriador: 'Rita',
    });
    assert.equal(criados.length, 1);
    const ex3 = (await db.doc(`workspaces/${WS}/exames/fg-3`).get()).data();
    assert.equal(ex3.sexo, '');
  });
  test('medico importando carimba medicoUid e ACCs nunca colidem', async () => {
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
// A rota /api/feegow compoe; a logica vive aqui (testavel no emulador,
// padrao exame-admin.ts). Admin SDK — ignora as regras.
// ══════════════════════════════════════════════════════════════════
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { gerarAccessionNumber } from './gerarAccessionNumber';

export type Candidato = {
  feegowAppointId: number | string;
  feegowPacienteId?: number | string;
  pacienteNome?: string; pacienteDtnasc?: string; sexo?: string;
  cpf?: string; telefone?: string; convenio?: string;
  tipoExame?: string; medicoExecutor?: string;
  horarioChegada?: string; dataExame?: string;
};

const LOTE = 200; // 2 escritas por candidato → 400 ops < limite de 500

// "Agora" no fuso da clinica, como Date utilizavel pelos getters locais do
// gerarAccessionNumber (o servidor Vercel roda em UTC).
function agoraBelem(): Date {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Belem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((a, x) => ({ ...a, [x.type]: x.value }), {} as Record<string, string>);
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, new Date().getMilliseconds());
}

// Reserva um ACC unico via create() (falha se ja existe) — mesma convencao
// accIndex/{acc} da reserva client-side (firestore.ts).
async function reservarAcc(dbAdmin: Firestore, wsId: string, exameId: string, base: Date, offsetMs: number): Promise<string> {
  for (let t = 0; t < 5; t++) {
    const acc = gerarAccessionNumber(base, offsetMs + t * 100);
    try {
      await dbAdmin.doc(`workspaces/${wsId}/accIndex/${acc}`)
        .create({ exameId, criadoEm: FieldValue.serverTimestamp() });
      return acc;
    } catch { /* ALREADY_EXISTS → tenta o proximo offset */ }
  }
  throw new Error('ACC: 5 colisoes seguidas na importacao');
}

export async function gravarImportacao(dbAdmin: Firestore, args: {
  wsId: string; candidatos: Candidato[]; uid: string; ehMed: boolean; nomeCriador: string;
}): Promise<{ criados: Array<{ exameId: string; pac: Candidato }> }> {
  const { wsId, candidatos, uid, ehMed, nomeCriador } = args;

  // Dedup por doc id deterministico fg-<appointId> (unico caminho: todo
  // agendamento Feegow tem id — o dedup legado por nome morreu aqui).
  const comId = candidatos.filter(c => c.feegowAppointId != null && c.feegowAppointId !== '');
  const refs = comId.map(c => dbAdmin.doc(`workspaces/${wsId}/exames/fg-${c.feegowAppointId}`));
  const snaps = refs.length ? await dbAdmin.getAll(...refs) : [];
  const novos = comId.filter((_, i) => !snaps[i].exists);

  const base = agoraBelem();
  const criados: Array<{ exameId: string; pac: Candidato }> = [];

  for (let i = 0; i < novos.length; i += LOTE) {
    const batch = dbAdmin.batch();
    const fatia = novos.slice(i, i + LOTE);
    for (let j = 0; j < fatia.length; j++) {
      const c = fatia[j];
      const exameRef = dbAdmin.doc(`workspaces/${wsId}/exames/fg-${c.feegowAppointId}`);
      const acc = await reservarAcc(dbAdmin, wsId, exameRef.id, base, (i + j) * 10);
      const pacRef = c.feegowPacienteId
        ? dbAdmin.doc(`workspaces/${wsId}/pacientes/fg-${c.feegowPacienteId}`)
        : dbAdmin.collection(`workspaces/${wsId}/pacientes`).doc();
      // `?? ''` em todo campo opcional: um unico undefined derruba o batch
      // inteiro (Achado 10).
      batch.set(pacRef, {
        id: pacRef.id, nome: c.pacienteNome ?? '', cpf: c.cpf ?? '',
        dtnasc: c.pacienteDtnasc ?? '', sexo: c.sexo ?? '',
        telefone: c.telefone ?? '', feegowPacienteId: c.feegowPacienteId ?? null,
        criadoEm: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(exameRef, {
        id: exameRef.id, acc,
        pacienteId: pacRef.id,
        pacienteNome: c.pacienteNome ?? '', pacienteDtnasc: c.pacienteDtnasc ?? '',
        cpf: c.cpf ?? '', feegowPacienteId: c.feegowPacienteId ?? null,
        tipoExame: c.tipoExame ?? '', dataExame: c.dataExame ?? '',
        horarioChegada: c.horarioChegada ?? '', status: 'aguardando',
        convenio: c.convenio ?? '',
        solicitante: ehMed ? nomeCriador : '',
        medicoExecutor: c.medicoExecutor || (ehMed ? nomeCriador : ''),
        sexo: c.sexo ?? '', origem: 'FEEGOW',
        feegowAppointId: c.feegowAppointId,
        ...(ehMed ? { medicoUid: uid } : {}),
        versao: 1, criadoEm: FieldValue.serverTimestamp(),
      });
      criados.push({ exameId: exameRef.id, pac: c });
    }
    await batch.commit();
  }

  if (criados.length > 0) {
    await dbAdmin.collection('logs').add({
      tipo: 'importar_feegow', wsId, quantidade: criados.length,
      medicoUid: uid, ts: FieldValue.serverTimestamp(),
    });
  }
  return { criados };
}
```

- [ ] **Step 4: Rodar os testes do emulador**

Run: `npm run test:api`
Expected: PASS (4 casos).

- [ ] **Step 5: Rota — POST `action:'importar'`**

Em `src/app/api/feegow/route.ts`:

a) extrair o corpo do `case 'importar'` do GET pra uma função `montarCandidatos(token: string, wsId: string | null): Promise<Candidato[]>` no mesmo arquivo (o GET passa a chamá-la e continua respondendo `{ ok, total, pacientes }` — sem quebrar quem mais usa). No topo do arquivo: `import { gravarImportacao, type Candidato } from '@/lib/feegow-admin';`.

b) no handler POST, antes do `return action invalida`:

```ts
    if (body.action === 'importar') {
      const wsId = req.nextUrl.searchParams.get('wsId');
      if (!wsId) return NextResponse.json({ error: 'wsId obrigatorio' }, { status: 400 });
      const uid = await verificarAuth(req); // proteger() ja validou; aqui so pega o uid
      const perfilSnap = await dbAdmin.doc(`profissionais/${uid}`).get();
      const perfil = perfilSnap.data() || {};
      const ehMed = ((perfil.tipoPerfil as string | undefined) ?? 'medico') === 'medico';
      const candidatos = await montarCandidatos(token, wsId);
      const { criados } = await gravarImportacao(dbAdmin, {
        wsId, candidatos, uid: uid!, ehMed, nomeCriador: (perfil.nome as string) || '',
      });
      return NextResponse.json({ ok: true, total: candidatos.length, criados });
    }
```

- [ ] **Step 6: Cliente encolhe**

Em `src/components/Worklist.tsx`, substituir `importarFeegow` INTEIRO (morre: dedup por nome, `semAppt`, writeBatch, getDoc de existência — Achado 18) por:

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
        alert(data.error || 'Erro ao importar do Feegow.');
      } else if (data.criados.length === 0) {
        alert(data.total === 0 ? 'Nenhum paciente aguardando no Feegow.' : 'Todos os pacientes do Feegow já estão na fila.');
      } else {
        // MWL continua saindo do cliente (o /api/orthanc ja autentica por token)
        for (const { exameId, pac } of data.criados) {
          enviarMwlOrthanc({
            wsId: workspace.id, exameId,
            pacienteNome: pac.pacienteNome, pacienteId: pac.cpf,
            pacienteDtnasc: pac.pacienteDtnasc, sexo: pac.sexo,
            tipoExame: pac.tipoExame, dataExame: pac.dataExame,
            horarioChegada: pac.horarioChegada,
            medicoNome: ehMedico(profile) ? (profile?.nome as string || '') : '',
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

Remover os imports que ficarem órfãos no arquivo (`doc, getDoc, collection, writeBatch` — conferir com tsc; `writeBatch`/`serverTimestamp` continuam usados pela Task 3, `doc` também).

- [ ] **Step 7: Verificar**

Run: `npm run test:api && npx tsc --noEmit && npm run build`
Expected: PASS. No preview: importar do Feegow com a conta de teste (Gmail PJ), conferir exames criados e log em `/logs`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/feegow-admin.ts src/app/api/feegow/route.ts src/components/Worklist.tsx tests/api/feegow-admin.test.mjs
git commit -m "feat(feegow): importacao grava no servidor (idempotente, chunked, ACC atomico, auditada)" && git push
```

---

### Task 9: Busca por CPF de verdade (Achado 11)

A variável `cpf` do filtro lê `pacienteDtnasc` — buscar CPF nunca funcionou. O campo `cpf` existe no exame; consertar custa 2 linhas (decisão registrada na revisão: consertar, não cortar).

**Files:**
- Modify: `src/components/Worklist.tsx:504-512` (filtro)

- [ ] **Step 1: Corrigir o filtro**

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

E atualizar o placeholder do input: `placeholder="Buscar por nome ou CPF..."`.

- [ ] **Step 2: Verificar e commitar**

Run: `npx tsc --noEmit`

```bash
git add src/components/Worklist.tsx
git commit -m "fix(worklist): busca compara CPF de verdade (lia data de nascimento)" && git push
```

---

### Task 10: Timer de espera só no dia de hoje (Achado 13)

Vendo outra data, o timer calcula contra a hora de hoje ("2h de atraso" pra paciente de amanhã).

**Files:**
- Modify: `src/components/Worklist.tsx:595` (linha do `espera` na tabela)

- [ ] **Step 1: Condicionar à data selecionada**

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

### Task 11: Estado do MWL visível (Achado 15) — regra + código juntos

Falha no envio ao Orthanc hoje é um `console.warn` que ninguém vê: exame na fila sem worklist no aparelho. Gravar `mwlStatus` no exame e sinalizar na tabela. `mwlStatus` precisa entrar na whitelist `camposAdministrativos()` — regra e código no MESMO commit.

**Files:**
- Modify: `firestore.rules:92-97` (whitelist)
- Modify: `src/components/Worklist.tsx` (`enviarMwlOrthanc` + indicador na linha)
- Test: `tests/rules/regras.test.mjs` (seção 14)

- [ ] **Step 1: Teste de regra que falha**

```js
  test('recepcao grava mwlStatus (resultado do envio ao aparelho)', async () => {
    await assertSucceeds(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'exFila1'), { mwlStatus: 'falhou' }));
  });
```

Run: `npm run test:rules` → Expected: FAIL (fora da whitelist).

- [ ] **Step 2: Whitelist + código**

a) `firestore.rules`, em `camposAdministrativos()`, acrescentar `'mwlStatus'` ao array (depois de `'medicoUid'`).

b) `Worklist.tsx`, `enviarMwlOrthanc` — gravar o resultado (a função vira dependente de `db`/`doc`/`updateDoc`, que já estão importados; movê-la pra DENTRO do componente não é necessário — receber o resultado e gravar no call-site é maior; manter a função fora e gravar nela mesma):

```ts
async function enviarMwlOrthanc(dados: { /* ...assinatura igual... */ }) {
  try {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/orthanc', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token || ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'criar_mwl', ...dados }),
    });
    const result = await res.json();
    // Achado 15: o resultado deixava de existir aqui — persistir no exame
    // pra fila mostrar quando a worklist NAO chegou ao aparelho.
    await updateDoc(doc(db, 'workspaces', dados.wsId, 'exames', dados.exameId), {
      mwlStatus: result.ok ? 'enviado' : 'falhou',
    });
    if (!result.ok) console.warn('Orthanc MWL falhou:', result.error);
  } catch {
    try {
      await updateDoc(doc(db, 'workspaces', dados.wsId, 'exames', dados.exameId), { mwlStatus: 'falhou' });
    } catch { /* offline total: fica sem status */ }
  }
}
```

c) na célula do paciente (junto aos badges, depois do span de origem):

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
git commit -m "feat(worklist): mwlStatus persistido + indicador SEM MWL na fila (regra+codigo)" && git push
```

---

### Task 12: Teste de sincronia da whitelist (Achado 16)

A lista `camposAdministrativos()` da regra é mantida à mão vs o que o TS escreve. Transformar desalinhamento em falha de teste: os payloads reais de `fixtures.mjs` (a fonte de verdade do que o app envia) devem caber na whitelist extraída de `firestore.rules` por leitura de fonte.

**Files:**
- Create: `tests/unit/whitelist-sincronia.test.mjs`

- [ ] **Step 1: Escrever o teste**

```js
// Achado 16 da Secao 2: a whitelist camposAdministrativos() em firestore.rules
// e mantida a mao. Este teste le a REGRA e os PAYLOADS REAIS (fixtures) e
// falha se o app enviar campo fora da whitelist — antes de virar
// permission-denied silencioso pra recepcao em producao.
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { payloadCadastroExame, payloadEditarExame } from '../rules/fixtures.mjs';

function whitelistDaRegra() {
  const rules = readFileSync('firestore.rules', 'utf8');
  const m = rules.match(/function camposAdministrativos\(\)\s*\{\s*return\s*\[([\s\S]*?)\];/);
  assert.ok(m, 'camposAdministrativos() nao encontrada em firestore.rules');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

test('payload de cadastro cabe na whitelist da regra', () => {
  const wl = new Set(whitelistDaRegra());
  for (const campo of Object.keys(payloadCadastroExame())) {
    assert.ok(wl.has(campo), `campo '${campo}' do cadastro NAO esta em camposAdministrativos()`);
  }
});
test('payload de edicao cabe na whitelist da regra', () => {
  const wl = new Set(whitelistDaRegra());
  for (const campo of Object.keys(payloadEditarExame())) {
    assert.ok(wl.has(campo), `campo '${campo}' da edicao NAO esta em camposAdministrativos()`);
  }
});
test('mwlStatus (gravado pelo enviarMwlOrthanc) esta na whitelist', () => {
  assert.ok(new Set(whitelistDaRegra()).has('mwlStatus'));
});
```

- [ ] **Step 2: Rodar, ver passar, commitar**

Run: `npm run test:unit`
Expected: PASS (Tasks 1 e 11 já alinharam tudo).

```bash
git add tests/unit/whitelist-sincronia.test.mjs
git commit -m "test(regras): sincronia whitelist camposAdministrativos vs payloads reais" && git push
```

---

### Task 13: Cortes Ponytail (Achados 17, 20, 22)

**Files:**
- Modify: `src/components/Worklist.tsx`

- [ ] **Step 1: Cortar o botão "📋 Laudo rápido"** (linhas ~538-541) — é um clone do "+ Paciente" com rótulo que mente. Deletar o `<button>` inteiro.

- [ ] **Step 2: Listener de não-realizados sob demanda** (Achado 20) — assinar só quando a aba abre:

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

E no contador do botão: `🚫 Não realizados{statusSel === 'nao-realizado' ? ` (${naoRealizados.length})` : ''}`.

- [ ] **Step 3: Completar o tipo `ExameItem`** (Achado 22) — acrescentar os campos usados com cast manual:

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

Run: `npx tsc --noEmit && npm run build`

```bash
git add src/components/Worklist.tsx
git commit -m "chore(worklist): cortes ponytail — botao clone, listener sob demanda, tipo completo" && git push
```

---

### Task 14: Verificação final, publicação de regras e entrega

- [ ] **Step 1: Bateria completa**

```bash
npm run test:unit && npm run test:rules && npm run test:api && npx tsc --noEmit && npm run build
```

Expected: tudo PASS.

- [ ] **Step 2: Verificação no preview (fluxo real de ponta a ponta)**

Com a conta de teste (Gmail PJ — NUNCA a Yahoo): (1) logar como recepção, cadastrar paciente → exame nasce sem autor; (2) editar paciente → salva ficha+exame juntos; (3) logar como médico, abrir o rascunho da recepção → consegue laudar; (4) importar Feegow → exames criados via servidor, log gravado; (5) buscar por CPF na fila.

- [ ] **Step 3: ⚠️ CONFIRMAR COM O SERGIO antes de publicar as regras**

As regras novas (ramo de membro, `accIndex`, `mwlStatus` na whitelist) só valem em produção após:

```bash
node scripts/secao1/04-publicar-regras.mjs --commit
```

**NÃO rodar sem confirmação explícita.** Conferir também no painel Vercel que `CRON_SECRET` está setada (Task 6 tornou obrigatória em produção).

- [ ] **Step 4: Encerrar a branch**

Usar a skill `superpowers:finishing-a-development-branch` — opções de merge/PR pra decisão do Sergio (a branch base `feat/secao1-plano2b-b2` ainda não está na master; a ordem de merge é dela primeiro).

- [ ] **Step 5: Documentar**

ADR curto em `docs/decisoes/2026-08-12-secao2-worklist-correcoes.md` (o que mudou de modelo: exame órfão, accIndex, import server-side, mwlStatus) + espelho no Obsidian (`Leo/Decisões/`) + memória local + push.
