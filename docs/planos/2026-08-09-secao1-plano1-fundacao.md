# Seção 1 — Plano 1: Fundação de dados + fechadura

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a camada `contas` acima dos locais, migrar vínculos e assinaturas para o novo formato, e escrever + testar a fechadura do Firestore — sem publicar a fechadura e sem mover nenhum exame ou paciente.

**Architecture:** Caminho A (aditivo) do spec `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md`. `workspaces` continua sendo o LOCAL (o Wader lê esse caminho e não é tocado neste plano). Nasce `contas`; `vinculos` ganha id determinístico `{contaId}_{uid}` — pré-requisito para qualquer regra de papel, porque Security Rules só sabem ler documento por endereço exato, não sabem consultar. Scripts de migração usam Admin SDK, sempre com ensaio (`--dry-run`) antes da escrita.

**Tech Stack:** Node 24 (executor de testes embutido, `node --test`), firebase-admin 13, firebase-tools 15 (emulador), `@firebase/rules-unit-testing`, Firebase Rules REST API.

## Global Constraints

- Branch de trabalho: `feat/secao1-contas`. **Nunca commitar em `master`** — push no master deploya `souleo.com.br`.
- **Não rodar `firebase deploy --only firestore:rules` neste plano.** A publicação é a última tarefa do Plano 2, depois que o cadastro server-side existir. Publicar antes quebra o cadastro em produção.
- Nenhum documento em `workspaces/{id}/exames` ou `/pacientes` pode ser criado, alterado ou movido.
- Nenhum campo é removido neste plano. Só adição. Limpeza é o Plano 3.
- Todo script de escrita aceita `--dry-run` (padrão) e só grava com `--commit`.
- Projeto Firebase: `leo-sistema-laudos`. Credenciais em `.env.local` (`FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`). Carregar com `node --env-file=.env.local`.
- Papéis válidos, exatamente estas strings: `'dono'`, `'medico'`, `'recepcao'`.
- `vinculo.locais`: array vazio = todos os locais da conta; array preenchido = só aqueles.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `scripts/secao1/lib-admin.mjs` (criar) | Inicializa firebase-admin a partir do `.env.local`. Usado por todos os scripts. |
| `scripts/secao1/00-inventario.mjs` (criar) | Somente leitura: conta e descreve o estado atual. Nenhuma escrita. |
| `scripts/secao1/00-regras-publicadas.mjs` (criar) | Somente leitura: baixa do Firebase a regra de Firestore que está publicada agora. Responde a Fase 0 sem depender do console. |
| `scripts/secao1/01-migrar-contas.mjs` (criar) | Fases 1-3: cria `contas`, grava `contaId` nos locais, recria vínculos com id determinístico + papel, republica a assinatura em `subscriptions/{contaId}`. Dry-run por padrão. |
| `firestore.rules` (substituir conteúdo) | A fechadura nova. Hoje contém a regra de abril, insegura, com cabeçalho de aviso. |
| `tests/rules/regras.test.mjs` (criar) | Os 6 testes de fechadura do spec §8, no emulador. |
| `tests/rules/README.md` (criar) | Como rodar os testes (exige JDK). |
| `src/lib/contas.ts` (criar) | Leitura do novo modelo pelo app: `getConta`, `getVinculosDoUsuario`, `getSubscriptionDaConta`, com fallback para o formato antigo. |
| `src/contexts/AuthContext.tsx` (modificar) | Passa a montar o contexto a partir de conta + locais, com fallback. |
| `package.json` (modificar) | Scripts `test:rules`, `secao1:inventario`, `secao1:regras-publicadas`, `secao1:migrar`. |

---

## Task 1: Descobrir o estado real (Fase 0)

**Files:**
- Create: `scripts/secao1/lib-admin.mjs`
- Create: `scripts/secao1/00-inventario.mjs`
- Create: `scripts/secao1/00-regras-publicadas.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nada.
- Produces: `getDb()` e `getCredential()` de `lib-admin.mjs`, usados pelas tarefas 4 e 6. Relatório em texto no terminal.

- [ ] **Step 1: Criar o inicializador comum**

`scripts/secao1/lib-admin.mjs`:

```javascript
// Inicializa o firebase-admin a partir das variaveis do .env.local.
// Rodar sempre com: node --env-file=.env.local <script>
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const PROJECT_ID = 'leo-sistema-laudos';

function credencial() {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) {
    throw new Error(
      'FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY ausentes. ' +
      'Rode com: node --env-file=.env.local <script>'
    );
  }
  return cert({ projectId: PROJECT_ID, clientEmail, privateKey });
}

export function getCredential() {
  return credencial();
}

export function getDb() {
  if (!getApps().length) initializeApp({ credential: credencial() });
  return getFirestore();
}

// true = grava de verdade. Padrao e ensaio.
export const COMMIT = process.argv.includes('--commit');
export function modo() {
  return COMMIT ? 'GRAVANDO' : 'ENSAIO (use --commit para gravar)';
}
```

- [ ] **Step 2: Criar o inventário (somente leitura)**

`scripts/secao1/00-inventario.mjs`:

```javascript
// Somente leitura. Nao escreve nada. Responde: o que existe hoje?
import { getDb } from './lib-admin.mjs';

const db = getDb();

