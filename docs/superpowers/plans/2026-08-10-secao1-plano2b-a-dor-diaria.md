# Plano 2B-A — Dor diária Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao LEO um fluxo de entrada por local (aviso "conta sem local" / entrar direto / escolher entre 2+), um seletor único de local que alimenta todas as telas, papéis que escondem o que cada um não pode, e fechar a última rota aberta (`/api/corrigir-laudo`).

**Architecture:** O `AuthContext` vira a fonte única do "local ativo" (já tem `contextos[]` e `selecionarContexto`). Um módulo puro `src/lib/permissoes.ts` (sem I/O, testável por `node --test`) concentra as decisões de UI — quem vê/faz o quê (matriz §4 do ADR) e o modo de entrada por quantidade de locais. As telas leem o local do contexto em vez de guardar o próprio `wsIdSel`, e consultam `permissoes.ts` antes de renderizar ações. A rota de correção passa a usar o `requireUid`/`resolverPapel` que o Plano 2A já criou.

**Tech Stack:** Next.js 16 (App Router), React 19, Firebase (client + admin), Node 24 (`node --test`, type stripping), TypeScript. Sem novas dependências.

## Global Constraints

- Branch de trabalho: `feat/secao1-plano2b-a`. Merge na `master` só ao fim, com aprovação (push na master deploya `souleo.com.br`).
- **NÃO usar `git stash`** (daemon `.claude-flow` engole edições).
- Módulos testados por `node --test` (`src/lib/permissoes.ts`) **não podem** ter import relativo nem alias `@/` — só tipos locais/pacotes. Componentes que os consomem usam `@/` normalmente.
- Antes de `npm run test:*`: `export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"` (o emulador precisa de JDK; o `test:unit` não, mas manter o hábito).
- Papéis válidos, exatamente: `'dono'`, `'medico'`, `'recepcao'`. `tipoPerfil` do perfil: `'medico'` | `'assistente'`; **ausente conta como `'medico'`** (default do resto do app — não travar perfis antigos, lição do apagão de 09/08).
- Local é **contexto de sessão**: a escolha vive em memória do `AuthContext`, **sem localStorage**. Reload/relogin recomeça o fluxo.
- Lint: o repo tem ~140 erros pré-existentes; o critério é **nenhum erro novo** nos arquivos tocados.
- A fechadura no banco é a trava real; a UI só deixa de oferecer o caminho.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/permissoes.ts` (criar) | Funções puras: `ehMedico`, `podeEditarLaudo`, `podeVerFinanceiro`, `podeEditarLocal`, `podeGerenciarMembros`, `podeRemoverDaFila`, e `modoEntrada`. Sem I/O, sem import `@/`. |
| `tests/unit/permissoes.test.mjs` (criar) | Testa a matriz inteira + `modoEntrada`. `node --test`, sem emulador. |
| `src/contexts/AuthContext.tsx` (modificar) | Ganha `localAtivo`, `precisaEscolher`, `semLocal`, `papel`, `selecionarLocal`. Usa `modoEntrada`. |
| `src/components/EscolherLocalGate.tsx` (criar) | Barreira pós-login: "conta sem local" (0) / "qual local hoje?" (2+); deixa passar quando há local ativo. |
| `src/components/SeletorLocal.tsx` (criar) | Seletor do topo (só com 2+ locais). |
| `src/app/dashboard/page.tsx` (modificar) | Monta `SeletorLocal` no topo e envolve o conteúdo no `EscolherLocalGate`. |
| `src/components/Worklist.tsx` (modificar) | Botões via `permissoes.ts` (corrige o gate `role==='medico'`). |
| `src/components/Historico.tsx` (modificar) | Remove `wsIdSel` próprio → lê do contexto; botões via `permissoes.ts`. |
| `src/components/Extrato.tsx` (modificar) | Remove `wsIdSel` próprio → lê do contexto; gate de acesso via `permissoes.ts`. |
| `src/app/api/corrigir-laudo/route.ts` (modificar) | `requireUid` + `resolverPapel`; 401/403. |
| `src/app/laudo/[id]/page.tsx` (modificar) | `handleCorrigirLaudo` manda `Authorization: Bearer`. |
| `package.json` (modificar) | Script `test:unit`. |

---

## Task 1: Módulo puro de permissões e modo de entrada

**Files:**
- Create: `src/lib/permissoes.ts`
- Create: `tests/unit/permissoes.test.mjs`
- Modify: `package.json` (script `test:unit`)

**Interfaces:**
- Consumes: nada (módulo puro).
- Produces:
  - `type Papel = 'dono' | 'medico' | 'recepcao'`
  - `ehMedico(perfil: { tipoPerfil?: string } | null | undefined): boolean`
  - `podeEditarLaudo(perfil, exame: { medicoUid?: string } | null | undefined, uid: string): boolean`
  - `podeVerFinanceiro(papel: Papel | null | undefined): boolean`
  - `podeEditarLocal(papel): boolean`
  - `podeGerenciarMembros(papel): boolean`
  - `podeRemoverDaFila(papel): boolean`
  - `modoEntrada(qtdLocais: number): 'sem-local' | 'entrar' | 'escolher'`

- [ ] **Step 1: Escrever o teste**

`tests/unit/permissoes.test.mjs`:

```javascript
// Matriz de permissoes da UI (espelha §4 do ADR) + modo de entrada por local.
// Puro, sem emulador: node --test tests/unit/*.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ehMedico, podeEditarLaudo, podeVerFinanceiro, podeEditarLocal,
  podeGerenciarMembros, podeRemoverDaFila, modoEntrada,
} from '../../src/lib/permissoes.ts';

