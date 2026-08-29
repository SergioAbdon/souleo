# Auditoria exaustiva da diastologia — motor Senna90 × ASE/EACVI 2016

**Data:** 28/08/2026 · **Escopo:** `src/senna90/calculos/diastologia.ts` + `src/senna90/achados/diastologia.ts`
**Referência:** Nagueh SF et al. *Recommendations for the Evaluation of Left Ventricular Diastolic Function by Echocardiography*. JASE 2016; 29:277-314 (ASE/EACVI)
**Método:** enumeração exaustiva por script (6.758.400 combinações) chamando o motor real. **Nenhuma linha do motor foi alterada.** Script fora do repositório (scratchpad), não commitado.

---

## 1. Resumo executivo (leitura de 3 minutos)

Rodei **todas** as combinações previstas pelo algoritmo — 6.758.400 exames sintéticos, cobrindo cada campo diastológico em ausente / normal / alterado / **exatamente em cima do corte**, nos dois sexos, nos dois ritmos, com FE por Simpson, por Teichholz, nas duas fronteiras de sexo e ausente, e com massa normal/limítrofe/alta.

**O motor não travou em nenhuma combinação** (0 erros em 6,7 milhões). Os cortes numéricos estão todos certos e as fronteiras (`>` vs `≥`) estão todas do lado certo do guideline. **O problema não está nos números — está no que o motor faz quando falta medida.**

| Balde | Combinações | % | Leitura clínica |
|---|---:|---:|---|
| **CONFORME** ao guideline | 3.309.762 | 49,0% | o motor acerta |
| **DESVIO DELIBERADO** (decisão sua, registrada) | 351.624 | 5,2% | difere do texto literal, mas por decisão documentada |
| **DISCREPÂNCIA** (candidato a bug) | 1.304.948 | 19,3% | 6 causas-raiz, todas ligadas a dado faltante |
| **NÃO MAPEÁVEL** (o guideline não responde) | 1.792.066 | 26,5% | FA (1.351.680) + graduação sem E/A ou sem E (440.386) |

### As 6 discrepâncias, em português

| # | O que acontece | Frequência | Gravidade | Uma frase |
|---|---|---:|---|---|
| **D1** | FE de Teichholz baixa **atropela** uma FE de Simpson normal e joga o exame no algoritmo simplificado | 259.144 | 🔴 alta | Paciente com Simpson 60% e VE dilatado sai com "disfunção diastólica grau I" mesmo com toda a diástole normal |
| **D2** | Ramo simplificado conclui **Grau I** mesmo com 0 ou 1 critério de pressão de enchimento medido, ou com empate 1×1 | 399.840 (157.080 + 242.760) | 🔴 alta | "Grau I" virou o resultado padrão do ramo simplificado quando falta dado — o guideline manda dizer *indeterminada* |
| **D3** | Exame **sem FE nenhuma** (`feVide`) cai no ramo simplificado | 236.296 | 🔴 alta | Diástole 100% normal, sem DDVE/DSVE e sem Simpson → sai "disfunção grau I" |
| **D4** | Regra de contagem fixa: 2 critérios alterados sempre = "Indeterminada", mesmo quando só 3 foram avaliados | 237.636 | 🟡 média | 2 de 3 alterados é 67% > 50% → o guideline manda concluir **disfunção** e graduar; o motor cala com "indeterminada" |
| **D5** | Regra de contagem fixa na outra ponta: 1 alterado de 2 avaliados = "índices preservados" | 172.032 | 🟡 média | 1 de 2 é empate (50%) → guideline manda "indeterminada"; o motor imprime **normal** (é o mesmo "falso normal" que a regra dos ≥2 campos quis matar, e que sobrevive em n=2) |
| **D6** (obs.) | Sexo em branco usa silenciosamente a régua masculina (FE 52% e IMVE 115) e, se só houver campos diastológicos preenchidos, **nem o alerta de sexo ausente dispara** | — | 🟢 baixa | Mulher com FE 53% é lida como FE normal |

**O fio condutor de D1 a D3:** o ramo simplificado (o "Algoritmo B" do guideline) **não tem regra de suficiência**. Ele sempre devolve um grau. Quando não há dado que sustente o grau, ele devolve Grau I. Como três portas diferentes levam a esse ramo (FE baixa, massa alta e **FE ausente**), e uma delas é a ausência de dado, o resultado é o oposto do que a decisão §2.4 da spec quis garantir no ramo completo ("silêncio é mais seguro que falso normal"): aqui a falta de dado vira **falso doente**.

