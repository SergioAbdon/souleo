# Senna93 — Fase 4: Sombra Persistida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O retroativo da sombra passa a comparar as DUAS metades do laudo (frases E números
da tabela), classificar cada divergência contra a allowlist versionada, e GRAVAR cada execução
em `workspaces/{ws}/privado/shadow/execucoes/{execId}` via Admin SDK — retroativo sobre os 3
workspaces + janela diária de ~7 dias, meta 0 divergências inesperadas.

**Architecture:** Um core puro (`src/lib/shadow/`) com 4 peças — simulador da tabela do legado
(porte verbatim de `motorv8mp4.js`, leitura livre, ZERO toque no arquivo), allowlist estruturada
espelhando `docs/planos/2026-08-27-senna93-divergencias-esperadas.md` (com teste-tripwire de
cobertura 1:1 contra o markdown), comparadores (células e frases) e o orquestrador `rodarShadow`
com persistência injetável. Três consumidores finos: a rota `/api/admin/shadow-retroativo`
(ganha gate de papel + persistência, resposta ADITIVA — a página Direx é intocável e continua
funcionando), um cron diário Vercel (janela de acompanhamento) e um script CLI (retroativo
local sobre os 3 workspaces, sem depender de deploy).

**Tech Stack:** Next.js App Router (rotas nodejs), firebase-admin, node:test (`.test.mjs`
importando `.ts` via type-stripping do Node ≥24 — padrão do repo).

## Global Constraints

- **Placar-piso que NENHUMA task pode rebaixar:** unit **576** · api **212** · rules **142** ·
  wader **104** · `tsc` e `build` limpos · Contrato da Ponte **32 invariantes**. Cada task
  registra o novo piso se subir.
- `public/motor/motorv8mp4.js` **INTOCÁVEL** (leitura livre; qualquer toque = revisor dedicado
  linha a linha — NÃO acontece nesta fase). Direx (páginas `src/app/direx/**`) intocável — a
  rota `/api/admin/shadow-retroativo` NÃO é Direx e pode mudar, mas a RESPOSTA tem que
  continuar servindo a página existente (mudanças aditivas apenas).
- **NENHUMA regra Firestore nova.** `match /privado/{documento=**} { allow read, write: if false }`
  (firestore.rules:116-118) já cobre `privado/shadow/execucoes/**`. Se alguma task concluir que
  precisa de leitura client-side → PARAR e confirmar com o Sergio.
- O array `DIVERGENCIAS_ESPERADAS` de `src/lib/shadow-runner.ts` é código MORTO (0 importadores)
  — NÃO usar, NÃO atualizar, NÃO deletar (morre na F5). A fonte das divergências esperadas é
  `docs/planos/2026-08-27-senna93-divergencias-esperadas.md`.
- Regra do Sergio 27/08: "o laudo DESCREVE, não recomenda" — nenhuma frase de sugestão de
  conduta no motor, nunca. (Nenhuma task desta fase mexe em frase, mas vale como veto.)
- Decisão 19b (zero validação de faixa) e nº24 (sexo = campo clínico) intactas.
- NÃO usar `git stash`. NUNCA `git add -A` — citar arquivos um a um. Commit inline do
  controller só com "fail 0" LITERAL conferido. `npm run x -- --commit` (com separador `--`).
- Caminho Windows em docs versionados SEMPRE com barras normais (backslash+hex mata o build —
  Tailwind v4 lê docs/ como escape CSS).
- Verificação manual: conta **Gmail**, NUNCA Yahoo.
- Merge master + deploy Vercel: SÓ com confirmação do Sergio, fora do horário da clínica.
  (Commits/pushes na branch por task JÁ autorizados.)
- Branch: `feat/senna93-unificacao` — antes da Task 1, `git checkout feat/senna93-unificacao
  && git merge --ff-only master` (a branch é ancestral da master pós-merge e365426/d76dd99).

## Fatos de código que dirigem o desenho (levantados 28/08)

1. A rota atual (`src/app/api/admin/shadow-retroativo/route.ts`) compara SÓ frases, não
   persiste nada, usa uma allowlist FÓSSIL de maio (3 regexes: GLS -18/-19, Estenose Pulmonar,
   Átrio direito) e o gate aceita **qualquer usuário autenticado em qualquer wsId** — lê
   achados/conclusões + pacienteNome de qualquer clínica. Fechar com `resolverPapel`
   (`src/lib/exame-admin.ts:37`) é obrigação desta fase (camadas S1-S5 não regridem).
2. O doc do exame NÃO guarda a tabela pintada. O snapshot `laudos-html/{ws}/{exameId}.html`
   (`src/lib/pdf-server.ts:77`) só existe para emissões pós-25/08 (S5). Logo "o que o legado
   pintaria" para o histórico = **simulador** portado verbatim das linhas vivas do
   `motorv8mp4.js` (derivados :86-98 · `fmt` :1120 · `refVal`/`idadeAnos`/`isOOR` :1075-1098 ·
   rows :1196-1215), validado contra os snapshots reais quando existirem (Task 4).
3. O realce (`oor`) do legado é SABIDAMENTE deslocado 3 linhas (achado de ouro do teste ao
   vivo — `campos[i]` alinhado a `rows[i]` com Sexo/Peso/Altura na frente). O simulador NÃO
   reproduz `oor` e a comparação de números é SÓ de `rows` (valores) — realce já está
   adjudicado na allowlist (linhas B13/B15/F3-fix) e comparar o realce bugado só geraria ruído.
4. `calcular()` (`src/senna90/motor.ts`) já devolve `derivados` (com `idade`);
   `montarRowsTabela` (`src/senna90/classificacoes/tabela.ts`) monta as 12 linhas do Senna93.
   A fixture célula-a-célula do Senna93 já existe em `tests/unit/senna93-tabela-pins.test.mjs`
   (paciente-padrão ♂ 46a, 80kg/170cm, b7..b12 = 34/40/50/10/10/30).
5. Frases do Senna90 estão em produção **desde 16/05/2026** (docblock de
   `src/lib/primary-engine-flag.ts`: "ATIVADO EM PRODUÇÃO 16/05/2026"). Exames emitidos ANTES
   têm texto do motor legado — compará-los com o motor de hoje re-litiga as 22 divergências
   históricas de maio (paredes b59-61 incluídas). Por isso a metade das FRASES é dividida em
   eras: `era: 'senna90'` (emitidoEm ≥ 2026-05-17, conta pra meta de 0 inesperadas) e
   `era: 'legado'` (balde informativo no relatório, NÃO conta). A metade dos NÚMEROS compara
   motor×motor (não texto salvo) e roda no histórico INTEIRO sem esse problema. É assim que o
   item "reordenando b59/b60/b61 (contrato item 2)" fica satisfeito: as frases de parede do
   balde legado não entram na meta, e `dadosParaMedidas` já usa o mapa-verdade do Senna90.
