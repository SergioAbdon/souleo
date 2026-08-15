# Sub-plano 2: Agenda + Correções da Seção 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Executar as 12 correções da Worklist já aprovadas pela tríade (recepção destravada, corridas CPF/ACC, import Feegow no servidor) + migrar o visual da Worklist pros tokens V7 com StatusPill.

**Architecture:** Parte A = o plano `docs/planos/2026-08-12-plano-correcao-secao2-worklist.md` (v2 pós-tríade), executado task a task COM AS EMENDAS abaixo. Parte B = migração visual (1 task, depois da A pra não mexer nos anchors). Parte C = fechamento (bateria, publicar regras com confirmação do Sergio, merge/deploy).

**Tech Stack:** o mesmo do plano da Seção 2 + tokens V7/`StatusPill`.

## Global Constraints

- Todas as do plano da Seção 2 (regra de ouro, sem stash, commit+push por tarefa, conta Gmail PJ p/ verificação).
- **EMENDA 1 (branch):** NÃO criar `feat/secao2-worklist-fixes`. Trabalhar na branch ATUAL `feat/reestruturacao-plataforma` (Task 0 do plano da Seção 2 é SKIP).
- **EMENDA 2 (contexto pós-shell):** a Worklist agora renderiza dentro de `/agenda` (`src/app/(plataforma)/agenda/page.tsx`); `Worklist.tsx` em si não mudou — os anchors do plano valem. O `/dashboard` é redirect.
- **EMENDA 3 (publicação de regras):** as mudanças de `firestore.rules` (Task 1 ramo membro; Task 7 accIndex NÃO existe mais — morreu na v2; Task 10 mwlStatus) só publicam na Parte C, UMA vez, com confirmação do Sergio, ANTES do merge na master (regras aditivas, seguras com código velho).
- **EMENDA 4 (numeração):** no ledger, prefixar as tasks do plano da Seção 2 como `S2-Task N`.

---

## Parte A — Executar o plano da Seção 2 (Tasks 1–11 de `2026-08-12-plano-correcao-secao2-worklist.md`)

- [ ] S2-Task 1: Regra — membro edita administrativo da fila (+fixtures payloads reais + seção 14 dos testes)
- [ ] S2-Task 2: Autor só de quem assina; salvarLaudo assume órfão
- [ ] S2-Task 3: Edição atômica ficha+exame + corrida do modal + CPF propaga
- [ ] S2-Task 4: Corrida da busca de CPF Feegow
- [ ] S2-Task 5: Fonte única de tempo BRT (dataLocalBRT/agoraBelem em utils)
- [ ] S2-Task 6: Cron fail-closed + adminDb + chunking + 500 em erro
- [ ] S2-Task 7: Importação Feegow no servidor (feegow-admin.ts, autorizada, atômica, idempotente)
- [ ] S2-Task 8: Busca por CPF de verdade
- [ ] S2-Task 9: Timer só no dia de hoje
- [ ] S2-Task 10: mwlStatus visível (regra + código juntos)
- [ ] S2-Task 11: Cortes Ponytail (botão clone, listener sob demanda, tipo completo)

## Parte B — Migração visual da Worklist (1 task)

### Task B1: StatusPill + tokens + overflow na Worklist

**Files:**
- Create: `src/components/shell/StatusPill.tsx`
- Modify: `src/components/Worklist.tsx` (statusBadge→StatusPill; hex→tokens; wrapper da tabela)

**Interfaces:**
- Produces: `<StatusPill status="aguardando|andamento|rascunho|emitido|nao-realizado" />` — Histórico/Pacientes reusam nos próximos sub-planos.

- [ ] **Step 1: Criar `src/components/shell/StatusPill.tsx`**

```tsx
// Pílula de status do padrão V7 (spec §2). Fonte única — Worklist, Histórico
// e Pacientes usam esta, não badges locais.
const ESTILOS: Record<string, { cor: string; icone: string; texto: string }> = {
  aguardando: { cor: 'bg-amber-100 text-amber-800', icone: '⏳', texto: 'Aguardando' },
  andamento: { cor: 'bg-blue-100 text-blue-800', icone: '✏️', texto: 'Em andamento' },
  rascunho: { cor: 'bg-gray-100 text-gray-600', icone: '📝', texto: 'Rascunho' },
  emitido: { cor: 'bg-green-100 text-green-800', icone: '✅', texto: 'Emitido' },
  'nao-realizado': { cor: 'bg-gray-200 text-gray-500', icone: '🚫', texto: 'Não realizado' },
};

export default function StatusPill({ status }: { status: string }) {
  const e = ESTILOS[status] || ESTILOS.aguardando;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${e.cor}`}>
      {e.icone} {e.texto}
    </span>
  );
}
```

- [ ] **Step 2: Worklist usa StatusPill + tokens + scroll**

Em `src/components/Worklist.tsx` (JÁ com as mudanças da Parte A aplicadas):
1. Importar `StatusPill` e apagar o objeto `statusBadge` local; no lugar do `<span ...badge.cor>` da célula do paciente, renderizar `<StatusPill status={item.status as string} />`.
2. Trocar os hex hardcoded por tokens NA WORKLIST APENAS: `#1E3A5F`→`text-p1` (títulos/nomes), `#2563EB`→`bg-p2`/`text-p2` (botões/links), `focus:border-[#1E3A5F]`→`focus:border-p1`.
3. Envolver a `<table>` num wrapper `<div className="overflow-x-auto">` (pendência da revisão final do Sub-plano 1).

- [ ] **Step 3: Verificar e commitar**

Run: `npx tsc --noEmit && npm run test:unit`

```bash
git add src/components/shell/StatusPill.tsx src/components/Worklist.tsx
git commit -m "feat(agenda): StatusPill V7 + tokens + scroll horizontal na Worklist" && git push
```

## Parte C — Fechamento

- [ ] C1: Bateria completa (`test:unit` + `test:rules` + `test:api` + `tsc` + `build`).
- [ ] C2: ⚠️ Publicar regras (confirmação do Sergio) — `node scripts/secao1/04-publicar-regras.mjs --commit`. Conferir `CRON_SECRET` no Vercel (S2-Task 6 exige em produção).
- [ ] C3: Verificação no preview (fluxo recepção→médico com regras novas) + smoke curto.
- [ ] C4: Merge master + deploy verificado + ledger/roadmap/Obsidian/memória.