### Reprodução mais impressionante (rodada no motor real, via `calcular()`)

```
Exame A: Simpson 60% · DDVE 55 · DSVE 42 · E 80 · E/A 1,2 · e' 9 · E/e' 8 · LAVI 28 · IT 2,2
  → feT calculado = 0,467  → "Disfunção Diastólica do VE de Grau I (Alteração de Relaxamento)"

Exame B: idêntico, só DDVE 50 / DSVE 32
  → feT calculado = 0,654  → "Índices diastólicos do ventrículo esquerdo preservados"
```
Mesma diástole, mesma FE de Simpson (60%), laudos opostos. O que mudou foi só o diâmetro do VE.

---

## 2. Como a auditoria foi feita

- Script `diastologia-exaustiva.mjs` (scratchpad, **não commitado**) importa o motor real e chama `calcularJ21()` para cada combinação do produto cartesiano abaixo.
- Amostra de 549 combinações também passou pelo `calcular()` completo (motor → `montarD` → `j21FA_achado`/`j43` → achados/conclusões) para pegar diferença de fiação: **549/549 bateram** com a chamada direta. A fiação está correta.
- 62 sondas dirigidas para as fronteiras exatas e 13 reproduções ponta-a-ponta com medidas reais (`medidasVazias()` + campos).

**Domínios enumerados** (cada campo em ausente / normal / alterado / valor exato do corte):

| Campo | Valores |
|---|---|
| ritmo | `'S'`, `'N'` (+ `''` nas sondas) |
| sexo | `M`, `F` (+ `''` nas sondas) |
| FE | ausente · Simpson 60/52/54/51/40 · Teichholz 0,60/0,52/0,54/0,40 · **Simpson 60 + Teichholz 0,40** |
| IMVE | ausente · 90 · 95 · 100 · 115 · 130 |
| e' septal (b21) | ausente · 6 · 7 · 8 |
| E/e' septal (b22) | ausente · 14 · 15 · 15,1 · 16 |
| LAVI (b24) | ausente · 34 · 34,1 · 35 |
| Onda E (b19) | ausente · 45 · 50 · 55 |
| E/A (b20) | ausente · 0 · 0,7 · 0,8 · 1,0 · 1,9 · 2,0 · 2,5 |
| Vel. IT (b23) | ausente · 2,7 · 2,8 · 2,9 |
| LARS | ausente · 17 · 18 · 20 (só no ramo FA) |

**Total: 6.758.400 combinações executadas · 0 exceções · 27 pares distintos (saída do motor × saída da referência).**

---

## 3. O algoritmo do motor, em árvore

Arquivo `src/senna90/calculos/diastologia.ts`, função `calcularJ21` (linha 50).

```
calcularJ21(inputs)
│
├─ [L67] PORTA DA FA: ritmo === 'N' E (E/A ausente OU E/A === 0)
│   └─ calcularDiastologiaFA()  [L166]
│       ├─ 4 critérios: E/e' septal >15 · Vel IT >2,8 · LAVI >34 · LARS <18
│       ├─ todos os 4 ausentes            → FA_SEM_DADOS        (achado de arritmia, conclusão vazia)
│       ├─ menos de 2 avaliados           → FA_INDETERMINADA
│       ├─ 2 ou mais elevados             → FA_PRESSAO_ELEVADA
│       └─ senão                          → FA_PRESSAO_NORMAL
│
├─ [L80] SEM DADOS: b19, b20, b21, b22, b23 e b24 TODOS ausentes → '' (silêncio)
│
├─ [L86-95] GATILHOS DO RAMO SIMPLIFICADO
│     feBaixa   = Simpson < 52♂ / 54♀   SENÃO   Teichholz < 0,52♂ / 0,54♀     ← else-if, ver D1
│     massaAlta = IMVE > 115♂ / 95♀
│     feVide    = Simpson ausente E Teichholz ausente                          ← ver D3
│
├─ [L98] SE feBaixa OU massaAlta OU feVide → RAMO SIMPLIFICADO
│   ├─ [L100] E/A ≥ 2                              → Grau III
│   ├─ [L103] E/A ≤ 0,8 E onda E ≤ 50              → Grau I
│   ├─ [L107-110] p = (E/e' >15) + (IT >2,8) + (LAVI >34)   ← campos ausentes contam como 0
│   ├─ [L111] p ≥ 2                                → Grau II
│   └─ [L114] senão                                → Grau I     ← SEM regra de suficiência (D2)
│
└─ [L119-149] RAMO COMPLETO (FE preservada e massa normal)
    ├─ c = quantos alterados entre {e' <7, E/e' >15, IT >2,8, LAVI >34}
    │  avaliados = quantos desses 4 foram medidos
    ├─ [L138] avaliados < 2                         → '' (silêncio)   ← decisão spec §2.4
    ├─ [L139] c ≤ 1                                 → "Índices preservados"   ← D5
    ├─ [L140] c === 2                               → "Indeterminada"         ← D4
    └─ [L143-149] c ≥ 3 → regradua: E/A ≥2 → III · (E/A ≤0,8 e E ≤50) → I · senão → II
```

