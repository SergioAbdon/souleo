# Inventário Senna90 — todas as fórmulas, cortes e testes (leitura para o Senna93)

**Data:** 2026-08-26 · **Modo:** read-only (zero edição) · **Mandato:** `docs/decisoes/2026-08-26-senna93-motor-unificado.md`
**Escopo:** `src/senna90/**` — o motor que hoje gera achados/conclusões (primário desde 16/05) e já calcula derivados em `calcularDerivados`.

**Totais:** 9 domínios clínicos · **101 itens** (fórmula / derivação / tabela de corte / regra de emissão) · **44 sem teste que pina** · 449 linhas de código morto em `classificacoes/`.

**Legenda de teste:** ✓ pinado por teste · ~ exercido indiretamente (nenhum valor/frase pinado) · ✗ nenhum teste toca.
**Suite:** 72 casos em `src/senna90/tests/` (S01-03, C01-04, V01-07, D01-05, ST01-04, HP01-03, B01-10, DC01-36), rodados por `npx tsx src/senna90/tests/index.ts` — **não entram no `npm run test:unit`** (que só varre `tests/unit/*.test.mjs`). Fora da suite: `tests/unit/senna90-diastolica-manual.test.mjs` (4 testes, esse sim no `test:unit`).

---

## 0. Estrutura — o que entra, o que sai

| Camada | Arquivo | Papel |
|---|---|---|
| Entrada tipada | `types.ts` | `MedidasEcoTT` (9 blocos) → `CalculosDerivados` (17 campos) → `ResultadoLaudo` |
| Números | `calculos/` (demografia, ventricle, valvas, aorta, diastologia) | fórmulas puras |
| Cortes | `classificacoes/` (cutoffs, isOOR, refValues) | **449 linhas, ZERO importadores — código morto** |
| Frases | `achados/` (11 arquivos) + `conclusoes/index.ts` | textos literais + tabelas de grau inline |
| API | `motor.ts` | `calcularDerivados()` + `calcular()` |

`calcular()` é chamado só de `src/app/api/laudo/calcular/route.ts` (server-side, auth + rate limit 60/min); a tela chama via `src/lib/senna90-bridge.ts` com debounce.

---

## 1. Antropometria / superfície corporal — 3 itens, 0 sem teste

| # | Nome | Local | Entradas | Fórmula / cortes | Consome | Teste |
|---|---|---|---|---|---|---|
| 1 | `calcIMC` | `calculos/demografia.ts:31` | `gerais.peso` (kg), `gerais.altura` (cm) | `IMC = peso / (altura/100)²`, truncado 1 casa. Guarda: `null` se qualquer um for null ou ≤0. Cutoffs OMS 2000 documentados no header mas **não aplicados** (nenhuma frase usa IMC) | `derivados.imc` (só a tabela do legado consome hoje) | ✓ S01/S03/B02 (22.8) |
| 2 | `calcASC` | `calculos/demografia.ts:56` | peso, altura | DuBois 1916: `ASC = 0,0001 × 71,84 × peso^0,425 × altura^0,725`, truncado 2 casas. **Constante 71,84** (o legado usa 71,74 — correção aprovada 03/05/2026) | `derivados.asc`; alimenta `calcIMVE`, `calcAreaAoIndexada`, Z-score da aorta | ✓ S01/S03/B02 (1.84 — o comentário do teste pina a truncagem: 1,847 → 1,84, não 1,85) |
| 3 | `calcIdade` | `calculos/demografia.ts:75` → `helpers/format.ts:39` | `identificacao.pacienteDtnasc`, `dataExame` (YYYY-MM-DD) | Anos completos por split de string (não usa `Date`): `idade = y2-y1`, decrementa se `m2<m1` ou (`m2===m1` e `d2<d1`). `null` se falta data ou idade < 0 | `derivados.idade` → `tierRaizAo` (WASE por faixa etária) | ✓ S01 (46), B09 (26) |

> **Nota Senna93:** o legado calcula idade com `new Date()` (`idadeAnos`, motorv8mp4.js:1081) — sujeito a fuso; o Senna90 faz por string. Divergência candidata (a favor do Senna90).

---

## 2. Câmaras / massa / volumes — 15 itens, 5 sem teste

### 2.1 Números

| # | Nome | Local | Entradas | Fórmula | Consome | Teste |
|---|---|---|---|---|---|---|
| 4 | `calcVDF` | `calculos/ventricle.ts:27` | `camaras.ddve` (mm) | Teichholz: `V = 7·D³/(2,4+D)` com `D = ddve/10` (cm), resultado ml, truncado 1 | `derivados.vdf` (só tabela) | ✗ |
| 5 | `calcVSF` | `ventricle.ts:44` | `camaras.dsve` | idem com DSVE | `derivados.vsf` | ✗ |
| 6 | `calcMassaVE` | `ventricle.ts:121` | ddve, septoIV, paredePosterior (mm) | Devereux: `massa = ((DDVE+SIV+PP)³ − DDVE³) × 1,04 × 0,8 + 0,6) / 1000` g. **Atenção:** o `+0,6` entra ANTES da divisão por 1000, então o termo aditivo vale 0,0006 g e não 0,6 g — divergência com a fórmula citada no próprio docblock | `derivados.massa` → j9, `calcIMVE` | ~ (C02/S01 via j9; nenhum valor de massa asserido) |
| 7 | `calcIMVE` | `ventricle.ts:153` | massa, asc | `IMVE = massa / ASC` (g/m²), truncado 1 | `derivados.imVE` → j10, j47, algoritmo diastólico | ~ (C01-C03) |
| 8 | `calcRWT` | `ventricle.ts:177` | ddve, siv, pp | Variante Reichek: `ER = (SIV+PP)/DDVE`, truncado 2 | `derivados.er` → j10, j47 | ~ (C02/C03) |
| 9 | `calcAoAE` | `ventricle.ts:201` | raizAo, ae | `Ao/AE = b7/b8`, truncado 2 | `derivados.aoae` — **nenhum achado/conclusão consome**; existe só para a tabela do legado | ✗ |

