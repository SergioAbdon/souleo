# Senna93 — Fase 3: Trocar o Cabo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Mapa de âncoras obrigatório:** todo implementador lê ANTES o arquivo
> `C:/Users/sergi/AppData/Local/Temp/claude/C--Users-sergi-Desktop-souleo/e973e703-7e7a-4655-b0bf-3a8af01251c6/scratchpad/f3-mapa.md`
> (âncoras arquivo:linha levantadas em 27/08 — se uma linha tiver deslocado, o texto da âncora localiza).

**Goal:** A tela e o PDF param de consumir o motor legado (tabela `#params-tbody`,
caixas `calc-*`, identificação `#out-*`, alerta) e passam a consumir o Senna93
(`derivados` + `classificacoes/`), atrás de um kill-switch novo — com flag OFF
byte-idêntico ao comportamento de hoje.

**Architecture — DESVIO DECLARADO do esqueleto da spec:** o esqueleto previa "cabos
um a um"; o levantamento provou que o `calc()` legado pinta tabela+caixas+identificação
numa chamada só e que o ponto de disparo é UM wrapper (`sc`, page.tsx:613-637). Logo o
cabo é ATÔMICO: com `senna93Params()` ON, o `sc` deixa de chamar `calcFn()` e uma única
função nova (`pintarTabelaSenna93`) pinta os MESMOS nós DOM (por
`textContent`/`innerHTML`, espelhando o motor 1:1) a partir do resultado da ponte —
JSX, moldura, raspagem do PDF e `gerarPdfHtml` ficam INTOCADOS. O rollback é o
kill-switch, não um deploy. Fatos-chave do mapa: a ponte JÁ devolve
`derivados`+`alertas` e a page joga fora (§2); o realce OOR nunca teve CSS (§5);
`refluxoPulmonar` tem um 3º call-site cego ao contrato (§10).

**Regra da flag:** `senna93Params()` só tem efeito com `senna90Primario()` ON
(documentado no módulo — a metade dos números depende da ponte que só roda no primário).

## Global Constraints

- Placar-piso: unit **491** · api 212 · rules 142 · wader 104 · tsc/build limpos.
- `public/motor/motorv8mp4.js` INTOCÁVEL (leitura livre). O script CONTINUA sendo
  injetado (banco de frases e globais vivem nele até a F5) — só o `calc()` deixa de
  ser chamado quando ON.
- **Flag OFF = byte-idêntico a hoje.** Toda task que toca page.tsx/SidebarLaudo termina
  com o smoke "OFF inalterado" (grep/leitura provando que o caminho OFF não mudou).
- Contrato da Ponte: invariantes atualizadas NA MESMA task que muda a superfície
  (nunca em task separada). ADR do contrato idem.
- Divergências visíveis da virada são declaradas na allowlist
  (`docs/planos/2026-08-27-senna93-divergencias-esperadas.md`) E na pauta V13.
- Commits `feat(senna93-f3): ...`, push por task. NÃO usar git stash. Direx intocável.
- `/api/emitir` só é tocado na T5 (carimbo de proveniência — campo novo aditivo).

---

### Task 1: Kill-switch `senna93Params` (gêmeo no mesmo módulo)

**Files:** Modify `src/lib/primary-engine-flag.ts` · Create `tests/unit/params-engine-flag.test.mjs`

**Produces:** `senna93Params(): boolean`, `setSenna93Params(ligado: boolean)`,
`limparParamsEngine()` — chave `localStorage['leo:params-engine']`, valores
`'senna93' | 'off'`, env `NEXT_PUBLIC_PARAMS_ENGINE === 'senna93'`, precedência
idêntica à flag existente (off > on > env), SSR-safe. E a REGRA:

```ts
export function senna93Params(): boolean {
  if (!senna90Primario()) return false;  // a metade dos números depende da ponte
  if (typeof window === 'undefined') return false;
  let ls: string | null = null;
  try { ls = localStorage.getItem(PARAMS_KEY); } catch { /* indisponível */ }
  if (ls === 'off') return false;        // kill-switch — rollback instantâneo
  if (ls === PARAMS_VAL) return true;
  return process.env.NEXT_PUBLIC_PARAMS_ENGINE === PARAMS_VAL;
}
```

(`PARAMS_KEY = 'leo:params-engine'`, `PARAMS_VAL = 'senna93'`; setter/limpar espelham
os existentes.) Teste: stub de `globalThis.window`+`localStorage` no node:test cobrindo
a precedência (off vence env; on por device; env global; senna90 OFF → sempre false;
SSR false). Commit `feat(senna93-f3): kill-switch leo:params-engine (C2)`.

### Task 2: Fiação dos 5 alertas estruturados (gate da fase)