Depois, `src/senna90/achados/diastologia.ts`:
- `j21FA_achado` (L54): qualquer sentinela `FA_*` vira **uma única frase** — "Avaliação da função diastólica limitada devido arritmia cardíaca."
- `j43` (L102): converte em conclusão. `FA_SEM_DADOS` e "Índices preservados" ⇒ **sem conclusão**; o resto tem conclusão própria.
- `concLARS` (`conclusoes/index.ts` L211): só fala do strain atrial se a diastologia estiver normal ou muda — logo, um Grau I falso (D1/D3) também **silencia** a frase do LARS.

---

## 4. A régua do ASE/EACVI 2016 usada como referência

**Algoritmo A** (FE preservada, sem doença miocárdica) — 4 variáveis: e' septal <7 (ou lateral <10), E/e' médio >14, LAVI >34, Vel. IT >2,8.
→ **mais de 50%** positivas = disfunção presente (grada-se pelo Algoritmo B) · **menos de 50%** = normal · **exatos 50%** = indeterminada.

**Algoritmo B** (FE deprimida **ou** doença miocárdica com FE normal):
- E/A ≤0,8 **e** E ≤50 → **Grau I**
- E/A ≥2 → **Grau III**
- zona do meio (E/A ≤0,8 com E >50, ou 0,8 < E/A < 2) → contam-se **E/e' >14, IT >2,8, LAVI >34**:
  3 disponíveis: 2-3 positivos → **Grau II**; 0-1 positivo → **Grau I**.
  2 disponíveis: 2 positivos → **II**; 0 positivo → **I**; **1×1 → indeterminada**.
  **menos de 2 disponíveis → não se determina a pressão de enchimento (indeterminada).**

**Adaptação estrutural aceita na referência desta auditoria:** o motor não tem e' lateral nem E/e' médio, só os septais. O próprio guideline dá os equivalentes sítio-específicos (**E/e' septal >15**, e' septal <7), então a referência foi construída com eles — é isso que torna o desvio V12 legítimo (ver §7). Onde a régua septal-only muda o resultado em relação à média septal+lateral, isso é limitação de aquisição, não erro de código.

---

## 5. Comparação agrupada por classe de resultado

27 pares distintos motor × referência nas 6.758.400 combinações. Agrupados:

| Saída do motor | Referência ASE 2016 | Combinações | Veredito |
|---|---|---:|---|
| Grau III | Grau III | 1.073.760 | ✅ bate |
| Grau I | Grau I | 983.064 | ✅ bate |
| Índices preservados | Normal | 720.384 | ✅ bate |
| Grau II | Grau II | 535.908 | ✅ bate |
| Indeterminada | Indeterminada | 272.916 | ✅ bate |
| Silêncio | Sem dados | 75.354 | ✅ bate |
| *(subtotal das 6 linhas acima: **3.661.386**)* | | | destas, **3.309.762 são CONFORME** (batem com o guideline literal) e **351.624 são DESVIO DELIBERADO** (só batem depois de aplicadas as decisões registradas — §7) |
| **Grau I** | **Indeterminada** | **515.264** | 🔴 D2 / D3 |
| **Grau I ou III** | **Normal** | **274.432** | 🔴 D1 / D3 |
| **Índices preservados** | **Indeterminada** | **172.032** | 🔴 D5 |
| **Indeterminada** | **Grau I / II / III** | **237.636** | 🟡 D4 |
| **Grau I / II / III** | **Indeterminada** | **76.928** | 🔴 D2 |
| **Grau I ou III** | **Silêncio** | **28.656** | 🔴 D2/D3 (afirma grau com 0-1 campo) |
| FA_PRESSAO_NORMAL / ELEVADA / INDETERMINADA / SEM_DADOS | — | 1.351.680 | ⬜ fora do escopo do 2016 (§8) |
| Qualquer grau | guideline não gradua (E/A ou E ausentes) | 440.386 | ⬜ não mapeável (§8) |

