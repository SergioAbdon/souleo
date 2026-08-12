# Plano 2B-B2 — Convite por link + gestão de membros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um dono gera um link de convite (WhatsApp), a pessoa entra na clínica (nova ou já existente, médico com CRM ou recepção), e o dono gerencia os membros (lista, edita papel/locais, revoga) — fechando a Seção 1.

**Architecture:** Tudo que toca `vinculos`/`convites`/perfil de terceiros passa por rota de servidor (Admin SDK), porque a regra tem `vinculos: if false` e o dono não lê o perfil de outro pelo cliente. A lógica pura vive em `src/lib/convite-server.ts` (sem import relativo/@, testável no emulador via `node --test`); as rotas em `src/app/api/*` só compõem auth + Storage. `convites` é uma coleção 100% servidor.

**Tech Stack:** Next.js 16 (App Router), React 19, Firebase (client + admin), Node 24 (`node --test`, type stripping), emulador Firestore+Auth (JDK 21), `@firebase/rules-unit-testing`. Sem novas dependências.

## Global Constraints

- Branch de trabalho: `feat/secao1-plano2b-b2`. Merge na `master` só ao fim, com aprovação (push na master deploya `souleo.com.br`).
- **NÃO usar `git stash`**.
- Antes de `test:rules`/`test:api`: `export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"`.
- Módulos testados por `node --test` (`src/lib/convite-server.ts`) **sem** import relativo/@ — só firebase-admin + tipos locais; dependências externas (ex.: `verificarCrm`) por parâmetro (DI).
- `tipoPerfil`: `'medico'` | `'assistente'`; **ausente = médico**. Recepção convidada nasce `'assistente'`.
- Papéis: `'dono'`, `'medico'`, `'recepcao'`. Convite só cria `'medico'` ou `'recepcao'` (nunca `'dono'`).
- **REGRA DE OURO:** mudança de regra entra com teste em `tests/rules/regras.test.mjs`.
- Convite: uso único, expira em **7 dias**; papel/locais vêm **do doc do convite**, nunca do corpo do aceite.
- `convites` é 100% servidor: `match /convites/{id} { allow read, write: if false; }`.
- Lint: nenhum erro novo nos arquivos tocados.
- A publicação da regra é a última tarefa (com ensaio + rollback).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/convite-server.ts` (criar) | `criarConvite`, `aceitarConvite`, `listarMembros`, `editarMembro`, `revogarMembro`, `cancelarConvite` — Admin SDK, sem import @/ |
| `tests/api/convite.test.mjs` (criar) | Todo o fluxo no emulador |
| `src/app/api/convite/route.ts` (criar) | POST cria convite (dono); DELETE cancela pendente (dono) |
| `src/app/api/convite/info/route.ts` (criar) | GET preview por token |
| `src/app/api/convite/aceitar/route.ts` (criar) | POST aceite (auth) |
| `src/app/api/membros/route.ts` (criar) | GET lista membros + convites pendentes (dono) |
| `src/app/api/membro/route.ts` (criar) | PATCH edita papel/locais; DELETE revoga (dono) |
| `src/app/convite/[token]/page.tsx` (criar) | Landing do convite |
| `src/components/Membros.tsx` (criar) | Tela de gestão de membros |
| `src/app/dashboard/page.tsx` (modificar) | Aba "Membros" (gate `podeGerenciarMembros`) |
| `src/lib/exame-admin.ts` (modificar) | cancelar/transferir exigem tipoPerfil médico (C7) |
| `firestore.rules` (modificar) | `convites` fechado ao cliente |
| `tests/rules/regras.test.mjs`, `tests/api/exame.test.mjs` (modificar) | Testes de regra + C7 |

---

## Task 1: `convite-server.ts` — criar e aceitar convite

**Files:**
- Create: `src/lib/convite-server.ts`
- Create: `tests/api/convite.test.mjs`

**Interfaces:**
- Consumes: Admin SDK; `verificarCrm` injetado (no-op nos testes).
- Produces:
  - `type PapelConvite = 'medico' | 'recepcao'`
  - `criarConvite(db, args): Promise<{ ok: true; token: string } | { ok: false; motivo: string }>` — `args = { contaId, criadoPor, papel: PapelConvite, locais: string[], agora: Date }`
  - `type DadosPerfilConvite = { nome?: string; email?: string; crm?: string; ufCrm?: string; especialidade?: string }`
  - `aceitarConvite(db, args): Promise<{ ok: true; contaId: string } | { ok: false; motivo: 'invalido'|'expirado'|'ja_usado'|'ja_membro'|'perfil_incompativel'|'dados_invalidos'|'erro' }>` — `args = { uid, token, dadosPerfil, verificarCrm, agora: Date }`

- [ ] **Step 1: Escrever os testes**

`tests/api/convite.test.mjs`:

```javascript
// Convite por link + aceite (Plano 2B-B2). Emulador Firestore.
import { test, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { criarConvite, aceitarConvite } from '../../src/lib/convite-server.ts';

let db;
const CONTA = 'contaConv', DONO = 'uidDonoConv';
const noop = async () => ({ status: 'nao_verificado', fonte: 'nenhum', checadoEm: null });
const HOJE = new Date('2026-08-11T12:00:00Z');
const DEPOIS = new Date('2026-08-20T12:00:00Z'); // > 7 dias

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`contas/${CONTA}`).set({ tipo: 'PJ', nome: 'Clinica Conv', ownerUid: DONO });
  await db.doc(`workspaces/wsConv`).set({ contaId: CONTA, ownerUid: DONO });
  await db.doc(`vinculos/${CONTA}_${DONO}`).set({ contaId: CONTA, medicoUid: DONO, papel: 'dono', locais: [], status: 'ativo' });
});

async function novoConvite(papel = 'medico', locais = []) {
  const r = await criarConvite(db, { contaId: CONTA, criadoPor: DONO, papel, locais, agora: HOJE });
  assert.equal(r.ok, true);
  return r.token;
}

describe('criarConvite', () => {
  test('cria doc com papel/locais/expira e uso único', async () => {
    const token = await novoConvite('recepcao', ['wsConv']);
    const c = (await db.doc(`convites/${token}`).get()).data();
    assert.equal(c.contaId, CONTA);
    assert.equal(c.papel, 'recepcao');
    assert.deepEqual(c.locais, ['wsConv']);
    assert.equal(c.usado, false);
    assert.ok(c.expiraEm.toDate() > HOJE);
  });
  test('papel invalido (dono) é recusado', async () => {
    const r = await criarConvite(db, { contaId: CONTA, criadoPor: DONO, papel: 'dono', locais: [], agora: HOJE });
    assert.equal(r.ok, false);
  });
});

