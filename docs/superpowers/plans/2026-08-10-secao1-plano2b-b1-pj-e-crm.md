# Plano 2B-B1 — PJ + trava do CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar "editar/liberar laudo" um ato médico gated por CRM no banco e na tela, adicionar o cadastro PJ (empresa + conta + local + vínculo dono via servidor), deixar a verificação de CRM plugável com selo interno honesto, e ligar o botão "Cancelar laudo" à rota que já existe.

**Architecture:** A regra `exames update` passa a separar **conteúdo do laudo** (exige perfil médico + autoria) de **administração da fila** (exame não-emitido; dono administrativo). Um helper de banco `ehMedicoDeVerdade(uid)` lê `profissionais.tipoPerfil` (ausente = médico, `'assistente'` = não). O cadastro PJ reusa o padrão atômico do `/api/signup`. A verificação de CRM entra por injeção de dependência (`verificarCrm` no-op agora), gravada em `profissionais.crmVerificacao`, exibida por um selo **que nunca entra no PDF**.

**Tech Stack:** Next.js 16, React 19, Firebase (client + admin), Node 24 (`node --test`, type stripping), emulador Firestore+Auth (JDK 21), `@firebase/rules-unit-testing`. Sem novas dependências.

## Global Constraints

- Branch de trabalho: `feat/secao1-plano2b-b1`. Merge na `master` só ao fim, com aprovação (push na master deploya `souleo.com.br`).
- **NÃO usar `git stash`** (daemon `.claude-flow`).
- Antes de `npm run test:rules`/`test:api`: `export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"`. `test:unit` não precisa de JDK.
- Módulos testados por `node --test` (`src/lib/verificar-crm.ts`, `src/lib/signup-server.ts`) **não podem** ter import relativo nem `@/` — só tipos locais/pacotes. Dependências externas (ex.: `verificarCrm`) chegam por **parâmetro (DI)**, como `apagarPdf` em `exame-admin.ts`.
- `tipoPerfil`: `'medico'` | `'assistente'`; **ausente conta como `'medico'`** (default do app; lição do apagão de 09/08). O helper de banco usa `.data.get('tipoPerfil','medico') != 'assistente'`.
- Papéis: `'dono'`, `'medico'`, `'recepcao'`.
- **REGRA DE OURO:** mudança de regra de segurança entra com teste no `tests/rules/regras.test.mjs` usando payload realista.
- **`crmVerificacao` é controle interno: NUNCA é lido por `src/lib/pdf-server.ts` nem por `gerarPdfHtml` (o PDF do laudo não muda).**
- Lint: repo tem ~140 erros pré-existentes; critério é **nenhum erro novo** nos arquivos tocados.
- A fechadura no banco é a trava real; a UI só deixa de oferecer o caminho.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/verificar-crm.ts` (criar) | Tipo `CrmVerificacao` + `verificarCrmNoOp()`; interface do provedor futuro. Sem import relativo/@. |
| `tests/unit/verificar-crm.test.mjs` (criar) | No-op retorna `nao_verificado`; contrato estável. |
| `firestore.rules` (modificar) | `ehMedicoDeVerdade(u)`; `exames update` separa conteúdo (médico+autor) de fila (não-emitido). |
| `tests/rules/regras.test.mjs` (modificar) | Seeds do gestor não-médico; testes da trava; ajuste do teste "dono ajusta emitido". |
| `src/lib/signup-server.ts` (modificar) | `crmVerificacao` no perfil (PF) via `verificarCrm` injetado; `executarSignupPJ(...)`. |
| `src/app/api/signup/route.ts` (modificar) | Roteia `tipoConta: 'PF'|'PJ'`; injeta `verificarCrmNoOp`. |
| `tests/api/signup.test.mjs` (modificar) | PJ nasce inteiro; médico sem CRM recusa; CNPJ duplicado; `crmVerificacao` nasce. |
| `src/app/login/page.tsx` (modificar) | Aba PJ ganha formulário. |
| `src/components/SeloCrm.tsx` (criar) | Selo interno do estado de verificação. |
| `src/app/dashboard/page.tsx` (modificar) | Mostra `<SeloCrm>` no perfil. |
| `src/lib/permissoes.ts` (modificar) | `podeCancelarLaudo(perfil, exame, uid, papel)`. |
| `tests/unit/permissoes.test.mjs` (modificar) | Casos de `podeCancelarLaudo`. |
| `src/components/Historico.tsx` (modificar) | Botão "Cancelar laudo" → `/api/exame`. |

---

## Task 1: Interface plugável de verificação de CRM

**Files:**
- Create: `src/lib/verificar-crm.ts`
- Create: `tests/unit/verificar-crm.test.mjs`

**Interfaces:**
- Consumes: nada (módulo puro, sem import).
- Produces:
  - `type CrmVerificacao = { status: 'nao_verificado' | 'verificado' | 'reprovado'; fonte: string; checadoEm: string | null }`
  - `type VerificarCrm = (crm: string, uf: string) => Promise<CrmVerificacao>`
  - `verificarCrmNoOp: VerificarCrm` — sempre `{ status: 'nao_verificado', fonte: 'nenhum', checadoEm: null }`

- [ ] **Step 1: Escrever o teste**

`tests/unit/verificar-crm.test.mjs`:

```javascript
// Interface plugavel de verificacao de CRM. Provedor no-op por ora (B4 do spec):
// require+store agora; Consultar.IO/CFM depois, sem mexer em cadastro nem regra.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { verificarCrmNoOp } from '../../src/lib/verificar-crm.ts';

