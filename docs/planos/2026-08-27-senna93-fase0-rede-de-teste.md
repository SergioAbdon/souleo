# Senna93 — Fase 0: Rede de Teste — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Antes de mudar UMA fórmula, colocar toda a rede de segurança: os 72 casos do
Senna90 na esteira automática, pins do comportamento ATUAL de tudo que a F1 vai tocar,
o 9º contrato da ponte (`window.refluxoPulmonar`) e o teste de pureza do motor.

**Architecture:** Zero mudança de comportamento do app. Só arquivos de teste novos +
uma extensão do runner (`alertas`) + 1 arquivo novo de casos. Os pins gravam o
comportamento DE HOJE (baseline pré-F1) — a F1 vai mudá-los deliberadamente, e o diff
dos pins é o registro visível de cada mudança clínica.

**Tech Stack:** `node --test` + hook TS (`tests/unit/register-ts-resolve-hook.mjs`,
já usado por `senna90-diastolica-manual.test.mjs`). Imports de `.ts` levam a extensão
explícita (o hook resolve o grafo interno).

**Spec:** `docs/superpowers/specs/2026-08-27-senna93-unificacao.md` (§3 C9/C10, §8 teste
de pureza). Contrato: `docs/decisoes/2026-08-22-contrato-ponte-tela-motor.md`.

## Global Constraints

- Placar de partida que NENHUMA task pode rebaixar: unit **251** · api **212** ·
  rules **142** · wader **104** · `tsc --noEmit` e `npm run build` limpos.
- `public/motor/motorv8mp4.js` é INTOCÁVEL (leitura permitida; nesta fase NINGUÉM o edita).
- `src/app/laudo/[id]/page.tsx` NÃO é editado nesta fase (só lido por testes).
- Esta fase NÃO muda comportamento: `src/senna90/**` só pode ser editado nas Tasks 2
  (runner + casos novos) — e mesmo lá, ZERO mudança em `calculos/`, `achados/`,
  `conclusoes/`, `motor.ts`.
- Pins de baseline levam comentário-padrão:
  `// BASELINE pré-F1 — valor ATUAL do motor; a F1 muda este pin deliberadamente (spec §2.x)`.
- Commits pequenos, um por task, mensagem `test(senna93-f0): ...`. Push após cada commit.
- NÃO usar `git stash`.

---

### Task 1: Suite Senna90 (72 casos) dentro do `npm run test:unit`

**Files:**
- Create: `tests/unit/senna90-suite.test.mjs`

**Interfaces:**
- Consumes: `rodarCaso` e os 7 arrays de casos de `src/senna90/tests/` (existentes).
- Produces: os 72 casos viram subtests nomeados no `test:unit`; piso de contagem ≥72
  (Task 2 sobe o piso ao adicionar casos).

- [ ] **Step 1: Escrever o teste**

```js
// tests/unit/senna90-suite.test.mjs
// ══════════════════════════════════════════════════════════════════
// Senna93 F0-T1 (spec §3 C9): os 72 casos de src/senna90/tests/ na
// esteira automática. Antes desta task eles só rodavam por comando
// manual (`npx tsx src/senna90/tests/index.ts`) — qualquer regressão
// da unificação passava despercebida no commit.
// Cada caso vira um subtest nomeado; a falha imprime as `falhas` do
// runner (mesmo diagnóstico do relatório manual).
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rodarCaso } from '../../src/senna90/tests/runner.ts';
import { casosSaudaveis } from '../../src/senna90/tests/casos/01-saudaveis.ts';
import { casosCardiopatia } from '../../src/senna90/tests/casos/02-cardiopatia.ts';
import { casosValvopatias } from '../../src/senna90/tests/casos/03-valvopatias.ts';
import { casosDiastologia } from '../../src/senna90/tests/casos/04-diastologia.ts';
import { casosStrainHP } from '../../src/senna90/tests/casos/05-strain-hp.ts';
import { casosBordas } from '../../src/senna90/tests/casos/06-bordas.ts';
import { casosDiastologiaCompleta } from '../../src/senna90/tests/casos/07-diastologia-completa.ts';

const grupos = {
  '01-saudaveis': casosSaudaveis,
  '02-cardiopatia': casosCardiopatia,
  '03-valvopatias': casosValvopatias,
  '04-diastologia': casosDiastologia,
  '05-strain-hp': casosStrainHP,
  '06-bordas': casosBordas,
  '07-diastologia-completa': casosDiastologiaCompleta,
};

describe('Senna90 — suite completa na esteira (F0-T1)', () => {
  test('piso de contagem: a suite não pode encolher em silêncio', () => {
    const total = Object.values(grupos).flat().length;
    assert.ok(total >= 72, `suite encolheu: ${total} casos (piso 72)`);
  });
  for (const [grupo, casos] of Object.entries(grupos)) {
    describe(grupo, () => {
      for (const caso of casos) {
        test(`${caso.id} — ${caso.descricao}`, () => {
          const r = rodarCaso(caso);
          assert.ok(r.passou, `falhas do runner:\n  ${r.falhas.join('\n  ')}`);
        });
      }
    });
  }
});
```