6. Exames sem `medidas` (anexo PDF do catálogo, laudo-texto) ou sem achados/conclusões salvos
   são PULADOS com motivo — hoje entrariam na comparação e gerariam divergência total falsa.
7. Padrão de cron do repo: `src/app/api/cron/cleanup-worklist/route.ts` (CRON_SECRET
   fail-closed em produção) + entrada em `vercel.json`. Padrão de script CLI:
   `scripts/integracoes/01-migrar.mjs` usando `scripts/secao1/lib-admin.mjs`
   (`getDb`/`COMMIT`/`modo`), rodado com `node --env-file=.env.local`.
8. Caminho Firestore da persistência (par coleção/doc válido):
   `workspaces/{ws}` (D) → `privado` (C) → `shadow` (D) → `execucoes` (C) → `{execId}` (D)
   → `exames` (C) → `{exameId}` (D). Nada itera a coleção `privado` (Wader lê só
   `privado/orthanc`), então o doc `shadow` não incomoda ninguém.

## Estrutura de arquivos da fase

- Create: `src/lib/shadow/legado-tabela.ts` — simulador da tabela do legado (morre na F5b)
- Create: `src/lib/shadow/allowlist.ts` — matchers de frases + pares de VR + tolerâncias de célula
- Create: `src/lib/shadow/comparar.ts` — `compararTabelas` (células) + `compararFrases` (movida da rota)
- Create: `src/lib/shadow/rodar.ts` — `rodarShadow` (orquestra, persiste via deps injetadas)
- Create: `src/lib/shadow/snapshot-params.ts` — `extrairRowsDoSnapshot` (validação Task 4)
- Modify: `src/app/api/admin/shadow-retroativo/route.ts` — gate de papel + core novo + persistência
- Create: `src/app/api/cron/shadow-diario/route.ts` + Modify: `vercel.json`
- Create: `scripts/shadow/retroativo.mjs` + entrada `shadow:retroativo` no `package.json`
- Tests: `tests/unit/shadow-legado-tabela.test.mjs`, `tests/unit/shadow-allowlist.test.mjs`,
  `tests/unit/shadow-comparar.test.mjs`, `tests/unit/shadow-snapshot-params.test.mjs`,
  `tests/api/shadow-rodar.test.mjs`

---

### Task 1: Simulador da tabela do legado (`legado-tabela.ts`) — **opus**

O módulo que responde "o que o legado pintaria em `#params-tbody` para estas medidas".
Porte VERBATIM da matemática e formatação do `public/motor/motorv8mp4.js` (SÓ LEITURA).
Vive em `src/lib/shadow/` porque morre junto com a sombra na F5b.

**Files:**
- Create: `src/lib/shadow/legado-tabela.ts`
- Test: `tests/unit/shadow-legado-tabela.test.mjs`
- Read-only (fonte do porte): `public/motor/motorv8mp4.js` — derivados :86-98, `T()` (helper
  de truncamento, procurar a definição no topo do arquivo), `fmt` :1120, `waseRaizUpper`
  (procurar), `refVal` :1075, `idadeAnos` :1081, `isOOR` :1088 (NÃO portar — ver decisão),
  rows :1196-1215.

**Interfaces:**
- Consumes: nada do resto da fase.
- Produces: `simularTabelaLegado(entrada: EntradaLegado): string[][]` — 10 linhas × 8 colunas,
  strings EXATAS que o legado renderiza (ponto decimal, `toFixed`, VRs incondicionais).
  ```ts
  export interface EntradaLegado {
    sexo: '' | 'M' | 'F';
    peso: number | null; altura: number | null;
    b7: number | null; b8: number | null; b9: number | null; b10: number | null;
    b11: number | null; b12: number | null; b13: number | null;
    dtnasc: string; dtexame: string;   // ISO 'AAAA-MM-DD' — p/ idadeAnos (Date-based, verbatim)
  }
  export function simularTabelaLegado(e: EntradaLegado): string[][]
  ```

Decisões desta task (declarar no docblock):
- SÓ `rows` — sem `oor` (fato 3 do plano). SÓ as 10 linhas (o legado não imprime asc/arco).
- Derivados portados verbatim: `T()` truncador, `imc`, `asc` (constante **71,74**), `aoae`,
  `vdf`, `vsf`, `feT` (calculado sobre os valores CRUS — dá 0,7040 onde o Senna93 dá 0,7038),
  `fs`, `massa` (o bug B24 do +0,6 DENTRO da divisão por 1000 é REPRODUZIDO — o simulador
  imita o legado, bugs inclusos), `imVE` (sobre massa e asc já truncados), `er`.
- `fmt(x, d=1)` = `toFixed` com PONTO (arredonda, não trunca) — verbatim.
- `refVal` do legado portado (inclui `waseRaizUpper` — atenção: a versão do LEGADO dá 37 para
  ♀>65, não 38). `idadeAnos` Date-based verbatim (não a comparação de string do Senna90).
- FE/FS célula: `(feT*100).toFixed(0)+'%'`, com `'VIDE'` quando `b12===null` — verbatim.
- Truthiness verbatim: o legado usa `(peso&&alt)`, `b9 ?`, etc. — **0 se comporta como null**
  no legado (não "corrigir" para checks de null; o simulador imita).

- [ ] **Step 1: Escrever o teste com os pins célula a célula (paciente-padrão F0)**

`tests/unit/shadow-legado-tabela.test.mjs`:

