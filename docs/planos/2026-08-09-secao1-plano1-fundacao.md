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

## Task 3: Escrever a fechadura e provar que ela fecha

**Files:**
- Create: `tests/rules/regras.test.mjs`
- Modify: `firestore.rules` (substituir todo o conteúdo)

**Interfaces:**
- Consumes: modelo do spec §3 (`contas`, `workspaces.contaId`, `vinculos/{contaId}_{uid}` com `papel` e `locais`).
- Produces: `firestore.rules` pronta para publicar no Plano 2.

- [ ] **Step 1: Escrever os testes primeiro (todos devem falhar)**

`tests/rules/regras.test.mjs`:

```javascript
import { test, before, after, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

let env;

// Cenario: conta A (Dr. A dono/medico, Rita recepcao) e conta B (Dr. B).
const CONTA_A = 'contaA', CONTA_B = 'contaB';
const LOCAL_A = 'localA', LOCAL_B = 'localB';
const DR_A = 'uidDrA', DR_A2 = 'uidDrA2', RITA = 'uidRita', DR_B = 'uidDrB';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'leo-testes',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'contas', CONTA_A), { tipo: 'PJ', nome: 'Clinica A', ownerUid: DR_A });
    await setDoc(doc(db, 'contas', CONTA_B), { tipo: 'PF', nome: 'Dr B', ownerUid: DR_B });

    await setDoc(doc(db, 'workspaces', LOCAL_A), { contaId: CONTA_A, nomeClinica: 'Sala 1' });
    await setDoc(doc(db, 'workspaces', LOCAL_B), { contaId: CONTA_B, nomeClinica: 'Consultorio B' });

    await setDoc(doc(db, `workspaces/${LOCAL_A}/privado`, 'integracoes'), {
      feegowToken: 'segredo', ortancUser: 'orthanc', ortancPass: 'senha',
    });

    await setDoc(doc(db, `workspaces/${LOCAL_A}/exames`, 'ex1'), {
      pacienteNome: 'Paciente A', medicoUid: DR_A, status: 'emitido',
    });
    await setDoc(doc(db, `workspaces/${LOCAL_B}/exames`, 'ex2'), {
      pacienteNome: 'Paciente B', medicoUid: DR_B, status: 'emitido',
    });

    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${DR_A}`), {
      contaId: CONTA_A, medicoUid: DR_A, papel: 'dono', locais: [], status: 'ativo',
    });
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${DR_A2}`), {
      contaId: CONTA_A, medicoUid: DR_A2, papel: 'medico', locais: [], status: 'ativo',
    });
    await setDoc(doc(db, 'vinculos', `${CONTA_A}_${RITA}`), {
      contaId: CONTA_A, medicoUid: RITA, papel: 'recepcao', locais: [], status: 'ativo',
    });
    await setDoc(doc(db, 'vinculos', `${CONTA_B}_${DR_B}`), {
      contaId: CONTA_B, medicoUid: DR_B, papel: 'dono', locais: [], status: 'ativo',
    });

    await setDoc(doc(db, 'profissionais', DR_A), { nome: 'Dr A', superadmin: false });
    await setDoc(doc(db, 'profissionais', DR_B), { nome: 'Dr B', superadmin: false });

    await setDoc(doc(db, 'subscriptions', CONTA_A), { contaId: CONTA_A, tipo: 'expert', franquiaMensal: 600, franquiaUsada: 10 });
  });
});

after(async () => { await env.cleanup(); });

const como = (uid) => env.authenticatedContext(uid).firestore();

describe('isolamento entre contas', () => {
  test('1. medico da conta A NAO le exame da conta B', async () => {
    await assertFails(getDoc(doc(como(DR_A), `workspaces/${LOCAL_B}/exames`, 'ex2')));
  });

  test('1b. medico da conta A LE exame da propria conta', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A), `workspaces/${LOCAL_A}/exames`, 'ex1')));
  });

  test('1c. medico da conta A NAO escreve exame da conta B', async () => {
    await assertFails(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_B}/exames`, 'ex2'), { status: 'rascunho' }));
  });
});