- [ ] **Step 2: Rodar e conferir a contagem**

Run: `npm run test:unit`
Expected: PASS, contagem sobe de 251 para **324** (251 + 72 casos + 1 piso). Se algum
caso dos 72 falhar aqui, PARE: significa que a suite manual estava quebrada no master —
reportar ao controller, não "consertar" caso.

- [ ] **Step 3: tsc + build de sanidade**

Run: `npm run typecheck && npm run build`
Expected: limpos (nenhum código de produção mudou).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/senna90-suite.test.mjs
git commit -m "test(senna93-f0): 72 casos do senna90 entram no test:unit (C9)"
git push
```

---

### Task 2: Runner compara `alertas` + casos 08-alertas

**Files:**
- Modify: `src/senna90/tests/runner.ts` (interface `CasoTeste.esperado` + validação)
- Create: `src/senna90/tests/casos/08-alertas.ts`
- Modify: `src/senna90/tests/index.ts` (importar o grupo novo)
- Modify: `tests/unit/senna90-suite.test.mjs` (importar o grupo novo; piso 72 → 76)

**Interfaces:**
- Consumes: `AlertaUI.tipo` (`'IT_SEM_PSAP' | 'REFLUXO_PULM_SEM_PMAP'`, `types.ts:207`),
  `gerarAlertas` via `calcular()` (`motor.ts:74-94`).
- Produces: `esperado.alertas?: string[]` e `esperado.alertasNaoPresentes?: string[]`
  no `CasoTeste` (comparação por `tipo` exato) — F1/F4 usam.

- [ ] **Step 1: Escrever os casos novos (RED — o runner ainda ignora `alertas`)**

```ts
// src/senna90/tests/casos/08-alertas.ts
// F0-T2: o runner nunca comparou resultado.alertas — DC24 ("gera alerta
// visual") não verificava nada (inventário Senna90 §7/#79). Estes 4
// casos pinam os DOIS alertas estruturados do motor.
import type { CasoTeste } from '../runner';
import { medidasVazias } from '../helpers';

function comIT(psap: number | null): CasoTeste['inputs'] {
  const m = medidasVazias();
  m.diastolica.velocidadeIT = 3.1;   // b23 > 0
  m.diastolica.psap = psap;          // b37
  return m;
}
function comRefluxoPulm(pmap: number | null): CasoTeste['inputs'] {
  const m = medidasVazias();
  m.valvas.refluxoPulmonar = 'M';    // b40p preenchido
  m.valvas.pmap = pmap;              // psmap
  return m;
}

export const casosAlertas: CasoTeste[] = [
  {
    id: 'AL01',
    descricao: 'IT preenchida sem PSAP → alerta IT_SEM_PSAP',
    inputs: comIT(null),
    esperado: { alertas: ['IT_SEM_PSAP'] },
  },
  {
    id: 'AL02',
    descricao: 'IT preenchida COM PSAP → sem alerta',
    inputs: comIT(40),
    esperado: { alertasNaoPresentes: ['IT_SEM_PSAP'] },
  },
  {
    id: 'AL03',
    descricao: 'Refluxo pulmonar sem PMAP → alerta REFLUXO_PULM_SEM_PMAP',
    inputs: comRefluxoPulm(null),
    esperado: { alertas: ['REFLUXO_PULM_SEM_PMAP'] },
  },
  {
    id: 'AL04',
    descricao: 'Refluxo pulmonar COM PMAP → sem alerta',
    inputs: comRefluxoPulm(22),
    esperado: { alertasNaoPresentes: ['REFLUXO_PULM_SEM_PMAP'] },
  },
];
```

- [ ] **Step 2: Rodar ANTES de mexer no runner — provar que hoje não compara nada**

Adicione temporariamente `casosAlertas` ao `senna90-suite.test.mjs` e troque em AL01
`alertas: ['IT_SEM_PSAP']` por `alertas: ['ALERTA_QUE_NAO_EXISTE']`.
Run: `npm run test:unit` → Expected: **AL01 PASSA mesmo com alerta inexistente**
(prova o furo). Reverta a string.

- [ ] **Step 3: Estender o runner**

Em `src/senna90/tests/runner.ts`, dentro de `esperado` na interface `CasoTeste`:

```ts
    alertas?: string[];             // tipos de AlertaUI que DEVEM estar presentes
    alertasNaoPresentes?: string[]; // tipos que NÃO podem estar
