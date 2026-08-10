# Seção 1 — Plano 2A: a fechadura sobe

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover os 3 bloqueios que impedem a publicação de `firestore.rules.definitiva` (cadastro no navegador, billing por `workspaceId`, deleteDoc no cliente), corrigir as 2 regressões da própria definitiva (Lacuna 1 + Direx bloqueado) e publicá-la — fechando a Fase 5 e a fase 1 da Seção 1.

**Architecture:** Cada pré-requisito vira uma rota/função de servidor (Admin SDK, que ignora as regras) com o cliente chamando via `fetch` + idToken — o mesmo padrão de `/api/orthanc`. O app continua funcionando sob a tranca provisória durante todo o plano; a troca de regra é a última tarefa, com ensaio, backup e rollback prontos. Lógica de servidor testável vive em `src/lib/*-admin.ts` / `signup-server.ts` **sem imports relativos** (só pacotes), para que `node --test` (Node 24 remove os tipos sozinho) rode os mesmos arquivos contra o emulador.

**Tech Stack:** Node 24 (`node --test`, type stripping nativo), firebase-admin 13, emulador Firestore + Auth (JDK 21), `@firebase/rules-unit-testing`, Firebase Rules REST API.

## Global Constraints

- Branch de trabalho: `feat/secao1-plano2a`. Merge na `master` **só nos pontos marcados** (fim da Task 3 e fim da Task 4) — push na master deploya `souleo.com.br`.
- **REGRA DE OURO:** correção de segurança entra nos DOIS arquivos de regra (`firestore.rules` e `firestore.rules.definitiva`) **no mesmo commit**, com o mesmo caso de teste nas duas suítes. Teste de regra usa payload REAL (`tests/rules/fixtures.mjs`), nunca inventado.
- **NUNCA usar `git stash`** (daemon `.claude-flow` engole edições).
- Emulador precisa de JDK 21. Se `java -version` falhar no bash:
  `export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"`
- Cadastro real: **só no emulador**. Nenhuma conta é criada em produção por Claude.
- Papéis válidos, exatamente estas strings: `'dono'`, `'medico'`, `'recepcao'`.
- Projeto Firebase: `leo-sistema-laudos`. Credenciais em `.env.local` (`FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`). Scripts com `node --env-file=.env.local`.
- Arquivos de servidor testáveis (`signup-server.ts`, `exame-admin.ts`, `billing-admin.ts`): **só imports de pacote** (`firebase-admin/*`), nunca import relativo nem alias `@/` — é o que permite `node --test` importar o `.ts` direto.
- Nenhum documento de `workspaces/{id}/exames` ou `/pacientes` muda de lugar. Deleção de exame só pela rota nova.
- `firestore.rules` reflete SEMPRE o que está publicado. Só muda na Task 5.

## Decisões fechadas neste plano (aprovadas com o plano)

| # | Decisão | Por quê |
|---|---|---|
| P1 | Cancelar/apagar-emitido/transferir-emitido **devolvem TODOS os consumos** do exame (franquia e créditos, reemissões incluídas) | D8: saldo justo = laudo cancelado não custa nada |
| P2 | Cancelar e apagar **apagam o PDF do Storage** e limpam `pdfUrl` | PDF é público por URL; laudo cancelado não pode continuar servido |
| P3 | Cancelar **não** tenta reverter o status no Feegow; o log registra a divergência | Não existe API de reversão testada; divergência visível > gambiarra silenciosa |
| P4 | Recepção **não** apaga exame nem da fila (matriz §4 do ADR) | O botão "Remover da fila" passa a dar erro claro para recepção. Se a Josilene precisar, é 1 linha depois — decisão do Sérgio |
| P5 | Novo cadastro PF nasce `papel:'dono'` | É a própria conta dele. Worklist ainda testa `role==='medico'` para o botão "Editar" de emitido — já afeta os migrados hoje, correção é do Plano 2B (papéis-na-tela) |
| P6 | Direx continua editando assinatura pelo navegador: definitiva ganha `subscriptions update: if superadmin()` | `licencas/page.tsx:109` troca plano e `ajustarCreditos` dá créditos via updateDoc. Bloquear = quebrar o Direx. Achado NOVO desta sessão (não estava no levantamento) |
| P7 | Consulta de `consumo` por exameId usa só `where('exameId','==',...)` + filtro em código | Evita índice composto novo |

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/signup-server.ts` (criar) | `executarSignup(db, authAdmin, uid, dados)`: valida, cria os 5 docs no modelo novo em batch atômico, apaga o Auth user no rollback. Sem imports relativos. |
| `src/app/api/signup/route.ts` (criar) | Verifica idToken, chama `executarSignup`. Primeira rota COM auth — padrão para as próximas. |
| `src/app/login/page.tsx` (modificar) | `handleCadastroPF` chama a rota; erro do servidor aparece na tela. |
| `src/lib/billing.ts` (modificar) | `getSubscription` resolve `workspace → contaId → subscriptions/{contaId}`, fallback legado. |
| `src/lib/billing-admin.ts` (criar) | `resolverAssinatura(db, wsId)` para o servidor (emitir + exame). Sem imports relativos. |
| `src/app/api/emitir/route.ts` (modificar) | Debita a assinatura resolvida por contaId (fallback legado). |
| `scripts/secao1/03-sincronizar-assinatura.mjs` (criar) | Copia contadores (franquiaUsada, créditos, ciclo) do doc antigo para `subscriptions/{contaId}` no cutover. Dry-run por padrão. |
| `src/lib/exame-admin.ts` (criar) | `resolverPapel`, `apagarExame`, `cancelarExame`, `transferirExame`, `devolverConsumo`. Sem imports relativos; `apagarPdf` e `subRef` chegam por parâmetro. |
| `src/app/api/exame/route.ts` (criar) | POST `{acao, wsId, exameId, ...}` com auth; compõe exame-admin + billing-admin + Storage. |
| `src/components/Worklist.tsx` (modificar) | `removerDaFila` → rota, com feedback de erro. |
| `src/components/Historico.tsx` (modificar) | `confirmarDelete` → rota, com try/catch + feedback. |
| `tests/api/signup.test.mjs`, `tests/api/exame.test.mjs`, `tests/api/billing-admin.test.mjs` (criar) | Testes no emulador (Firestore+Auth) importando os `.ts` direto. |
| `firestore.rules.definitiva` (modificar) | Lacuna 1 (superadmin em config/extratos) + P6 (subscriptions update superadmin). |
| `tests/rules/interim.test.mjs` + `tests/rules/definitiva.test.mjs` (modificar) | Mesmos casos novos nas duas suítes. |
| `scripts/secao1/04-publicar-regras.mjs` (criar) | Publica/reverte regra via Rules API (service account). Ensaio por padrão. |
| `firebase.json`, `package.json` (modificar) | Emulador Auth + scripts `test:api`. |

---

## Task 1: `/api/signup` — cadastro nasce no servidor, no modelo de contas

**Files:**
- Create: `src/lib/signup-server.ts`
- Create: `src/app/api/signup/route.ts`
- Create: `tests/api/signup.test.mjs`
- Modify: `src/app/login/page.tsx:119-167` (handleCadastroPF)
- Modify: `firebase.json` (emulador auth)
- Modify: `package.json` (script `test:api`)

**Interfaces:**
- Consumes: `configPlanos/atual` (opcional), Firebase Auth (uid vindo do idToken).
- Produces: `executarSignup(db: Firestore, authAdmin: Auth, uid: string, dados: DadosSignup): Promise<ResultadoSignup>` — usada pela rota e pelos testes. Docs criados: `profissionais/{uid}`, `contas/{contaId}`, `workspaces/{wsId}` (com `contaId` E `ownerUid`), `vinculos/{contaId}_{uid}` (`papel:'dono'`, `locais:[]`), `subscriptions/{contaId}` (**sem** `workspaceId`).

- [ ] **Step 1: Habilitar o emulador de Auth e o script de teste**

Em `firebase.json`, no bloco `emulators` existente, adicionar (mantendo o resto):

```json
"auth": { "port": 9099 }
```

Em `package.json`, adicionar em `"scripts"`:

```json
"test:api": "npx firebase emulators:exec --only firestore,auth --project leo-testes \"node --test tests/api\""
```

O `emulators:exec` exporta `FIRESTORE_EMULATOR_HOST` e `FIREBASE_AUTH_EMULATOR_HOST` sozinho — o Admin SDK dos testes conecta no emulador sem credencial.

- [ ] **Step 2: Escrever o teste que falha**

`tests/api/signup.test.mjs`:

```javascript
// /api/signup — logica de servidor testada no emulador (Firestore + Auth).
// Importa o .ts direto: Node 24 remove os tipos sozinho (type stripping).
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { executarSignup } from '../../src/lib/signup-server.ts';

let db, authAdmin;

before(() => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  authAdmin = getAuth();
});

const DADOS = {
  nome: 'Dra. Nova', email: 'nova@exemplo.com', crm: '999', ufCrm: 'PA',
  especialidade: 'Cardiologia e Ecocardiografia', tipoPerfil: 'medico',
};

