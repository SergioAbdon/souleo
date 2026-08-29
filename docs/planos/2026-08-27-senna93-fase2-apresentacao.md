# Senna93 — Fase 2: Módulo de Apresentação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a metade da APRESENTAÇÃO que o legado ainda pinta — referências
(refVal) e realce (isOOR) por sexo+idade pra TODAS as linhas da tabela, formatação com
regra "VIDE", rodapé por domínio e o alerta de sexo ausente — como módulo PRONTO E
LIGADO A NADA (o cabo é a F3).

**Architecture:** `src/senna90/classificacoes/` reescrito conforme C3: `cutoffs.ts`
DELETADO (números vivem UMA vez — refVal/isOOR importam dos módulos vivos);
`isOOR.ts` e `refValues.ts` ganham `idade` na assinatura e os cortes VIVOS da spec §2;
novos `formatar.ts` (valorTabela + VIDE) e `fontes.ts` (rodapé). Zero importadores em
`src/` fora do próprio módulo até a F3 — só os testes consomem. Postura C8: **sem sexo,
NENHUMA linha mostra VR nem acende** (consistente, simples, seguro) + alerta
`SEXO_AUSENTE` explica o porquê.

**Spec:** `docs/superpowers/specs/2026-08-27-senna93-unificacao.md` §2.7 e §3 C3/C8.

## Global Constraints

- Placar-piso: unit **424** · api 212 · rules 142 · wader 104 · tsc/build limpos.
  Zero flip fora dos testes novos do módulo (nada do que roda hoje consome estes arquivos
  — qualquer flip em teste existente é defeito).
- `public/motor/motorv8mp4.js` leitura livre (paridade dos literais), edição PROIBIDA.
  `src/app/**` intocado. Teste de pureza vigia os arquivos novos.
- Fonte única dos números: onde um corte já vive num módulo do motor
  (ex.: WASE na aorta), o classificacoes IMPORTA — nunca copia. Onde o número só
  existia na tabela do legado (ex.: DDVE 42-58), ele passa a viver AQUI (vira a cópia
  canônica que a F5 aposenta do legado).
- Linhas cuja referência NÃO mudou usam o literal do legado BYTE-IDÊNTICO
  (conferir contra `motorv8mp4.js:1075-1097` e `:1196-1207` em leitura — paridade visual
  do PDF na virada). Linhas mudadas pela F1/spec usam os valores novos (b7 WASE, b28
  38/35, b29 ≤40, feT ≥52/54, imVE ≤115/95).
- Strings novas/alteradas são V13 (Sergio revisa no teste ao vivo). Não improvisar.
- Commits `feat(senna93-f2): ...`, push por task. NÃO usar git stash.

---

### Task 1: `isOOR.ts` reescrito — o realce por sexo+idade das 19 linhas

**Files:**
- Delete: `src/senna90/classificacoes/cutoffs.ts`
- Rewrite: `src/senna90/classificacoes/isOOR.ts`
- Modify: `src/senna90/calculos/aorta.ts` (SÓ adicionar `export` a `corteWaseRaiz` e
  `corteChamberAsc`, e exportar `const ARCO_NORMAL_MAX` — zero mudança de comportamento)
- Create: `tests/unit/senna93-isoor-pins.test.mjs`

**Interfaces (Produces — T2/T3/F3 consomem):**
```ts
export type CampoTabela =
  | 'b7' | 'b8' | 'b9' | 'b10' | 'b11' | 'b12' | 'b13' | 'b28' | 'b29'
  | 'imc' | 'aoae' | 'asc' | 'vdf' | 'vsf' | 'feT' | 'fs' | 'massa' | 'imVE' | 'er';
export function isOOR(campo: CampoTabela, valor: number | null, sexo: Sexo, idade: number | null): boolean;
```

- [ ] **Step 1: Reescrever `isOOR.ts`** (arquivo completo):