async function main() {
  const [profissionais, empresas, workspaces, vinculos, subscriptions] =
    await Promise.all([
      db.collection('profissionais').get(),
      db.collection('empresas').get(),
      db.collection('workspaces').get(),
      db.collection('vinculos').get(),
      db.collection('subscriptions').get(),
    ]);

  console.log('=== CONTAGEM ===');
  for (const [nome, snap] of [
    ['profissionais', profissionais], ['empresas', empresas],
    ['workspaces', workspaces], ['vinculos', vinculos],
    ['subscriptions', subscriptions],
  ]) console.log(`${nome.padEnd(15)} ${snap.size}`);

  console.log('\n=== LOCAIS (workspaces) ===');
  for (const d of workspaces.docs) {
    const w = d.data();
    const exames = await d.ref.collection('exames').count().get();
    const pacientes = await d.ref.collection('pacientes').count().get();
    console.log(
      `${d.id}  tipo=${w.tipo ?? '?'}  nome=${JSON.stringify(w.nomeClinica ?? '')}  ` +
      `owner=${w.ownerUid ?? '-'}  contaId=${w.contaId ?? 'AUSENTE'}  ` +
      `exames=${exames.data().count}  pacientes=${pacientes.data().count}  ` +
      `segredos=[${['feegowToken','ortancUrl','ortancUser','ortancPass'].filter(k => w[k]).join(',') || 'nenhum'}]`
    );
  }

  console.log('\n=== VINCULOS ===');
  for (const d of vinculos.docs) {
    const v = d.data();
    const idDeterministico = /^[A-Za-z0-9]+_[A-Za-z0-9]+$/.test(d.id);
    console.log(
      `${d.id}  medicoUid=${v.medicoUid}  workspaceId=${v.workspaceId ?? '-'}  ` +
      `contaId=${v.contaId ?? 'AUSENTE'}  role=${v.role ?? '-'}  papel=${v.papel ?? 'AUSENTE'}  ` +
      `status=${v.status}  idDeterministico=${idDeterministico}`
    );
  }

  console.log('\n=== ASSINATURAS ===');
  for (const d of subscriptions.docs) {
    const s = d.data();
    console.log(
      `${d.id}  workspaceId=${s.workspaceId ?? '-'}  contaId=${s.contaId ?? 'AUSENTE'}  ` +
      `tipo=${s.tipo}  franquia=${s.franquiaUsada ?? 0}/${s.franquiaMensal ?? '?'}`
    );
  }

  const porWs = {};
  for (const d of subscriptions.docs) {
    const ws = d.data().workspaceId;
    if (ws) (porWs[ws] ??= []).push(d.id);
  }
  const dupes = Object.entries(porWs).filter(([, ids]) => ids.length > 1);
  console.log(dupes.length
    ? `\nATENCAO: assinatura duplicada: ${JSON.stringify(dupes)}`
    : '\nNenhuma assinatura duplicada.');

  console.log('\n=== SUPERADMINS / ADMINROLE ===');
  for (const d of profissionais.docs) {
    const p = d.data();
    if (p.superadmin === true || p.adminRole) {
      console.log(`${d.id}  nome=${JSON.stringify(p.nome ?? '')}  superadmin=${p.superadmin === true}  adminRole=${p.adminRole ?? '-'}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Criar o leitor da regra publicada**

`scripts/secao1/00-regras-publicadas.mjs`:

```javascript
// Somente leitura. Baixa a regra de Firestore que esta PUBLICADA agora.
// Responde a Fase 0 sem depender do console do Firebase.
import { writeFileSync } from 'node:fs';
import { getCredential, PROJECT_ID } from './lib-admin.mjs';

const API = 'https://firebaserules.googleapis.com/v1';

async function token() {
  const { access_token } = await getCredential().getAccessToken();
  return access_token;
}

async function api(caminho, tk) {
  const r = await fetch(`${API}/${caminho}`, { headers: { Authorization: `Bearer ${tk}` } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} em ${caminho}: ${await r.text()}`);
  return r.json();
}

async function main() {
  const tk = await token();
  const release = await api(`projects/${PROJECT_ID}/releases/cloud.firestore`, tk);
  console.log(`Release:  ${release.name}`);
  console.log(`Ruleset:  ${release.rulesetName}`);
  console.log(`Criado:   ${release.createTime}`);
  console.log(`Alterado: ${release.updateTime}`);

  const ruleset = await api(release.rulesetName, tk);
  const conteudo = ruleset.source.files.map(f => f.content).join('\n');

  const destino = 'firestore.rules.PUBLICADA.txt';
  writeFileSync(destino, conteudo, 'utf8');
  console.log(`\nRegra publicada salva em ${destino} (${conteudo.split('\n').length} linhas)\n`);
  console.log('=== VEREDITO RAPIDO ===');
  const frouxa = /allow\s+(read|write|read,\s*write)\s*:\s*if\s+true/.test(conteudo);
  console.log(frouxa
    ? 'MODO TESTE DETECTADO: existe "allow ...: if true". Fechadura aberta.'
    : 'Nao ha "if true" — nao esta em modo teste (mas pode estar frouxa mesmo assim).');
  console.log(`Menciona "contas": ${/\/contas\//.test(conteudo)}`);
  console.log(`Bloqueia superadmin: ${/superadmin/.test(conteudo)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Registrar os scripts no package.json**

Adicionar em `"scripts"` (manter os existentes):

```json
"secao1:inventario": "node --env-file=.env.local scripts/secao1/00-inventario.mjs",
"secao1:regras-publicadas": "node --env-file=.env.local scripts/secao1/00-regras-publicadas.mjs"
```

- [ ] **Step 5: Rodar os dois e guardar a saída**

```bash
npm run secao1:regras-publicadas
```

Esperado: imprime o ruleset publicado, salva `firestore.rules.PUBLICADA.txt` e dá o veredito. **Se disser "MODO TESTE DETECTADO", parar e avisar o Dr. Sérgio antes de seguir** — a fechadura passa a ser a prioridade um.

```bash
npm run secao1:inventario
```

Esperado: contagens e uma linha por local, vínculo e assinatura. Anotar quantos locais existem e se algum vínculo já tem id determinístico.

- [ ] **Step 6: Proteger o arquivo baixado e commitar**

O `firestore.rules.PUBLICADA.txt` é um retrato do que está no ar — útil como backup, mas não deve virar fonte de confusão com o `firestore.rules`.

Adicionar ao `.gitignore`:

```
firestore.rules.PUBLICADA.txt
```

```bash
git add scripts/secao1/ package.json .gitignore
git commit -m "feat(secao1): scripts de inventario e leitura da regra publicada (somente leitura)"
```

---

## Task 2: Preparar o emulador (pré-requisito dos testes)

**Files:**
- Create: `tests/rules/README.md`
- Modify: `package.json` (script `test:rules`)
- Modify: `firebase.json` (bloco `emulators`)

**Interfaces:**
- Consumes: `firestore.rules` (o arquivo da raiz).
- Produces: comando `npm run test:rules`, usado pelas tarefas 3 e 5.

- [ ] **Step 1: Instalar o JDK (o emulador do Firestore roda em JVM)**

Verificar primeiro:

```bash
java -version
```

Se responder "command not found", instalar (PowerShell):

```bash
winget install --id Microsoft.OpenJDK.17 -e --accept-source-agreements --accept-package-agreements
```

Fechar e reabrir o terminal. Confirmar:

```bash
java -version
```

Esperado: `openjdk version "17..."`. **Sem isso, o emulador não sobe e nenhum teste de regra roda.**

- [ ] **Step 2: Instalar as dependências de teste**

```bash
npm install -D @firebase/rules-unit-testing firebase-tools
```

Esperado: as duas entram em `devDependencies`. Nenhum framework de teste — o Node 24 já tem `node --test`.

- [ ] **Step 3: Declarar o emulador no firebase.json**

Adicionar ao objeto raiz de `firebase.json` (mantendo `firestore` e `storage`):

```json
"emulators": {
  "firestore": { "port": 8080 },
  "ui": { "enabled": false },
  "singleProjectMode": true
}
```

- [ ] **Step 4: Registrar o script de teste**

Adicionar em `"scripts"`:

```json
"test:rules": "firebase emulators:exec --only firestore --project leo-testes \"node --test tests/rules\""
```

O projeto `leo-testes` é fictício e existe só dentro do emulador. **Nada toca o projeto real.**

- [ ] **Step 5: Escrever o README dos testes**

`tests/rules/README.md`:

```markdown
# Testes das regras do Firestore

Provam o isolamento entre contas, os papéis e o fechamento dos segredos.
Rodam num Firestore falso, na sua máquina. Não tocam produção.

## Pré-requisitos

- JDK 17+ (`java -version`). Instalar: `winget install --id Microsoft.OpenJDK.17 -e`
- `npm install` já rodado.

## Rodar

    npm run test:rules

O emulador sobe, roda `tests/rules/*.test.mjs` e desce sozinho.

## O que cada teste prova

Ver `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md` §8.
```

- [ ] **Step 6: Confirmar que o emulador sobe**

```bash
npx firebase emulators:exec --only firestore --project leo-testes "echo EMULADOR_OK"
```

Esperado: sobe, imprime `EMULADOR_OK`, desce. Se falhar por Java, voltar ao Step 1.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json firebase.json tests/rules/README.md
git commit -m "chore(secao1): emulador do Firestore + node --test para as regras"
```

---

## Task 3: Escrever a fechadura definitiva e provar que ela fecha

> **Mudança em relação à versão original deste plano (09/08/2026, após a Fase 0):**
> a Fase 0 revelou que a regra publicada em produção era `allow read, write: if
> request.auth != null` em `/{document=**}` — banco inteiro aberto a qualquer
> autenticado. Uma **tranca provisória** (isolamento por `workspaces.ownerUid`) já
> foi escrita, testada com 35 testes e **publicada em 09/08/2026 18:34**. Ela vive
> em `firestore.rules`, que é o arquivo que o `firebase.json` declara e o que o
> deploy publica.
>
> Por isso esta tarefa **NÃO** escreve em `firestore.rules`. A fechadura definitiva
> (modelo de contas) vai para **`firestore.rules.definitiva`**, um arquivo à parte,
> testado mas não publicável por acidente. A troca acontece na última tarefa do
> Plano 2, quando o cadastro server-side existir. Regra de ouro: **`firestore.rules`
> sempre reflete exatamente o que está no ar.**

**Files:**
- Create: `firestore.rules.definitiva`
- Create: `tests/rules/definitiva.test.mjs`
- Modify: `package.json` (script `test:rules:definitiva`)

**Interfaces:**
- Consumes: modelo do spec §3 — `contas/{contaId}`, `workspaces.contaId`,
  `vinculos/{contaId}_{uid}` com `papel` ('dono'|'medico'|'recepcao') e `locais` (array;
  vazio = todos os locais da conta), `subscriptions/{contaId}`.
- Produces: `firestore.rules.definitiva`, pronta para substituir `firestore.rules` no Plano 2.

- [ ] **Step 1: Escrever os testes primeiro**

`tests/rules/definitiva.test.mjs`:

```javascript
// Fechadura DEFINITIVA (modelo de contas). Le firestore.rules.definitiva.
// Nao e a regra publicada — essa e firestore.rules (tranca provisoria).
import { test, before, after, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where,
} from 'firebase/firestore';

let env;

// Conta A (clinica): Dr. A dono+medico, Dr. A2 medico, Rita recepcao, 2 locais.
// Conta B (outra clinica): Dr. B.
const CONTA_A = 'contaA', CONTA_B = 'contaB';
const LOCAL_A1 = 'localA1', LOCAL_A2 = 'localA2', LOCAL_B = 'localB';
const DR_A = 'uidDrA', DR_A2 = 'uidDrA2', RITA = 'uidRita', DR_B = 'uidDrB', ADMIN = 'uidAdmin';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'leo-testes-definitiva',
    firestore: { rules: readFileSync('firestore.rules.definitiva', 'utf8'), host: '127.0.0.1', port: 8080 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    await setDoc(doc(db, 'contas', CONTA_A), { tipo: 'PJ', nome: 'Clinica A', ownerUid: DR_A });
    await setDoc(doc(db, 'contas', CONTA_B), { tipo: 'PF', nome: 'Dr B', ownerUid: DR_B });

    await setDoc(doc(db, 'workspaces', LOCAL_A1), { contaId: CONTA_A, nomeClinica: 'Sala 1' });
    await setDoc(doc(db, 'workspaces', LOCAL_A2), { contaId: CONTA_A, nomeClinica: 'Sala 2' });
    await setDoc(doc(db, 'workspaces', LOCAL_B), { contaId: CONTA_B, nomeClinica: 'Consultorio B' });

    await setDoc(doc(db, `workspaces/${LOCAL_A1}/privado`, 'integracoes'), {
      feegowToken: 'SEGREDO', ortancUser: 'orthanc', ortancPass: 'SENHA',
    });

    await setDoc(doc(db, `workspaces/${LOCAL_A1}/exames`, 'ex1'), {
      pacienteNome: 'Paciente A1', medicoUid: DR_A, status: 'emitido',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_A2}/exames`, 'ex2'), {
      pacienteNome: 'Paciente A2', medicoUid: DR_A2, status: 'emitido',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_B}/exames`, 'exB'), {
      pacienteNome: 'Paciente B', medicoUid: DR_B, status: 'emitido',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/pacientes`, 'pac1'), { nome: 'Paciente A1' });
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/config`, 'honorarios'), { UNIMED: 120 });

    // Vinculos com id deterministico. Rita so alcanca o LOCAL_A1.
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${DR_A}`),  { contaId: CONTA_A, medicoUid: DR_A,  papel: 'dono',     locais: [], status: 'ativo' });
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${DR_A2}`), { contaId: CONTA_A, medicoUid: DR_A2, papel: 'medico',   locais: [], status: 'ativo' });
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${RITA}`),  { contaId: CONTA_A, medicoUid: RITA,  papel: 'recepcao', locais: [LOCAL_A1], status: 'ativo' });
    await setDoc(doc(db, 'vinculos', `${CONTA_B}_${DR_B}`),  { contaId: CONTA_B, medicoUid: DR_B,  papel: 'dono',     locais: [], status: 'ativo' });

    await setDoc(doc(db, 'profissionais', DR_A), { nome: 'Dr A', superadmin: false });
    await setDoc(doc(db, 'profissionais', DR_B), { nome: 'Dr B', superadmin: false });
    await setDoc(doc(db, 'profissionais', RITA), { nome: 'Rita', superadmin: false });
    await setDoc(doc(db, 'profissionais', ADMIN), { nome: 'Direx', superadmin: true });

    await setDoc(doc(db, 'subscriptions', CONTA_A), { contaId: CONTA_A, tipo: 'expert', franquiaMensal: 600, franquiaUsada: 10 });
    await setDoc(doc(db, 'subscriptions', CONTA_B), { contaId: CONTA_B, tipo: 'trial', franquiaMensal: 600, franquiaUsada: 0 });
    await setDoc(doc(db, 'configPlanos', 'atual'), { planos: [] });
    await setDoc(doc(db, 'pagamentos', 'pg1'), { valor: 100 });
  });
});

