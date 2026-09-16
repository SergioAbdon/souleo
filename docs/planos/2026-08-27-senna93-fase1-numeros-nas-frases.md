# Senna93 — Fase 1: Números certos nas frases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir, DENTRO do Senna90 (a metade que já está no ar), todas as decisões
clínicas fechadas da spec §2 — aorta ACC/AHA, GLS 3 faixas, TAPSE 17, LAVI, diastólica,
valvas, Wilkins, massa/IMVE, sistólica — cada mudança com o pin da F0 virando junto
(o diff dos pins É o changelog clínico).

**Architecture:** Só `src/senna90/**` e testes. Cada task: (1) atualiza os testes/pins
que tem LICENÇA de virar (listados na task, com o valor novo), (2) muda a fórmula/texto,
(3) roda a suite inteira — qualquer teste que vire SEM licença é regressão, não avanço.
Toda mudança de comportamento clínico é registrada por append em
`docs/planos/2026-08-27-senna93-divergencias-esperadas.md` (a allowlist que a sombra da
F4 vai consumir — criada na Task 1).

**Tech Stack:** os mesmos da F0. Spec: `docs/superpowers/specs/2026-08-27-senna93-unificacao.md`
(§0 precedência, §2 números finais, §7 vetos V1-V14).

## Global Constraints

- Placar-piso ao INICIAR a fase: unit **374** · api **212** · rules **142** · wader **104**
  · tsc/build limpos. Cada task registra o novo unit no relatório (pode subir; nunca descer
  além dos flips SANCIONADOS pela própria task).
- `public/motor/motorv8mp4.js` INTOCÁVEL. `src/app/**` INTOCÁVEL nesta fase (nem 1 linha).
  Direx intocável. Decisão 19b: zero validação de faixa clínica (guardas continuam só
  null/≤0). Decisão nº24: sexo vazio → frases silenciam (comportamento atual preservado).
- Teste de pureza (F0-T7) vigia: nenhum import novo de node/firebase/next/react no motor.
- Flips de teste: SÓ os listados na própria task. Um caso do runner que quebre e NÃO
  esteja na licença → investigar; se a mudança estiver certa e o caso pinava o
  comportamento antigo, o flip entra no relatório com justificativa clínica (arquivo:linha
  da spec) e o revisor adjudica. Flip silencioso (sem menção no relatório) = defeito.
- Toda task que muda saída clínica APPENDA uma linha em
  `docs/planos/2026-08-27-senna93-divergencias-esperadas.md`:
  `| <task> | <domínio> | <o que mudou> | <spec §> |` (tabela; T1 cria o arquivo).
- Commits `feat(senna93-f1): ...`, push por task. NÃO usar git stash.
- Textos novos de laudo (nota cirúrgica, angio-TC/RM, limítrofe do GLS, esclerose): usar
  a redação EXATA deste plano (V13 — o Sergio revisa no teste ao vivo da fase; não
  improvisar variantes).

---

### Task 1: Aorta — a régua nova em `calculos/aorta.ts` (ACC/AHA 2022 + WASE ♀38)

**Files:**
- Modify: `src/senna90/calculos/aorta.ts`
- Modify (mecânico, só chamadas/comparações — ZERO texto): `src/senna90/achados/aorta.ts`,
  `src/senna90/conclusoes/index.ts`
- Modify: `src/senna90/motor.ts` + `src/senna90/types.ts` (alerta novo)
- Modify: `src/senna90/tests/casos/08-alertas.ts` (+1 caso), `tests/unit/senna90-aorta-pins.test.mjs` (flips licenciados)
- Create: `docs/planos/2026-08-27-senna93-divergencias-esperadas.md`

**Interfaces (Produces — T2 consome):**
- `type TierAorta = 'normal' | 'dilatacao' | 'aneurisma'` (o literal `'ectasia'` DEIXA de existir).
- `SegmentoAortaResult` ganha `notaCirurgica: boolean` (raiz/asc ≥50 · arco ≥55).
- `tierArcoAo(medidaMM: number): SegmentoAortaResult` (SEM sexo; arco nunca é 'aneurisma').
- `AlertaUI.tipo` ganha `'AORTA_SEM_IDADE'`.

- [ ] **Step 1: Reescrever a régua em `calculos/aorta.ts`**

Substituições exatas (resto do arquivo intocado):

```ts
export type TierAorta = 'normal' | 'dilatacao' | 'aneurisma';

export interface SegmentoAortaResult {
  medidaMM: number;
  tier: TierAorta;
  indiceCm2m: number | null; // só Raiz/Asc (precisa altura)
  graveIndice: boolean;      // indiceCm2m !== null && >= 10
  notaCirurgica: boolean;    // raiz/asc >= 50 mm · arco >= 55 mm (ACC/AHA 2022)
}

// ACC/AHA 2022 (spec Senna93 §2.2): dilatação = acima do previsto p/ sexo+idade
// e < 45 mm; ANEURISMA >= 45 mm (adulto médio); 50/55 = limiares CIRÚRGICOS
// (nota de encaminhamento, não mudança de nome). "Ectasia leve/mod/imp" morreu.
const ANEURISMA_MM_RAIZ_ASC = 45;
const NOTA_CIRURGICA_MM_RAIZ_ASC = 50;
// Arco: NENHUMA diretriz tabula normal do arco; teto prático ~40 mm (ACC/AHA,
// "aproximado, não validado"). > 40 = "dilatado" SEM graus; >= 55 = cirurgia.
const ARCO_NORMAL_MAX = 40;
const NOTA_CIRURGICA_MM_ARCO = 55;
```

`corteWaseRaiz` (WASE 2022 Tab.3; ♀ ≥66 anos vira **38** — 37,5 cru arredonda):

```ts
function corteWaseRaiz(sexo: Sexo, idade: number): number {
  const homem = sexo !== 'F';
  if (idade <= 40) return homem ? 38 : 35;
  if (idade <= 65) return homem ? 40 : 36;
  return homem ? 41 : 38;
}
```