### 2.2 Tabelas de grau (frases)

| # | Nome | Local | Cortes exatos | Saída | Teste |
|---|---|---|---|---|---|
| 10 | `jAE_diametro` (j3) | `achados/camaras.ts:22` | **♂** >52 imp · =52 mod-imp · >46 mod · =46 leve-mod · >40 leve. **♀** >46 imp · =46 mod-imp · >42 mod · =42 leve-mod · >38 leve. Silenciado se `b24>0`; silenciado se `sexo` vazio | "Átrio esquerdo aumentado em grau X." | ~ (B07 pina só o silenciamento) |
| 11 | `jAE_volume` (j4) | `camaras.ts:43` | LAVI: ≥48 imp · ≥42 mod · >34 leve · ≤34 silêncio | "…grau X. Volume index de N ml/m²." | ✗ |
| 12 | `jAD_volume` (j5) | `camaras.ts:56` | RAVI JASE 2025 **unificado por sexo**: <30 silêncio · ≤36 leve · ≤41 mod · >41 imp | "Átrio direito aumentado em grau X." | ✓ B08 (só o ramo leve) |
| 13 | `jVE_diametro` (j6) | `camaras.ts:67` | **♂** >68/=68/>63/=63/>58. **♀** >61/=61/>56/=56/>52 | "Ventrículo esquerdo aumentado em grau X." | ✓ C01, C04, B03 (negativo em 58), B04 (63) |
| 14 | `jVD_diametro` (j7) | `camaras.ts:87` | unificado: >50 imp · =50 mod-imp · >42 mod · =42 leve-mod · >35 leve | "Ventrículo direito aumentado em grau X." | ✗ |
| 15 | `jCamarasNormais` (j8) | `camaras.ts:103` | Alterado se: AE = (b24>0 ? b24>34 : b8 > 40♂/38♀) · VE = b9 > 58♂/52♀ · VD = b13>35 · AD = b25≥30. 0 alteradas → "Câmaras cardíacas com dimensões normais."; 1 normal → "X com dimensões normais."; 2-3 normais → "Demais câmaras…"; 4 alteradas → "" | frase de síntese | ✓ S01, S02, B02 |
| 16 | `jEspessuraMiocardica` (j9) | `achados/massa.ts:23` | massa absoluta (g). **♂** >254 imp · =254 "em grau moderado a importante" (sem a palavra "aumentada" — literal divergente das irmãs) · >227 mod · =227 leve-mod · >200 leve · resto "preservada". **♀** >193/=193/>171/=171/>150 | "Massa do ventrículo esquerdo …" | ✓ S01 (preservada), C02 (aumentada) |
| 17 | `jPadraoGeometrico` (j10) | `massa.ts:48` | 4 quadrantes ER×IMVE, lim IMVE **102♂ / 88♀**, lim ER **0,42**: ER>0,42 & IMVE≤lim → remodelamento concêntrico · ER≤0,42 & IMVE>lim → hipertrofia excêntrica · ambos ≤ → "preservados" · ambos > → hipertrofia concêntrica | achado | ✓ C01, C02, C03 |
| 18 | `j47` | `conclusoes/index.ts:51` | mesmos cortes do j10, **sem** o ramo "preservados" (silencia) | conclusão de hipertrofia | ✓ C01-C03 |

---

## 3. Função sistólica — 6 itens, 1 sem teste

| # | Nome | Local | Entradas | Fórmula / cortes | Saída | Teste |
|---|---|---|---|---|---|---|
| 19 | `calcFE_Teichholz` | `ventricle.ts:68` | ddve, dsve | `FE = (VDF−VSF)/VDF`, **decimal 0-1**, truncado 4 casas | `derivados.feT` | ✓ S01 (0.6539) |
| 20 | `calcFS` | `ventricle.ts:92` | ddve, dsve | `FS = (DDVE−DSVE)/DDVE`, decimal, truncado 4 | `derivados.fs` (só tabela) | ✗ |
| 21 | `jFE_Teichholz` (j11) | `achados/sistolica.ts:16` | feT, sexo | **♂** >0,52 preservada · =0,52 "limite inferior" · <0,30 imp · =0,30 mod-imp · <0,40 mod · =0,40 leve-mod · <0,52 leve. **♀** idem com 0,54 | "Função/Disfunção sistólica do VE…" | ✓ S01 |
| 22 | `jFE_Simpson` (j12) | `sistolica.ts:47` | b54 (%), sexo | lim 52♂/54♀: ≥lim preservada · <30 imp · =30 mod-imp · <40 mod · =40 leve-mod · resto leve. Sempre sufixa " Fração de ejeção de N% (Simpson)." | achado (prevalece sobre j11 quando b54 preenchido — `achados/index.ts:199`) | ✓ C01 (35), C04 (25) |
| 23 | `jVD_sistolica` (j23) | `achados/sistolicaVD.ts:17` | b32 (grau qualitativo), b33 TAPSE (mm) | Se b32 ∈ {L,LM,M,MI,I} → "Disfunção sistólica de grau X do ventrículo direito" + sufixo. Senão → "Função sistólica do ventrículo direito preservada." + sufixo se b33>0. Sufixo TAPSE: `" TAPSE= N mm (VR ≥ 20 mm)."` | achado | ~ (S01 só o ramo preservado sem TAPSE) |
| 24 | `concSistolica` | `conclusoes/index.ts:69` | b9, b13, b54, feT, b32, sexo | Dilatado = b9>58♂/52♀ **ou** b13>35 · FE reduzida = b54<52♂/54♀ (Simpson prevalece) ou feT<0,52/0,54 · disfVD = b32 preenchido. Combina prefixo "Miocardiopatia Dilatada com " + {biventricular / do VE / do VD / "função sistólica preservada."} | conclusão | ✓ C01, C04 |

---