after(async () => { await env.cleanup(); });

const como = (uid) => env.authenticatedContext(uid).firestore();

describe('1. isolamento entre contas', () => {
  test('medico da conta A nao le exame da conta B', async () => {
    await assertFails(getDoc(doc(como(DR_A), `workspaces/${LOCAL_B}/exames`, 'exB')));
  });
  test('medico da conta A nao escreve exame da conta B', async () => {
    await assertFails(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_B}/exames`, 'exB'), { status: 'x' }));
  });
  test('medico da conta A le exame do proprio local', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/exames`, 'ex1')));
  });
  test('nao membro nao le a conta', async () => {
    await assertFails(getDoc(doc(como(DR_B), 'contas', CONTA_A)));
  });
  test('nao autenticado nao le nada', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, `workspaces/${LOCAL_A1}/exames`, 'ex1')));
  });
});

describe('2. papeis', () => {
  test('recepcao nao le a assinatura (financeiro)', async () => {
    await assertFails(getDoc(doc(como(RITA), 'subscriptions', CONTA_A)));
  });
  test('dono le a assinatura', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A), 'subscriptions', CONTA_A)));
  });
  test('medico le a assinatura', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A2), 'subscriptions', CONTA_A)));
  });
  test('medico nao dono nao edita o local', async () => {
    await assertFails(updateDoc(doc(como(DR_A2), 'workspaces', LOCAL_A1), { nomeClinica: 'X' }));
  });
  test('dono edita o local', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), 'workspaces', LOCAL_A1), { nomeClinica: 'Sala 1 nova' }));
  });
  test('recepcao cadastra exame e paciente', async () => {
    await assertSucceeds(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'novo'), { pacienteNome: 'Novo', status: 'aguardando' }));
    await assertSucceeds(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/pacientes`, 'pac9'), { nome: 'Novo' }));
  });
  test('recepcao nao edita o conteudo do laudo', async () => {
    await assertFails(updateDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/exames`, 'ex1'), { conclusoes: 'x' }));
  });
});

