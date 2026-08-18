# Sub-plano 5: Seção Integrações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Escrito 16/08 para execução em NOVA SESSÃO — o prompt de abertura está em `docs/planos/2026-08-16-prompt-sessao-plano5.md`.

**Goal:** Tirar as credenciais das integrações de dentro do documento do local (hoje todo membro que lê o timbre lê o token do Feegow e a senha do Orthanc) e dar ao dono uma tela onde ele vê o estado de cada integração e testa a conexão.

**Architecture:** Entidade nova `workspaces/{wsId}/integracoes/{tipo}` (`tipo` ∈ `feegow` | `orthanc` | `wader`) com configuração e estado, lida e escrita **só pelo dono** (regra nova). O segredo vai para `workspaces/{wsId}/privado/{tipo}`, gaveta cuja regra `allow read, write: if false` **já está publicada** — só Admin SDK alcança. Testar conexão é rota de servidor: o segredo nunca volta para o navegador. O Wader passa a ler o segredo no lugar novo e a publicar batimento.

**Spec:** `docs/superpowers/specs/2026-08-16-integracoes-design.md` — leia antes de começar; as decisões D1–D6 estão lá com o porquê.

**Tech Stack:** o existente (Next.js App Router, Firebase Admin SDK nas rotas, firebase-admin no Wader). Nada novo.

## Global Constraints

- Branch: criar `feat/integracoes` a partir da master. NÃO usar `git stash` (o daemon engole edições). Commit + push por task.
- Motor (`src/app/laudo/[id]/page.tsx`), `src/components/laudo/**` e Direx: INTOCÁVEIS.
- **`workspaces/{id}.ortancAtivo` NÃO muda de lugar** — `src/components/laudo/SidebarLaudo.tsx:187` usa esse campo para mostrar "Importar DICOM" a qualquer médico, e a entidade nova só o dono lê. Ele fica no documento do local, espelhado (§3.3 da spec), com teste-tripwire.
- Segredo NUNCA volta ao navegador: nem em resposta, nem em mensagem de erro, nem em log.
- Tokens V7 (`bg-card`, `border-borda`, `text-ink*`, `bg-p2`, `bg-ativo`…); zero hex hardcoded.
- Papel: **só `dono`** vê e mexe — gate de tela (nav) E regra no banco.
- Nenhuma dependência nova.
- Verificação manual: conta Gmail PJ de teste (NUNCA a Yahoo — dados reais da clínica).
- Emulador: se `test:rules` falhar com porta ocupada, matar o java zumbi na 8080 — NUNCA trocar a porta no repo.
- Tooling: `node --test` não resolve import relativo encadeado entre `.ts`. Arquivo testado por unit não pode ter import local (padrão de `src/lib/nav.ts` e `src/lib/paciente-fmt.ts`).
- Ledger em `.superpowers/sdd/progress.md`, seção nova "Sub-plano 5".

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `firestore.rules` | bloco novo `match /integracoes/{tipo}` dentro de `workspaces/{wsId}` |
| `tests/rules/regras.test.mjs` | seção nova: quem lê/escreve `integracoes` e `privado` |
| `src/lib/permissoes.ts` | `podeVerIntegracoes(papel)` |
| `src/lib/nav.ts` | item `/integracoes`, gateado por papel |
| `src/lib/integracoes.ts` | **novo** — tipos, `TIPOS_INTEGRACAO`, `rotuloEstado` (dado puro, sem I/O) |
| `src/app/(plataforma)/integracoes/page.tsx` | **novo** — a tela: 3 cartões |
| `src/components/integracoes/CartaoIntegracao.tsx` | **novo** — casca visual de um cartão |
| `src/app/api/integracoes/route.ts` | **novo** — `POST {acao:'testar'\|'salvar'\|'remover'}`, só dono |
| `src/app/api/feegow/route.ts` | token vem da gaveta; `x-feegow-token` morre; GETs ganham gate de papel |
| `src/app/api/orthanc/route.ts` | credencial vem da gaveta; headers `x-orthanc-*` morrem |
| `src/components/LocalModal.tsx` | perde os campos de integração |
| `apps/wader/src/adapters/workspace-repo.ts` | lê Orthanc do lugar novo |
| `apps/wader/src/adapters/heartbeat.ts` | **novo** — publica `visto`/`versao`/`maquina` |
| `scripts/integracoes/01-migrar.mjs` | **novo** — dry-run por default, `--commit` grava |
| `scripts/integracoes/02-limpar-campos-antigos.mjs` | **novo** — roda só depois da verificação |