```js
// ══════════════════════════════════════════════════════════════════
// Senna93 F4-T1: pins do SIMULADOR do legado — célula a célula.
// Valores calculados à mão a partir das fórmulas de motorv8mp4.js
// (mesma fixture do senna93-tabela-pins.test.mjs, ♂ 46a, 80kg/170cm).
// Se este teste quebrar, o simulador deixou de imitar o legado — e a
// sombra inteira da F4 perde a referência.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { simularTabelaLegado } from '../../src/lib/shadow/legado-tabela.ts';

const PADRAO = {
  sexo: 'M', peso: 80, altura: 170,
  b7: 34, b8: 40, b9: 50, b10: 10, b11: 10, b12: 30, b13: null,
  dtnasc: '1980-05-15', dtexame: '2026-08-27',
};

describe('simularTabelaLegado — paciente-padrão F0', () => {
  const rows = simularTabelaLegado(PADRAO);

  test('10 linhas × 8 colunas', () => {
    assert.equal(rows.length, 10);
    for (const l of rows) assert.equal(l.length, 8);
  });

  test('as 10 linhas exatas (ponto decimal, toFixed, VRs do legado)', () => {
    assert.deepEqual(rows, [
      ['Sexo', 'M', '', '', 'Índice de Massa Corporal', '27.6', 'kg/m²', '<25 kg/m²'],
      ['Peso', '80.0', 'Kg', '', 'Relação Ao/AE', '0.85', '', ''],
      ['Altura', '170.0', 'cm', '', 'Vol. Diast. final VE', '118.2', 'ml', '62–150 ml'],
      ['Raiz Aórtica', '34.0', 'mm', '≤ 40 mm', 'Vol. Sist. final VE', '35.0', 'ml', '21–61 ml'],
      ['Átrio Esquerdo', '40.0', 'mm', '30–40 mm', 'Fração de Ejeção (Teichholz)', '70%', '', '>51%'],
      ['DDVE', '50.0', 'mm', '42–58 mm', 'Fração de Encurtamento', '40%', '', '30–40%'],
      ['Septo Interventricular', '10.0', 'mm', '6–10 mm', 'Massa do VE', '181.3', 'g', '<201 g'],
      ['Parede Posterior', '10.0', 'mm', '6–10 mm', 'Índice de Massa VE', '94.9', 'g/m²', '<103 g/m²'],
      ['DSVE', '30.0', 'mm', '25–40 mm', 'Espessura Relativa', '0.40', '', '<0,43'],
      ['Ventrículo Direito', '—', 'mm', '21–35 mm', 'Área Sup. Corpórea', '1.91', 'm²', ''],
    ]);
  });

  test('sem sexo: 3 VRs incondicionais do legado ficam (IMC, FS, ER), resto some', () => {
    const r = simularTabelaLegado({ ...PADRAO, sexo: '' });
    assert.equal(r[0][7], '<25 kg/m²');   // IMC incondicional
    assert.equal(r[5][7], '30–40%');      // FS incondicional
    assert.equal(r[8][7], '<0,43');       // ER incondicional
    assert.equal(r[2][7], '');            // VDF some
    assert.equal(r[4][7], '');            // FE some
    assert.equal(r[3][3], '');            // refVal b7 some
  });

  test('♀ 70 anos: raiz VR do LEGADO é ≤ 37 mm (WASE antiga — o Senna93 dá 38)', () => {
    const r = simularTabelaLegado({ ...PADRAO, sexo: 'F', dtnasc: '1956-01-01' });
    assert.equal(r[3][3], '≤ 37 mm');
  });

  test('b12 null: FE e FS viram VIDE, VDF fica, VSF vira —', () => {
    const r = simularTabelaLegado({ ...PADRAO, b12: null });
    assert.equal(r[4][5], 'VIDE');
    assert.equal(r[5][5], 'VIDE');
    assert.equal(r[3][5], '—');
  });

  test('feT do legado sai dos valores CRUS: 70.40% (não os 70.38 do Senna93)', () => {
    // fronteira do toFixed(0): 50/29.55 → feT cru ≈ 0.7150 → '72%'? não:
    // o pin de valor é o do PADRAO ('70%'); aqui só se garante que a conta
    // é a crua — b9=50,b12=30 → 0.70400… (toFixed(0) = 70)
    assert.equal(rows[4][5], '70%');
  });
});
```

Nota pro implementador: se algum pin acima divergir do que o porte VERBATIM produz, a conta
manual do plano está errada — NÃO ajuste o simulador para o pin; recalcule o pin a partir do
`motorv8mp4.js` e declare a correção no report. O revisor refaz a matemática.

- [ ] **Step 2: Rodar e ver falhar** — `npm run test:unit` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar `src/lib/shadow/legado-tabela.ts`** — porte verbatim (fórmulas do
  fato 2/decisões acima). Estrutura:

```ts
// ══════════════════════════════════════════════════════════════════
// LEO Senna93 F4 · Simulador da tabela do LEGADO (motorv8mp4.js)
// ══════════════════════════════════════════════════════════════════
// "O que o legado pintaria em #params-tbody" — porte VERBATIM de:
//   derivados  motorv8mp4.js:86-98   (T(), imc, asc 71,74, …, massa B24)
//   fmt        motorv8mp4.js:1120    (toFixed, ponto)
//   refVal     motorv8mp4.js:1075    (inclui waseRaizUpper LEGADO: ♀>65=37)
//   idadeAnos  motorv8mp4.js:1081    (Date-based)
//   rows       motorv8mp4.js:1196-1215 (10 linhas, VRs inline)
// Bugs do legado são REPRODUZIDOS de propósito (B24 +0,6mg; truthiness
// de 0). SÓ rows — o realce (oor) do legado é deslocado 3 linhas e já
// está adjudicado na allowlist; comparar valores basta.
// ponytail: morre na F5b junto com o legado — não generalizar.
// ══════════════════════════════════════════════════════════════════
export interface EntradaLegado { /* …como na Interface acima… */ }
export function simularTabelaLegado(e: EntradaLegado): string[][] { /* porte */ }
```

- [ ] **Step 4: Rodar e ver passar** — `npm run test:unit` → todos verdes, placar ≥ 576 + novos.
- [ ] **Step 5: `npx tsc --noEmit`** limpo.
- [ ] **Step 6: Commit**

```bash
git add src/lib/shadow/legado-tabela.ts tests/unit/shadow-legado-tabela.test.mjs
git commit -m "feat(senna93-f4): simulador da tabela do legado (porte verbatim, pins celula a celula)"
git push
```

---

### Task 2: Allowlist estruturada + comparadores (`allowlist.ts`, `comparar.ts`) — **opus**

A allowlist markdown vira estrutura executável com TRIPWIRE de cobertura: o teste parseia
`docs/planos/2026-08-27-senna93-divergencias-esperadas.md` e falha se uma linha do markdown
não tiver matcher correspondente (ou vice-versa) — linha nova no md sem matcher = teste quebra.

**Files:**
- Create: `src/lib/shadow/allowlist.ts`
- Create: `src/lib/shadow/comparar.ts`
- Test: `tests/unit/shadow-allowlist.test.mjs`, `tests/unit/shadow-comparar.test.mjs`
- Read-only: `docs/planos/2026-08-27-senna93-divergencias-esperadas.md` (a fonte);
  `src/senna90/` módulos de frases (para calibrar os regexes — os textos NOVOS exatos);
  `src/app/api/admin/shadow-retroativo/route.ts:186-304` (comparador de frases atual —
  `compararLaudo`/`extrairLinhas`/`splitFrases`/`normalizar` MOVEM para `comparar.ts`).

**Interfaces:**
- Consumes: `simularTabelaLegado` NÃO — `compararTabelas` recebe rows prontas dos dois lados.
- Produces:
  ```ts
  // allowlist.ts
  export interface MatcherFrase { ref: string; casa(velho: string, novo: string): boolean }
  export const FRASES_ESPERADAS: MatcherFrase[];
  export const PARES_VR: { campo: string; legado: string; senna93: string; ref: string }[];
  export const TOL_CELULA: Record<string, number>;  // chave = `${linha},${col}` da zona comum
  export const LINHAS_MD_NAO_COMPARAVEIS: string[]; // refs do md sem matcher possível
  // comparar.ts
  export interface DivFrase { categoria: 'achado'|'conclusao'; velho: string; novo: string;
                              esperada: boolean; ref: string | null }
  export interface DivCelula { linha: number; col: number; legado: string; senna93: string;
                               esperada: boolean; ref: string | null }
  export function compararFrases(velho: {achados: string[]; conclusoes: string[]},
                                 novo: {achados: string[]; conclusoes: string[]}): DivFrase[];
  export function compararTabelas(senna93Rows: string[][], legadoRows: string[][]): DivCelula[];
  export { extrairLinhas } from movido;  // helpers da rota movem pra cá inalterados
  ```