```

E em `rodarCaso`, depois do bloco de conclusões-não-presentes:

```ts
  // Validar alertas (F0-T2 — antes disto, resultado.alertas era invisível ao runner)
  const tiposAlertas = resultado.alertas.map(a => a.tipo as string);
  if (caso.esperado.alertas) {
    for (const esperado of caso.esperado.alertas) {
      if (!tiposAlertas.includes(esperado)) {
        falhas.push(`alerta AUSENTE: "${esperado}" (presentes: [${tiposAlertas.join(', ')}])`);
      }
    }
  }
  if (caso.esperado.alertasNaoPresentes) {
    for (const indesejado of caso.esperado.alertasNaoPresentes) {
      if (tiposAlertas.includes(indesejado)) {
        falhas.push(`alerta INDESEJADO presente: "${indesejado}"`);
      }
    }
  }
```

- [ ] **Step 4: Ligar o grupo nos DOIS entry points**

`src/senna90/tests/index.ts`: `import { casosAlertas } from './casos/08-alertas';` e
`...casosAlertas` no fim de `todosCasos`.
`tests/unit/senna90-suite.test.mjs`: import + `'08-alertas': casosAlertas` em `grupos`
+ piso `>= 76`.

- [ ] **Step 5: Rodar tudo (inclusive a mutação de novo)**

Run: `npm run test:unit` → Expected: PASS, 324 → **328**.
Repita a mutação do Step 2 (alerta inexistente em AL01) → Expected: **FALHA** com
"alerta AUSENTE". Reverta. Rode `npx tsx src/senna90/tests/index.ts` → Expected: 76/76.

- [ ] **Step 6: tsc + Commit**

```bash
npm run typecheck
git add src/senna90/tests/ tests/unit/senna90-suite.test.mjs
git commit -m "test(senna93-f0): runner compara alertas + casos 08-alertas (fecha o furo do DC24)"
git push
```

---

### Task 3: Pins da aorta — os 3 tiers, comportamento ATUAL (baseline pré-F1)

**Files:**
- Create: `tests/unit/senna90-aorta-pins.test.mjs`

**Interfaces:**
- Consumes: `tierRaizAo(medidaMM, sexo, asc, idade, alturaCm)`,
  `tierAoAscendente(medidaMM, sexo, _asc, alturaCm)`, `tierArcoAo(medidaMM, sexo)`,
  `indiceAortaAltura(medidaMM, alturaCm)` de `src/senna90/calculos/aorta.ts`
  (retornam `SegmentoAortaResult { medidaMM, tier, indiceCm2m, graveIndice }`).
- Produces: baseline que a F1 edita task a task (o diff dos pins É o changelog clínico).

- [ ] **Step 1: Escrever os pins**

```js
// tests/unit/senna90-aorta-pins.test.mjs
// ══════════════════════════════════════════════════════════════════
// Senna93 F0-T3 (spec §3 C10): a aorta tinha 11 de 19 fórmulas sem
// teste (arco 100% descoberto, índice cm²/m nunca exercido, WASE
// nunca discriminado). Estes pins gravam o comportamento DE HOJE.
// BASELINE pré-F1 — a F1 muda estes pins deliberadamente (spec §2.2):
// arco vira ≤40/>40 sem sexo, aneurisma raiz/asc vira ≥45, raiz ♀>65
// vira 38. NÃO "corrigir" valores aqui; só fotografar.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  tierRaizAo, tierAoAscendente, tierArcoAo, indiceAortaAltura,
} from '../../src/senna90/calculos/aorta.ts';

const tier = (r) => r.tier;