describe('papeis', () => {
  test('2. recepcao NAO le a assinatura (financeiro) da conta', async () => {
    await assertFails(getDoc(doc(como(RITA), 'subscriptions', CONTA_A)));
  });

  test('2b. dono LE a assinatura da conta', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A), 'subscriptions', CONTA_A)));
  });

  test('2c. medico (nao dono) NAO edita o local', async () => {
    await assertFails(updateDoc(doc(como(DR_A2), 'workspaces', LOCAL_A), { nomeClinica: 'Hackeado' }));
  });

  test('2d. dono edita o local', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), 'workspaces', LOCAL_A), { nomeClinica: 'Sala 1 renomeada' }));
  });
});

describe('autopromocao', () => {
  test('3. usuario NAO escreve superadmin em si mesmo', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { superadmin: true }));
  });

  test('3b. usuario NAO escreve adminRole em si mesmo', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { adminRole: 'financeiro' }));
  });

  test('3c. usuario edita o proprio nome', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), 'profissionais', DR_A), { nome: 'Dr A Silva' }));
  });

  test('3d. usuario NAO lista todos os profissionais (vazamento de CPF)', async () => {
    await assertFails(getDocs(collection(como(DR_A), 'profissionais')));
  });
});

describe('autoria do laudo', () => {
  test('4. medico que nao e o autor NAO edita o laudo', async () => {
    await assertFails(updateDoc(doc(como(DR_A2), `workspaces/${LOCAL_A}/exames`, 'ex1'), { conclusoes: 'alterado' }));
  });

  test('4b. medico que nao e autor LE o laudo do colega', async () => {
    await assertSucceeds(getDoc(doc(como(DR_A2), `workspaces/${LOCAL_A}/exames`, 'ex1')));
  });

  test('4c. o autor edita o proprio laudo', async () => {
    await assertSucceeds(updateDoc(doc(como(DR_A), `workspaces/${LOCAL_A}/exames`, 'ex1'), { conclusoes: 'ok' }));
  });
});

describe('segredos', () => {
  test('5. dono NAO le os segredos de integracao pelo navegador', async () => {
    await assertFails(getDoc(doc(como(DR_A), `workspaces/${LOCAL_A}/privado`, 'integracoes')));
  });

  test('5b. dono NAO escreve direto na gaveta de segredos', async () => {
    await assertFails(setDoc(doc(como(DR_A), `workspaces/${LOCAL_A}/privado`, 'integracoes'), { feegowToken: 'x' }));
  });
});