```ts
// ══════════════════════════════════════════════════════════════════
// LEO Senna93 — isOOR: realce (vermelho) da tabela de parâmetros
// ══════════════════════════════════════════════════════════════════
// Reescrito na F2 (spec §2.7/C3) a partir dos cortes VIVOS — a versão
// anterior era código morto que já tinha derivado em 7 pontos (A22).
// Regra C8: sexo vazio → NUNCA acende (nenhuma linha), o alerta
// SEXO_AUSENTE (F2-T4) explica. Valor null → nunca acende (decisão 19b:
// zero validação; ausência não é anormalidade).
// B13: as linhas de derivados (imc/vdf/vsf/feT/fs/massa/imVE/er) TAMBÉM
// acendem — a "metade direita sempre preta" do legado morreu.
// ══════════════════════════════════════════════════════════════════
import type { Sexo } from '../types';
import { corteWaseRaiz, corteChamberAsc, ARCO_NORMAL_MAX } from '../calculos/aorta';

export type CampoTabela =
  | 'b7' | 'b8' | 'b9' | 'b10' | 'b11' | 'b12' | 'b13' | 'b28' | 'b29'
  | 'imc' | 'aoae' | 'asc' | 'vdf' | 'vsf' | 'feT' | 'fs' | 'massa' | 'imVE' | 'er';

/** Teto da raiz p/ exibição: WASE por idade; sem idade, faixa 41-65 (paridade legado). */
export function tetoRaiz(sexo: Sexo, idade: number | null): number {
  if (idade === null) return sexo !== 'F' ? 40 : 36;
  return corteWaseRaiz(sexo, idade);
}

export function isOOR(
  campo: CampoTabela,
  valor: number | null,
  sexo: Sexo,
  idade: number | null
): boolean {
  if (valor === null || !sexo) return false;   // C8: sem sexo, nada acende
  const M = sexo !== 'F';
  switch (campo) {
    // ── coluna esquerda (medidas cruas, mm) ──
    case 'b7':  return valor > tetoRaiz(sexo, idade);          // só teto (WASE)
    case 'b8':  return M ? (valor < 30 || valor > 40) : (valor < 27 || valor > 38);
    case 'b9':  return M ? (valor < 42 || valor > 58) : (valor < 38 || valor > 52);
    case 'b10':
    case 'b11': return M ? (valor < 6 || valor > 10) : (valor < 6 || valor > 9);
    case 'b12': return M ? (valor < 25 || valor > 40) : (valor < 21 || valor > 35);
    case 'b13': return valor < 21 || valor > 35;
    case 'b28': return valor > corteChamberAsc(sexo);          // ≤38♂/≤35♀ (F1)
    case 'b29': return valor > ARCO_NORMAL_MAX;                // ≤40, sem sexo (F1)
    // ── coluna direita (derivados) — B13: passam a acender ──
    case 'imc':  return valor >= 25;                           // VR '<25'
    case 'vdf':  return M ? (valor < 62 || valor > 150) : (valor < 46 || valor > 106);
    case 'vsf':  return M ? (valor < 21 || valor > 61) : (valor < 14 || valor > 42);
    case 'feT':  return M ? valor < 0.52 : valor < 0.54;       // decimal 0-1 (≥52/54%)
    case 'fs':   return valor < 0.30 || valor > 0.40;          // VR '30-40%'
    case 'massa': return M ? valor > 200 : valor > 150;        // VR '<201'/'<151'
    case 'imVE': return M ? valor > 115 : valor > 95;          // V2 (Lang 2015)
    case 'er':   return valor > 0.42;                          // VR '<0,43'
    // ── sem referência definida — nunca acendem ──
    case 'aoae':
    case 'asc':  return false;
  }
}
```

- [ ] **Step 2: Exports na aorta** — em `calculos/aorta.ts`: `function corteWaseRaiz`
→ `export function corteWaseRaiz`; idem `corteChamberAsc`; `const ARCO_NORMAL_MAX` →
`export const ARCO_NORMAL_MAX`. NADA mais muda (diff de 3 palavras).