---

## 6. Discrepâncias — tabela completa com reprodução

Todos os valores abaixo foram rodados no motor real. "achado" é a frase que sai no laudo.

### D1 — FE de Teichholz baixa atropela FE de Simpson normal (259.144 combos) 🔴

**Linha responsável:** `calculos/diastologia.ts:91-92`
```ts
if (feSimpson !== null && feSimpson < limFEsimpson) feBaixa = true;
else if (feT !== null && feT < limFEteich) feBaixa = true;
```
O `else if` só pula o Teichholz quando o Simpson **é baixo**. Se o Simpson foi medido e está **normal**, o código cai no `else if` e deixa o Teichholz decidir. Em todo o resto do motor a convenção é a inversa — `achados/index.ts:107` usa `d.b54 !== null ? jFE_Simpson(...) : jFE_Teichholz(...)`, ou seja, **Simpson presente manda**.

Clinicamente isso morde exatamente o paciente errado: mede-se Simpson justamente quando o VE está dilatado ou tem alteração segmentar, situação em que o Teichholz subestima a FE.

| Reprodução | Motor | Guideline |
|---|---|---|
| Simpson 60% · DDVE 55 · DSVE 42 (feT 0,467) · E 80 · E/A 1,2 · e' 9 · E/e' 8 · LAVI 28 · IT 2,2 | **Disfunção Diastólica Grau I** | Índices preservados |
| idem com DDVE 50 / DSVE 32 (feT 0,654) | Índices preservados | Índices preservados |

### D2 — Ramo simplificado sem regra de suficiência (399.840 combos) 🔴

**Linhas responsáveis:** `calculos/diastologia.ts:107-114`. A contagem `p` trata campo ausente como campo normal, e o `return` final é **Grau I incondicional**.

Duas sub-formas:
- **D2a (157.080)** — menos de 2 dos 3 critérios de pressão de enchimento disponíveis. Guideline: indeterminada. Motor: Grau I (ou II).
- **D2b (242.760)** — 2 disponíveis com empate 1 positivo × 1 negativo. Guideline: indeterminada. Motor: Grau I.

| Reprodução | Motor | Guideline |
|---|---|---|
| FE 40% · E/A 1,2 · E 80 · **nada mais medido** | **Grau I** | indeterminada (nenhum critério de PAE disponível) |
| SIV 16 · PP 16 (IMVE 182) · FE 60% · E/A 1,2 · E 80 · nada mais | **Grau I** | indeterminada |
| FE 40% · E/A 1,2 · E 80 · LAVI 40 (+) · E/e' 8 (−) | **Grau I** | indeterminada (empate 1×1) |
| FE 40% · E/A 2,0 · sem mais nada | Grau III | Grau III ✅ (E/A ≥2 basta) |

Compare com o ramo completo: `FE 60% + só LAVI 40` → **silêncio** (regra dos ≥2 campos). O mesmo exame com `FE 40%` → **Grau I**. A regra de suficiência existe em um ramo e não existe no outro.

### D3 — Exame sem FE nenhuma cai no ramo simplificado (236.296 combos) 🔴

**Linha responsável:** `calculos/diastologia.ts:95` + `:98` (`feVide` no mesmo `if` de `feBaixa`).
Comportamento herdado do motor legado (documentado como herança em `docs/planos/2026-08-26-senna93-inventario-legado.md:135-136`), **não** como decisão clínica. O guideline não tem essa porta: sem FE não há razão para presumir doença miocárdica.

| Reprodução | Motor | Guideline |
|---|---|---|
| Sem Simpson e sem DDVE/DSVE · E 80 · E/A 1,2 · e' 9 · E/e' 8 · LAVI 28 · IT 2,2 (**diástole 100% normal**) | **Grau I** | Índices preservados |
| Sem FE · E/A 2,0 · e' 6 · IT 2,7 · LAVI 34 | **Grau III** | Normal (1 de 3 critérios positivos) |
| Sem FE · só IT 2,7 medida | **Grau I** | silêncio (< 2 campos) |

O efeito colateral é duplo: além do grau falso, `concLARS` para de emitir a frase do strain atrial porque considera a diastologia "já alterada".

### D4 — Contagem fixa: c=2 sempre vira "Indeterminada" (237.636 combos) 🟡

