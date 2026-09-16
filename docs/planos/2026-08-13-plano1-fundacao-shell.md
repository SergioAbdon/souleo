# Sub-plano 1: Fundação/Shell da Plataforma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o dashboard-monólito por um shell de plataforma: tokens V7 em CSS, sidebar branca com seções e URLs reais (`/agenda`, `/laudos`, `/financeiro`, `/clinica`), telas atuais dentro do shell sem redesign interno, `/dashboard` vira redirect.

**Architecture:** Route group `(plataforma)` com layout client-side (auth guard + `EscolherLocalGate` + Sidebar). Navegação é dado puro (`nav.ts`, testado por node:test). Tokens via Tailwind v4 `@theme` — classes novas (`bg-p1`, `text-ink-2`…) convivem com os hex antigos até cada tela migrar. Nada do motor de laudo é tocado.

**Tech Stack:** Next.js App Router · Tailwind v4 (`@theme`) · IBM Plex Sans (já em `--font-ibm-plex`) · componentes existentes (Worklist, Historico, Extrato, Membros, PerfilModal, LocalModal, SeletorLocal, EscolherLocalGate, SeloCrm).

## Global Constraints

- Identidade V7 (spec §2): navy `#1E3A5F`, azul `#2563EB`/`#1D4ED8`, fundo `#F1F5F9`, borda `#E2E8F0`, ativo `#EEF2F8`, alerta `#F59E0B`, crítico `#EF4444`. Gradiente 135° navy→azul SÓ em logo e botões primários.
- NÃO tocar em `/laudo/[id]`, motor, Direx, login (spec §3; login é Sub-plano 7).
- NÃO usar `git stash`. Commit + push após cada tarefa. `npx tsc --noEmit` por tarefa; `npm run build` uma vez, na T6.
- Verificação manual: conta Gmail PJ (NUNCA a Yahoo).
- Papéis: gating por `podeVerFinanceiro`/`podeGerenciarMembros` de `src/lib/permissoes.ts` (já testado).

---

### Task 0: Branch

- [ ] **Step 1:**

```bash
git checkout feat/secao1-plano2b-b2 && git pull && git checkout -b feat/reestruturacao-plataforma && git push -u origin feat/reestruturacao-plataforma
```

---

### Task 1: Tokens V7 em `globals.css` (mata o boilerplate)

O arquivo atual é boilerplate do create-next-app: vars Geist inexistentes, `body{font-family:Arial}`, bloco dark órfão que pinta `#0a0a0a` em telas sem fundo próprio. Reescrever com os tokens V7.

**Files:**
- Modify: `src/app/globals.css` (reescrever inteiro)

**Interfaces:**
- Produces: utilitários Tailwind `bg-p1 text-p1 bg-p2 bg-p2-deep bg-surface bg-card border-borda text-ink text-ink-2 text-ink-3 bg-ativo text-alerta text-critico` — todas as tasks seguintes usam.

- [ ] **Step 1: Reescrever `src/app/globals.css`**

```css
@import "tailwindcss";

/* ══════════════════════════════════════════════════════════════════
   LEO · Tokens do design system V7 (spec 2026-08-13, pré-definições
   em Desktop/LEO/v7/css/leo_v9.1.css). Fonte única de cor da
   plataforma — telas migram de hex hardcoded pra estes tokens.
   ══════════════════════════════════════════════════════════════════ */
@theme {
  --font-sans: var(--font-ibm-plex), ui-sans-serif, system-ui, sans-serif;

  --color-p1: #1E3A5F;       /* navy primário (V7 --P1) */
  --color-p2: #2563EB;       /* azul de ação (V7 --P2) */
  --color-p2-deep: #1D4ED8;  /* fim do gradiente de botão */
  --color-surface: #F1F5F9;  /* fundo da área de trabalho */
  --color-card: #FFFFFF;     /* superfície de card/sidebar */
  --color-borda: #E2E8F0;
  --color-ink: #1E293B;      /* texto principal */
  --color-ink-2: #64748B;    /* texto secundário */
  --color-ink-3: #94A3B8;    /* texto terciário/labels */
  --color-ativo: #EEF2F8;    /* item de navegação ativo */
  --color-alerta: #F59E0B;
  --color-critico: #EF4444;
}

body {
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-sans);
}
```

- [ ] **Step 2: Verificar que nada quebrou**