**Files:** Modify `src/app/laudo/[id]/page.tsx` (estado do resultado + handler),
`src/components/laudo/SidebarLaudo.tsx` (componente novo) · testes unit do componente
puro (extrair a lógica de mapeamento pra função pura testável em
`src/lib/alertas-motor.ts`).

- `page.tsx`: no handler do bridge (após :580), guardar `r.alertas` e `r.derivados` em
  refs/state: `setResultadoMotor({ derivados: r.derivados, alertas: r.alertas })`
  (state novo; só setado quando `senna90Primario()` — que já é a condição do disparo).
- `src/lib/alertas-motor.ts` (puro): `alertasVisiveis(alertas: AlertaUI[]): AlertaUI[]`
  (dedupe por tipo, ordem fixa IT_SEM_PSAP → REFLUXO_PULM_SEM_PMAP → AORTA_SEM_IDADE →
  WILKINS_INCOMPLETO → SEXO_AUSENTE) + testes.
- `SidebarLaudo` recebe prop `alertasMotor?: AlertaUI[]` e, QUANDO `senna93Params()`
  ON, renderiza um bloco âmbar no topo (mesma classe visual do `#alerta-psap`) com uma
  linha por alerta (`alerta.mensagem`); e o `#alerta-psap` legado ganha
  `hidden={senna93ParamsOn}` (não duplicar o aviso de IT). Flag OFF: NADA muda (prop
  ausente → nem renderiza; #alerta-psap segue com o override).
- Smoke OFF + pins da função pura. Commit
  `feat(senna93-f3): 5 alertas estruturados fiados na tela (gate)`.

### Task 3: Dívidas pré-cabo — rodapé único, CSS do realce, consumidores unificados

**Files:** Modify `src/lib/pdf-params.ts`, `src/app/laudo/[id]/page.tsx`
(handleCopiarTexto/handleBaixarWord + CSS + :1611), `src/components/laudo/SheetA4.tsx`
(:73-76) · testes.

- **Rodapé único (4 lugares, 3 redações morrem):** `pdf-params.ts` importa
  `rodapeFontes()` de `@/senna90/classificacoes/fontes` e usa nos DOIS ramos (:66/:68);
  `page.tsx:1611` idem; `SheetA4.tsx:73-76` idem (a versão longa da tela é substituída —
  V13). Teste pina que `pdf-params` contém a string de `rodapeFontes()`.
- **CSS do realce (hoje inexistente):** em `page.tsx` (bloco de estilos ~:1898/1936),
  adicionar `#params-tbody td.alert{color:#B91C1C;font-weight:600;}` — e o MESMO estilo
  no CSS que `montarParamsHtml` emite pro PDF (`pdf-params.ts` — hoje classes `val/alert`
  não sobrevivem à raspagem; ver T4/T5: o realce do PDF virá das flags OOR, não da
  raspagem). Nesta task só a TELA ganha o estilo (o legado já emite `class="alert"` na
  coluna esquerda — o vermelho passa a aparecer JÁ com flag OFF: **declarar na
  allowlist** como correção B15-parcial visível).
- **Copiar Texto / Word via fonte única:** extrair pra `pdf-params.ts` dois helpers
  puros + testados: `paramsParaTexto(rows: string[][]): string` (o formato padEnd/│
  atual de handleCopiarTexto, byte-idêntico — pin com fixture) e
  `paramsParaDocx(rows: string[][]): { cells: string[] }[]` (filtro >=8 atual);
  os dois handlers passam a usá-los (a formatação sai da page; comportamento idêntico).
  O Word CONTINUA lendo identificação dos inputs nesta task (a troca pra `#out-*` é a T5,
  junto do cabo).
- Smoke OFF (única mudança visível OFF = vermelho da coluna esquerda + rodapés
  unificados — ambos declarados). Commit
  `feat(senna93-f3): rodape unico, CSS do realce, consumidores de params unificados (C6/B15/B20)`.

### Task 4: Builder puro da tabela — `montarRowsTabela`

**Files:** Create `src/senna90/classificacoes/tabela.ts` ·
`tests/unit/senna93-tabela-pins.test.mjs`

**Produces:**

```ts
export interface TabelaParams {
  rows: string[][];                    // 12 linhas × 8 colunas (10 do legado + Ao asc + Arco)
  oor: (boolean)[][];                  // 12 × 8 — true SÓ nas colunas de valor (1 e 5)
}
export function montarRowsTabela(
  ident: { sexo: Sexo; peso: number | null; altura: number | null },
  medidas: { b7: number|null; b8: number|null; b9: number|null; b10: number|null;
             b11: number|null; b12: number|null; b13: number|null;
             b28: number|null; b29: number|null },
  derivados: CalculosDerivados,
  idade: number | null
): TabelaParams;
```

Espelha as 10 linhas do legado (mapa §5: Sexo/Peso/Altura + b7..b13 na esquerda;
IMC/AoAE/VDF/VSF/FE/FS/Massa/IMVE/ER/ASC na direita) usando `valorTabela` (vírgula,
truncar, VIDE via `dsveAusente = medidas.b12 === null`), `refVal(campo, sexo, idade)` e
`isOOR` — realce nas DUAS colunas (B13; a direita acende pela primeira vez) — e
acrescenta as linhas 11-12 (B14): `['Ao Ascendente', valor, 'mm', refVal('b28'…), '', '', '', '']`
e `['Arco Aórtico', …]`. Peso/Altura/Sexo sem VR e sem OOR (paridade). Pins: fixture do
paciente-padrão da F0 (valores exatos das 12 linhas), OOR acendendo em b7 (WASE por
idade) e em FE baixa (direita), VIDE com b12 null, sexo '' → colunas VR vazias + zero
OOR + linha Sexo mostra '—'. Commit
`feat(senna93-f3): montarRowsTabela — as 12 linhas da tabela a partir dos derivados (B13/B14)`.

### Task 5: A VIRADA DO CABO (kill-switch decide quem pinta) — opus + revisor dedicado

**Files:** Modify `src/app/laudo/[id]/page.tsx` (sc :613-637, branch sintético
:669-685, init :724, handler do bridge, gerarPdfHtml NÃO muda), Create
`src/lib/params-render.ts`, Modify `src/lib/pdf-params.ts` (aceitar flags OOR
opcionais), `tests/unit/contrato-ponte-ids.test.mjs` + ADR do contrato,
`src/app/api/emitir/route.ts` + chamada em page.tsx:1278 (proveniência), allowlist.

- **`src/lib/params-render.ts`** — a função única do cabo (client-only, importa
  montarRowsTabela/valorTabela/refVal/isOOR/rodapeFontes):

```ts
// Pinta os MESMOS nós que renderizarLaudo (motorv8mp4.js:1178-1215) pintava,
// a partir do ResultadoLaudo — textContent/innerHTML, zero mudança de JSX.
export function pintarTabelaSenna93(r: ResultadoLaudo, lerIdent: () => IdentTela): void {
  const d = r.derivados;
  const ident = lerIdent();               // nome/dtnasc/dtexame/convenio/solicitante + sexo/peso/altura + b7..b29 crus
  // 1) #out-* (paridade: calcIdade "N anos"/"1 ano"; datas T12:00 pt-BR; '—' em vazio)
  // 2) calc-*: valorTabela com casas da SIDEBAR (fe/fs casas:1 + '%'); calc-wilkins:
  //    wilkinsScore !== null ? `${sc} pts` : ''  ← LIMPA ao desativar (bug do legado morto)
  // 3) #params-tbody: montarRowsTabela → montarParamsHtml(rows, p1, {pdf:false, oor}) → innerHTML
}
```

(corpo completo no brief da task, célula a célula; `montarParamsHtml` ganha parâmetro
opcional `oor?: boolean[][]` que põe `class="alert"` — default ausente = HTML atual
byte-idêntico, pin de paridade prova).
- **`sc` (page.tsx:613-637) vira o interruptor:**

```ts
            const paramsOn = senna93Params();
            const sc = () => {
              if (!paramsOn) {
                try { calcFn(); } catch (e) { console.warn('calc:', e); }
                try { (window as … ).alertaIT?.(); } catch { /* não bloquear */ }
              }
              if (senna90Primario()) {
                if (textoRestauradoRef.current) { textoRestauradoRef.current = false; }
                else { try { dispararSenna90(); } catch { /* não bloquear */ } }
              }
            };
```

  e o handler do bridge (após :607) ganha:
  `if (paramsOn && r) { setResultadoMotor(…); pintarTabelaSenna93(r, lerIdentTela); }`.
  Branch sintético :683-684 e init :724: `if (!paramsOn) calcFn()` (ON → `dispararSenna90()`
  imediato no init). `paramsOn` é lido UMA vez por montagem (mesma vida do efeito — trocar
  a flag exige recarregar a página; documentado).
- **Word passa a usar #out-*** (identificação igual ao PDF; dtexame vira pt-BR — declarar).
- **Contrato:** invariante (5) reescrita: além do motor, a page (params-render) escreve os
  MESMOS 6 `#out-*` e o MESMO `#params-tbody` (extração nova sobre params-render.ts;
  exatamente 6; raspadores ⊆ escritores dos DOIS caminhos); (5.3) ganha o irmão
  `pintarTabelaSenna93 … innerHTML`. ADR do contrato atualizado (item 4: dois escritores
  mutuamente exclusivos por flag até a F5).
- **Proveniência:** body do emitir ganha `motorNumeros: paramsOn ? 'senna93' : 'legado'`;
  `route.ts` grava `motorNumeros` no update (:203, ao lado de pdfUrl) — aditivo, sem regra.
- **Allowlist (a virada):** vírgula+truncamento nos números (70,3 vs 70.4 do toFixed),
  12 linhas (asc/arco novas), realce OOR completo (direita acende), Word com identificação
  do #out-*, calc-wilkins limpa ao desativar.
- **Smoke OFF:** com `NEXT_PUBLIC_PARAMS_ENGINE` ausente, grep/prova de que sc/init/branch
  executam exatamente o caminho antigo. Commit
  `feat(senna93-f3): a virada do cabo — senna93 pinta tabela/caixas/identificacao atras do kill-switch`.

### Task 6: `refluxoPulmonar` — os TRÊS call-sites migram

**Files:** Modify `src/app/laudo/[id]/page.tsx` (:670-672, :1736-1737),
`src/components/laudo/SidebarLaudo.tsx` (:445-446 + helper local),
`tests/unit/contrato-ponte-ids.test.mjs` + ADR.

- Substituto: função local `sincronizarCampoPmap()` (`#field-psmap` display por `#b40p`
  value — 3 linhas, em `src/lib/params-render.ts` export) usada nos 3 pontos; nenhum
  caminho chama mais `window.refluxoPulmonar` (a DEFINIÇÃO fica no motor até a F5).
- Contrato (9): (9.2) vira "page e SidebarLaudo referenciam `window.refluxoPulmonar`
  ZERO vezes" + NOVA (9.3) que também vigia `motorCall('refluxoPulmonar')` = 0 (fecha o
  ponto cego); (9.1) segue 1 até a F5. ADR atualizado.