**Linha responsável:** `calculos/diastologia.ts:140`. O guideline usa **proporção** (>50%), não contagem absoluta. Com 4 critérios avaliados, 2 é empate e "indeterminada" está certo. Com **3** avaliados, 2 positivos são 67% → o guideline manda concluir disfunção e graduar. Com **2** avaliados, 2 positivos são 100% → disfunção.

| Reprodução | Motor | Guideline |
|---|---|---|
| FE 60% · e' 6 (+) · IT 2,9 (+) · LAVI 34 (−) · E/A 2,2 · E 100 (E/e' não medido) | **Indeterminada** | **Grau III** (2 de 3 = 67%, E/A ≥2) |
| FE 60% · e' 7 (−) · IT 2,9 (+) · LAVI 34,1 (+) · E/A 1,0 | **Indeterminada** | Grau II |
| FE 60% · IT 2,9 (+) · LAVI 34,1 (+) — só 2 avaliados | **Indeterminada** | Grau II (100% positivos) |

### D5 — Contagem fixa: c≤1 sempre vira "preservados" (172.032 combos) 🔴

**Linha responsável:** `calculos/diastologia.ts:139`. Com **2** critérios avaliados e 1 positivo, é empate (50%) → guideline: indeterminada. O motor imprime **"Índices diastólicos preservados"**. É o mesmo falso-normal que a decisão §2.4 quis eliminar; a regra dos ≥2 campos barra o caso `n<2`, mas não o caso `n=2` com 1 positivo.

| Reprodução | Motor | Guideline |
|---|---|---|
| FE 60% · IT 2,9 (+) · LAVI 30 (−) — só 2 avaliados | **Índices preservados** (sem conclusão no laudo) | indeterminada |
| FE 60% · e' 6 (+) · IT 2,7 (−) | **Índices preservados** | indeterminada |
| FE 60% · e' 6 (+) · IT 2,7 (−) · LAVI 30 (−) — 3 avaliados | Índices preservados | Normal ✅ (1 de 3 = 33%) |

### D6 — Sexo em branco cai silenciosamente na régua masculina 🟢

`limFEsimpson`/`limIMVE` (L86-88) usam `sexo === 'F' ? … : …` — qualquer valor que não seja `'F'` (inclusive `''`) usa 52% e 115 g/m². Além disso, o alerta `SEXO_AUSENTE` (`motor.ts:120-131`) só dispara quando há **medida de câmara** preenchida; um laudo só com campos diastológicos + FE de Simpson não gera alerta nenhum.

| Reprodução | Motor | Esperado |
|---|---|---|
| sexo `''` · FE Simpson 53% · diástole normal | **Índices preservados** (53 ≥ 52 = FE normal) | se mulher, 53% < 54% = FE baixa → ramo simplificado |

### Observações sobre valor "0" digitado

O adaptador (`src/lib/motor-ts-adapter.ts:23`) só converte campo **vazio** em `null`. Um `0` digitado é um número válido e entra na conta:

| Cenário | Resultado |
|---|---|
| e' septal = **0** + LAVI 35 (sinusal) | `0 < 7` conta como critério positivo → **Indeterminada** (com e' 8 sairia "preservados") |
| LARS = **0** + LAVI 40 (FA) | `0 < 18` conta como elevado → **"pressão de enchimento elevada"** (com LARS vazio sairia "indeterminada") |
| E/A = **0** com ritmo `S` + FE 40% + E 45 | lido como E/A ≤0,8 → **Grau I** (com ritmo `N`, o mesmo 0 seria a porta da FA) |

Não é bug de fórmula, é ambiguidade de entrada — mas o `0` é justamente o que se digita para dizer "não tem onda A".

---

## 7. Desvios deliberados (351.624 combos) — corretos por decisão registrada