describe('BASELINE aorta pré-F1 — tierRaizAo (WASE sexo+idade; aneurisma ≥50)', () => {
  // ♂: 38/40/41 por faixa (≤40 · 41-65 · ≥66) — fronteira exata é normal (corte é >)
  test('♂ 30a: 38 normal · 39 ectasia', () => {
    assert.equal(tier(tierRaizAo(38, 'M', null, 30, null)), 'normal');
    assert.equal(tier(tierRaizAo(39, 'M', null, 30, null)), 'ectasia');
  });
  test('♂ 50a: 40 normal · 41 ectasia', () => {
    assert.equal(tier(tierRaizAo(40, 'M', null, 50, null)), 'normal');
    assert.equal(tier(tierRaizAo(41, 'M', null, 50, null)), 'ectasia');
  });
  test('♂ 70a: 41 normal · 42 ectasia', () => {
    assert.equal(tier(tierRaizAo(41, 'M', null, 70, null)), 'normal');
    assert.equal(tier(tierRaizAo(42, 'M', null, 70, null)), 'ectasia');
  });
  // ♀: 35/36/37 — ATENÇÃO: a F1 muda a faixa ≥66 pra 38 (WASE cru 37,5)
  test('♀ 30a: 35 normal · 36 ectasia', () => {
    assert.equal(tier(tierRaizAo(35, 'F', null, 30, null)), 'normal');
    assert.equal(tier(tierRaizAo(36, 'F', null, 30, null)), 'ectasia');
  });
  test('♀ 50a: 36 normal · 37 ectasia', () => {
    assert.equal(tier(tierRaizAo(36, 'F', null, 50, null)), 'normal');
    assert.equal(tier(tierRaizAo(37, 'F', null, 50, null)), 'ectasia');
  });
  test('♀ 70a: 37 normal · 38 ectasia  // F1 → corte vira 38', () => {
    assert.equal(tier(tierRaizAo(37, 'F', null, 70, null)), 'normal');
    assert.equal(tier(tierRaizAo(38, 'F', null, 70, null)), 'ectasia');
  });
  test('aneurisma absoluto HOJE é 50 (49 ectasia · 50 aneurisma)  // F1 → 45', () => {
    assert.equal(tier(tierRaizAo(49, 'M', null, 30, null)), 'ectasia');
    assert.equal(tier(tierRaizAo(50, 'M', null, 30, null)), 'aneurisma');
  });
  test('sexo vazio conta como homem (nº24/C8 — a F1/F2 revisita)', () => {
    assert.equal(tier(tierRaizAo(39, '', null, 50, null)), 'normal');
  });
  test('idade null → rede de segurança Z-score (asc presente) segue ativa', () => {
    // ♂ asc 1.8: previsto = 1.92 + 0.74×1.8 = 3.252 cm, SD 0.19 →
    // 40 mm ⇒ z=(4.0−3.252)/0.19≈3.9 ⇒ acima do normal ⇒ ectasia
    assert.equal(tier(tierRaizAo(40, 'M', 1.8, null, null)), 'ectasia');
  });
});

describe('BASELINE aorta pré-F1 — tierAoAscendente (Chamber 38/35; aneurisma ≥50)', () => {
  test('♂: 38 normal · 39 ectasia · 50 aneurisma', () => {
    assert.equal(tier(tierAoAscendente(38, 'M', null, null)), 'normal');
    assert.equal(tier(tierAoAscendente(39, 'M', null, null)), 'ectasia');
    assert.equal(tier(tierAoAscendente(50, 'M', null, null)), 'aneurisma');
  });
  test('♀: 35 normal · 36 ectasia', () => {
    assert.equal(tier(tierAoAscendente(35, 'F', null, null)), 'normal');
    assert.equal(tier(tierAoAscendente(36, 'F', null, null)), 'ectasia');
  });
});

describe('BASELINE aorta pré-F1 — tierArcoAo (ACR/ACRIN 35/32 · 44/41)  // F1 → ≤40/>40 sem sexo', () => {
  test('♂: 35 normal · 36 ectasia · 43 ectasia · 44 aneurisma', () => {
    assert.equal(tier(tierArcoAo(35, 'M')), 'normal');
    assert.equal(tier(tierArcoAo(36, 'M')), 'ectasia');
    assert.equal(tier(tierArcoAo(43, 'M')), 'ectasia');
    assert.equal(tier(tierArcoAo(44, 'M')), 'aneurisma');
  });
  test('♀: 32 normal · 33 ectasia · 41 aneurisma', () => {
    assert.equal(tier(tierArcoAo(32, 'F')), 'normal');
    assert.equal(tier(tierArcoAo(33, 'F')), 'ectasia');
    assert.equal(tier(tierArcoAo(41, 'F')), 'aneurisma');
  });
  test('arco nunca tem índice', () => {
    const r = tierArcoAo(45, 'M');
    assert.equal(r.indiceCm2m, null);
    assert.equal(r.graveIndice, false);
  });
});

describe('BASELINE — indiceAortaAltura (π·r² em cm² ÷ altura em m, trunc 1)', () => {
  test('45 mm / 160 cm → 9.9 (graveIndice false na fronteira de baixo)', () => {
    assert.equal(indiceAortaAltura(45, 160), 9.9);
    assert.equal(tierRaizAo(45, 'M', null, 30, 160).graveIndice, false);
  });
  test('46 mm / 160 cm → ≥10 ⇒ graveIndice true', () => {
    const idx = indiceAortaAltura(46, 160);
    assert.ok(idx >= 10, `índice=${idx}`);
    assert.equal(tierRaizAo(46, 'M', null, 30, 160).graveIndice, true);
  });
  test('sem altura → null e nunca grave', () => {
    assert.equal(indiceAortaAltura(45, null), null);
    assert.equal(tierRaizAo(50, 'M', null, 30, null).graveIndice, false);
  });
});
```

- [ ] **Step 2: Rodar e VERIFICAR cada pin contra o cálculo de mão**

Run: `npm run test:unit`
Expected: PASS (328 → **~346**). Se ALGUM pin falhar: NÃO ajuste o pin às cegas —
recalcule à mão contra `aorta.ts` (cortes nas linhas 213-254, montagem 258-308).
Pin só grava valor observado quando o cálculo manual confirma. Divergência entre
observado e manual = achado, reportar ao controller.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/senna90-aorta-pins.test.mjs
git commit -m "test(senna93-f0): baseline da aorta pinada (3 tiers x sexo x idade + indice cm2/m)"
git push
```