- Commit `feat(senna93-f3): refluxoPulmonar migrado nos 3 call-sites (contrato 9 fechado de verdade)`.

### Task 7: Banco de frases vira React (o último pedaço de UI do legado)

**Files:** Create `src/components/laudo/BancoFrases.tsx` + `src/lib/banco-frases.ts`
(puro: FRASES_DEFAULT copiadas do motor VERBATIM, load/save na MESMA chave
`medcardio_banco`, CRUD) · Modify `page.tsx` (abrir o modal React; `_onInserirFrase`
continua) e `SheetA4.tsx` (remover o `dangerouslySetInnerHTML` do modal antigo QUANDO
ON? NÃO — remover de vez: o modal antigo só funciona com onclick globais do motor;
substituição completa, flag-independente, comportamento preservado) · testes do módulo puro.

- `banco-frases.ts`: mesmas 34 frases, mesma chave, mesmo shape `{id, cat, txt}` —
  localStorage existente do médico é lido sem migração. Pins: load com storage vazio =
  defaults; save/load round-trip; delete/edit.
- `BancoFrases.tsx`: mesmas capacidades do modal legado (categorias, busca, selecionar,
  inserir → `editorRef.insertLine` via prop, adicionar/editar/apagar) — visual pode ser
  o padrão V7 do app (V13: Sergio vê no teste ao vivo).