| Desvio | Combos | Onde está registrado | Comentário |
|---|---:|---|---|
| **E/e' septal isolado >15** (em vez de média >14) | — (integra a régua da referência) | docblock `calculos/diastologia.ts:8-9`; spec §2.4; veto **V12** | ✅ **Coincide com o guideline.** O ASE 2016 dá >15 como o corte sítio-específico do septal (média >14, septal >15, lateral >13). A decisão do Sr. está alinhada com o texto, não contra ele. |
| **e' septal isolado <7**, sem e' lateral | — (integra a régua) | mesmo docblock | ✅ corte correto para o septal; a limitação é de aquisição (não há campo de e' lateral), não de lógica |
| **Gatilho de FE 52%♂ / 54%♀** em vez de FE <50% | 281.736 | spec §2.3/A12 (linha 72) | 🟨 mais sensível que o literal, e defensável: o guideline manda usar o Algoritmo B também em "doença miocárdica com FE normal". Efeito: pacientes com FE 50-53,9% recebem grau em vez de "normal/indeterminada" |
| **≥2 campos avaliados ou silêncio** (ramo completo) | 69.888 | spec §2.4 ("Senna90 vence A19 — falso normal morre"); tabela 1a1 item 19 | ✅ mais seguro que o guideline; é exatamente esta regra que **falta** no ramo simplificado (D2) |
| **IMVE >115♂ / >95♀ como gatilho** | (dentro dos números acima) | spec §2.3/B12, veto V2, Lang 2015 | ✅ o guideline aceita HVE como "doença miocárdica"; corte e semântica `>` conferem |

---

## 8. O que o guideline não resolve (1.792.066 combos) — sem veredito forçado

### 8.1 Ramo da FA (1.351.680 combos)

**Não dá para dizer "conforme" nem "discrepante" contra o ASE 2016**, e o motivo é honesto: o motor implementa outra régua, declarada no próprio docblock ("ASE/EACVI 2025 in press: atualização para FA com LARS").

O que o **ASE 2016** recomenda em FA é um conjunto diferente de parâmetros — E/e' septal ≥11, TRIV ≤65 ms, DT da onda D de veia pulmonar ≤220 ms, DT da onda E ≤160 ms, taxa de aceleração da E ≥1900 cm/s², E/Vp ≥1,4 — e **desaconselha explicitamente o LAVI em FA** (o AE está aumentado em quase todo fibrilado, o índice perde especificidade). O motor usa E/e' septal >15, IT >2,8, **LAVI >34** e LARS <18.

Consequências verificadas:
- **LAVI carrega metade do peso** de um resultado "pressão elevada" em FA, contra a recomendação de 2016. Ex.: `FA · E/e' 20 · LAVI 44` → "pressão de enchimento elevada" (LAVI foi 1 dos 2 votos).
- O corte de E/e' septal em FA é **>15**; o 2016 sugere ≥11 nesse contexto. O motor é mais conservador (dirá "normal" onde o 2016 diria "elevada").
- A regra de suficiência (`avaliados < 2 → FA_INDETERMINADA`) é **melhor** que a do ramo sinusal simplificado — aqui a falta de dado produz "indeterminada", como deveria.
- Internamente o ramo é coerente com sua própria especificação (`docs/planos/2026-08-26-senna93-inventario-senna90.md:86`): **nenhum bug encontrado dentro da régua que ele adotou.**

**Recomendação:** quando o ASE/EACVI 2025 sair em versão final, revalidar este ramo contra o texto publicado. Até lá, é decisão sua assumida, não erro.

### 8.2 Graduação sem E/A ou sem onda E (440.386 combos)

O Algoritmo B **precisa** de E/A para graduar. Quando `E/A` está ausente (65.270 + 42.032 + 10.080 combos) ou quando `E/A ≤0,8` com onda E ausente (179.696 + 115.588 + 27.720), o guideline simplesmente não fornece grau. O motor assume **Grau II** (queda para o `return` final da regraduação, L149) ou **Grau I** (`return` final do simplificado, L114).

Não conto como discrepância porque não há resposta oficial para comparar — mas o motor **afirma um grau onde o guideline se cala**. É a mesma família de D2.

### 8.3 Porta da FA depende do campo `ritmo`

| Cenário | Resultado |
|---|---|
| ritmo `N` + E/A ausente | ramo FA ✅ |
| ritmo `N` + E/A = 0 | ramo FA ✅ |
| ritmo `N` + E/A = 1,2 (onda A presente) | ramo sinusal — correto, documentado em L43 |
| ritmo **vazio** ou `S` + E/A ausente (fibrilado com o campo não marcado) | **ramo sinusal**, sem qualquer aviso |

Verificado ponta-a-ponta: `E 90 · E/e' 20 · LAVI 44` sai como **"Função Diastólica Indeterminada"** com ritmo `S`, e como **"limitada devido arritmia" + "pressão de enchimento elevada"** com ritmo `N`. O laudo depende inteiramente de o ritmo ter sido marcado.

---

## 9. Tabela de fronteiras — o que acontece EM CIMA do corte

Todas verificadas com sonda dedicada. **Nenhuma fronteira está errada.**

| Parâmetro | Corte do motor | Valor exato | Motor no valor exato | Guideline | Veredito |
|---|---|---|---|---|---|
| e' septal | `< 7` | 7,0 | não conta como alterado | e' septal **<7** | ✅ |
| e' septal | `< 7` | 6,9 | conta como alterado | — | ✅ |
| E/e' septal | `> 15` | 15,0 | não conta | septal **>15** | ✅ |
| E/e' septal | `> 15` | 15,1 | conta | — | ✅ |
| E/e' septal (ramo simplificado) | `> 15` | 15,0 → Grau I · 15,1 → Grau II | vira o grau | — | ✅ |
| LAVI | `> 34` | 34,0 | não conta | LAVI **>34** | ✅ |
| LAVI | `> 34` | 34,1 | conta | — | ✅ |
| Vel. IT | `> 2,8` | 2,80 | não conta | TR **>2,8 m/s** | ✅ |
| Vel. IT | `> 2,8` | 2,81 | conta | — | ✅ |
| E/A (restritivo) | `≥ 2` | 2,00 | **Grau III** | E/A **≥2** | ✅ |
| E/A (restritivo) | `≥ 2` | 1,99 | não dispara | — | ✅ |
| E/A (grau I) | `≤ 0,8` | 0,80 (com E=50) | **Grau I** | E/A **≤0,8** | ✅ |
| E/A (grau I) | `≤ 0,8` | 0,81 (com E=50) | não dispara | — | ✅ |
| Onda E (grau I) | `≤ 50` | 50,0 (com E/A 0,7) | **Grau I** | E **≤50 cm/s** | ✅ |
| Onda E (grau I) | `≤ 50` | 50,1 (com E/A 0,7) | não dispara | — | ✅ |
| FE Simpson ♂ | `< 52` | 52,0 | FE normal (ramo completo) | Lang 2015: normal ≥52 | ✅ |
| FE Simpson ♀ | `< 54` | 54,0 | FE normal | normal ≥54 | ✅ |
| FE Teichholz ♂/♀ | `< 0,52 / < 0,54` | 0,520 / 0,540 | FE normal | idem | ✅ |
| FE Simpson **60%** + Teichholz **0,40** | — | — | **ramo simplificado** (Teichholz venceu) | Simpson deveria mandar | ❌ **D1** |
| IMVE ♂ | `> 115` | 115,0 | não dispara HVE | Lang: anormal >115 | ✅ |
| IMVE ♀ | `> 95` | 95,0 | não dispara HVE | anormal >95 | ✅ |
| IMVE ♂/♀ | `> 115 / > 95` | 115,1 / 95,1 | dispara ramo simplificado | — | ✅ |
| LARS (FA) | `< 18` | 18,0 | não conta como elevado | ASE 2025 in press | ✅ (fora do 2016) |
| LARS (FA) | `< 18` | 17,9 | conta | — | ✅ |
| Sexo `''` | usa régua ♂ | FE 53% | lido como FE **normal** | — | ⚠️ **D6** |
| Suficiência (ramo completo) | `avaliados < 2` | 1 campo | silêncio | decisão §2.4 | ✅ |
| Suficiência (ramo simplificado) | **não existe** | 0 campos | **Grau I** | indeterminada | ❌ **D2** |

---

## 10. O que está comprovadamente certo (não mexer)

- **Todos os cortes numéricos e todas as semânticas `>` / `≥`** — 26 fronteiras testadas, 26 corretas.
- **Robustez:** 6.758.400 combinações, 0 exceções, 0 saída inesperada (nenhuma string fora das 9 classes previstas).
- **Fiação:** 549 amostras via `calcular()` completo bateram 100% com a chamada direta a `calcularJ21`; achado e conclusão são coerentes entre si em todas as classes.
- **Regraduação após c≥3** (L143-149): a queda para Grau II é matematicamente equivalente ao Algoritmo B em **todos** os casos testados (com c≥3 entre 4 critérios, sempre há ≥2 dos 3 critérios de pressão de enchimento positivos). Nenhuma discrepância nesse trecho.
- **Regra dos ≥2 campos do ramo completo** — funciona como projetada e é mais segura que o guideline.
- **Ramo da FA** — internamente coerente com a régua que adotou; a única questão é qual régua (§8.1).
- **`FA_SEM_DADOS` sem conclusão** e **"índices preservados" sem conclusão** — comportamento correto e verificado.

---

## 11. Se for corrigir (não implementado — decisão do Sr.)

Ordem por relação benefício/risco, em uma linha cada:

1. **D1** — trocar o `else if` da L92 por "Simpson presente manda" (`if (feSimpson !== null) feBaixa = feSimpson < lim; else if (feT !== null) …`), alinhando com `achados/index.ts:107`. Uma linha, elimina 259 mil combinações discrepantes.
2. **D2** — dar ao ramo simplificado a mesma regra de suficiência do completo: se menos de 2 dos 3 critérios de PAE foram medidos (e E/A não fechou grau I ou III direto), devolver "Indeterminada" em vez de Grau I.
3. **D3** — tirar `feVide` do gatilho da L98 (ou mandar `feVide` para o ramo completo, que já tem a regra de suficiência).
4. **D4/D5** — trocar a contagem fixa (`c ≤ 1` / `c === 2`) pela proporção do guideline (`positivos*2 > avaliados` → disfunção · `< ` → normal · `=` → indeterminada), mantendo a regra dos ≥2 campos por cima.
5. **D6** — sexo em branco: suprimir o gatilho de FE/IMVE (ou disparar o alerta `SEXO_AUSENTE` também quando só há campos diastológicos).

Qualquer um desses mexe em texto de laudo assinado — vale rodar a bateria dos 72 casos (`npm run test:unit`) e o shadow contra os laudos reais antes e depois, e fixar os casos novos em `src/senna90/tests/casos/07-diastologia-completa.ts`.

---

## Anexos

- Script da enumeração: `…/scratchpad/diastologia-exaustiva.mjs` (não commitado; roda com `node --import ./tests/unit/register-ts-resolve-hook.mjs <script>`)
- Reproduções ponta-a-ponta: `…/scratchpad/repro.mjs`
- Saída bruta: `…/scratchpad/saida2.txt`

---

## ADENDO — Verificação adversarial (28/08, segunda rodada independente)

Todos os 6 achados foram reproduzidos no motor REAL via `calcular()` (fiação completa):
**D1-D6 CONFIRMADOS, nenhum refutado.** Correções de leitura e achados novos:

- **D1 é mais grave que o descrito**: contradição INTERNA do laudo — o mesmo exame imprime
  "FE de 60% (Simpson) — preservada" (achados/index.ts:107) e trata o paciente como FE
  baixa na diastologia (calculos/diastologia.ts:92, `else if` deixa o Teichholz atropelar
  um Simpson normal). Alcance real alto.
- **D2 viola a própria spec** (§2.4: "exige ≥2 campos avaliados; abaixo, silêncio" — sem
  restrição ao sub-ramo): o ramo simplificado gradua com 0-1 critério medido.
- **D3**: comportamento está FIXADO pelo teste DC29 (07-diastologia-completa.ts:613) —
  corrigir quebra um teste deliberado. Alcance limítrofe (rascunho e SR só-Doppler).
- **D4 pior caso**: e' 6(+) + IT 2,9(+) + LAVI 34(−) + E/A 2,2 → "Indeterminada" onde o
  guideline dá **grau III** (restritivo subestimado).
- **D6**: a face da FE é de canto; a face do IMVE é real E a mensagem do SEXO_AUSENTE
  MENTE para a diastologia ("frases suprimidas" — a diastologia aplica régua masculina
  calada; achado novo 2).
- **NOVO 1 (real)**: hipertrofia grave (SIV/PP 16, massa 355 g) com peso/altura em branco
  → `imVE null` → `massaAlta=false` → "Índices diastólicos preservados", sem alerta.
- **NOVO 2**: mensagem do SEXO_AUSENTE incorreta para diastologia (acima).
- **FA (b) parcialmente refutado**: a suficiência do ramo FA está correta, mas usa a MESMA
  contagem fixa de D4/D5 — mesmo empate de 50% dá "pressão elevada" na FA e
  "Indeterminada" no sinusal.
- **Frequências do produto cartesiano NÃO são frequência clínica** — as contagens por
  balde não servem para priorização.

**Priorização sustentada pelos dados:** D1 → D2 → NOVO-1 (massa silenciada) → D4/D5 →
NOVO-2/D6 → D3. Fronteiras: todas as 26 do lado certo (re-testadas, incl. 2 com fixture
discriminante que o relatório original não tinha); E/e' septal >15 ALINHADO ao corte
sítio-específico do ASE 2016.

**Contexto de risco**: a metade das FRASES (onde a diastologia vive) é o Senna90 primário
em produção DESDE 16/05 — nada disso é regressão da virada de hoje; são achados latentes
de 3+ meses que a auditoria expôs. Correções mudam frase de laudo ⇒ cada uma passa pelo
cardiologista + esteira (teste, revisor, linha na allowlist da sombra).