Run: `npx tsc --noEmit`
Expected: sem erros TS. (O visual das telas antigas não muda: elas setam os próprios fundos; o que some é o dark órfão do boilerplate e o Arial.)

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): tokens V7 no globals.css — mata boilerplate create-next-app" && git push
```

---

### Task 2: Navegação como dado (`nav.ts`) + teste

**Files:**
- Create: `src/lib/nav.ts`
- Test: `tests/unit/nav.test.mjs`

**Interfaces:**
- Consumes: `Papel`, `podeVerFinanceiro`, `podeGerenciarMembros` de `src/lib/permissoes.ts`.
- Produces: `NAV_PLATAFORMA: ItemNav[]` e `itensVisiveis(papel): ItemNav[]` — `ItemNav = { href: string; rotulo: string; icone: string }`. A Sidebar (Task 3) consome; os Sub-planos 3–5 acrescentam itens aqui.

- [ ] **Step 1: Teste que falha** — `tests/unit/nav.test.mjs`:

```js
// Navegação da plataforma é dado puro: o que cada papel vê na sidebar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_PLATAFORMA, itensVisiveis } from '../../src/lib/nav.ts';

const hrefs = (papel) => itensVisiveis(papel).map(i => i.href);

test('recepcao NAO ve financeiro nem clinica-gerencia, ve agenda e laudos', () => {
  const v = hrefs('recepcao');
  assert.ok(v.includes('/agenda'));
  assert.ok(v.includes('/laudos'));
  assert.ok(!v.includes('/financeiro'));
});
test('medico ve financeiro', () => {
  assert.ok(hrefs('medico').includes('/financeiro'));
});
test('dono ve tudo que existe hoje', () => {
  const v = hrefs('dono');
  for (const h of ['/agenda', '/laudos', '/financeiro', '/clinica']) assert.ok(v.includes(h), h);
});
test('todo item tem rotulo e icone', () => {
  for (const i of NAV_PLATAFORMA) {
    assert.ok(i.href.startsWith('/') && i.rotulo && i.icone);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:unit`
Expected: FAIL — `src/lib/nav.ts` não existe.

- [ ] **Step 3: Implementar `src/lib/nav.ts`**

```ts
// Navegação da plataforma (spec §3). Dado puro — a Sidebar renderiza isto.
// Sub-planos seguintes ACRESCENTAM itens (Pacientes, Integrações) aqui.
import { podeVerFinanceiro, podeGerenciarMembros, type Papel } from './permissoes';

export type ItemNav = { href: string; rotulo: string; icone: string };

export const NAV_PLATAFORMA: ItemNav[] = [
  { href: '/agenda', rotulo: 'Agenda', icone: '📋' },
  { href: '/laudos', rotulo: 'Laudos', icone: '🗂️' },
  { href: '/financeiro', rotulo: 'Financeiro', icone: '💰' },
  { href: '/clinica', rotulo: 'Clínica', icone: '🏥' },
];

export function itensVisiveis(papel: Papel | null | undefined): ItemNav[] {
  return NAV_PLATAFORMA.filter(i => {
    if (i.href === '/financeiro') return podeVerFinanceiro(papel);
    // /clinica: todos entram (dados básicos); as subseções internas de
    // gestão (Equipe/Plano) gateiam por podeGerenciarMembros lá dentro.
    return true;
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts tests/unit/nav.test.mjs
git commit -m "feat(shell): navegacao da plataforma como dado testado" && git push
```

---

### Task 3: Componentes do shell — `Sidebar`, `PageHeader`, `MetricCard`

**Files:**
- Create: `src/components/shell/Sidebar.tsx`
- Create: `src/components/shell/PageHeader.tsx`
- Create: `src/components/shell/MetricCard.tsx`

**Interfaces:**
- Consumes: `itensVisiveis` (Task 2); `useAuth()` (`profile`, `papel`, `user`, `contextos`, `workspace`, `reloadProfile`); `PerfilModal`, `SeletorLocal`, `SeloCrm` (existentes); `auth` de `@/lib/firebase`.
- Produces: `<Sidebar />` (sem props; lê tudo do AuthContext) · `<PageHeader titulo="..." >{ações à direita}</PageHeader>` · `<MetricCard label valor sub? barraPct? />`. Layout (Task 4) e páginas (Task 5) consomem.

- [ ] **Step 1: `src/components/shell/Sidebar.tsx`**

```tsx
'use client';
// Sidebar branca da plataforma (spec §2-3, mockup "sidebar-branca").
// Navegação vem de nav.ts; rodapé = conta (perfil, trocar local, sair).
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { itensVisiveis } from '@/lib/nav';
import { auth } from '@/lib/firebase';
import PerfilModal from '@/components/PerfilModal';
import SeletorLocal from '@/components/SeletorLocal';
import SeloCrm from '@/components/SeloCrm';

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile, papel, contextos, workspace, reloadProfile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [contaOpen, setContaOpen] = useState(false);

  const iniciais = (profile?.nome as string || 'U')
    .split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();

  return (
    <aside className="w-56 shrink-0 h-full bg-card border-r border-borda flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-6">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-p1 to-p2 flex items-center justify-center text-base shadow-sm">🫀</div>
        <span className="font-bold text-p1 text-lg tracking-wide">LEO</span>
      </div>

      {/* Seções */}
      <nav className="flex-1 px-3 space-y-1">
        {itensVisiveis(papel).map(item => {
          const ativo = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                ativo ? 'bg-ativo text-p1 font-bold' : 'text-ink-2 font-medium hover:bg-surface'
              }`}>
              <span className="text-base">{item.icone}</span>
              {item.rotulo}
            </Link>
          );
        })}
      </nav>

      {/* Conta (rodapé) */}
      <div className="border-t border-borda px-3 py-3">
        {contaOpen && (
          <div className="mb-2 space-y-1">
            <button onClick={() => { setPerfilOpen(true); setContaOpen(false); }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-ink-2 font-medium hover:bg-surface transition">
              ✏️ Editar perfil
            </button>
            {contextos.length >= 2 && <div className="px-3 py-1"><SeletorLocal /></div>}
            <button onClick={() => { auth.signOut(); router.replace('/login'); }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm text-critico font-medium hover:bg-red-50 transition">
              ↩ Sair
            </button>
          </div>
        )}
        <button onClick={() => setContaOpen(o => !o)}
          className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface transition text-left">
          <div className="w-8 h-8 rounded-full bg-p1 text-white flex items-center justify-center text-xs font-bold shrink-0">{iniciais}</div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-ink truncate">{(profile?.nome as string) || user?.email || 'Conta'}</div>
            <div className="text-[10px] text-ink-3 truncate flex items-center gap-1">
              {workspace?.nomeClinica as string || ''}<SeloCrm />
            </div>
          </div>
          <span className="ml-auto text-ink-3 text-xs">{contaOpen ? '▾' : '▴'}</span>
        </button>
      </div>

      <PerfilModal open={perfilOpen} onClose={() => { setPerfilOpen(false); reloadProfile(); }} />
    </aside>
  );
}
```

- [ ] **Step 2: `src/components/shell/PageHeader.tsx`**

```tsx
// Cabeçalho padrão de cada seção: título à esquerda, ações à direita.
export default function PageHeader({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <h1 className="text-xl font-bold text-ink">{titulo}</h1>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: `src/components/shell/MetricCard.tsx`**

```tsx
// Card de métrica do padrão V7-clean (label maiúscula, valor grande, barra opcional).
export default function MetricCard({ label, valor, sub, barraPct }: {
  label: string; valor: string | number; sub?: string; barraPct?: number;
}) {
  return (
    <div className="bg-card border border-borda rounded-xl px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,.04)]">
      <p className="text-[10px] font-bold text-ink-3 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-ink mt-0.5">{valor}{sub && <span className="text-sm font-normal text-ink-3 ml-1">{sub}</span>}</p>
      {barraPct !== undefined && (
        <div className="mt-2 h-1.5 bg-borda rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barraPct >= 90 ? 'bg-critico' : barraPct >= 70 ? 'bg-alerta' : 'bg-p2'}`}
            style={{ width: `${Math.min(100, barraPct)}%` }} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verificar e commitar**

Run: `npx tsc --noEmit`
Expected: sem erros.

```bash
git add src/components/shell/
git commit -m "feat(shell): Sidebar, PageHeader e MetricCard no padrao V7-clean" && git push
```

---

### Task 4: Layout `(plataforma)` — auth guard + gate + drawer responsivo

**Files:**
- Create: `src/app/(plataforma)/layout.tsx`

**Interfaces:**
- Consumes: `Sidebar` (Task 3), `EscolherLocalGate`, `useAuth`.
- Produces: shell que envolve TODA página dentro de `src/app/(plataforma)/*` — as páginas só renderizam conteúdo.

- [ ] **Step 1: `src/app/(plataforma)/layout.tsx`**

```tsx
'use client';
// Shell da plataforma (spec §3): sidebar fixa em telas largas, drawer em
// estreitas. Auth guard + EscolherLocalGate aqui — as páginas só têm conteúdo.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/shell/Sidebar';
import EscolherLocalGate from '@/components/EscolherLocalGate';

export default function PlataformaLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><span className="text-4xl animate-pulse">🫀</span></div>;
  if (!user) { router.replace('/login'); return null; }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar fixa (lg+) */}
      <div className="hidden lg:block h-full">
        <Sidebar />
      </div>

      {/* Drawer (< lg) */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0" onClick={e => e.stopPropagation()}>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        {/* Barra fina só no mobile, pra abrir o drawer */}
        <div className="lg:hidden sticky top-0 z-40 bg-card border-b border-borda px-4 py-2.5 flex items-center gap-3">
          <button onClick={() => setDrawer(true)} aria-label="Abrir menu"
            className="text-ink-2 text-lg leading-none">☰</button>
          <span className="font-bold text-p1">LEO</span>
        </div>
        <main className="p-5 lg:p-7 max-w-6xl mx-auto">
          <EscolherLocalGate>{children}</EscolherLocalGate>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar e commitar**

Run: `npx tsc --noEmit`
Expected: sem erros (o layout ainda não tem páginas — build completo fica pra T6).

```bash
git add "src/app/(plataforma)/layout.tsx"
git commit -m "feat(shell): layout da plataforma com sidebar fixa + drawer mobile" && git push
```

---

### Task 5: Páginas das seções + `/dashboard` vira redirect

**Files:**
- Create: `src/app/(plataforma)/agenda/page.tsx`
- Create: `src/app/(plataforma)/laudos/page.tsx`
- Create: `src/app/(plataforma)/financeiro/page.tsx`
- Create: `src/app/(plataforma)/clinica/page.tsx`
- Modify: `src/app/dashboard/page.tsx` (substituir TODO o conteúdo por redirect)

**Interfaces:**
- Consumes: `PageHeader`, `MetricCard` (Task 3); componentes existentes `Worklist`, `Historico`, `Extrato`, `Membros`, `LocalModal`; `podeVerFinanceiro`, `podeGerenciarMembros`; `useAuth` (`subscription`, `papel`, `workspace`).
- Produces: rotas `/agenda` `/laudos` `/financeiro` `/clinica` no ar. (O card fake "Emitidos Hoje: 0" do dashboard antigo MORRE — métrica real entra no Sub-plano 2.)

- [ ] **Step 1: `src/app/(plataforma)/agenda/page.tsx`**

```tsx
'use client';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/shell/PageHeader';
import MetricCard from '@/components/shell/MetricCard';
import Worklist from '@/components/Worklist';

export default function AgendaPage() {
  const { subscription } = useAuth();
  const usada = (subscription?.franquiaUsada as number) || 0;
  const mensal = (subscription?.franquiaMensal as number) || 100;

  return (
    <>
      <PageHeader titulo="Agenda do dia" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <MetricCard label="Plano" valor={String((subscription?.tipo as string) || 'Trial')} />
        <MetricCard label="Franquia do mês" valor={usada} sub={`/ ${mensal}`} barraPct={(usada / mensal) * 100} />
        <MetricCard label="Créditos extras" valor={(subscription?.creditosExtras as number) || 0} />
      </div>
      <div className="bg-card border border-borda rounded-xl p-4">
        <Worklist />
      </div>
    </>
  );
}
```

- [ ] **Step 2: `src/app/(plataforma)/laudos/page.tsx`**

```tsx
'use client';
import PageHeader from '@/components/shell/PageHeader';
import Historico from '@/components/Historico';

export default function LaudosPage() {
  return (
    <>
      <PageHeader titulo="Laudos emitidos" />
      <div className="bg-card border border-borda rounded-xl p-4">
        <Historico />
      </div>
    </>
  );
}
```

- [ ] **Step 3: `src/app/(plataforma)/financeiro/page.tsx`**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { podeVerFinanceiro } from '@/lib/permissoes';
import PageHeader from '@/components/shell/PageHeader';
import Extrato from '@/components/Extrato';

export default function FinanceiroPage() {
  const { papel, loading } = useAuth();
  const router = useRouter();
  if (loading) return null;
  // Recepcao nao ve financeiro (P4/matriz §4) — mesmo gate da aba antiga.
  if (!podeVerFinanceiro(papel)) { router.replace('/agenda'); return null; }

  return (
    <>
      <PageHeader titulo="Financeiro" />
      <div className="bg-card border border-borda rounded-xl p-4">
        <Extrato />
      </div>
    </>
  );
}
```

- [ ] **Step 4: `src/app/(plataforma)/clinica/page.tsx`** (versão-Fundação: Equipe + editar local + plano; vira página completa no Sub-plano 6)

```tsx
'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { podeGerenciarMembros } from '@/lib/permissoes';
import PageHeader from '@/components/shell/PageHeader';
import MetricCard from '@/components/shell/MetricCard';
import Membros from '@/components/Membros';
import LocalModal from '@/components/LocalModal';

export default function ClinicaPage() {
  const { workspace, subscription, papel } = useAuth();
  const [localOpen, setLocalOpen] = useState(false);
  const gerencia = podeGerenciarMembros(papel);
  const usada = (subscription?.franquiaUsada as number) || 0;
  const mensal = (subscription?.franquiaMensal as number) || 100;

  return (
    <>
      <PageHeader titulo={(workspace?.nomeClinica as string) || 'Clínica'}>
        {gerencia && (
          <button onClick={() => setLocalOpen(true)}
            className="border border-borda bg-card rounded-lg px-4 py-2 text-sm font-semibold text-ink-2 hover:bg-surface transition">
            ⚙️ Editar local
          </button>
        )}
      </PageHeader>

      {gerencia && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <MetricCard label="Plano" valor={String((subscription?.tipo as string) || 'Trial')} />
          <MetricCard label="Franquia do mês" valor={usada} sub={`/ ${mensal}`} barraPct={(usada / mensal) * 100} />
          <MetricCard label="Créditos extras" valor={(subscription?.creditosExtras as number) || 0} />
        </div>
      )}

      {gerencia ? (
        <div className="bg-card border border-borda rounded-xl p-4">
          <Membros />
        </div>
      ) : (
        <div className="bg-card border border-borda rounded-xl p-6 text-sm text-ink-2">
          Você faz parte de <b className="text-ink">{(workspace?.nomeClinica as string) || 'uma clínica'}</b>.
          A gestão de equipe e plano é do responsável pela conta.
        </div>
      )}

      <LocalModal open={localOpen} onClose={() => setLocalOpen(false)} onSaved={() => window.location.reload()} />
    </>
  );
}
```

- [ ] **Step 5: `/dashboard` vira redirect** — substituir TODO o `src/app/dashboard/page.tsx` por:

```tsx
import { redirect } from 'next/navigation';

// O dashboard-monolito virou o shell da plataforma (spec 2026-08-13).
// Bookmarks e fluxos antigos (login, laudo "voltar") caem na Agenda.
export default function DashboardRedirect() {
  redirect('/agenda');
}
```

- [ ] **Step 6: Verificar e commitar**

Run: `npx tsc --noEmit`
Expected: sem erros.

```bash
git add "src/app/(plataforma)/" src/app/dashboard/page.tsx
git commit -m "feat(shell): secoes /agenda /laudos /financeiro /clinica; /dashboard vira redirect" && git push
```

---

### Task 6: Build + verificação de ponta a ponta no preview

- [ ] **Step 1: Bateria**

```bash
npm run test:unit && npx tsc --noEmit && npm run build
```

Expected: tudo PASS (test:rules/test:api não mudaram nesta fase — rodar mesmo assim se houver dúvida).

- [ ] **Step 2: Preview (conta Gmail PJ)** — subir o dev server e verificar:

1. Login → cai em `/agenda` (via redirect do `/dashboard`); fila carrega; botão voltar do navegador funciona entre seções.
2. Sidebar: 4 seções aparecem pro dono; logando como recepção, Financeiro some.
3. `/laudos` lista o histórico; `/financeiro` mostra extrato (dono) e redireciona recepção pra `/agenda`.
4. `/clinica`: Membros funciona; Editar local abre o LocalModal; recepção vê o cartão informativo.
5. Rodapé da sidebar: editar perfil abre modal; trocar local (conta com 2 locais); sair volta pro login.
6. Fluxo laudo: `/agenda` → "Laudar" → `/laudo/[id]` funciona → "voltar" cai em `/agenda` (via redirect do dashboard).
7. Janela estreita (<1024px): drawer abre/fecha, navega e some ao clicar.

- [ ] **Step 3: Screenshot de prova + commit final**

Tirar screenshot da `/agenda` no preview (prova pro Sergio). Ajustes visuais pequenos encontrados na verificação entram aqui.

```bash
git add -A && git commit -m "feat(shell): fundacao da plataforma verificada no preview" && git push
```

- [ ] **Step 4: Atualizar o roadmap** — marcar Sub-plano 1 como CONCLUÍDO em `docs/planos/2026-08-13-reestruturacao-roadmap.md` e escrever o Sub-plano 2 (Agenda + Seção 2) antes de seguir.