Conteúdo dos matchers (cada um cita a linha do md por `ref` = `"{Task} {Domínio}"` exatos da
tabela, ex. `'F1-T3 Strain'`). O implementador CALIBRA cada regex contra os textos reais dos
módulos de frase (não inventar de memória) — a lista de entradas obrigatórias:

| ref | casa quando (esboço — calibrar no fonte) |
|---|---|
| `F1-T1 Aorta` | frase de aorta com grau/corte diferente entre velho/novo (raiz ♀ 37→38, aneurisma ≥45, arco dilatado) |
| `F1-T2 Aorta` | `/Ectasia/` no velho ↔ `/Dilata/` no novo; aneurisma 45-49 com índice/"critérios de maior gravidade" |
| `F3-fix Aorta` (sugestões) | velho contém `/sugere-se/i` ou `/angiotomografia|angiorressonância/i`, novo vazio |
| `F3-fix Aorta` (medindo) | novo `/Dilatação aneurismática da Raiz aórtica medindo/`, velho a mesma frase sem medida |
| `F3-fix Valvas` | estenose mitral: grau muda na faixa >1,5–2,0 (leve direto) |
| `F1-T3 Strain` | GLS VE: `/VR.*-1[89]|-16|-18/` — faixas novas vs binário 18/20 |
| `F1-T4 VD` | TAPSE: `/VR ≥ 20 mm/` no velho ↔ `/VR > 17 mm/` no novo |
| `F1-T5 Câmaras` | LAVI 42-48: `/importante/` velho ↔ `/moderad/` novo na frase de volume atrial E |
| `F1-T6 Diastólica` | velho com campo vazio na linha de números (`/= ;|=\s*$/`), novo sem |
| `F1-T7 Valvas` (2 linhas do md + a de esclerose) | estenose mitral/aórtica com grau diferente; `/[Ee]sclerose/` novo onde velho calava; tricúspide com gradiente impresso |
| `F1-T8 Paredes/valvas` | `/[Dd]iscinesia/`↔`/[Hh]ipocinesia/`; `/septal ?anterior|septal ?inferior/` com/sem espaço; morfologia AV |
| `F1-T9 Wilkins` | `/escore < 8|TOTAL/` — literal e componente-0 |
| `F1-T10 Massa/sistólica` | HVE/hipertrofia com corte diferente; `/apesar da alteração/`; conclusão segmentar isolada |
| `F3-T3 Rodapé/fontes` | linhas de rodapé/fontes (`/Lang 2015|ASE\/EACVI|Goldstein/`) — só se aparecerem no texto comparado |

`LINHAS_MD_NAO_COMPARAVEIS` (linhas do md que não são frase nem célula da zona comparada —
listar EXATAMENTE): as visuais/comportamentais `F3-T3 Tabela (visual)`, `F3-fix Tabela (visual)`,
`F3-T3fix Rodapé`, e TODA a seção "A VIRADA DO CABO" que não for célula (Caixas da sidebar,
Caixa Wilkins, Identificação, Word, Alertas, Proveniência, Emissão·tabela velha, Campo PSMAP,
Janela de carga). As linhas F3-T5 de CÉLULA (separador, casas, FE/FS, valores, linhas 10→12,
referências, sexo vazio) são cobertas por `PARES_VR`/`TOL_CELULA`/regras estruturais do
`compararTabelas` — o teste de cobertura aceita cobertura por qualquer um dos três mecanismos.

`PARES_VR` (zona comum das 10 linhas — pares exatos legado→senna93):
```ts
export const PARES_VR = [
  { campo: 'feT',  legado: '>51%',       senna93: '≥ 52%',       ref: 'F3-T5 Tabela · referências' },
  { campo: 'feT',  legado: '>53%',       senna93: '≥ 54%',       ref: 'F3-T5 Tabela · referências' },
  { campo: 'massa', legado: '<201 g',    senna93: '≤ 200 g',     ref: 'F3-T5 Tabela · referências' },
  { campo: 'massa', legado: '<151 g',    senna93: '≤ 150 g',     ref: 'F3-T5 Tabela · referências' },
  { campo: 'imVE', legado: '<103 g/m²',  senna93: '≤ 115 g/m²',  ref: 'F3-T5 Tabela · referências' },
  { campo: 'imVE', legado: '<89 g/m²',   senna93: '≤ 95 g/m²',   ref: 'F3-T5 Tabela · referências' },
  { campo: 'b7',   legado: '≤ 37 mm',    senna93: '≤ 38 mm',     ref: 'F1-T1 Aorta' },
];
```
(O implementador CONFERE os lados senna93 contra `refVal`/`refValues.ts` real — em especial o
imVE ♀ — e os lados legado contra o simulador da Task 1. Par que não existir de verdade sai.)

`TOL_CELULA` (colunas de valor 1 e 5; diferença numérica ≤ tol → esperada `'F3-T5 Tabela · valores'`,
após normalizar vírgula→ponto e remover `%`):
```ts
// col 1 (esquerda, mm/peso/altura): 0.11 em todas as linhas 1..9
// col 5 (direita): imc 0.11 · aoae 0.011 · vdf 0.11 · vsf 0.11 · feT 1.01 (pp)
//                  · fs 1.01 (pp) · massa 0.71 · imVE 0.61 · er 0.011 · asc 0.011
```
Regras estruturais do `compararTabelas`:
- Compara as linhas 0..9 (zona comum). Linhas 10-11 do Senna93 (asc/arco) NÃO são divergência
  (B14, `ref: 'F3-T5 Tabela · linhas'`) — não entram no resultado.
- Célula byte-igual → sem divergência. `'—'`/`'VIDE'` são comparados como texto.
- Coluna 3/7 (VR): igual → ok; par em `PARES_VR` → esperada; legado não-vazio + senna93 vazio
  → esperada `'F3-T5 Tabela · sexo vazio'` SÓ quando sexo é vazio (o comparador recebe o sexo?
  Não — regra mais simples e honesta: legado∈{'<25 kg/m²','30–40%','<0,43'} e senna93==='' →
  esperada C8; qualquer outro par → INESPERADA).
- Coluna 1/5 (valor): ambos numéricos e |Δ| ≤ tol → esperada; `'—'` vs número, VIDE vs número,
  Δ > tol, ou texto ≠ → INESPERADA.
- Coluna 0/4 (rótulo) e 2/6 (unidade): qualquer diferença → INESPERADA (estrutura quebrou).

`compararFrases`: mover `compararLaudo` + `extrairLinhas` + `splitFrases` + `normalizar` da
rota SEM mudar a lógica de pareamento (comparação estrita por conjunto normalizado), trocando
APENAS a classificação: `esperada`/`ref` vem de `FRASES_ESPERADAS` (primeiro matcher que
casar). As funções mortas `similaridade`/`maisSimilar` da rota NÃO vêm junto (morrem na T3).