describe('ehMedico', () => {
  test('perfil medico', () => assert.equal(ehMedico({ tipoPerfil: 'medico' }), true));
  test('assistente NAO e medico', () => assert.equal(ehMedico({ tipoPerfil: 'assistente' }), false));
  test('tipoPerfil ausente conta como medico (perfis antigos)', () => {
    assert.equal(ehMedico({}), true);
    assert.equal(ehMedico(null), true);
  });
});

describe('podeEditarLaudo (perfil medico + autoria)', () => {
  const medico = { tipoPerfil: 'medico' };
  const assist = { tipoPerfil: 'assistente' };
  test('medico autor edita', () => assert.equal(podeEditarLaudo(medico, { medicoUid: 'u1' }, 'u1'), true));
  test('medico NAO autor nao edita', () => assert.equal(podeEditarLaudo(medico, { medicoUid: 'u2' }, 'u1'), false));
  test('medico assume exame sem autor', () => assert.equal(podeEditarLaudo(medico, {}, 'u1'), true));
  test('assistente nunca edita, mesmo autor', () => assert.equal(podeEditarLaudo(assist, { medicoUid: 'u1' }, 'u1'), false));
  test('dono-medico (autor) edita', () => assert.equal(podeEditarLaudo({ tipoPerfil: 'medico' }, { medicoUid: 'dono1' }, 'dono1'), true));
});

describe('gates por papel', () => {
  test('financeiro: dono e medico sim, recepcao nao', () => {
    assert.equal(podeVerFinanceiro('dono'), true);
    assert.equal(podeVerFinanceiro('medico'), true);
    assert.equal(podeVerFinanceiro('recepcao'), false);
    assert.equal(podeVerFinanceiro(null), false);
  });
  test('editar local: so dono', () => {
    assert.equal(podeEditarLocal('dono'), true);
    assert.equal(podeEditarLocal('medico'), false);
    assert.equal(podeEditarLocal('recepcao'), false);
  });
  test('gerenciar membros: so dono', () => {
    assert.equal(podeGerenciarMembros('dono'), true);
    assert.equal(podeGerenciarMembros('medico'), false);
  });
  test('remover da fila: dono/medico sim, recepcao nao (P4)', () => {
    assert.equal(podeRemoverDaFila('dono'), true);
    assert.equal(podeRemoverDaFila('medico'), true);
    assert.equal(podeRemoverDaFila('recepcao'), false);
  });
});

describe('modoEntrada', () => {
  test('0 locais → sem-local', () => assert.equal(modoEntrada(0), 'sem-local'));
  test('1 local → entrar', () => assert.equal(modoEntrada(1), 'entrar'));
  test('2+ locais → escolher', () => {
    assert.equal(modoEntrada(2), 'escolher');
    assert.equal(modoEntrada(5), 'escolher');
  });
});
```

- [ ] **Step 2: Registrar o script e rodar para ver falhar**

Adicionar em `package.json` `"scripts"` (manter os existentes):

```json
"test:unit": "node --test tests/unit/*.test.mjs"
```

```bash
npm run test:unit
```

Esperado: FALHA — `Cannot find module .../permissoes.ts`.

- [ ] **Step 3: Escrever `src/lib/permissoes.ts`**

```typescript
// ══════════════════════════════════════════════════════════════════
// LEO · Permissoes de UI (Plano 2B-A) — a matriz §4 do ADR em codigo puro.
// A FECHADURA no Firestore e a trava real; isto so decide o que a tela
// OFERECE. Sem I/O, sem import @/ — testado direto por node --test.
// ══════════════════════════════════════════════════════════════════
export type Papel = 'dono' | 'medico' | 'recepcao';

