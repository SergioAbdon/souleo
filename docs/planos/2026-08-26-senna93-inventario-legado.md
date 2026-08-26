# Senna93 — Inventário do motor LEGADO (`public/motor/motorv8mp4.js`)

**Data:** 2026-08-26 · **Escopo:** leitura read-only, zero edições · **Arquivo:** 1486 linhas
**Mandato:** `docs/decisoes/2026-08-26-senna93-motor-unificado.md`
**Objetivo deste doc:** alimentar o 1-a-1 com o cardiologista. Cada fórmula/corte transcrito
fielmente, com a linha do motor, os inputs (ids do DOM), a saída (linha do `params-tbody`,
elemento `calc-*`, alerta ou frase) e as esquisitices.

> **Nota de leitura:** o motor legado é quem hoje pinta `#params-tbody` e os `calc-*`.
> O PDF assinado **raspa `#params-tbody` por `textContent`** (`src/lib/pdf-params.ts`,
> `lerParamsDoDOM()` em `src/app/laudo/[id]/page.tsx:1422`) — ou seja, **toda a tabela de
> parâmetros impressa no laudo assinado nasce das linhas 1196–1215 deste arquivo.**
> As frases (achados/conclusões) já pertencem ao Senna90; ficam aqui resumidas, com destaque
> só para o que o legado gera e o Senna90 **não**.

---

## Convenções

| Símbolo | Significado |
|---|---|
| `T(x,d)` | **truncamento**, não arredondamento — `Math.trunc(x·10^d)/10^d` (linha 30) |
| `n(id)` | `parseFloat` do valor do input; `NaN` → `null` (linha 29) |
| `v(id)` | valor cru (string) do input (linha 28) |
| `!x` | guarda por *falsy* — **0 é tratado como "não medido"** em quase todo o motor |
| ⚠️ | esquisitice / candidato a divergência para o 1-a-1 |

**Contrato do DOM (inputs lidos):** `sexo`, `ritmo`, `peso`, `altura`, `dtnasc`, `dtexame`,
`b7–b13`, `b19–b25`, `b27–b29`, `b32–b42`, `b45–b47`, `b50–b52`, `b54–b62`,
`b34t`, `b39p`, `b40p`, `b46t`, `b47t`, `b50p`, `psmap`,
`gls_ve`, `gls_vd`, `lars`, `wilkins-toggle`, `wk-mob`, `wk-esp`, `wk-cal`, `wk-sub`.
**Nunca usados apesar de lidos:** `b27` (linha 62) e `b41`/`b42` só nas frases. `b27` é lido,
devolvido em `calcAll()` e **nunca consultado por nenhuma função** ⚠️.

---

# 1. Antropometria e superfície corporal

| # | Nome | Linha | Inputs | Fórmula (unidades) | Saída | Observações |
|---|---|---|---|---|---|---|
| 1.1 | **IMC** | 87 | `peso` (kg), `altura` (cm) | `T( peso / (altura/100)² , 1)` → kg/m² | `#calc-imc` (sidebar) · `params-tbody` col. direita linha 1: *"Índice de Massa Corporal"*, unid. `kg/m²`, **VR `<25 kg/m²`** | Guarda `(peso&&alt)` — peso ou altura = 0 ⇒ `null`. VR fixa, sem faixas OMS. |
| 1.2 | **ASC (DuBois 1916)** | 88 | `peso` (kg), `altura` (cm) | `T( 0.0001 × **71.74** × peso^0.425 × altura^0.725 , 2)` → m² | `#calc-asc` (2 casas) · `params-tbody` linha 10 col. direita *"Área Sup. Corpórea"*, `m²`, **VR vazia** | ⚠️ **A constante é `71.74`. O Senna90 usa `71.84`** (`src/senna90/calculos/demografia.ts`, com comentário "correção aprovada pelo Dr. Sérgio em 2026-05-03"). Diferença de ~0,14 % — propaga para **IMVE, área aórtica indexada e TODA a classificação da aorta por DP**. **Divergência numérica viva entre os dois motores.** |
| 1.3 | **Idade (tabela/alerta)** | 1081 `idadeAnos()` | `dtnasc`, `dtexame` | diferença de anos civis com correção mês/dia | usada só em `refVal('b7')` e `isOOR('b7')` | Correta. |
| 1.4 | **Idade (texto do laudo)** | 1109 `calcIdade()` | idem | idem 1.3, formata `"N anos"` / `"N ano"` | `#out-idade` | Duplicata literal de 1.3 com formatação. `a>1?'anos':'ano'` ⇒ **idade 0 imprime "0 ano"**; idade 1 imprime "1 ano". OK. |
| 1.5 | **Idade (classificação da aorta)** | 499–502 | `dtnasc`, `dtexame` | `Math.floor((exame − nasc) / 31557600000)` (ms de ano juliano = 365,25 d) — **fallback fixo `idade = 50`** se faltar data | consumida por `_classificarAorta` | ⚠️ **Terceira implementação de idade no mesmo arquivo**, e a única com fallback silencioso para 50 anos. Pode divergir 1 ano da 1.3 perto do aniversário. |

**Domínio 1: 5 derivações.**

---

# 2. Câmaras — dimensões, volumes e classificação

## 2.1 Volumes e razões calculados

| # | Nome | Linha | Inputs | Fórmula | Saída | Observações |
|---|---|---|---|---|---|---|
| 2.1.1 | **Relação Ao/AE** | 89 | `b7` (raiz Ao, mm), `b8` (AE, mm) | `T(b7/b8, 2)` | `#calc-aoae` · `params-tbody` linha 2 col. dir. *"Relação Ao/AE"*, **sem unidade, VR vazia** | Guarda `(b7&&b8)`. |
| 2.1.2 | **VDF (Teichholz)** | 90 | `b9` (DDVE, mm) | `T( ((b9/10)³ × 7) / (2.4 + b9/10) , 1)` → ml, D em **cm** | `#calc-vdf` · `params-tbody` linha 3 col. dir. *"Vol. Diast. final VE"*, `ml`, **VR: M `62–150 ml` · F `46–106 ml`** | Fórmula clássica Teichholz 1976. |
| 2.1.3 | **VSF (Teichholz)** | 91 | `b12` (DSVE, mm) | `T( ((b12/10)³ × 7) / (2.4 + b12/10) , 1)` → ml | `#calc-vsf` · `params-tbody` linha 4 col. dir. *"Vol. Sist. final VE"*, `ml`, **VR: M `21–61 ml` · F `14–42 ml`** | idem. |
| 2.1.4 | **FE Teichholz (`feT`)** | 92 | `b9`, `b12` | `((b9³·7/(2.4+b9/10)) − (b12³·7/(2.4+b12/10))) / (b9³·7/(2.4+b9/10))` → **fração 0–1** | `#calc-fe` (`feT×100` com 1 casa + `%`) · `params-tbody` linha 5 col. dir. *"Fração de Ejeção (Teichholz)"*, valor `feT×100` **com 0 casas** + `%`, **VR: `>51%` (M) · `>53%` (F)** | ⚠️ **Usa `b9³` em MILÍMETROS** no numerador e denominador, enquanto o VDF usa `(b9/10)³`. Matematicamente o fator 1000 se cancela na razão (resultado idêntico), mas é o resíduo do "10× morto" e induz erro em qualquer refactor. ⚠️ **Não passa por `T()`** — é o único derivado sem truncamento. ⚠️ **VR impressa (`>51/>53`) NÃO bate com o corte da frase j11 (`>0.52`/`>0.54`).** Um paciente com FE 52 % (M) é impresso dentro da referência mas recebe a frase *"preservada, porém no limite inferior da normalidade"*. |
| 2.1.5 | **Fração de encurtamento (`fs`)** | 93 | `b9`, `b12` | `(b9 − b12) / b9` → fração | `#calc-fs` (`×100`, 1 casa, `%`) · `params-tbody` linha 6 col. dir. *"Fração de Encurtamento"*, `×100` com **0 casas** + `%`, **VR `30–40%`** | Sem `T()`. Sem alerta OOR (a coluna direita nunca alerta). |
| 2.1.6 | **Placeholder "VIDE"** | 1190–1191, 1201–1202 | `b12` | se `feT===null` **e** `b12===null` → imprime a string `VIDE` em vez de `—` | `#calc-fe`, `#calc-fs`, `params-tbody` | ⚠️ Magic string. "VIDE" vaza para o **PDF assinado** quando o DSVE não é medido. Nenhuma legenda no rodapé do PDF explica o termo. |