- O HTML morto do modal + os `onclick` globais saem do SheetA4 (o motor ainda define as
  funções — viram órfãs, morrem na F5).
- Commit `feat(senna93-f3): banco de frases em React (mesma chave, mesmas 34 frases)`.

---

### Fechamento da fase (controller)

- [ ] Bateria completa + grep dos gates: nenhum caminho ON sem alerta fiado; OFF
  byte-idêntico (diff de comportamento auditado).
- [ ] **TESTE AO VIVO com o Sergio** (gate da fase — conta Gmail, dev server, flag ON
  por device): roteiro = tabela 12 linhas com VR/realce, VIDE, caixas com vírgula,
  identificação no PDF, alertas (Wilkins incompleto! sexo ausente!), banco de frases,
  Copiar Texto/Word, correção adm intacta. Pauta V13 acumulada junto.
- [ ] Ledger + ADR + Obsidian + memória. Merge/deploy SÓ com confirmação (fora do horário).

## Self-Review

1. Spec §5-F3 coberta: kill-switch T1 (nasce antes do 1º cabo ✓), alertas T2 (gate ✓),
   C6 T3, cabos T5 (atômico — desvio declarado e justificado; #out-*+params
   necessariamente juntos ✓), refluxoPulmonar T6, banco T7, rate-limit por UID — FICA
   DE FORA (a rota continua atendendo a ponte igual a hoje; o fix do rate-limit entra
   quando o P1 for reaberto ou na F5 — registrado no ledger como adiado, não esquecido).
2. Sem placeholder nos pontos de risco: sc/flag/builder com código; pintarTabelaSenna93
   detalhada no brief da T5 (célula a célula com as âncoras do mapa).
3. Tipos: TabelaParams (T4) consumida na T5; alertasVisiveis (T2) na T2/T5; helpers de
   texto (T3) nos handlers.