describe('3. locais restritos', () => {
  test('recepcao restrita ao LOCAL_A1 nao le exame do LOCAL_A2', async () => {
    await assertFails(getDoc(doc(como(RITA), `workspaces/${LOCAL_A2}/exames`, 'ex2')));
  });
  test('medico sem restricao le os dois locais da conta', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'ex1')));
    await assertSucceeds(getDoc(doc(como(DR_A2), `workspaces/${LOCAL_A2}/exames`, 'ex2')));
  });
  test('consulta de locais por contaId funciona para membro', async () => {
    await assertSucceeds(getDocs(query(collection(como(DR_A), 'workspaces'), where('contaId', '==', CONTA_A))));
  });
  test('consulta de locais de outra conta e negada', async () => {
    await assertFails(getDocs(query(collection(como(DR_A), 'workspaces'), where('contaId', '==', CONTA_B))));
  });
});

describe('4. autoria do laudo', () => {
  test('medico que nao e autor nao edita', async () => {
    await assertFails(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'ex1'), { conclusoes: 'x' }));
  });
  test('medico que nao e autor LE o laudo do colega', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/exames`, 'ex1')));
  });
  test('o autor edita o proprio laudo', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/exames`, 'ex1'), { conclusoes: 'ok' }));
  });
  test('dono ajusta exame que nao e dele (administrativo)', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A2}/exames`, 'ex2'), { convenio: 'UNIMED' }));
  });
  test('ninguem apaga exame pelo navegador (apagar passa pelo servidor)', async () => {
    await assertFails(deleteDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/exames`, 'ex1')));
  });
});

describe('5. segredos', () => {
  test('dono nao le a gaveta de segredos', async () => {
    await assertFails(getDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/privado`, 'integracoes')));
  });
  test('dono nao escreve na gaveta de segredos', async () => {
    await assertFails(setDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/privado`, 'integracoes'), { feegowToken: 'x' }));
  });
  test('superadmin tambem nao le a gaveta pelo navegador', async () => {
    await assertFails(getDoc(doc(como(ADMIN), `workspaces/${LOCAL_A1}/privado`, 'integracoes')));
  });
});

describe('6. criacao so pelo servidor', () => {
  test('cliente nao cria conta', async () => {
    await assertFails(setDoc(doc(como(DR_A), 'contas', 'contaFalsa'), { tipo: 'PF', ownerUid: DR_A }));
  });
  test('cliente nao cria vinculo (papel forjado)', async () => {
    await assertFails(setDoc(doc(como(DR_B), 'vinculos', `${CONTA_A}_${DR_B}`), {
      contaId: CONTA_A, medicoUid: DR_B, papel: 'dono', locais: [], status: 'ativo',
    }));
  });
  test('cliente nao altera o proprio papel', async () => {
    await assertFails(updateDoc(doc(como(RITA), 'vinculos', `${CONTA_A}_${RITA}`), { papel: 'dono' }));
  });
  test('cliente nao cria nem altera assinatura', async () => {
    await assertFails(setDoc(doc(como(DR_A), 'subscriptions', 'contaFalsa'), { tipo: 'remido' }));
    await assertFails(updateDoc(doc(como(DR_A), 'subscriptions', CONTA_A), { franquiaUsada: 0 }));
  });
  test('cliente nao cria local', async () => {
    await assertFails(setDoc(doc(como(DR_A), 'workspaces', 'wsFalso'), { contaId: CONTA_A }));
  });
});