## 2.2 Classificação de câmaras (frases + cortes)

| # | Nome | Linha | Input | Cortes (M / F) | Saída |
|---|---|---|---|---|---|
| 2.2.1 | **AE por diâmetro (j3)** | 152 | `b8` (mm), `sexo` | **M:** >52 importante · =52 mod-imp · >46 moderado · =46 leve-mod · >40 leve. **F:** >46 importante · =46 mod-imp · >42 moderado · =42 leve-mod · >38 leve | achado | ⚠️ Suprimido inteiro se `b24>0` (volume index tem precedência). ⚠️ Os testes `===` de igualdade exata só disparam com valor inteiro — `b8 = 46.0` cai em "leve a moderado", `b8 = 46.1` em "moderado", `b8 = 45.9` em "leve". Degrau de 0,1 mm entre 3 graus. |
| 2.2.2 | **AE por volume index (j4)** | 171 | `b24` (ml/m²) | ≥48 importante · ≥42 moderado · >34 leve · ≤34 normal (silêncio) | achado, com o valor no texto |
| 2.2.3 | **AD por volume index (j5)** | 179 | `b25` (ml/m²), `sexo` | **F:** ≤27 normal · ≤33 leve · ≤39 moderado · >39 importante. **M:** ≤32 normal · ≤38 leve · ≤45 moderado · >45 importante | achado |
| 2.2.4 | **VE por diâmetro (j6)** | 191 | `b9`, `sexo` | **M:** >68 imp · =68 mod-imp · >63 mod · =63 leve-mod · >58 leve. **F:** >61 imp · =61 mod-imp · >56 mod · =56 leve-mod · >52 leve | achado |
| 2.2.5 | **VD por diâmetro (j7)** | 209 | `b13` (mm) | >50 imp · =50 mod-imp · >42 mod · =42 leve-mod · >35 leve — **sem distinção de sexo** | achado |
| 2.2.6 | **Frase de câmaras normais (j8)** | 219 | `b8`,`b24`,`b9`,`b13`,`b25`,`sexo` | AE alterado = `b24>34` (se `b24>0`) senão `b8 > 40 M / 38 F`; VE = `b9 > 58 M / 52 F`; VD = `b13 > 35`; AD = `b25 > 27 F / 32 M` | achado: "Câmaras cardíacas com dimensões normais." / lista das normais / "Demais câmaras…" | Campo em branco = **assume normal**. |

**Domínio 2: 12 itens (6 cálculos + 6 classificações).**

---

# 3. Massa e geometria do VE

| # | Nome | Linha | Inputs | Fórmula / cortes | Saída | Observações |
|---|---|---|---|---|---|---|
| 3.1 | **Massa VE (Devereux)** | 94 | `b9`,`b10`(SIV),`b11`(PP), mm | `T( ((((b9+b10+b11)³ − b9³) × 1.04) × 0.8 + 0.6) / 1000 , 1)` → g | `#calc-massa` · `params-tbody` linha 7 col. dir. *"Massa do VE"*, `g`, **VR: `<201 g` (M) · `<151 g` (F)** | ⚠️ **Ordem das operações difere da Devereux canônica.** Canônica: `0.8 × [1.04 × (…)] + 0.6` com o `+0.6` **em gramas**. Aqui o `+0.6` entra **antes** da divisão por 1000, ou seja soma **0,0006 g**, não 0,6 g. Erro sistemático de −0,6 g em toda massa. **O Senna90 replica exatamente o mesmo encadeamento** (`(volMiocardio*1.04*0.8 + 0.6)/1000`) — divergência contra a literatura, não entre motores. |
| 3.2 | **Índice de massa (IMVE)** | 95 | `massa` (g), `asc` (m²) | `T(massa/asc, 1)` → g/m² | `#calc-im` · `params-tbody` linha 8 col. dir. *"Índice de Massa VE"*, `g/m²`, **VR: `<103 g/m²` (M) · `<89 g/m²` (F)** | Herda o desvio da ASC (71,74). |
| 3.3 | **Espessura relativa (ER/RWT)** | 96 | `b9`,`b10`,`b11` | `T( (b10+b11)/b9 , 2)` | `#calc-er` (2 casas) · `params-tbody` linha 9 col. dir. *"Espessura Relativa"*, **sem unidade, VR `<0,43`** | Variante Reichek (SIV+PP)/DDVE, não `2×PP/DDVE`. |
| 3.4 | **Massa — classificação (j9)** | 247 | `massa`, `sexo` | **M:** >254 imp · =254 mod-imp · >227 mod · =227 leve-mod · >200 leve · ≤200 **"preservada"**. **F:** >193 imp · =193 mod-imp · >171 mod · =171 leve-mod · >150 leve · ≤150 "preservada" | achado | Corrigido em 07/05/2026 (texto passou de "espessura miocárdica" para "massa"). ⚠️ Único j\* que emite frase **positiva** quando normal ("Massa … preservada."), diferente do padrão "silêncio quando normal" do resto. |
| 3.5 | **Padrão geométrico (j10 achado / j47 conclusão)** | 266 / 596 | `er`, `imVE`, `sexo` | `lim = 102 (M) / 88 (F)` g/m². `er>0.42 & imVE≤lim` → **remodelamento concêntrico**; `er≤0.42 & imVE>lim` → **hipertrofia excêntrica**; `er≤0.42 & imVE≤lim` → **normal** (só no achado); `er>0.42 & imVE>lim` → **hipertrofia concêntrica** | achado (j10) + conclusão (j47) | ⚠️ Corte `0.42` no código × **VR impressa `<0,43`** na tabela — coerente (`>0,42` ⇔ `≥0,43` para 2 casas), mas depende do truncamento. ⚠️ Cortes de IMVE aqui (102/88) **conflitam com os cortes de IMVE usados na diastologia (115/95, linha 365)** — dois limites de HVE diferentes no mesmo arquivo. |