---

### Task 4: Pins dos 12 derivados (a metade dos números)

**Files:**
- Create: `tests/unit/senna90-derivados-pins.test.mjs`

**Interfaces:**
- Consumes: `calcularDerivados(m)` de `src/senna90/motor.ts`; `medidasVazias()` de
  `src/senna90/tests/helpers.ts`; campos de `MedidasEcoTT` (`types.ts`).
- Produces: baseline exata dos 12 valores que a F3 vai passar a exibir.

- [ ] **Step 1: Escrever os pins**

```js
// tests/unit/senna90-derivados-pins.test.mjs
// ══════════════════════════════════════════════════════════════════
// Senna93 F0-T4 (spec §3 C10): vdf/vsf/fs/aoae nunca foram asseridos;
// massa nunca teve valor exato pinado. Estes são OS 12 números que a
// F3 vai começar a IMPRIMIR (tabela + caixas calc-*) — pinar antes.
// Política numérica ATUAL: truncar (não arredondar) — helpers/truncate.
// Valores esperados conferidos à mão (fórmulas no comentário de cada
// assert). BASELINE pré-F1: a F1 corrige o +0,6 da massa (B24) e este
// arquivo registra a mudança (181.3 → 181.9).
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcularDerivados } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

function pacientePadrao() {
  const m = medidasVazias();
  m.identificacao.pacienteDtnasc = '1980-05-15';
  m.identificacao.dataExame = '2026-08-27';        // → 46 anos
  m.gerais.sexo = 'M';
  m.gerais.peso = 80;                               // kg
  m.gerais.altura = 170;                            // cm
  m.camaras.raizAo = 34;                            // b7
  m.camaras.ae = 40;                                // b8
  m.camaras.ddve = 50;                              // b9
  m.camaras.septoIV = 10;                           // b10
  m.camaras.paredePosterior = 10;                   // b11
  m.camaras.dsve = 30;                              // b12
  m.estenoses.areaAo = 3.0;                         // b52 → aoIdx
  return m;
}

describe('BASELINE derivados pré-F1 — os 12 números da tabela (F0-T4)', () => {
  const d = calcularDerivados(pacientePadrao());

  test('idade por string (imune a fuso): 46', () => assert.equal(d.idade, 46));
  test('imc = 80/1.7² = 27.68… → trunc1 27.6', () => assert.equal(d.imc, 27.6));
  test('asc DuBois 71,84: 0.0001×71.84×80^0.425×170^0.725 ≈ 1.9154 → trunc2 1.91', () =>
    assert.equal(d.asc, 1.91));
  test('aoae = 34/40 = 0.85', () => assert.equal(d.aoae, 0.85));
  test('vdf Teichholz D=5.0cm: 7·125/(2.4+5) = 118.24… → trunc1 118.2', () =>
    assert.equal(d.vdf, 118.2));
  test('vsf Teichholz D=3.0cm: 7·27/(2.4+3) = 35.0', () => assert.equal(d.vsf, 35));
  test('feT decimal trunc4 (≈0.7039 — conferir truncagem exata do código)', () => {
    assert.ok(d.feT !== null && d.feT > 0.703 && d.feT < 0.705, `feT=${d.feT}`);
  });
  test('fs = 20/50 = 0.4', () => assert.equal(d.fs, 0.4));
  test('massa Devereux ATUAL (+0.6 dentro do /1000 — bug B24): ((70³−50³)·1.04·0.8+0.6)/1000 = 181.3766 → trunc1 181.3  // F1 → 181.9', () =>
    assert.equal(d.massa, 181.3));
  test('imVE = massa/asc = 181.3/1.91 = 94.92… → trunc1 94.9', () =>
    assert.equal(d.imVE, 94.9));
  test('er = (10+10)/50 = 0.4', () => assert.equal(d.er, 0.4));
  test('aoIdx = 3.0/1.91 = 1.570… → trunc2 1.57', () => assert.equal(d.aoIdx, 1.57));

  test('guardas null: sem peso → imc/asc/imVE/aoIdx null; sem dsve → vsf/feT/fs null', () => {
    const semPeso = pacientePadrao(); semPeso.gerais.peso = null;
    const d1 = calcularDerivados(semPeso);
    assert.equal(d1.imc, null); assert.equal(d1.asc, null);
    assert.equal(d1.imVE, null); assert.equal(d1.aoIdx, null);
    const semDsve = pacientePadrao(); semDsve.camaras.dsve = null;
    const d2 = calcularDerivados(semDsve);
    assert.equal(d2.vsf, null); assert.equal(d2.feT, null); assert.equal(d2.fs, null);
  });
});
```