- [ ] **Step 3: DELETAR `cutoffs.ts`** — `git rm src/senna90/classificacoes/cutoffs.ts`.
Grep antes: zero importadores (só o próprio módulo morto antigo referenciava — se
isOOR.ts/refValues.ts antigos o importavam, a reescrita/T2 elimina; refValues.ts velho
NÃO deve quebrar o tsc: se importar cutoffs, substituir o import por um comentário
`// reescrito na T2` e stub temporário? NÃO — ordem certa: conferir se refValues.ts
importa cutoffs; se sim, a T1 TAMBÉM esvazia refValues.ts pra um stub mínimo
`export function refVal(): string { return ''; }` com aviso `// T2 reescreve`, pra
manter o build verde entre T1 e T2. Registrar no relatório o que foi feito.)

- [ ] **Step 4: Pins** — `tests/unit/senna93-isoor-pins.test.mjs`: TODAS as fronteiras
× sexo (× idade no b7): cada `case` com o par (último normal, primeiro OOR) — ex.:
b9 ♂ 58 false/59 true/42 false/41 true; b7 ♂30a 38/39, ♂ sem idade 40/41, ♀70a 38/39;
b28 ♂ 38/39; b29 40/41 (e IGUAL com sexo 'F' — sem distinção); feT ♂ 0.52 false? —
ATENÇÃO: feT ≥0.52 é normal → 0.52 false, 0.5199 true; imVE ♂ 115/115.1; er 0.42/0.43;
imc 24.9/25; fs 0.29/0.30/0.40/0.41; massa ♂ 200/200.1; aoae/asc sempre false;
sexo '' → TUDO false (amostrar 5 campos); valor null → false. ~45 asserts.

- [ ] **Step 5: Bateria + commit** — `npm run test:unit` (registrar novo total) +
`typecheck` + confirmar teste de pureza verde. Commit
`feat(senna93-f2): isOOR reescrito com sexo+idade — 19 linhas, cutoffs.ts morto (C3)` + push.

---

### Task 2: `refValues.ts` reescrito — a coluna VR impressa

**Files:**
- Rewrite: `src/senna90/classificacoes/refValues.ts`
- Create: `tests/unit/senna93-refval-pins.test.mjs`

**Interfaces (Produces):**
```ts
export function refVal(campo: CampoTabela, sexo: Sexo, idade: number | null): string;
```

- [ ] **Step 1: Reescrever** — strings por campo (sexo vazio → `''` em TODAS):

| Campo | ♂ | ♀ | Nota |
|---|---|---|---|
| b7 | `≤ ${tetoRaiz(sexo,idade)} mm` | idem | WASE dinâmico (importar `tetoRaiz` da T1) |
| b8 | `30-40 mm` | `27-38 mm` | literal legado byte-idêntico (conferir) |
| b9 | `42-58 mm` | `38-52 mm` | idem |
| b10/b11 | `6-10 mm` | `6-9 mm` | idem |
| b12 | `25-40 mm` | `21-35 mm` | idem |
| b13 | `21-35 mm` | igual | idem |
| b28 | `≤ 38 mm` | `≤ 35 mm` | NOVO (linha B14; Chamber/F1) |
| b29 | `≤ 40 mm` | igual | NOVO (régua do arco F1) |
| imc | `<25 kg/m²` | igual | literal legado |
| aoae/asc | `` | `` | sem VR (paridade) |
| vdf | `62-150 ml` | `46-106 ml` | literal legado |
| vsf | `21-61 ml` | `14-42 ml` | literal legado |
| feT | `≥ 52%` | `≥ 54%` | CORRIGIDO (era '>51%'/'>53%' — A9) |
| fs | `30-40%` | igual | literal legado |
| massa | `<201 g` | `<151 g` | literal legado |
| imVE | `≤ 115 g/m²` | `≤ 95 g/m²` | CORRIGIDO (V2; era '<103'/'<89') |
| er | `<0,43` | igual | literal legado |