## 4. Diastólica — 8 itens, 2 sem teste (o domínio mais testado: 41 casos)

| # | Nome | Local | Entradas | Algoritmo / cortes | Saída | Teste |
|---|---|---|---|---|---|---|
| 25 | `calcularJ21` | `calculos/diastologia.ts:50` | ritmo, sexo, b19 E, b20 E/A, b21 e' septal, b22 E/e', b23 vel IT, b24 LAVI, lars, feT, b54, imVE | **Porta FA:** `ritmo==='N' && (b20 null ou 0)` → desvia p/ FA. **Sem dados** (6 campos null) → "". **Pré-condição do simplificado:** FE baixa (b54 < 54♀/52♂ ou feT < 0,54/0,52) **ou** IMVE > 95♀/115♂ **ou** FE indisponível. **Simplificado:** E/A≥2 → Grau III · (E/A≤0,8 **e** E≤50) → Grau I · senão conta {E/e'>15, IT>2,8, LAVI>34}: ≥2 → Grau II, senão Grau I. **Completo:** conta alterados entre {e'<7, E/e'>15, IT>2,8, LAVI>34}; `avaliados<2` → "" · c≤1 → "Índices diastólicos … preservados" · c===2 → "Indeterminada" · c≥3 → reclassifica por E/A (≥2 Grau III · ≤0,8+E≤50 Grau I · senão Grau II) | texto do grau | ✓ DC01-08, DC16-20, DC29-33, D01-D03 |
| 26 | `calcularDiastologiaFA` | `calculos/diastologia.ts:166` | b22, b23, b24, lars | 4 critérios: E/e'>15 · IT>2,8 · LAVI>34 · **LARS<18**. Todos null → `FA_SEM_DADOS` · avaliados<2 → `FA_INDETERMINADA` · elevados≥2 → `FA_PRESSAO_ELEVADA` · senão `FA_PRESSAO_NORMAL` | sentinela | ✓ DC09-15, DC26-27, DC34-36, D04, D05 |
| 27 | `j21FA_achado` | `achados/diastologia.ts:54` | — | Colapsa as 4 sentinelas FA numa frase única: "Avaliação da função diastólica limitada devido arritmia cardíaca." | achado | ✓ D04, D05 |
| 28 | `j22` | `achados/diastologia.ts:71` | b19-b24 | Linha de detalhe: `"Velocidade da Onda E= E cm/s; Relação E/A= X; Velocidade e' septal= Y cm/s; Relação E/e'= Z; volume index do átrio esquerdo = W ml/m²"` (+ IT se b23). Campos null viram **string vazia** dentro da frase | achado | ✗ |
| 29 | `j22FA` | `achados/diastologia.ts:88` | idem | Em FA lista só os preenchidos, ordem E, E/e', IT, LAVI, e'. Fora de FA delega ao j22. Suprimido quando modo manual (`achados/index.ts:215`) | achado | ✗ |
| 30 | `j43` | `achados/diastologia.ts:103` | resultado de j21 | FA_PRESSAO_ELEVADA/NORMAL → "Parâmetros sugestivos de pressão de enchimento elevada/normal." · FA_INDETERMINADA → frase própria · FA_SEM_DADOS e "preservados" → "" · Grau III/II/I por `includes()` | conclusão | ✓ D01, D02, D04, D05, DC* |
| 31 | **Máquina do modo manual** | `achados/index.ts:56-75` + `conclusoes/index.ts:40-43,226-238` + `motor.ts:117-121` | `diastolica.modoManual`, `selecaoManual` (-1..6), `textoLivre` | `DIAST_SENTENCAS` (7 pares achado/conclusão, `achados/diastologia.ts:128`). Índice 5 (FA) na conclusão **recalcula** via j43. Índice 6 = "não avaliar" (par vazio). Precedência: textoLivre > seleção > "" | achado + conclusão | ✓ `tests/unit/senna90-diastolica-manual.test.mjs` (índices 2 e 6, modo auto, e não-vazamento entre exames) |
| 32 | `concLARS` | `conclusoes/index.ts:212` | lars, resultado de j21 | Só fala se a diastólica está normal (`'…preservados'` ou `''`): ≥18 "preservado", <18 "reduzido … sugestivo de elevação das pressões de enchimento" | conclusão | ✓ DC21, DC22, DC23, ST04 |

### Estado de módulo duplicado (conhecido)

`achados/index.ts` guarda `_diastModo`, `_diastManualSelecao`, `_diastManualTextoLivre`; `conclusoes/index.ts` guarda **cópias próprias** da seleção e do texto livre (`_diastManualSelecaoConcl`, `_diastManualTextoLivreConcl`) e lê o modo por `getDiastModo()`. `calcular()` (motor.ts:117-121) resincroniza os **5** setters a cada chamada — é o que S5-T3 ligou. Consequência: quem chamar `gerarAchados`/`gerarConclusao` fora de `calcular()` pega estado velho. Hoje ninguém faz isso (a rota e a suite passam por `calcular()`).

**Ramo morto em produção:** `textoLivre` nunca é preenchido — `src/lib/motor-ts-adapter.ts:105` fixa `textoLivre: ''`. Só alcançável por POST direto na API.

---

## 5. Valvas — 24 itens, 10 sem teste

### 5.1 Classificação de estenose (ASE/EACVI 2017)

| # | Nome | Local | Prioridades e cortes | Consome | Teste |
|---|---|---|---|---|---|
| 33 | `classificarEstenoseMitral` | `calculos/valvas.ts:27` | **1º grad médio** (b46>0): >10 imp · ≥5 mod · senão leve. **2º área PHT** (b47>0): <1,0 imp · <1,5 mod · ≤2,0 leve | `estenMitGrau` | ✓ V01 |
| 34 | `classificarEstenoseAortica` | `calculos/valvas.ts:68` | **1º grad máx** (b50>0): ≥64 imp · ≥36 mod · ≥27 leve · ≥16 **esclerose** · <16 "" (e **retorna já aqui** — não cai pros outros critérios). **2º grad médio:** >40 imp · ≥20 mod · senão leve. **3º área:** <1,0 imp · <1,5 mod (sem "leve" — decisão preservada) | `estenAoGrau` | ✓ V02 (moderada), V06 (esclerose) |
| 35 | `classificarEstenoseTricuspide` | `calculos/valvas.ts:112` | Pior grau entre: grad médio >7 imp / ≥5 mod · área <1,0 imp / ≤1,5 mod. **Sem grau leve** (decisão) | `estenTricGrau` | ✓ V07 |
| 36 | `classificarEstenosePulmonar` | `calculos/valvas.ts:145` | grad máx: >64 imp · ≥36 mod · senão leve (ASE 2017 valvar, migrado do critério adult-congenital) | `estenPulmGrau` | ✓ V03 (45), V04 (30) |
| 37 | `calcAreaAoIndexada` | `ventricle.ts:219` | `AAi = areaAo / ASC` (cm²/m²), truncado 2. Cutoff <0,6 documentado mas **não aplicado** | `derivados.aoIdx` → texto do j34 | ✗ |

### 5.2 Morfologia (4 tabelas de 15 padrões cada — E/F/EF × L/LM/M/MI/I)

| # | Nome | Local | Particularidade | Teste |
|---|---|---|---|---|
| 38 | `jMitralMorfologia` | `achados/valvas.ts:15` | Vazio → **depende do refluxo tricúspide (b36)**: sem b36 "Válvulas atrioventriculares com a morfologia preservada." / com b36 "Válvula mitral com morfologia preservada." Grau ≥M acrescenta ", gerando restrição da sua abertura" | ✓ V01 (EFI) |
| 39 | `jTricMorfologia` | `valvas.ts:109` | Vazio → "". Restrição só nos ramos E (os F/EF moderados **não** ganham a coluna "restrição" — assimetria vs mitral) | ✗ |
| 40 | `jAorticaMorfologia` | `valvas.ts:164` | Vazio → "Válvulas semilunares com morfologia preservada." (independente da pulmonar) | ✗ (V02 seta EFM mas não assere) |
| 41 | `jPulmMorfologia` | `valvas.ts:244` | Vazio → "" | ✗ |

### 5.3 Gradientes / áreas

| # | Nome | Local | Regra de emissão | Teste |
|---|---|---|---|---|
| 42 | `jGradMaxMitral` | `valvas.ts:41` | emite se b45 **≥1** mmHg | ✗ |
| 43 | `jGradMedMitral` | `valvas.ts:48` | emite se b46 ≥1 | ✓ V01 |
| 44 | `jAreaMitral` | `valvas.ts:55` | emite se b47>0 · "…cm² (PHT)." | ✓ V01 |
| 45 | `jGradMaxAortico` | `valvas.ts:188` | b50 ≥1 | ✓ V02, V06 |
| 46 | `jGradMedAortico` | `valvas.ts:195` | b51 ≥1 | ✗ |
| 47 | `jAreaAortica` | `valvas.ts:202` | b52>0 · "…(Equação de continuidade)." + " Área aórtica indexada = N cm²/m²." se `aoIdx` truthy | ✗ |
| 48 | `jEstenoseTricuspide` | `valvas.ts:136` | Só se `estenTricGrau`; grad médio emitido se **≥5**; área se >0; linha do grau (imp/mod) | ✗ (V07 assere só a conclusão) |
| 49 | `jEstenosePulmonar` | `valvas.ts:268` | Só se grau; emite gradiente se b50p truthy; 3 graus | ✓ V03 |

### 5.4 Refluxos e conclusões valvares

| # | Nome | Local | Regra | Teste |
|---|---|---|---|---|
| 50 | `jRefluxoMitral` (j28) | `valvas.ts:65` | Mapa L..I. Se b35 vazio: emite "Fluxo pelas válvulas atrioventriculares preservado." **só se** não houver b36, b45>0, b46>0, b47>0, b34t ou estenose tricúspide | ✓ V05 (grau); ✗ o ramo "fluxo preservado" |
| 51 | `jRefluxoTricuspide` | `valvas.ts:97` | Mapa L..I | ✓ V05 |
| 52 | `jRefluxoAortico` (j35) | `valvas.ts:212` | Espelha o j28 para as semilunares (b40p, b50, b51, b52, b39p, estenPulmGrau) | ✗ |
| 53 | `jRefluxoPulmonar` | `valvas.ts:282` | Mapa L..I + linha "Pressão sistólica média da artéria pulmonar de N mmHg." se `psmap>0` | ✗ |
| 54 | `concEstenMit` | `conclusoes/index.ts:115` | 3 graus | ✓ V01 |
| 55 | `concEstenAo` | `conclusoes/index.ts:124` | 3 graus; **esclerose silencia** | ✓ V02, V06 (negativo) |
| 56 | Conclusões de insuficiência + estenoses inline | `conclusoes/index.ts:301-348` | 4 mapas L..I (mitral, tricúspide, aórtica, pulmonar) + estenose tricúspide (sem leve) + pulmonar (3 graus). **Textos duplicados** dos achados, mantidos em paralelo | ~ (mitral/tricúspide V05; aórtica/pulmonar ✗) |

---

## 6. Aorta — 19 itens, 11 sem teste (o domínio mais frágil)

Governa a spec de 16/05 (`docs/decisoes/2026-05-16-spec-aorta.md`). Três tiers: **normal / ectasia / aneurisma** — leve/mod/imp saíram.

### 6.1 Cortes vivos (spec 16/05)

| # | Nome | Local | Valor exato | Teste |
|---|---|---|---|---|
| 57 | `corteWaseRaiz` | `calculos/aorta.ts:250` | WASE 2022, média+1,96·DP, por sexo **e** idade: ≤40a **♂38 ♀35** · 41-65a **♂40 ♀36** · ≥66a **♂41 ♀37**. `sexo !== 'F'` ⇒ vazio conta como homem | ~ (B09/S01 usam raiz 32 — não discriminam o corte) |
| 58 | `corteChamberAsc` | `calculos/aorta.ts:213` | ASE Chamber 2015 Tab.14: **♂38 ♀35** mm. *(o docblock de `tierAoAscendente:291` ainda diz "normal ≤ 36 mm" — comentário obsoleto)* | ~ (B10 usa 50, já aneurisma) |
| 59 | `corteArcoNormal` | `calculos/aorta.ts:223` | ACR/ACRIN 6654: **♂35 ♀32** mm | ✗ |
| 60 | `corteArcoAneurisma` | `calculos/aorta.ts:226` | **♂44 ♀41** mm (≥1,5× média ACRIN) | ✗ |
| 61 | `ANEURISMA_MM_RAIZ_ASC` | `calculos/aorta.ts:205` | **50 mm** absoluto (ACC/AHA 2022), raiz e ascendente | ✓ B10 |
| 62 | `indiceAortaAltura` | `calculos/aorta.ts:234` | `área(cm²)/altura(m)` com `r = mm/10/2`, `área = π·r²`, truncado 1. **≥10 cm²/m** ⇒ `graveIndice` | ✗ |
| 63 | `montarTierRaizAsc` | `calculos/aorta.ts:258` | Combina "acima do normal?" + medida + altura. **Aneurisma vence:** medida ≥50 vira aneurisma mesmo se `acimaDoNormal` for false | ✓ B10 |
| 64 | `tierRaizAo` | `calculos/aorta.ts:276` | **Cascata de 3 métodos:** idade presente → WASE; idade null → `classificarRaizAo` (Z-score se ASC) ; sem ASC → tabela fixa | ~ (só o ramo normal) |
| 65 | `tierAoAscendente` | `calculos/aorta.ts:293` | Corte Chamber + regra dos 50 mm + índice. Parâmetro `_asc` **ignorado** | ✓ B10 |
| 66 | `tierArcoAo` | `calculos/aorta.ts:303` | ≥44♂/41♀ aneurisma · >35♂/32♀ ectasia · senão normal. **Sem índice** | ✗ |

### 6.2 Caminho legado dentro do Senna90 (Z-score Roman/Devereux)

| # | Nome | Local | Conteúdo | Status | Teste |
|---|---|---|---|---|---|
| 67 | `classificarRaizAo` | `calculos/aorta.ts:41` | Z-score: `previsto(cm) = a + b·ASC` com **a=1,50 b=0,95 se idade<40**, senão **a=1,92 b=0,74**; SD=0,19 cm; `z=(medida/10 − previsto)/SD`. Fallback sem ASC: ♂[40,45,55] ♀[36,41,51] | **Vivo só quando `idade === null`** (rede de segurança do tierRaizAo) | ✗ |
| 68 | `classificarAoAscendente` | `calculos/aorta.ts:84` | a=1,47 b=0,91 SD=0,22; fallback ♂[37,42,50] ♀[34,39,47] | **MORTO** — nenhum chamador | ✗ |
| 69 | `classificarArcoAo` | `calculos/aorta.ts:121` | a=1,26 b=0,61 SD=0,20; fallback fixo [36,38,42] | **MORTO** | ✗ |
| 70 | `classificarPorZ` | `calculos/aorta.ts:157` | z≤2 normal · ≤3 leve · ≤4 moderada · >4 importante | só via #67 | ✗ |
| 71 | `classificarPorFallback` | `calculos/aorta.ts:164` | `≤L0 normal · ≤L1 leve · ≤L2 moderada · > importante` | só via #67 | ✗ |

### 6.3 Frases

| # | Nome | Local | Regra | Teste |
|---|---|---|---|---|
| 72 | `jAortaRaiz` (j37) | `achados/aorta.ts:84` | Raiz alterada → `comentarioRaiz` (aneurisma: "Dilatação aneurismática da Raiz aórtica." **sem "medindo"**; ectasia: "+ N,N cm²/m (valores acima de 10 cm²/m sugerem maior gravidade)" quando há altura). Raiz normal → `fraseNormais` combinando os 3 segmentos. Silencia se `sexo` vazio | ✓ S01 (3 normais), B09 |
| 73 | `jAortaAscendente` (j38) | `achados/aorta.ts:111` | COM "medindo N mm" + índice | ✓ B10 |
| 74 | `jArcoAortico` (j39) | `achados/aorta.ts:123` | COM "medindo N mm", SEM índice | ✗ |
| 75 | `jAortaNormaisComplementar` | `achados/aorta.ts:137` | Quando a raiz está alterada, emite "Aorta ascendente e arco aórtico com dimensões normais." (correção de 07/05) | ✗ |
| 76 | `concAorta` | `conclusoes/index.ts:148` | Uma frase por segmento alterado: "Ectasia/Aneurisma da/do X" + ", com critérios de maior gravidade" se `graveIndice` (só raiz/asc). Concatenadas com espaço no MESMO item | ✓ parcial B10 (aneurisma asc) |

> **Divergências candidatas (não julgadas):** (a) o mandato cita "arco 22-36/37-44/≥45" — a spec 16/05 e o código usam ACR/ACRIN **35/32 · 44/41 sexo-específico**; (b) `refValues.ts` (morto) ainda anuncia arco "22–36 mm" e ascendente "30–37/27–34"; (c) o legado (`motorv8mp4.js:1076,1091`) já é WASE sexo+idade na raiz e usa 22–36 no arco.

---

## 7. Pressões / PSAP — 4 itens, 2 sem teste

| # | Nome | Local | Regra / cortes | Saída | Teste |
|---|---|---|---|---|---|
| 77 | `jPSAP` (j30) | `achados/valvas.ts:157` | b37>0 → "Pressão sistólica da artéria pulmonar de N mmHg. VR < 36 mmHg." · b37 vazio **e** b23 vazio → "Ausência de sinais indiretos de hipertensão pulmonar." · b37 vazio com b23 → silêncio (j50 cobre) | achado | ✓ HP01, DC25 |
| 78 | `jProbabilidadeHP` (j50) / `concHP` | `achados/valvas.ts:325` · `conclusoes/index.ts:133` | ESC/ERS 2022 por vel IT + sinais indiretos (b38): >3,4 Alta · 2,9-3,4 Alta (com sinais) / Intermediária (sem) · <2,9 Intermediária (com) / Baixa (sem) | achado **e** conclusão (mesma função) | ✓ HP01-HP03, DC28 |
| 79 | Alerta `IT_SEM_PSAP` | `motor.ts:78-85` | `b23>0 && (!b37 || b37===0)` → alerta no campo b37 | `resultado.alertas` | ✗ — **o runner não compara `alertas`**; DC24 ("IT preenchida sem PSAP — gera alerta visual") não verifica nada |
| 80 | Alerta `REFLUXO_PULM_SEM_PMAP` | `motor.ts:88-94` | `b40p && (!psmap || psmap===0)` → alerta no campo psmap | `resultado.alertas` | ✗ |

> **PSAP não é derivada.** Não existe Bernoulli (`4v² + PAD`) em lugar nenhum do Senna90 — b37 é digitada pelo médico. Se o Senna93 quiser calcular, é fórmula nova, não portada.

---

## 8. Wilkins — 2 itens, 1 sem teste

| # | Nome | Local | Regra | Saída | Teste |
|---|---|---|---|---|---|
| 81 | `calcWilkinsScore` | `achados/wilkins.ts:93` | `null` se inativo; senão `mob+esp+sub+cal` (0-16). Sem validação de faixa dos componentes (o adapter clampa 0-4 em `motor-ts-adapter.ts:31`) | `derivados.wilkinsScore` | ✗ |
| 82 | `jWilkins` + `WK_DESC` | `achados/wilkins.ts:66` / `:15` | Sentinela `__WILKINS__{json}` com `{mob,esp,sub,cal,sc,concFrase}`. Cortes: **≥9** "NÃO são candidatos" · **=8** "no limite" · **≤7** "favorável … (escore ≤ 8)" | achado (bloco recuado) | ~ B05/B06 pinam só o prefixo `__WILKINS__`; nem score nem frase |

> **Oddity:** o ramo ≤7 escreve o literal "(escore ≤ 8)" enquanto a fronteira do código é ≤7 — o texto do laudo contradiz a própria regra.

---

## 9. Outros — 20 itens, 12 sem teste

### 9.1 Contratilidade segmentar

| # | Nome | Local | Conteúdo | Teste |
|---|---|---|---|---|
| 83 | `wallText` | `achados/paredes.ts:18` | 18 padrões: {H,A,D} × {B, MB, M, MA, A} + as 3 formas difusas. Texto: "Alteração contrátil por hipo/a/discinesia da porção X da {parede}" — **sem ponto final** | ✗ |
| 84 | `jApex` (j13) | `paredes.ts:46` | 3 códigos, "…da região apical do ventrículo esquerdo" | ✗ |
| 85 | `j14`-`j19` (b56-b61) | `paredes.ts:56-83` | Rótulos: b56 anterior · b57 "parede septalanterior" · b58 "parede septalinferior" (**sem espaço** — literal preservado) · b59 inferior · b60 inferolateral · b61 lateral | ✗ |
| 86 | `jDemaisParedes` (j20) | `paredes.ts:86` | NL "Contratilidade preservada nas demais paredes" · HD difusa · HR/AD/**DD** — DD ("discinesia") devolve o texto de **hipocinesia** (bug de tabela preservado do legado) | ✗ |

**b59/b60/b61 — o que o Senna90 de fato faz (decisão: Senna90 é a verdade):**

| ID do DOM | Senna90 (`types.ts:135-137`, `paredes.ts:71-83`) | Legado (`motorv8mp4.js:339-341`) | Rótulo na tela (`SidebarLaudo.tsx:569-571`) |
|---|---|---|---|
| `b59` | **parede inferior** | parede lateral | "P. Inferior" |
| `b60` | **parede inferolateral** | parede inferior | "P. Inferolateral" |
| `b61` | **parede lateral** | parede inferolateral | "P. Lateral" |

A tela e o adapter (`motor-ts-adapter.ts:150-156`) já falam a língua do Senna90 (ordem AHA); o legado ficou com a rotação antiga — e como as frases dele não chegam a lugar nenhum desde a migração TipTap, a rotação nunca apareceu para o médico. O adapter deixa o aviso explícito: "a comparação shadow precisará tratar isso".

### 9.2 Strain

| # | Nome | Local | Corte | Teste |
|---|---|---|---|---|
| 87 | `jGLSve` | `achados/strain.ts:17` | `|GLS| ≥ 20` preservado; texto "(VR ≥ -20%)" | ✓ ST01, ST02, ST03 |
| 88 | `jGLSvd` | `strain.ts:28` | `|GLS| ≥ 20` | ✗ |
| 89 | `jLARS` | `strain.ts:39` | `lars ≥ 18` | ✓ ST04 |
| 90 | `concStrainVE` | `conclusoes/index.ts:180` | **usa `abs ≥ 18`**, não 20. 3 cenários (FE preservada + normal / FE preservada + reduzido / FE reduzida). Linha 186 tem a guarda `feT >= 1 ? … : feT >= feLimS/100` (defensiva, praticamente inalcançável) | ✓ ST01, ST02 |
| 91 | `concStrainVD` | `conclusoes/index.ts:198` | `abs ≥ 20`; **silencia** se b32 preenchido | ✗ |

### 9.3 Pericárdio, placas, ritmo

| # | Nome | Local | Regra | Teste |
|---|---|---|---|---|
| 92 | `jRitmo` (j2) | `achados/camaras.ts:13` | `'N'` → irregular; **qualquer outra coisa (inclusive vazio)** → "Ritmo cardíaco regular." | ✓ S01, B01 |
| 93 | `jPericardio` (j36) | `achados/valvas.ts:300` | 5 graus; vazio → "Pericárdio sem alterações." | ✓ S01 (só o ramo normal) |
| 94 | `jPlacas` (j40) | `valvas.ts:312` | `'s'` placas calcificadas · `'nv'` "Arco aórtico não visualizado adequadamente." | ✗ |

### 9.4 Infra e código morto

| # | Nome | Local | Situação | Teste |
|---|---|---|---|---|
| 95 | `truncar` / `truncarStr` | `helpers/truncate.ts:21,36` | **Trunca, não arredonda** (`Math.trunc(x·10^d)/10^d`) — atravessa TODOS os derivados | ~ (só pelo comentário do ASC 1.84) |
| 96 | `fmt` / `fmtPct` | `helpers/format.ts:14,27` | **MORTOS** — ninguém importa. `fmtPct` carrega o fallback "VIDE" do legado | ✗ |
| 97 | `readStr`/`readNum`/`parseNum`/`parseWkScore`/`preenchido` | `helpers/normalize.ts:11-57` | **MORTOS e duplicados** — `motor-ts-adapter.ts:16-48` reimplementou readStr/readNum/readWk | ✗ |
| 98 | `isOOR` / `checkOOR` / `getLimiteSuperior` | `classificacoes/isOOR.ts:25,99,134` | **MORTO.** É exatamente a marcação em vermelho da params-tbody. Assinatura **sem `idade`** (o legado tem). Já divergiu: b7 >40♂/>36♀ fixo (vs WASE por idade), b28 >38/>35, b29 >35/>32, feT <0,51/<0,53 (vs 0,52/0,54 do j11), b25 ≥30, b33 <17 | ✗ |
| 99 | `refVal` | `classificacoes/refValues.ts:20` | **MORTO.** Coluna "VR" da tabela. Sem `idade`. Já divergiu: b7 "32–40/28–36 mm" (com piso, que o isOOR não aplica), b28 "30–37/27–34", b29 "22–36" (vs 35/32 do tier), b33 "≥17 mm" (vs "VR ≥ 20 mm" do j23) | ✗ |
| 100 | `classificacoes/cutoffs.ts` (19 exports) | `cutoffs.ts:25-233` | **MORTO** — AE_DIAMETRO, DDVE, VD_DIAMETRO, LAVI, RAVI, MASSA_VE, IMVE_NORMAL_MAX, ER_NORMAL_MAX, FE_TEICHHOLZ, FE_SIMPSON, FE_GRAVIDADE, GLS_*, LARS_NORMAL, E_E_SEPTAL_CUTOFF, E_SEPTAL_CUTOFF, VEL_IT, PSAP_NORMAL_MAX + 6 funções `obter*`. Os números vivos estão **inline** nos achados. Já divergiu: `LAVI.moderada_max=48` (o j4 trata 48 como importante) | ✗ |
| 101 | `gerarAchados` / `gerarConclusao` | `achados/index.ts:176` · `conclusoes/index.ts:289` | Ordem clínica fixa de 24 blocos (achados) e 18 (conclusões); `filter(Boolean)`; fallback "Exame ecodopplercardiográfico transtorácico sem alterações significativas." Cada um tem seu **próprio `montarD`** (dois adapters paralelos, campos diferentes) | ~ ordem não é asserida (o runner usa `includes`); fallback ✓ S01-S03, B01 |

---

## 10. Resposta estrutural — o que `calcularDerivados` JÁ cobre da metade params-tbody

A metade numérica do legado é: 10 caixas `calc-*` da sidebar (`motorv8mp4.js:1189-1192`) + a coluna direita da `params-tbody` (`:1194-1204`, os mesmos 10 valores) + idade + `calc-wilkins` + o alerta do b37.

| Valor do legado | ID/linha no legado | Já em `calcularDerivados`? | Onde |
|---|---|---|---|
| IMC | `calc-imc` / linha "Índice de Massa Corporal" | ✅ | `imc` — motor.ts:33 |
| ASC | `calc-asc` / "Área Sup. Corpórea" | ✅ (**com 71,84, o legado usa 71,74**) | `asc` — motor.ts:34 |
| Relação Ao/AE | `calc-aoae` | ✅ | `aoae` — motor.ts:38 |
| Vol. Diast. final VE | `calc-vdf` | ✅ | `vdf` — motor.ts:39 |
| Vol. Sist. final VE | `calc-vsf` | ✅ | `vsf` — motor.ts:40 |
| FE Teichholz | `calc-fe` | ✅ | `feT` — motor.ts:41 |
| Fração de Encurtamento | `calc-fs` | ✅ | `fs` — motor.ts:42 |
| Massa do VE | `calc-massa` | ✅ | `massa` — motor.ts:43 |
| Índice de Massa VE | `calc-im` | ✅ | `imVE` — motor.ts:44 |
| Espessura Relativa | `calc-er` | ✅ | `er` — motor.ts:45 |
| Idade | `out-idade` | ✅ | `idade` — motor.ts:35 |
| Escore Wilkins | `calc-wilkins` | ✅ | `wilkinsScore` — motor.ts:55 |
| Área aórtica indexada | (não existe no legado) | ✅ bônus | `aoIdx` — motor.ts:46 |
| Graus de estenose (4) | (não existe na tabela) | ✅ bônus | `estenMitGrau`/`estenAoGrau`/`estenTricGrau`/`estenPulmGrau` |
| Alerta visual do b37 | `alertaIT()` :1099 | ✅ | `gerarAlertas` — motor.ts:78 |

**Conclusão: 12/12 dos valores numéricos da metade params-tbody já são calculados pelo Senna90 hoje** — e viajam pela ponte (`senna90-bridge.ts:49` devolve `derivados`), mas **nenhum consumidor os usa**: a tabela e as caixas continuam sendo pintadas pelo motor legado. A dianteira da unificação é essa: os números já existem, só falta quem os leia.

**O que ainda NÃO está pronto (a metade de apresentação):**

1. **`refVal(campo, sexo, idade)`** — existe (`refValues.ts`) mas morto, **sem o parâmetro `idade`** que o legado já usa na raiz (`'≤ ' + waseRaizUpper(sexo, idade) + ' mm'`), e com números que já divergiram (b7, b28, b29, b33).
2. **`isOOR(campo, val, sexo, idade)`** — existe (`isOOR.ts`) mas morto, também sem `idade`, também divergido.
3. **Regra "VIDE"** — o legado escreve `VIDE` em FE/FS quando `b12` (DSVE) é null e `—` quando é outra coisa (`:1190-1191`). O Senna90 devolve `null` nos dois casos: a distinção **não existe** e teria que ser recriada (o fallback "VIDE" só sobrevive num default de `fmtPct`, morto).
4. **Formatação por casa decimal** da tabela (asc/er/aoae em 2 casas, resto em 1) — hoje vive no `sc(id, x, d)` do legado.

---

## 11. Decisões que atravessam (para o 1-a-1)

**Decisão 19b — zero validação de faixa:** confirmado no Senna90. As únicas guardas são `null`/`≤0` (`calcIMC`, `calcASC`, `calcVDF`, `calcMassaVE`, `calcRWT`, `calcAoAE`). Não há teto, não há checagem de plausibilidade, não há rejeição de valor absurdo: um DDVE de 500 mm calcula massa e emite "aumentada em grau importante" sem reclamar. A única normalização é o clamp 0-4 do Wilkins, e ela mora no adapter, não no motor.

**Decisão nº24 — sexo clínico:** o Senna90 trata sexo vazio de **duas maneiras incompatíveis**:
- Nas **frases** (`jAE_diametro`, `jVE_diametro`, `j9`, `j10`, `j11`, `j12`, `jAortaRaiz`, `concSistolica`, `concAorta`, `j47`): `if (!sexo) return ''` → **silêncio total** (pinado por S03).
- Nas **classificações e cortes** (`corteWaseRaiz:251`, `corteChamberAsc:214`, `corteArcoNormal:224`, `isOOR:27`, `refVal:21`, `obterCutoff*`): `sexo !== 'F'` → **vazio conta como homem**.
Ou seja: sem sexo o motor calcula tudo com régua masculina e depois não fala nada. Se o Senna93 passar a emitir a tabela (que usa o segundo grupo), um exame sem sexo vai ganhar VR e alertas masculinos silenciosamente.

---

## 12. Achados de leitura (ordenados por peso para a unificação)

1. **`src/senna90/classificacoes/` inteiro é código morto** — 449 linhas (`cutoffs.ts` 233 + `isOOR.ts` 149 + `refValues.ts` 67), zero importadores. É justamente a metade params-tbody que o Senna93 precisa absorver: ela **já foi escrita**, nunca foi ligada, e já divergiu dos números inline vivos (LAVI 48, feT 0,51/0,53 vs 0,52/0,54, b7 32–40 vs >40, b28 37/34 vs 38/35, b29 22–36 vs 35/32, b33 17 vs 20). Ligar isso sem reconferir número por número propaga a deriva para dentro do laudo.
2. **Ramo inalcançável em `concSistolica`** (`conclusoes/index.ts:101-105`): a conclusão "Alteração contrátil segmentar do ventrículo esquerdo." nunca sai, porque `disfVE` só é verdadeiro quando `b54 < feLimS`, e a guarda interna exige `b54 >= feLimS`. O achado equivalente (j12, "preservada, apesar da alteração contrátil segmentar") sai sempre que Simpson está preservado — inclusive sem nenhuma parede alterada.
3. **Strain com dois cortes diferentes no mesmo laudo**: achado `jGLSve` usa |20| (`strain.ts:20`), conclusão `concStrainVE` usa |18| (`conclusoes/index.ts:188`). Um GLS de -19% imprime "reduzido" nos achados e "preservada, confirmada pelo strain longitudinal" na conclusão. Só o achado tem teste (ST03).
4. **TAPSE com dois valores de referência**: o texto que vai para o laudo diz "VR ≥ 20 mm" (`sistolicaVD.ts:18,27`); a tabela (morta) diz ≥17 (`refValues.ts:59`, `isOOR.ts:68`). Zero testes tocam TAPSE, disfunção de VD, paredes segmentares, arco aórtico, refluxo aórtico/pulmonar, placas ou GLS de VD.
5. **44 de 101 itens sem teste que pina, concentrados onde o Senna93 vai mexer**: aorta (11 de 19 — arco 100% descoberto, índice cm²/m nunca exercido, corte WASE nunca discriminado), volumes (`vdf`/`vsf`/`fs`/`aoae` nunca asseridos) e alertas (o runner sequer compara `resultado.alertas`, então DC24 — "gera alerta visual" — não testa nada). Some-se que os 72 casos **não rodam no `npm run test:unit`**: só o `senna90-diastolica-manual.test.mjs` está na esteira automática.

**Menores, para a lista do 1-a-1:** `calcMassaVE` aplica o `+0,6` antes do `/1000` (vira 0,0006 g); `jMitralMorfologia` decide a frase de "morfologia preservada" olhando o **refluxo tricúspide**; `jWilkins` imprime "(escore ≤ 8)" num ramo cuja fronteira é ≤7; `jDemaisParedes` mapeia `DD` (discinesia) para o texto de hipocinesia; `tierAoAscendente` ignora o parâmetro `_asc` e seu docblock ainda cita "≤36 mm"; `j22` monta a frase com strings vazias quando um campo é null ("Relação E/A= ;"); o `textoLivre` da diastólica manual é inalcançável em produção (o adapter fixa `''`); `achados/index.ts` e `conclusoes/index.ts` mantêm **dois `montarD` paralelos** com campos diferentes.