- [ ] **Step 2: Rodar e verificar contra o cálculo de mão**

Run: `npm run test:unit`
Expected: PASS. Mesma regra da Task 3: pin que falhar → recalcular à mão contra
`ventricle.ts`/`demografia.ts` antes de ajustar; se o feT observado for exatamente
0.7039 ou 0.7038, TROCAR o assert de faixa por igualdade exata com o observado
(comentando de qual ordem de truncamento ele vem). Divergência inexplicável = achado.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/senna90-derivados-pins.test.mjs
git commit -m "test(senna93-f0): baseline dos 12 derivados pinada (valores exatos + guardas null)"
git push
```

---

### Task 5: Pins de TAPSE, GLS, LAVI e RAVI (as frases que a F1 muda)

**Files:**
- Create: `tests/unit/senna90-frases-pins.test.mjs`

**Interfaces:**
- Consumes: `calcular(m)` de `src/senna90/motor.ts`; `medidasVazias()`.
- Produces: baseline das frases; a F1 edita estes pins (TAPSE 20→17, GLS binário→3
  faixas, LAVI 48 imp→mod, RAVI conferido).

- [ ] **Step 1: Escrever os pins**

```js
// tests/unit/senna90-frases-pins.test.mjs
// ══════════════════════════════════════════════════════════════════
// Senna93 F0-T5 (spec §3 C10): TAPSE/GLS-conclusão/LAVI-bandas/RAVI
// sem pin. BASELINE pré-F1 — inclui pins de CONTRADIÇÕES conhecidas
// (B1: GLS −19 é "reduzido" no achado e "preservada" na conclusão),
// fotografadas de propósito: o diff da F1 mostra a cura.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

const temQueIncluir = (lista, trecho) =>
  assert.ok(lista.some((s) => s.includes(trecho)),
    `esperado trecho "${trecho}" em: ${JSON.stringify(lista, null, 1)}`);
const naoPodeIncluir = (lista, trecho) =>
  assert.ok(!lista.some((s) => s.includes(trecho)),
    `trecho proibido "${trecho}" presente em: ${JSON.stringify(lista, null, 1)}`);

describe('BASELINE TAPSE pré-F1 (F0-T5) — texto diz "VR ≥ 20 mm"  // F1 → "> 17"', () => {
  test('TAPSE 18 com VD preservado: sufixo com o VR ERRADO atual', () => {
    const m = medidasVazias();
    m.sistolica.tapse = 18;
    const r = calcular(m);
    temQueIncluir(r.achados, 'TAPSE= 18 mm (VR ≥ 20 mm)');
  });
});

describe('BASELINE GLS VE pré-F1 — contradição B1 fotografada  // F1 → 3 faixas −18/−16', () => {
  test('GLS −19: achado "reduzido" (corte |20|) E conclusão "preservada" (corte |18|) no MESMO laudo', () => {
    const m = medidasVazias();
    m.camaras.ddve = 50; m.camaras.dsve = 30;   // FE preservada p/ ativar concStrainVE
    m.gerais.sexo = 'M';
    m.sistolica.glsVE = -19;
    const r = calcular(m);
    temQueIncluir(r.achados, 'reduzido');            // strain.ts: |−19| < 20
    temQueIncluir(r.conclusoes, 'preservada');       // conclusoes: |−19| ≥ 18
  });
  test('GLS −21: normal nas duas pontas', () => {
    const m = medidasVazias();
    m.camaras.ddve = 50; m.camaras.dsve = 30; m.gerais.sexo = 'M';
    m.sistolica.glsVE = -21;
    const r = calcular(m);
    temQueIncluir(r.achados, '(VR ≥ -20%)');
    naoPodeIncluir(r.achados, 'reduzido');
  });
});

describe('BASELINE LAVI pré-F1 — j4: >34 leve · ≥42 mod · ≥48 IMP  // F1 → 48 vira moderado', () => {
  const comLavi = (v) => {
    const m = medidasVazias();
    m.diastolica.volAEindex = v;
    return calcular(m).achados;
  };
  test('35 → leve', () => temQueIncluir(comLavi(35), 'leve'));
  test('42 → moderado', () => temQueIncluir(comLavi(42), 'moderado'));
  test('48 → importante (ATUAL; Lang 2015 diz moderado — F1 corrige)', () =>
    temQueIncluir(comLavi(48), 'importante'));
  test('49 → importante', () => temQueIncluir(comLavi(49), 'importante'));
  test('34 → silêncio', () => naoPodeIncluir(comLavi(34), 'Átrio esquerdo aumentado'));
});