`montarTierRaizAsc` e `tierArcoAo`:

```ts
function montarTierRaizAsc(
  acimaDoNormal: boolean,
  medidaMM: number,
  alturaCm: number | null
): SegmentoAortaResult {
  const indiceCm2m = indiceAortaAltura(medidaMM, alturaCm);
  const graveIndice = indiceCm2m !== null && indiceCm2m >= 10;
  const notaCirurgica = medidaMM >= NOTA_CIRURGICA_MM_RAIZ_ASC;
  if (!acimaDoNormal && medidaMM < ANEURISMA_MM_RAIZ_ASC) {
    return { medidaMM, tier: 'normal', indiceCm2m, graveIndice, notaCirurgica };
  }
  const tier: TierAorta = medidaMM >= ANEURISMA_MM_RAIZ_ASC ? 'aneurisma' : 'dilatacao';
  return { medidaMM, tier, indiceCm2m, graveIndice, notaCirurgica };
}

/** Arco — sem sexo, sem graus, sem índice (spec §2.2, decisão do arco 26/08). */
export function tierArcoAo(medidaMM: number): SegmentoAortaResult {
  const tier: TierAorta = medidaMM > ARCO_NORMAL_MAX ? 'dilatacao' : 'normal';
  return {
    medidaMM, tier, indiceCm2m: null, graveIndice: false,
    notaCirurgica: medidaMM >= NOTA_CIRURGICA_MM_ARCO,
  };
}
```

DELETAR inteiras (mortas, zero chamadores — as réguas de casa morrem):
`classificarAoAscendente`, `classificarArcoAo`. `classificarRaizAo`/`classificarPorZ`/
`classificarPorFallback` FICAM (rede de segurança quando `idade === null`).
Atualizar o comentário-cabeçalho do bloco SPEC AORTA pra citar a spec Senna93.

- [ ] **Step 2: Ajustes mecânicos nos consumidores (SEM mudar texto)**

- `achados/aorta.ts`: chamadas `tierArcoAo(b29, sexo)` → `tierArcoAo(b29)` (2 sites:
  jAortaRaiz:97 e jArcoAortico:125; e jAortaNormaisComplementar:151).
- `conclusoes/index.ts` concAorta: `tierArcoAo(d.b29, d.sexo)` → `tierArcoAo(d.b29)`;
  as TRÊS comparações `r.tier === 'ectasia'` → `r.tier === 'dilatacao'` (textos "Ectasia…"
  ficam como estão — a T2 troca).

- [ ] **Step 3: Alerta `AORTA_SEM_IDADE`**

`types.ts:208`: união vira `'IT_SEM_PSAP' | 'REFLUXO_PULM_SEM_PMAP' | 'AORTA_SEM_IDADE'`.
`motor.ts` gerarAlertas (importar `calcIdade` de `./calculos/demografia`):

```ts
  // Raiz aórtica medida sem data de nascimento → classificação cai no Z-score
  // (rede de segurança). O Senna93 AVISA em vez de escolher em silêncio (spec A7).
  if (m.camaras.raizAo && m.camaras.raizAo > 0
      && calcIdade(m.identificacao.pacienteDtnasc, m.identificacao.dataExame) === null) {
    alertas.push({
      tipo: 'AORTA_SEM_IDADE',
      campo: 'dtnasc',
      mensagem: 'Raiz aórtica medida sem data de nascimento — referência por idade indisponível (usando previsão por superfície corporal).',
    });
  }
```

`casos/08-alertas.ts`: +1 caso AL05 (raizAo 34, sem dtnasc → `alertas: ['AORTA_SEM_IDADE']`)
e acrescentar `alertasNaoPresentes: ['AORTA_SEM_IDADE']` no caso que tiver raiz + idade
(se nenhum tiver, +1 caso AL06 com raiz 34 e datas preenchidas). Piso da suite sobe junto.

- [ ] **Step 4: Flips LICENCIADOS em `tests/unit/senna90-aorta-pins.test.mjs`**

Reescrever os pins para a régua NOVA (remover os avisos "F1 muda"): ♀ 70a: **38 normal ·
39 dilatacao**; aneurisma raiz/asc: **44 dilatacao · 45 aneurisma** (com `notaCirurgica
false` em 45-49 e `true` em ≥50); ascendente ♂ 39/♀ 36 viram `'dilatacao'`; arco (sem
sexo): **40 normal · 41 dilatacao · 54 sem nota · 55 com nota**, `tier` nunca
`'aneurisma'`; todos os `'ectasia'` → `'dilatacao'`; Z-score com idade null: 40mm/asc1.8
→ `'dilatacao'`. Casos do runner que citem tier/frases de aorta: atualizar SÓ os que
quebrarem, listando cada um no relatório (B09/B10/S01 esperados — B10 asc 50 continua
aneurisma; textos só mudam na T2).

- [ ] **Step 5: Criar `docs/planos/2026-08-27-senna93-divergencias-esperadas.md`**

```markdown
# Senna93 — Divergências esperadas (allowlist da sombra, F4)
Cada linha = mudança clínica DELIBERADA da F1 (spec §2). A sombra da F4 trata
divergência que case com estas linhas como esperada; qualquer outra é achado.

| Task | Domínio | O que mudou | Spec |
|---|---|---|---|
| F1-T1 | Aorta | Raiz ♀≥66a: corte 37→38 (WASE) · aneurisma raiz/asc ≥50→≥45 (ACC/AHA 2022) · arco: 3 réguas → ≤40 normal/>40 dilatado sem graus · notaCirurgica ≥50/≥55 · alerta AORTA_SEM_IDADE novo | §2.2 |
```

- [ ] **Step 6: Bateria + commit**