Os "literal legado byte-idêntico": conferir contra `motorv8mp4.js` (leitura) e copiar
EXATO (hífen/travessão/espaços como estão lá). Os corrigidos são V13.

- [ ] **Step 2: Pins** — string exata de TODOS os campos × 2 sexos (+ b7 × 3 idades +
sem idade); sexo '' → `''` em todos (loop pelos 19).
- [ ] **Step 3: Teste de COERÊNCIA refVal↔isOOR** (no mesmo arquivo de pins): para
todo campo com `refVal !== ''`, existe fronteira em que `isOOR` vira true (nenhuma
referência impressa sem realce correspondente); e aoae/asc têm `refVal === ''` E
`isOOR === false` sempre (nunca vermelho sem VR que explique).
- [ ] **Step 4: Bateria + commit** `feat(senna93-f2): refVal por sexo+idade — coluna VR das 19 linhas (B14, A9, V2)` + push.

---

### Task 3: `formatar.ts` (valorTabela + VIDE) e `fontes.ts` (rodapé por domínio)

**Files:**
- Create: `src/senna90/classificacoes/formatar.ts`, `src/senna90/classificacoes/fontes.ts`
- Create: `tests/unit/senna93-formatar-pins.test.mjs`

**Interfaces (Produces — F3 consome):**
```ts
export function valorTabela(campo: CampoTabela, valor: number | null,
  opts?: { dsveAusente?: boolean; casas?: number }): string;
export function rodapeFontes(): string;
```

- [ ] **Step 1: `formatar.ts`**

```ts
// F2-T3 (spec §2.7): formatação da tabela SEM re-arredondar (B25 — os
// derivados já chegam truncados; aqui só fixamos casas e vírgula).
// Regra VIDE (C4/V10): feT/fs sem DSVE imprimem 'VIDE' (paridade legado);
// null por outro motivo imprime '—'.
import type { CampoTabela } from './isOOR';

const CASAS: Record<CampoTabela, number> = {
  b7: 0, b8: 0, b9: 0, b10: 0, b11: 0, b12: 0, b13: 0, b28: 0, b29: 0,
  imc: 1, aoae: 2, asc: 2, vdf: 1, vsf: 1, feT: 0, fs: 0, massa: 1, imVE: 1, er: 2,
};
// feT/fs viajam como decimal 0-1; a tabela exibe % (paridade legado: 0 casas).
const EM_PORCENTO: CampoTabela[] = ['feT', 'fs'];

function truncarExibicao(x: number, casas: number): string {
  const f = Math.pow(10, casas);
  const t = Math.trunc(x * f) / f;
  return t.toFixed(casas).replace('.', ',');
}

export function valorTabela(
  campo: CampoTabela,
  valor: number | null,
  opts: { dsveAusente?: boolean; casas?: number } = {}
): string {
  if (valor === null) {
    if ((campo === 'feT' || campo === 'fs') && opts.dsveAusente) return 'VIDE';
    return '—';
  }
  const casas = opts.casas ?? CASAS[campo];
  const v = EM_PORCENTO.includes(campo) ? valor * 100 : valor;
  return truncarExibicao(v, casas);
}
```

- [ ] **Step 2: `fontes.ts`** (V13 — redação exata; decisão 26/08 "rodapé por domínio"):

```ts
// F2-T3 (spec §2.7): o rodapé do PDF assinado creditava errado (B20 —
// dizia "ASE/EACVI 2015; ASE 2025" enquanto raiz=WASE 2022 etc.).
// Fonte por domínio, decisão 26/08. Consumido pelo PDF na F3.
export const FONTES_POR_DOMINIO = {
  camaras: 'Lang 2015 (ASE/EACVI)',
  aorta: 'Goldstein 2015 (ASE); ACC/AHA 2022; WASE 2022',
  coracaoDireito: 'ASE 2025 (coração direito)',
  strain: 'ASE/EACVI 2025 (strain)',
} as const;

export function rodapeFontes(): string {
  return 'Valores de referência: Lang 2015 (ASE/EACVI); Goldstein 2015 (ASE); ' +
    'ACC/AHA 2022; WASE 2022; ASE 2025 (coração direito); ASE/EACVI 2025 (strain).';
}
```