---

### Task 1: Regra da entidade + testes de regra

**Files:**
- Modify: `firestore.rules` (dentro de `match /workspaces/{wsId}`, logo abaixo do bloco `privado`)
- Modify: `tests/rules/regras.test.mjs` (seção nova no fim)

**Interfaces:**
- Produz: a fechadura que todas as tasks seguintes assumem — `integracoes/{tipo}` legível e gravável só por `ehDonoDoLocal(wsId)`.

- [ ] **Step 1: Escrever os testes que falham.** No fim de `tests/rules/regras.test.mjs`, seção nova. Leia uma seção existente antes de escrever: use os mesmos helpers (`ctx(uid)`, `semAuth()`) e os mesmos identificadores de fixture que o arquivo já define — não invente fixture nova.

```js
describe('15. Integracoes (Sub-plano 5)', () => {
  const CAM = `workspaces/${WS1}/integracoes/feegow`;
  const CAM_PRIV = `workspaces/${WS1}/privado/feegow`;

  it('dono LE a integracao', async () => {
    await assertSucceeds(ctx(DONO).doc(CAM).get());
  });
  it('dono ESCREVE a integracao', async () => {
    await assertSucceeds(ctx(DONO).doc(CAM).set({ tipo: 'feegow', ativo: true, status: 'nunca_testado' }));
  });
  it('medico do local NAO le a integracao', async () => {
    await assertFails(ctx(MEDICO).doc(CAM).get());
  });
  it('recepcao NAO le a integracao', async () => {
    await assertFails(ctx(RECEPCAO).doc(CAM).get());
  });
  it('medico NAO escreve a integracao', async () => {
    await assertFails(ctx(MEDICO).doc(CAM).set({ ativo: false }));
  });
  it('membro de OUTRA conta NAO le a integracao', async () => {
    await assertFails(ctx(OUTRA_CONTA).doc(CAM).get());
  });
  it('anonimo NAO le a integracao', async () => {
    await assertFails(semAuth().doc(CAM).get());
  });
  it('nem o dono le a gaveta de segredo pelo cliente', async () => {
    await assertFails(ctx(DONO).doc(CAM_PRIV).get());
  });
  it('nem o dono escreve na gaveta de segredo pelo cliente', async () => {
    await assertFails(ctx(DONO).doc(CAM_PRIV).set({ token: 'x' }));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:rules`
Esperado: os dois testes do dono **falham** (sem regra, tudo é negado); os de negação já passam. O total sobe de 118 para 127.

- [ ] **Step 3: Escrever a regra.** Em `firestore.rules`, logo ABAIXO do bloco `match /privado/{documento=**}`:

```
      // Integracoes (Sub-plano 5): configuracao e estado de Feegow/Orthanc/Wader.
      // So o dono. O SEGREDO nao mora aqui — vai na gaveta privado/ acima, que
      // nenhum cliente le. Batimento do Wader e resultado de teste entram por
      // Admin SDK, que passa por cima desta regra.
      match /integracoes/{tipo} {
        allow read, write: if ehDonoDoLocal(wsId);
      }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:rules`
Esperado: `pass 127`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/regras.test.mjs && git commit -m "feat(integracoes): regra da entidade (so dono) + 9 testes" && git push
```

---

### Task 2: Permissão, nav e a tela em modo leitura

**Files:**
- Modify: `src/lib/permissoes.ts`, `src/lib/nav.ts`, `tests/unit/nav.test.mjs`
- Create: `src/lib/integracoes.ts`, `tests/unit/integracoes.test.mjs`
- Create: `src/components/integracoes/CartaoIntegracao.tsx`, `src/app/(plataforma)/integracoes/page.tsx`

**Interfaces:**
- Consome: a regra da Task 1.
- Produz: `podeVerIntegracoes(papel: Papel|null|undefined): boolean`; de `src/lib/integracoes.ts` — `TipoIntegracao`, `Integracao`, `TIPOS_INTEGRACAO`, `SEM_SINAL_MS`, `rotuloEstado(i: Integracao, agoraMs: number): string`; o componente `CartaoIntegracao`.

- [ ] **Step 1: Teste de nav que falha.** Em `tests/unit/nav.test.mjs`:

```js
test('SO o dono ve /integracoes', () => {
  assert.ok(hrefs('dono').includes('/integracoes'));
  for (const papel of ['medico', 'recepcao', null, undefined]) {
    assert.ok(!hrefs(papel).includes('/integracoes'), String(papel));
  }
});
```

- [ ] **Step 2: Teste dos helpers puros que falha.** Criar `tests/unit/integracoes.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_INTEGRACAO, rotuloEstado, SEM_SINAL_MS } from '../../src/lib/integracoes.ts';