describe('BASELINE RAVI (JASE 2025 unificado) — j5: <30 sil · ≤36 leve · ≤41 mod · >41 imp', () => {
  const comRavi = (v) => {
    const m = medidasVazias();
    m.diastolica.volADindex = v;
    return calcular(m).achados;
  };
  test('29 → silêncio', () => naoPodeIncluir(comRavi(29), 'Átrio direito aumentado'));
  test('30 → leve', () => temQueIncluir(comRavi(30), 'leve'));
  test('37 → moderado', () => temQueIncluir(comRavi(37), 'moderado'));
  test('42 → importante', () => temQueIncluir(comRavi(42), 'importante'));
});
```

- [ ] **Step 2: Rodar e verificar**

Run: `npm run test:unit` → Expected: PASS. Pins que falharem seguem a regra das Tasks
3/4 (mão antes de ajuste). Atenção especial ao teste do GLS −19: se ELE falhar porque a
conclusão NÃO diz "preservada", confira `conclusoes/index.ts:180-188` — pode indicar
que a pré-condição de FE não foi satisfeita pelo caso; ajuste as medidas do caso (não
o pin da contradição) até `concStrainVE` ser emitida.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/senna90-frases-pins.test.mjs
git commit -m "test(senna93-f0): baseline TAPSE/GLS/LAVI/RAVI pinada (contradicao B1 fotografada)"
git push
```

---

### Task 6: 9º contrato da ponte — `window.refluxoPulmonar`

**Files:**
- Modify: `tests/unit/contrato-ponte-ids.test.mjs` (novo bloco de invariante (9))
- Modify: `docs/decisoes/2026-08-22-contrato-ponte-tela-motor.md` (documentar o 9º)

**Interfaces:**
- Consumes: fontes lidas como TEXTO (padrão do arquivo de teste — sem importar React):
  `src/app/laudo/[id]/page.tsx` (chamadas em :670-672 e :1736-1737) e
  `public/motor/motorv8mp4.js` (definição `function refluxoPulmonar(){` na :741,
  leitura READ-ONLY — arquivo intocável).
- Produces: invariante que OBRIGA as duas pontas a mudarem juntas na F3/F5.

- [ ] **Step 1: Escrever a invariante (seguir o padrão dos blocos (5)-(8) existentes)**

No `contrato-ponte-ids.test.mjs`, após o bloco (8), usando as mesmas variáveis de
fonte já carregadas no arquivo (`pageSrc` para page.tsx; carregar o motor com o mesmo
helper de leitura usado pela invariante (5)):

```js
  // ── (9) window.refluxoPulmonar — o contrato que o ADR de 22/08 não listou ──
  // page.tsx chama direto uma função definida pelo motor legado (achado do
  // levantamento Senna93, consumidores-e-sombra §A4). Se o motor sumir sem a
  // page parar de chamar (ou vice-versa), quebra sem exceção. A F3 migra o
  // consumidor; a F5 remove a definição — este teste força as pontas juntas.
  test('(9.1) o motor legado DEFINE refluxoPulmonar exatamente 1 vez', () => {
    const defs = (motorSrc.match(/function refluxoPulmonar\(/g) ?? []).length;
    assert.equal(defs, 1, `definições no motor: ${defs}`);
  });
  test('(9.2) page.tsx referencia window.refluxoPulmonar exatamente nos 2 call-sites conhecidos', () => {
    const refs = (pageSrc.match(/\.refluxoPulmonar as \(/g) ?? []).length;
    assert.equal(refs, 2,
      `call-sites na page: ${refs} (esperado 2 — mudou? atualize o ADR do contrato JUNTO)`);
  });
```

(Se a variável com o fonte do motor tiver outro nome no arquivo — ex.: `motorSrc` vs
`motorJs` — usar o nome real já existente; NÃO ler o arquivo uma segunda vez.)

- [ ] **Step 2: Rodar**

Run: `npm run test:unit` → Expected: PASS (os dois números batem hoje).
Mutação de sanidade: mude `assert.equal(refs, 2)` pra `3` → FALHA → reverta.

- [ ] **Step 3: Documentar no ADR**

Em `docs/decisoes/2026-08-22-contrato-ponte-tela-motor.md`, adicionar ao fim da lista
dos 8 contratos:

```markdown
9. **`window.refluxoPulmonar` (achado do levantamento Senna93, 26/08)** — `page.tsx`
   (:670, :1736) chama direto `window.refluxoPulmonar`, função definida pelo motor
   legado (`motorv8mp4.js:741`) que mostra/esconde `#field-psmap`. Fora da lista
   original do item 6. Invariante (9) do teste trava as duas pontas: a F3 do Senna93
   migra o consumidor, a F5 remove a definição — juntas, nunca uma só.