- [ ] **Step 3: Pins** — valorTabela: feT 0.7038 → '70' (0 casas, % — paridade legado);
feT 0.7038 com casas:1 → '70,3' (caixa calc-fe); null+dsveAusente → 'VIDE' (feT e fs);
null sem flag → '—'; massa 181.9 → '181,9'; er 0.42 → '0,42'; asc 1.91 → '1,91';
imc 27.6 → '27,6'; NUNCA arredonda: er 0.429 (se viesse cru) → '0,42' não '0,43'.
rodapeFontes: string exata pinada + as 4 chaves de FONTES_POR_DOMINIO.
- [ ] **Step 4: Bateria + commit** `feat(senna93-f2): valorTabela com VIDE + rodape por dominio (B20/B25/C4)` + push.

---

### Task 4: Alerta `SEXO_AUSENTE` + fechamento da coerência C8

**Files:**
- Modify: `src/senna90/types.ts` (união), `src/senna90/motor.ts` (gerarAlertas)
- Modify: `src/senna90/tests/casos/08-alertas.ts` (+2 casos), `tests/unit/senna90-suite.test.mjs` (piso)
- Modify: `tests/unit/senna93-isoor-pins.test.mjs` (se faltou algum campo no loop C8)

- [ ] **Step 1:** União ganha `'SEXO_AUSENTE'`. Em gerarAlertas:

```ts
  // Sexo ausente: as frases silenciam e (a partir da F3) a tabela fica sem
  // VR/realce — este alerta explica o porquê em vez de deixar o vazio mudo (C8).
  const temMedidaClinica = [
    m.camaras.raizAo, m.camaras.ae, m.camaras.ddve, m.camaras.septoIV,
    m.camaras.paredePosterior, m.camaras.dsve, m.camaras.vd,
    m.camaras.aoAscendente, m.camaras.arcoAo,
  ].some((v) => v !== null && v > 0);
  if (!m.gerais.sexo && temMedidaClinica) {
    alertas.push({
      tipo: 'SEXO_AUSENTE',
      campo: 'sexo',
      mensagem: 'Sexo não informado — referências e classificações dependentes de sexo estão suprimidas ou limitadas.',
      // (atualizada na T4 da onda diastologia 28/08)
    });
  }
```

- [ ] **Step 2:** Casos AL09 (ddve 50, sexo '' → alerta) e AL10 (ddve 50, sexo 'M' →
`alertasNaoPresentes`). Piso da suite sobe. Medidas vazias + sexo vazio → SEM alerta
(exame em branco não grita) — assert extra no AL09 ou caso próprio.
- [ ] **Step 3:** Bateria completa da fase (unit/api/rules/wader/tsc/build) + commit
`feat(senna93-f2): alerta SEXO_AUSENTE (C8)` + push.

---

### Fechamento da fase (controller)

- [ ] Bateria completa verde; grep confirma: classificacoes/ segue com ZERO importador
  em `src/` fora do próprio módulo (o cabo é a F3).
- [ ] Ledger + memória + Obsidian. Checkpoint: F3 pode partir (gate: fiação dos 4
  alertas na tela faz parte da F3).

## Self-Review

1. Spec §2.7: refVal/isOOR sexo+idade ✅T1/T2 · VIDE ✅T3 · realce estruturado B13/B15
   ✅T1 (o realce por REGEX morre na F3 junto com o cabo) · linhas B14 ✅T1/T2 · C8 ✅T1+T4
   · rodapé B20 ✅T3 · política numérica B25 ✅T3. C3 ✅ (cutoffs morto, idade na
   assinatura, números vivos importados).
2. Sem placeholder: código completo em cada step.
3. Tipos: CampoTabela definido na T1, importado em T2/T3; tetoRaiz exportado na T1 e
   usado na T2; assinaturas consistentes.