describe('7. perfil e autopromocao', () => {
  test('nao escreve superadmin em si mesmo', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { superadmin: true }));
  });
  test('nao escreve adminRole em si mesmo', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { adminRole: 'financeiro' }));
  });
  test('edita o proprio nome', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { nome: 'Dr A Silva' }));
  });
  test('nao lista todos os profissionais (vazamento de CPF)', async () => {
    await assertFails(getDocs(collection(como(DR_A), 'profissionais')));
  });
  test('nao nasce superadmin', async () => {
    await assertFails(setDoc(doc(como('uidNovo'), 'profissionais', 'uidNovo'), { nome: 'Novo', superadmin: true }));
  });
  test('cria o proprio perfil sem superadmin', async () => {
    await assertSucceeds(setDoc(doc(como('uidNovo2'), 'profissionais', 'uidNovo2'), { nome: 'Novo 2' }));
  });
});

describe('8. Direx e trilhas', () => {
  test('superadmin lista contas, locais e assinaturas', async () => {
    await assertSucceeds(getDocs(collection(como(ADMIN), 'contas')));
    await assertSucceeds(getDocs(collection(como(ADMIN), 'workspaces')));
    await assertSucceeds(getDocs(collection(como(ADMIN), 'subscriptions')));
  });
  test('usuario comum nao le o financeiro do Direx', async () => {
    await assertFails(getDocs(collection(como(DR_A), 'pagamentos')));
    await assertFails(getDocs(collection(como(DR_A), 'historicoFinanceiro')));
  });
  test('qualquer autenticado grava log; so o Direx le', async () => {
    await assertSucceeds(addDoc(collection(como(RITA), 'logs'), { tipo: 'teste' }));
    await assertFails(getDocs(collection(como(RITA), 'logs')));
    await assertSucceeds(getDocs(collection(como(ADMIN), 'logs')));
  });
  test('log nao pode ser alterado depois de escrito', async () => {
    await assertFails(updateDoc(doc(como(ADMIN), 'logs', 'qualquer'), { tipo: 'adulterado' }));
  });
  test('todos leem a tabela de planos; so o Direx escreve', async () => {
    await assertSucceeds(getDoc(doc(como(RITA), 'configPlanos', 'atual')));
    await assertFails(setDoc(doc(como(DR_A), 'configPlanos', 'atual'), { planos: ['pirata'] }));
  });
});
```

- [ ] **Step 2: Registrar o script de teste**

Adicionar em `"scripts"` do `package.json`, mantendo os existentes:

```json
"test:rules:definitiva": "npx firebase emulators:exec --only firestore --project leo-testes \"node --test tests/rules/definitiva.test.mjs\""
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
npm run test:rules:definitiva
```

Esperado: **FALHA** — `firestore.rules.definitiva` ainda não existe (erro de leitura de arquivo). É a confirmação de que o teste está mesmo lendo o arquivo certo.

- [ ] **Step 4: Escrever a fechadura definitiva**

Criar `firestore.rules.definitiva` com exatamente este conteúdo:

```javascript
rules_version = '2';

// ════════════════════════════════════════════════════════════════════
// LEO · Firestore Security Rules — FECHADURA DEFINITIVA (modelo de contas)
// ════════════════════════════════════════════════════════════════════
// ⚠️ ESTE ARQUIVO NAO E O PUBLICADO. O publicado e `firestore.rules`
//    (tranca provisoria por ownerUid, no ar desde 09/08/2026 18:34).
//    Esta versao so pode substituir aquela na ULTIMA tarefa do Plano 2,
//    depois que o cadastro passar a ser feito no servidor — ela proibe o
//    navegador de criar conta, vinculo e assinatura, que e exatamente o
//    que o cadastro atual faz.
//
// Modelo: CONTA (paga) → LOCAL (workspaces) → exames/pacientes
//         MEMBRO = vinculos/{contaId}_{uid} com papel + locais
// Spec: docs/decisoes/2026-08-09-secao1-contas-e-acesso.md
//
// O Wader usa Service Account (Admin SDK) e nao e afetado por nada aqui.
// ════════════════════════════════════════════════════════════════════