const AGORA = new Date('2026-08-16T12:00:00-03:00').getTime();

test('os tres tipos, com rotulo e icone', () => {
  assert.equal(TIPOS_INTEGRACAO.length, 3);
  for (const t of TIPOS_INTEGRACAO) assert.ok(t.id && t.rotulo && t.icone);
});
test('sem teste nenhum e "nunca testado", nao "ok"', () => {
  assert.match(rotuloEstado({ tipo: 'feegow', status: 'nunca_testado' }, AGORA), /nunca testad/i);
});
test('status ausente tambem cai em nunca testado', () => {
  assert.match(rotuloEstado({ tipo: 'feegow' }, AGORA), /nunca testad/i);
});
test('erro mostra erro', () => {
  assert.match(rotuloEstado({ tipo: 'orthanc', status: 'erro', ultimoErro: 'timeout' }, AGORA), /erro|timeout/i);
});
test('wader visto agora esta no ar', () => {
  assert.match(rotuloEstado({ tipo: 'wader', visto: AGORA - 60_000 }, AGORA), /no ar/i);
});
test('wader visto ha muito tempo esta sem sinal', () => {
  assert.match(rotuloEstado({ tipo: 'wader', visto: AGORA - SEM_SINAL_MS - 1 }, AGORA), /sem sinal/i);
});
test('wader que nunca apareceu nao mente que esta no ar', () => {
  assert.doesNotMatch(rotuloEstado({ tipo: 'wader' }, AGORA), /no ar/i);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm run test:unit`
Esperado: FAIL — `src/lib/integracoes.ts` não existe e `/integracoes` não está na nav.

- [ ] **Step 4: Implementar permissão e nav.**

Em `src/lib/permissoes.ts`, junto das outras:

```ts
// Integracoes guardam credencial de sistema: so o dono (D5 da spec do Sub-plano 5).
export function podeVerIntegracoes(papel: Papel | null | undefined): boolean {
  return papel === 'dono';
}
```

Em `src/lib/nav.ts` — item novo no fim da lista, e o gate (mesma técnica do `/financeiro`: cópia de 1 linha da matriz, travada pelo teste):

```ts
export const NAV_PLATAFORMA: ItemNav[] = [
  { href: '/agenda', rotulo: 'Agenda', icone: '📋' },
  { href: '/pacientes', rotulo: 'Pacientes', icone: '👥' },
  { href: '/laudos', rotulo: 'Laudos', icone: '🗂️' },
  { href: '/financeiro', rotulo: 'Financeiro', icone: '💰' },
  { href: '/clinica', rotulo: 'Clínica', icone: '🏥' },
  { href: '/integracoes', rotulo: 'Integrações', icone: '🔌' },
];

export function itensVisiveis(papel: Papel | null | undefined): ItemNav[] {
  return NAV_PLATAFORMA.filter(i => {
    if (i.href === '/financeiro') return papel === 'dono' || papel === 'medico';
    if (i.href === '/integracoes') return papel === 'dono'; // espelha podeVerIntegracoes
    return true;
  });
}
```

- [ ] **Step 5: Implementar `src/lib/integracoes.ts`** (ZERO imports locais — restrição de tooling das Global Constraints):

```ts
// Tipos e rotulos da secao Integracoes (Sub-plano 5). Dado puro + formatacao:
// sem I/O e sem import @/ — o `node --test` do repo nao resolve import relativo
// encadeado entre .ts, entao este arquivo tem de se bastar.

export type TipoIntegracao = 'feegow' | 'orthanc' | 'wader';

export type Integracao = {
  tipo: TipoIntegracao;
  ativo?: boolean;
  status?: 'ok' | 'erro' | 'nunca_testado';
  ultimoTeste?: number | null;
  ultimoErro?: string | null;
  ultimaSync?: number | null;
  procMap?: Record<string, string>;  // feegow
  url?: string;                      // orthanc
  visto?: number | null;             // wader
  versao?: string;                   // wader
  maquina?: string;                  // wader
};

export const TIPOS_INTEGRACAO: { id: TipoIntegracao; rotulo: string; icone: string; descricao: string }[] = [
  { id: 'feegow',  rotulo: 'Feegow',  icone: '📅', descricao: 'Agenda e cadastro de pacientes da clínica.' },
  { id: 'orthanc', rotulo: 'Orthanc', icone: '🖼️', descricao: 'Servidor de imagens que recebe do aparelho.' },
  { id: 'wader',   rotulo: 'Wader',   icone: '🛰️', descricao: 'Programa que roda na clínica e traz as imagens.' },
];

/** Sem batimento por mais que isto, o Wader conta como fora do ar. */
export const SEM_SINAL_MS = 15 * 60 * 1000;

function dataHora(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * O que o cartao escreve. Regra da spec §5.2: existir credencial NAO e "conectado" —
 * o que vale e o ultimo teste. O Wader tem estado proprio: o batimento.
 */
export function rotuloEstado(i: Integracao, agoraMs: number): string {
  if (i.tipo === 'wader') {
    if (!i.visto) return 'Nunca apareceu';
    const faz = agoraMs - i.visto;
    if (faz <= SEM_SINAL_MS) {
      const min = Math.max(1, Math.round(faz / 60000));
      return `No ar — visto há ${min} min`;
    }
    return `Sem sinal desde ${dataHora(i.visto)}`;
  }
  if (i.status === 'ok') return i.ultimoTeste ? `Conexão OK — testada ${dataHora(i.ultimoTeste)}` : 'Conexão OK';
  if (i.status === 'erro') return i.ultimoErro ? `Erro: ${i.ultimoErro}` : 'Erro na última tentativa';
  return 'Nunca testado';
}
```

- [ ] **Step 6: Implementar o cartão.** `src/components/integracoes/CartaoIntegracao.tsx` — casca visual, sem regra de negócio:

```tsx
'use client';
import type { ReactNode } from 'react';

type Props = {
  icone: string; titulo: string; descricao: string;
  estado: string; tomEstado: 'ok' | 'erro' | 'neutro';
  children?: ReactNode; acoes?: ReactNode;
};

const TOM: Record<Props['tomEstado'], string> = {
  ok: 'bg-green-100 text-green-800',
  erro: 'bg-red-100 text-red-700',
  neutro: 'bg-gray-100 text-gray-600',
};

export default function CartaoIntegracao({ icone, titulo, descricao, estado, tomEstado, children, acoes }: Props) {
  return (
    <div className="bg-card border border-borda rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-ink font-semibold">{icone} {titulo}</h3>
          <p className="text-xs text-ink-3">{descricao}</p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${TOM[tomEstado]}`}>
          {estado}
        </span>
      </div>
      {children}
      {acoes && <div className="flex gap-2 flex-wrap">{acoes}</div>}
    </div>
  );
}
```

- [ ] **Step 7: Implementar a tela** `src/app/(plataforma)/integracoes/page.tsx` — nesta task ela só LÊ. Contrato:
  - `'use client'`; `const { workspace, papel } = useAuth()`; `PageHeader titulo="Integrações"`.
  - Quem não é `dono` vê "Esta seção é do responsável pela conta." no lugar dos cartões — o gate de tela ecoa a regra, não a substitui.
  - No mount, `getDocs` de `workspaces/{wsId}/integracoes` e indexar por id. Documento ausente = integração não configurada (o cartão aparece assim mesmo, dizendo "Não configurado").
  - **Converter os carimbos antes de usar:** `visto`, `ultimoTeste` e `ultimaSync` chegam como `Timestamp` do Firestore, e `src/lib/integracoes.ts` trabalha em milissegundos (`number`) para poder ser testado sem Firebase. Normalize na carga — `const ms = (v) => v?.toMillis?.() ?? (typeof v === 'number' ? v : null)` — e passe o objeto já normalizado para `rotuloEstado`. Sem isso o cartão do Wader faz conta com objeto e mostra `NaN`.
  - Um `CartaoIntegracao` por entrada de `TIPOS_INTEGRACAO`, com `estado={rotuloEstado(i, Date.now())}`. `tomEstado`: `ok` quando `status === 'ok'` (ou Wader no ar), `erro` quando `status === 'erro'` (ou Wader sem sinal), senão `neutro`.
  - Corpo de cada cartão nesta task: só leitura — Feegow mostra quantos procedimentos mapeados; Orthanc mostra o endereço e ativo/inativo; Wader mostra versão e máquina.
  - Nenhum botão ainda; nenhum campo de credencial ainda.

- [ ] **Step 8: Verificar**

Run: `npx tsc --noEmit && npm run test:unit`
Esperado: tsc limpo; unit verde (52 → 60).

- [ ] **Step 9: Commit**

```bash
git add src/lib src/components/integracoes "src/app/(plataforma)/integracoes" tests/unit && git commit -m "feat(integracoes): secao com os tres cartoes em modo leitura" && git push
```

---

### Task 3: Rota de servidor — testar conexão

**Files:**
- Create: `src/app/api/integracoes/route.ts`, `tests/api/integracoes.test.mjs`
- Modify: `src/app/(plataforma)/integracoes/page.tsx`

**Interfaces:**
- Consome: `Integracao`, `TipoIntegracao` de `src/lib/integracoes.ts`.
- Produz: `POST /api/integracoes` com corpo `{ acao: 'testar', wsId: string, tipo: TipoIntegracao, credencial?: object }` → `{ ok: boolean, status: 'ok'|'erro', mensagem: string }`. **Nunca** devolve credencial.

**Contrato de segurança (não negociável):**
1. Exige `Authorization: Bearer <idToken>`; resolve o uid pelo Admin SDK (copie a função `proteger`/auth de `src/app/api/feegow/route.ts`).
2. Exige papel `dono` no `wsId` — `resolverPapel(dbAdmin, wsId, uid)` de `src/lib/exame-admin.ts` (leia a assinatura antes de usar; o POST `importar` do feegow já a usa). Papel diferente → 403.
3. Lê o segredo de `workspaces/{wsId}/privado/{tipo}` com Admin SDK. Se o corpo trouxer `credencial` (caso "testar antes de salvar"), usa a do corpo e **não grava nada**.
4. Bate no alvo: Feegow `GET /professional/list` com header `x-access-token`; Orthanc `GET /system` com Basic Auth. Timeout de 10s com `AbortController` (padrão já usado nas duas rotas).
5. Grava `status`, `ultimoTeste`, `ultimoErro` em `integracoes/{tipo}`.
6. **Sanitiza a mensagem de erro** antes de gravar e antes de responder; sem stack trace na resposta.

- [ ] **Step 1: Escrever os testes que falham.** `tests/api/integracoes.test.mjs`, no padrão das suítes de `tests/api/` (leia uma antes — elas sobem o emulador). Casos:

```
- sem Authorization -> 401
- token valido mas papel 'medico' -> 403
- token valido mas papel 'recepcao' -> 403
- dono + tipo invalido ('qualquer') -> 400
- dono + feegow sem credencial cadastrada e sem credencial no corpo -> 400 com mensagem util
- dono + credencial no corpo -> privado/{tipo} continua ausente (nao gravou)
- erro do alvo contendo a credencial -> ultimoErro gravado NAO contem a credencial
- tipo 'wader' + acao 'testar' -> 400 (o Wader avisa sozinho)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:api`
Esperado: FAIL — a rota não existe.

- [ ] **Step 3: Implementar a rota.**

```ts
// src/app/api/integracoes/route.ts
// Testar/gravar credencial de integracao (Sub-plano 5). O segredo mora em
// workspaces/{wsId}/privado/{tipo} e NUNCA volta para o navegador.
import { NextRequest, NextResponse } from 'next/server';
// ...imports iguais aos de api/feegow: dbAdmin, fbAuth, resolverPapel

const TIPOS = ['feegow', 'orthanc', 'wader'] as const;
const TIMEOUT_MS = 10_000;

/** Tira a credencial de qualquer texto que va para o banco ou para a tela. */
function sanitizar(msg: string, segredos: (string | undefined)[]): string {
  let out = msg;
  for (const s of segredos) if (s && s.length >= 6) out = out.split(s).join('***');
  return out.slice(0, 300);
}
```

O handler segue os 6 pontos do contrato, nesta ordem.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:api`
Esperado: 83 + os novos, `fail 0`.

- [ ] **Step 5: Plugar o botão.** Em cada cartão menos o do Wader, botão "🔌 Testar conexão" que chama a rota com o idToken (`user.getIdToken()`), mostra "testando…" enquanto roda, e recarrega o documento da integração ao terminar.

- [ ] **Step 6: Verificar e commitar**

```bash
npx tsc --noEmit && npm run test:unit && npm run test:api
git add src/app/api/integracoes tests/api/integracoes.test.mjs "src/app/(plataforma)/integracoes/page.tsx" && git commit -m "feat(integracoes): rota de testar conexao (so dono, segredo nao volta)" && git push
```

---

### Task 4: Gravar — credencial write-only, espelho e mapeamentos

**Files:**
- Modify: `src/app/api/integracoes/route.ts`, `tests/api/integracoes.test.mjs`, `src/app/(plataforma)/integracoes/page.tsx`

**Interfaces:**
- Produz: `POST /api/integracoes` com `{ acao: 'salvar', wsId, tipo, config, credencial? }` e `{ acao: 'remover', wsId, tipo }`. Resposta traz o documento da integração **sem nenhum campo de segredo**, mais `credencialCadastradaEm: number | null`.

**Contrato:**
- **Write-only, defesa #7c:** `credencial` ausente, `null` ou string vazia = **não mexe** no segredo gravado. Só `acao: 'remover'` apaga, e ela é explícita.
- **Espelho obrigatório:** ao salvar o Orthanc, `integracoes/orthanc.ativo` e `workspaces/{wsId}.ortancAtivo` são gravados **no mesmo `writeBatch`** (a atomicidade que a S2-T3 implantou). Teste-tripwire garante que não divergem.
- Feegow: `config.procMap` grava o mapa em `integracoes/feegow`.

- [ ] **Step 1: Testes que falham.** Acrescentar em `tests/api/integracoes.test.mjs`:

```
- salvar com credencial vazia NAO apaga o segredo existente (le privado/{tipo} depois e confere)
- salvar com credencial nova SUBSTITUI o segredo
- remover apaga o documento de privado/{tipo}
- salvar orthanc com ativo=true grava ativo nos DOIS lugares (tripwire do espelho)
- salvar orthanc com ativo=false desliga nos DOIS lugares
- salvar feegow com procMap grava o mapa em integracoes/feegow
- nenhuma resposta contem token/user/pass
```

- [ ] **Step 2: Rodar e ver falhar** — `npm run test:api`.

- [ ] **Step 3: Implementar `salvar` e `remover`** com `writeBatch` cobrindo integração + gaveta + espelho.

- [ ] **Step 4: Rodar e ver passar** — `npm run test:api`.

- [ ] **Step 5: Formulários na tela.**
  - Feegow: campo de token **sempre vazio**, com `Cadastrado em 12/08/2026` ou `Não cadastrado` ao lado; editor do mapa de procedimentos (migrado do `LocalModal`, mesmo comportamento).
  - Orthanc: endereço, usuário, senha (os dois últimos write-only) e o liga/desliga.
  - Botão "Remover credencial" com `confirm()` explicando que o Wader para de achar a senha.

- [ ] **Step 6: Verificar e commitar**

```bash
npx tsc --noEmit && npm run test:unit && npm run test:api && npm run test:rules
git commit -am "feat(integracoes): gravar credencial write-only + espelho ortancAtivo" && git push
```

---

### Task 5: Wader — ler o segredo no lugar novo e publicar batimento

**Files:**
- Modify: `apps/wader/src/adapters/workspace-repo.ts` (`getOrthancConnection`, linhas ~57-87)
- Create: `apps/wader/src/adapters/heartbeat.ts`
- Modify: `apps/wader/src/index.ts` (ligar no `main()`)

**Interfaces:**
- Consome: `workspaces/{wsId}/privado/orthanc` (`user`, `pass`) e `workspaces/{wsId}/integracoes/orthanc` (`url`, `ativo`).
- Produz: escrita periódica em `workspaces/{wsId}/integracoes/wader` (`visto`, `versao`, `maquina`).

**Decisão D3 da spec: SEM compatibilidade com o lugar antigo.** A virada é coordenada (Task 8).

- [ ] **Step 1: Trocar a leitura.** Em `getOrthancConnection()`, no lugar do `.doc(wsId).get()` atual, ler os dois documentos novos. Manter o cache de 5 min e o `null` quando não há Orthanc ativo. Manter os logs — e **nunca logar `pass`** (o log atual registra só `url` e `user`; preserve isso).

- [ ] **Step 2: Escrever o batimento.** `apps/wader/src/adapters/heartbeat.ts`:

```ts
/**
 * Batimento do Wader (Sub-plano 5, D4): diz "estou aqui" para o cartao da tela
 * de Integracoes distinguir "parado" de "sem exame hoje".
 * Falha em silencio de proposito: batimento NUNCA pode derrubar a ingestao.
 */
import os from 'os';
import { getDb } from './firebase.js';
import { log } from '../logger.js';

const INTERVALO_MS = 5 * 60 * 1000;

export function iniciarBatimento(wsId: string, versao: string): () => void {
  const bater = async () => {
    try {
      await getDb().doc(`workspaces/${wsId}/integracoes/wader`).set({
        tipo: 'wader',
        visto: new Date(),
        versao,
        maquina: os.hostname(),
      }, { merge: true });
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'Batimento falhou (segue o jogo)');
    }
  };
  void bater();
  const timer = setInterval(() => void bater(), INTERVALO_MS);
  return () => clearInterval(timer);
}
```

  Confira a extensão dos imports (`.js` ou sem) e o nome exportado do logger contra os arquivos vizinhos de `apps/wader/src/adapters/` — o Wader tem convenção própria.

- [ ] **Step 3: Ligar no `main()`** de `apps/wader/src/index.ts`, junto dos outros workers (`worklistWorker.start()` e companhia), com `wsId` e `version` vindos da config. Guardar o retorno e chamá-lo no encerramento, como os outros fazem.

- [ ] **Step 4: Verificar.** `cd apps/wader && npx tsc --noEmit` (confira o script real no `package.json` do Wader). Se houver suíte própria, rodar.

- [ ] **Step 5: Commit**

```bash
git add apps/wader && git commit -m "feat(wader): le segredo do Orthanc no lugar novo + batimento" && git push
```

---

### Task 6: Scripts de migração e de limpeza

**Files:**
- Create: `scripts/integracoes/01-migrar.mjs`, `scripts/integracoes/02-limpar-campos-antigos.mjs`
- Modify: `package.json` (scripts `integracoes:migrar` e `integracoes:limpar`, no padrão `node --env-file=.env.local ...`)

**Padrão obrigatório** (igual aos scripts da Seção 1 e ao seed do Sub-plano 3): `getDb()` de `scripts/secao1/lib-admin.mjs`; **dry-run por default**, `--commit` para gravar; idempotente; imprime o que faria antes de fazer; recusa sobrescrever destino que já existe com conteúdo diferente.

- [ ] **Step 1: Escrever `01-migrar.mjs`.** Para cada workspace com `feegowToken`, `ortancUrl` ou `feegowProcMap`, criar:
  - `integracoes/feegow` = `{ tipo:'feegow', ativo: !!feegowToken, status:'nunca_testado', procMap }`
  - `integracoes/orthanc` = `{ tipo:'orthanc', ativo: !!ortancAtivo, status:'nunca_testado', url: ortancUrl }`
  - `privado/feegow` = `{ token }` (só se houver)
  - `privado/orthanc` = `{ user, pass }` (só se houver)

  **Não apaga nada.** Uma linha impressa por local, dizendo o que criou e o que pulou.

- [ ] **Step 2: Rodar em dry-run e conferir**

Run: `npm run integracoes:migrar`
Esperado: lista `LDRtedkanx3bUvxpdmiL` (Grupo MedCardio: token, 17 procedimentos, Orthanc ativo) e `wader-dev`; nenhuma escrita. **Não rodar com `--commit` nesta task** — a gravação é passo da Task 8, na janela combinada com o Sergio.

- [ ] **Step 3: Escrever `02-limpar-campos-antigos.mjs`.** Apaga do documento do local: `feegowToken`, `feegowProcMap`, `ortancUrl`, `ortancUser`, `ortancPass`. **NUNCA `ortancAtivo`** (espelho da §3.3 — apagá-lo tira o botão "Importar DICOM" da tela do laudo). Recusa rodar se o `integracoes/{tipo}` correspondente não existir: nunca apagar a origem antes de o destino existir.

- [ ] **Step 4: Commit**

```bash
git add scripts/integracoes package.json && git commit -m "chore(integracoes): scripts de migracao e limpeza (dry-run por default)" && git push
```

---

### Task 7: Endurecer as rotas e limpar o modal do Local

**Files:**
- Modify: `src/app/api/feegow/route.ts`, `src/app/api/orthanc/route.ts`, `src/components/LocalModal.tsx`
- Modify: a suíte de `tests/api/` que cobre essas rotas

**Três furos, todos herdados, todos vencendo aqui:**

1. **`resolverToken` aceita `x-feegow-token` arbitrário** (`src/app/api/feegow/route.ts:51-56`): qualquer usuário autenticado usa a rota como proxy do Feegow com token próprio. **O cabeçalho deixa de ser aceito**; o token vem de `privado/feegow`, com o `FALLBACK_TOKEN` do `.env` como último recurso durante a virada.
2. **`resolverConfig` do Orthanc aceita `x-orthanc-url/user/pass`** (`src/app/api/orthanc/route.ts:52-61`) — pior, porque o endereço também é arbitrário. Passa a vir de `integracoes/orthanc` + `privado/orthanc`.
3. **GETs sem gate de papel** (`buscar_cpf`, `sala_espera`, `paciente`, `convenios`): exigir `resolverPapel(dbAdmin, wsId, uid)` como o POST `importar` já faz, e recusar sem `wsId`.

- [ ] **Step 1: Testes que falham.** Cobrir: `x-feegow-token` é ignorado (a rota usa o da gaveta); `buscar_cpf` sem papel no `wsId` → 403; `buscar_cpf` sem `wsId` → 400.

- [ ] **Step 2: Rodar e ver falhar** — `npm run test:api`.

- [ ] **Step 3: Implementar.** A mudança é na função compartilhada (`resolverToken`, `resolverConfig`) — confira TODOS os chamadores dentro do arquivo, não só o `case` que você está lendo.

- [ ] **Step 4: Rodar e ver passar** — `npm run test:api`.

- [ ] **Step 5: Limpar o `LocalModal`.** Remover estados, campos e handlers de integração (`feegowToken`, `feegowProcMap`, `ortancUrl/User/Pass`, botões de testar conexão). O modal fica com dados do local e timbre. **Não reorganizar o resto do arquivo** — só remover.

- [ ] **Step 6: Verificar e commitar**

```bash
npx tsc --noEmit && npm run test:unit && npm run test:api && npm run test:rules && npm run build
git commit -am "fix(integracoes): rotas leem segredo da gaveta, GETs com gate de papel, modal limpo" && git push
```

---

### Task 8: Fechamento e virada

- [ ] Bateria completa: `test:unit`, `test:rules`, `test:api`, `npx tsc --noEmit`, `npm run build`, `npm run test:e2e`.
- [ ] **E2E:** a suíte da etapa 3 deixa lixo na conta de teste porque `limparDaFila()` conta as linhas antes de a fila carregar. Se falhar por linha duplicada, é resíduo, não regressão: apagar os exames `E2E TESTE *` da conta de teste e rodar de novo.
- [ ] Revisão FINAL da branch com o modelo mais capaz. Atenção especial: algum caminho ainda devolve segredo ao navegador? o espelho `ortancAtivo` está coberto por teste? a regra nova fecha sem quebrar tela existente? o `LocalModal` ficou coerente depois da remoção?
- [ ] Onda de fix dos achados Critical/Important, com re-revisão.
- [ ] **Confirmação do Sergio** e publicação da regra; conferir o ruleset publicado contra o repo.
- [ ] Merge na master + deploy + verificar `/integracoes` em produção.
- [ ] **A virada, no mesmo dia e fora do horário de exame (D3):** `integracoes:migrar --commit` → atualizar o Wader na máquina da clínica → conferir cartões, testar conexão dando verde e **uma imagem entrando de verdade** → só então `integracoes:limpar --commit`.
- [ ] Documentar: ADR em `docs/decisoes/`, roadmap (Sub-plano 5 ✅), ledger, nota no Obsidian (`Leo/Decisões/`, direto no disco — o MCP trava), memória local, push.

**Estimativa: ~6h de esteira (T1 45min · T2 1h · T3 1h · T4 1h15 · T5 45min · T6 45min · T7 45min · T8 1h) + a janela da virada com o Sergio.**