- [ ] **Step 1: Teste de cobertura do markdown** (`tests/unit/shadow-allowlist.test.mjs`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRASES_ESPERADAS, PARES_VR, LINHAS_MD_NAO_COMPARAVEIS } from '../../src/lib/shadow/allowlist.ts';

const md = readFileSync('docs/planos/2026-08-27-senna93-divergencias-esperadas.md', 'utf8');
// refs do md: linhas de tabela "| F… | Domínio | …" das DUAS tabelas
const refsMd = [...md.matchAll(/^\| (F[0-9]-\w+|F3-fix|F3-T\d+\w*) \| ([^|]+?) \|/gm)]
  .map(m => `${m[1]} ${m[2].trim()}`);

test('toda linha do markdown tem cobertura (matcher, par de VR, tolerância ou não-comparável)', () => {
  const cobertas = new Set([
    ...FRASES_ESPERADAS.map(f => f.ref),
    ...PARES_VR.map(p => p.ref),
    ...LINHAS_MD_NAO_COMPARAVEIS,
    // refs cobertas por regra estrutural/tolerância do compararTabelas:
    'F3-T5 Tabela · separador', 'F3-T5 Tabela · casas', 'F3-T5 Tabela · FE/FS',
    'F3-T5 Tabela · valores', 'F3-T5 Tabela · linhas', 'F3-T5 Tabela · realce',
    'F3-T5 Tabela · sexo vazio',
  ]);
  const descobertas = refsMd.filter(r => !cobertas.has(r));
  assert.deepEqual(descobertas, [], `linhas do md sem cobertura: ${descobertas.join(' · ')}`);
});