service cloud.firestore {
  match /databases/{database}/documents {

    // ── Fundamentos ──
    function auth() { return request.auth != null; }
    function uid()  { return request.auth.uid; }

    function superadmin() {
      return auth()
        && exists(/databases/$(database)/documents/profissionais/$(uid()))
        && get(/databases/$(database)/documents/profissionais/$(uid())).data.superadmin == true;
    }

    function vincRef(contaId) {
      return /databases/$(database)/documents/vinculos/$(contaId + '_' + uid());
    }
    function temVinculo(contaId) {
      return auth() && exists(vincRef(contaId))
        && get(vincRef(contaId)).data.status == 'ativo';
    }
    function vinc(contaId) { return get(vincRef(contaId)).data; }
    function ehPapel(contaId, p) { return temVinculo(contaId) && vinc(contaId).papel == p; }

    // Recebe o contaId pronto: serve para `get` E para `list` (numa consulta,
    // `resource` e cada documento avaliado — nao da para get() do proprio doc).
    function alcancaConta(contaId, wsId) {
      return temVinculo(contaId)
        && (vinc(contaId).locais.size() == 0 || wsId in vinc(contaId).locais);
    }
    // Em subcolecoes o doc do local nao esta em `resource`: aqui o get() e
    // inevitavel. Sao 2 gets no total, longe do limite de 10.
    function contaDoLocal(wsId) {
      return get(/databases/$(database)/documents/workspaces/$(wsId)).data.contaId;
    }
    function alcancaLocal(wsId) { return alcancaConta(contaDoLocal(wsId), wsId); }
    function ehDonoDoLocal(wsId) { return ehPapel(contaDoLocal(wsId), 'dono'); }
    function ehMedicoNoLocal(wsId) {
      return alcancaLocal(wsId) && vinc(contaDoLocal(wsId)).papel in ['dono', 'medico'];
    }

    function intacto(campo) {
      return !(campo in request.resource.data)
        || (campo in resource.data && request.resource.data[campo] == resource.data[campo]);
    }

    // ── CONTAS ── so o servidor cria e altera
    match /contas/{contaId} {
      allow get, list: if superadmin() || temVinculo(contaId);
      allow create, update, delete: if false;
    }

    // ── LOCAIS ──
    match /workspaces/{wsId} {
      allow get, list: if superadmin()
                       || (resource != null && alcancaConta(resource.data.contaId, wsId));
      allow update:    if superadmin()
                       || (ehDonoDoLocal(wsId) && intacto('contaId'));
      allow create, delete: if false;

      // Gaveta de segredos: ninguem pelo navegador, nem o superadmin.
      match /privado/{documento=**} {
        allow read, write: if false;
      }

      match /pacientes/{pacId} {
        allow read: if superadmin() || alcancaLocal(wsId);
        allow create, update: if alcancaLocal(wsId);
        allow delete: if ehDonoDoLocal(wsId);
      }

      match /exames/{exameId} {
        // Todo membro do local ve a fila e le o laudo do colega (D7 do spec)
        allow read:   if superadmin() || alcancaLocal(wsId);
        allow create: if alcancaLocal(wsId);
        // Conteudo do laudo: so o autor. O dono ajusta o administrativo.
        allow update: if (ehMedicoNoLocal(wsId) && resource.data.medicoUid == uid())
                      || ehDonoDoLocal(wsId);
        // Apagar/cancelar/transferir passam pelo servidor (log + franquia)
        allow delete: if false;
      }

      // Honorarios, extratos e demais ajustes do local
      match /config/{docId}   { allow read, write: if alcancaLocal(wsId); }
      match /extratos/{docId} { allow read, write: if ehMedicoNoLocal(wsId); }
    }

    // ── VINCULOS ── leitura do proprio e do dono da conta; escrita so servidor
    match /vinculos/{vincId} {
      allow get:  if auth() && (resource.data.medicoUid == uid()
                    || ehPapel(resource.data.contaId, 'dono') || superadmin());
      // `list` por documento: a consulta so passa se for restrita ao proprio
      // usuario (where medicoUid == uid). Sem isso, um logado listaria o mapa
      // de quem pertence a que conta.
      allow list: if superadmin() || (auth() && resource.data.medicoUid == uid());
      allow create, update, delete: if false;
    }

    // ── ASSINATURAS ── id = contaId. Recepcao nao ve financeiro.
    match /subscriptions/{contaId} {
      allow get, list: if superadmin()
                       || (temVinculo(contaId) && vinc(contaId).papel in ['dono', 'medico']);
      allow create, update, delete: if false;
    }

    // ── PROFISSIONAIS ── proprio perfil, sem autopromocao, sem listar todos
    match /profissionais/{profId} {
      allow get:    if auth() && (profId == uid() || superadmin());
      allow list:   if superadmin();
      allow create: if auth() && profId == uid()
                    && !('superadmin' in request.resource.data)
                    && !('adminRole' in request.resource.data);
      allow update: if superadmin()
                    || (auth() && profId == uid() && intacto('superadmin') && intacto('adminRole'));
      allow delete: if false;
    }

    // ── EMPRESAS ── escrita so pelo servidor/Direx
    match /empresas/{empId} {
      allow read:  if auth();
      allow write: if superadmin();
    }

    // ── Trilhas append-only ──
    match /logs/{logId} {
      allow create: if auth();
      allow read:   if superadmin();
      allow update, delete: if false;
    }
    match /consumo/{consumoId} {
      allow create: if auth();
      allow read:   if superadmin();
      allow update, delete: if false;
    }
    match /creditosLog/{logId} {
      allow create, read: if superadmin();
      allow update, delete: if false;
    }

    // ── Direx ──
    match /configPlanos/{docId} {
      allow read:  if auth();
      allow write: if superadmin();
    }
    match /pagamentos/{pagId}          { allow read, write: if superadmin(); }
    match /historicoFinanceiro/{mesId} { allow read, write: if superadmin(); }

    // ── Legado (some no Plano 3) ──
    match /profiles/{profId} {
      allow get:   if auth() && (profId == uid() || superadmin());
      allow write: if false;
    }
    match /memberships/{memId} {
      allow get, list: if superadmin() || (auth() && resource.data.medicoUid == uid());
      allow write:     if false;
    }

    // ── Tudo o mais: fechado ──
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 5: Rodar os testes até passarem**

```bash
npm run test:rules:definitiva
```

Esperado: **todos passam**. Se algum falhar, o emulador diz qual linha da regra
negou — corrija a **regra**, nunca afrouxe o teste.

Armadilha conhecida: `alcancaLocal()` faz `get()` no local e no vínculo. O limite é
10 `get()` por avaliação; estas regras ficam em 2-3. Erro de limite indica recursão
acidental numa função.

- [ ] **Step 6: Confirmar que a regra publicada NÃO foi tocada**

```bash
git status --short firestore.rules
```

Esperado: **nenhuma saída** — `firestore.rules` (a que está no ar) permanece intacta.
Se aparecer modificada, desfaça: `git checkout firestore.rules`.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules.definitiva tests/rules/definitiva.test.mjs package.json
git commit -m "feat(secao1): fechadura definitiva (modelo de contas) escrita e testada, ainda nao publicada"
```

---

## Task 4: Migrar o modelo (Fases 1 a 3)

**Files:**
- Create: `scripts/secao1/01-migrar-contas.mjs`
- Modify: `package.json` (script `secao1:migrar`)

**Interfaces:**
- Consumes: `getDb`, `COMMIT`, `modo` de `lib-admin.mjs`.
- Produces: coleção `contas`; `workspaces.contaId`; `vinculos/{contaId}_{uid}` com `papel` e `locais`; `subscriptions/{contaId}`.

- [ ] **Step 1: Escrever o script de migração**

`scripts/secao1/01-migrar-contas.mjs`:

```javascript
// Fases 1-3 do plano. ADITIVO: nao apaga nem move nada.
// Ensaio por padrao. Grava so com --commit.
//
// 1. Uma conta por workspace existente (PF por padrao; PJ se workspace.tipo === 'PJ')
// 2. workspace.contaId
// 3. vinculos/{contaId}_{uid} com papel + locais  (os antigos ficam, marcados)
// 4. subscriptions/{contaId}  (a antiga fica, marcada)
import { getDb, COMMIT, modo } from './lib-admin.mjs';
import { FieldValue } from 'firebase-admin/firestore';

const db = getDb();
const MARCA = '_migracaoSecao1';   // marcador reversivel, igual ao usado em maio

function papelDe(vinculo, workspace) {
  if (workspace.ownerUid && vinculo.medicoUid === workspace.ownerUid) return 'dono';
  const role = String(vinculo.role ?? '').toLowerCase();
  if (role === 'assistente' || role === 'recepcao') return 'recepcao';
  return 'medico';
}

async function main() {
  console.log(`MODO: ${modo()}\n`);
  const plano = [];

  const workspaces = await db.collection('workspaces').get();
  const vinculos = await db.collection('vinculos').get();
  const subscriptions = await db.collection('subscriptions').get();

  for (const ws of workspaces.docs) {
    const w = ws.data();

    // `wader-dev` (ambiente de teste do Wader) nao tem dono nem vinculo nem
    // assinatura — nao e cliente, nao vira conta. O Wader fala com ele por
    // Admin SDK, que ignora as regras.
    if (!w.ownerUid) {
      console.log(`- local ${ws.id} ("${w.nomeClinica ?? ''}") sem ownerUid — ambiente de teste, pulando`);
      continue;
    }

    if (w.contaId) {
      console.log(`- local ${ws.id}: ja tem contaId=${w.contaId}, pulando criacao de conta`);
      continue;
    }

    const contaRef = db.collection('contas').doc();
    const conta = {
      id: contaRef.id,
      tipo: w.tipo === 'PJ' ? 'PJ' : 'PF',
      nome: w.nomeClinica || 'Conta',
      ownerUid: w.ownerUid ?? null,
      empresaId: w.empresaId ?? null,
      status: 'ativa',
      criadoEm: FieldValue.serverTimestamp(),
      [MARCA]: { origemWorkspace: ws.id, em: new Date().toISOString() },
    };
    plano.push({ o: 'criar conta', ref: contaRef, dados: conta });
    plano.push({ o: 'marcar local', ref: ws.ref, dados: { contaId: contaRef.id }, merge: true });

    // Vinculos deste workspace
    const doWs = vinculos.docs.filter(v => v.data().workspaceId === ws.id);
    for (const v of doWs) {
      const vd = v.data();
      const novoId = `${contaRef.id}_${vd.medicoUid}`;
      plano.push({
        o: 'criar vinculo', ref: db.collection('vinculos').doc(novoId),
        dados: {
          id: novoId,
          contaId: contaRef.id,
          medicoUid: vd.medicoUid,
          papel: papelDe(vd, w),
          locais: [],                       // vazio = todos os locais da conta
          status: vd.status ?? 'ativo',
          criadoEm: vd.criadoEm ?? FieldValue.serverTimestamp(),
          [MARCA]: { origemVinculo: v.id, roleAntigo: vd.role ?? null },
        },
      });
      plano.push({ o: 'marcar vinculo antigo', ref: v.ref, dados: { [MARCA + 'Substituido']: novoId }, merge: true });
    }

    // Assinatura deste workspace
    const subs = subscriptions.docs.filter(s => s.data().workspaceId === ws.id);
    if (subs.length === 0) {
      console.log(`  ATENCAO: local ${ws.id} nao tem assinatura`);
    } else {
      if (subs.length > 1) console.log(`  ATENCAO: local ${ws.id} tem ${subs.length} assinaturas; usando a primeira (${subs[0].id})`);
      // O `workspaceId` NAO vai para a assinatura nova. Se fosse junto, o
      // getSubscription() atual (where workspaceId == wsId, limit 1) passaria a
      // casar com DOIS documentos e o consumo de franquia cairia ora num, ora
      // noutro. A nova e endereçada por contaId; a origem fica no marcador.
      const { workspaceId: wsOrigem, ...restoSub } = subs[0].data();
      plano.push({
        o: 'criar assinatura', ref: db.collection('subscriptions').doc(contaRef.id),
        dados: {
          ...restoSub, id: contaRef.id, contaId: contaRef.id,
          [MARCA]: { origemSub: subs[0].id, workspaceIdOrigem: wsOrigem },
        },
      });
      plano.push({ o: 'marcar assinatura antiga', ref: subs[0].ref, dados: { [MARCA + 'Substituida']: contaRef.id }, merge: true });
    }
  }

  console.log(`\n=== ${plano.length} operacoes ===`);
  for (const p of plano) console.log(`${p.o.padEnd(24)} ${p.ref.path}`);

  if (!COMMIT) {
    console.log('\nENSAIO. Nada foi gravado. Rode de novo com --commit para valer.');
    return;
  }

  const lote = db.batch();
  for (const p of plano) {
    if (p.merge) lote.set(p.ref, p.dados, { merge: true });
    else lote.set(p.ref, p.dados);
  }
  await lote.commit();
  console.log(`\nGRAVADO: ${plano.length} operacoes em um unico lote atomico.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Registrar no package.json**

```json
"secao1:migrar": "node --env-file=.env.local scripts/secao1/01-migrar-contas.mjs"
```

- [ ] **Step 3: Ensaiar**

```bash
npm run secao1:migrar
```

Esperado: lista de operações, terminando em "ENSAIO. Nada foi gravado." **Conferir a lista com o Dr. Sérgio antes de gravar** — em especial o papel atribuído a cada pessoa.

- [ ] **Step 4: Gravar**

```bash
npm run secao1:migrar -- --commit
```

Esperado: "GRAVADO: N operacoes em um unico lote atomico."

- [ ] **Step 5: Conferir**

```bash
npm run secao1:inventario
```

Esperado: todo local com `contaId=<algo>`; todo vínculo novo com `idDeterministico=true` e `papel` preenchido; assinatura com `contaId`.

- [ ] **Step 6: Commit**

```bash
git add scripts/secao1/01-migrar-contas.mjs package.json
git commit -m "feat(secao1): migracao aditiva contas + vinculos deterministicos + assinatura por conta"
```

---

## Task 5: O app passa a ler o modelo novo

**Files:**
- Create: `src/lib/contas.ts`
- Modify: `src/contexts/AuthContext.tsx`

**Interfaces:**
- Consumes: `vinculos` com `contaId`/`papel`/`locais`; `contas`; `subscriptions/{contaId}`.
- Produces: `useAuth()` passa a expor `conta`, `papel`, `locais` além do que já expõe. `Contexto` ganha `conta` e `papel`.

- [ ] **Step 1: Criar o módulo de leitura**

`src/lib/contas.ts`:

```typescript
// Leitura do modelo novo (conta → locais), com fallback para o formato antigo
// enquanto a migracao nao passou em todos os ambientes.
import { db } from './firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

export type Papel = 'dono' | 'medico' | 'recepcao';

export type Conta = { id: string; tipo?: 'PF' | 'PJ'; nome?: string; ownerUid?: string };

export type VinculoNovo = {
  id: string; contaId: string; medicoUid: string;
  papel: Papel; locais: string[]; status: string;
};

/** Vinculos ativos do usuario JA no formato novo (com contaId + papel). */
export async function getVinculosDoUsuario(uid: string): Promise<VinculoNovo[]> {
  const snap = await getDocs(query(
    collection(db, 'vinculos'),
    where('medicoUid', '==', uid),
    where('status', '==', 'ativo'),
  ));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as VinculoNovo))
    .filter(v => !!v.contaId && !!v.papel);
}

export async function getConta(contaId: string): Promise<Conta | null> {
  const snap = await getDoc(doc(db, 'contas', contaId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Conta) : null;
}

/** Locais da conta que este vinculo alcanca. locais vazio = todos. */
export async function getLocaisDaConta(contaId: string, permitidos: string[]) {
  const snap = await getDocs(query(collection(db, 'workspaces'), where('contaId', '==', contaId)));
  const todos = snap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }));
  return permitidos.length === 0 ? todos : todos.filter(w => permitidos.includes(w.id));
}