`npm run test:unit` (registrar contagem) · `npm run typecheck` · commit
`feat(senna93-f1): aorta ACC/AHA 2022 — aneurisma >=45, arco 40/55 sem graus, WASE F38, nota cirurgica, alerta idade` · push.

---

### Task 2: Aorta — as frases novas (achados + conclusões)

**Files:**
- Modify: `src/senna90/achados/aorta.ts`, `src/senna90/conclusoes/index.ts` (concAorta),
  `src/senna90/achados/index.ts` (1 chamada nova), runner casos afetados,
  `tests/unit/senna90-frases-pins.test.mjs` (+pins novos de aorta), allowlist (append).

**Interfaces:**
- Consumes: `SegmentoAortaResult` da T1 (`tier: 'dilatacao'`, `notaCirurgica`).
- Produces: `jAortaAngioTC(b29: number | null, b42: '' | 's' | 'nv', sexo: Sexo): string`
  exportada de `achados/aorta.ts`.

- [ ] **Step 1: Textos em `achados/aorta.ts`** (redação V13 — usar EXATA):

```ts
const NOTA_CIRURGICA_RAIZ_ASC =
  ' Diâmetro ≥ 50 mm: sugere-se avaliação cirúrgica especializada (ACC/AHA 2022).';
const NOTA_CIRURGICA_ARCO =
  ' Diâmetro ≥ 55 mm: sugere-se avaliação cirúrgica especializada (ACC/AHA 2022).';

// I1 da revisão da T1: com aneurisma ≥45, o índice NÃO pode sumir do texto na
// faixa 45-49 (índice = sinalização de risco cirúrgico, spec §2.2). O ramo de
// aneurisma passa a carregar o índice quando disponível.
function sufixoIndice(r: SegmentoAortaResult): string {
  return r.indiceCm2m !== null ? `, ${fmtIdx(r.indiceCm2m)} cm²/m ${NOTA_INDICE}` : '';
}

function comentarioRaiz(r: SegmentoAortaResult): string {
  if (r.tier === 'aneurisma') {
    return `Dilatação aneurismática da Raiz aórtica${sufixoIndice(r)}.`
      + (r.notaCirurgica ? NOTA_CIRURGICA_RAIZ_ASC : '');
  }
  if (r.indiceCm2m !== null) {
    return `Dilatação da Raiz aórtica, ${fmtIdx(r.indiceCm2m)} cm²/m ${NOTA_INDICE}.`;
  }
  return 'Dilatação da Raiz aórtica.';
}

function comentarioAsc(r: SegmentoAortaResult): string {
  if (r.tier === 'aneurisma') {
    return `Dilatação aneurismática da aorta ascendente medindo ${fmtMM(r.medidaMM)} mm${sufixoIndice(r)}.`
      + (r.notaCirurgica ? NOTA_CIRURGICA_RAIZ_ASC : '');
  }
  if (r.indiceCm2m !== null) {
    return `Dilatação da aorta ascendente medindo ${fmtMM(r.medidaMM)} mm, ${fmtIdx(r.indiceCm2m)} cm²/m ${NOTA_INDICE}.`;
  }
  return `Dilatação da aorta ascendente medindo ${fmtMM(r.medidaMM)} mm.`;
}

function comentarioArco(r: SegmentoAortaResult): string {
  return `Arco aórtico dilatado, medindo ${fmtMM(r.medidaMM)} mm.`
    + (r.notaCirurgica ? NOTA_CIRURGICA_ARCO : '');
}

/**
 * Frase de imagem complementar (decisão do arco, 26/08): arco DILATADO ou
 * NÃO VISUALIZADO ('nv') → recomendar angio-TC/RM da aorta torácica inteira.
 * Emitida uma única vez, depois de jPlacas.
 */
export function jAortaAngioTC(b29: number | null, b42: '' | 's' | 'nv', sexo: Sexo): string {
  const dilatado = !!sexo && !!b29 && tierArcoAo(b29).tier === 'dilatacao';
  if (dilatado || b42 === 'nv') {
    return 'Sugere-se complementação com angiotomografia ou angiorressonância da aorta torácica para avaliação completa.';
  }
  return '';
}
```

(`comentarioArco` perde o ramo aneurisma — o arco não tem mais esse tier.)

- [ ] **Step 2: `achados/index.ts`** — importar `jAortaAngioTC` e acrescentar
`jAortaAngioTC(d.b29, d.b42, d.sexo),` na lista, logo APÓS `jPlacas(d.b42),`.

- [ ] **Step 3: `conclusoes/index.ts` concAorta** — textos:
`'Dilatação da Raiz aórtica.'` / `'Dilatação da Raiz aórtica, com critérios de maior
gravidade.'` (idem ascendente); arco: só `'Dilatação do arco aórtico.'` (ramo aneurisma
do arco removido). Aneurisma raiz/asc: `'Aneurisma da Raiz aórtica.'` /
`'Aneurisma da aorta ascendente.'` — E (I1 da revisão T1) o aneurisma com
`graveIndice` ganha o qualificador: `'Aneurisma da Raiz aórtica, com critérios de
maior gravidade.'` (idem ascendente).

- [ ] **Step 3b (Minors 1-4 da revisão T1):** (a) cabeçalhos legados: `calculos/aorta.ts`
topo ainda cita "ectasia leve/moderada/importante" e `achados/aorta.ts` topo diz "Tiers:
normal / ectasia / aneurisma" — atualizar os DOIS pra régua nova (1-2 linhas cada);
(b) +2 pins em `senna90-aorta-pins.test.mjs`: ♀70a 37mm → normal (fronteira inferior da
faixa ≥66) e raiz 49 → `'aneurisma'` / 50 → `'aneurisma'` (tier explícito, não só a
nota); (c) +2 casos no runner (`casos/06-bordas.ts` ou novo bloco): raiz 46mm ♂50a com
altura (achado `'Dilatação aneurismática da Raiz aórtica, ... cm²/m'` + conclusão
`'Aneurisma da Raiz aórtica'`) e arco 42mm (achado `'Arco aórtico dilatado, medindo
42 mm.'` + frase angio + conclusão `'Dilatação do arco aórtico.'`) — a faixa nova passa
a ser exercida ponta-a-ponta na esteira (piso da suite sobe junto).