type PerfilLite = { tipoPerfil?: string } | null | undefined;
type ExameLite = { medicoUid?: string } | null | undefined;

// tipoPerfil ausente conta como medico: e o default do resto do app e nao
// pode travar perfis antigos sem o campo (licao do apagao de cadastro 09/08).
export function ehMedico(perfil: PerfilLite): boolean {
  return (perfil?.tipoPerfil ?? 'medico') !== 'assistente';
}

// Assinar/editar laudo = ser medico de perfil E ser o autor (ou exame sem autor).
// NAO depende do papel administrativo — corrige o gate antigo `role==='medico'`
// que escondia o botao do dono-medico (papel 'dono').
export function podeEditarLaudo(perfil: PerfilLite, exame: ExameLite, uid: string): boolean {
  if (!ehMedico(perfil)) return false;
  const autor = exame?.medicoUid;
  return !autor || autor === uid;
}

export function podeVerFinanceiro(papel: Papel | null | undefined): boolean {
  return papel === 'dono' || papel === 'medico';
}
export function podeEditarLocal(papel: Papel | null | undefined): boolean {
  return papel === 'dono';
}
export function podeGerenciarMembros(papel: Papel | null | undefined): boolean {
  return papel === 'dono';
}
// Recepcao nao remove exame da fila (P4 do Plano 2A).
export function podeRemoverDaFila(papel: Papel | null | undefined): boolean {
  return papel === 'dono' || papel === 'medico';
}

// Fluxo de entrada por quantidade de locais acessiveis (A2 do spec).
export function modoEntrada(qtdLocais: number): 'sem-local' | 'entrar' | 'escolher' {
  if (qtdLocais <= 0) return 'sem-local';
  if (qtdLocais === 1) return 'entrar';
  return 'escolher';
}
```

- [ ] **Step 4: Rodar até passar**

```bash
npm run test:unit
```

Esperado: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissoes.ts tests/unit/permissoes.test.mjs package.json
git commit -m "feat(secao1): modulo puro de permissoes de UI + modo de entrada (matriz §4)"
```

---

## Task 2: AuthContext vira a fonte única do local ativo

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

**Interfaces:**
- Consumes: `modoEntrada` de `@/lib/permissoes`; `type Papel` de `@/lib/contas`.
- Produces (novos campos em `useAuth()`): `localAtivo: Contexto | null`, `precisaEscolher: boolean`, `semLocal: boolean`, `papel: Papel | undefined`, `selecionarLocal(wsId: string): void`. `selecionarContexto` continua existindo e passa a limpar `precisaEscolher`.

- [ ] **Step 1: Estender o tipo `AuthState` e o `createContext`**

Em `src/contexts/AuthContext.tsx`, no `type AuthState` (após `contextos: Contexto[];`) adicionar:

```typescript
  localAtivo: Contexto | null;
  precisaEscolher: boolean;
  semLocal: boolean;
  papel?: Papel;
```

E em `selecionarContexto: (ctx: Contexto) => void;` acrescentar logo abaixo:

```typescript
  selecionarLocal: (wsId: string) => void;
```

No `createContext({...})`, acrescentar os defaults (mantendo os existentes):

```typescript
  localAtivo: null, precisaEscolher: false, semLocal: false,
  selecionarLocal: () => {},
```

- [ ] **Step 2: Adicionar estado e trocar a auto-seleção pelo `modoEntrada`**

Adicionar o import no topo:

```typescript
import { modoEntrada } from '@/lib/permissoes';
```

Adicionar os estados novos (junto aos outros `useState`):

```typescript
  const [localAtivo, setLocalAtivo] = useState<Contexto | null>(null);
  const [precisaEscolher, setPrecisaEscolher] = useState(false);
  const [semLocal, setSemLocal] = useState(false);
```

No `onAuthStateChanged`, existem HOJE dois pontos que decidem a entrada:
o bloco novo (`if (ctxNovos.length > 0 && legadoDescoberto.length === 0)`) e o
bloco legado (`if (ctxs.length === 1) selecionarContexto(ctxs[0]);`). Trocar a
decisão dos DOIS por `aplicarEntrada(...)`. Primeiro, definir a função logo antes
do `return (` do provider:

```typescript
  // Decide a entrada a partir dos locais acessiveis (A2 do spec):
  // 0 → aviso "conta sem local"; 1 → entra direto; 2+ → escolher.
  function aplicarEntrada(ctxs: Contexto[]) {
    setSemLocal(false);
    setPrecisaEscolher(false);
    const modo = modoEntrada(ctxs.length);
    if (modo === 'sem-local') setSemLocal(true);
    else if (modo === 'entrar') selecionarContexto(ctxs[0]);
    else setPrecisaEscolher(true);   // 2+: NAO auto-seleciona
  }
```

No bloco novo, substituir:

```typescript
            if (ctxNovos.length > 0 && legadoDescoberto.length === 0) {
              setContextos(ctxNovos);
              if (ctxNovos.length === 1) selecionarContexto(ctxNovos[0]);
              setLoading(false);
              return;
            }
```

por:

```typescript
            if (ctxNovos.length > 0 && legadoDescoberto.length === 0) {
              setContextos(ctxNovos);
              aplicarEntrada(ctxNovos);
              setLoading(false);
              return;
            }
```

No bloco legado, substituir:

```typescript
          setContextos(ctxs);

          // Auto-selecionar se só tem 1 contexto
          if (ctxs.length === 1) {
            selecionarContexto(ctxs[0]);
          }
```

por:

```typescript
          setContextos(ctxs);
          aplicarEntrada(ctxs);
```

No ramo do `else` (usuário deslogado, `setContextos([])`) acrescentar a limpeza dos novos estados:

```typescript
        setContextos([]);
        setLocalAtivo(null);
        setPrecisaEscolher(false);
        setSemLocal(false);
```

- [ ] **Step 3: `selecionarContexto` grava o `localAtivo` e limpa `precisaEscolher`; criar `selecionarLocal`**

Substituir a função `selecionarContexto` atual por:

```typescript
  function selecionarContexto(ctx: Contexto) {
    setWorkspace(ctx.workspace);
    setMembership(ctx.membership);
    setSubscription(ctx.subscription);
    setLocalAtivo(ctx);
    setPrecisaEscolher(false);
    setSemLocal(false);
  }

  // Troca o local ativo pelo id do workspace (seletor do topo / gate de escolha).
  function selecionarLocal(wsId: string) {
    const ctx = contextos.find(c => c.workspace.id === wsId);
    if (ctx) selecionarContexto(ctx);
  }
```

- [ ] **Step 4: Expor os campos novos no Provider**

No `value={{ ... }}` do `AuthContext.Provider`, acrescentar (mantendo o resto):

```typescript
      localAtivo, precisaEscolher, semLocal,
      papel: membership?.role as Papel | undefined,
      selecionarLocal,
```

Garantir o import do tipo no topo (a linha de import de `@/lib/contas` já traz `Papel`): confirmar que `Papel` está na lista `import { ..., type Papel } from '@/lib/contas';`.

- [ ] **Step 5: Conferir que compila**

```bash
npm run typecheck
```