**Domínio 3: 5 itens.**

---

# 4. Função sistólica

| # | Nome | Linha | Inputs | Cortes | Saída | Observações |
|---|---|---|---|---|---|---|
| 4.1 | **FE Teichholz — frase (j11)** | 276 | `feT` (fração), `sexo` | **M:** >0.52 preservada · =0.52 "limite inferior" · <0.30 imp · =0.30 mod-imp · <0.40 mod · =0.40 leve-mod · <0.52 leve. **F:** idem com **0.54** no lugar de 0.52 | achado | ⚠️ Testes de igualdade contra float (`fe===0.52`) — como `feT` **não é truncado** (item 2.1.4), a igualdade exata é praticamente inalcançável: os ramos "limite inferior", "moderado a importante" e "leve a moderado" da FE Teichholz são **efetivamente código morto**. |
| 4.2 | **FE Simpson — frase (j12)** | 299 | `b54` (%), `sexo` | `lim = 52 (M) / 54 (F)`. `≥lim` → "preservada, apesar da alteração contrátil segmentar" · <30 imp · =30 mod-imp · <40 mod · =40 leve-mod · resto leve | achado (substitui j11 quando `b54!==null`, linha 963) | ⚠️ O ramo `≥lim` afirma "apesar da alteração contrátil segmentar" **mesmo sem nenhuma parede alterada** (não consulta `b55`–`b62`). |
| 4.3 | **Contratilidade segmentar (j13–j20, `wallText`)** | 310–342 | `b55`–`b62` | 18 códigos (`HB/HMB/HM/HMA/HA/H`, `AB/…/A`, `DB/…/D`) → texto | achados | ⚠️ **Mapeamento de paredes ERRADO e já decidido:** legado usa `b59=parede lateral`, `b60=parede inferior`, `b61=parede inferolateral`; a sidebar e o Senna90 usam `b59=inferior`, `b60=inferolateral`, `b61=lateral` (ver comentário em `SidebarLaudo.tsx:560`). Enquanto o legado gerar achados, os laudos saem com a parede trocada. ⚠️ `j15`/`j16` escrevem *"parede septalanterior"* / *"parede septalinferior"* **sem espaço**. ⚠️ `j20`: o código `DD` (discinesia difusa) mapeia para o texto **"hipocinesia das demais paredes"** — bug replicado no Senna90 (`achados/paredes.ts:93`). ⚠️ `j20` usa "contratil" sem acento em 4 das 5 entradas. |
| 4.4 | **VD sistólica (j23)** | 421 | `b32` (grau), `b33` (TAPSE, mm) | `L/LM/M/MI/I` → grau; sem `b32` e `b33>0` → "preservada" | achado, sufixo `" TAPSE= X mm (VR ≥ 20 mm)."` | ⚠️ **O motor imprime "VR ≥ 20 mm" mas o label da sidebar diz "VR≥17"** (`SidebarLaudo.tsx:550`) e a ASE 2015 usa ≥17 mm. Contradição visível no laudo assinado. ⚠️ `!d.b32 && d.b33>0` compara `null>0` = false — se TAPSE não medido, cai no retorno genérico "preservada" sem TAPSE, correto por acidente. |
| 4.5 | **Conclusão sistólica unificada (`concSistolica`)** | 608 | `b9`,`b13`,`b54`,`feT`,`b32`,`sexo` | `lvLim=58/52`, `feLim=0.52/0.54`, `feLimS=52/54`, VD dilatado `b13>35`. Dilatação (VE ou VD) → prefixo *"Miocardiopatia Dilatada com "* | conclusão | ⚠️ `prefix` é montado (linha 632) e **usado só em 3 dos 4 ramos**; o ramo `disfVE && !disfVD` com Simpson preservado ignora o prefixo e devolve texto próprio. ⚠️ Ramo interno inatingível: `disfVE` exige `b54 < feLimS`, mas dentro do bloco testa-se `b54 >= feLimS` (linha 648) — **código morto**. ⚠️ "Miocardiopatia Dilatada" é atribuída também quando **só o VD** está dilatado. |
| 4.6 | **Strain GLS VE (jGLSve / concStrainVE)** | 842 / 686 | `gls_ve` (%, negativo) | `|GLS| ≥ 18` normal | achado `"… de X% (VR ≥ -18%)"` + conclusão | `fePreservada` recalculado localmente com `b54 ≥ feLimS` ou `feT ≥ feLimS/100`. |
| 4.7 | **Strain GLS VD (jGLSvd / concStrainVD)** | 849 / 705 | `gls_vd` (%) | `|GLS| ≥ 20` normal | achado + conclusão | Conclusão só sai se `!b32` (VD sem disfunção convencional). |

**Domínio 4: 7 itens.**

---

# 5. Função diastólica e pressões de enchimento

## 5.1 Algoritmo automático (j21) — linha 344

**Detecção de FA:** `ritmo === 'N'` **e** (`b20` nulo **ou** `b20 === 0`).

### Ramo FA (linhas 347–360)

| Parâmetro | Input | Corte "elevado" |
|---|---|---|
| E/e' | `b22` | `> 14` |
| Vel. IT | `b23` (m/s) | `> 2.8` |
| Vol. AE index | `b24` (ml/m²) | `> 34` |
| LA strain | `lars` (%) | `< 18` |

- `avaliados < 2` → **`FA_INDETERMINADA`**
- `elevado ≥ 2` → **`FA_PRESSAO_ELEVADA`**
- senão → **`FA_PRESSAO_NORMAL`**
- nenhum dos 4 preenchido → **`FA_SEM_DADOS`**

⚠️ **Corte de E/e' é `>14` aqui e `>15` no ramo sinusal** (linhas 369 e 374). Mesmo parâmetro, dois cortes no mesmo algoritmo.

### Ramo sinusal (linhas 362–377)

Guarda: se `b19`,`b20`,`b21`,`b22`,`b23`,`b24` todos falsy → `''`.

Gatilhos que forçam a classificação direta (`feVide || feBaixa || massaAlta`):
- `feVide` = `feT===null && b12===null`
- `feBaixa` = `feT!==null && (feT<=1 ? feT<0.5 : feT<50)` ⚠️ **corte fixo 50 %**, ignora os 52/54 por sexo; o ramo `feT<50` (escala percentual) é inalcançável porque `feT` é sempre fração.
- `massaAlta` = `imVE > 95` (F) / `imVE > 115` (M) ⚠️ **cortes diferentes dos 88/102 usados em j10/j47**.

`classify()`:
1. `b20 ≥ 2` → **Grau III (restritivo)**
2. `b20 ≤ 0.8` **e** `b19 ≤ 50` → **Grau I (alteração de relaxamento)**
3. contagem `p` = (`b22>15`) + (`b23>2.8`) + (`b24>34`); `p ≥ 2` → **Grau II (pseudonormal)**
4. senão → **Grau I**