describe('criacao so pelo servidor', () => {
  test('6. cliente NAO cria conta', async () => {
    await assertFails(setDoc(doc(como(DR_A), 'contas', 'contaFalsa'), { tipo: 'PF', ownerUid: DR_A }));
  });

  test('6b. cliente NAO cria vinculo (papel forjado)', async () => {
    await assertFails(setDoc(doc(como(DR_B), 'vinculos', `${CONTA_A}_${DR_B}`), {
      contaId: CONTA_A, medicoUid: DR_B, papel: 'dono', locais: [], status: 'ativo',
    }));
  });

  test('6c. cliente NAO cria nem altera assinatura (plano forjado)', async () => {
    await assertFails(setDoc(doc(como(DR_A), 'subscriptions', 'contaFalsa'), { tipo: 'remido' }));
    await assertFails(updateDoc(doc(como(DR_A), 'subscriptions', CONTA_A), { franquiaUsada: 0 }));
  });

  test('6d. nao-membro NAO le a conta', async () => {
    await assertFails(getDoc(doc(como(DR_B), 'contas', CONTA_A)));
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

```bash
npm run test:rules
```

Esperado: **FALHA**. Os testes `assertFails` passam por acidente (a regra de abril nega quase nada, mas nega o suficiente em alguns pontos), e os `assertSucceeds` sobre `contas`/`subscriptions` falham, porque a regra de abril nem conhece `contas`. Anotar quantos falharam.

- [ ] **Step 3: Escrever a fechadura**

Substituir **todo** o conteúdo de `firestore.rules`:

```javascript
rules_version = '2';

// ════════════════════════════════════════════════════════════════════
// LEO · Firestore Security Rules
// Modelo: CONTA (paga) → LOCAL (workspaces) → exames/pacientes
//         MEMBRO = vinculos/{contaId}_{uid} com papel + locais
// Spec: docs/decisoes/2026-08-09-secao1-contas-e-acesso.md
//
// Regra de ouro: o cliente LÊ o que é da conta dele e ESCREVE muito pouco.
// Criar conta, vinculo, assinatura, emitir, cancelar, transferir e apagar
// passam por rota de servidor (Admin SDK), que ignora estas regras.
// O Wader tambem usa Admin SDK — nao e afetado por nada aqui.
// ════════════════════════════════════════════════════════════════════

service cloud.firestore {
  match /databases/{database}/documents {

    // ── Fundamentos ──
    function auth() { return request.auth != null; }
    function uid()  { return request.auth.uid; }

    function vincRef(contaId) {
      return /databases/$(database)/documents/vinculos/$(contaId + '_' + uid());
    }
    function temVinculo(contaId) {
      return auth() && exists(vincRef(contaId))
        && get(vincRef(contaId)).data.status == 'ativo';
    }
    function vinc(contaId) { return get(vincRef(contaId)).data; }
    function ehPapel(contaId, p) { return temVinculo(contaId) && vinc(contaId).papel == p; }

    // Local pertence a conta? E a pessoa alcanca esse local?
    // alcancaConta() recebe o contaId pronto — serve tanto para `get` quanto
    // para `list` (numa consulta, `resource` e cada documento avaliado, e nao
    // da para chamar get() do proprio doc sendo listado).
    function alcancaConta(contaId, wsId) {
      return temVinculo(contaId)
        && (vinc(contaId).locais.size() == 0 || wsId in vinc(contaId).locais);
    }
    // Para subcolecoes (exames/pacientes) o doc do local nao esta em `resource`,
    // entao aqui o get() e inevitavel — 2 gets no total, longe do limite de 10.
    function contaDoLocal(wsId) {
      return get(/databases/$(database)/documents/workspaces/$(wsId)).data.contaId;
    }
    function alcancaLocal(wsId) {
      return alcancaConta(contaDoLocal(wsId), wsId);
    }
    function ehDonoDoLocal(wsId) { return ehPapel(contaDoLocal(wsId), 'dono'); }
    function ehMedicoNoLocal(wsId) {
      return alcancaLocal(wsId)
        && vinc(contaDoLocal(wsId)).papel in ['dono', 'medico'];
    }

    function superadmin() {
      return auth()
        && exists(/databases/$(database)/documents/profissionais/$(uid()))
        && get(/databases/$(database)/documents/profissionais/$(uid())).data.superadmin == true;
    }

    // Campo nao foi tocado nesta escrita?
    function intacto(campo) {
      return !(campo in request.resource.data)
        || (campo in resource.data && request.resource.data[campo] == resource.data[campo]);
    }

    // ── CONTAS ── só o servidor cria e altera
    match /contas/{contaId} {
      allow read: if temVinculo(contaId) || superadmin();
      allow create, update, delete: if false;
    }

    // ── LOCAIS (workspaces) ──
    match /workspaces/{wsId} {
      // `resource.data.contaId` funciona em get E em list — o app consulta
      // workspaces por contaId (getLocaisDaConta), e uma consulta so passa se
      // a regra valer para TODO documento que ela poderia devolver.
      allow read:   if resource != null && alcancaConta(resource.data.contaId, wsId)
                    || superadmin();
      allow update: if ehDonoDoLocal(wsId) && intacto('contaId');
      allow create, delete: if false;

      // Gaveta de segredos: ninguem pelo navegador. So Admin SDK.
      match /privado/{doc=**} {
        allow read, write: if false;
      }

      match /pacientes/{pacId} {
        allow read:   if alcancaLocal(wsId);
        allow create, update: if alcancaLocal(wsId);
        allow delete: if ehDonoDoLocal(wsId);
      }

      match /exames/{exameId} {
        // Todo membro do local le (medico ve a fila do colega — D7 do spec)
        allow read: if alcancaLocal(wsId);
        // Recepcao cria exame (cadastro/Feegow)
        allow create: if alcancaLocal(wsId);
        // Conteudo do laudo: so o autor. Dono ajusta o administrativo.
        allow update: if ehMedicoNoLocal(wsId) && resource.data.medicoUid == uid()
                      || ehDonoDoLocal(wsId);
        // Apagar/cancelar/transferir passam pelo servidor (log + franquia)
        allow delete: if false;
      }
    }

    // ── VINCULOS ── leitura do proprio e do dono da conta; escrita so servidor
    match /vinculos/{vincId} {
      allow get:  if auth() && (resource.data.medicoUid == uid()
                    || ehPapel(resource.data.contaId, 'dono') || superadmin());
      // `list` per-documento: a consulta so passa se for restrita ao proprio
      // usuario (where medicoUid == uid). Sem isso, um logado listaria o mapa
      // de quem pertence a que conta.
      allow list: if auth() && resource.data.medicoUid == uid();
      allow create, update, delete: if false;
    }

    // ── ASSINATURAS ── id = contaId. Recepcao nao ve financeiro.
    match /subscriptions/{contaId} {
      allow read: if (temVinculo(contaId) && vinc(contaId).papel in ['dono', 'medico'])
                     || superadmin();
      allow create, update, delete: if false;
    }

    // ── PROFISSIONAIS ── proprio perfil, sem se autopromover, sem listar todos
    match /profissionais/{profId} {
      allow get:    if auth() && (profId == uid() || superadmin());
      allow list:   if superadmin();
      allow create: if auth() && profId == uid()
                    && !('superadmin' in request.resource.data)
                    && !('adminRole' in request.resource.data);
      allow update: if auth() && profId == uid()
                    && intacto('superadmin') && intacto('adminRole')
                    || superadmin();
      allow delete: if false;
    }

    // ── EMPRESAS ── so servidor escreve
    match /empresas/{empId} {
      allow read:  if auth();
      allow write: if false;
    }

    // ── LOGS ── qualquer autenticado registra; so superadmin le
    match /logs/{logId} {
      allow create: if auth();
      allow read:   if superadmin();
      allow update, delete: if false;
    }

    // ── Tudo o mais: fechado ──
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 4: Rodar os testes até passarem**

```bash
npm run test:rules
```

Esperado: **todos passam**. Se algum falhar, ler a mensagem do emulador (ele diz qual linha da regra negou) e corrigir a regra — **não** afrouxar o teste.

Armadilha conhecida: `alcancaLocal()` faz `get()` no workspace e no vínculo. O limite é 10 `get()` por avaliação; as regras acima ficam em 2-3. Se aparecer erro de limite, é sinal de recursão acidental numa função.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/regras.test.mjs
git commit -m "feat(secao1): fechadura do Firestore + 20 testes de isolamento, papel e autoria"
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
      const s = subs[0].data();
      plano.push({
        o: 'criar assinatura', ref: db.collection('subscriptions').doc(contaRef.id),
        dados: { ...s, id: contaRef.id, contaId: contaRef.id, [MARCA]: { origemSub: subs[0].id } },
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
| **Plano 2 — Fluxos e telas** | `/api/signup` no servidor; "esqueci a senha" e "reenviar verificação"; seletor único de local; papéis na interface; convites; cadastro PJ; cancelar/transferir/apagar laudo com log e devolução de franquia. **Termina publicando a fechadura** (Fase 5). |
| **Plano 3 — Segredos e limpeza** | Fase 6 (gaveta de segredos + 3 linhas no Wader + deploy na clínica — **do Claude da clínica**) e Fase 7 (apagar vínculos antigos, fallbacks legados, `profissionalId`). |