Esperado: sem erro. Se acusar `Papel` não usado ou faltando, revisar os Steps 1 e 4.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat(secao1): AuthContext expoe local ativo, precisaEscolher, semLocal e selecionarLocal"
```

---

## Task 3: Barreira de entrada + seletor do topo, ligados no dashboard

**Files:**
- Create: `src/components/EscolherLocalGate.tsx`
- Create: `src/components/SeletorLocal.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useAuth()` com `contextos`, `localAtivo`, `precisaEscolher`, `semLocal`, `selecionarLocal`.
- Produces: `<EscolherLocalGate>{children}</EscolherLocalGate>` (barreira) e `<SeletorLocal />` (dropdown do topo).

- [ ] **Step 1: Criar `EscolherLocalGate.tsx`**

```tsx
'use client';
// Barreira pos-login (A2): 0 locais → aviso; 2+ sem escolha → escolher;
// com local ativo → deixa passar. Fim da fila-vazia-silenciosa (incidente 10/08).
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export default function EscolherLocalGate({ children }: { children: ReactNode }) {
  const { contextos, localAtivo, precisaEscolher, semLocal, selecionarLocal } = useAuth();
  const router = useRouter();

  if (semLocal) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white rounded-xl shadow p-8 text-center">
        <p className="text-4xl">🔒</p>
        <h2 className="text-lg font-bold text-[#1E3A5F] mt-3">Esta conta não tem nenhum local</h2>
        <p className="text-sm text-gray-500 mt-2">
          Você entrou numa conta sem clínica/consultório vinculado. Saia e entre com
          a conta certa para ver a fila.
        </p>
        <button onClick={() => { auth.signOut(); router.replace('/login'); }}
          className="mt-5 bg-[#1E3A5F] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#2563EB] transition">
          Sair e trocar de conta
        </button>
      </div>
    );
  }

  if (precisaEscolher && !localAtivo) {
    return (
      <div className="max-w-md mx-auto mt-16 bg-white rounded-xl shadow p-8">
        <h2 className="text-lg font-bold text-[#1E3A5F] text-center">Em qual local você está hoje?</h2>
        <p className="text-sm text-gray-500 text-center mt-1 mb-5">Escolha para ver a fila e emitir laudos.</p>
        <div className="space-y-2">
          {contextos.map(ctx => (
            <button key={ctx.workspace.id} onClick={() => selecionarLocal(ctx.workspace.id)}
              className="w-full text-left border rounded-lg px-4 py-3 hover:border-[#1E3A5F] hover:bg-blue-50 transition">
              <p className="font-semibold text-sm text-[#1E3A5F]">{ctx.workspace.nomeClinica || 'Consultório'}</p>
              <p className="text-xs text-gray-400 uppercase">{(ctx.workspace.tipo as string) || 'PF'}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Criar `SeletorLocal.tsx`**

```tsx
'use client';
// Seletor do topo: so aparece com 2+ locais. Troca o local ativo em TODAS as
// telas de uma vez (elas leem do AuthContext).
import { useAuth } from '@/contexts/AuthContext';

export default function SeletorLocal() {
  const { contextos, localAtivo, selecionarLocal } = useAuth();
  if (contextos.length < 2) return null;
  return (
    <select
      value={localAtivo?.workspace.id || ''}
      onChange={e => selecionarLocal(e.target.value)}
      className="bg-white/20 text-white text-xs font-semibold rounded-lg px-3 py-1.5 focus:outline-none"
      title="Trocar de local"
    >
      {contextos.map(ctx => (
        <option key={ctx.workspace.id} value={ctx.workspace.id} className="text-gray-800">
          {ctx.workspace.nomeClinica || 'Consultório'}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Ligar no dashboard**

Em `src/app/dashboard/page.tsx`, adicionar os imports:

```typescript
import SeletorLocal from '@/components/SeletorLocal';
import EscolherLocalGate from '@/components/EscolherLocalGate';
```

Na topbar, o bloco fixo do nome do local (`<div className="bg-white/20 px-3 py-1.5 rounded-lg text-xs font-semibold">{workspace?.nomeClinica || 'Consultório'}</div>`) passa a conviver com o seletor: substituí-lo por:

```tsx
          <SeletorLocal />
          {contextos.length < 2 && (
            <div className="bg-white/20 px-3 py-1.5 rounded-lg text-xs font-semibold">
              {workspace?.nomeClinica || 'Consultório'}
            </div>
          )}
```

Para isso, incluir `contextos` no destructuring do `useAuth()` (linha 20):

```typescript
  const { user, profile, workspace, subscription, contextos, loading, reloadProfile } = useAuth();
```

Envolver o conteúdo principal (a `<div className="flex-1">…</div>` inteira, que contém Billing + Tabs) com o gate:

```tsx
        <div className="flex-1">
          <EscolherLocalGate>
            {/* Billing + Tabs existentes ficam aqui dentro, sem outra alteração */}
            ...
          </EscolherLocalGate>
        </div>
```

- [ ] **Step 4: Verificar no navegador (as 3 situações)**

```bash
npm run dev
```

Abrir `http://localhost:3000/dashboard` logado:
- Conta com 1 local → entra direto, sem seletor no topo.
- (Se tiver acesso a uma conta com 2+ locais) → aparece "Em qual local você está hoje?"; ao escolher, a fila carrega e o seletor aparece no topo.
- Conta sem local → tela "Esta conta não tem nenhum local".

Conferir no console do navegador que não há erro. Se não houver conta multi-local à mão, validar ao menos 1-local e a compilação; o comportamento 2+/0 está coberto pelo teste de `modoEntrada` (Task 1) e pela lógica do `AuthContext` (Task 2).

- [ ] **Step 5: Conferir compilação e commit**

```bash
npm run typecheck && npm run lint
```

Esperado: sem erro novo nos arquivos tocados.

```bash
git add src/components/EscolherLocalGate.tsx src/components/SeletorLocal.tsx src/app/dashboard/page.tsx
git commit -m "feat(secao1): gate de entrada por local (0/1/2+) + seletor unico no topo"
```

---

## Task 4: Telas leem o local do contexto e escondem por papel

**Files:**
- Modify: `src/components/Worklist.tsx`
- Modify: `src/components/Historico.tsx`
- Modify: `src/components/Extrato.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`workspace`, `localAtivo`, `papel`, `profile`, `user`); `podeEditarLaudo`, `podeVerFinanceiro`, `podeRemoverDaFila` de `@/lib/permissoes`.
- Produces: telas sem `wsIdSel` próprio; ações renderizadas conforme papel.

- [ ] **Step 1: Worklist — gate de laudo por perfil+autoria (corrige o bug do dono-médico)**

Em `src/components/Worklist.tsx`, adicionar o import:

```typescript
import { podeEditarLaudo, podeRemoverDaFila } from '@/lib/permissoes';
```

Trocar o destructuring do `useAuth()` para trazer `papel`, `profile`, `user`:

```typescript
  const { workspace, profile, papel, user } = useAuth();
```

Remover a linha `const ehMedico = membership?.role === 'medico';` (o gate antigo, quebrado para o dono). O botão "✏️ Editar" de laudo emitido passa a usar a permissão real. Localizar o bloco `{ehMedico && (<Btn cor="amber" onClick={() => editarLaudoEmitido(item.id)}>✏️ Editar</Btn>)}` e trocar por:

```tsx
                            {podeEditarLaudo(profile, item, user?.uid || '') && (
                              <Btn cor="amber" onClick={() => editarLaudoEmitido(item.id)}>✏️ Editar</Btn>
                            )}
```

O botão "Remover da fila" (`removerDaFila`) passa a aparecer só para quem pode (recepção não — P4). Localizar onde `removerDaFila` é renderizado e envolver o botão com:

```tsx
                            {podeRemoverDaFila(papel) && (
                              /* botao Remover da fila existente */
                            )}
```

Se `membership` ficou sem uso após remover `ehMedico`, tirá-lo do destructuring para o lint não acusar.

- [ ] **Step 2: Historico — ler o local do contexto em vez do `wsIdSel` próprio**

Em `src/components/Historico.tsx`, o estado `const [wsIdSel, setWsIdSel] = useState(workspace?.id || '');` e o `useEffect` que o sincroniza passam a seguir o **local ativo** do contexto. Trocar o destructuring:

```typescript
  const { workspace, user } = useAuth();
```

Substituir a declaração de `wsIdSel` e o `useEffect` de sincronização por um valor derivado direto do contexto (o seletor do topo é a fonte única agora):

```typescript
  const wsIdSel = workspace?.id || '';
```

Remover o `useEffect(() => { if (workspace?.id && !wsIdSel) setWsIdSel(workspace.id); }, ...)` e qualquer `setWsIdSel` restante. O seletor de workspace LOCAL do Histórico (o `<select>` que existe quando `contextos.length > 1`) sai — o seletor do topo o substitui. Localizar o bloco `{contextos.length > 1 && (<div className="mb-3"><select value={wsIdSel} ...>...</select></div>)}` e removê-lo. Tirar `contextos` do `useAuth()` se ficar sem uso.

`fetchData` já depende de `wsIdSel`; como agora ele deriva de `workspace?.id`, trocar a dependência do `useCallback`/`useEffect` de `[wsIdSel, ...]` para incluir `workspace?.id` (o valor que muda quando o seletor do topo troca de local).

- [ ] **Step 3: Extrato — mesmo tratamento + gate de acesso financeiro**

Em `src/components/Extrato.tsx`, adicionar o import:

```typescript
import { podeVerFinanceiro } from '@/lib/permissoes';
```

Trocar o destructuring para trazer o `papel`:

```typescript
  const { workspace, papel, user } = useAuth();
```

Substituir `const [wsIdSel, setWsIdSel] = useState(workspace?.id || '');` e o `useEffect` de sync por:

```typescript
  const wsIdSel = workspace?.id || '';
```

Remover o `useEffect(() => { if (workspace?.id && !wsIdSel) setWsIdSel(workspace.id); }, ...)`. Se houver `<select>` de workspace próprio, removê-lo (o seletor do topo cobre). No topo do `return`, antes de renderizar o conteúdo financeiro, incluir o gate:

```tsx
  if (!podeVerFinanceiro(papel)) {
    return (
      <div className="text-center text-gray-400 py-12 text-sm">
        O extrato financeiro é restrito a médicos e ao responsável pela conta.
      </div>
    );
  }
```

Ajustar as dependências dos `useEffect`/`useCallback` que usavam `wsIdSel` para reagир a `workspace?.id`.

- [ ] **Step 4: Esconder a aba Extrato para quem não pode (Dashboard)**

Em `src/app/dashboard/page.tsx`, trazer `papel` do `useAuth()` e o helper:

```typescript
import { podeVerFinanceiro } from '@/lib/permissoes';
```

Na linha do `useAuth()`, incluir `papel`. Envolver o botão da aba Extrato e o painel:

```tsx
              {podeVerFinanceiro(papel) && (
                <button onClick={() => setTab('extrato')} className={...}>📊 Extrato</button>
              )}
```

E no corpo, `{tab === 'extrato' && podeVerFinanceiro(papel) && <Extrato />}`. (O gate dentro do `Extrato` do Step 3 é a segunda camada; esconder a aba é a primeira.)

- [ ] **Step 5: Verificar no navegador**

```bash
npm run dev
```

Logado como dono-médico (conta Yahoo): a aba Extrato aparece; no laudo emitido próprio, o botão "Editar" **volta a aparecer**. Conferir o console sem erros. Rodar:

```bash
npm run typecheck && npm run lint
```

Esperado: sem erro novo nos arquivos tocados.

- [ ] **Step 6: Commit**

```bash
git add src/components/Worklist.tsx src/components/Historico.tsx src/components/Extrato.tsx src/app/dashboard/page.tsx
git commit -m "feat(secao1): telas leem local do contexto e escondem acoes por papel (corrige gate do dono-medico)"
```

---

## Task 5: `/api/corrigir-laudo` autenticada

**Files:**
- Modify: `src/app/api/corrigir-laudo/route.ts`
- Modify: `src/app/laudo/[id]/page.tsx` (callsite manda o Bearer)
- Create: `tests/api/corrigir-laudo.test.mjs`

**Interfaces:**
- Consumes: `requireUid`, `adminDb` de `@/lib/auth-admin`; `resolverPapel` de `@/lib/exame-admin` (ambos do Plano 2A).
- Produces: rota que retorna 401 sem token, 403 sem papel `dono`/`medico` no local, 200 no caminho legítimo.

- [ ] **Step 1: Escrever o teste da lógica de autorização**

A rota compõe I/O (Storage/PDF); a parte testável é a autorização por papel via `resolverPapel`, já coberta em `tests/api/exame.test.mjs`. Aqui, um teste focado garante que `resolverPapel` nega recepção e aceita médico no local — o contrato que a rota usa.

`tests/api/corrigir-laudo.test.mjs`:

```javascript
// Autorizacao da /api/corrigir-laudo: so dono/medico do local corrigem convenio.
// A rota chama resolverPapel(db, wsId, uid) e recusa recepcao/forasteiro.
import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { resolverPapel } from '../../src/lib/exame-admin.ts';

let db;
const CONTA = 'contaC', WS = 'wsC';
const DONO = 'uidDonoC', MED = 'uidMedC', RITA = 'uidRitaC';

before(async () => {
  if (!getApps().length) initializeApp({ projectId: 'leo-testes' });
  db = getFirestore();
  await db.doc(`workspaces/${WS}`).set({ contaId: CONTA, ownerUid: DONO });
  for (const [uid, papel] of [[DONO, 'dono'], [MED, 'medico'], [RITA, 'recepcao']]) {
    await db.doc(`vinculos/${CONTA}_${uid}`).set({ contaId: CONTA, medicoUid: uid, papel, locais: [], status: 'ativo' });
  }
});

describe('autorizacao corrigir-laudo (via resolverPapel)', () => {
  test('dono corrige', async () => assert.equal(await resolverPapel(db, WS, DONO), 'dono'));
  test('medico corrige', async () => assert.equal(await resolverPapel(db, WS, MED), 'medico'));
  test('recepcao e negada (papel recepcao nao pode corrigir)', async () => {
    const papel = await resolverPapel(db, WS, RITA);
    assert.equal(papel, 'recepcao');   // a rota trata 'recepcao' como 403
  });
  test('forasteiro sem vinculo → null', async () => {
    assert.equal(await resolverPapel(db, WS, 'uidForasteiro'), null);
  });
});
```

- [ ] **Step 2: Rodar e ver passar (resolverPapel já existe)**

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"
npm run test:api
```

Esperado: PASS (o teste documenta o contrato; `resolverPapel` é do 2A).

- [ ] **Step 3: Autenticar a rota**

Substituir o cabeçalho de init e a assinatura do handler em `src/app/api/corrigir-laudo/route.ts`. Trocar as linhas de import + bloco `if (!getApps().length) {...}` + `const dbAdmin = getFirestore();` (linhas 8-28) por:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { gerarESalvarPdf } from '@/lib/pdf-server';
import { requireUid, adminDb } from '@/lib/auth-admin';
import { resolverPapel } from '@/lib/exame-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const dbAdmin = adminDb();
```

No início do `POST`, antes de `const body = await req.json();`, inserir a verificação de token e, após ler `wsId`, a de papel:

```typescript
export async function POST(req: NextRequest) {
  const uid = await requireUid(req);
  if (!uid) {
    return NextResponse.json({ ok: false, error: 'nao_autenticado' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { wsId, exameId, convenio, solicitante, pdfHtml, nomeArq } = body as {
      wsId: string; exameId: string; convenio?: string; solicitante?: string;
      pdfHtml?: string; nomeArq?: string;
    };

    if (!wsId || !exameId) {
      return NextResponse.json({ ok: false, error: 'wsId e exameId sao obrigatorios' }, { status: 400 });
    }

    // So dono/medico do local corrigem dados administrativos (matriz §4).
    const papel = await resolverPapel(dbAdmin, wsId, uid);
    if (papel !== 'dono' && papel !== 'medico') {
      return NextResponse.json({ ok: false, error: 'sem_permissao' }, { status: 403 });
    }
```

O `medicoUid` deixa de vir do corpo (era forjável): usar `uid` no log. Trocar, no bloco de auditoria, `medicoUid,` por `medicoUid: uid,`. Remover `medicoUid` da desestruturação do body (já feito acima) e da validação. O resto do handler (update dos 2 campos, PDF, log, catch) permanece igual, apenas fechando o novo `try` já aberto.

- [ ] **Step 4: Callsite manda o Bearer**

Em `src/app/laudo/[id]/page.tsx`, na função `handleCorrigirLaudo` (linha ~715), obter o token e mandá-lo; parar de enviar `medicoUid`. Substituir a chamada `fetch('/api/corrigir-laudo', {...})` por:

```tsx
      const token = await user.getIdToken();
      const res = await fetch('/api/corrigir-laudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          wsId: workspace.id, exameId, convenio, solicitante,
          pdfHtml: gerarPdfHtml(true), nomeArq,
        }),
      });
```

(`user` já está no escopo — a função checa `!user?.uid` no início.)

- [ ] **Step 5: Rodar tudo**

```bash
npm run typecheck && npm run test:api && npm run test:unit
```

Esperado: os três limpos.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/corrigir-laudo/route.ts src/app/laudo/[id]/page.tsx tests/api/corrigir-laudo.test.mjs
git commit -m "fix(seguranca): /api/corrigir-laudo exige token e papel dono/medico (ultima rota aberta)"
```

---

## Task 6: Integração, ADR e merge

**Files:**
- Modify: `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md` (registrar 2B-A)

- [ ] **Step 1: Rodar tudo junto**

```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.8-hotspot"; export PATH="$JAVA_HOME/bin:$PATH"
npm run test:unit && npm run test:api && npm run typecheck && npm run lint
```

Esperado: unit e api verdes; typecheck limpo; lint sem erro novo nos arquivos tocados.

- [ ] **Step 2: Registrar no ADR**

Em `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md`, acrescentar uma seção `### 8.4 Plano 2B-A (dor diária)` com: fluxo de entrada 0/1/2+ locais; seletor único no topo (AuthContext = fonte); papéis escondem por `permissoes.ts`; gate de laudo corrigido para perfil+autoria (o botão do dono-médico volta); `/api/corrigir-laudo` autenticada (última rota aberta fechada). Registrar as pendências que seguem para o 2B-B: cadastro PJ, convite por link, validação de CRM, botão "Cancelar laudo".

- [ ] **Step 3: Commit e merge (com aprovação do Dr. Sérgio)**

```bash
git add docs/decisoes/2026-08-09-secao1-contas-e-acesso.md
git commit -m "docs(ADR): Plano 2B-A concluido — entrada por local, papeis na tela, corrigir-laudo autenticada"
git checkout master && git merge --no-ff feat/secao1-plano2b-a -m "feat(secao1): Plano 2B-A — dor diaria (seletor de local, papeis, corrigir-laudo auth)" && git push origin master
```

- [ ] **Step 4: Verificar o deploy**

Aguardar o Vercel; conferir que `/api/corrigir-laudo` sem token responde 401:

```bash
curl -sL -o /dev/null -w '%{http_code}\n' -X POST -H "Content-Type: application/json" -d '{}' https://www.souleo.com.br/api/corrigir-laudo
```

Esperado: `401`.

---

## Fora deste plano

| Item | Onde |
|---|---|
| Cadastro PJ, convite por link, validação de CRM, botão "Cancelar laudo" | **Plano 2B-B** (comercial) |
| Código morto (`createProfile`, `createWorkspace`, `emitExame`, convites sem chamador…) + fallbacks legados | **Plano 3** |
| Segredos + Wader | **Fase 6** (Claude da clínica) |