Caso não haja gatilho, contagem `c` = (`b21<7`) + (`b22>15`) + (`b23>2.8`) + (`b24>34`):
- `c ≤ 1` → *"Índices diastólicos … preservados"*
- `c ≥ 3` → `classify()`
- `c === 2` → *"Função Diastólica … Indeterminada"*

⚠️ **`b21 < 7` (e' septal) é usado sem distinção de idade nem de anel (septal vs lateral).** A ASE usa e' septal <7 cm/s **e** lateral <10 cm/s como dois critérios; aqui o `b21` sozinho vale 1 ponto.
⚠️ Em `c` são somados 4 critérios mas os campos ausentes contam como **0 (normal)**, não como "não avaliado" — 2 campos vazios empurram o resultado para "preservados".

## 5.2 Detalhamento (j22 / j22FA) — linhas 405 / 390

Frase com os valores brutos: `Velocidade da Onda E= {b19} cm/s; Relação E/A= {b20}; Velocidade e' septal= {b21} cm/s; Relação E/e'= {b22}; volume index do átrio esquerdo = {b24} ml/m²` (+ `; Velocidade do Refluxo Tricuspídeo= {b23} m/s.` se `b23`).
⚠️ Campos vazios viram **string vazia** dentro da frase: sai *"Relação E/A= ; "* no laudo. `j22FA` (versão FA) evita isso montando só as partes preenchidas — a versão sinusal, que é a mais usada, **não**.

## 5.3 Conclusão diastólica (j43) — linha 580

Mapeia o retorno de `j21` para a conclusão. `FA_SEM_DADOS` → `''`; *"preservados"* → `''` (silêncio). Grau I/II/III e Indeterminada → frases.

## 5.4 Modo manual (T3/S5) — linhas 862–938

Estado em variáveis de módulo: `_diastModo` (`'auto'|'manual'`), `_diastManualSelecao` (índice, default `-1`), `_diastManualTextoLivre`.
API exposta ao orquestrador: `setDiastModo`, `setDiastManual`, `setDiastTextoLivre`, `getDiastModo`, `diastDivergencia`, `DIAST_SENTENCAS`.

### `DIAST_SENTENCAS` (linha 869) — tabela literal

| idx | achado | conclusão | alerta |
|---|---|---|---|
| 0 | Índices diastólicos do ventrículo esquerdo preservados. | *(vazia)* | false |
| 1 | Disfunção diastólica do ventrículo esquerdo de grau I (alteração de relaxamento). | Disfunção diastólica de grau I do ventrículo esquerdo (alteração de relaxamento). | true |
| 2 | Disfunção diastólica do ventrículo esquerdo de grau II (padrão pseudonormal). | Disfunção diastólica de grau II do ventrículo esquerdo (padrão pseudo-normal). | true |
| 3 | Disfunção diastólica do ventrículo esquerdo de grau III (padrão restritivo). | Disfunção diastólica de grau III do ventrículo esquerdo (padrão restritivo). | true |
| 4 | Função diastólica do ventrículo esquerdo indeterminada. | Função diastólica do ventrículo esquerdo indeterminada. | false |
| 5 | Avaliação da função diastólica limitada devido arritmia cardíaca. | *(vazia — recalculada por `j43`)* | false |
| 6 | *(vazia — "não avaliar")* | *(vazia)* | false |

⚠️ O campo **`alerta` da tabela nunca é lido por ninguém** no motor legado — quem decide o realce da linha é o regex `isAlert()` (linha 1121).

### `diastAchado` / `diastConclusao` (885 / 898)
Manual: texto livre > sentença do índice > vazio. Índice 5 na conclusão **recalcula `j43(d)`** (pressão de enchimento em FA). Auto: `j21FA_achado(d)` / `j43(d)`.
⚠️ Em modo manual o `j22FA` (linha de parâmetros) é **suprimido inteiro** (linha 970) — os números da diastólica somem do laudo.

### `diastDivergencia` (913)
Compara a escolha manual com o cálculo automático via `MAPA_IDX_AUTO` (`0:'preservados'`, `1:'Grau I'`, `2:'Grau II'`, `3:'Grau III'`, `4:'Indeterminada'`, `5:'FA_'`) e `autoResult.includes(chave)`.
⚠️ **`'Grau I'` é substring de `'Grau II'` e `'Grau III'`.** Selecionar manualmente Grau I quando o automático deu Grau III **não acusa divergência**. Bug real de detecção.
⚠️ Índice 6 ("não avaliar") é excluído da checagem; índice `-1` também.

**Domínio 5: 11 itens (4 cortes FA + algoritmo sinusal em 3 níveis + 2 contagens + j22 + j43 + máquina manual + divergência).**

---

# 6. Valvas

## 6.1 Estenose mitral (`estenMitGrau`, linhas 100–110)

| Ordem | Input | Cortes |
|---|---|---|
| 1º (precedência) | `b46` — gradiente **médio** (mmHg) | `>10` importante · `≥5` moderada · `>0` leve |
| 2º (só se o 1º vazio) | `b47` — área (cm², PHT) | `<1` importante · `<1.5` moderada · `≤2` leve |

⚠️ **O gradiente médio tem precedência absoluta sobre a área.** Um gradiente médio de 3 mmHg (fluxo baixo) fecha em "leve" e a área de 0,8 cm² **nunca é consultada** — inversão da hierarquia diagnóstica habitual (área é o critério primário; gradiente é fluxo-dependente).
⚠️ `b47 ≤ 2` classifica como "estenose leve" qualquer área ≤2 cm² — inclui áreas normais-baixas.
Saída: `concEstenMit` (linha 662) → *"Estenose Mitral Leve/Moderada/Importante."*

## 6.2 Estenose aórtica (`estenAoGrau`, linhas 113–128)

| Ordem | Input | Cortes |
|---|---|---|
| 1º | `b50` — gradiente **máximo** (mmHg) | `≥64` importante · `≥36` moderada · `≥27` leve · `≥16` **"esclerose"** |
| 2º | `b51` — gradiente **médio** (mmHg) | `>40` importante · `≥20` moderada · `>0` leve |
| 3º | `b52` — área (cm²) | `<1` importante · `<1.5` moderada (**sem grau leve**) |

⚠️ **Precedência pelo gradiente MÁXIMO**, não pelo médio (as diretrizes classificam por Vmax ≥4 m/s ⇔ 64 mmHg **e** gradiente médio ≥40 **e** área <1,0 em conjunto).
⚠️ **O grau `'esclerose'` é calculado e jogado fora**: `concEstenAo` (linha 671) retorna `''` para ele e nenhum achado o menciona. Ramo morto.
⚠️ `b52` só entra se `b50` e `b51` estiverem vazios — área grave com gradiente baixo (low-flow low-gradient) sai classificada como "leve".

## 6.3 Estenose tricúspide (`calcEstenTric`, linha 746)

`b46t` (grad. médio): `>7` importante · `≥5` moderada. `b47t` (área): `<1` importante · `≤1.5` moderada.
Resultado = **pior grau entre os dois** (`ordem = ['','moderada','importante']`, `Math.max` dos índices). **Não existe grau leve.**
⚠️ `jEstenTric` (774) só imprime o gradiente se `b46t ≥ 5` — um gradiente de 3 mmHg com área 0,9 cm² produz *"Estenose Tricúspide Importante."* sem mostrar nenhum número.

## 6.4 Estenose pulmonar (`calcEstenPulm`, linha 758)

`b50p` (grad. máximo, mmHg): `≥80` importante · `≥50` moderada · `≥25` leve · `<25` silêncio.

## 6.5 Gradientes e áreas impressos (achados)

| Fn | Linha | Guarda | Frase |
|---|---|---|---|
| j25 | 437 | `b45 ≥ 1` | Gradiente transvalvar mitral máximo de X mmHg. |
| j26 | 438 | `b46 ≥ 1` | Gradiente transvalvar mitral médio de X mmHg. |
| j27 | 439 | `b47 > 0` | Área mitral estimada em X cm² (PHT). |
| j32 | 460 | `b50 ≥ 1` | Gradiente transvalvar aórtico máximo de X mmHg. |
| j33 | 461 | `b51 ≥ 1` | Gradiente transvalvar aórtico médio de X mmHg. |
| j34 | 462 | `b52 > 0` | Área aórtica estimada em X cm² (Equação de continuidade). **+ "Área aórtica indexada = {aoIdx} cm²/m²."** se `aoIdx` |

⚠️ Guarda `≥1` nos gradientes: um gradiente médio mitral de 0,8 mmHg classifica como estenose "leve" (`>0`, item 6.1) mas **não é impresso**.

## 6.6 Área aórtica indexada (`aoIdx`) — linha 97

`T(b52 / asc, 2)` → cm²/m². Impressa em j34.
⚠️ **É a razão área/ASC, NÃO o "índice cm²/m ≥ 10" das decisões fechadas** (esse é `área da aorta em cm² / altura em m`, para o diâmetro aórtico). O motor legado **não implementa o índice de tamanho aórtico ≥10 cm²/m** de forma nenhuma.

## 6.7 Morfologias e refluxos (tabelas de string)

| Fn | Linha | Input | Chaves | Fallback quando vazio |
|---|---|---|---|---|
| j24 mitral | 432 | `b34` | 15 (`EL/ELM/EM/EMI/EI`, `FL…FI`, `EFL…EFI`) | *"Válvulas atrioventriculares com a morfologia preservada."* se `b36` também vazio, senão *"Válvula mitral com morfologia preservada."* |
| jTricMorf | 767 | `b34t` | 15 | **silêncio** |
| j31 aórtica | 455 | `b39` | 15 | *"Válvulas semilunares com morfologia preservada."* |
| jPulmMorf | 786 | `b39p` | 15 | **silêncio** |
| j28 refluxo mitral | 440 | `b35` | `L/LM/M/MI/I` | *"Fluxo pelas válvulas atrioventriculares preservado."* só se `b36`, `b45`, `b46`, `b47`, `b34t` e `estenTricGrau` **todos** vazios |
| j29 refluxo tricúspide | 448 | `b36` | idem | silêncio |
| j35 refluxo aórtico | 463 | `b40` | idem | *"Fluxo pelas válvulas semilunares preservado."* só se `b40p`, `b50`, `b51`, `b52`, `b39p`, `estenPulmGrau` vazios |
| jRefluxoPulm | 805 | `b40p`, `psmap` | idem + *"Pressão sistólica média da artéria pulmonar de X mmHg."* | silêncio |
| j36 pericárdio | 471 | `b41` | idem → "Derrame pericárdico …" | *"Pericárdio sem alterações."* |

⚠️ `jRefluxoPulm` imprime *"Pressão sistólica média"* — mas o label do campo é *"Pressão Sist. Média Art. Pulmonar"* e o id é `psmap`. "Pressão sistólica média" é um termo sem significado hemodinâmico (é sistólica **ou** média). Vale confirmar com o cardiologista qual pressão é.
⚠️ Nas 4 tabelas de morfologia, os graus `EM/EMI/EI/FM/FMI/FI/EFM/EFMI/EFI` da **mitral e da tricúspide** acrescentam *"gerando restrição da sua abertura"*; as da aórtica e pulmonar **não** (assimetria proposital? confirmar).

**Domínio 6: 21 itens (4 classificadores de estenose + 6 impressões de gradiente/área + 1 índice + 9 tabelas de morfologia/refluxo + pericárdio).**

---

# 7. Aorta

## 7.1 Caminho A — classificação por desvio-padrão (quando há ASC)

`_classificarAorta` (linha 496) → `_aortaClassificar` (476). **Usado sempre que `asc > 0`** (isto é, sempre que peso e altura estão preenchidos).

| Segmento | Input | Previsto (cm) | SD (cm) |
|---|---|---|---|
| **Raiz** | `b7` | `idade < 40` → `1.50 + 0.95 × ASC` · `idade ≥ 40` → `1.92 + 0.74 × ASC` | `0.19` |
| **Ascendente** | `b28` | `1.47 + 0.91 × ASC` | `0.22` |
| **Arco** | `b29` | `1.26 + 0.61 × ASC` | `0.20` |

Cálculo: `medidaCM = medidaMM / 10`; `dp = (medidaCM − previstoCM) / sd`.
Classificação: `dp ≤ 2` → **normal (silêncio)** · `dp ≤ 3` → **ectasia leve** · `dp ≤ 4` → **ectasia moderada** · `> 4` → **ectasia importante**.
Frase: `"Ectasia {grau} {segmento}, medindo {medidaMM} mm (previsto {round(previsto×10)} ± {round(sd×10)} mm)."`

⚠️ **Este caminho não tem termo de sexo.** Homem e mulher com a mesma ASC recebem o mesmo previsto — em conflito direto com WASE 2022 (M 38/40/41 · F 35/36/37) e com ASE Chamber Tabela 14 (M ≤38 · F ≤35), que são **por sexo**.
⚠️ **Idade só entra na raiz, com um único degrau em 40 anos** — WASE 2022 tem três faixas (≤40 / 41–65 / >65).
⚠️ Fallback silencioso `idade = 50` quando faltam datas (linha 498) — muda o previsto da raiz sem avisar.
⚠️ Herda o desvio da constante ASC 71,74.

## 7.2 Caminho B — fallback fixo (sem ASC)

`_aortaFallback` (linha 487). Limiares `[normal_max, leve_max, moderada_max]`, em mm:

| Segmento | M | F |
|---|---|---|
| Raiz (`b7`) | `[40, 45, 55]` | `[36, 41, 51]` |
| Ascendente (`b28`) | `[37, 42, 50]` | `[34, 39, 47]` |
| Arco (`b29`) | `[36, 38, 42]` | `[36, 38, 42]` (sem distinção de sexo) |

⚠️ **Raiz:** limite normal 40 (M) / 36 (F) — o valor da faixa **41–65 anos** do WASE, aplicado a **todas as idades**. Diverge de 38/41 (M) e 35/37 (F) nas outras faixas.
⚠️ **Ascendente:** normal ≤37 (M) / ≤34 (F). A decisão fechada diz **ASE Chamber Tabela 14: M ≤38 / F ≤35**. Divergência de 1 mm nos dois sexos.
⚠️ **Arco:** normal ≤36 (bate com "arco fixo 22-36"), mas a faixa seguinte é **37–38 leve, 39–42 moderada, >42 importante** — a decisão fechada diz **37–44 ectasia, ≥45 aneurisma**. Divergência estrutural.
⚠️ **Nenhum dos dois caminhos implementa ANEURISMA.** Não existe corte ≥50 mm (raiz/ascendente), nem ≥45 mm (válvula bicúspide), nem categoria "aneurisma" no vocabulário. Uma raiz de 58 mm sai como *"Ectasia importante da raiz da aorta"*.
⚠️ **Nenhum dos dois caminhos implementa o índice cm²/m ≥ 10.**
⚠️ Os dois caminhos podem **discordar entre si** para o mesmo paciente: basta apagar o peso para a classificação trocar de régua.

## 7.3 Montagem das frases

| Fn | Linha | Papel |
|---|---|---|
| **j37** | 525 | Se raiz alterada → devolve **só a frase da raiz**. Senão monta a frase combinada dos segmentos normais ("Raiz aórtica, aorta ascendente e arco aórtico com dimensões normais."). Exige `sexo` preenchido (`if(!d.sexo) return ''`) mesmo no caminho A, que não usa sexo. |
| **j38** | 546 | Ectasia da ascendente (só se alterada). |
| **j39** | 552 | Ectasia do arco (só se alterada). |
| **jAortaNormaisComplementar** | 561 | Emite os segmentos **normais** que sumiriam quando a raiz está alterada (bug corrigido 07/05/2026). |
| **j40** | 578 | `b42==='s'` → placas de ateroma calcificadas; `'nv'` → arco não visualizado. |
| **concAorta** | 1002 | Conclusão: *"Ectasia {grau} da {segmento}."* (1 segmento) ou *"Ectasia da aorta ({segs})."* (≥2) — **no plural o grau se perde**. |

⚠️ `_classificarAorta` é chamado **10 vezes por render** (j37 ×3, j38, j39, jAortaNormaisComplementar ×3, concAorta ×3) recalculando tudo do zero. Sem impacto clínico, mas é onde uma divergência entre chamadas passaria despercebida.

**Domínio 7: 8 itens (3 fórmulas DP + 3 tabelas de fallback + escala de graus + índice/aneurisma ausentes).**

---

# 8. Pressões pulmonares, PSAP e o alerta

| # | Nome | Linha | Inputs | Regra | Saída |
|---|---|---|---|---|---|
| 8.1 | **Probabilidade de HP (j50)** | 413 | `b23` (Vel. IT, m/s), `b38` (≥2 sinais indiretos, `'S'`) | `b23 > 3.4` → **Alta**; `2.9 ≤ b23 ≤ 3.4` → **Alta** se sinais, senão **Intermediária**; `b23 < 2.9` → **Intermediária** se sinais, senão **Baixa** | achado + conclusão (`concHP` = `j50`, linha 680) |
| 8.2 | **PSAP impressa (j30)** | 449 | `b37` (mmHg), `b23` | `b37 > 0` → *"Pressão sistólica da artéria pulmonar de X mmHg. **VR < 36 mmHg**."*; senão, se `b23` vazio → *"Ausência de sinais indiretos de hipertensão pulmonar."*; senão silêncio | achado |
| 8.3 | **Alerta PSAP (`alertaIT`)** | 1099 | `b23`, `b37` | alerta se `b23 > 0` **e** (`b37` nulo ou 0) | `#b37` ganha classe `alerta-it`; `#alerta-psap` ganha classe `show` |
| 8.4 | **PSMAP (refluxo pulmonar)** | 810 | `psmap` | `psmap > 0` → frase | achado |

⚠️ **8.3 está morto no app React.** `#alerta-psap` tem `style={{display:'none'}}` inline (`SidebarLaudo.tsx:425`) e nenhuma regra CSS `.show` existe no repo — a classe não vence o inline style. O `page.tsx:728` **sobrescreve `window.alertaIT`** com uma versão que usa `msg.style.display`. Ou seja: **a função do motor legado nunca surte efeito**; quem alerta é o override. Se o Senna93 portar `alertaIT` como está no legado, o alerta some.
⚠️ `alertaIT` faz `document.getElementById('b37').classList` **sem guarda de null** (linha 1105) — lança `TypeError` em qualquer tela que não tenha o campo. `calc()` (linha 1442) chama `alertaIT()` sem try/catch.
⚠️ `b38` é lido como string e comparado contra `'S'`, `'Sim'` **e** `'Presente'` (linha 415) — só `'S'` existe no `<select>` atual. Duas comparações mortas.
⚠️ A PSAP **não é calculada** pelo motor: `b37` é digitada pelo médico. Não existe `4·V² + PAD` em lugar nenhum.

**Domínio 8: 4 itens.**

---

# 9. Wilkins & Block

**Entrada** (linhas 80–85): `#wilkins-toggle` (checkbox), `wk-mob`, `wk-esp`, `wk-cal`, `wk-sub` — cada um `parseInt` de 0 a 4. Se o toggle está desligado, todos viram 0 e `wilkinsScore = null`.

**Score:** `wilkinsScore = wkMob + wkEsp + wkCal + wkSub` (linha 85). Faixa efetiva **0–16**.

⚠️ O Wilkins clássico pontua **1–4** por categoria (total 4–16). Aqui o índice 0 existe e é rotulado *"Normal"* / *"Sem calcificação"* em `WK_DESC` — score 0 é possível e seria impresso como "TOTAL 0 pts".

**Conclusão (`jWilkins`, linha 822):**

| Score | Frase |
|---|---|
| `≥ 9` | "Pacientes com escore de Wilkins maior ou igual a 9 **NÃO** são candidatos a valvuloplastia mitral percutânea." |
| `= 8` | "Escore de Wilkins & Block de 8 pontos. Paciente **no limite** para valvuloplastia mitral percutânea." |
| `≤ 7` | "Escore de Wilkins & Block de {sc} pontos. Paciente **favorável** para valvuloplastia mitral percutânea (escore ≤ 8)." |

⚠️ **O texto do terceiro ramo diz "(escore ≤ 8)" mas o ramo só é alcançado com escore ≤ 7** — o 8 foi capturado pelo ramo anterior. Texto contradiz o próprio código.

**Efeito colateral:** `jWilkins` escreve direto em `#calc-wilkins` (`sc + ' pts'`, linha 826) — **uma função de geração de achado mutando o DOM da sidebar**. Se o achado não for gerado (toggle off), `#calc-wilkins` **fica com o valor antigo**, não é limpo.

**Renderização:** retorna o marcador `__WILKINS__{json}` (linha 836), interceptado por `renderLinha` (1153) → `renderWilkinsBloco` (1123), que monta um bloco HTML recuado com as 4 categorias, o total e a conclusão.
⚠️ `renderWilkinsBloco` **pula categorias com valor 0** (`if(c.val===0||c.val===undefined) return`) — uma valva com mobilidade 0 ("Normal") desaparece do bloco impresso, e o total não bate com a soma das linhas visíveis.

**`WK_DESC`** (linha 815) — tabela de descrições, 5 níveis × 4 categorias:

| Cat. | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| **mob** | Normal | Boa mobilidade da valva, com restrição apenas na ponta do folheto | Redução da mobilidade na porção média e na base dos folhetos | Mobilidade somente na base dos folhetos | Nenhum ou mínimo movimento dos folhetos |
| **esp** | Normal | Espessura valvar próxima do normal (4–5 mm) | Grande espessamento nas margens do folheto | Espessamento de todo o folheto (5–8 mm) | Grande espessamento de todo o folheto (>8–10 mm) |
| **sub** | Normal | Espessamento mínimo da corda tendínea logo abaixo da valva | Espessamento da corda até terço proximal | Espessamento da corda até terço distal | Extenso espessamento e encurtamento de toda corda até músculo papilar |
| **cal** | Sem calcificação | Uma única área de calcificação | Calcificações nas margens dos folhetos | Calcificações extensivas à porção média do folheto | Extensa calcificação em todo o folheto |

⚠️ Descrição de `esp` nível **2** ("Grande espessamento nas margens do folheto") e nível **3** ("Espessamento de todo o folheto, 5–8 mm") parecem **trocadas** em relação ao Wilkins original (2 = espessamento marginal 5–8 mm; 3 = espessamento de todo o folheto 5–8 mm). Confirmar com o cardiologista.

**Domínio 9: 3 itens (score, tabela de conclusão, tabela de descrições).**

---

# 10. Tabela de referências impressa no PDF (coluna "VR")

Duas origens distintas dentro do mesmo `params-tbody`:

## 10.1 Coluna ESQUERDA — `refVal()` (linha 1075) + alerta `isOOR()` (linha 1088)

| Campo | Rótulo impresso | VR (M) | VR (F) | Alerta OOR |
|---|---|---|---|---|
| `b7` | Raiz Aórtica | `≤ waseRaizUpper(M, idade)` | `≤ waseRaizUpper(F, idade)` | **só limite superior** (sem corte inferior) |
| `b8` | Átrio Esquerdo | 30–40 mm | 27–38 mm | fora da faixa |
| `b9` | DDVE | 42–58 mm | 38–52 mm | fora da faixa |
| `b10` | Septo Interventricular | 6–10 mm | 6–9 mm | fora da faixa |
| `b11` | Parede Posterior | 6–10 mm | 6–9 mm | fora da faixa |
| `b12` | DSVE | 25–40 mm | 21–35 mm | fora da faixa |
| `b13` | Ventrículo Direito | 21–35 mm | 21–35 mm | fora da faixa |
| `b28` | *(Ao ascendente — na tabela `R`/`L` mas **sem linha na tabela impressa**)* | 30–37 mm | 27–34 mm | — |
| `b29` | *(Arco — idem)* | 22–36 mm | 22–36 mm | — |

### `waseRaizUpper(sexo, idade)` — linha 1068 (WASE 2022, média + 1,96·DP)

| Idade | M | F |
|---|---|---|
| `idade == null` | **40** | **36** |
| `≤ 40` | **38** | **35** |
| `41–65` | **40** | **36** |
| `> 65` | **41** | **37** |

✅ Bate exatamente com a decisão fechada (M 38/40/41 · F 35/36/37).
⚠️ **Mas o `waseRaizUpper` só governa a tabela e o realce.** A frase da raiz (`j37`) usa a régua por DP (§7.1) ou o fallback `[40,45,55]/[36,41,51]` (§7.2). **A tabela e a frase podem discordar no mesmo laudo**: p.ex. homem de 30 anos, raiz 39 mm → tabela realça em vermelho (>38 WASE), frase não diz nada.
⚠️ `b28` e `b29` têm entrada em `refVal`/`isOOR` mas **não têm linha no `params-tbody`** (linhas 1196–1207) — Ao ascendente e arco **não aparecem na tabela de parâmetros do PDF**. Referências definidas e nunca impressas.
⚠️ `b28` VR `30–37 M / 27–34 F` diverge da decisão fechada ASE Chamber Tabela 14 (**M ≤38 / F ≤35**).

## 10.2 Coluna DIREITA — VR literais no array `rows` (linhas 1196–1207)

| Linha | Parâmetro | Unidade | VR literal | Confere com o código? |
|---|---|---|---|---|
| 1 | Índice de Massa Corporal | kg/m² | `<25 kg/m²` | sem lógica associada |
| 2 | Relação Ao/AE | — | *(vazia)* | — |
| 3 | Vol. Diast. final VE | ml | `62–150` M · `46–106` F | sem lógica associada |
| 4 | Vol. Sist. final VE | ml | `21–61` M · `14–42` F | sem lógica associada |
| 5 | Fração de Ejeção (Teichholz) | — | `>51%` M · `>53%` F | ⚠️ **não** — j11 usa >52 / >54 |
| 6 | Fração de Encurtamento | — | `30–40%` | sem lógica associada |
| 7 | Massa do VE | g | `<201` M · `<151` F | ✅ j9 usa >200 / >150 |
| 8 | Índice de Massa VE | g/m² | `<103` M · `<89` F | ✅ j10/j47 usam >102 / >88 (mas a diastologia usa 115/95) |
| 9 | Espessura Relativa | — | `<0,43` | ✅ j10 usa >0,42 |
| 10 | Área Sup. Corpórea | m² | *(vazia)* | — |

⚠️ **A coluna direita nunca recebe realce de alerta** — `campos = ['b7','b8','b9','b10','b11','b12','b13', null, null, null]` (linha 1208) mapeia só as 7 primeiras linhas da coluna esquerda. FE, massa, IMVE e ER podem estar francamente fora da referência impressa e sair em preto no PDF assinado.
⚠️ O rodapé do PDF declara *"Valores de referência: ASE/EACVI 2015; ASE 2025"* (`pdf-params.ts:66`), mas a raiz aórtica segue **WASE 2022** e a diastologia segue **ASE 2016/2025**. Atribuição de fonte incorreta no documento assinado.
⚠️ `fmt(x, d=1)` (linha 1120) devolve `'—'` para null; a formatação usa `toFixed`, ou seja **arredonda** — enquanto o cálculo usou `T()`, que **trunca**. Duas políticas de arredondamento em série.

**Domínio 10: 20 referências (9 `refVal` + 1 `waseRaizUpper` + 10 VR literais).**

---

# 11. Cadeia de geração de sentenças (resumo — Senna90 já é dono)

## 11.1 `gerarAchados(d)` — linha 942 · ordem fixa ("ORDEM ORIGINAL DO V6 — não modificar")

`j2` → (`j4` **ou** `j3`) → `j5` → `j6` → `j7` → `j8` → `j9` → `j10` → (`j12` se Simpson, senão `j11`) → `jGLSve` → `j13..j20` → `diastAchado` → `j22FA` (suprimido no manual) → `jLARS` → `j50` → `j23` → `jGLSvd` → mitral (`j24`, `j25`, `j26`, `j27`) → `j28` → `j29` → `jTricMorf` → `jEstenTric` → `jWilkins` → `j30` → aórtica (`j31`, `j32`, `j33`, `j34`) → `j35` → `jPulmMorf` → `jEstenPulm` → `jRefluxoPulm` → `j36` → aorta (`j37`, `j38`, `j39`, `jAortaNormaisComplementar`, `j40`).

## 11.2 `gerarConclusao(d)` — linha 1024

`diastConclusao` → `j47` (geometria) → `concSistolica` → refluxo mitral → refluxo tricúspide → refluxo aórtico → `concEstenMit` → estenose tricúspide → `concEstenAo` → estenose pulmonar → refluxo pulmonar → `concHP` → derrame pericárdico → `concAorta` → placas → `concStrainVE` → `concStrainVD` → `concLARS`.
**Dedução automática:** lista vazia → *"Exame ecodopplercardiográfico transtorácico sem alterações significativas."* (linha 1058).

## 11.3 `renderizarLaudo(d)` — linha 1178

1. Identificação: `#out-nome`, `#out-idade`, `#out-dtnasc`, `#out-convenio`, `#out-solicitante`, `#out-dtexame` — datas via `new Date(v+'T12:00')` (âncora de meio-dia contra timezone).
2. `calc-*` (sidebar): `calc-imc`, `calc-asc`, `calc-vdf`, `calc-vsf`, `calc-fe`, `calc-fs`, `calc-massa`, `calc-im`, `calc-er`, `calc-aoae`.
   ⚠️ `sc('calc-fe', <string>, 0)` — o parâmetro de casas decimais é **ignorado** quando o valor já vem como string formatada. Idem `calc-fs`.
3. `#params-tbody` (§10).
4. `#achados-body` e `#conclusao-list` com wrappers editáveis + drag&drop.

## 11.4 `isAlert(txt)` — linha 1121

Regex sobre o TEXTO da frase para decidir o realce vermelho:
`/Disfunção|aumentado|Alteração contrátil|Hipertrofia|Ectasia|Insuficiência|Derrame|Estenose|Hipertensão|Probabilidade|Miocardiopatia/`
⚠️ **O realce clínico do laudo depende de casar palavras em português.** *"Baixa Probabilidade de Hipertensão Pulmonar."* (um achado **tranquilizador**) casa com `Probabilidade` **e** `Hipertensão` → é realçado como alerta. Idem *"Massa … preservada"* não casa (ok), mas qualquer reescrita de frase quebra o realce silenciosamente.

## 11.5 O que o LEGADO gera e o Senna90 **NÃO**

| Item | Onde | Situação |
|---|---|---|
| **`#params-tbody` inteiro** (10 linhas × 8 colunas) | 1196–1215 | Senna90 não tem renderer de tabela. **É a metade que o Senna93 precisa absorver.** |
| **`calc-*` da sidebar** (10 elementos) | 1188–1192 | idem. |
| **`refVal` / `isOOR` / `waseRaizUpper`** | 1068–1097 | Senna90 tem `classificacoes/refValues.ts` e `isOOR.ts` — **conferir 1-a-1, são duas cópias**. |
| **`alertaIT()`** | 1099 | Senna90 emite `AlertaUI[]` estruturado (`IT_SEM_PSAP`, `REFLUXO_PULM_SEM_PMAP`) — mais rico. O legado **não tem** o alerta de refluxo pulmonar sem PMAP. |
| **`isAlert()` (realce por regex)** | 1121 | Senna90 não tem equivalente; hoje o realce vem daqui. |
| **Banco de frases (`FRASES_DEFAULT`, 34 frases + CRUD em localStorage)** | 1303–1437 | Feature de UI, chave `medcardio_banco`. Sem paralelo no Senna90. |
| **Drag & drop + edição de linhas** | 1235–1298 | UI pura. |
| **`WALL_OPTS` injetado em `b56..b61` no load** | 34–56 | Efeito colateral de import: o motor **reescreve o `innerHTML`** dos selects da sidebar React ao carregar. |
| **`__WILKINS__` marker + `renderWilkinsBloco`** | 836 / 1123 | Senna90 tem `achados/wilkins.ts`; conferir se o marcador e o bloco HTML foram portados. |
| **Escrita direta em `#calc-wilkins`** | 826 | Efeito colateral dentro de gerador de achado. |

⚠️ **Divergências já decididas contra o legado** (Senna90 é a verdade, ver ADR 16/05): mapeamento `b59/b60/b61` (§4.3) e constante da ASC 71,84 (§1.2). **O código legado continua com a versão errada e continua rodando** para produzir a tabela.

---

# 12. Esquisitices transversais (checklist para o 1-a-1)

| # | Item | Linha | Risco |
|---|---|---|---|
| A | `T()` trunca, `toFixed()` arredonda — em série no mesmo valor | 30 / 1120 | numérico, ±0,05 |
| B | Guardas por *falsy* — `0` == "não medido" em ~40 lugares | várias | clínico (medida zero é rara mas TAPSE/GLS podem ser 0) |
| C | Comparações `===` contra float não truncado (j11) | 276 | ramos mortos |
| D | 3 implementações de idade, uma com fallback silencioso 50 anos | 501 / 1081 / 1109 | aorta |
| E | 2 cutoffs de IMVE (102/88 e 115/95) | 269 / 365 | classificação |
| F | 2 cutoffs de E/e' (>14 FA e >15 sinusal) | 353 / 369 | diastologia |
| G | 2 cutoffs de FE (0,52/0,54 nas frases, 51/53 na VR, 0,50 na diastologia) | 280 / 1201 / 364 | tabela × frase |
| H | 3 réguas de aorta (DP com ASC, fallback fixo, WASE na tabela) | 507 / 520 / 1068 | tabela × frase, ausência de aneurisma |
| I | Efeitos colaterais de DOM dentro de geradores de texto (`jWilkins`, `WALL_OPTS`) | 826 / 53 | acoplamento |
| J | `alertaIT()` sem guarda de null, e neutralizado por override no React | 1099 / page.tsx:728 | funcionalidade |
| K | Realce clínico decidido por regex de português | 1121 | falso-positivo em "Baixa Probabilidade" |
| L | Estado do modo manual em variáveis de módulo (vaza entre exames se não resetado) | 865–867 | já tratado no Senna90 (`motor.ts:117`) |
| M | `b27` lido e nunca usado | 62 | limpeza |
| N | `'esclerose'` aórtica calculada e descartada | 118 / 672 | ramo morto |
| O | `'Sim'` / `'Presente'` comparados em `b38`, valores que não existem no select | 415 | ramo morto |

---

# Apêndice — Contagem

| Domínio | Itens |
|---|---|
| 1. Antropometria / superfície | 5 |
| 2. Câmaras (volumes + classificação) | 12 |
| 3. Massa / geometria VE | 5 |
| 4. Função sistólica (VE, VD, paredes, strain) | 7 |
| 5. Diastólica / pressões de enchimento | 11 |
| 6. Valvas (estenoses, gradientes, morfologias, refluxos) | 21 |
| 7. Aorta | 8 |
| 8. Pressões pulmonares / PSAP / alerta | 4 |
| 9. Wilkins | 3 |
| 10. Tabela de referências (VR) impressa | 20 |
| **Total** | **96** |

(11 e 12 são cadeia de sentenças e checklist transversal — resumidos, não contados.)