```

E no título/linha de status do ADR, onde diz "8 contratos", atualizar para "9 contratos"
(ocorrências no próprio ADR; NÃO editar outros documentos).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/contrato-ponte-ids.test.mjs docs/decisoes/2026-08-22-contrato-ponte-tela-motor.md
git commit -m "test(senna93-f0): 9o contrato da ponte — window.refluxoPulmonar travado por teste (C5)"
git push
```

---

### Task 7: Teste de pureza do motor (pré-requisito estrutural)

**Files:**
- Create: `tests/unit/senna90-pureza.test.mjs`

**Interfaces:**
- Consumes: os fontes de `src/senna90/**/*.ts` lidos como texto (`node:fs`).
- Produces: contrato "o grafo do motor é puro" — vale pra sombra (F4), pro server e
  pra qualquer decisão futura sobre onde o motor roda.

- [ ] **Step 1: Escrever o teste**

```js
// tests/unit/senna90-pureza.test.mjs
// ══════════════════════════════════════════════════════════════════
// Senna93 F0-T7 (spec §8): o motor ser TS puro (sem imports node-only,
// sem framework) hoje é acidente de convenção. Este teste vira
// contrato: qualquer import de runtime específico dentro do grafo de
// produção do motor quebra o build de teste na hora.
// Fora do escopo (não são o motor de produção): tests/, smoke-test.ts,
// teste-prod-aorta.ts, valida-exames-reais.ts (scripts manuais).
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = join(process.cwd(), 'src', 'senna90');
const FORA = [/[\\/]tests[\\/]/, /smoke-test\.ts$/, /teste-prod-aorta\.ts$/, /valida-exames-reais\.ts$/];
// Import proibido no motor de produção: builtins do Node, firebase, next, react.
const PROIBIDO = /from\s+['"](node:[^'"]*|fs|path|os|crypto|http|https|child_process|firebase[^'"]*|next[^'"]*|react[^'"]*)['"]/g;

function arquivosTs(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...arquivosTs(p));
    else if (nome.endsWith('.ts')) saida.push(p);
  }
  return saida;
}

describe('Senna90/93 — pureza do motor (F0-T7)', () => {
  const alvos = arquivosTs(RAIZ).filter((p) => !FORA.some((rx) => rx.test(p)));

  test('piso de sanidade: a varredura enxerga o motor (≥ 15 arquivos)', () => {
    assert.ok(alvos.length >= 15, `só ${alvos.length} arquivos — o filtro esvaziou?`);
  });

  test('nenhum arquivo do motor importa runtime específico (node/firebase/next/react)', () => {
    const violacoes = [];
    for (const p of alvos) {
      const fonte = readFileSync(p, 'utf8');
      for (const m of fonte.matchAll(PROIBIDO)) {
        violacoes.push(`${relative(process.cwd(), p)} → import de '${m[1]}'`);
      }
    }
    assert.deepEqual(violacoes, [], `o motor deixou de ser puro:\n${violacoes.join('\n')}`);
  });
});
```

- [ ] **Step 2: Rodar + mutação de sanidade**

Run: `npm run test:unit` → Expected: PASS.
Mutação: adicione temporariamente `import { readFileSync } from 'node:fs';` no topo de
`src/senna90/helpers/format.ts`, rode → Expected: FALHA apontando o arquivo. **Reverta
imediatamente** (`git checkout -- src/senna90/helpers/format.ts`) e rode de novo verde.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/senna90-pureza.test.mjs
git commit -m "test(senna93-f0): pureza do motor vira contrato (nenhum import node/firebase/next/react)"
git push
```

---

### Fechamento da fase (controller)

- [ ] Bateria completa: `npm run test:unit` (novo piso ~360+, registrar o número),
  `npm run test:api` (212), `npm run test:rules` (142), `cd apps/wader && npx vitest run`
  (104), `npm run typecheck`, `npm run build` — TUDO verde.
- [ ] Ledger `.superpowers/sdd/progress.md` + memória + Obsidian.
- [ ] Checkpoint com o Sergio: novo placar registrado; F1 pode partir.

## Self-Review (executada na escrita)

1. Spec §3 C9 → Tasks 1-2. C10 → Tasks 3-5. C5 → Task 6. §8 teste de pureza → Task 7.
   Sem lacuna de F0.
2. Sem placeholders: todo step tem código ou comando literal.
3. Tipos conferidos contra `types.ts`/`runner.ts`/`aorta.ts` reais (assinaturas lidas
   nesta sessão). Únicos pontos deliberadamente "verifique o observado": valores
   truncados de mão (Tasks 3-5), com procedimento explícito anti-ajuste-cego.
