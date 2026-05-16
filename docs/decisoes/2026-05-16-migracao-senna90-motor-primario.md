# Migração Senna90 como motor primário de achados/conclusões (16/05/2026)

> **Status:** Fase 1-2 implementadas (flag OFF por padrão). Validação em lote + ativação pendentes.
> **Dono:** Claude do notebook. **Decidido com:** Dr. Sérgio.
> **Audience:** Clinic Claude + Sérgio futuro.

---

## 🔒 CONGELAMENTO (Clinic Claude — LER ANTES DE EDITAR)

A migração motor→Senna90 está EM ANDAMENTO pelo Claude do notebook.
**NÃO edite estes arquivos até este ADR mudar pra status "CONCLUÍDO":**

- `src/app/laudo/[id]/page.tsx`
- `src/lib/shadow-runner.ts`
- `src/lib/motor-ts-adapter.ts`
- `src/senna90/**`
- `public/motor/motorv8mp4.js`
- `src/app/api/laudo/calcular/route.ts`
- `src/lib/primary-engine-flag.ts` (novo)
- `src/lib/senna90-render.ts` (novo)
- `src/lib/senna90-bridge.ts` (novo)

Pode trabalhar normal em Wader, Worklist, galeria DICOM, SR parser, etc.

---

## 1. Raiz do "bug das frases" imortal (descoberta definitiva)

Sintoma: médico digita medida → Massa/FE aparecem, mas comentários +
conclusão NÃO auto-completam. Vários fixes (event delegation 12/05,
pendingHtml PR #28 15/05) não resolveram.

**Causa raiz:** a migração TipTap (commit `0fd5c67`) substituiu
`#achados-body`/`#conclusao-list` pelo editor TipTap e criou
`_onLaudoGerado` como a NOVA ponte motor→editor. Mas o `motorv8mp4.js`
**nunca foi atualizado pra CHAMAR `_onLaudoGerado`**. Ele continua:

- `motorv8mp4.js:1191` → escreve `#params-tbody` (existe no SheetA4) ✅
- `renderizarLaudo` seta `calc-*` (existem no SidebarLaudo) ✅
- `motorv8mp4.js:1197` → `getElementById('achados-body').innerHTML` →
  `#achados-body` **não existe mais** → `null.innerHTML` → **CRASH**
  → engolido pelo `try/catch` do `sc()` (page.tsx:251)
- `_onLaudoGerado` (page.tsx:203) → **0 call sites**. Código morto.

Resultado: desde a migração TipTap, achados/conclusões do motor se
perdem no vazio. PR #28 consertou o intervalo do `pendingHtml` — mas
`pendingHtml` só é alimentado por `_onLaudoGerado`, que nunca roda.
Patcharam um cano sem água. **Por isso o bug é imortal.**

## 2. Decisão arquitetural

Migrar achados/conclusões pro **Senna90** (TS, server-side, 72/72
testes). Abordagem **output-only swap, additive, feature-flagged**:

- Motor antigo **continua** rodando `params-tbody` + `calc-*` (funciona
  hoje, zero regressão).
- Quando flag ON: Senna90 (server) gera `achados[]`/`conclusoes[]` →
  `montarLaudoHtml()` → `_onLaudoGerado()` (a ponte morta, AGORA
  finalmente chamada) → TipTap (reusa Wilkins-replace + pendingHtml
  do PR #28 — o trabalho do Clinic Claude vira essencial, não foi perdido).
- Flag OFF = comportamento de hoje. **Rollback = `localStorage`,
  zero-deploy.**

### Decisões do Sérgio (AskUserQuestion 15/05)

1. **C3 (paredes b59/b60/b61):** Senna90/AHA está CORRETO. O motor
   antigo tem bug clínico (lê b59=Lateral; AHA = b59=Inferior).
   ⚠️ **Pendência médico-legal:** laudos JÁ EMITIDOS pelo motor antigo
   com contratilidade segmentar (b59/b60/b61 preenchidos) podem ter
   nome de parede trocado. NÃO bloqueia a migração. Auditar quantos
   (script Firestore) e Sérgio decide revisão caso a caso.
2. **Coordenação:** notebook faz, Clinic congela (este ADR).
3. **Estratégia:** comprimida — validação automática em lote (não
   1-2 semanas de uso orgânico).
4. **Unidade SR cm→mm:** PARQUEADA (tarefa do Sérgio no Vivid, ele
   lidera amanhã). Não afeta esta migração — só os 8 inputs SR, que
   chegam corretamente mapeados (testado: plumbing OK, C2 resolvido).

## 3. Implementação (feita)

| Arquivo | Estado |
|---|---|
| `src/lib/primary-engine-flag.ts` (NOVO) | `senna90Primario()` — env var `NEXT_PUBLIC_PRIMARY_ENGINE=senna90` OU localStorage `leo:primary-engine=senna90` |
| `src/lib/senna90-render.ts` (NOVO) | `montarLaudoHtml(achados,conclusoes)` → HTML TipTap (`<p>`+`<h3>CONCLUSÃO</h3>`+`<ol><li>`), Wilkins inline |
| `src/lib/senna90-bridge.ts` (NOVO) | `calcularSenna90()` (lerMedidasDoDOM+POST) + `criarDebounce(300ms)` |
| `src/app/laudo/[id]/page.tsx` (EDIT) | `sc()` ganhou branch `if (senna90Primario()) dispararSenna90()` (debounced → `_onLaudoGerado`). Motor antigo intocado. |

`tsc --noEmit` limpo. Flag OFF por padrão → produção inalterada.

## 4. Pendente

1. **Validação em lote:** script puxa 50-100 exames reais do Firestore,
   roda os 2 motores, compara achados/conclusões. Divergências
   esperadas (correção AHA, mudanças clínicas documentadas) filtradas;
   inesperadas = 0 → confiança.
2. **Sérgio testa:** flag ON via `localStorage.setItem('leo:primary-engine','senna90')`
   no console, em laudos reais dele. Rollback = `removeItem`.
3. **Auditoria médico-legal:** quantos laudos emitidos têm b59/b60/b61.
4. **Aposentar motor antigo** (mover params/calc-* pro Senna90 também)
   — fase futura, só após validação.

## 5. Como reverter (qualquer momento)

Console do navegador: `localStorage.removeItem('leo:primary-engine')` →
recarrega → motor antigo primário de novo. Zero deploy. O motor antigo
nunca parou de carregar.

## 6. Update 16/05/2026 — j9 + spec aorta implementados

- **j9 Massa** (texto "Espessura"→"Massa") **reaplicado no master**
  (cherry-pick limpo `0350307` → `2811dc5`). Pendência da migração
  resolvida — Senna90 e motor antigo embarcam a versão clínica correta.
- **Spec da aorta** implementada e validada. Referências FECHADAS com
  Dr. Sérgio: **raiz = WASE 2022** (sexo+idade), **ascendente+arco =
  ASE Chamber 2015 Tab.14** (♂≤38 / ♀≤35 mm); aneurisma ≥50/≥45;
  índice cm²/m ≥10.
  Ver **`docs/decisoes/2026-05-16-spec-aorta.md`** (sem pendência de
  aval — decisão fechada).
- Validação: `tsc` limpo · 72/72 testes · 24/24 exames reais.
- Flag Senna90 **continua OFF** em produção. Pendência §4.2 (Sérgio
  liga a flag e valida na tela) segue de pé.