test('todo matcher cita uma linha que EXISTE no markdown', () => {
  const setMd = new Set(refsMd);
  for (const f of [...FRASES_ESPERADAS, ...PARES_VR]) {
    assert.ok(setMd.has(f.ref), `ref fantasma: ${f.ref}`);
  }
});
```
(O regex de parse acima é um ESBOÇO — o implementador ajusta ao formato real das linhas do md,
que tem refs como `F1-T1`, `F3-fix`, `F3-T3fix`, `F3-T5`, `F3-T6`, e valida imprimindo os refs
extraídos. O que NÃO pode: afrouxar o assert de lista vazia.)

- [ ] **Step 2: Teste do comparador de células** (`tests/unit/shadow-comparar.test.mjs`) —
  usa `simularTabelaLegado(PADRAO)` da T1 × `montarRowsTabela` da fixture-padrão (mesmo setup
  do `senna93-tabela-pins.test.mjs`) e assere: **ZERO divergências INESPERADAS** no
  paciente-padrão (toda diferença real — 27.6/27,6, 181.3/181,9, VRs — classifica como
  esperada com o ref certo); depois injeta uma célula adulterada (ex. legado `'999.9'` na
  massa) e assere que ela sai INESPERADA (mutation-test do próprio comparador). Mais: caso
  sexo vazio (3 VRs C8) e caso ♀ 70a (par b7 37→38). Teste do `compararFrases`: um par
  velho/novo sintético com "Ectasia…"→"Dilatação…" sai esperada `F1-T2 Aorta`; uma frase
  inventada ("Frase que não existe.") sai inesperada.
- [ ] **Step 3: Rodar e ver falhar** — `npm run test:unit` → FAIL (módulos não existem).
- [ ] **Step 4: Implementar `allowlist.ts` + `comparar.ts`** (conteúdo acima; regexes
  calibrados nos fontes das frases).
- [ ] **Step 5: Rodar e ver passar** — `npm run test:unit` verde; `npx tsc --noEmit` limpo.
- [ ] **Step 6: Commit**

```bash
git add src/lib/shadow/allowlist.ts src/lib/shadow/comparar.ts tests/unit/shadow-allowlist.test.mjs tests/unit/shadow-comparar.test.mjs
git commit -m "feat(senna93-f4): allowlist estruturada (tripwire 1:1 com o markdown) + comparadores de celulas e frases"
git push
```

---

### Task 3: Core `rodarShadow` + rota com gate e persistência

**Files:**
- Create: `src/lib/shadow/rodar.ts`
- Modify: `src/app/api/admin/shadow-retroativo/route.ts` (reescrita para casca fina)
- Test: `tests/api/shadow-rodar.test.mjs`
- Read-only: `src/lib/exame-admin.ts:37` (`resolverPapel`), página Direx
  `src/app/direx/painel/motor-shadow/retroativo/page.tsx` (INTOCÁVEL — só pra conferir o
  contrato de resposta que precisa continuar valendo).

**Interfaces:**
- Consumes: `simularTabelaLegado` (T1), `compararFrases`/`compararTabelas`/`extrairLinhas` (T2),
  `calcular` + `montarRowsTabela` (já existentes), `dadosParaMedidas` (move da rota pra
  `rodar.ts` inalterada).
- Produces:
  ```ts
  export interface ShadowDeps {
    listarExames(wsId: string, from: Date, to: Date): Promise<{ id: string; dados: Record<string, unknown> }[]>;
    persistir(wsId: string, exec: ExecucaoShadow): Promise<string>;  // devolve execId
  }
  export interface ExameShadow {
    id: string; emitidoEm: string;
    era: 'senna90' | 'legado';           // emitidoEm >= ERA_SENNA90_DESDE ('2026-05-17')
    motorNumeros: string | null;          // proveniência gravada na F3 (se houver)
    frases: DivFrase[]; celulas: DivCelula[];
    pulado?: 'sem-medidas' | 'sem-texto' | 'erro-calculo';
  }
  export interface ExecucaoShadow {
    origem: 'retroativo' | 'cron' | 'script'; uid: string | null;
    from: string; to: string;
    resumo: ResumoShadow; exames: ExameShadow[];
  }
  export interface ResumoShadow {
    totalExames: number; comparados: number; pulados: number; match: number; diverge: number;
    frases: { esperadas: number; inesperadas: number; eraLegado: number };
    celulas: { esperadas: number; inesperadas: number };
  }
  export const ERA_SENNA90_DESDE = '2026-05-17';
  export function rodarShadow(deps: ShadowDeps, args: { wsId: string; from: Date; to: Date;
    origem: ExecucaoShadow['origem']; uid: string | null }): Promise<{ execId: string; exec: ExecucaoShadow }>
  ```
- A Task 4 pluga `snapshotCheck` — deixar `ExameShadow` extensível (campo opcional já tipado
  como `snapshotCheck?: { batem: boolean; difs: DivCelula[] } | null`).

Regras de negócio do `rodarShadow`:
1. Por exame: `dados.medidas` ausente/vazio → `pulado: 'sem-medidas'` (conta em pulados, sem
   comparação). `achados` E `conclusoes` ambos vazios → `pulado: 'sem-texto'`. `calcular()`
   lançou → `pulado: 'erro-calculo'` (hoje a rota engole com `continue` silencioso — passa a
   contar e a listar o id).
2. Frases: `compararFrases(salvo, calcular(medidas))` — divergências de exame com
   `era: 'legado'` NÃO contam em `frases.inesperadas`; contam em `frases.eraLegado`
   (informativo). Era = `emitidoEm >= ERA_SENNA90_DESDE` → `'senna90'` (fato 5 do plano).
3. Números: `montarRowsTabela(ident, medidas b7..b29, calcularDerivados(m), derivados.idade)`
   × `simularTabelaLegado(entrada)` → `compararTabelas`. Roda para TODAS as eras (motor×motor).
   As entradas dos dois lados saem do MESMO `dadosParaMedidas` (`b7..b13, b28, b29, sexo,
   peso, altura, dtnasc, dataExame`).
4. Persistência (via `deps.persistir`, implementada na rota com Admin SDK):
   - `workspaces/{ws}/privado/shadow/execucoes/{execId}` ← `{ rodadaEm: FieldValue.serverTimestamp(),
     origem, uid, from, to, resumo }`
   - `…/execucoes/{execId}/exames/{exameId}` ← um doc POR EXAME COM DIVERGÊNCIA (frases ou
     células), com `{ emitidoEm, era, motorNumeros, frases, celulas }`. Exame sem divergência
     e pulados NÃO ganham doc (estão no resumo). **NÃO gravar pacienteNome** (o exameId basta
     pra rastrear; minimização).
   - Escrita em lotes de ≤400 (padrão CHUNK do repo).
5. A resposta HTTP mantém o formato atual da página Direx (`{ ok, resumo: { totalExames,
   match, diverge, totalDivergencias, totalEsperadas, totalInesperadas }, exames: [{ id,
   pacienteNome, emitidoEm, total, esperadas, inesperadas, divergencias }] }`) — os campos
   antigos são DERIVADOS dos novos (`totalEsperadas` = frases esperadas + células esperadas +
   eraLegado; `totalInesperadas` = frases inesperadas (era senna90) + células inesperadas;
   `divergencias` = frases+células achatadas no shape antigo `{categoria, linha, velho, novo,
   esperada}`, com células como `categoria:'tabela'`, `velho`=legado, `novo`=senna93) — e
   ganham os ADITIVOS `execId`, `resumoV2: ResumoShadow`, `era` por exame. `pacienteNome`
   continua NA RESPOSTA (a página mostra) — só não vai pro Firestore.
6. Gate da rota: além do `verifyIdToken`, `resolverPapel(dbAdmin, wsId, uid)` tem que devolver
   `'dono'` ou `'medico'` — senão 403 `{ ok:false, error:'sem_acesso' }`. (Recepção não lê
   conteúdo clínico. Fecha o furo atual de leitura cross-tenant.) Ordem: 401 → 400 → 403
   (padrão da S5-T7).
7. Limpeza: `similaridade`/`maisSimilar`/`ESPERADAS`/`isEsperada` da rota MORREM (o comparador
   novo é a fonte). `dadosParaMedidas` move pra `rodar.ts` byte-idêntica (com o comentário do
   M4 da S5-T3 preservado).

- [ ] **Step 1: Teste do core** (`tests/api/shadow-rodar.test.mjs`) — `rodarShadow` com deps
  fake (padrão do repo: testar a função, não o handler HTTP):

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rodarShadow, ERA_SENNA90_DESDE } from '../../src/lib/shadow/rodar.ts';

function exameFixture(over = {}) {
  return {
    id: 'ex1',
    dados: {
      status: 'emitido',
      emitidoEm: { toDate: () => new Date('2026-08-20T12:00:00Z') },
      pacienteNome: 'Paciente Teste',
      pacienteDtnasc: '1980-05-15', dataExame: '2026-08-20',
      medidas: { sexo: 'M', peso: '80', altura: '170', b7: '34', b8: '40', b9: '50',
                 b10: '10', b11: '10', b12: '30' },
      achados: ['Ritmo cardíaco regular.'],
      conclusoes: ['Exame dentro dos limites da normalidade.'],
      ...over,
    },
  };
}

describe('rodarShadow', () => {
  test('persiste execução com resumo e só exames divergentes; devolve execId', async () => {
    const gravados = [];
    const deps = {
      listarExames: async () => [exameFixture()],
      persistir: async (wsId, exec) => { gravados.push({ wsId, exec }); return 'exec-1'; },
    };
    const { execId, exec } = await rodarShadow(deps, {
      wsId: 'ws1', from: new Date('2026-08-01'), to: new Date('2026-08-28'),
      origem: 'script', uid: null,
    });
    assert.equal(execId, 'exec-1');
    assert.equal(gravados.length, 1);
    assert.equal(exec.resumo.totalExames, 1);
    assert.equal(exec.resumo.comparados, 1);
    // nenhum doc de exame carrega pacienteNome
    for (const ex of exec.exames) assert.ok(!('pacienteNome' in ex));
  });

  test('exame sem medidas é pulado com motivo, não comparado', async () => {
    const deps = { listarExames: async () => [exameFixture({ medidas: {} })],
                   persistir: async () => 'e' };
    const { exec } = await rodarShadow(deps, { wsId: 'w', from: new Date(), to: new Date(),
                                               origem: 'script', uid: null });
    assert.equal(exec.resumo.pulados, 1);
    assert.equal(exec.exames[0].pulado, 'sem-medidas');
  });

  test('era: emitido antes de 2026-05-17 → frases vão pro balde eraLegado, não inesperadas', async () => {
    const deps = {
      listarExames: async () => [exameFixture({
        emitidoEm: { toDate: () => new Date('2026-04-10T12:00:00Z') },
        achados: ['Frase antiga do legado que o motor de hoje não gera.'],
      })],
      persistir: async () => 'e',
    };
    const { exec } = await rodarShadow(deps, { wsId: 'w', from: new Date(0), to: new Date(),
                                               origem: 'script', uid: null });
    assert.equal(exec.exames[0].era, 'legado');
    assert.equal(exec.resumo.frases.inesperadas, 0);
    assert.ok(exec.resumo.frases.eraLegado >= 1);
  });

  test('células: paciente-padrão não gera INESPERADA (allowlist cobre as diferenças reais)', async () => {
    const deps = { listarExames: async () => [exameFixture()], persistir: async () => 'e' };
    const { exec } = await rodarShadow(deps, { wsId: 'w', from: new Date(0), to: new Date(),
                                               origem: 'script', uid: null });
    assert.equal(exec.resumo.celulas.inesperadas, 0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm run test:api` → FAIL.
- [ ] **Step 3: Implementar `rodar.ts`** (regras 1-4 acima) e reescrever a rota como casca:
  auth (verifyIdToken) → parse/validação `wsId`/`from` (400) → gate `resolverPapel` ∈
  {dono, medico} (403) → `rodarShadow` com deps reais (`listarExames` = a query atual da rota,
  `persistir` = escrita em `privado/shadow/execucoes` com chunks) → montar resposta
  (regra 5). ATENÇÃO: manter `runtime='nodejs'`, `maxDuration=60`, `limit(200)` da query.