describe('executarSignup', () => {
  test('caminho feliz: 5 docs no modelo novo, atomico', async () => {
    const { uid } = await authAdmin.createUser({ email: DADOS.email, password: 'x'.repeat(8) });
    const r = await executarSignup(db, authAdmin, uid, DADOS);
    assert.equal(r.ok, true);

    const prof = await db.doc(`profissionais/${uid}`).get();
    assert.equal(prof.exists, true);
    assert.equal(prof.data().superadmin, false);
    assert.equal(prof.data().nome, DADOS.nome);

    const conta = await db.doc(`contas/${r.contaId}`).get();
    assert.equal(conta.data().ownerUid, uid);
    assert.equal(conta.data().tipo, 'PF');
    assert.equal(conta.data().status, 'ativa');

    const ws = await db.doc(`workspaces/${r.wsId}`).get();
    assert.equal(ws.data().contaId, r.contaId);   // o buraco antigo: nascia sem contaId
    assert.equal(ws.data().ownerUid, uid);        // a tranca provisoria depende dele

    const vinc = await db.doc(`vinculos/${r.contaId}_${uid}`).get();
    assert.equal(vinc.exists, true, 'vinculo tem id deterministico {contaId}_{uid}');
    assert.equal(vinc.data().papel, 'dono');
    assert.deepEqual(vinc.data().locais, []);
    assert.equal(vinc.data().status, 'ativo');

    const sub = await db.doc(`subscriptions/${r.contaId}`).get();
    assert.equal(sub.exists, true, 'assinatura tem doc-id = contaId');
    assert.equal('workspaceId' in sub.data(), false,
      'workspaceId NAO pode ir junto — duas assinaturas casariam na busca antiga');
    assert.equal(sub.data().planoId, 'trial');
    assert.equal(sub.data().franquiaUsada, 0);
  });

  test('ja cadastrado: recusa e NAO apaga o Auth user', async () => {
    const { uid } = await authAdmin.createUser({ email: 'velha@exemplo.com', password: 'x'.repeat(8) });
    await db.doc(`profissionais/${uid}`).set({ uid, nome: 'Ja Existo' });
    const r = await executarSignup(db, authAdmin, uid, { ...DADOS, email: 'velha@exemplo.com' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'ja_cadastrado');
    await assert.doesNotReject(authAdmin.getUser(uid), 'usuario existente jamais e apagado');
  });

  test('dados invalidos: recusa E apaga o Auth user orfao (rollback)', async () => {
    const { uid } = await authAdmin.createUser({ email: 'orfa@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignup(db, authAdmin, uid, { ...DADOS, nome: '', email: 'orfa@exemplo.com' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'dados_invalidos');
    // Sem rollback o email fica preso: retry daria email-already-in-use para sempre.
    await assert.rejects(authAdmin.getUser(uid));
  });

  test('medico sem CRM: dados_invalidos (revalidacao no servidor)', async () => {
    const { uid } = await authAdmin.createUser({ email: 'semcrm@exemplo.com', password: 'x'.repeat(8) });
    const r = await executarSignup(db, authAdmin, uid, { ...DADOS, crm: '', email: 'semcrm@exemplo.com' });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'dados_invalidos');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"
npm run test:api
```

Esperado: FALHA — `Cannot find module .../signup-server.ts`.

- [ ] **Step 4: Escrever `src/lib/signup-server.ts`**

```typescript
// ══════════════════════════════════════════════════════════════════
// LEO · Signup server-side (Admin SDK) — Secao 1, Plano 2A
// Cria a conta INTEIRA no modelo novo, em batch atomico: ou nasce tudo
// ou nao nasce nada. No rollback, apaga o Auth user para nao deixar
// email orfao (retry daria email-already-in-use para sempre).
//
// SEM imports relativos de proposito: os testes (tests/api/signup.test.mjs)
// importam este arquivo direto no node --test via type stripping do Node 24,
// que nao resolve alias @/ nem import relativo sem extensao.
// ══════════════════════════════════════════════════════════════════
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

export type DadosSignup = {
  nome: string; email: string; crm?: string; ufCrm?: string;
  especialidade?: string; tipoPerfil: 'medico' | 'assistente';
};

export type ResultadoSignup =
  | { ok: true; contaId: string; wsId: string }
  | { ok: false; motivo: 'dados_invalidos' | 'ja_cadastrado' | 'erro' };

// Espelho da linha 'trial' de PLANOS_DEFAULT (src/lib/billing.ts:69).
// Duplicado aqui porque este arquivo nao pode ter import relativo (ver topo).
// Se configPlanos/atual existir no banco, ele vence — isto e so a rede.
const TRIAL_FALLBACK = {
  id: 'trial', tipo: 'PF', franquia: 600, excedente: 0, maxLocais: 5,
  localAdicional: 0, extratosFranquia: -1, extratoValor: 0,
  maxUsuarios: 1, usuarioAdicional: 0,
};

async function planoTrial(db: Firestore) {
  try {
    const snap = await db.doc('configPlanos/atual').get();
    const planos = (snap.data()?.planos ?? []) as Array<Record<string, unknown>>;
    const trial = planos.find(p => p.id === 'trial');
    if (trial) return { ...TRIAL_FALLBACK, ...trial };
  } catch { /* config indisponivel → fallback */ }
  return TRIAL_FALLBACK;
}

export async function executarSignup(
  db: Firestore, authAdmin: Auth, uid: string, dados: DadosSignup
): Promise<ResultadoSignup> {
  // Se o perfil ja existe, e um usuario REAL rechamando a rota:
  // recusar sem tocar em nada (jamais apagar o Auth user dele).
  const perfilExistente = await db.doc(`profissionais/${uid}`).get();
  if (perfilExistente.exists) return { ok: false, motivo: 'ja_cadastrado' };

  // Qualquer falha daqui em diante deixa um Auth user sem documentos.
  // Apagar e o rollback: libera o email para um novo cadastro.
  const falhar = async (motivo: 'dados_invalidos' | 'erro'): Promise<ResultadoSignup> => {
    try { await authAdmin.deleteUser(uid); } catch { /* ja nao existia */ }
    return { ok: false, motivo };
  };

  const nome = (dados.nome ?? '').trim();
  const email = (dados.email ?? '').trim();
  const tipoPerfil = dados.tipoPerfil === 'assistente' ? 'assistente' : 'medico';
  if (!nome || !email) return falhar('dados_invalidos');
  if (tipoPerfil === 'medico' && (!dados.crm || !dados.ufCrm)) return falhar('dados_invalidos');

  try {
    const plano = await planoTrial(db);
    const agora = new Date();
    const contaRef = db.collection('contas').doc();
    const wsRef = db.collection('workspaces').doc();
    const contaId = contaRef.id;

    const batch = db.batch();
    // 1. Perfil — mesmos campos do createProfile() do cliente (fixtures.mjs)
    batch.set(db.doc(`profissionais/${uid}`), {
      uid, nome, email,
      crm: dados.crm ?? '', ufCrm: (dados.ufCrm ?? '').toUpperCase(),
      especialidade: dados.especialidade ?? '', tipoPerfil,
      cpf: '', rqe: '', superadmin: false,
      criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp(),
    });
    // 2. Conta (a camada nova)
    batch.set(contaRef, {
      id: contaId, tipo: 'PF', nome, ownerUid: uid, empresaId: null,
      status: 'ativa', criadoEm: FieldValue.serverTimestamp(),
    });
    // 3. Local — COM contaId (modelo novo) e COM ownerUid (tranca provisoria)
    batch.set(wsRef, {
      id: wsRef.id, contaId, ownerUid: uid, tipo: 'PF',
      nomeClinica: 'Consultório', slogan: dados.especialidade ?? '',
      corPrimaria: '#1E3A5F', corSecundaria: '#2563EB',
      criadoEm: FieldValue.serverTimestamp(),
    });
    // 4. Vinculo com id deterministico — pre-requisito de toda regra de papel
    batch.set(db.doc(`vinculos/${contaId}_${uid}`), {
      id: `${contaId}_${uid}`, contaId, medicoUid: uid,
      papel: 'dono', locais: [], status: 'ativo',
      criadoEm: FieldValue.serverTimestamp(),
    });
    // 5. Assinatura por conta — SEM workspaceId (duas assinaturas casariam
    //    na busca antiga e a franquia oscilaria entre elas)
    batch.set(db.doc(`subscriptions/${contaId}`), {
      id: contaId, contaId, planoId: 'trial', tipo: 'trial',
      tipoPlano: plano.tipo ?? 'PF',
      franquiaMensal: plano.franquia, franquiaUsada: 0, creditosExtras: 0,
      excedente: plano.excedente, maxLocais: plano.maxLocais,
      localAdicional: plano.localAdicional,
      extratosFranquia: plano.extratosFranquia, extratoValor: plano.extratoValor,
      maxUsuarios: plano.maxUsuarios, usuarioAdicional: plano.usuarioAdicional,
      cicloInicio: Timestamp.fromDate(agora),
      cicloFim: Timestamp.fromDate(new Date(agora.getTime() + 30 * 864e5)),
      criadoEm: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    return { ok: true, contaId, wsId: wsRef.id };
  } catch (e) {
    console.error('executarSignup:', e);
    return falhar('erro');
  }
}
```

- [ ] **Step 5: Rodar até passar**

```bash
npm run test:api
```

Esperado: 4 testes PASS. Corrigir a implementação, nunca afrouxar o teste.

- [ ] **Step 6: Criar a rota `src/app/api/signup/route.ts`**

```typescript
// ══════════════════════════════════════════════════════════════════
// LEO · API Route — /api/signup (Secao 1, Plano 2A)
// PRIMEIRA rota com verificacao de idToken. E o padrao a seguir:
// as rotas antigas (/api/emitir, /api/corrigir-laudo) ainda nao verificam.
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { executarSignup, type DadosSignup } from '@/lib/signup-server';

export const runtime = 'nodejs';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'leo-sistema-laudos',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const dbAdmin = getFirestore();
const authAdmin = getAuth();

const STATUS: Record<string, number> = { dados_invalidos: 400, ja_cadastrado: 409, erro: 500 };

export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await authAdmin.verifyIdToken(header.slice(7))).uid;
  } catch {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  try {
    const dados = (await req.json()) as DadosSignup;
    const r = await executarSignup(dbAdmin, authAdmin, uid, dados);
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.motivo] ?? 500 });
  } catch (e) {
    console.error('API /signup:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
```

- [ ] **Step 7: Trocar o cadastro do cliente**

Em `src/app/login/page.tsx`, substituir `handleCadastroPF` inteiro (linhas 119-167) por:

```typescript
  // ── Cadastro PF ──
  // O cliente so cria o Auth user (a senha nunca vai ao nosso servidor).
  // Os documentos nascem TODOS em /api/signup (Admin SDK, batch atomico,
  // modelo de contas). Se a rota falhar, ela mesma apaga o Auth user.
  async function handleCadastroPF(e: React.FormEvent) {
    e.preventDefault();
    setErro(''); setSucesso(''); setLoading(true);
    try {
      if (!pfNome || !pfEmail || !pfSenha) { setErro('Preencha todos os campos.'); setLoading(false); return; }
      if (pfTipo === 'medico' && (!pfCrm || !pfUf)) { setErro('CRM e UF são obrigatórios para médicos.'); setLoading(false); return; }
      if (pfSenha.length < 6) { setErro('Senha deve ter ao menos 6 caracteres.'); setLoading(false); return; }

      const cred = await createUserWithEmailAndPassword(auth, pfEmail, pfSenha);
      const idToken = await cred.user.getIdToken();

      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          nome: pfNome, email: pfEmail, crm: pfCrm, ufCrm: pfUf.toUpperCase(),
          especialidade: pfEsp, tipoPerfil: pfTipo,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        // O servidor ja desfez tudo (inclusive o Auth user). Uma resposta, um motivo.
        await auth.signOut().catch(() => {});
        setErro(data.motivo === 'ja_cadastrado'
          ? 'Este email já está cadastrado.'
          : data.motivo === 'dados_invalidos'
            ? 'Dados incompletos. Confira nome, email e CRM/UF.'
            : 'Erro ao criar a conta. Tente novamente.');
        setLoading(false);
        return;
      }

      // Verificacao SO depois do sucesso: rota falhou → nenhum email morto.
      await sendEmailVerification(cred.user);
      await auth.signOut();
      setSucesso('Conta criada! Verifique seu email para ativar.');
      setTab('login');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/email-already-in-use') {
        setErro('Este email já está cadastrado.');
      } else {
        setErro('Erro ao cadastrar: ' + (err as Error).message);
      }
    }
    setLoading(false);
  }
```

E remover os imports que ficaram órfãos no topo do arquivo:
`createProfile, createWorkspace, createMembership` (de `@/lib/firestore`) e
`createSubscription` (de `@/lib/billing`). **Não** apagar as funções em
`firestore.ts`/`billing.ts` — limpeza é o Plano 3.

- [ ] **Step 8: Conferir compilação e testes**

```bash
npm run typecheck && npm run lint && npm run test:api
```

Esperado: os três limpos.

- [ ] **Step 9: Commit**

```bash
git add src/lib/signup-server.ts src/app/api/signup/route.ts src/app/login/page.tsx tests/api/signup.test.mjs firebase.json package.json
git commit -m "feat(secao1): /api/signup server-side no modelo de contas, com rollback do Auth user"
```

---

## Task 2: Billing lê a assinatura por contaId (fallback legado)

**Files:**
- Modify: `src/lib/billing.ts:156-165` (getSubscription)
- Create: `src/lib/billing-admin.ts`
- Modify: `src/app/api/emitir/route.ts:54-65`
- Create: `tests/api/billing-admin.test.mjs`
- Create: `scripts/secao1/03-sincronizar-assinatura.mjs`
- Modify: `package.json` (script), `src/lib/contas.ts:39-42` e `src/contexts/AuthContext.tsx:82-86` (comentários desatualizados)

**Interfaces:**
- Consumes: `workspaces/{wsId}.contaId` (migração de 09/08), `subscriptions/{contaId}`.
- Produces: `resolverAssinatura(db: Firestore, wsId: string): Promise<{ ref: DocumentReference, contaId: string | null } | null>` — usada por `/api/emitir` (aqui) e `/api/exame` (Task 3). `getSubscription(wsId)` continua com a MESMA assinatura de função — nenhum chamador muda.

- [ ] **Step 1: Teste que falha**

`tests/api/billing-admin.test.mjs`:

```javascript
// resolverAssinatura: a MESMA chave para quem debita (emitir) e quem devolve
// (cancelar). Se cada um resolvesse por conta propria, devolveria no doc errado.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolverAssinatura } from '../../src/lib/billing-admin.ts';

let db;

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc('workspaces/wsMigrado').set({ contaId: 'contaX', ownerUid: 'u1' });
  await db.doc('subscriptions/contaX').set({ contaId: 'contaX', franquiaUsada: 5 });
  await db.doc('workspaces/wsLegado').set({ ownerUid: 'u2' });           // sem contaId
  await db.doc('subscriptions/subAntiga').set({ workspaceId: 'wsLegado', franquiaUsada: 2 });
});

describe('resolverAssinatura', () => {
  test('workspace migrado resolve subscriptions/{contaId}', async () => {
    const r = await resolverAssinatura(db, 'wsMigrado');
    assert.equal(r.ref.id, 'contaX');
    assert.equal(r.contaId, 'contaX');
  });
  test('workspace sem contaId cai no doc legado por workspaceId', async () => {
    const r = await resolverAssinatura(db, 'wsLegado');
    assert.equal(r.ref.id, 'subAntiga');
  });
  test('workspace sem assinatura nenhuma retorna null', async () => {
    await db.doc('workspaces/wsSemNada').set({ ownerUid: 'u3' });
    assert.equal(await resolverAssinatura(db, 'wsSemNada'), null);
  });
  test('contaId sem doc de assinatura cai no legado (migracao pela metade)', async () => {
    await db.doc('workspaces/wsMeio').set({ contaId: 'contaSemSub', ownerUid: 'u4' });
    await db.doc('subscriptions/subMeio').set({ workspaceId: 'wsMeio', franquiaUsada: 1 });
    const r = await resolverAssinatura(db, 'wsMeio');
    assert.equal(r.ref.id, 'subMeio');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:api
```

Esperado: os testes novos FALHAM (`Cannot find module .../billing-admin.ts`); os de signup seguem PASS.

- [ ] **Step 3: Escrever `src/lib/billing-admin.ts`**

```typescript
// ══════════════════════════════════════════════════════════════════
// LEO · Billing server-side — resolucao da assinatura (Secao 1, Plano 2A)
// A partir daqui a assinatura oficial e subscriptions/{contaId}. O doc
// antigo (por workspaceId) e fallback para workspace nao migrado.
// QUEM DEBITA (/api/emitir) E QUEM DEVOLVE (/api/exame) USAM ESTA FUNCAO —
// mesma chave, ou a devolucao cai no doc errado.
// Sem imports relativos (testado direto pelo node --test — ver signup-server.ts).
// ══════════════════════════════════════════════════════════════════
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';

export async function resolverAssinatura(
  db: Firestore, wsId: string
): Promise<{ ref: DocumentReference; contaId: string | null } | null> {
  const ws = await db.doc(`workspaces/${wsId}`).get();
  const contaId = ws.exists ? (ws.data()!.contaId as string | undefined) : undefined;
  if (contaId) {
    const ref = db.doc(`subscriptions/${contaId}`);
    if ((await ref.get()).exists) return { ref, contaId };
  }
  const q = await db.collection('subscriptions')
    .where('workspaceId', '==', wsId).limit(1).get();
  if (!q.empty) return { ref: q.docs[0].ref, contaId: contaId ?? null };
  return null;
}
```

- [ ] **Step 4: Rodar até passar**

```bash
npm run test:api
```

Esperado: tudo PASS.

- [ ] **Step 5: `/api/emitir` passa a debitar a assinatura resolvida**

Em `src/app/api/emitir/route.ts`, adicionar o import no topo:

```typescript
import { resolverAssinatura } from '@/lib/billing-admin';
```

E substituir o início da transação (linhas 55-68, do `const subsQuery` até o segundo `return { ok: false, motivo: 'sem_plano' as const };` inclusive) por:

```typescript
    const resultado = await dbAdmin.runTransaction(async (transaction) => {
      // Assinatura por contaId (fallback legado) — mesma chave do /api/exame.
      const assinatura = await resolverAssinatura(dbAdmin, wsId);
      if (!assinatura) {
        return { ok: false, motivo: 'sem_plano' as const };
      }
      const subRef = assinatura.ref;
      const subSnap = await transaction.get(subRef);
      if (!subSnap.exists) {
        return { ok: false, motivo: 'sem_plano' as const };
      }
```

O resto da transação (leitura de `sub`, decisão franquia/créditos, updates) fica exatamente como está.

- [ ] **Step 6: `getSubscription` do cliente resolve por contaId**

Em `src/lib/billing.ts`, substituir a função `getSubscription` (linhas 156-165) por:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSubscription(wsId: string): Promise<Record<string, any> | null> {
  // Caminho novo: workspace → contaId → subscriptions/{contaId}.
  // (Sob a fechadura definitiva a consulta antiga por workspaceId e NEGADA
  //  inteira — regra de list nao filtra; este caminho e o que sobrevive.)
  try {
    const ws = await getDoc(doc(db, 'workspaces', wsId));
    const contaId = ws.exists() ? (ws.data().contaId as string | undefined) : undefined;
    if (contaId) {
      const porConta = await getDoc(doc(db, 'subscriptions', contaId));
      if (porConta.exists()) return { id: porConta.id, ...porConta.data() };
    }
  } catch (e) { console.error('getSubscription (conta):', e); }
  // Fallback legado: workspace ainda nao migrado.
  try {
    const snap = await getDocs(
      query(collection(db, 'subscriptions'), where('workspaceId', '==', wsId), limit(1))
    );
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (e) { console.error('getSubscription:', e); return null; }
}
```

- [ ] **Step 7: Atualizar os dois comentários que dizem o contrário**

Em `src/lib/contas.ts`, substituir o bloco final (linhas 39-42) por:

```typescript
// A assinatura por conta (subscriptions/{contaId}) passou a ser a oficial no
// Plano 2A: getSubscription (billing.ts) resolve workspace → contaId → doc,
// e /api/emitir debita nela. O doc antigo por workspaceId e so fallback.
```

Em `src/contexts/AuthContext.tsx`, substituir o comentário `// ponytail: a assinatura vem do doc ANTIGO...` (linhas 82-86) por:

```typescript
              // getSubscription resolve por contaId desde o Plano 2A
              // (fallback legado por workspaceId dentro dela).
```

- [ ] **Step 8: Script de sincronização dos contadores (para o cutover)**

O doc `subscriptions/{contaId}` é retrato de 09/08 — a franquia real andou no doc antigo desde então. Este script recopia os contadores. **Ele NÃO roda agora**: roda no deploy (fim da Task 3), com a clínica parada.

`scripts/secao1/03-sincronizar-assinatura.mjs`:

```javascript
// Recopia contadores do doc de assinatura ANTIGO (por workspaceId) para o
// NOVO (subscriptions/{contaId}). Rodar NO CUTOVER (deploy do Plano 2A),
// com a clinica parada: depois do deploy, quem debita e o doc novo.
// Ensaio por padrao; --commit grava. Reexecutavel (copia de novo, idempotente).
import { getDb, COMMIT, modo } from './lib-admin.mjs';

const db = getDb();
const CAMPOS = ['franquiaUsada', 'creditosExtras', 'cicloInicio', 'cicloFim'];

async function main() {
  console.log(`MODO: ${modo()}\n`);
  const antigas = await db.collection('subscriptions').get();
  let n = 0;
  for (const d of antigas.docs) {
    const s = d.data();
    const contaId = s._migracaoSecao1Substituida;
    if (!s.workspaceId || !contaId) continue;   // so docs antigos ja substituidos
    const novoRef = db.doc(`subscriptions/${contaId}`);
    const novo = await novoRef.get();
    if (!novo.exists) { console.log(`ATENCAO: ${contaId} nao existe, pulando`); continue; }
    const delta = {};
    for (const c of CAMPOS) if (s[c] !== undefined) delta[c] = s[c];
    console.log(`${d.id} → subscriptions/${contaId}`);
    for (const c of CAMPOS) {
      const de = JSON.stringify(novo.data()[c]?.toDate?.() ?? novo.data()[c] ?? null);
      const para = JSON.stringify(s[c]?.toDate?.() ?? s[c] ?? null);
      console.log(`  ${c.padEnd(15)} ${de} → ${para}`);
    }
    if (COMMIT) { await novoRef.set(delta, { merge: true }); n++; }
  }
  console.log(COMMIT ? `\nGRAVADO: ${n} assinaturas sincronizadas.` : '\nENSAIO. Nada gravado.');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
```

Em `package.json`:

```json
"secao1:sincronizar-assinatura": "node --env-file=.env.local scripts/secao1/03-sincronizar-assinatura.mjs"
```

- [ ] **Step 9: Conferir e commitar**

```bash
npm run typecheck && npm run lint && npm run test:api
```

```bash
git add src/lib/billing.ts src/lib/billing-admin.ts src/app/api/emitir/route.ts src/lib/contas.ts src/contexts/AuthContext.tsx tests/api/billing-admin.test.mjs scripts/secao1/03-sincronizar-assinatura.mjs package.json
git commit -m "feat(secao1): billing resolve assinatura por contaId com fallback legado (cliente + emitir)"
```

---

## Task 3: `/api/exame` — apagar, cancelar e transferir pelo servidor

**Files:**
- Create: `src/lib/exame-admin.ts`
- Create: `src/app/api/exame/route.ts`
- Create: `tests/api/exame.test.mjs`
- Modify: `src/components/Worklist.tsx:300-306` (removerDaFila)
- Modify: `src/components/Historico.tsx:128-134` (confirmarDelete)

**Interfaces:**
- Consumes: `resolverAssinatura` (Task 2), `vinculos/{contaId}_{uid}`, `consumo` (escrita pelo `/api/emitir`), `exames` com `pdfUrl` no formato `https://storage.googleapis.com/{bucket}/laudos/{wsId}/{nome}.pdf` (`pdf-server.ts:74-85`).
- Produces: rota `POST /api/exame` com corpo `{ acao: 'apagar'|'cancelar'|'transferir', wsId, exameId, motivo?, novoMedicoUid? }`, resposta `{ ok: true } | { ok: false, motivo: string }`. Funções: `resolverPapel(db, wsId, uid)`, `apagarExame(db, p)`, `cancelarExame(db, p)`, `transferirExame(db, p)` — todas recebem `{ subRef, apagarPdf }` por parâmetro (DI para teste).

**Permissões (matriz §4 do ADR, cobrada AQUI porque a definitiva põe `delete: if false`):**

| Ação | dono | medico | recepcao |
|---|---|---|---|
| apagar não-emitido | ✅ | só os seus ou sem autor | ❌ (P4) |
| apagar emitido (devolve consumo) | ✅ | ❌ | ❌ |
| cancelar emitido (devolve consumo) | ✅ | só os seus | ❌ |
| transferir | ✅ | só os seus ou sem autor | ❌ |

- [ ] **Step 1: Teste que falha**

`tests/api/exame.test.mjs`:

```javascript
// /api/exame — apagar/cancelar/transferir com papel, devolucao e log.
import { test, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolverPapel, apagarExame, cancelarExame, transferirExame } from '../../src/lib/exame-admin.ts';

let db;
const CONTA = 'contaT', WS = 'wsT';
const DONO = 'uidDono', MED = 'uidMed', MED2 = 'uidMed2', RITA = 'uidRita';

// Spy do apagador de PDF: registra as URLs, nao toca Storage.
let pdfsApagados;
const apagarPdf = async (url) => { pdfsApagados.push(url); };

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: CONTA, ownerUid: DONO, nomeClinica: 'T' });
  await db.doc(`contas/${CONTA}`).set({ ownerUid: DONO });
  for (const [uid, papel] of [[DONO, 'dono'], [MED, 'medico'], [MED2, 'medico'], [RITA, 'recepcao']]) {
    await db.doc(`vinculos/${CONTA}_${uid}`).set({ contaId: CONTA, medicoUid: uid, papel, locais: [], status: 'ativo' });
  }
});

beforeEach(async () => {
  pdfsApagados = [];
  await db.doc(`subscriptions/${CONTA}`).set({ contaId: CONTA, franquiaMensal: 600, franquiaUsada: 10, creditosExtras: 3 });
});

const subRef = () => db.doc(`subscriptions/${CONTA}`);

async function seedEmitido(id, { consumos = 1 } = {}) {
  await db.doc(`workspaces/${WS}/exames/${id}`).set({
    pacienteNome: 'P', medicoUid: MED, status: 'emitido',
    pdfUrl: `https://storage.googleapis.com/bucket-t/laudos/${WS}/laudo_${id}.pdf`,
  });
  for (let i = 0; i < consumos; i++) {
    await db.collection('consumo').add({ workspaceId: WS, exameId: id, medicoUid: MED, tipo: 'franquia' });
  }
}

describe('resolverPapel', () => {
  test('resolve pelo vinculo deterministico', async () => {
    assert.equal(await resolverPapel(db, WS, DONO), 'dono');
    assert.equal(await resolverPapel(db, WS, MED), 'medico');
    assert.equal(await resolverPapel(db, WS, RITA), 'recepcao');
    assert.equal(await resolverPapel(db, WS, 'uidForasteiro'), null);
  });
  test('fallback legado: ownerUid do workspace sem vinculo = dono', async () => {
    await db.doc('workspaces/wsLeg').set({ ownerUid: 'uidLegado' });
    assert.equal(await resolverPapel(db, 'wsLeg', 'uidLegado'), 'dono');
  });
});

describe('apagar', () => {
  test('medico apaga o proprio nao-emitido; doc some; log fica; pdf nao (nao tinha)', async () => {
    await db.doc(`workspaces/${WS}/exames/fila1`).set({ pacienteNome: 'F', medicoUid: MED, status: 'aguardando' });
    const r = await apagarExame(db, { wsId: WS, exameId: 'fila1', uid: MED, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    assert.equal((await db.doc(`workspaces/${WS}/exames/fila1`).get()).exists, false);
    const logs = await db.collection('logs').where('exameId', '==', 'fila1').get();
    assert.equal(logs.size, 1);
    assert.equal(pdfsApagados.length, 0);
  });
  test('recepcao NAO apaga nem da fila (P4)', async () => {
    await db.doc(`workspaces/${WS}/exames/fila2`).set({ pacienteNome: 'F', status: 'aguardando' });
    const r = await apagarExame(db, { wsId: WS, exameId: 'fila2', uid: RITA, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'sem_permissao');
    assert.equal((await db.doc(`workspaces/${WS}/exames/fila2`).get()).exists, true);
  });
  test('medico NAO apaga emitido (nem o proprio); dono apaga e devolve', async () => {
    await seedEmitido('em1', { consumos: 2 });   // reemitido: consumiu 2
    const neg = await apagarExame(db, { wsId: WS, exameId: 'em1', uid: MED, subRef: subRef(), apagarPdf });
    assert.equal(neg.ok, false);
    const r = await apagarExame(db, { wsId: WS, exameId: 'em1', uid: DONO, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    const sub = (await subRef().get()).data();
    assert.equal(sub.franquiaUsada, 8, 'devolveu os 2 consumos (P1)');
    assert.equal(pdfsApagados.length, 1, 'PDF publico apagado (P2)');
    const canc = await db.collection('consumo').where('exameId', '==', 'em1').where('tipo', '==', 'cancelamento').get();
    assert.equal(canc.size, 1, 'devolucao registrada em consumo, append-only');
  });
});

describe('cancelar', () => {
  test('medico autor cancela: status, devolucao, pdf, log', async () => {
    await seedEmitido('em2');
    const r = await cancelarExame(db, { wsId: WS, exameId: 'em2', uid: MED, motivo: 'exame repetido', subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    const ex = (await db.doc(`workspaces/${WS}/exames/em2`).get()).data();
    assert.equal(ex.status, 'cancelado');
    assert.equal(ex.motivoCancelamento, 'exame repetido');
    assert.equal('pdfUrl' in ex, false, 'pdfUrl limpo');
    assert.equal((await subRef().get()).data().franquiaUsada, 9);
    assert.equal(pdfsApagados.length, 1);
  });
  test('medico NAO cancela laudo do colega; dono cancela', async () => {
    await seedEmitido('em3');
    const neg = await cancelarExame(db, { wsId: WS, exameId: 'em3', uid: MED2, motivo: 'x', subRef: subRef(), apagarPdf });
    assert.equal(neg.ok, false);
    const r = await cancelarExame(db, { wsId: WS, exameId: 'em3', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
  });
  test('cancelar duas vezes nao devolve duas vezes', async () => {
    await seedEmitido('em4');
    await cancelarExame(db, { wsId: WS, exameId: 'em4', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    const r2 = await cancelarExame(db, { wsId: WS, exameId: 'em4', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    assert.equal(r2.ok, false);
    assert.equal(r2.motivo, 'nao_emitido');
    assert.equal((await subRef().get()).data().franquiaUsada, 9, 'so 1 devolucao');
  });
  test('devolucao de credito volta como credito', async () => {
    await db.doc(`workspaces/${WS}/exames/em5`).set({ pacienteNome: 'P', medicoUid: MED, status: 'emitido' });
    await db.collection('consumo').add({ workspaceId: WS, exameId: 'em5', tipo: 'credito' });
    await cancelarExame(db, { wsId: WS, exameId: 'em5', uid: DONO, motivo: 'x', subRef: subRef(), apagarPdf });
    const sub = (await subRef().get()).data();
    assert.equal(sub.creditosExtras, 4, 'credito devolvido');
    assert.equal(sub.franquiaUsada, 10, 'franquia intacta');
  });
});

describe('transferir', () => {
  test('emitido: devolve, volta pra andamento com o novo medico, pdf apagado', async () => {
    await seedEmitido('tr1');
    const r = await transferirExame(db, { wsId: WS, exameId: 'tr1', uid: DONO, novoMedicoUid: MED2, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    const ex = (await db.doc(`workspaces/${WS}/exames/tr1`).get()).data();
    assert.equal(ex.medicoUid, MED2);
    assert.equal(ex.status, 'andamento');
    assert.equal((await subRef().get()).data().franquiaUsada, 9, 'D8: novo medico consome de novo');
    assert.equal(pdfsApagados.length, 1);
  });
  test('nao-emitido: so troca o medico, sem devolucao', async () => {
    await db.doc(`workspaces/${WS}/exames/tr2`).set({ pacienteNome: 'P', medicoUid: MED, status: 'aguardando' });
    const r = await transferirExame(db, { wsId: WS, exameId: 'tr2', uid: MED, novoMedicoUid: MED2, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, true);
    assert.equal((await subRef().get()).data().franquiaUsada, 10);
  });
  test('alvo precisa ser medico/dono da conta', async () => {
    await db.doc(`workspaces/${WS}/exames/tr3`).set({ pacienteNome: 'P', medicoUid: MED, status: 'aguardando' });
    const r = await transferirExame(db, { wsId: WS, exameId: 'tr3', uid: DONO, novoMedicoUid: RITA, subRef: subRef(), apagarPdf });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'alvo_invalido');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:api
```

Esperado: FALHA por módulo inexistente; signup e billing-admin seguem PASS.

- [ ] **Step 3: Escrever `src/lib/exame-admin.ts`**

```typescript
// ══════════════════════════════════════════════════════════════════
// LEO · Exame server-side — apagar / cancelar / transferir (Plano 2A)
// A fechadura definitiva tem `exames delete: if false`: estas funcoes,
// atras do /api/exame, sao O UNICO caminho — com papel, log em `logs`,
// devolucao de consumo (D8) e limpeza do PDF publico (P2).
// Sem imports relativos (testado direto pelo node --test).
// `subRef` vem do chamador (resolverAssinatura de billing-admin) e
// `apagarPdf` tambem — DI que mantem Storage fora dos testes.
// ══════════════════════════════════════════════════════════════════
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export type Papel = 'dono' | 'medico' | 'recepcao' | null;
type Resultado = { ok: true } | { ok: false; motivo: string };
type Params = {
  wsId: string; exameId: string; uid: string;
  subRef: DocumentReference | null;
  apagarPdf: (url: string) => Promise<void>;
  motivo?: string; novoMedicoUid?: string;
};

export async function resolverPapel(db: Firestore, wsId: string, uid: string): Promise<Papel> {
  const ws = await db.doc(`workspaces/${wsId}`).get();
  if (!ws.exists) return null;
  const contaId = ws.data()!.contaId as string | undefined;
  if (contaId) {
    const v = await db.doc(`vinculos/${contaId}_${uid}`).get();
    const d = v.data();
    if (v.exists && d!.status === 'ativo' && ['dono', 'medico', 'recepcao'].includes(d!.papel)) {
      return d!.papel as Papel;
    }
  }
  // Legado: dono do local sem vinculo migrado.
  return ws.data()!.ownerUid === uid ? 'dono' : null;
}

// Autor ou sem autor: o que um medico pode mexer alem do que e do dono.
function medicoAlcanca(exame: Record<string, unknown>, uid: string) {
  return !exame.medicoUid || exame.medicoUid === uid;
}

// Devolve TODOS os consumos do exame (P1/D8) e registra a devolucao em
// `consumo` (append-only). Transacao: contadores nunca ficam pela metade.
async function devolverConsumo(db: Firestore, p: Params, acao: string) {
  const snap = await db.collection('consumo').where('exameId', '==', p.exameId).get();
  // P7: sem indice composto — filtra o workspace em codigo.
  const doExame = snap.docs.map(d => d.data()).filter(c => c.workspaceId === p.wsId);
  const nFranquia = doExame.filter(c => c.tipo === 'franquia').length;
  const nCredito = doExame.filter(c => c.tipo === 'credito').length;
  if (!nFranquia && !nCredito) return;
  if (p.subRef) {
    await db.runTransaction(async (t) => {
      const sub = await t.get(p.subRef!);
      if (!sub.exists) return;
      const usada = (sub.data()!.franquiaUsada as number) || 0;
      t.update(p.subRef!, {
        franquiaUsada: Math.max(0, usada - nFranquia),
        creditosExtras: FieldValue.increment(nCredito),
      });
    });
  }
  await db.collection('consumo').add({
    workspaceId: p.wsId, exameId: p.exameId, tipo: 'cancelamento', acao,
    devolvidoFranquia: nFranquia, devolvidoCreditos: nCredito,
    por: p.uid, emitidoEm: FieldValue.serverTimestamp(),
  });
}

async function limparPdf(exame: Record<string, unknown>, p: Params) {
  if (typeof exame.pdfUrl === 'string' && exame.pdfUrl) {
    try { await p.apagarPdf(exame.pdfUrl); }
    catch (e) { console.error('apagarPdf:', e); }   // nunca bloqueia a acao
  }
}

function log(db: Firestore, tipo: string, p: Params, exame: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return db.collection('logs').add({
    tipo, exameId: p.exameId, wsId: p.wsId,
    pacienteNome: (exame.pacienteNome as string) ?? '',
    medicoUidExame: (exame.medicoUid as string) ?? null,
    por: p.uid, ts: FieldValue.serverTimestamp(),
    // P3: cancelamento nao reverte o Feegow — divergencia fica registrada.
    feegowDivergencia: !!exame.feegowAppointId,
    ...extra,
  }).catch(e => console.error('log:', e));
}

async function carregar(db: Firestore, p: Params) {
  const [papel, exameSnap] = await Promise.all([
    resolverPapel(db, p.wsId, p.uid),
    db.doc(`workspaces/${p.wsId}/exames/${p.exameId}`).get(),
  ]);
  return { papel, exameSnap };
}

export async function apagarExame(db: Firestore, p: Params): Promise<Resultado> {
  const { papel, exameSnap } = await carregar(db, p);
  if (!exameSnap.exists) return { ok: false, motivo: 'nao_encontrado' };
  const exame = exameSnap.data()!;
  const emitido = exame.status === 'emitido';
  const pode = emitido
    ? papel === 'dono'                                             // matriz: apagar emitido e so do dono
    : papel === 'dono' || (papel === 'medico' && medicoAlcanca(exame, p.uid));
  if (!pode) return { ok: false, motivo: 'sem_permissao' };

  if (emitido) await devolverConsumo(db, p, 'apagar');
  await limparPdf(exame, p);
  await exameSnap.ref.delete();
  await log(db, 'exclusao_exame', p, exame, { estavaEmitido: emitido });
  return { ok: true };
}

export async function cancelarExame(db: Firestore, p: Params): Promise<Resultado> {
  const { papel, exameSnap } = await carregar(db, p);
  if (!exameSnap.exists) return { ok: false, motivo: 'nao_encontrado' };
  const exame = exameSnap.data()!;
  if (exame.status !== 'emitido') return { ok: false, motivo: 'nao_emitido' };
  const pode = papel === 'dono' || (papel === 'medico' && exame.medicoUid === p.uid);
  if (!pode) return { ok: false, motivo: 'sem_permissao' };

  await devolverConsumo(db, p, 'cancelar');
  await limparPdf(exame, p);
  await exameSnap.ref.update({
    status: 'cancelado',
    canceladoEm: FieldValue.serverTimestamp(),
    canceladoPor: p.uid,
    motivoCancelamento: p.motivo ?? '',
    pdfUrl: FieldValue.delete(),
  });
  await log(db, 'cancelamento_laudo', p, exame, { motivo: p.motivo ?? '' });
  return { ok: true };
}

export async function transferirExame(db: Firestore, p: Params): Promise<Resultado> {
  if (!p.novoMedicoUid) return { ok: false, motivo: 'alvo_invalido' };
  const { papel, exameSnap } = await carregar(db, p);
  if (!exameSnap.exists) return { ok: false, motivo: 'nao_encontrado' };
  const exame = exameSnap.data()!;
  const pode = papel === 'dono' || (papel === 'medico' && medicoAlcanca(exame, p.uid));
  if (!pode) return { ok: false, motivo: 'sem_permissao' };
  const papelAlvo = await resolverPapel(db, p.wsId, p.novoMedicoUid);
  if (papelAlvo !== 'medico' && papelAlvo !== 'dono') return { ok: false, motivo: 'alvo_invalido' };

  const emitido = exame.status === 'emitido';
  if (emitido) {
    // D8: o laudo anterior sai da conta; o novo medico consome ao emitir.
    await devolverConsumo(db, p, 'transferir');
    await limparPdf(exame, p);
  }
  await exameSnap.ref.update({
    medicoUid: p.novoMedicoUid,
    ...(emitido ? { status: 'andamento', pdfUrl: FieldValue.delete() } : {}),
    atualizadoEm: FieldValue.serverTimestamp(),
  });
  await log(db, 'transferencia_exame', p, exame, { de: (exame.medicoUid as string) ?? null, para: p.novoMedicoUid, estavaEmitido: emitido });
  return { ok: true };
}
```

- [ ] **Step 4: Rodar até passar**

```bash
npm run test:api
```

Esperado: todos PASS (signup + billing-admin + exame).

- [ ] **Step 5: Criar a rota `src/app/api/exame/route.ts`**

```typescript
// ══════════════════════════════════════════════════════════════════
// LEO · API Route — /api/exame: apagar | cancelar | transferir
// Auth verificada (padrao do /api/signup). A logica vive em
// src/lib/exame-admin.ts (testada no emulador); aqui so a composicao:
// token → assinatura (billing-admin) → acao → Storage real.
// ══════════════════════════════════════════════════════════════════
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { resolverAssinatura } from '@/lib/billing-admin';
import { apagarExame, cancelarExame, transferirExame } from '@/lib/exame-admin';

export const runtime = 'nodejs';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'leo-sistema-laudos',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'leo-sistema-laudos.firebasestorage.app',
  });
}
const dbAdmin = getFirestore();
const authAdmin = getAuth();

// pdfUrl publico → caminho no bucket → delete. Formato de pdf-server.ts:85.
async function apagarPdf(url: string) {
  const bucket = getStorage().bucket();
  const prefixo = `https://storage.googleapis.com/${bucket.name}/`;
  if (!url.startsWith(prefixo)) return;
  await bucket.file(decodeURIComponent(url.slice(prefixo.length))).delete({ ignoreNotFound: true });
}

const ACOES = { apagar: apagarExame, cancelar: cancelarExame, transferir: transferirExame } as const;
const STATUS: Record<string, number> = {
  sem_permissao: 403, nao_encontrado: 404, nao_emitido: 409, alvo_invalido: 400,
};

export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  let uid: string;
  try {
    uid = (await authAdmin.verifyIdToken(header.slice(7))).uid;
  } catch {
    return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  }
  try {
    const { acao, wsId, exameId, motivo, novoMedicoUid } = await req.json();
    const executar = ACOES[acao as keyof typeof ACOES];
    if (!executar || !wsId || !exameId) {
      return NextResponse.json({ ok: false, motivo: 'dados_invalidos' }, { status: 400 });
    }
    const assinatura = await resolverAssinatura(dbAdmin, wsId);
    const r = await executar(dbAdmin, {
      wsId, exameId, uid, motivo, novoMedicoUid,
      subRef: assinatura?.ref ?? null, apagarPdf,
    });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[(r as { motivo: string }).motivo] ?? 500 });
  } catch (e) {
    console.error('API /exame:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Trocar o deleteDoc da Worklist**

Em `src/components/Worklist.tsx`, substituir `removerDaFila` (linhas 300-306) por:

```typescript
  async function removerDaFila(item: ExameItem) {
    if (!confirm(`Remover ${item.pacienteNome} da fila?`)) return;
    if (!workspace?.id) return;
    try {
      const res = await feegowAuthFetch('/api/exame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'apagar', wsId: workspace.id, exameId: item.id }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.motivo === 'sem_permissao'
          ? 'Seu perfil não pode remover exames da fila. Peça ao médico ou ao responsável.'
          : 'Não foi possível remover. Tente novamente.');
      }
    } catch (e) {
      console.error('Erro ao remover:', e);
      alert('Não foi possível remover. Verifique a conexão e tente novamente.');
    }
  }
```

Conferir que `deleteDoc` não é mais usado no arquivo; se ficou órfão, tirar do import de `firebase/firestore`.

- [ ] **Step 7: Trocar o deleteDoc do Histórico**

Em `src/components/Historico.tsx`, substituir `confirmarDelete` (linhas 128-134) por:

```typescript
  async function confirmarDelete() {
    if (!deleteId || !wsIdSel || !user?.uid) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/exame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acao: 'apagar', wsId: wsIdSel, exameId: deleteId }),
      });
      const data = await res.json();
      if (!data.ok) {
        // Antes a falha era silenciosa: a regra negava e o modal so travava.
        alert(data.motivo === 'sem_permissao'
          ? 'Apagar laudo emitido é ação do responsável pela conta.'
          : 'Não foi possível excluir. Tente novamente.');
        setDeleteId(null);
        return;
      }
      setExames(prev => prev.filter(e => e.id !== deleteId));
      setDeleteId(null);
    } catch (e) {
      console.error('Erro ao excluir:', e);
      alert('Não foi possível excluir. Verifique a conexão e tente novamente.');
      setDeleteId(null);
    }
  }
```

Remover a linha `await logAction('exclusao_laudo', ...)` que ficava antes do delete (a rota agora grava o log no servidor, com mais contexto). Tirar `deleteDoc`/`doc`/`db` dos imports se ficarem órfãos (conferir com o lint).

- [ ] **Step 8: Conferir tudo**

```bash
npm run typecheck && npm run lint && npm run test:api
```

Esperado: os três limpos.

- [ ] **Step 9: Commit**

```bash
git add src/lib/exame-admin.ts src/app/api/exame/route.ts tests/api/exame.test.mjs src/components/Worklist.tsx src/components/Historico.tsx
git commit -m "feat(secao1): rota /api/exame (apagar/cancelar/transferir) com papel, devolucao de franquia e limpeza de PDF"
```

- [ ] **Step 10: DEPLOY DO APP (merge na master) + sincronização — momento de clínica parada**

O código novo precisa estar NO AR antes da regra subir (Task 5). A sincronização de contadores roda logo após o deploy, antes de qualquer emissão.

```bash
git checkout master && git pull && git merge --no-ff feat/secao1-plano2a -m "feat(secao1): Plano 2A tasks 1-3 — signup server-side, billing por conta, rota de exame" && git push origin master
```

Aguardar o deploy do Vercel concluir (~2-3 min; conferir em https://vercel.com ou `curl -sI https://souleo.com.br | head -1` respondendo 200). Então:

```bash
npm run secao1:sincronizar-assinatura
```

Conferir o ensaio (valores de → para fazem sentido: franquiaUsada do doc antigo é o número real). Depois:

```bash
npm run secao1:sincronizar-assinatura -- --commit
npm run secao1:inventario
```

Esperado: `subscriptions/{contaId}` com `franquiaUsada` igual ao doc antigo. A partir daqui, emitir/cancelar debitam e devolvem no doc novo.

```bash
git checkout feat/secao1-plano2a
```

---

## Task 4: Sincronizar as duas fechaduras — Lacuna 1 + Direx (P6)

**Files:**
- Modify: `firestore.rules.definitiva:129-132` (config/extratos) e `:146-151` (subscriptions)
- Modify: `tests/rules/definitiva.test.mjs` (casos novos)
- Modify: `tests/rules/interim.test.mjs` (mesmos casos — REGRA DE OURO)
- Modify: `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md` (§8.2.2 — diff auditado)

**Interfaces:**
- Consumes: as duas suítes de regra existentes (70 + 62 testes), `fixtures.mjs`.
- Produces: definitiva pronta para publicar; lista de divergências intencionais auditada no ADR.

- [ ] **Step 1: Testes primeiro, NAS DUAS suítes**

Adicionar em `tests/rules/definitiva.test.mjs` (dentro de um `describe` novo ao final; usa os atores já definidos — `ADMIN` é superadmin, `DR_A` dono, `RITA` recepção):

```javascript
describe('9. correcoes do Plano 2A (Lacuna 1 + Direx)', () => {
  test('superadmin le e escreve config (honorarios) de local alheio', async () => {
    await assertSucceeds(getDoc(doc(como(ADMIN), `workspaces/${LOCAL_A1}/config`, 'honorarios')));
    await assertSucceeds(setDoc(doc(como(ADMIN), `workspaces/${LOCAL_A1}/config`, 'honorarios'), { UNIMED: 130 }));
  });
  test('superadmin le extratos de local alheio', async () => {
    await assertSucceeds(getDoc(doc(como(ADMIN), `workspaces/${LOCAL_A1}/extratos`, '2026-08')));
  });
  test('superadmin atualiza assinatura (Direx: troca de plano, creditos)', async () => {
    await assertSucceeds(updateDoc(doc(como(ADMIN), 'subscriptions', CONTA_A), { creditosExtras: 10 }));
  });
  test('dono NAO atualiza a propria assinatura', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'subscriptions', CONTA_A), { franquiaUsada: 0 }));
  });
  test('recepcao NAO le config nem extratos', async () => {
    await assertFails(getDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/config`, 'honorarios')));
    await assertFails(getDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/extratos`, '2026-08')));
  });
});
```

(Se o seed da suíte não tiver `workspaces/{LOCAL_A1}/extratos/2026-08`, criar no `before`: `await setDoc(doc(db, \`workspaces/${LOCAL_A1}/extratos\`, '2026-08'), { emitidos: 3 });`)

Adicionar os MESMOS casos em `tests/rules/interim.test.mjs`, com os atores dessa suíte (**antes de colar, conferir com grep se algum caso já existe — não duplicar; ajustar o seed do `before` se faltar o doc de extratos**):

```javascript
describe('correcoes do Plano 2A (mesmos casos da suite definitiva — regra de ouro)', () => {
  test('superadmin le e escreve config (honorarios) de local alheio', async () => {
    await assertSucceeds(getDoc(doc(como(SERGIO), `workspaces/${WS_OUTRO}/config`, 'honorarios')));
    await assertSucceeds(setDoc(doc(como(SERGIO), `workspaces/${WS_OUTRO}/config`, 'honorarios'), { UNIMED: 130 }));
  });
  test('superadmin le extratos de local alheio', async () => {
    await assertSucceeds(getDoc(doc(como(SERGIO), `workspaces/${WS_OUTRO}/extratos`, '2026-08')));
  });
  test('superadmin atualiza assinatura (Direx: troca de plano, creditos)', async () => {
    await assertSucceeds(updateDoc(doc(como(SERGIO), 'subscriptions', 'contaOutro'), { creditosExtras: 10 }));
  });
  test('dono NAO atualiza a assinatura por conta', async () => {
    await assertFails(updateDoc(doc(como(OUTRO), 'subscriptions', 'contaOutro'), { franquiaUsada: 0 }));
  });
  test('recepcao NAO le config nem extratos', async () => {
    await assertFails(getDoc(doc(como('uidRecepcao'), `workspaces/${WS_MEDCARDIO}/config`, 'honorarios')));
    await assertFails(getDoc(doc(como('uidRecepcao'), `workspaces/${WS_MEDCARDIO}/extratos`, '2026-08')));
  });
});
```

Seeds a garantir no `before` da interim (se ainda não existirem): `workspaces/{WS_OUTRO}/config/honorarios`, `workspaces/{WS_OUTRO}/extratos/2026-08`, `workspaces/{WS_MEDCARDIO}/extratos/2026-08`, e o helper `como(uid)` (a suíte já tem um equivalente — usar o existente).

- [ ] **Step 2: Rodar e ver o que falha onde**

```bash
npm run test:rules
npm run test:rules:definitiva
```

Esperado: na publicada (interim), os casos novos já PASSAM (ela tem `superadmin() ||` em config/extratos e update de assinatura pelo superadmin) — provam que não há regressão. Na definitiva, **falham**: superadmin sem acesso a config/extratos (Lacuna 1) e superadmin sem update de assinatura (P6).

- [ ] **Step 3: Corrigir a definitiva**

Em `firestore.rules.definitiva`, trocar as linhas 129-132 por:

```javascript
      // Honorarios, extratos e demais ajustes do local: financeiro, so quem
      // atende (medico) ou o dono — recepcao nao ve valor por convenio.
      // superadmin(): Lacuna 1 do levantamento — sem ele o suporte perdia
      // acesso a honorarios e contador de extrato (a publicada sempre teve).
      match /config/{docId}   { allow read, write: if superadmin() || ehMedicoNoLocal(wsId); }
      match /extratos/{docId} { allow read, write: if superadmin() || ehMedicoNoLocal(wsId); }
```

E o bloco de `subscriptions` (linhas 146-151) por:

```javascript
    // ── ASSINATURAS ── id = contaId. Recepcao nao ve financeiro.
    // update superadmin: o Direx troca plano e ajusta creditos PELO NAVEGADOR
    // (licencas/page.tsx + ajustarCreditos). `if false` quebraria o painel.
    // Cliente comum continua sem escrever: franquia e so do servidor.
    match /subscriptions/{contaId} {
      allow get, list: if superadmin()
                       || (temVinculo(contaId) && vinc(contaId).papel in ['dono', 'medico']);
      allow update: if superadmin();
      allow create, delete: if false;
    }
```

- [ ] **Step 4: Rodar as DUAS suítes até passarem**

```bash
npm run test:rules && npm run test:rules:definitiva
```

Esperado: 100% verde nas duas.

- [ ] **Step 5: Diff auditado linha a linha (o aviso do §8.2 é ordem)**

```bash
git diff --no-index firestore.rules firestore.rules.definitiva
```

Percorrer o diff inteiro. Cada divergência tem que estar nesta lista de INTENCIONAIS (comportamento que muda de propósito quando a definitiva subir):

| # | Divergência | Por que é intencional |
|---|---|---|
| 1 | `workspaces create`: publicada permite dono; definitiva `false` | Local nasce no `/api/signup` (Task 1) |
| 2 | `vinculos create`: publicada permite dono-do-local; definitiva `false` | Vínculo nasce no `/api/signup`; convite será rota (2B) |
| 3 | `subscriptions create`: publicada permite dono; definitiva `false` | Assinatura nasce no `/api/signup` |
| 4 | `subscriptions update`: publicada tem braço legado do dono; definitiva só superadmin | Doc legado morre; franquia é do servidor |
| 5 | `exames delete`: publicada permite; definitiva `false` | `/api/exame` (Task 3) é o único caminho |
| 6 | `exames update`: definitiva exige autor (`medicoUid == uid()`) e `intacto('medicoUid')` | Caneta do autor (D2) — é o ganho da definitiva |
| 7 | `exames create`: definitiva exige `medicoUid` próprio/ausente | Anti-forja de autoria |
| 8 | Leituras por `ownerUid` (publicada) vs por vínculo (definitiva) | Modelo de contas substitui o provisório |
| 9 | `pacientes delete`: publicada `alcancaLocal`; definitiva só dono | Matriz §4 |
| 10 | `privado/**` explícito na definitiva | Gaveta de segredos (Fase 6) |
| 11 | `contas get/list`: braço `ownerUid` na publicada | Redundante quando todo dono tem vínculo `dono` |

Qualquer divergência FORA desta lista → parar, investigar, corrigir **nos dois arquivos no mesmo commit** com teste nas duas suítes. Registrar o resultado da auditoria no ADR, seção nova `### 8.2.2 Diff auditado antes da Fase 5 (Plano 2A)` com a tabela acima e o veredito.

- [ ] **Step 6: Commit + merge (arquivos de regra não afetam produção até publicar)**

```bash
git add firestore.rules.definitiva tests/rules/definitiva.test.mjs tests/rules/interim.test.mjs docs/decisoes/2026-08-09-secao1-contas-e-acesso.md
git commit -m "fix(seguranca): definitiva ganha superadmin em config/extratos (Lacuna 1) e update de assinatura pelo Direx (P6) — diff auditado"
git checkout master && git merge --no-ff feat/secao1-plano2a -m "fix(seguranca): Plano 2A task 4 — definitiva sincronizada com a publicada" && git push origin master && git checkout feat/secao1-plano2a
```

---

## Task 5: Publicar a fechadura definitiva (Fase 5)

**Files:**
- Create: `scripts/secao1/04-publicar-regras.mjs`
- Modify: `firestore.rules` (recebe o conteúdo da definitiva, com cabeçalho novo)
- Delete: `firestore.rules.definitiva`, `tests/rules/interim.test.mjs`
- Rename: `tests/rules/definitiva.test.mjs` → `tests/rules/regras.test.mjs` (passa a ler `firestore.rules`)
- Modify: `package.json` (scripts de teste), `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md` (Fase 5 ✅)

**Pré-condições (conferir TODAS antes de começar):**
1. Tasks 1-4 mergeadas na master e deploy do Vercel concluído (o app no ar já usa signup server-side, billing por conta e `/api/exame`).
2. `npm run secao1:sincronizar-assinatura -- --commit` já rodou (Task 3 Step 10).
3. As duas suítes de regra + `test:api` + typecheck + lint: tudo verde.

- [ ] **Step 1: Escrever o publicador (com ensaio e rollback)**

`scripts/secao1/04-publicar-regras.mjs`:

```javascript
// Publica um arquivo de regras do Firestore via Rules API (service account —
// nao depende de firebase login). ENSAIO por padrao; --commit publica.
// ROLLBACK: node --env-file=.env.local scripts/secao1/04-publicar-regras.mjs --file=firestore.rules.PUBLICADA.txt --commit
//   (o .PUBLICADA.txt e salvo pelo 00-regras-publicadas ANTES da troca)
import { readFileSync } from 'node:fs';
import { getCredential, PROJECT_ID } from './lib-admin.mjs';

const API = 'https://firebaserules.googleapis.com/v1';
const fileArg = process.argv.find(a => a.startsWith('--file='));
const ARQUIVO = fileArg ? fileArg.slice(7) : 'firestore.rules';
const COMMIT = process.argv.includes('--commit');

async function main() {
  const conteudo = readFileSync(ARQUIVO, 'utf8');
  const { access_token: tk } = await getCredential().getAccessToken();
  const H = { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' };

  const atual = await (await fetch(`${API}/projects/${PROJECT_ID}/releases/cloud.firestore`, { headers: H })).json();
  console.log(`No ar agora: ${atual.rulesetName}`);
  console.log(`Desde:       ${atual.updateTime}`);
  console.log(`Publicar:    ${ARQUIVO} (${conteudo.split('\n').length} linhas)`);
  if (!COMMIT) { console.log('\nENSAIO. Nada publicado. Rode com --commit para valer.'); return; }

  // 1. Criar o ruleset (o servidor valida a sintaxe aqui)
  const rs = await fetch(`${API}/projects/${PROJECT_ID}/rulesets`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: conteudo }] } }),
  });
  if (!rs.ok) throw new Error(`criar ruleset falhou: ${rs.status} ${await rs.text()}`);
  const ruleset = await rs.json();
  console.log(`\nRuleset criado: ${ruleset.name}`);

  // 2. Apontar o release do Firestore para ele (= publicar)
  const rel = await fetch(`${API}/projects/${PROJECT_ID}/releases/cloud.firestore`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({
      release: { name: `projects/${PROJECT_ID}/releases/cloud.firestore`, rulesetName: ruleset.name },
    }),
  });
  if (!rel.ok) throw new Error(`publicar falhou: ${rel.status} ${await rel.text()}`);

  // 3. Conferir lendo de volta
  const depois = await (await fetch(`${API}/projects/${PROJECT_ID}/releases/cloud.firestore`, { headers: H })).json();
  if (depois.rulesetName !== ruleset.name) throw new Error(`VERIFICACAO FALHOU: no ar esta ${depois.rulesetName}`);
  console.log(`PUBLICADO E VERIFICADO: ${depois.rulesetName} (${depois.updateTime})`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
```

Em `package.json`: `"secao1:publicar-regras": "node --env-file=.env.local scripts/secao1/04-publicar-regras.mjs"`.

Se a Rules API recusar o PATCH por algum motivo inesperado, o fallback é `npx firebase deploy --only firestore:rules` (pode pedir `firebase login`).

- [ ] **Step 2: Backup do que está no ar + tag de rollback**

```bash
npm run secao1:regras-publicadas
git tag pre-fase5
git push origin pre-fase5
```

Esperado: `firestore.rules.PUBLICADA.txt` (gitignorado) com a tranca provisória — é o arquivo do rollback. O veredito do script deve dizer que menciona `contas` e bloqueia superadmin (é a tranca de 09/08).

- [ ] **Step 3: A troca dos arquivos**

1. Copiar o conteúdo de `firestore.rules.definitiva` por cima de `firestore.rules`.
2. No `firestore.rules` resultante, substituir o bloco de cabeçalho (as linhas `// ⚠️ ESTE ARQUIVO NAO E O PUBLICADO ...` até `... que e exatamente o que o cadastro atual faz.`) por:

```javascript
// ✅ PUBLICADA em 10/08/2026 (Fase 5, Plano 2A) — substituiu a tranca
//    provisoria de 09/08. Pre-requisitos que permitiram a troca:
//    /api/signup (cadastro server-side), billing por contaId, /api/exame
//    (apagar/cancelar/transferir). Rollback: tag pre-fase5 +
//    scripts/secao1/04-publicar-regras.mjs --file=<backup> --commit
```

3. Apagar `firestore.rules.definitiva`.
4. `git mv tests/rules/definitiva.test.mjs tests/rules/regras.test.mjs` e, dentro dele, trocar `readFileSync('firestore.rules.definitiva', ...)` por `readFileSync('firestore.rules', ...)` (e o comentário do topo: agora ele testa A regra publicada).
5. Apagar `tests/rules/interim.test.mjs` (testava a tranca provisória, que deixa de existir; o histórico do git guarda).
6. Em `package.json`: `"test:rules": "npx firebase emulators:exec --only firestore --project leo-testes \"node --test tests/rules/regras.test.mjs\""` e **remover** `test:rules:definitiva`.

- [ ] **Step 4: Provar que a suíte segue verde no arquivo novo**

```bash
npm run test:rules && npm run test:api && npm run typecheck && npm run lint
```

Esperado: tudo verde. A suíte (ex-definitiva, com os casos da Task 4) agora prova o arquivo que vai subir.

- [ ] **Step 5: Ensaio e publicação**

```bash
npm run secao1:publicar-regras
```

Conferir o ensaio (arquivo certo, nº de linhas ≈ 230). Então:

```bash
npm run secao1:publicar-regras -- --commit
```

Esperado: `PUBLICADO E VERIFICADO: projects/leo-sistema-laudos/rulesets/...`.

- [ ] **Step 6: Verificação pós-publicação**

```bash
npm run secao1:regras-publicadas
```

Esperado: o veredito confirma a regra nova no ar (menciona `contas`, sem `if true`). Conferir que o conteúdo baixado é idêntico ao `firestore.rules` do repo:

```bash
git diff --no-index firestore.rules firestore.rules.PUBLICADA.txt
```

Esperado: sem diferenças. **Rollback, se qualquer coisa der errado em produção:**

```bash
git checkout pre-fase5 -- firestore.rules
npm run secao1:publicar-regras -- --commit
git checkout feat/secao1-plano2a -- firestore.rules
```

- [ ] **Step 7: Checklist humano (único passo que depende do Dr. Sérgio)**

Ninguém além dele tem credencial de produção. Smoke de 3 minutos em souleo.com.br:
1. Entrar → dashboard e worklist carregam (leituras pelo vínculo).
2. Abrir um laudo emitido no Histórico.
3. Abrir o Extrato (config/honorários pela regra nova).
4. Painel Direx abre e lista assinaturas (superadmin).
5. Segunda-feira: cadastro da Josilene + `npm run secao1:vincular -- --email=<dela> --conta=9PVCwndEgf9SWShFKkzf --papel=recepcao --commit`.

- [ ] **Step 8: Documentar e fechar**

No ADR (`docs/decisoes/2026-08-09-secao1-contas-e-acesso.md`), marcar a Fase 5 como `✅ FEITO 10/08/2026 (Plano 2A)` na tabela da §7 e atualizar a tabela "dois arquivos de regra" — agora existe UM arquivo, publicado, com a suíte única. Registrar decisões P1-P7 numa linha cada.

```bash
git add -A
git commit -m "feat(secao1): FASE 5 — fechadura definitiva publicada; firestore.rules e a unica fonte; suites unificadas"
git checkout master && git merge --no-ff feat/secao1-plano2a -m "feat(secao1): Plano 2A completo — a fechadura subiu" && git push origin master
```

---

## Task 6: Revisão da tríade + espelho

- [ ] **Step 1:** Rodar as três óticas sobre o diff completo do Plano 2A (`git diff pre-fase5..master` ou o range dos merges), cada uma instruída a NÃO repetir as outras:
  1. **Codex** — bugs, edge cases, segurança do diff (rotas novas, devolução, rollback do signup).
  2. **Ruflo reviewer** — arquitetura: fronteiras dos módulos `-admin`, o padrão de auth das rotas, o que ficou duplicado.
  3. **Ponytail** — o que deletar do que acabou de ser escrito (e o que já dava para deletar: `createSubscription`, `emitExame`, etc. → confirmar que fica pro Plano 3).
- [ ] **Step 2:** Achados relevantes → corrigir (regra de ouro se tocar regra) ou registrar como pendência do Plano 2B/3 no ADR.
- [ ] **Step 3:** Espelhar resumo curto no vault Obsidian (`Leo/Decisões/`), conforme AGENTS.md.

---

## Fora deste plano (registrado para não se perder)

| Item | Onde vive |
|---|---|
| Papéis na tela (`ehMedico` da Worklist não reconhece `dono` — já afeta os migrados), seletor único de local, convite por link, cadastro PJ, botão "Cancelar" no Histórico | **Plano 2B** |
| Recepção sem "Remover da fila" (P4) — se apertar na prática, é 1 linha na matriz da rota | Decisão do Sérgio pós-segunda |
| Código morto (`emitExame`, `createSubscription`, `consumirEmissao`, convites sem chamador, docs antigos de migração) | **Plano 3** |
| Auth nas rotas antigas (`/api/emitir`, `/api/corrigir-laudo` não verificam token) | **Plano 2B** (padrão já estabelecido pelo `/api/signup`) |
| Fase 6 (gaveta de segredos + Wader) | Claude da clínica, pós-Fase 5 |
| Token Feegow no histórico do git; divergência de preço memória×código | Pendências do Sérgio |