- [ ] **Step 4: Testes** — novos pins em `senna90-frases-pins.test.mjs` (bloco aorta):
raiz ♂30a 39mm+altura → achado começa `'Dilatação da Raiz aórtica'`; 46mm → contém
`'Dilatação aneurismática'` e NÃO contém nota; 52mm → contém a nota ≥50; arco 42 →
`'Arco aórtico dilatado, medindo 42 mm.'` + frase angio presente; arco 55 → nota ≥55;
`b42='nv'` → frase angio presente mesmo com arco vazio; arco 38 sem 'nv' → frase angio
AUSENTE. Runner: atualizar casos que pinavam "Ectasia" (listar cada flip). Append na
allowlist (2 linhas): `| F1-T2 | Aorta | "Ectasia"→"Dilatação" nas frases · nota cirúrgica ≥50/≥55 nova · frase angio-TC/RM nova (arco dilatado ou 'nv') | §2.2 |` e
`| F1-T2 | Aorta | Aneurisma 45-49 passou a carregar índice cm²/m no achado e "com critérios de maior gravidade" na conclusão (I1 da revisão T1 — antes o índice sumia nessa faixa) | §2.2 |`.

- [ ] **Step 5: Bateria + commit** `feat(senna93-f1): frases da aorta — dilatacao/aneurisma ACC/AHA, nota cirurgica, angio-TC/RM`.

---

### Task 3: GLS do VE — 3 faixas (ASE/EACVI 2025) e fim da contradição B1

**Files:** `src/senna90/achados/strain.ts`, `src/senna90/conclusoes/index.ts`
(concStrainVE), runner ST01-ST03 + casos afetados, `tests/unit/senna90-frases-pins.test.mjs`
(bloco GLS reescrito), allowlist (append).

**Interfaces:** Produces `faixaGLSve(gls: number): 'normal' | 'limitrofe' | 'reduzido'`
exportada de `strain.ts` — ÚNICA fonte de classificação (achado E conclusão).

- [ ] **Step 1: `strain.ts`**

```ts
/** ASE/EACVI 2025 (spec Senna93 §2.1): normal |GLS| ≥ 18 · limítrofe 16–18 · anormal < 16. */
export function faixaGLSve(gls: number): 'normal' | 'limitrofe' | 'reduzido' {
  const abs = Math.abs(gls);
  if (abs >= 18) return 'normal';
  if (abs >= 16) return 'limitrofe';
  return 'reduzido';
}

export function jGLSve(glsVE: number | null): string {
  if (glsVE === null) return '';
  const faixa = faixaGLSve(glsVE);
  if (faixa === 'normal') return `Strain global longitudinal do ventrículo esquerdo pelo speckle tracking de ${glsVE}% (VR ≤ -18%).`;
  if (faixa === 'limitrofe') return `Strain global longitudinal do ventrículo esquerdo no limite inferior da normalidade (faixa -18 a -16%) pelo speckle tracking de ${glsVE}%.`;
  return `Strain global longitudinal do ventrículo esquerdo reduzido pelo speckle tracking de ${glsVE}% (VR ≤ -18%).`;
}
```

(jGLSvd e jLARS INTOCADOS — spec §2.1 mantém |20| no VD e 18 no LARS.)

- [ ] **Step 2: `concStrainVE`** — importar `faixaGLSve`; substituir os cortes 18 locais:

```ts
function concStrainVE(d: any): string {
  if (d.glsVE === null) return '';
  const faixa = faixaGLSve(d.glsVE);
  const feLimS = d.sexo === 'M' ? 52 : 54;
  let fePreservada = true;
  if (d.b54 !== null) fePreservada = d.b54 >= feLimS;
  else if (d.feT !== null) fePreservada = d.feT >= 1 ? d.feT >= feLimS : d.feT >= feLimS / 100;

  if (!fePreservada) return `Disfunção sistólica do ventrículo esquerdo, com strain longitudinal de ${d.glsVE}%.`;
  if (faixa === 'normal') return `Função sistólica global do ventrículo esquerdo preservada, confirmada pelo strain longitudinal (${d.glsVE}%).`;
  if (faixa === 'limitrofe') return `Função sistólica global do ventrículo esquerdo preservada, com strain longitudinal no limite inferior da normalidade (${d.glsVE}%).`;
  return `Função sistólica preservada com strain longitudinal reduzido (${d.glsVE}%), sugestivo de disfunção subclínica.`;
}
```

- [ ] **Step 3: Testes.** `senna90-frases-pins.test.mjs`, bloco GLS reescrito (a
contradição B1 MORRE — remover a fotografia): −19 → achado normal `'(VR ≤ -18%)'` sem
`'reduzido'` E conclusão `'confirmada pelo strain'`; −17 → `'limite inferior da
normalidade'` nas DUAS pontas; −15 → `'reduzido'` no achado e `'subclínica'` na
conclusão; −21 → normal. Runner ST01-ST03: atualizar cortes/textos (listar flips).
Allowlist: `| F1-T3 | Strain | GLS VE binário 20(achado)/18(conclusão) → 3 faixas 18/16 unificadas; contradição B1 extinta | §2.1 |`.

- [ ] **Step 4: Bateria + commit** `feat(senna93-f1): GLS VE em 3 faixas ASE/EACVI 2025 — fonte unica, B1 morta`.

---

### Task 4: TAPSE — "VR > 17 mm" (ASE 2025)

**Files:** `src/senna90/achados/sistolicaVD.ts`, `tests/unit/senna90-frases-pins.test.mjs`,
runner (se algum caso pinar o sufixo), allowlist.