- [ ] **Step 4: Rodar tudo** — `npm run test:api` e `npm run test:unit` verdes,
  `npx tsc --noEmit` limpo, `npm run build` verde (a rota mudou).
- [ ] **Step 5: Commit**

```bash
git add src/lib/shadow/rodar.ts src/app/api/admin/shadow-retroativo/route.ts tests/api/shadow-rodar.test.mjs
git commit -m "feat(senna93-f4): rodarShadow persiste em privado/shadow/execucoes + gate de papel na rota (fecha leitura cross-tenant)"
git push
```

---

### Task 4: Validação simulador × snapshot pintado (`snapshot-params.ts`)

Para exames pós-25/08 emitidos com o LEGADO pintando (flag OFF — todo o histórico recente e a
janela de 7 dias), o snapshot `laudos-html/` contém a tabela que o legado REALMENTE pintou.
Comparar o simulador da T1 contra ela é a prova contínua de que o simulador imita o legado —
o teste ao vivo provou que o legado tem bugs latentes; sem esta checagem, um erro do simulador
viraria "divergência inesperada" fantasma (ou pior: mascararia uma real).

**Files:**
- Create: `src/lib/shadow/snapshot-params.ts`
- Modify: `src/lib/shadow/rodar.ts` (pluga o check) e a rota (dep `lerSnapshot` real)
- Test: `tests/unit/shadow-snapshot-params.test.mjs`
- Read-only: `src/lib/pdf-server.ts:99-111` (`lerSnapshotHtml`), `src/lib/pdf-params.ts:48-87`
  (`montarParamsHtml` — o formato do HTML que vai ser parseado).

**Interfaces:**
- Consumes: `lerSnapshotHtml(wsId, exameId)` já exportada de `pdf-server.ts`.
- Produces:
  ```ts
  // snapshot-params.ts
  export function extrairRowsDoSnapshot(html: string): string[][] | null;
  // rodar.ts — ShadowDeps ganha campo opcional:
  //   lerSnapshot?(wsId: string, exameId: string): Promise<string | null>
  // ExameShadow.snapshotCheck: { batem: boolean; difs: DivCelula[] } | null
  // ResumoShadow ganha: snapshot: { conferidos: number; batem: number; divergem: number }
  ```

Regras:
1. `extrairRowsDoSnapshot`: acha a tabela de parâmetros no HTML (a `<table>` com
   `table-layout:fixed` e `<colgroup>` de 8 `<col>` — formato único de `montarParamsHtml`),
   extrai `<td>` por `<tr>` do tbody, decodifica `&amp;`/`&lt;`/`&gt;`, trim. Devolve `null`
   se não achar a tabela ou se alguma linha não tiver 8 células (snapshot velho/estranho —
   não inventar).
2. No `rodarShadow`, para cada exame comparado com `deps.lerSnapshot` presente E
   `motorNumeros !== 'senna93'` (proveniência da F3 — se o Senna93 pintou, o snapshot não é
   do legado): ler snapshot; se existir e parsear, comparar CÉLULA A CÉLULA byte-exato contra
   `simularTabelaLegado` (as 10 linhas; se o snapshot tiver 12 linhas é pintura senna93
   escapada da proveniência → pular, contar como não-conferido). `batem: difs.length === 0`.
   `snapshotCheck` vai no doc do exame persistido (quando houver divergência OU quando
   `!batem` — simulador divergindo do pintado é achado por si, o exame ganha doc mesmo com
   frases/células limpas).
3. `lerSnapshot` real na rota = `lerSnapshotHtml` importada. O cron (T5) e o script (T6) usam
   a mesma dep.

- [ ] **Step 1: Teste** (`tests/unit/shadow-snapshot-params.test.mjs`): monta um HTML com o
  próprio `montarParamsHtml(rowsLegado, '#0A7C71', { pdf: true })` alimentado pelas rows do
  `simularTabelaLegado(PADRAO)` (T1) embrulhado num documento maior (prefixo/sufixo de HTML
  de laudo), e assere `extrairRowsDoSnapshot` devolve as MESMAS 10×8 strings (round-trip).
  Casos negativos: HTML sem a tabela → `null`; tabela com linha de 7 células → `null`.
- [ ] **Step 2: Rodar e ver falhar** — `npm run test:unit` → FAIL.
- [ ] **Step 3: Implementar + plugar no `rodarShadow` e na rota.** Teste extra no
  `shadow-rodar.test.mjs`: dep `lerSnapshot` devolvendo um snapshot ADULTERADO (massa
  `'999.9'`) → `snapshotCheck.batem === false` e exame ganha doc persistido.
- [ ] **Step 4: Rodar tudo** — `npm run test:unit` + `npm run test:api` verdes, `tsc` limpo.
- [ ] **Step 5: Commit**

```bash
git add src/lib/shadow/snapshot-params.ts src/lib/shadow/rodar.ts src/app/api/admin/shadow-retroativo/route.ts tests/unit/shadow-snapshot-params.test.mjs tests/api/shadow-rodar.test.mjs
git commit -m "feat(senna93-f4): validacao continua simulador x tabela pintada (snapshot laudos-html)"
git push
```

---

### Task 5: Cron diário da janela (`/api/cron/shadow-diario`)

**Files:**
- Create: `src/app/api/cron/shadow-diario/route.ts`
- Modify: `vercel.json` (segunda entrada de cron)
- Test: cobertura executável do handler segue o padrão do repo (nenhum teste importa
  `route.ts`) — o miolo já está testado na T3/T4; aqui o teste é a revisão + smoke pós-deploy.

**Interfaces:**
- Consumes: `rodarShadow` com as MESMAS deps reais da rota (extrair as deps reais para
  factory `depsAdmin()` em `rodar.ts` ou na própria rota — reuso, não cópia).
- Produces: rota GET; resposta `{ ok, workspaces: [{ wsId, execId, resumo }] , erros: [] }`.

Regras (espelhar `cleanup-worklist`):
1. `CRON_SECRET` fail-closed: sem secret em produção → 500; com secret e header errado → 401.
   Em dev sem secret, liberado (verbatim do padrão existente).
2. Itera TODOS os workspaces (`dbAdmin.collection('workspaces').get()` — mesmo laço do
   cleanup); janela `from = agora − 25h`, `to = agora` sobre `emitidoEm` (25h cobre folga de
   horário do cron; sobreposição de 1h entre rodadas é aceitável — execuções são fotografias
   independentes e o relatório agrega por exameId).
3. Workspace com 0 exames emitidos na janela → NÃO grava execução (sem lixo).
4. Erro em um workspace não derruba os demais (try/catch por ws, lista `erros`).
5. `vercel.json`: `{ "path": "/api/cron/shadow-diario", "schedule": "30 2 * * *" }`
   (23:30 Belém — depois do expediente, antes do cleanup das 03:00 UTC).