describe('verificarCrmNoOp', () => {
  test('retorna nao_verificado, sem consultar nada externo', async () => {
    const r = await verificarCrmNoOp('123456', 'PA');
    assert.equal(r.status, 'nao_verificado');
    assert.equal(r.fonte, 'nenhum');
    assert.equal(r.checadoEm, null);
  });
  test('contrato estavel: as 3 chaves sempre presentes', async () => {
    const r = await verificarCrmNoOp('', '');
    assert.deepEqual(Object.keys(r).sort(), ['checadoEm', 'fonte', 'status']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:unit
```

Esperado: FALHA — `Cannot find module .../verificar-crm.ts`.

- [ ] **Step 3: Escrever `src/lib/verificar-crm.ts`**

```typescript
// ══════════════════════════════════════════════════════════════════
// LEO · Verificacao de CRM (Plano 2B-B1) — interface PLUGAVEL.
// Provedor no-op agora: o cadastro exige+guarda CRM (a trava), mas nao ha
// verificacao externa ainda. Quando o Dr. Sergio escolher Consultar.IO ou o
// webservice do CFM, um novo provedor implementa VerificarCrm e a rota passa
// a injeta-lo — sem tocar cadastro nem regra. Pesquisa das fontes no ADR.
// Sem import relativo/@: signup-server importa o TIPO e recebe a FUNCAO por
// parametro (DI), para continuar testavel por node --test.
// ══════════════════════════════════════════════════════════════════
export type CrmVerificacao = {
  status: 'nao_verificado' | 'verificado' | 'reprovado';
  fonte: string;
  checadoEm: string | null;
};

export type VerificarCrm = (crm: string, uf: string) => Promise<CrmVerificacao>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const verificarCrmNoOp: VerificarCrm = async (crm, uf) => ({
  status: 'nao_verificado', fonte: 'nenhum', checadoEm: null,
});
```

- [ ] **Step 4: Rodar até passar**

```bash
npm run test:unit
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/verificar-crm.ts tests/unit/verificar-crm.test.mjs
git commit -m "feat(secao1): interface plugavel de verificacao de CRM (no-op por ora)"
```

---

## Task 2: A trava do CRM no banco (ato médico)

**Files:**
- Modify: `firestore.rules` (helper + bloco `exames update`)
- Modify: `tests/rules/regras.test.mjs` (seeds + testes)

**Interfaces:**
- Consumes: helpers existentes `alcancaLocal`, `ehDonoDoLocal`, `ehMedicoNoLocal`, `intacto`, `contaDoLocal`.
- Produces: `ehMedicoDeVerdade(u)` no banco; `exames update` com dois braços (conteúdo médico+autor / fila não-emitida do dono).

- [ ] **Step 1: Adicionar seeds do gestor não-médico ao teste**

Em `tests/rules/regras.test.mjs`, no bloco `before(...)` (dentro do `withSecurityRulesDisabled`), adicionar uma terceira conta com **dono não-médico** (gestor de clínica) e um médico membro. Colar logo após a linha `await setDoc(doc(db, 'subscriptions', CONTA_B), ...)` (perto da linha 74):

```javascript
    // ── Conta C: gestor NAO-medico como dono (o caso que a trava do CRM protege) ──
    const CONTA_C = 'contaC', LOCAL_C = 'localC';
    const GESTOR = 'uidGestor', DR_C = 'uidDrC';
    await setDoc(doc(db, 'contas', CONTA_C), { tipo: 'PJ', nome: 'Clinica C', ownerUid: GESTOR });
    await setDoc(doc(db, 'workspaces', LOCAL_C), { contaId: CONTA_C, nomeClinica: 'Clinica C' });
    await setDoc(doc(db, 'vinculos', `${CONTA_C}_${GESTOR}`), { contaId: CONTA_C, medicoUid: GESTOR, papel: 'dono', locais: [], status: 'ativo' });
    await setDoc(doc(db, 'vinculos', `${CONTA_C}_${DR_C}`),   { contaId: CONTA_C, medicoUid: DR_C,   papel: 'medico', locais: [], status: 'ativo' });
    // GESTOR e assistente (nao tem CRM); DR_C e medico.
    await setDoc(doc(db, 'profissionais', GESTOR), { nome: 'Gestor', superadmin: false, tipoPerfil: 'assistente' });
    await setDoc(doc(db, 'profissionais', DR_C),   { nome: 'Dr C',   superadmin: false, tipoPerfil: 'medico' });
    await setDoc(doc(db, `workspaces/${LOCAL_C}/exames`, 'exCemitido'), { pacienteNome: 'Pac C', medicoUid: DR_C, status: 'emitido' });
    await setDoc(doc(db, `workspaces/${LOCAL_C}/exames`, 'exCfila'),    { pacienteNome: 'Fila C', status: 'aguardando' });
```

E, no topo do arquivo (junto às constantes `CONTA_A`... na linha ~14-16), acrescentar para os testes referenciarem:

```javascript
const CONTA_C = 'contaC', LOCAL_C = 'localC', GESTOR = 'uidGestor', DR_C = 'uidDrC';
```

(As mesmas strings do seed — mantê-las idênticas.)

- [ ] **Step 2: Escrever os testes da trava (e ajustar o teste que muda de comportamento)**

No `describe('4. autoria do laudo', ...)`, **substituir** o teste `'dono ajusta exame que nao e dele (administrativo)'` (linhas ~161-163) por dois testes — a correção administrativa de laudo **emitido** agora é da `/api/corrigir-laudo` (servidor), não do cliente:

```javascript
  test('dono medico NAO ajusta laudo EMITIDO de outro pelo cliente (vai pela /api/corrigir-laudo)', async () => {
    await assertFails(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A2}/exames`, 'ex2'), { convenio: 'UNIMED' }));
  });
  test('dono administra a fila: ajusta exame NAO-emitido', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/exames`, 'exSemAutor'), { convenio: 'UNIMED' }));
  });
```

E adicionar um `describe` novo ao final do arquivo, com a trava do CRM:

```javascript
describe('12. trava do CRM (ato medico) — Plano 2B-B1', () => {
  test('gestor NAO-medico (dono) NAO edita conteudo de laudo emitido', async () => {
    await assertFails(updateDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCemitido'), { conclusoes: 'x' }));
  });
  test('gestor NAO-medico NAO reabre laudo emitido', async () => {
    await assertFails(updateDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCemitido'), { status: 'andamento' }));
  });
  test('gestor NAO-medico administra a fila (exame nao-emitido)', async () => {
    await assertSucceeds(updateDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCfila'), { convenio: 'BRADESCO' }));
  });
  test('medico autor edita/reabre o proprio laudo emitido', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_C), `workspaces/${LOCAL_C}/exames`, 'exCemitido'), { conclusoes: 'ok', status: 'andamento' }));
  });
  test('gestor NAO-medico NAO marca exame da fila como emitido', async () => {
    await assertFails(updateDoc(doc(como(GESTOR), `workspaces/${LOCAL_C}/exames`, 'exCfila'), { status: 'emitido' }));
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"
npm run test:rules
```

Esperado: os testes novos do gestor e o "dono medico NAO ajusta emitido" **FALHAM** (a regra atual deixa o dono editar emitido).

- [ ] **Step 4: Adicionar o helper `ehMedicoDeVerdade` e redesenhar `exames update`**

Em `firestore.rules`, logo após a função `ehMedicoNoLocal` (linha ~60), adicionar:

```
    // Ato medico = ter CRM. tipoPerfil ausente conta como medico (default do app,
    // licao do apagao de cadastro 09/08); so 'assistente' explicito nao e medico.
    // E o eixo que a decisao do Dr. Sergio (ADR 8.4) exige para editar/liberar laudo.
    function ehMedicoDeVerdade(u) {
      return exists(/databases/$(database)/documents/profissionais/$(u))
        && get(/databases/$(database)/documents/profissionais/$(u)).data.get('tipoPerfil', 'medico') != 'assistente';
    }
```

Substituir o `allow update` do bloco `match /exames/{exameId}` (linhas ~123-127) por:

```
        // Conteudo do laudo / reabrir emitido = ATO MEDICO (CRM) + autoria. Um
        // dono NAO-medico nao edita laudo (decisao Dr. Sergio, ADR 8.4).
        // Administracao da fila (exame NAO-emitido) continua do dono: paciente,
        // convenio, agendamento — pre-assinatura, nao e ato medico. Correcao
        // administrativa de EMITIDO vai pela /api/corrigir-laudo (log + servidor).
        allow update: if request.resource.data.get('status', '') != 'cancelado'
                      && ((ehMedicoDeVerdade(uid()) && ehMedicoNoLocal(wsId)
                            && (!('medicoUid' in resource.data) || resource.data.medicoUid == uid())
                            && ('medicoUid' in resource.data ? intacto('medicoUid') : true))
                          || (ehDonoDoLocal(wsId) && intacto('medicoUid')
                              && resource.data.get('status', '') != 'emitido'
                              && request.resource.data.get('status', '') != 'emitido'));
```

- [ ] **Step 5: Rodar até passar (suíte inteira)**

```bash
npm run test:rules
```

Esperado: **todos** passam (os novos + os antigos, inclusive os dois reescritos). Se um teste antigo de autoria falhar, ler qual — a mudança intencional é só o "dono ajusta emitido"; qualquer outra quebra é regressão a corrigir na regra.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/rules/regras.test.mjs
git commit -m "fix(seguranca): editar/reabrir laudo exige perfil medico (CRM); dono nao-medico so administra fila nao-emitida"
```

---

## Task 3: Cadastro grava `crmVerificacao` (PF), via provedor injetado

**Files:**
- Modify: `src/lib/signup-server.ts`
- Modify: `src/app/api/signup/route.ts`
- Modify: `tests/api/signup.test.mjs`

**Interfaces:**
- Consumes: `type CrmVerificacao`, `verificarCrmNoOp` de `@/lib/verificar-crm` (só na rota; o `signup-server` recebe a função por parâmetro).
- Produces: `executarSignup` passa a aceitar um 5º parâmetro `verificarCrm?: VerificarCrm` e grava `crmVerificacao` no perfil quando `tipoPerfil==='medico'`.

- [ ] **Step 1: Teste — perfil médico nasce com `crmVerificacao`**

Em `tests/api/signup.test.mjs`, adicionar ao `describe('executarSignup', ...)`:

```javascript
  test('perfil medico nasce com crmVerificacao nao_verificado', async () => {
    const { uid } = await authAdmin.createUser({ email: 'crm@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignup(db, authAdmin, uid, { ...DADOS, email: 'crm@exemplo.com' });
    assert.equal(r.ok, true);
    const prof = (await db.doc(`profissionais/${uid}`).get()).data();
    assert.equal(prof.crmVerificacao.status, 'nao_verificado');
    assert.equal(prof.crmVerificacao.fonte, 'nenhum');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"
npm run test:api
```

Esperado: o teste novo FALHA (`crmVerificacao` é undefined).

- [ ] **Step 3: `executarSignup` grava `crmVerificacao`**

Em `src/lib/signup-server.ts`, adicionar o tipo ao topo (import de TIPO só; a função vem por parâmetro):

```typescript
import type { VerificarCrm } from './verificar-crm';
```

⚠️ Isso É um import relativo — proibido neste arquivo. Em vez disso, **declarar o tipo localmente** (o arquivo não importa de `@/` nem relativo):

```typescript
type CrmVerificacao = { status: 'nao_verificado' | 'verificado' | 'reprovado'; fonte: string; checadoEm: string | null };
type VerificarCrm = (crm: string, uf: string) => Promise<CrmVerificacao>;
```

Trocar a assinatura de `executarSignup` para aceitar o provedor (opcional, com no-op embutido):

```typescript
export async function executarSignup(
  db: Firestore, authAdmin: Auth, uid: string, dados: DadosSignup,
  verificarCrm: VerificarCrm = async () => ({ status: 'nao_verificado', fonte: 'nenhum', checadoEm: null }),
): Promise<ResultadoSignup> {
```

Antes de abrir a transação (após `const plano = await planoTrial(db);`), resolver a verificação só para médicos:

```typescript
    const crmVerificacao = tipoPerfil === 'medico'
      ? await verificarCrm(dados.crm ?? '', (dados.ufCrm ?? '').toUpperCase())
      : { status: 'nao_verificado' as const, fonte: 'nenhum', checadoEm: null };
```

E no `t.set(perfilRef, {...})`, acrescentar o campo (dentro do objeto do perfil):

```typescript
        crmVerificacao,
```

- [ ] **Step 4: A rota injeta o provedor no-op**

Em `src/app/api/signup/route.ts`, adicionar o import e passar na chamada:

```typescript
import { verificarCrmNoOp } from '@/lib/verificar-crm';
```

Trocar a chamada `executarSignup(adminDb(), adminAuth(), uid, dados)` por:

```typescript
    const r = await executarSignup(adminDb(), adminAuth(), uid, dados, verificarCrmNoOp);
```

- [ ] **Step 5: Rodar até passar**

```bash
npm run test:api
```

Esperado: todos PASS (o novo + os 4 de signup existentes).

- [ ] **Step 6: Commit**

```bash
git add src/lib/signup-server.ts src/app/api/signup/route.ts tests/api/signup.test.mjs
git commit -m "feat(secao1): cadastro grava crmVerificacao (provedor injetado, no-op por ora)"
```

---

## Task 4: `executarSignupPJ` + rota roteia PF/PJ

**Files:**
- Modify: `src/lib/signup-server.ts`
- Modify: `src/app/api/signup/route.ts`
- Modify: `tests/api/signup.test.mjs`

**Interfaces:**
- Consumes: `getDb`/Admin SDK; `DadosSignup`.
- Produces: `type DadosSignupPJ = DadosSignup & { cnpj: string; razaoSocial: string; nomeFantasia?: string; nomeLocal?: string }`; `executarSignupPJ(db, authAdmin, uid, dados, verificarCrm?): Promise<ResultadoSignupPJ>` onde `ResultadoSignupPJ = { ok:true; contaId; wsId; empresaId } | { ok:false; motivo: 'dados_invalidos'|'ja_cadastrado'|'cnpj_duplicado'|'erro' }`.

- [ ] **Step 1: Teste do cadastro PJ**

Em `tests/api/signup.test.mjs`, adicionar um `describe`:

```javascript
describe('executarSignupPJ', () => {
  const PJ = {
    nome: 'Gestor Clinica', email: 'pj@exemplo.com', tipoPerfil: 'assistente',
    cnpj: '12345678000199', razaoSocial: 'Clinica Exemplo Ltda', nomeLocal: 'Unidade Centro',
  };
  test('caminho feliz: empresa + conta PJ + local + vinculo dono + assinatura', async () => {
    const { uid } = await authAdmin.createUser({ email: PJ.email, password: 'x'.repeat(8) });
    const r = await executarSignupPJ(db, authAdmin, uid, PJ);
    assert.equal(r.ok, true);
    const conta = (await db.doc(`contas/${r.contaId}`).get()).data();
    assert.equal(conta.tipo, 'PJ');
    assert.equal(conta.empresaId, r.empresaId);
    assert.equal(conta.ownerUid, uid);
    const emp = (await db.doc(`empresas/${r.empresaId}`).get()).data();
    assert.equal(emp.cnpj, '12345678000199');
    const ws = (await db.doc(`workspaces/${r.wsId}`).get()).data();
    assert.equal(ws.contaId, r.contaId);
    assert.equal(ws.nomeClinica, 'Unidade Centro');
    const vinc = (await db.doc(`vinculos/${r.contaId}_${uid}`).get()).data();
    assert.equal(vinc.papel, 'dono');
    const sub = (await db.doc(`subscriptions/${r.contaId}`).get()).data();
    assert.equal(sub.tipoPlano, 'PJ');
    assert.equal('workspaceId' in sub, false);
  });
  test('gestor nao-medico NAO precisa de CRM', async () => {
    const { uid } = await authAdmin.createUser({ email: 'pj2@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignupPJ(db, authAdmin, uid, { ...PJ, email: 'pj2@exemplo.com', cnpj: '99888777000166' });
    assert.equal(r.ok, true);
  });
  test('dono que se declara medico SEM CRM e recusado (rollback)', async () => {
    const { uid } = await authAdmin.createUser({ email: 'pj3@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignupPJ(db, authAdmin, uid, { ...PJ, email: 'pj3@exemplo.com', cnpj: '11222333000144', tipoPerfil: 'medico', crm: '', ufCrm: '' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'dados_invalidos');
    await assert.rejects(authAdmin.getUser(uid));
  });
  test('CNPJ duplicado e recusado', async () => {
    const { uid: u1 } = await authAdmin.createUser({ email: 'pjdup1@exemplo.com', password: 'x'.repeat(8) });
    await executarSignupPJ(db, authAdmin, u1, { ...PJ, email: 'pjdup1@exemplo.com', cnpj: '55666777000188' });
    const { uid: u2 } = await authAdmin.createUser({ email: 'pjdup2@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignupPJ(db, authAdmin, u2, { ...PJ, email: 'pjdup2@exemplo.com', cnpj: '55666777000188' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'cnpj_duplicado');
    await assert.rejects(authAdmin.getUser(u2), undefined, 'Auth user do 2o cadastro apagado');
  });
});
```

Adicionar `executarSignupPJ` ao import do topo do arquivo de teste:

```javascript
import { executarSignup, executarSignupPJ } from '../../src/lib/signup-server.ts';
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:api
```

Esperado: os testes PJ FALHAM (`executarSignupPJ` não existe).

- [ ] **Step 3: Escrever `executarSignupPJ` em `src/lib/signup-server.ts`**

Adicionar os tipos e a função (após `executarSignup`):

```typescript
export type DadosSignupPJ = DadosSignup & {
  cnpj: string; razaoSocial: string; nomeFantasia?: string; nomeLocal?: string;
};
export type ResultadoSignupPJ =
  | { ok: true; contaId: string; wsId: string; empresaId: string }
  | { ok: false; motivo: 'dados_invalidos' | 'ja_cadastrado' | 'cnpj_duplicado' | 'erro' };

export async function executarSignupPJ(
  db: Firestore, authAdmin: Auth, uid: string, dados: DadosSignupPJ,
  verificarCrm: VerificarCrm = async () => ({ status: 'nao_verificado', fonte: 'nenhum', checadoEm: null }),
): Promise<ResultadoSignupPJ> {
  const falhar = async (motivo: 'dados_invalidos' | 'cnpj_duplicado' | 'erro'): Promise<ResultadoSignupPJ> => {
    try { await authAdmin.deleteUser(uid); } catch { /* ja nao existia */ }
    return { ok: false, motivo };
  };

  const nome = (dados.nome ?? '').trim();
  const email = (dados.email ?? '').trim();
  const cnpj = String(dados.cnpj ?? '').replace(/\D/g, '');
  const razaoSocial = (dados.razaoSocial ?? '').trim();
  const tipoPerfil = dados.tipoPerfil === 'medico' ? 'medico' : 'assistente';
  const invalido = !nome || !email || cnpj.length !== 14 || !razaoSocial
    || (tipoPerfil === 'medico' && (!dados.crm || !dados.ufCrm));
  if (invalido) return falhar('dados_invalidos');

  try {
    const crmVerificacao = tipoPerfil === 'medico'
      ? await verificarCrm(dados.crm ?? '', (dados.ufCrm ?? '').toUpperCase())
      : { status: 'nao_verificado' as const, fonte: 'nenhum', checadoEm: null };

    const plano = await planoTrialPJ(db);
    const agora = new Date();
    const empresaRef = db.collection('empresas').doc();
    const contaRef = db.collection('contas').doc();
    const wsRef = db.collection('workspaces').doc();
    const contaId = contaRef.id;

    const motivo = await db.runTransaction(async (t) => {
      const perfilRef = db.doc(`profissionais/${uid}`);
      const perfilExistente = await t.get(perfilRef);
      if (perfilExistente.exists) return 'ja_cadastrado' as const;
      // CNPJ unico: query dentro da transacao (leitura antes de qualquer escrita)
      const dup = await t.get(db.collection('empresas').where('cnpj', '==', cnpj).limit(1));
      if (!dup.empty) return 'cnpj_duplicado' as const;

      t.set(perfilRef, {
        uid, nome, email,
        crm: dados.crm ?? '', ufCrm: (dados.ufCrm ?? '').toUpperCase(),
        especialidade: dados.especialidade ?? '', tipoPerfil,
        cpf: '', rqe: '', superadmin: false, crmVerificacao,
        criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp(),
      });
      t.set(empresaRef, {
        id: empresaRef.id, cnpj, razaoSocial, nomeFantasia: dados.nomeFantasia ?? '',
        tipo: 'clinica', masterUid: uid, status: 'ativa', criadoEm: FieldValue.serverTimestamp(),
      });
      t.set(contaRef, {
        id: contaId, tipo: 'PJ', nome: razaoSocial, ownerUid: uid, empresaId: empresaRef.id,
        status: 'ativa', criadoEm: FieldValue.serverTimestamp(),
      });
      t.set(wsRef, {
        id: wsRef.id, contaId, ownerUid: uid, tipo: 'PJ',
        nomeClinica: (dados.nomeLocal ?? '').trim() || razaoSocial || 'Unidade',
        corPrimaria: '#1E3A5F', corSecundaria: '#2563EB', criadoEm: FieldValue.serverTimestamp(),
      });
      t.set(db.doc(`vinculos/${contaId}_${uid}`), {
        id: `${contaId}_${uid}`, contaId, medicoUid: uid, papel: 'dono', locais: [],
        status: 'ativo', criadoEm: FieldValue.serverTimestamp(),
      });
      t.set(db.doc(`subscriptions/${contaId}`), {
        id: contaId, contaId, planoId: plano.id, tipo: 'trial', tipoPlano: 'PJ',
        franquiaMensal: plano.franquia, franquiaUsada: 0, creditosExtras: 0,
        excedente: plano.excedente, maxLocais: plano.maxLocais, localAdicional: plano.localAdicional,
        extratosFranquia: plano.extratosFranquia, extratoValor: plano.extratoValor,
        maxUsuarios: plano.maxUsuarios, usuarioAdicional: plano.usuarioAdicional,
        cicloInicio: Timestamp.fromDate(agora),
        cicloFim: Timestamp.fromDate(new Date(agora.getTime() + 30 * 864e5)),
        criadoEm: FieldValue.serverTimestamp(),
      });
      return 'ok' as const;
    });

    if (motivo === 'ja_cadastrado') return { ok: false, motivo };
    if (motivo === 'cnpj_duplicado') return falhar('cnpj_duplicado');
    return { ok: true, contaId, wsId: wsRef.id, empresaId: empresaRef.id };
  } catch (e) {
    console.error('executarSignupPJ:', e);
    return falhar('erro');
  }
}
```

E o helper de plano PJ (espelha `planoTrial`, mas pega o `pj_starter` como piso), adicionar após `planoTrial`:

```typescript
const PJ_STARTER_FALLBACK = {
  id: 'pj_starter', tipo: 'PJ', franquia: 300, excedente: 1.5, maxLocais: -1,
  localAdicional: 0, extratosFranquia: -1, extratoValor: 0, maxUsuarios: 3, usuarioAdicional: 66.99,
};
async function planoTrialPJ(db: Firestore) {
  try {
    const snap = await db.doc('configPlanos/atual').get();
    const planos = (snap.data()?.planos ?? []) as Array<Record<string, unknown>>;
    const p = planos.find(x => x.id === 'pj_starter');
    if (p) return { ...PJ_STARTER_FALLBACK, ...p };
  } catch { /* fallback */ }
  return PJ_STARTER_FALLBACK;
}
```

- [ ] **Step 4: A rota roteia PF vs PJ**

Em `src/app/api/signup/route.ts`, importar o novo e ler `tipoConta` do corpo:

```typescript
import { executarSignup, executarSignupPJ, type DadosSignup, type DadosSignupPJ } from '@/lib/signup-server';
```

Trocar o corpo do `try` por:

```typescript
    const body = (await req.json()) as (DadosSignup | DadosSignupPJ) & { tipoConta?: 'PF' | 'PJ' };
    const r = body.tipoConta === 'PJ'
      ? await executarSignupPJ(adminDb(), adminAuth(), uid, body as DadosSignupPJ, verificarCrmNoOp)
      : await executarSignup(adminDb(), adminAuth(), uid, body as DadosSignup, verificarCrmNoOp);
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.motivo] ?? 500 });
```

E acrescentar `cnpj_duplicado` ao mapa `STATUS`:

```typescript
const STATUS: Record<string, number> = { dados_invalidos: 400, ja_cadastrado: 409, cnpj_duplicado: 409, erro: 500 };
```

- [ ] **Step 5: Rodar até passar**

```bash
npm run test:api
```

Esperado: todos PASS (signup PF + PJ + billing-admin + exame + corrigir-laudo).

- [ ] **Step 6: Commit**

```bash
git add src/lib/signup-server.ts src/app/api/signup/route.ts tests/api/signup.test.mjs
git commit -m "feat(secao1): /api/signup cria conta PJ (empresa+conta+local+vinculo+assinatura), atomico, com rollback"
```

---

## Task 5: Formulário de cadastro PJ na tela de login

**Files:**
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `/api/signup` com `tipoConta:'PJ'`.
- Produces: aba "Cadastro PJ" funcional.

- [ ] **Step 1: Estado e handler do PJ**

Em `src/app/login/page.tsx`, adicionar os campos de estado (junto aos `pf*`):

```typescript
  const [pjCnpj, setPjCnpj] = useState('');
  const [pjRazao, setPjRazao] = useState('');
  const [pjLocal, setPjLocal] = useState('');
  const [pjNome, setPjNome] = useState('');
  const [pjEmail, setPjEmail] = useState('');
  const [pjSenha, setPjSenha] = useState('');
  const [pjEhMedico, setPjEhMedico] = useState(false);
  const [pjCrm, setPjCrm] = useState('');
  const [pjUf, setPjUf] = useState('');
```

Adicionar o handler (espelha `handleCadastroPF`, mas manda `tipoConta:'PJ'` + campos de empresa):

```typescript
  async function handleCadastroPJ(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setSucesso(''); setLoading(true);
    try {
      const cnpjLimpo = pjCnpj.replace(/\D/g, '');
      if (!pjNome || !pjEmail || !pjSenha || !pjRazao) { setErro('Preencha nome, email, senha e razão social.'); setLoading(false); return; }
      if (cnpjLimpo.length !== 14) { setErro('CNPJ inválido.'); setLoading(false); return; }
      if (pjEhMedico && (!pjCrm || !pjUf)) { setErro('CRM e UF são obrigatórios para médicos.'); setLoading(false); return; }
      if (pjSenha.length < 6) { setErro('Senha deve ter ao menos 6 caracteres.'); setLoading(false); return; }

      const cred = await createUserWithEmailAndPassword(auth, pjEmail, pjSenha);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          tipoConta: 'PJ', nome: pjNome, email: pjEmail,
          tipoPerfil: pjEhMedico ? 'medico' : 'assistente',
          crm: pjCrm, ufCrm: pjUf.toUpperCase(),
          cnpj: cnpjLimpo, razaoSocial: pjRazao, nomeLocal: pjLocal,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        await auth.signOut().catch(() => {});
        setErro(data.motivo === 'cnpj_duplicado' ? 'Este CNPJ já está cadastrado.'
          : data.motivo === 'dados_invalidos' ? 'Dados incompletos. Confira CNPJ, razão social e CRM/UF.'
          : 'Erro ao criar a conta. Tente novamente.');
        setLoading(false); return;
      }
      await sendEmailVerification(cred.user);
      await auth.signOut();
      setSucesso('Conta da clínica criada! Verifique seu email para ativar.');
      setTab('login');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      setErro(code === 'auth/email-already-in-use' ? 'Este email já está cadastrado.' : 'Erro ao cadastrar: ' + (err as Error).message);
    }
    setLoading(false);
  }
```

- [ ] **Step 2: Trocar o stub da aba PJ pelo formulário**

Substituir o bloco `{tab === 'cadastroPJ' && (...)}` (o placeholder "será implementado na próxima fase") por:

```tsx
            {tab === 'cadastroPJ' && (
              <form onSubmit={handleCadastroPJ} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">CNPJ</label>
                  <input type="text" value={pjCnpj} onChange={e => setPjCnpj(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" placeholder="00.000.000/0000-00" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Razão social</label>
                  <input type="text" value={pjRazao} onChange={e => setPjRazao(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Nome do primeiro local</label>
                  <input type="text" value={pjLocal} onChange={e => setPjLocal(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" placeholder="Unidade Centro" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Seu nome</label>
                  <input type="text" value={pjNome} onChange={e => setPjNome(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" required />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={pjEhMedico} onChange={e => setPjEhMedico(e.target.checked)} />
                  Sou médico (vou assinar laudos)
                </label>
                {pjEhMedico && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">CRM</label>
                      <input type="text" value={pjCrm} onChange={e => setPjCrm(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">UF</label>
                      <input type="text" value={pjUf} onChange={e => setPjUf(e.target.value.toUpperCase())}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" maxLength={2} placeholder="PA" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Email</label>
                  <input type="email" value={pjEmail} onChange={e => setPjEmail(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Senha</label>
                  <input type="password" value={pjSenha} onChange={e => setPjSenha(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E3A5F]" placeholder="Mínimo 6 caracteres" required />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-[#1E3A5F] text-white py-3 rounded-lg font-semibold text-sm hover:bg-[#2563EB] transition disabled:opacity-50">
                  {loading ? 'Cadastrando...' : 'Criar conta da clínica'}
                </button>
              </form>
            )}
```

- [ ] **Step 3: Verificar no navegador**

```bash
npm run dev
```

Abrir `http://localhost:3000/login`, aba "Cadastro PJ": o formulário aparece; marcar "Sou médico" revela CRM/UF. Não submeter com conta real (o cadastro cria dados). Conferir só render + console sem erro.

```bash
npm run typecheck && npm run lint
```

Esperado: sem erro novo nos arquivos tocados.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(secao1): formulario de cadastro PJ na tela de login"
```

---

## Task 6: Selo interno de verificação de CRM

**Files:**
- Create: `src/components/SeloCrm.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useAuth().profile.crmVerificacao` (`CrmVerificacao` do Task 1).
- Produces: `<SeloCrm />` — só render interno. **Não é importado por `pdf-server.ts`/`gerarPdfHtml`.**

- [ ] **Step 1: Criar `SeloCrm.tsx`**

```tsx
'use client';
// Selo INTERNO do estado de verificacao de CRM (Plano 2B-B1, B5 do spec).
// NUNCA entra no laudo (PDF) — e controle interno. So aparece para perfil medico.
import { useAuth } from '@/contexts/AuthContext';

export default function SeloCrm() {
  const { profile } = useAuth();
  if ((profile?.tipoPerfil ?? 'medico') === 'assistente') return null;   // so medico tem CRM
  const v = (profile?.crmVerificacao ?? { status: 'nao_verificado' }) as { status: string; checadoEm?: string | null };

  if (v.status === 'verificado') {
    const quando = v.checadoEm ? new Date(v.checadoEm).toLocaleDateString('pt-BR') : '';
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">CRM verificado no CFM{quando ? ` · ${quando}` : ''}</span>;
  }
  if (v.status === 'reprovado') {
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">CRM não confirmado — falar com o suporte</span>;
  }
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold" title="Verificação automática de CRM em breve">CRM informado — verificação em breve</span>;
}
```

- [ ] **Step 2: Mostrar no cabeçalho do perfil (sidebar do dashboard)**

Em `src/app/dashboard/page.tsx`, importar e inserir o selo no cartão do perfil (logo abaixo do `tipoPerfil`, dentro do bloco `<div className="bg-white rounded-xl shadow p-4 text-center">`):

```typescript
import SeloCrm from '@/components/SeloCrm';
```

Após a linha `<p className="text-xs text-blue-600 font-semibold capitalize">{profile?.tipoPerfil || 'Médico'}</p>`, adicionar:

```tsx
            <div className="mt-1 flex justify-center"><SeloCrm /></div>
```

- [ ] **Step 3: Confirmar que o selo NÃO toca o PDF**

```bash
grep -rn "SeloCrm\|crmVerificacao" src/lib/pdf-server.ts src/app/laudo
```

Esperado: **nenhuma** ocorrência em `pdf-server.ts` nem no gerador de HTML do laudo. Se aparecer, remover — o selo é interno.

```bash
npm run typecheck && npm run lint
```

Esperado: sem erro novo.

- [ ] **Step 4: Commit**

```bash
git add src/components/SeloCrm.tsx src/app/dashboard/page.tsx
git commit -m "feat(secao1): selo interno de verificacao de CRM (nunca no laudo)"
```

---

## Task 7: Botão "Cancelar laudo" no Histórico

**Files:**
- Modify: `src/lib/permissoes.ts`
- Modify: `tests/unit/permissoes.test.mjs`
- Modify: `src/components/Historico.tsx`

**Interfaces:**
- Consumes: `/api/exame` (`acao:'cancelar'`, do Plano 2A); `useAuth()`.
- Produces: `podeCancelarLaudo(perfil, exame, uid, papel): boolean` — dono, ou médico autor.

- [ ] **Step 1: Teste de `podeCancelarLaudo`**

Em `tests/unit/permissoes.test.mjs`, adicionar:

```javascript
import { podeCancelarLaudo } from '../../src/lib/permissoes.ts';

describe('podeCancelarLaudo', () => {
  const medico = { tipoPerfil: 'medico' };
  const assist = { tipoPerfil: 'assistente' };
  test('dono cancela qualquer laudo', () => {
    assert.equal(podeCancelarLaudo(assist, { medicoUid: 'outro' }, 'donoUid', 'dono'), true);
  });
  test('medico autor cancela o seu', () => {
    assert.equal(podeCancelarLaudo(medico, { medicoUid: 'u1' }, 'u1', 'medico'), true);
  });
  test('medico NAO autor nao cancela', () => {
    assert.equal(podeCancelarLaudo(medico, { medicoUid: 'u2' }, 'u1', 'medico'), false);
  });
  test('recepcao nao cancela', () => {
    assert.equal(podeCancelarLaudo(medico, { medicoUid: 'u1' }, 'u1', 'recepcao'), false);
  });
});
```

(Acrescentar `podeCancelarLaudo` ao import existente de `permissoes.ts` no topo do teste.)

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:unit
```

Esperado: FALHA (`podeCancelarLaudo` não existe).

- [ ] **Step 3: Implementar `podeCancelarLaudo` em `src/lib/permissoes.ts`**

```typescript
// Cancelar laudo emitido: o dono (administrativo) ou o medico autor. Recepcao nao.
// (A rota /api/exame acao:'cancelar' devolve franquia, loga e apaga o PDF.)
export function podeCancelarLaudo(
  perfil: PerfilLite, exame: ExameLite, uid: string, papel: Papel | null | undefined,
): boolean {
  if (papel === 'dono') return true;
  if (papel === 'medico' && ehMedico(perfil)) return exame?.medicoUid === uid;
  return false;
}
```

- [ ] **Step 4: Rodar até passar**

```bash
npm run test:unit
```

Esperado: todos PASS.

- [ ] **Step 5: Botão "Cancelar" no Histórico**

Em `src/components/Historico.tsx`, importar o helper e o `papel`:

```typescript
import { podeCancelarLaudo } from '@/lib/permissoes';
```

Trazer `papel` e `profile` do `useAuth()`:

```typescript
  const { workspace, user, papel, profile } = useAuth();
```

Adicionar o estado do modal de cancelamento (junto aos outros `useState`):

```typescript
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
```

Adicionar a função de cancelar (perto de `confirmarDelete`):

```typescript
  async function confirmarCancelamento() {
    if (!cancelId || !wsIdSel || !user?.uid) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/exame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acao: 'cancelar', wsId: wsIdSel, exameId: cancelId, motivo: cancelMotivo }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.motivo === 'sem_permissao' ? 'Cancelar laudo é ação do médico autor ou do responsável.' : 'Não foi possível cancelar. Tente novamente.');
        setCancelId(null); return;
      }
      setExames(prev => prev.map(e => e.id === cancelId ? { ...e, status: 'cancelado' } : e));
      setCancelId(null); setCancelMotivo('');
    } catch (e) {
      console.error('Erro ao cancelar:', e);
      alert('Não foi possível cancelar. Verifique a conexão.');
      setCancelId(null);
    }
  }
```

Na lista de exames, onde os botões de ação de cada linha são renderizados (junto do "Excluir"/"Imprimir"), adicionar o botão condicionado (`ex` é o item da linha):

```tsx
                {podeCancelarLaudo(profile, ex, user?.uid || '', papel) && (
                  <button onClick={() => setCancelId(ex.id)}
                    className="text-xs text-orange-600 hover:underline">Cancelar</button>
                )}
```

E o modal de confirmação (perto do modal de exclusão já existente):

```tsx
      {cancelId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setCancelId(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[#1E3A5F]">Cancelar laudo</h3>
            <p className="text-sm text-gray-500 mt-1">O laudo deixa de ser servido, a franquia é devolvida e fica registrado. Informe o motivo:</p>
            <input type="text" value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm mt-3 focus:outline-none focus:border-[#1E3A5F]" placeholder="Ex.: exame repetido" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setCancelId(null)} className="flex-1 border rounded-lg py-2 text-sm">Voltar</button>
              <button onClick={confirmarCancelamento} className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-semibold">Cancelar laudo</button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Verificar e commitar**

```bash
npm run typecheck && npm run lint && npm run test:unit
```

Esperado: os três limpos.

```bash
git add src/lib/permissoes.ts tests/unit/permissoes.test.mjs src/components/Historico.tsx
git commit -m "feat(secao1): botao cancelar laudo no Historico (via /api/exame, gate por papel+autoria)"
```

---

## Task 8: Integração, ADR e merge

**Files:**
- Modify: `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md` (registrar 2B-B1)

- [ ] **Step 1: Rodar tudo junto**

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"
npm run test:unit && npm run test:api && npm run test:rules && npm run typecheck && npm run lint
```

Esperado: unit, api e rules verdes; typecheck limpo; lint sem erro novo.

- [ ] **Step 2: Registrar no ADR**

Em `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md`, acrescentar `### 8.5 Plano 2B-B1 (PJ + trava do CRM)` com: a trava (editar/reabrir laudo exige perfil médico via `ehMedicoDeVerdade`; dono não-médico só administra fila; correção administrativa de emitido é da `/api/corrigir-laudo`); cadastro PJ (empresa+conta+local+vínculo+assinatura, CNPJ único, rollback); verificação plugável no-op + selo interno que **não entra no PDF**; botão cancelar. Registrar o que fica pro 2B-B2 (convite) e o follow-up (ligar provedor real de CRM).

- [ ] **Step 3: Commit, push e merge (com aprovação do Dr. Sérgio)**

```bash
git add docs/decisoes/2026-08-09-secao1-contas-e-acesso.md
git commit -m "docs(ADR): Plano 2B-B1 concluido — PJ + trava do CRM (ato medico)"
git push origin feat/secao1-plano2b-b1
git checkout master && git merge --no-ff feat/secao1-plano2b-b1 -m "feat(secao1): Plano 2B-B1 — cadastro PJ + trava do CRM (ato medico)" && git push origin master
```

- [ ] **Step 4: Republicar as regras (a trava do CRM só vale publicada)**

A mudança em `firestore.rules` só protege quando publicada. Do master atualizado:

```bash
npm run secao1:publicar-regras
```

Conferir o ensaio (arquivo certo). Então:

```bash
npm run secao1:publicar-regras -- --commit
npm run secao1:regras-publicadas
```

Esperado: `PUBLICADO E VERIFICADO`; o veredito confirma a regra nova no ar. Rollback, se preciso: tag `pre-fase5` + `secao1:publicar-regras --file=<backup> --commit`.

- [ ] **Step 5: Verificar o deploy do app**

```bash
curl -sL -o /dev/null -w '%{http_code}\n' https://www.souleo.com.br/login
```

Esperado: `200`. Smoke humano (Dr. Sérgio): abrir a aba "Cadastro PJ" e ver o formulário; conferir o selo "CRM informado — verificação em breve" no perfil.

---

## Fora deste plano

| Item | Onde |
|---|---|
| Convite por link (WhatsApp) + aceitar via rota + telas | **Plano 2B-B2** |
| Ligar provedor real de verificação de CRM (Consultar.IO/CFM) | Follow-up, quando o Dr. Sérgio escolher/contratar |
| Unificar a matriz num ponto de verdade; wrapper único de rota autenticada | Refactors, quando tocarem esses arquivos |
| Código morto + fallbacks legados | **Plano 3** |