describe('aceitarConvite', () => {
  test('novo médico: cria perfil (com CRM) + vínculo, marca usado', async () => {
    const token = await novoConvite('medico', []);
    const r = await aceitarConvite(db, { uid: 'uidMedNovo', token,
      dadosPerfil: { nome: 'Dra Nova', email: 'nova@x.com', crm: '111', ufCrm: 'PA' }, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, true);
    const prof = (await db.doc('profissionais/uidMedNovo').get()).data();
    assert.equal(prof.tipoPerfil, 'medico');
    assert.equal(prof.crm, '111');
    const vinc = (await db.doc(`vinculos/${CONTA}_uidMedNovo`).get()).data();
    assert.equal(vinc.papel, 'medico');
    assert.equal(vinc.status, 'ativo');
    const c = (await db.doc(`convites/${token}`).get()).data();
    assert.equal(c.usado, true);
    assert.equal(c.usadoPor, 'uidMedNovo');
  });
  test('nova recepção: perfil nasce assistente, sem exigir CRM', async () => {
    const token = await novoConvite('recepcao', []);
    const r = await aceitarConvite(db, { uid: 'uidRecNovo', token,
      dadosPerfil: { nome: 'Recep', email: 'r@x.com' }, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, true);
    assert.equal((await db.doc('profissionais/uidRecNovo').get()).data().tipoPerfil, 'assistente');
  });
  test('médico novo SEM CRM é recusado', async () => {
    const token = await novoConvite('medico', []);
    const r = await aceitarConvite(db, { uid: 'uidSemCrm', token,
      dadosPerfil: { nome: 'X', email: 'x@x.com', crm: '', ufCrm: '' }, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'dados_invalidos');
  });
  test('usuário existente: usa o perfil, só cria vínculo', async () => {
    await db.doc('profissionais/uidExistente').set({ uid: 'uidExistente', nome: 'Ja Existo', tipoPerfil: 'medico', crm: '222' });
    const token = await novoConvite('medico', []);
    const r = await aceitarConvite(db, { uid: 'uidExistente', token, dadosPerfil: {}, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, true);
    assert.equal((await db.doc('profissionais/uidExistente').get()).data().nome, 'Ja Existo');
  });
  test('assistente existente aceitando convite de MÉDICO → perfil_incompativel', async () => {
    await db.doc('profissionais/uidAssist').set({ uid: 'uidAssist', nome: 'Assist', tipoPerfil: 'assistente' });
    const token = await novoConvite('medico', []);
    const r = await aceitarConvite(db, { uid: 'uidAssist', token, dadosPerfil: {}, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'perfil_incompativel');
  });
  test('convite usado não aceita de novo', async () => {
    const token = await novoConvite('recepcao', []);
    await aceitarConvite(db, { uid: 'uidA', token, dadosPerfil: { nome: 'A', email: 'a@x.com' }, verificarCrm: noop, agora: HOJE });
    const r = await aceitarConvite(db, { uid: 'uidB', token, dadosPerfil: { nome: 'B', email: 'b@x.com' }, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'ja_usado');
  });
  test('convite expirado não aceita', async () => {
    const token = await novoConvite('recepcao', []);
    const r = await aceitarConvite(db, { uid: 'uidC', token, dadosPerfil: { nome: 'C', email: 'c@x.com' }, verificarCrm: noop, agora: DEPOIS });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'expirado');
  });
  test('já-membro não duplica', async () => {
    const token = await novoConvite('recepcao', []);
    await aceitarConvite(db, { uid: 'uidDup', token, dadosPerfil: { nome: 'D', email: 'd@x.com' }, verificarCrm: noop, agora: HOJE });
    const token2 = await novoConvite('recepcao', []);
    const r = await aceitarConvite(db, { uid: 'uidDup', token: token2, dadosPerfil: {}, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'ja_membro');
  });
  test('token inexistente → invalido', async () => {
    const r = await aceitarConvite(db, { uid: 'uidZ', token: 'naoexiste', dadosPerfil: {}, verificarCrm: noop, agora: HOJE });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'invalido');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"
npm run test:api
```

Esperado: FALHA — `Cannot find module .../convite-server.ts`.

- [ ] **Step 3: Escrever `src/lib/convite-server.ts` (criar + aceitar)**

```typescript
// ══════════════════════════════════════════════════════════════════
// LEO · Convite por link + gestão de membros (Plano 2B-B2) — Admin SDK.
// vinculos/convites têm `if false` nas regras: TODA escrita passa por aqui.
// Sem import relativo/@ (testado direto por node --test); verificarCrm por DI.
// papel/locais do vínculo vêm SEMPRE do doc do convite, nunca do cliente.
// ══════════════════════════════════════════════════════════════════
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export type PapelConvite = 'medico' | 'recepcao';
type CrmVerificacao = { status: 'nao_verificado' | 'verificado' | 'reprovado'; fonte: string; checadoEm: string | null };
type VerificarCrm = (crm: string, uf: string) => Promise<CrmVerificacao>;
export type DadosPerfilConvite = { nome?: string; email?: string; crm?: string; ufCrm?: string; especialidade?: string };

const SETE_DIAS = 7 * 864e5;

export async function criarConvite(
  db: Firestore,
  args: { contaId: string; criadoPor: string; papel: PapelConvite; locais: string[]; agora: Date },
): Promise<{ ok: true; token: string } | { ok: false; motivo: string }> {
  if (args.papel !== 'medico' && args.papel !== 'recepcao') return { ok: false, motivo: 'papel_invalido' };
  try {
    const ref = db.collection('convites').doc();
    await ref.set({
      id: ref.id, contaId: args.contaId, papel: args.papel,
      locais: Array.isArray(args.locais) ? args.locais : [],
      criadoPor: args.criadoPor, criadoEm: FieldValue.serverTimestamp(),
      expiraEm: Timestamp.fromDate(new Date(args.agora.getTime() + SETE_DIAS)),
      usado: false, usadoPor: null, usadoEm: null,
    });
    return { ok: true, token: ref.id };
  } catch (e) { console.error('criarConvite:', e); return { ok: false, motivo: 'erro' }; }
}

export async function aceitarConvite(
  db: Firestore,
  args: { uid: string; token: string; dadosPerfil: DadosPerfilConvite; verificarCrm: VerificarCrm; agora: Date },
): Promise<{ ok: true; contaId: string } | { ok: false; motivo: string }> {
  const { uid, token, dadosPerfil, verificarCrm, agora } = args;
  try {
    // A verificação de CRM (I/O) fica FORA da transação; só é usada se o perfil
    // for criado como médico. Resolvida depois de saber o papel do convite.
    const conviteSnap = await db.doc(`convites/${token}`).get();
    if (!conviteSnap.exists) return { ok: false, motivo: 'invalido' };
    const convite = conviteSnap.data()!;
    if (convite.usado) return { ok: false, motivo: 'ja_usado' };
    if ((convite.expiraEm as Timestamp).toDate() < agora) return { ok: false, motivo: 'expirado' };

    const papel = convite.papel as PapelConvite;
    const contaId = convite.contaId as string;

    const perfilSnap = await db.doc(`profissionais/${uid}`).get();
    const perfilExiste = perfilSnap.exists;
    const tipoPerfilExistente = perfilExiste ? (perfilSnap.data()!.tipoPerfil as string | undefined) : undefined;

    // Coerência papel↔perfil: convite de MÉDICO exige perfil médico (ausente ou
    // 'medico'). Assistente existente não vira médico (tipoPerfil é imutável).
    if (papel === 'medico') {
      if (perfilExiste) {
        if ((tipoPerfilExistente ?? 'medico') !== 'medico') return { ok: false, motivo: 'perfil_incompativel' };
      } else {
        if (!dadosPerfil.crm || !dadosPerfil.ufCrm || !dadosPerfil.nome) return { ok: false, motivo: 'dados_invalidos' };
      }
    } else if (!perfilExiste && !dadosPerfil.nome) {
      return { ok: false, motivo: 'dados_invalidos' };
    }

    const crmVerificacao = (!perfilExiste && papel === 'medico')
      ? await verificarCrm(dadosPerfil.crm ?? '', (dadosPerfil.ufCrm ?? '').toUpperCase())
      : { status: 'nao_verificado' as const, fonte: 'nenhum', checadoEm: null };

    const motivo = await db.runTransaction(async (t) => {
      const conv = await t.get(db.doc(`convites/${token}`));
      if (!conv.exists || conv.data()!.usado) return 'ja_usado' as const;
      const vincExistente = await t.get(db.doc(`vinculos/${contaId}_${uid}`));
      if (vincExistente.exists && vincExistente.data()!.status === 'ativo') return 'ja_membro' as const;

      if (!perfilExiste) {
        t.set(db.doc(`profissionais/${uid}`), {
          uid, nome: (dadosPerfil.nome ?? '').trim(), email: (dadosPerfil.email ?? '').trim(),
          crm: papel === 'medico' ? (dadosPerfil.crm ?? '') : '',
          ufCrm: papel === 'medico' ? (dadosPerfil.ufCrm ?? '').toUpperCase() : '',
          especialidade: dadosPerfil.especialidade ?? '',
          tipoPerfil: papel === 'medico' ? 'medico' : 'assistente',
          cpf: '', rqe: '', superadmin: false, crmVerificacao,
          criadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp(),
        });
      }
      t.set(db.doc(`vinculos/${contaId}_${uid}`), {
        id: `${contaId}_${uid}`, contaId, medicoUid: uid, papel,
        locais: Array.isArray(convite.locais) ? convite.locais : [],
        status: 'ativo', convitePor: convite.criadoPor ?? null,
        criadoEm: FieldValue.serverTimestamp(),
      });
      t.update(db.doc(`convites/${token}`), { usado: true, usadoPor: uid, usadoEm: FieldValue.serverTimestamp() });
      return 'ok' as const;
    });

    if (motivo !== 'ok') return { ok: false, motivo };
    return { ok: true, contaId };
  } catch (e) { console.error('aceitarConvite:', e); return { ok: false, motivo: 'erro' }; }
}
```

- [ ] **Step 4: Rodar até passar**

```bash
npm run test:api
```

Esperado: os testes de convite PASS (+ os existentes seguem verdes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/convite-server.ts tests/api/convite.test.mjs
git commit -m "feat(secao1): convite-server criar+aceitar convite (perfil+vinculo, papel do doc, uso unico/expiravel)"
```

---

## Task 2: Rotas do convite (criar / info / aceitar)

**Files:**
- Create: `src/app/api/convite/route.ts`
- Create: `src/app/api/convite/info/route.ts`
- Create: `src/app/api/convite/aceitar/route.ts`

**Interfaces:**
- Consumes: `criarConvite`, `aceitarConvite` (Task 1); `requireUid`, `adminDb` de `@/lib/auth-admin`; `resolverPapel` de `@/lib/exame-admin`; `verificarCrmNoOp` de `@/lib/verificar-crm`.
- Produces: `POST /api/convite`, `GET /api/convite/info?token=`, `POST /api/convite/aceitar`.

- [ ] **Step 1: `POST /api/convite` (dono cria)**

`src/app/api/convite/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';
import { criarConvite } from '@/lib/convite-server';

export const runtime = 'nodejs';

// contaId de um local do dono → confirma que quem chama é dono da conta.
async function contaDoDono(db: ReturnType<typeof adminDb>, wsId: string, uid: string) {
  const papel = await resolverPapel(db, wsId, uid);
  if (papel !== 'dono') return null;
  const ws = await db.doc(`workspaces/${wsId}`).get();
  return ws.exists ? (ws.data()!.contaId as string) : null;
}

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const { wsId, papel, locais } = await req.json();
    const db = adminDb();
    const contaId = await contaDoDono(db, wsId, uid);
    if (!contaId) return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    const r = await criarConvite(db, { contaId, criadoPor: uid, papel, locais: locais ?? [], agora: new Date() });
    if (!r.ok) return NextResponse.json(r, { status: 400 });
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.souleo.com.br';
    return NextResponse.json({ ok: true, token: r.token, link: `${base}/convite/${r.token}` });
  } catch (e) {
    console.error('API /convite:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `GET /api/convite/info` (preview por token)**

`src/app/api/convite/info/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/auth-admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ ok: false, motivo: 'invalido' }, { status: 400 });
  try {
    const db = adminDb();
    const snap = await db.doc(`convites/${token}`).get();
    if (!snap.exists) return NextResponse.json({ ok: false, motivo: 'invalido' }, { status: 404 });
    const c = snap.data()!;
    if (c.usado) return NextResponse.json({ ok: false, motivo: 'ja_usado' }, { status: 410 });
    if (c.expiraEm.toDate() < new Date()) return NextResponse.json({ ok: false, motivo: 'expirado' }, { status: 410 });
    const conta = await db.doc(`contas/${c.contaId}`).get();
    // Só o mínimo pro convidado se orientar: nome da clínica e papel. Nada sensível.
    return NextResponse.json({ ok: true, clinica: conta.data()?.nome ?? 'Clínica', papel: c.papel });
  } catch (e) {
    console.error('API /convite/info:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
```

- [ ] **Step 3: `POST /api/convite/aceitar`**

`src/app/api/convite/aceitar/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { aceitarConvite } from '@/lib/convite-server';
import { verificarCrmNoOp } from '@/lib/verificar-crm';

export const runtime = 'nodejs';
const STATUS: Record<string, number> = {
  invalido: 404, expirado: 410, ja_usado: 409, ja_membro: 409,
  perfil_incompativel: 409, dados_invalidos: 400, erro: 500,
};

export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const { token, dadosPerfil } = await req.json();
    if (!token) return NextResponse.json({ ok: false, motivo: 'invalido' }, { status: 400 });
    const r = await aceitarConvite(adminDb(), {
      uid, token, dadosPerfil: dadosPerfil ?? {}, verificarCrm: verificarCrmNoOp, agora: new Date(),
    });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[(r as { motivo: string }).motivo] ?? 500 });
  } catch (e) {
    console.error('API /convite/aceitar:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Conferir compilação**

```bash
npm run typecheck && npm run lint
```

Esperado: sem erro novo nos arquivos tocados.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/convite/
git commit -m "feat(secao1): rotas de convite (criar dono / preview / aceitar)"
```

---

## Task 3: `convite-server.ts` — gestão de membros

**Files:**
- Modify: `src/lib/convite-server.ts`
- Modify: `tests/api/convite.test.mjs`

**Interfaces:**
- Consumes: Admin SDK.
- Produces:
  - `listarMembros(db, contaId): Promise<{ membros: Array<{ uid, nome, papel, locais, status }>; pendentes: Array<{ token, papel, locais, expiraEm }> }>`
  - `editarMembro(db, args): Promise<{ ok: boolean; motivo?: string }>` — `args = { contaId, alvoUid, papel?, locais? }`
  - `revogarMembro(db, args): Promise<{ ok: boolean; motivo?: string }>` — `args = { contaId, alvoUid, donoUid }` (dono não revoga a si; não rebaixa único dono)
  - `cancelarConvite(db, args): Promise<{ ok: boolean; motivo?: string }>` — `args = { contaId, token }`

- [ ] **Step 1: Testes de gestão**

Adicionar em `tests/api/convite.test.mjs`:

```javascript
import { listarMembros, editarMembro, revogarMembro, cancelarConvite } from '../../src/lib/convite-server.ts';

describe('gestão de membros', () => {
  test('listarMembros traz membros ativos com nome + pendentes', async () => {
    await db.doc('profissionais/uidM1').set({ uid: 'uidM1', nome: 'Membro 1', tipoPerfil: 'medico' });
    await db.doc(`vinculos/${CONTA}_uidM1`).set({ contaId: CONTA, medicoUid: 'uidM1', papel: 'medico', locais: [], status: 'ativo' });
    const token = await novoConvite('recepcao', []);
    const r = await listarMembros(db, CONTA);
    const m1 = r.membros.find(m => m.uid === 'uidM1');
    assert.equal(m1.nome, 'Membro 1');
    assert.ok(r.pendentes.some(p => p.token === token));
  });
  test('editarMembro muda papel/locais', async () => {
    await db.doc(`vinculos/${CONTA}_uidE1`).set({ contaId: CONTA, medicoUid: 'uidE1', papel: 'recepcao', locais: [], status: 'ativo' });
    const r = await editarMembro(db, { contaId: CONTA, alvoUid: 'uidE1', papel: 'recepcao', locais: ['wsConv'] });
    assert.equal(r.ok, true);
    assert.deepEqual((await db.doc(`vinculos/${CONTA}_uidE1`).get()).data().locais, ['wsConv']);
  });
  test('revogarMembro inativa o vínculo', async () => {
    await db.doc(`vinculos/${CONTA}_uidR1`).set({ contaId: CONTA, medicoUid: 'uidR1', papel: 'medico', locais: [], status: 'ativo' });
    const r = await revogarMembro(db, { contaId: CONTA, alvoUid: 'uidR1', donoUid: DONO });
    assert.equal(r.ok, true);
    assert.equal((await db.doc(`vinculos/${CONTA}_uidR1`).get()).data().status, 'inativo');
  });
  test('dono NÃO revoga a si mesmo', async () => {
    const r = await revogarMembro(db, { contaId: CONTA, alvoUid: DONO, donoUid: DONO });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'nao_pode_a_si');
  });
  test('cancelarConvite marca pendente como usado (não aceitável)', async () => {
    const token = await novoConvite('recepcao', []);
    const r = await cancelarConvite(db, { contaId: CONTA, token });
    assert.equal(r.ok, true);
    assert.equal((await db.doc(`convites/${token}`).get()).data().usado, true);
  });
  test('cancelarConvite de outra conta é recusado', async () => {
    const token = await novoConvite('recepcao', []);
    const r = await cancelarConvite(db, { contaId: 'outraConta', token });
    assert.equal(r.ok, false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm run test:api
```

Esperado: os testes novos FALHAM (funções inexistentes).

- [ ] **Step 3: Implementar em `src/lib/convite-server.ts`**

```typescript
export async function listarMembros(db: Firestore, contaId: string) {
  const vincSnap = await db.collection('vinculos').where('contaId', '==', contaId).get();
  const membros = await Promise.all(vincSnap.docs
    .filter(d => d.data().status === 'ativo')
    .map(async (d) => {
      const v = d.data();
      const prof = await db.doc(`profissionais/${v.medicoUid}`).get();
      return { uid: v.medicoUid, nome: prof.data()?.nome ?? '(sem nome)', papel: v.papel, locais: v.locais ?? [], status: v.status };
    }));
  const convSnap = await db.collection('convites').where('contaId', '==', contaId).where('usado', '==', false).get();
  const agora = new Date();
  const pendentes = convSnap.docs
    .filter(d => (d.data().expiraEm as Timestamp).toDate() >= agora)
    .map(d => ({ token: d.id, papel: d.data().papel, locais: d.data().locais ?? [], expiraEm: (d.data().expiraEm as Timestamp).toDate().toISOString() }));
  return { membros, pendentes };
}

export async function editarMembro(
  db: Firestore, args: { contaId: string; alvoUid: string; papel?: PapelConvite; locais?: string[] },
): Promise<{ ok: boolean; motivo?: string }> {
  const ref = db.doc(`vinculos/${args.contaId}_${args.alvoUid}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, motivo: 'nao_encontrado' };
  if (snap.data()!.papel === 'dono') return { ok: false, motivo: 'dono_imutavel' };
  const patch: Record<string, unknown> = {};
  if (args.papel === 'medico' || args.papel === 'recepcao') patch.papel = args.papel;
  if (Array.isArray(args.locais)) patch.locais = args.locais;
  if (Object.keys(patch).length === 0) return { ok: false, motivo: 'nada_a_mudar' };
  await ref.update(patch);
  return { ok: true };
}

export async function revogarMembro(
  db: Firestore, args: { contaId: string; alvoUid: string; donoUid: string },
): Promise<{ ok: boolean; motivo?: string }> {
  if (args.alvoUid === args.donoUid) return { ok: false, motivo: 'nao_pode_a_si' };
  const ref = db.doc(`vinculos/${args.contaId}_${args.alvoUid}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, motivo: 'nao_encontrado' };
  if (snap.data()!.papel === 'dono') return { ok: false, motivo: 'dono_imutavel' };
  await ref.update({ status: 'inativo', saiu: FieldValue.serverTimestamp() });
  return { ok: true };
}

export async function cancelarConvite(
  db: Firestore, args: { contaId: string; token: string },
): Promise<{ ok: boolean; motivo?: string }> {
  const ref = db.doc(`convites/${args.token}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.contaId !== args.contaId) return { ok: false, motivo: 'nao_encontrado' };
  await ref.update({ usado: true, usadoPor: null, usadoEm: FieldValue.serverTimestamp() });
  return { ok: true };
}
```

- [ ] **Step 4: Rodar até passar**

```bash
npm run test:api
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/convite-server.ts tests/api/convite.test.mjs
git commit -m "feat(secao1): gestao de membros (listar/editar/revogar/cancelar convite) no convite-server"
```

---

## Task 4: Rotas de membros

**Files:**
- Create: `src/app/api/membros/route.ts`
- Create: `src/app/api/membro/route.ts`
- Modify: `src/app/api/convite/route.ts` (DELETE cancela pendente)

**Interfaces:**
- Consumes: `listarMembros`, `editarMembro`, `revogarMembro`, `cancelarConvite` (Task 3); `contaDoDono` (padrão da Task 2).
- Produces: `GET /api/membros?wsId=`, `PATCH /api/membro`, `DELETE /api/membro`, `DELETE /api/convite`.

- [ ] **Step 1: `GET /api/membros`**

`src/app/api/membros/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';
import { listarMembros } from '@/lib/convite-server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const wsId = req.nextUrl.searchParams.get('wsId');
    if (!wsId) return NextResponse.json({ ok: false, motivo: 'dados_invalidos' }, { status: 400 });
    const db = adminDb();
    if (await resolverPapel(db, wsId, uid) !== 'dono') return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    const contaId = (await db.doc(`workspaces/${wsId}`).get()).data()!.contaId as string;
    const r = await listarMembros(db, contaId);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('API /membros:', e);
    return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `PATCH`/`DELETE /api/membro`**

`src/app/api/membro/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, requireUid } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';
import { editarMembro, revogarMembro } from '@/lib/convite-server';

export const runtime = 'nodejs';
const STATUS: Record<string, number> = { nao_encontrado: 404, dono_imutavel: 409, nao_pode_a_si: 409, nada_a_mudar: 400 };

async function donoDaConta(req: NextRequest, uid: string) {
  const { wsId } = await req.clone().json();
  const db = adminDb();
  if (!wsId || await resolverPapel(db, wsId, uid) !== 'dono') return null;
  const contaId = (await db.doc(`workspaces/${wsId}`).get()).data()?.contaId as string | undefined;
  return contaId ? { db, contaId } : null;
}

export async function PATCH(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const ctx = await donoDaConta(req, uid);
    if (!ctx) return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    const { alvoUid, papel, locais } = await req.json();
    const r = await editarMembro(ctx.db, { contaId: ctx.contaId, alvoUid, papel, locais });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.motivo!] ?? 500 });
  } catch (e) { console.error('API /membro PATCH:', e); return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const ctx = await donoDaConta(req, uid);
    if (!ctx) return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    const { alvoUid } = await req.json();
    const r = await revogarMembro(ctx.db, { contaId: ctx.contaId, alvoUid, donoUid: uid });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.motivo!] ?? 500 });
  } catch (e) { console.error('API /membro DELETE:', e); return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 }); }
}
```

Nota: `req.clone().json()` em `donoDaConta` porque o corpo é lido de novo no handler.

- [ ] **Step 3: `DELETE /api/convite` (cancela pendente)**

Adicionar ao `src/app/api/convite/route.ts`:

```typescript
import { cancelarConvite } from '@/lib/convite-server';

export async function DELETE(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ ok: false, motivo: 'nao_autenticado' }, { status: 401 });
  try {
    const { wsId, token } = await req.json();
    const db = adminDb();
    const contaId = await contaDoDono(db, wsId, uid);
    if (!contaId) return NextResponse.json({ ok: false, motivo: 'sem_permissao' }, { status: 403 });
    const r = await cancelarConvite(db, { contaId, token });
    return NextResponse.json(r, { status: r.ok ? 200 : 404 });
  } catch (e) { console.error('API /convite DELETE:', e); return NextResponse.json({ ok: false, motivo: 'erro' }, { status: 500 }); }
}
```

- [ ] **Step 4: Conferir e commitar**

```bash
npm run typecheck && npm run lint
```

```bash
git add src/app/api/membros/ src/app/api/membro/ src/app/api/convite/route.ts
git commit -m "feat(secao1): rotas de gestao de membros (listar/editar/revogar/cancelar convite)"
```

---

## Task 5: `convites` fechado ao cliente + `exame-admin` exige tipoPerfil (C7)

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/rules/regras.test.mjs`
- Modify: `src/lib/exame-admin.ts`
- Modify: `tests/api/exame.test.mjs`

**Interfaces:**
- Consumes: `resolverPapel`, `carregar` (exame-admin).
- Produces: regra `convites` fechada; `cancelarExame`/`transferirExame` exigem tipoPerfil médico no braço do médico.

- [ ] **Step 1: Regra `convites` + teste**

Em `firestore.rules`, antes de `match /{document=**}`, adicionar:

```
    // ── CONVITES ── 100% servidor (Admin SDK). O cliente nunca le o token nem
    // cria/aceita pelo navegador: convite e aceite passam por /api/convite.
    match /convites/{conviteId} {
      allow read, write: if false;
    }
```

Em `tests/rules/regras.test.mjs`, no seed do `before` criar um convite real:

```javascript
    await setDoc(doc(db, 'convites', 'conv1'), { contaId: CONTA_A, papel: 'medico', locais: [], usado: false });
```

E adicionar um `describe`:

```javascript
describe('13. convites sao 100% servidor', () => {
  test('cliente NAO le convite (nem com o token)', async () => {
    await assertFails(getDoc(doc(como(DR_A), 'convites', 'conv1')));
  });
  test('cliente NAO cria convite', async () => {
    await assertFails(setDoc(doc(como(DR_A), 'convites', 'forjado'), { contaId: CONTA_A, papel: 'dono', locais: [], usado: false }));
  });
  test('cliente NAO marca convite usado', async () => {
    await assertFails(updateDoc(doc(como(DR_A), 'convites', 'conv1'), { usado: true }));
  });
});
```

- [ ] **Step 2: C7 — teste do tipoPerfil em cancelar/transferir**

Em `tests/api/exame.test.mjs`, o seed já tem atores; adicionar um médico-de-papel-mas-assistente e um teste. No `before` (ou beforeEach de seed), garantir:

```javascript
  // Vinculo papel:'medico' mas perfil assistente — nao deveria cancelar (C7).
  await db.doc(`vinculos/${CONTA}_uidFalsoMed`).set({ contaId: CONTA, medicoUid: 'uidFalsoMed', papel: 'medico', locais: [], status: 'ativo' });
  await db.doc('profissionais/uidFalsoMed').set({ uid: 'uidFalsoMed', nome: 'Falso', tipoPerfil: 'assistente' });
```

Adicionar teste no `describe('cancelar', ...)`:

```javascript
  test('papel medico mas tipoPerfil assistente NAO cancela (C7)', async () => {
    await seedEmitido('emC7');
    await db.doc(`workspaces/${WS}/exames/emC7`).update({ medicoUid: 'uidFalsoMed' });
    const r = await cancelarExame(db, { wsId: WS, exameId: 'emC7', uid: 'uidFalsoMed', motivo: 'x', subRef: subRef(), apagarPdf });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'sem_permissao');
  });
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"
npm run test:rules && npm run test:api
```

Esperado: o teste de regra dos convites já passa (a coleção não existia → negava por `if false` do coringa, mas agora tem regra própria — segue negando); o teste C7 do exame FALHA (hoje só olha papel).

- [ ] **Step 4: Implementar C7 no `exame-admin.ts`**

Adicionar um helper (perto de `resolverPapel`):

```typescript
// Ato medico = perfil medico (tipoPerfil ausente ou 'medico'). Espelha
// ehMedicoDeVerdade da regra e o gate do /api/emitir.
export async function ehMedicoDeVerdade(db: Firestore, uid: string): Promise<boolean> {
  const p = await db.doc(`profissionais/${uid}`).get();
  return (p.data()?.tipoPerfil ?? 'medico') === 'medico';
}
```

Em `cancelarExame`, trocar a linha do `pode`:

```typescript
  const pode = papel === 'dono'
    || (papel === 'medico' && exame.medicoUid === p.uid && await ehMedicoDeVerdade(db, p.uid));
```

Em `transferirExame`, no gate do solicitante, aplicar a mesma exigência para o braço do médico (o dono segue livre). Localizar o `const pode = papel === 'dono' || (papel === 'medico' && medicoAlcanca(exame, p.uid));` e trocar por:

```typescript
  const pode = papel === 'dono'
    || (papel === 'medico' && medicoAlcanca(exame, p.uid) && await ehMedicoDeVerdade(db, p.uid));
```

- [ ] **Step 5: Rodar até passar**

```bash
npm run test:rules && npm run test:api
```

Esperado: todos PASS.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/rules/regras.test.mjs src/lib/exame-admin.ts tests/api/exame.test.mjs
git commit -m "fix(seguranca): convites 100% servidor; cancelar/transferir exigem tipoPerfil medico (C7)"
```

---

## Task 6: Landing do convite + cadastro via link

**Files:**
- Create: `src/app/convite/[token]/page.tsx`

**Interfaces:**
- Consumes: `/api/convite/info`, `/api/convite/aceitar`.
- Produces: página `/convite/[token]` que faz login/cadastro e aceita.

- [ ] **Step 1: Página `src/app/convite/[token]/page.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';

export default function ConvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<{ clinica: string; papel: string } | null>(null);
  const [erro, setErro] = useState('');
  const [modo, setModo] = useState<'login' | 'cadastro'>('login');
  const [email, setEmail] = useState(''); const [senha, setSenha] = useState('');
  const [nome, setNome] = useState(''); const [crm, setCrm] = useState(''); const [uf, setUf] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/convite/info?token=${token}`).then(r => r.json()).then(d => {
      if (d.ok) setInfo({ clinica: d.clinica, papel: d.papel });
      else setErro(d.motivo === 'expirado' ? 'Este convite expirou.' : d.motivo === 'ja_usado' ? 'Este convite já foi usado.' : 'Convite inválido.');
    }).catch(() => setErro('Não foi possível carregar o convite.'));
  }, [token]);

  async function aceitar(idToken: string, dadosPerfil: Record<string, string>) {
    const res = await fetch('/api/convite/aceitar', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ token, dadosPerfil }),
    });
    const d = await res.json();
    if (!d.ok) {
      setErro(d.motivo === 'ja_membro' ? 'Você já faz parte dessa clínica.'
        : d.motivo === 'perfil_incompativel' ? 'Seu perfil não é de médico — peça um convite de recepção.'
        : d.motivo === 'dados_invalidos' ? 'Preencha nome e, se médico, CRM/UF.'
        : 'Não foi possível aceitar o convite.');
      await auth.signOut().catch(() => {});
      return;
    }
    router.push('/dashboard');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setLoading(true);
    try {
      const ehMedico = info?.papel === 'medico';
      if (modo === 'login') {
        const cred = await signInWithEmailAndPassword(auth, email, senha);
        if (!cred.user.emailVerified) { setErro('Verifique seu email antes de entrar.'); await auth.signOut(); setLoading(false); return; }
        await aceitar(await cred.user.getIdToken(), {});
      } else {
        if (!nome || (ehMedico && (!crm || !uf))) { setErro('Preencha nome e, se médico, CRM/UF.'); setLoading(false); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, senha);
        await aceitar(await cred.user.getIdToken(), { nome, email, crm, ufCrm: uf.toUpperCase() });
        await sendEmailVerification(cred.user).catch(() => {});
      }
    } catch { setErro('Confira email e senha.'); }
    setLoading(false);
  }

  if (erro && !info) return <div className="min-h-screen flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow p-8 text-center max-w-sm"><p className="text-4xl">🔗</p><p className="text-sm text-gray-600 mt-3">{erro}</p></div></div>;
  if (!info) return <div className="min-h-screen flex items-center justify-center"><span className="text-4xl animate-pulse">🫀</span></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-[#1E3A5F] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
        <h1 className="text-lg font-bold text-[#1E3A5F]">Convite para {info.clinica}</h1>
        <p className="text-sm text-gray-500 mb-4">Você entra como <b>{info.papel === 'medico' ? 'médico' : 'recepção'}</b>.</p>
        <div className="flex gap-2 mb-4 text-sm">
          <button onClick={() => setModo('login')} className={`flex-1 py-2 rounded-lg ${modo === 'login' ? 'bg-[#1E3A5F] text-white' : 'border'}`}>Já tenho conta</button>
          <button onClick={() => setModo('cadastro')} className={`flex-1 py-2 rounded-lg ${modo === 'cadastro' ? 'bg-[#1E3A5F] text-white' : 'border'}`}>Criar conta</button>
        </div>
        {erro && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-3">{erro}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          {modo === 'cadastro' && <input placeholder="Nome completo" value={nome} onChange={e => setNome(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />}
          {modo === 'cadastro' && info.papel === 'medico' && (
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="CRM" value={crm} onChange={e => setCrm(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
              <input placeholder="UF" maxLength={2} value={uf} onChange={e => setUf(e.target.value.toUpperCase())} className="border rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          <input type="password" placeholder="Senha" value={senha} onChange={e => setSenha(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" required />
          <button type="submit" disabled={loading} className="w-full bg-[#1E3A5F] text-white py-3 rounded-lg font-semibold text-sm disabled:opacity-50">
            {loading ? 'Entrando...' : 'Entrar na clínica'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Nota sobre o cadastro via convite**

O cadastro pela landing do convite **não** usa `/api/signup` (que cria conta PF nova) — usa `/api/convite/aceitar`, que cria só o perfil + vínculo (C3). A tela de login (`login/page.tsx`) **não muda** para este fluxo; a landing é auto-suficiente. (Não há edição em `login/page.tsx` nesta task; o item do arquivo na tabela era precaução — remover da lista mental se não for tocado.)

- [ ] **Step 3: Verificar no navegador**

```bash
npm run dev
```

Abrir `http://localhost:3000/convite/tokenqualquer` → deve mostrar "Convite inválido" (token não existe) sem erro de console. `npm run typecheck && npm run lint` limpos.

- [ ] **Step 4: Commit**

```bash
git add src/app/convite/
git commit -m "feat(secao1): landing do convite (/convite/[token]) — login ou cadastro e aceita"
```

---

## Task 7: Aba "Membros" no dashboard

**Files:**
- Create: `src/components/Membros.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `/api/membros`, `/api/convite`, `/api/membro`; `useAuth()` (`workspace`, `papel`, `user`); `podeGerenciarMembros` de `@/lib/permissoes`.
- Produces: aba "Membros" (só dono) com lista + convidar + editar + revogar.

- [ ] **Step 1: Criar `src/components/Membros.tsx`**

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type Membro = { uid: string; nome: string; papel: string; locais: string[]; status: string };
type Pendente = { token: string; papel: string; locais: string[]; expiraEm: string };

export default function Membros() {
  const { workspace, user, contextos } = useAuth();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState('');
  const [papelConvite, setPapelConvite] = useState<'medico' | 'recepcao'>('medico');
  const locaisDaConta = contextos.map(c => ({ id: c.workspace.id, nome: (c.workspace.nomeClinica as string) || 'Local' }));

  const token = useCallback(async () => (await user?.getIdToken()) || '', [user]);

  const carregar = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    const res = await fetch(`/api/membros?wsId=${workspace.id}`, { headers: { Authorization: `Bearer ${await token()}` } });
    const d = await res.json();
    if (d.ok) { setMembros(d.membros); setPendentes(d.pendentes); }
    setLoading(false);
  }, [workspace?.id, token]);

  useEffect(() => { carregar(); }, [carregar]);

  async function convidar() {
    const res = await fetch('/api/convite', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ wsId: workspace!.id, papel: papelConvite, locais: [] }),
    });
    const d = await res.json();
    if (d.ok) { setLink(d.link); carregar(); } else alert('Não foi possível gerar o convite.');
  }

  async function revogar(alvoUid: string) {
    if (!confirm('Remover este membro?')) return;
    const res = await fetch('/api/membro', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ wsId: workspace!.id, alvoUid }),
    });
    const d = await res.json();
    if (d.ok) carregar(); else alert(d.motivo === 'nao_pode_a_si' ? 'Você não pode se remover.' : 'Não foi possível remover.');
  }

  async function cancelarPendente(tok: string) {
    const res = await fetch('/api/convite', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ wsId: workspace!.id, token: tok }),
    });
    if ((await res.json()).ok) carregar();
  }

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Carregando membros...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold text-[#1E3A5F] mb-2">Convidar</h3>
        <div className="flex gap-2 items-center">
          <select value={papelConvite} onChange={e => setPapelConvite(e.target.value as 'medico' | 'recepcao')} className="border rounded-lg px-3 py-2 text-sm">
            <option value="medico">Médico</option>
            <option value="recepcao">Recepção</option>
          </select>
          <button onClick={convidar} className="bg-[#1E3A5F] text-white px-4 py-2 rounded-lg text-sm font-semibold">Gerar link</button>
        </div>
        {link && (
          <div className="mt-2 bg-blue-50 p-3 rounded-lg text-xs break-all">
            <p className="text-gray-500 mb-1">Mande este link no WhatsApp (vale 7 dias, uso único):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1">{link}</code>
              <button onClick={() => navigator.clipboard?.writeText(link)} className="text-blue-600 font-semibold shrink-0">Copiar</button>
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="font-bold text-[#1E3A5F] mb-2">Membros ({membros.length})</h3>
        <div className="space-y-1">
          {membros.map(m => (
            <div key={m.uid} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
              <div><span className="font-semibold">{m.nome}</span> <span className="text-xs text-gray-400 uppercase">· {m.papel}</span></div>
              {m.papel !== 'dono' && <button onClick={() => revogar(m.uid)} className="text-xs text-red-600 hover:underline">Remover</button>}
            </div>
          ))}
        </div>
      </div>

      {pendentes.length > 0 && (
        <div>
          <h3 className="font-bold text-[#1E3A5F] mb-2">Convites pendentes ({pendentes.length})</h3>
          <div className="space-y-1">
            {pendentes.map(p => (
              <div key={p.token} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm bg-amber-50">
                <span className="text-xs">{p.papel === 'medico' ? 'Médico' : 'Recepção'} · expira {new Date(p.expiraEm).toLocaleDateString('pt-BR')}</span>
                <button onClick={() => cancelarPendente(p.token)} className="text-xs text-red-600 hover:underline">Cancelar</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

(YAGNI: editar papel/locais de membro pela tela fica como botão futuro — a rota `PATCH /api/membro` já existe e é testada; a UI de edição inline entra quando o Dr. Sérgio pedir. A lista + convidar + revogar + cancelar pendente é o núcleo. Registrar no ADR.)

- [ ] **Step 2: Aba no dashboard (só dono)**

Em `src/app/dashboard/page.tsx`, importar `Membros` e `podeGerenciarMembros`, trazer `papel` do `useAuth()`, e adicionar a aba condicionada (junto das abas worklist/historico/extrato). Adicionar `'membros'` ao tipo `Tab`:

```typescript
import Membros from '@/components/Membros';
import { podeVerFinanceiro, podeGerenciarMembros } from '@/lib/permissoes';
```

```typescript
type Tab = 'worklist' | 'historico' | 'extrato' | 'membros';
```

Botão da aba (após o de Extrato):

```tsx
              {podeGerenciarMembros(papel) && (
                <button onClick={() => setTab('membros')}
                  className={`py-3 px-4 text-sm font-semibold transition border-b-2 ${tabRaw === 'membros' ? 'text-[#1E3A5F] border-[#1E3A5F]' : 'text-gray-400 border-transparent'}`}>
                  👥 Membros
                </button>
              )}
```

Corpo:

```tsx
              {tab === 'membros' && podeGerenciarMembros(papel) && <Membros />}
```

E incluir `membros` no reset de aba órfã (o valor derivado `tab`): estender a guarda para também cair pra 'worklist' se `tabRaw === 'membros' && !podeGerenciarMembros(papel)`:

```typescript
  const tab: Tab = (tabRaw === 'extrato' && !podeVerFinanceiro(papel)) || (tabRaw === 'membros' && !podeGerenciarMembros(papel))
    ? 'worklist' : tabRaw;
```

- [ ] **Step 3: Verificar no navegador**

```bash
npm run dev
```

Logado como dono (conta Yahoo): a aba "👥 Membros" aparece, lista os membros e gera link. `npm run typecheck && npm run lint` limpos.

- [ ] **Step 4: Commit**

```bash
git add src/components/Membros.tsx src/app/dashboard/page.tsx
git commit -m "feat(secao1): aba Membros do dono (lista, convidar por link, revogar, cancelar pendente)"
```

---

## Task 8: Integração, ADR, merge, republicar

**Files:**
- Modify: `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md` (registrar 2B-B2 + fechamento da Seção 1)

- [ ] **Step 1: Rodar tudo**

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"
npm run test:unit && npm run test:api && npm run test:rules && npm run typecheck && npm run lint
```

Esperado: unit, api, rules verdes; typecheck limpo; lint sem erro novo.

- [ ] **Step 2: ADR**

Acrescentar `### 8.6 Plano 2B-B2 — convite + gestão de membros (Seção 1 FECHADA)` com: convite por link (7 dias, uso único, papel/locais do doc); aceite novo/existente (médico com CRM, recepção assistente, só o vínculo); gestão (listar/revogar/cancelar; editar papel/locais via rota, UI inline pendente); `convites` 100% servidor; C7 (cancelar/transferir exigem tipoPerfil médico). Marcar a **Seção 1 concluída** e listar os follow-ups que sobrevivem (provedor real de CRM; unicidade CNPJ; e-mail vs Auth; Fase 6; Plano 3 limpeza).

- [ ] **Step 3: Commit, push, merge (com aprovação do Dr. Sérgio)**

```bash
git add docs/decisoes/2026-08-09-secao1-contas-e-acesso.md
git commit -m "docs(ADR): Plano 2B-B2 concluido — convite + gestao de membros; Secao 1 fechada"
git push origin feat/secao1-plano2b-b2
git checkout master && git merge --no-ff feat/secao1-plano2b-b2 -m "feat(secao1): Plano 2B-B2 — convite por link + gestao de membros (Secao 1 fechada)" && git push origin master
```

- [ ] **Step 4: Republicar as regras (mudou `convites`)**

```bash
npm run secao1:publicar-regras
```

Conferir o ensaio. Então:

```bash
npm run secao1:publicar-regras -- --commit
npm run secao1:regras-publicadas
```

Esperado: `PUBLICADO E VERIFICADO`. Conferir `git diff --no-index firestore.rules firestore.rules.PUBLICADA.txt` = sem diferenças. Rollback: tag `pre-fase5` + `--file=<backup>`.

- [ ] **Step 5: Verificar o deploy**

```bash
curl -sL -o /dev/null -w '%{http_code}\n' https://www.souleo.com.br/convite/x
```

Esperado: `200` (a página carrega e mostra "convite inválido"). Smoke humano (Dr. Sérgio): na conta Yahoo, aba Membros → gerar link → abrir o link numa aba anônima e ver o preview.

---

## Fora deste plano

| Item | Onde |
|---|---|
| UI inline de editar papel/locais de membro (rota `PATCH /api/membro` já existe/testada) | Follow-up quando pedido |
| Ligar provedor real de verificação de CRM | Follow-up (Consultar.IO/CFM) |
| Unicidade de CNPJ sob corrida + dígitos; e-mail do corpo vs Auth | Follow-up de segurança |
| Fase 6 (segredos + Wader) | Claude da clínica |
| Código morto + fallbacks legados + dedup signup | **Plano 3** |