6. `maxDuration = 60`, `runtime = 'nodejs'`.

- [ ] **Step 1: Implementar a rota** (padrão acima; diff pequeno — a lógica é `rodarShadow`).
- [ ] **Step 2: `vercel.json`** — adicionar a entrada SEM tocar na existente.
- [ ] **Step 3: Verificação local**: `npm run build` verde; subir dev server e
  `curl http://localhost:3000/api/cron/shadow-diario` (dev sem CRON_SECRET → roda; conferir
  resposta JSON e, com um exame de teste na conta Gmail dentro da janela, conferir no console
  Firebase que `privado/shadow/execucoes/{execId}` apareceu SÓ no ws com exame).
- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/shadow-diario/route.ts vercel.json
git commit -m "feat(senna93-f4): cron diario da sombra (janela de acompanhamento, CRON_SECRET fail-closed)"
git push
```

---

### Task 6: Script CLI do retroativo + relatório

O retroativo sobre os 3 workspaces roda LOCAL (Admin SDK, sem depender de deploy nem de token
de membro — o gate da rota não se aplica a script de operador). O relatório agrupa divergência
por TEXTO normalizado (50 exames com o mesmo flip = 1 linha pra investigar).

**Files:**
- Create: `scripts/shadow/retroativo.mjs`
- Modify: `package.json` (script `"shadow:retroativo": "node --env-file=.env.local scripts/shadow/retroativo.mjs"`)
- Read-only: `scripts/secao1/lib-admin.mjs` (`getDb`, `COMMIT`, `modo`) — reusar.

**Interfaces:**
- Consumes: `rodarShadow` + deps reais (o `.mjs` importa `.ts` direto — padrão dos testes do
  repo, Node ≥24 type-stripping). `lerSnapshotHtml` para a dep de snapshot.
- Produces: uso `npm run shadow:retroativo -- --ws <wsId> --from 2026-01-01 [--to AAAA-MM-DD] [--commit]`.
  - SEM `--commit`: ensaio — roda a comparação inteira, imprime o relatório, NÃO persiste
    (dep `persistir` vira no-op que devolve `'ensaio'`).
  - COM `--commit`: persiste a execução (mesma dep real da rota).
  - Sem `--ws`: roda nos 3 da fase, hardcoded com comentário:
    `LDRtedkanx3bUvxpdmiL` (Grupo MedCardio, ~198 reais), `dIJfZvmsVFDrkod9eraJ`, `wader-dev`.
  - `limit` da query no script: 500 (o histórico da MedCardio inteiro; a rota mantém 200).

Relatório impresso (e é o formato que o controller leva pro Sergio no fechamento):
```
── workspace LDRtedkanx3bUvxpdmiL ─────────────────────────────
exames: 198 · comparados: 180 · pulados: 18 (sem-medidas 15, sem-texto 3)
match: 120 · divergem: 60
frases  — esperadas: 140 · INESPERADAS: 2 · era-legado (informativo): 310
células — esperadas: 400 · INESPERADAS: 0
snapshot — conferidos: 12 · batem: 12 · divergem: 0

INESPERADAS agrupadas (frases, era senna90):
  23× [achado] velho:"…" → novo:"…"        (ex.: ex Abc123, Def456, …até 5 ids)
   1× [tabela] linha 6 col 5 legado:"181.3" → senna93:"250,0"  (ex.: …)
```
Agrupamento: chave = `categoria + normalizar(velho) + '→' + normalizar(novo)` (frases) ou
`linha,col + legado + senna93` (células), com contagem e até 5 exameIds de exemplo.

- [ ] **Step 1: Implementar o script** (parse de args igual aos scripts de integracoes;
  `--commit` via `COMMIT`/`modo` do lib-admin; agrupamento acima).
- [ ] **Step 2: Ensaio real no workspace de teste**: `npm run shadow:retroativo -- --ws wader-dev --from 2026-01-01`
  → roda sem erro, imprime relatório (provavelmente 0-poucos exames). NADA persistido (é ensaio).
- [ ] **Step 3: Commit**

```bash
git add scripts/shadow/retroativo.mjs package.json
git commit -m "feat(senna93-f4): script CLI do retroativo (ensaio/--commit, relatorio agrupado por divergencia)"
git push
```

---

## Fechamento da fase (controller, não é task de subagente)

1. **Bateria completa**: `npm run test:unit` (piso novo ≥ 576+) · `npm run test:api` (≥ 212+) ·
   `npm run test:rules` (142) · wader vitest (104) · `npx tsc --noEmit` · `npm run build`.
   Nenhum piso rebaixado.
2. **Retroativo REAL** (local, antes do deploy): `npm run shadow:retroativo -- --from 2026-01-01 --commit`
   nos 3 workspaces. Ler o relatório. **Cada INESPERADA = investigação** (pode ser bug do
   Senna93 OU do legado — o teste ao vivo já provou bug latente no legado). Achado real →
   fix wave com revisor, allowlist só cresce com justificativa + linha nova no markdown
   (o tripwire da T2 força os dois juntos).
3. **Checkpoint com o Sergio**: relatório do retroativo + pedido de OK para merge master +
   deploy (fora do horário da clínica). O deploy liga o cron → começa a janela de ~7 dias.
4. **Pós-deploy**: verificação Vercel (rotas 200/401 como esperado; cron aparece no painel
   Vercel), conferir 1ª execução do cron no dia seguinte (`privado/shadow/execucoes` do ws
   com exame novo).
5. **Documentar**: ledger `.superpowers/sdd/progress.md`, ADR da F4 em `docs/decisoes/`,
   espelho Obsidian (`Leo/Decisões/`), memória local, push.
6. **Critério de saída da F4** (fecha só DEPOIS da janela): 0 divergências inesperadas no
   retroativo + janela acumulada limpa + relatório final pro Sergio. Os GATES DA VIRADA
   (smoke offline, cartão do kill-switch no runbook, e2e item 8, re-teste do modal) são da
   F5a — o plano da F5 os herda, esta fase NÃO os fecha.

## Self-review (feito na escrita)

- Spec §3 C1 coberto: persistência Admin SDK sem regra nova (T3), duas metades (T2/T3),
  allowlist versionada como fonte (T2 tripwire), retroativo + janela (T5/T6), 0 inesperadas
  como critério de saída (fechamento). b59/b60/b61 resolvido por era-bucketing (fato 5 —
  decisão declarada pro revisor da T3 desafiar).
- Furo de segurança da rota (qualquer autenticado × qualquer ws) fechado na T3 com
  `resolverPapel` — alinhado a "camadas S1-S5 não regridem".
- shadow-runner.ts: intocado (morto, morre na F5).
- Tipos consistentes entre tasks: `DivFrase`/`DivCelula` (T2) consumidos por T3/T4;
  `EntradaLegado` (T1) alimentado por `dadosParaMedidas` (T3); `ShadowDeps.lerSnapshot`
  opcional (T4) não quebra T3.