/** Assinatura da conta. Doc id = contaId (formato novo). */
export async function getSubscriptionDaConta(contaId: string) {
  const snap = await getDoc(doc(db, 'subscriptions', contaId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
```

- [ ] **Step 2: Ligar no AuthContext, mantendo o caminho antigo como rede**

Em `src/contexts/AuthContext.tsx`, o tipo `Contexto` (linha ~20) passa a ser:

```typescript
type Contexto = {
  membership: Membership;
  workspace: Workspace;
  subscription: Subscription | null;
  conta?: Conta | null;
  papel?: Papel;
};
```

Adicionar o import:

```typescript
import { getVinculosDoUsuario, getConta, getLocaisDaConta, getSubscriptionDaConta, type Conta, type Papel } from '@/lib/contas';
```

E, dentro do `onAuthStateChanged`, **antes** do bloco `const memberships = await getMemberships(...)`, inserir o caminho novo:

```typescript
        if (prof) {
          // Caminho novo: conta → locais. Se nao houver vinculo migrado, cai no antigo.
          const vincs = await getVinculosDoUsuario(fbUser.uid);
          if (vincs.length > 0) {
            const ctxNovos: Contexto[] = [];
            for (const v of vincs) {
              const [conta, locais, sub] = await Promise.all([
                getConta(v.contaId),
                getLocaisDaConta(v.contaId, v.locais ?? []),
                getSubscriptionDaConta(v.contaId),
              ]);
              for (const local of locais) {
                ctxNovos.push({
                  membership: { id: v.id, role: v.papel, workspaceId: local.id } as Membership,
                  workspace: local as Workspace,
                  subscription: sub as Subscription | null,
                  conta, papel: v.papel,
                });
              }
            }
            if (ctxNovos.length > 0) {
              setContextos(ctxNovos);
              if (ctxNovos.length === 1) selecionarContexto(ctxNovos[0]);
              setLoading(false);
              return;
            }
          }
          // ── caminho antigo (pre-migracao) daqui para baixo ──
          const memberships = await getMemberships(fbUser.uid);
```

- [ ] **Step 3: Conferir que compila**

```bash
npm run typecheck
```

Esperado: sem erro. Se acusar `Conta`/`Papel` não usados, é porque o tipo `Contexto` não foi atualizado — voltar ao Step 2.

- [ ] **Step 4: Rodar o app e entrar com a sua conta**

```bash
npm run dev
```

Abrir `http://localhost:3000/login`, entrar. Esperado: o dashboard carrega igual a antes, com a worklist do local. No console do navegador não deve haver erro de permissão (as regras novas ainda não estão publicadas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contas.ts src/contexts/AuthContext.tsx
git commit -m "feat(secao1): AuthContext monta contexto a partir de conta+locais, com fallback"
```

---

## Task 6: Fechar o Plano 1

**Files:**
- Modify: `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md` (marcar fases concluídas)

- [ ] **Step 1: Rodar tudo de novo, junto**

```bash
npm run typecheck && npm run lint && npm run test:rules
```

Esperado: os três limpos.

- [ ] **Step 2: Anotar no ADR o que já está feito**

Na tabela da §7, trocar o texto da coluna "Quem" das fases 0 a 3 por `✅ feito 09/08/2026 (Plano 1)`. Acrescentar, logo abaixo da tabela:

```markdown
> **Plano 1 concluído.** Regras escritas e testadas (20 testes no emulador), mas
> **não publicadas** — a publicação é a última tarefa do Plano 2, depois que o
> cadastro server-side existir. Publicar antes quebraria o cadastro em produção.
```

- [ ] **Step 3: Commit e push**

```bash
git add docs/decisoes/2026-08-09-secao1-contas-e-acesso.md
git commit -m "docs(ADR): Plano 1 concluido — fases 0 a 3 + fechadura escrita e testada"
git push origin feat/secao1-contas
```

- [ ] **Step 4: Revisão da tríade (pedido explícito do Dr. Sérgio)**

Rodar as três óticas sobre o diff de `feat/secao1-contas` contra `master`:

1. **Codex** — bugs, falhas silenciosas e edge cases no diff, com foco no script de migração e nas regras.
2. **Ruflo** — arquitetura: o modelo novo tem fronteiras claras? Sobrou responsabilidade duplicada?
3. **Ponytail** — o que dá para deletar do que acabou de ser escrito.

Só depois disso o Plano 2 começa.

---

## Fora deste plano

| Plano | Conteúdo |
|---|---|
| **Plano 2 — Fluxos e telas** | `/api/signup` no servidor (**primeira tarefa**: enquanto ele não existe, todo cadastro novo nasce no formato antigo e a dívida de migração cresce); seletor único de local; papéis na interface; convites; cadastro PJ; cancelar/transferir/apagar laudo com log e devolução de franquia. **Termina publicando a fechadura** (Fase 5). · "Esqueci a senha" e "reenviar verificação" ✅ já entregues em 09/08. |
| **Plano 3 — Segredos e limpeza** | Fase 6 (gaveta de segredos + 3 linhas no Wader + deploy na clínica — **do Claude da clínica**) e Fase 7 (apagar vínculos antigos, fallbacks legados, `profissionalId`). |