- [ ] **Step 1:** Em `jVD_sistolica`, os DOIS literais `(VR ≥ 20 mm)` (linhas 18 e 27)
viram `(VR > 17 mm)`. Nada mais muda.
- [ ] **Step 2:** Pin da F0: `'TAPSE= 18 mm (VR ≥ 20 mm)'` → `'TAPSE= 18 mm (VR > 17 mm)'`
(remover o aviso baseline). Allowlist: `| F1-T4 | VD | Texto TAPSE VR ≥20 → >17 (ASE 2025) | §2.1 |`.
- [ ] **Step 3:** Bateria + commit `feat(senna93-f1): TAPSE VR >17 (ASE 2025)`.

---

### Task 5: LAVI — bandas Lang 2015 (48 é moderado)

**Files:** `src/senna90/achados/camaras.ts` (j4), pins, runner afetado, allowlist.

- [ ] **Step 1:** `jAE_volume`:

```ts
export function jAE_volume(b24: number | null): string {
  if (b24 === null || b24 <= 0) return '';
  // Lang 2015 Tab.4 (spec §2.3): leve 35-41 · moderado 42-48 · grave >48.
  if (b24 > 48) return `Átrio esquerdo aumentado em grau importante. Volume index de ${b24} ml/m².`;
  if (b24 >= 42) return `Átrio esquerdo aumentado em grau moderado. Volume index de ${b24} ml/m².`;
  if (b24 > 34) return `Átrio esquerdo aumentado em grau leve. Volume index de ${b24} ml/m².`;
  return '';
}
```

- [ ] **Step 2:** Pin F0: `48 → moderado` (era importante); 49 continua importante.
Runner: DC* que use LAVI 48? (verificar; listar flips). Allowlist:
`| F1-T5 | Câmaras | LAVI 48: importante → moderado (Lang 2015: grave é >48) | §2.3 |`.
- [ ] **Step 3:** Bateria + commit `feat(senna93-f1): LAVI bandas Lang 2015`.

---

### Task 6: Diastólica — linha de números sem buracos (B8)

**Files:** `src/senna90/achados/diastologia.ts` (j22), runner afetado, allowlist.
(E/e' FA fica >15 — V12, decisão documentada; NENHUMA mudança em calculos/diastologia.ts.)

- [ ] **Step 1:** `j22` monta só os preenchidos, ordem e literais preservados:

```ts
export function j22(d: DadosDiast): string {
  if (!d.b19 && !d.b20 && !d.b21 && !d.b22 && !d.b24) return '';
  const partes: string[] = [];
  if (d.b19) partes.push(`Velocidade da Onda E= ${d.b19} cm/s`);
  if (d.b20) partes.push(`Relação E/A= ${d.b20}`);
  if (d.b21) partes.push(`Velocidade e' septal= ${d.b21} cm/s`);
  if (d.b22) partes.push(`Relação E/e'= ${d.b22}`);
  if (d.b24) partes.push(`volume index do átrio esquerdo = ${d.b24} ml/m²`);
  if (d.b23) partes.push(`Velocidade do Refluxo Tricuspídeo= ${d.b23} m/s`);
  return partes.length ? partes.join('; ') + '.' : '';
}
```

- [ ] **Step 2:** +2 testes novos no `senna90-frases-pins.test.mjs`: só E+E/A preenchidos
→ frase SEM `'= ;'` e SEM `"e' septal"`; todos preenchidos → frase completa idêntica à
antiga (paridade provada). Runner DC*/D* que pinem j22 parcial: flips listados.
Allowlist: `| F1-T6 | Diastólica | j22 sinusal deixou de imprimir campos vazios ("Relação E/A= ;") | §2.4/B8 |`.
- [ ] **Step 3:** Bateria + commit `feat(senna93-f1): j22 sem buracos (B8)`.

---

### Task 7: Valvas — estenoses mitral (área primária) e aórtica (pior grau), esclerose com frase, B18

**Files:** `src/senna90/calculos/valvas.ts`, `src/senna90/achados/valvas.ts`
(jEstenoseTricuspide + nova jEscleroseAortica), `src/senna90/achados/index.ts` (1 linha),
runner V01-V07 afetados, pins novos, allowlist.

- [ ] **Step 1: `classificarEstenoseMitral`** (V4 — área primária; 1,5-2,0 não fecha sozinha):

```ts
export function classificarEstenoseMitral(
  gradMedio: number | null,
  areaPHT: number | null
): GrauEstenose {
  // Prioridade 1 (spec §2.5/B2): ÁREA é o critério primário.
  if (areaPHT !== null && areaPHT > 0) {
    if (areaPHT < 1.0) return 'importante';
    if (areaPHT < 1.5) return 'moderada';
    // 1,5–2,0: só fecha "leve" com suporte do gradiente (B19).
    if (areaPHT <= 2.0) return gradMedio !== null && gradMedio >= 5 ? 'leve' : '';
    return '';
  }
  // Sem área: gradiente médio decide (comportamento anterior preservado).
  if (gradMedio !== null && gradMedio > 0) {
    if (gradMedio > 10) return 'importante';
    if (gradMedio >= 5) return 'moderada';
    return 'leve';
  }
  return '';
}
```

- [ ] **Step 2: `classificarEstenoseAortica`** (V3 — pior grau entre os critérios
disponíveis; mata o low-flow-low-gradient saindo "leve"):

```ts
export function classificarEstenoseAortica(
  gradMax: number | null,
  gradMedio: number | null,
  area: number | null
): GrauEstenose {
  const graus: GrauEstenose[] = [];
  if (gradMax !== null && gradMax > 0) {
    if (gradMax >= 64) graus.push('importante');
    else if (gradMax >= 36) graus.push('moderada');
    else if (gradMax >= 27) graus.push('leve');
    else if (gradMax >= 16) graus.push('esclerose');
  }
  if (gradMedio !== null && gradMedio > 0) {
    if (gradMedio > 40) graus.push('importante');
    else if (gradMedio >= 20) graus.push('moderada');
    else graus.push('leve');
  }
  if (area !== null && area > 0) {
    if (area < 1.0) graus.push('importante');
    else if (area < 1.5) graus.push('moderada');
  }
  if (graus.includes('importante')) return 'importante';
  if (graus.includes('moderada')) return 'moderada';
  if (graus.includes('leve')) return 'leve';
  if (graus.includes('esclerose')) return 'esclerose';
  return '';
}
```

- [ ] **Step 3: Esclerose ganha frase no ACHADO (B27)** — em `achados/valvas.ts`:

```ts
/** Esclerose aórtica (16–26 mmHg): calculada e antes jogada fora (B27). Conclusão continua silenciando (decisão preservada). */
export function jEscleroseAortica(estenAoGrau: GrauEstenose): string {
  return estenAoGrau === 'esclerose' ? 'Esclerose valvar aórtica, sem estenose significativa.' : '';
}
```

`achados/index.ts`: importar e acrescentar `jEscleroseAortica(d.estenAoGrau),` na linha
dos gradientes aórticos (após `jAreaAortica(...)`, dentro do mesmo `L(...)`).

- [ ] **Step 4: B18** — em `jEstenoseTricuspide`, `b46t >= 5` vira `b46t > 0` (o
gradiente que fechou o grau é sempre impresso).

- [ ] **Step 5: Testes.** Pins novos (bloco "estenoses" em `senna90-frases-pins.test.mjs`
via `calcularDerivados`): mitral área 0.8+grad 3 → `'importante'` (era leve); área 1.8
sem grad → `''`; área 1.8+grad 6 → `'leve'`; sem área grad 12 → `'importante'`;
aórtica área 0.8+gradMax 30 → `'importante'` (era leve); gradMax 20 sozinho →
`'esclerose'` + achado de esclerose presente via `calcular`; tric grad 3 + área 0.9 →
grau importante COM linha `'Gradiente transvalvar tricúspide médio de 3 mmHg.'`.
Runner V01/V02/V06/V07: flips listados um a um. Allowlist:
`| F1-T7 | Valvas | Mitral: área primária (grad em fluxo baixo não subclassifica mais) · Aórtica: pior grau entre critérios (low-flow-low-gradient deixa de sair "leve") · esclerose ganha achado · estenose tricúspide sempre imprime o gradiente | §2.5 |`.

- [ ] **Step 6:** Bateria + commit `feat(senna93-f1): estenoses mitral area-primaria e aortica pior-grau, esclerose com frase, B18`.

---

### Task 8: Paredes e morfologia — B4, B9, B21 + acentos

**Files:** `src/senna90/achados/paredes.ts`, `src/senna90/achados/valvas.ts`
(jMitralMorfologia), `src/senna90/achados/index.ts` (1 argumento), runner afetado, allowlist.

- [ ] **Step 1: `paredes.ts`** — (a) j15/j16: `'parede septalanterior'` →
`'parede septal anterior'`; `'parede septalinferior'` → `'parede septal inferior'`;
(b) jDemaisParedes: `DD:` vira `'Alteração contrátil por discinesia das demais paredes'`
e os 4 `'contratil'` viram `'contrátil'` (HD/HR/AD/DD).
- [ ] **Step 2: B21** — `jMitralMorfologia(b34, b36)` vira `jMitralMorfologia(b34, b34t)`:
a frase de morfologia decide pela MORFOLOGIA tricúspide, não pelo refluxo:

```ts
export function jMitralMorfologia(b34: MorfologiaValvar, b34t: MorfologiaValvar): string {
  if (!b34) return !b34t
    ? 'Válvulas atrioventriculares com a morfologia preservada.'
    : 'Válvula mitral com morfologia preservada.';
  // (mapa m inalterado)
```

`achados/index.ts:181`: `jMitralMorfologia(d.b34, d.b36)` → `jMitralMorfologia(d.b34, d.b34t)`.
- [ ] **Step 3:** Testes: +3 pins (b34 vazio+b34t vazio+b36 'M' → frase "Válvulas
atrioventriculares…" AGORA presente [antes o refluxo sozinho a trocava]; b34 vazio +
b34t 'EL' → "Válvula mitral com morfologia preservada."; DD → 'discinesia'). Runner
flips listados. Allowlist: `| F1-T8 | Paredes/valvas | DD imprimia hipocinesia → discinesia · "septal anterior/inferior" com espaço · morfologia AV decide por morfologia (não refluxo) · acentos | §2.5/B4/B9/B21 |`.
- [ ] **Step 4:** Bateria + commit `feat(senna93-f1): paredes e morfologia — B4/B9/B21`.

---

### Task 9: Wilkins — literal, componente não avaliado, descrições do artigo

**Files:** `src/senna90/achados/wilkins.ts`, `src/senna90/motor.ts` + `types.ts`
(alerta), `src/senna90/tests/casos/08-alertas.ts`, runner B05/B06 se afetados, pins, allowlist.

- [ ] **Step 1: `wilkins.ts`**

```ts
/** Wilkins clássico pontua 1–4 por categoria (total 4–16). 0 = não avaliado (spec B29/V8). */
function wilkinsCompleto(mob: number, esp: number, sub: number, cal: number): boolean {
  return [mob, esp, sub, cal].every((v) => Number.isInteger(v) && v >= 1 && v <= 4);
}
```

- `calcWilkinsScore`: `if (!ativo) return null; if (!wilkinsCompleto(mob, esp, sub, cal)) return null;`
- `jWilkins`: mesmo guard (`return ''`).
- Ramo `else` (≤7): literal `'(escore ≤ 8)'` vira `'(escore < 8)'` (B10/V7 — o texto
  para de contradizer a fronteira; o ramo =8 "no limite" fica).
- `WK_DESC.esp`: índice 2 → `'Espessamento das margens dos folhetos (5–8 mm)'`; índice 3
  → `'Espessamento de todo o folheto (5–8 mm)'` (Wilkins 1988; B11/V9).

- [ ] **Step 2: Alerta** — `types.ts`: união ganha `'WILKINS_INCOMPLETO'`. `motor.ts`
gerarAlertas:

```ts
  if (m.wilkins.ativo && ![m.wilkins.mobilidade, m.wilkins.espessura, m.wilkins.subvalvar, m.wilkins.calcificacao]
      .every((v) => Number.isInteger(v) && v >= 1 && v <= 4)) {
    alertas.push({
      tipo: 'WILKINS_INCOMPLETO',
      campo: 'wk-mob',
      mensagem: 'Escore de Wilkins ativado com categoria não avaliada — pontue as 4 categorias (1 a 4) ou desative o escore.',
    });
  }
```

`casos/08-alertas.ts`: +2 casos (ativo com cal=0 → alerta + achados SEM `__WILKINS__`;
ativo 2/2/2/2 → sem alerta, com `__WILKINS__` e score 8). Piso da suite sobe.

- [ ] **Step 3:** ATENÇÃO do implementador e do revisor: `laudo-merge.ts`/page.tsx
(INTOCÁVEIS) colapsam o bloco Wilkins pelos RÓTULOS das categorias — as DESCRIÇÕES podem
mudar, os rótulos não. Rodar `npm run test:unit` e conferir que a invariante (8) do
contrato continua verde. Allowlist: `| F1-T9 | Wilkins | componente 0 = não avaliado (score null + alerta, antes somava e imprimia "TOTAL 0 pts") · literal "(escore < 8)" · descrições de espessura 2/3 corrigidas pro artigo | §2.6 |`.
- [ ] **Step 4:** Bateria + commit `feat(senna93-f1): wilkins — nao-avaliado, literal, descricoes do artigo`.

---

### Task 10: Massa, IMVE e sistólica — B24, V2, B5, B7, A13

**Files:** `src/senna90/calculos/ventricle.ts`, `src/senna90/achados/massa.ts`,
`src/senna90/achados/sistolica.ts`, `src/senna90/achados/index.ts`,
`src/senna90/conclusoes/index.ts` (j47 + concSistolica + montarD), pins/runner afetados, allowlist.

- [ ] **Step 1: B24** — `calcMassaVE`: `const massa = (volMiocardio * 1.04 * 0.8) / 1000 + 0.6;`
(+0,6 em GRAMAS, fora da divisão). Docblock example vira 169.9.
FLIPS licenciados: pin derivados massa 181.3 → **181.9**; imVE 94.9 → **95.2**
(181.9/1.91 = 95.23 → trunc1). Runner: casos que pinem massa/imVE exatos.
- [ ] **Step 2: V2 (IMVE 115/95)** — `achados/massa.ts` jPadraoGeometrico:
`const lim = sexo === 'M' ? 115 : 95;` (+docblock); `conclusoes/index.ts` j47 idem;
docblock cutoffs de `calcIMVE` atualizado. Runner C01-C03: casos com IMVE na faixa
88-95/102-115 mudam de quadrante — flips listados um a um com o número do caso.
- [ ] **Step 3: A13 (bandas do float)** — `achados/sistolica.ts` jFE_Teichholz: trocar as
igualdades exatas por bandas na granularidade do trunc4 (semântica preservada — V14):

```ts
  if (sexo === 'M') {
    if (fe >= 0.5201) return 'Função sistólica do ventrículo esquerdo preservada e sem alteração contrátil segmentar.';
    if (fe >= 0.52) return 'Função sistólica do ventrículo esquerdo preservada, porém no limite inferior da normalidade.';
    if (fe < 0.30) return 'Disfunção sistólica do ventrículo esquerdo em grau importante.';
    if (fe < 0.3001) return 'Disfunção sistólica do ventrículo esquerdo em grau moderado a importante.';
    if (fe < 0.40) return 'Disfunção sistólica do ventrículo esquerdo em grau moderado.';
    if (fe < 0.4001) return 'Disfunção sistólica do ventrículo esquerdo em grau leve a moderado.';
    return 'Disfunção sistólica do ventrículo esquerdo em grau leve.';
  }
```

(espelho ♀ com 0.54/0.5401; o `return ''` final morre — toda FE ganha frase, mas o
chamador já garante `feT !== null`).
- [ ] **Step 4: B5** — `jFE_Simpson(b54, sexo, temParedeAlterada: boolean)`: no ramo
preservado, `temParedeAlterada` decide entre o texto atual e
`'Função sistólica do ventrículo esquerdo preservada. Fração de ejeção de ${fe}% (Simpson).'`.
`achados/index.ts:199`:

```ts
    ...L(d.b54 !== null
      ? jFE_Simpson(d.b54, d.sexo, temParedeAlterada(d))
      : jFE_Teichholz(d.feT, d.sexo)),
```

com helper no mesmo arquivo:

```ts
function temParedeAlterada(d: any): boolean {
  return !!(d.b55 || d.b56 || d.b57 || d.b58 || d.b59 || d.b60 || d.b61
    || (d.b62 && d.b62 !== 'NL'));
}
```

- [ ] **Step 5: B7** — `conclusoes/index.ts`: montarD ganha `b55..b62` (copiar do
adapter de achados); concSistolica: (a) o ramo interno morto
(`if (d.b54 !== null && d.b54 >= feLimS)` dentro de `disfVE && !disfVD`) É REMOVIDO
(inalcançável — Simpson preservado zera disfVE por construção); (b) o ramo
`!disfVE && !disfVD` passa a emitir a conclusão que hoje nunca sai:

```ts
  const paredes = !!(d.b55 || d.b56 || d.b57 || d.b58 || d.b59 || d.b60 || d.b61
    || (d.b62 && d.b62 !== 'NL'));
  if (!disfVE && !disfVD) {
    if (dilatado) {
      return paredes
        ? 'Miocardiopatia Dilatada com função sistólica preservada, apesar da alteração contrátil segmentar.'
        : 'Miocardiopatia Dilatada com função sistólica preservada.';
    }
    if (paredes && feDisp) return 'Alteração contrátil segmentar do ventrículo esquerdo.';
    return '';
  }
```

- [ ] **Step 6: Testes.** Pins novos: Simpson 60 SEM parede → frase sem "apesar";
Simpson 60 COM b56='HB' → "apesar da alteração contrátil segmentar" + conclusão
'Alteração contrátil segmentar do ventrículo esquerdo.' presente; feT exato 0.52
(ddve/dsve que produzam — usar chamada direta a jFE_Teichholz(0.52,'M')) → "limite
inferior"; 0.5201 → preservada. Flips: massa/imVE (Step 1), geometria (Step 2), casos
j12-preservado do runner. Allowlist: `| F1-T10 | Massa/sistólica | massa +0,6 g (B24) · limite de HVE 102/88→115/95 (Lang 2015) · "apesar da alteração segmentar" só com parede alterada (B5) · conclusão de alteração segmentar isolada passou a existir (B7) · FE Teichholz: fronteiras exatas viram bandas do truncamento (A13) | §2.1/§2.3 |`.
- [ ] **Step 7:** Bateria + commit `feat(senna93-f1): massa +0.6g, IMVE 115/95, B5/B7, bandas da FE`.

---

### Task 11: Um adaptador e um estado só (B30)

**Files:**
- Create: `src/senna90/adapter-d.ts`
- Modify: `src/senna90/achados/index.ts`, `src/senna90/conclusoes/index.ts`,
  `src/senna90/motor.ts`

**Interfaces:** `montarD(m: MedidasEcoTT, calc: CalculosDerivados): any` exportado de
`adapter-d.ts` = SUPERSET (o montarD atual dos achados + `idade: calc.idade` e
`altura: m.gerais.altura`, que hoje só o das conclusões tem). Estado do modo manual da
diastólica passa a ter DONO ÚNICO em `achados/index.ts`, com getters novos
`getDiastManualSelecao()` e `getDiastManualTextoLivre()`.

- [ ] **Step 1:** Criar `adapter-d.ts` com o montarD dos achados (copiar) + os 2 campos;
os dois orquestradores importam dele e deletam os locais. **Emenda da revisão T10:**
mover também `temParedeAlterada(d)` pra `adapter-d.ts` (export) e usar nos DOIS lados
(achados/index.ts e a const `paredes` de concSistolica) — fim da expressão duplicada;
neutro em comportamento (cabe na licença zero-flip desta task).
- [ ] **Step 2:** `achados/index.ts` exporta os 2 getters; `conclusoes/index.ts` DELETA
`_diastManualSelecaoConcl`/`_diastManualTextoLivreConcl`/`setDiastManualConcl`/
`setDiastTextoLivreConcl` e usa os getters em `diastConclusao`.
- [ ] **Step 3:** `motor.ts`: remover as 2 chamadas `setDiastManualConcl`/
`setDiastTextoLivreConcl` e os re-exports; conferir com grep que NINGUÉM fora de
senna90 importava esses setters (esperado: ninguém — a rota e o adapter chamam só
`calcular`). Se alguém importar → PARAR e reportar (não quebrar consumidor).
- [ ] **Step 4:** ZERO mudança de comportamento: bateria inteira deve passar SEM flip
nenhum (esta task não tem licença de flip). `tests/unit/senna90-diastolica-manual.test.mjs`
é o vigia principal. Sem entrada na allowlist.
- [ ] **Step 4b (carona M1 da revisão T10 — pin novo, não flip):** em
`tests/unit/senna90-frases-pins.test.mjs`, +1 pin da variante dilatada do B7:
ddve 60 (♂, dilatado) + b56='HB' + b54=60 → conclusão contém
`'Miocardiopatia Dilatada com função sistólica preservada, apesar da alteração contrátil segmentar.'`
(frase nova da T10 que ficou sem teste).
- [ ] **Step 5:** Bateria + commit `feat(senna93-f1): adapter unico + estado manual com dono unico (B30)`.

---

### Fechamento da fase (controller)

- [ ] Bateria completa (unit/api/rules/wader/tsc/build) — placar registrado.
- [ ] Conferir allowlist de divergências esperadas completa (1 linha por task com flip).
- [ ] Ledger + memória + Obsidian.
- [ ] Checkpoint com o Sergio: relatório dos flips clínicos + textos novos (V13) pra ele
  revisar; F2 pode partir.

## Self-Review (executada na escrita)

1. Cobertura da spec §2 na F1: §2.1 (FE bandas T10, TAPSE T4, GLS T3, paredes b59-61 já
   corretos no Senna90 — nada a fazer, j12 T10, B7 T10) · §2.2 aorta T1/T2 · §2.3 (LAVI
   T5, RAVI já unificado no Senna90 — sem task, ASC/idade já corretos, massa/IMVE T10) ·
   §2.4 (E/e' FA mantido V12, ≥2 campos já é comportamento Senna90, j22 T6, divergência
   manual por chave exata: o detector B6 é do LEGADO e morre com ele — sem task na F1,
   registrado; estado duplicado T11) · §2.5 T7/T8 · §2.6 T9. Itens de §2.7 (apresentação)
   são F2 — fora desta fase por desenho.
2. Placeholder scan: todos os steps têm código literal ou instrução exata de literal.
3. Consistência de tipos: TierAorta/notaCirurgica definidos na T1 e consumidos na T2;
   faixaGLSve na T3; jFE_Simpson de 3 argumentos na T10 com chamador atualizado no mesmo
   passo; getters da T11 nomeados iguais nos dois lados.
