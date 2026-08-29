# SPEC — Senna93: unificação dos motores (Seção 6)

**Data:** 26-27/08/2026 · **Status:** aguardando aprovação do esqueleto de fases pelo Sergio
**Mandato:** `docs/decisoes/2026-08-26-senna93-motor-unificado.md` (5 etapas; leitura ✅, 1-a-1 ✅)
**Método de execução:** mesma esteira das S4/S5 — plano por fase (`superpowers:writing-plans`) →
`superpowers:subagent-driven-development` (1 implementador + 1 revisor por task; opus nas tasks de
fórmula clínica e nas viradas; revisor DEDICADO linha-a-linha em qualquer toque no legado) →
tríade final adversarial → e2e → teste ao vivo → merge/deploy só com confirmação do Sergio.

---

## 0. Precedência entre os documentos-fonte

Em QUALQUER conflito, vale esta ordem (do mais forte pro mais fraco):

1. **`docs/planos/2026-08-26-senna93-evidencias-ase.md`** — decisões clínicas 100% fechadas
   (seções "DECISÃO REGISTRADA" e "DECISÃO DO ARCO"). **Vence tudo.**
2. `docs/planos/2026-08-26-senna93-tabela-1a1.md` — recomendação por linha (as linhas técnicas
   seguem a recomendação; Sergio pode vetar pontualmente antes da task).
3. Inventários (`-inventario-legado.md`, `-inventario-senna90.md`) e
   `-consumidores-e-sombra.md` — matéria-prima (fatos de código, âncoras de linha).
4. `docs/decisoes/2026-08-22-contrato-ponte-tela-motor.md` — os 8 contratos travados por teste
   (o seguro da migração; atualizado a cada fase, nunca violado).

**Conflitos já resolvidos pela precedência** (a tabela 1-a-1 foi escrita ANTES das evidências e
seu cabeçalho carrega referências superadas):

| Tema | Tabela 1-a-1 dizia | O que VALE (evidências 26/08) |
|---|---|---|
| Aneurisma raiz/asc | ≥50 mm | **≥45 mm** (ACC/AHA 2022); 50/55 são limiares CIRÚRGICOS (nota de encaminhamento, não mudança de nome) |
| Arco | 22–36 / 37–44 / ≥45 (e A2 "decisão do Sergio") | **≤40 normal · >40 "dilatado" SEM graus**. As 3 réguas de casa MORREM. ~~nota cirúrgica/frase de angio~~ **[SUPERADO por V13 27/08: laudo descreve, não recomenda — ≥55 vira só a flag `notaCirurgica`, sem texto]** |
| GLS VE (A11/B1) | "Senna90 vence (20)" | **3 faixas** (ASE/EACVI 2025): normal < −18% · limítrofe −18 a −16% · anormal > −16% (valor assinado). Nem 18 nem 20 binário |
| TAPSE (A10) | "decisão do Sergio 17×20" | **>17 mm** (ASE 2025 Coração Direito — substitui Rudski). "≥20" morre nas duas pontas |
| FE (A9) | "número final é decisão do Sergio" | **52%♂ / 54%♀** (Lang 2015) — a frase já estava certa; a coluna VR impressa (">51/53%") é que corrige |
| Raiz ♀ >65 | WASE ♀ …/37 | **38** (WASE 2022 Tab. 3, 37,5 arredonda pra 38) — faixas finais ♂38/40/41 · ♀35/36/38 |

---

## 1. Objetivo e não-objetivos

**Objetivo.** Um motor só: o **Senna93** = evolução do `src/senna90/` (NÃO reescrever) que absorve
a metade dos números do legado (`public/motor/motorv8mp4.js`): superfície corporal, volumes, massa,
índices, a tabela `#params-tbody`, as caixas `calc-*`, a identificação `#out-*` e o alerta PSAP.
Ao final: legado aposentado, PDF deixa de raspar números da tela, Contrato da Ponte encolhe,
kill-switch morre.

**Fato estrutural que dirige tudo:** `calcularDerivados` JÁ calcula **12/12** valores numéricos da
tabela e eles JÁ viajam pela ponte (`senna90-bridge.ts:49` devolve `derivados`). O que falta é
**apresentação** (refVal/isOOR por sexo+idade, regra "VIDE", formatação decimal, render React) e
**trocar o cabo** dos 9 consumidores — não escrever fórmula nova.

**Não-objetivos (explícitos):**
- Renomear `src/senna90/` → o diretório fica; "Senna93" é o nome do motor unificado nos ADRs e no
  versionamento do rodapé. Churn de imports não paga o benefício.
- Calcular PSAP por Bernoulli (não existe em nenhum motor; `b37` continua digitada — fórmula nova
  seria escopo novo).
- Tocar em Direx (intocável), no fluxo de emissão/billing, ou em qualquer camada das Seções 1-5.
- Validação de faixa clínica (decisão 19b: zero validação — um DDVE de 500 mm continua calculando).
- Extrair o efeito do motor de `page.tsx:416-755` (recomendação da tríade S5) — só se alguma fase
  precisar; não é objetivo próprio.

---

## 2. Decisões clínicas fechadas — os números finais do Senna93

Esta é a tabela canônica. Toda task de fórmula pina ESTES valores em teste antes de portar.

### 2.1 Função sistólica e strain

| Parâmetro | Corte final | Fonte | O que muda |
|---|---|---|---|
| FEVE (Teichholz e Simpson) | anormal <52%♂ / <54%♀; frase "limite inferior" no valor exato do corte | Lang 2015 Tab.2/4 | VR impressa vira "≥ 52%♂ / ≥ 54%♀" (era >51/53); isOOR marca <52/<54; FE-baixa da diastólica usa 52/54 por sexo (A12, era 50 fixo); comparações `===` contra float viram faixas (A13, B17) |
| TAPSE | normal **>17 mm** | ASE 2025 Cor. Direito Tab.1 | Texto do j23 "(VR ≥ 20 mm)" vira "(VR > 17 mm)" nos DOIS motores da frase; tabela/VR idem |
| GLS VE | **3 faixas** (assinado): normal < −18 · limítrofe −18 a −16 · anormal > −16 | ASE/EACVI 2025 Strain §3 | Achado E conclusão saem da MESMA classificação (mata B1 — hoje achado usa \|20\| e conclusão \|18\|); textos ganham a faixa limítrofe |
| GLS VD | mantém \|20\| (Senna90) | — (2025 não muda VD) | sem mudança |
| LARS | mantém ≥18 | — | sem mudança |
| Paredes b59/b60/b61 | `b59`=inferior · `b60`=inferolateral · `b61`=lateral | ADR 16/05 (Senna90 é a verdade) | Ao portar, NÃO copiar o mapa do legado (A8) |
| j12 "apesar da alteração contrátil segmentar" | só sai se existir parede alterada (consulta b55–b62) | — | B5 |
| Ramo morto de `concSistolica` | guarda corrigida ou ramo removido | — | B7 |

### 2.2 Aorta (o domínio de maior risco — 3 réguas viram 1)

**Arquitetura da régua (vale pra raiz e ascendente):**
- **Gatilho** de "acima do normal" = referência por **sexo+idade**: raiz WASE 2022
  (♂ 38/40/41 · ♀ 35/36/**38** nas faixas 18-40 / 41-65 / >65) · ascendente ASE Chamber Tab.14
  (♂ ≤38 · ♀ ≤35). É o MESMO gatilho da tabela/VR — tabela e frase param de discordar (A5).
- **Nome do grau** = ACC/AHA 2022 por mm absoluto: acima do gatilho e **<45 mm → "dilatação"** ·
  **≥45 mm → "ANEURISMA"** · **≥50 mm → flag estruturada `notaCirurgica`, SEM texto no laudo** [V13 27/08: laudo descreve, não recomenda; 50/55 são limiares cirúrgicos, não mudança de nome]. O vocabulário "ectasia leve/moderada/importante" MORRE.
- **Índice área/altura ≥10 cm²/m** = sinalização de **risco cirúrgico**, nunca diagnóstico
  (frase de "critérios de maior gravidade" mantida; raiz e ascendente; arco NÃO — sem base).
- **Z-score/DP**: sobrevive SÓ como rede de segurança quando `idade === null` (comportamento
  Senna90 atual, A6/A7); o Senna93 **avisa** (alerta estruturado) quando falta data de nascimento
  em vez de chutar 50 anos. O caminho por DP do legado (sem sexo) NÃO é portado.

**Arco aórtico:** ≤40 normal · **>40 "dilatado", SEM graus** · ≥55 = flag `notaCirurgica` sem texto [V13 27/08]. ~~Frase de angio-TC/RM~~ **[MORTA por V13 27/08 — laudo descreve, não recomenda; o 'nv' segue descrito por jPlacas]**. Sem sexo, sem índice. As três réguas atuais (fallback [36,38,42], ACR/ACRIN 35/32-44/41,
tabela 22–36) morrem.

**Tabela/VR:** ganha as linhas de ascendente e arco que hoje não são impressas (B14, recomendação
aceita); raiz com VR "≤ N mm" por sexo+idade (WASE); ascendente "≤38/≤35"; arco "≤40".

### 2.3 Câmaras e antropometria

| Parâmetro | Corte final | O que muda |
|---|---|---|
| LAVI (j4) | leve 35-41 · moderado 42-48 · grave **>48** (anormal >34) | Lang 2015 Tab.4 — hoje ≥48 é "importante"; 48 passa a moderado |
| RAVI (j5 e frase de câmaras) | JASE 2025 unificado: <30 normal · ≤36 leve · ≤41 mod · >41 imp — **uma régua só nas duas frases** (A14+A15) | abre mão do critério por sexo do legado — item de veto |
| ASC (DuBois) | constante **71,84** | decisão 03/05 — legado (71,74) não é portado |
| Idade | UMA implementação: comparação de string ano/mês/dia (Senna90) | as 3 do legado morrem; sem fallback 50 anos (A7, A17) |
| Massa (Devereux) | `0,8 × [1,04 × (…)] + 0,6` com o **+0,6 em gramas** (fora da divisão por 1000) | B24 corrigido — +0,6 g em toda massa, clinicamente desprezível, matematicamente certo |
| IMVE (limite de HVE) | **unificar em 115♂/95♀ g/m²** (Lang 2015) na geometria (j10/j47) E na diastólica | B12/A-nota — hoje 102/88 vs 115/95 no mesmo motor; item de veto |

### 2.4 Diastólica

| Item | Decisão | Ref |
|---|---|---|
| E/e' na FA | **mantém >15** — CORRIGIDO 27/08 na leitura da F1: o docblock de `calculos/diastologia.ts` registra decisão explícita do Sergio ("E/e' septal isolado: >15, não >14 — esse é pra média septal+lateral"; "antes FA usava >14, agora >15 também"). Decisão documentada vence a recomendação da tabela A18. Vira item de veto **V12** | decisão Sergio registrada no código |
| Dados insuficientes (sinusal) | exige **≥2 campos avaliados**; abaixo, ~~silêncio~~ (Senna90 vence A19 — falso normal morre) **[SUPERADO EM PARTE por 28/08: o silêncio vale SÓ para o ramo A (sinusal com FE preservada e massa normal), onde não há o que dizer. No ramo B (FE deprimida ou doença miocárdica) `<2 critérios avaliados` sai **Função Diastólica … Indeterminada**, não silêncio — lá existe achado a declarar (o gatilho sistólico/massa é real) e o que havia antes era um `return` Grau I incondicional, o falso-normal ao contrário]** | A19 · T3/T2c 28/08 |
| Linha de números (j22) | monta só os campos preenchidos nos DOIS ramos (a lógica do j22FA vale pro sinusal) — mata "Relação E/A= ; " (B8) | — |
| Detector de divergência manual | comparação por **chave exata** (índice), não `includes` — Grau I deixa de ser substring de Grau III (B6) | — |
| Estado duplicado | UM adaptador `montarD` e UMA cópia do estado manual (B30) | — |

**ANOTAÇÃO 28/08/2026 — onda "Diastologia conforme ASE/EACVI 2016"** (plano
`docs/planos/2026-08-28-diastologia-guideline-ase2016.md` · anexo normativo com as
reproduções `docs/planos/2026-08-28-auditoria-diastologia-ase2016.md` · divergências
esperadas da sombra `docs/planos/2026-08-27-senna93-divergencias-esperadas.md` linhas
`F6-T1..F6-T3`). **Regra permanente do Dr. Sérgio: "não existe decisão pessoal — os
resultados seguem os guidelines; nos cabe apenas implementar as recomendações."** Onde o
texto acima conflitar com uma destas linhas, valem estas:

| Item | Decisão 28/08 | Ref |
|---|---|---|
| Seleção de ramo | FE de referência é a **Simpson** quando medida (Teichholz não atropela Simpson normal); **FE ausente NÃO é FE deprimida** → segue o algoritmo A. O ramo B fica sendo o que o guideline diz: FE deprimida OU doença miocárdica (massa) | D1/D3 · T1 |
| Contagem de critérios (ramo A) | **maioria dos critérios AVALIADOS**, não contagem fixa: >50% positivos → gradua · exatamente 50% → Indeterminada · <50% → preservados. O `c<=1` (falso-normal) e o `c===2` (Indeterminada eterna) morrem; cutoffs e a régua de ≥2 avaliados intactos | D4/D5 · T2 |
| Graduação exige fluxo mitral | E/A ausente — ou E/A ≤0,8 com onda E ausente — **não recebe grau**: o padrão do fluxo é o que define I/II/III (ASE 2016 Fig. 8). Classe NOVA nos dois ramos: achado "Disfunção Diastólica do ventrículo esquerdo presente, de grau não determinado (fluxo mitral não avaliado)." e conclusão "…de grau não determinado." Mata o fallthrough que afirmava "Pseudonormal" com zero fluxo mitral medido | anexo §8.2 · T2b/T2c |
| Ramo B (suficiência) | regras diretas do fluxo mitral intactas (E/A ≥2 → III · E/A ≤0,8 com E ≤50 → I); a zona média exige **≥2 critérios avaliados** e a maioria decide — empate ou insuficiente → **Indeterminada** (ver supersessão na linha "Dados insuficientes" acima); maioria positiva sem E/A → classe "grau não determinado" | D2 · T3/T2c |
| Empate na FA | maioria dos avaliados também na FA: empate 50% (2/4, 1/2) → **indeterminada**, não "pressão elevada". O `elevados >= 2` fixo chamava 2 de 4 de elevada e 1 de 2 de normal | T3 |
| Sexo ausente (gatilho do ramo B) | as réguas dependentes de sexo (FE 52♂/54♀ · imVE 115♂/95♀) só decidem onde as **duas concordam**; na faixa discordante o gatilho é não-avaliável e não dispara — régua masculina calada é proibida (postura C8). O aviso é de **TELA** (`SEXO_AUSENTE`, `MASSA_NAO_INDEXAVEL`); nenhuma frase de laudo nova — o laudo descreve, não recomenda | D6/NOVO-1/NOVO-2 · T4 |

### 2.5 Valvas

| Item | Decisão | Ref |
|---|---|---|
| Estenose mitral | **área como critério primário**, gradiente médio como suporte (B2); ~~área 1,5-2,0 não fecha leve sozinha~~ **[SUPERADO por V4 27/08, diretriz pesquisada: ASE/EACVI 2017 gradua leve >1,5 DIRETO (mod 1,0-1,5 · grave <1,0); gradiente é só confirmatório — implementado <1,0 imp · ≤1,5 mod · ≤2,0 leve · >2,0 silêncio]** | recomendação aceita; itens de veto |
| Estenose aórtica | critérios em CONJUNTO (Vmax/grad máx ≥64 · grad médio ≥40 · área <1,0) — **pior grau entre os disponíveis**; mata o low-flow-low-gradient saindo "leve" (B3); "esclerose" (16-26 mmHg) ganha frase própria em vez de ser jogada fora (B27) | item de veto |
| Estenose pulmonar | **ASE 2017 valvar** (>64 imp · ≥36 mod · senão leve) = Senna90 atual (A20) | item de veto (legado era critério congênito) |
| Tricúspide "restrição da abertura" | mantém comportamento Senna90 (só ramos E) — menor mudança (A21) | item de veto (alternativa: alinhar com a mitral E/F/EF) |
| Estenose tricúspide sem número | sempre imprime o critério que fechou o grau (B18) | — |
| Morfologia "preservada" | condição reescrita pelo que quer dizer (não olhar refluxo tricúspide, B21) | — |
| Discinesia difusa (`DD`) | texto de DIScinesia, não hipocinesia (B4); "septal anterior"/"septal inferior" com espaço (B9) | — |

### 2.6 Wilkins

| Item | Decisão | Ref |
|---|---|---|
| Fronteiras | ≥9 não candidato · =8 no limite · ≤7 favorável — **o literal do ramo ≤7 passa a dizer "(escore < 8)"** (texto para de contradizer a regra, B10) | item de veto (alternativa: 8 vira favorável) |
| Componentes | escore só calcula com os 4 componentes em **1-4**; componente 0 = "não avaliado" → score null + alerta estruturado (B29) | item de veto |
| Descrições espessura 2/3 | corrigir para o Wilkins original (2 = espessamento marginal 5-8 mm · 3 = todo o folheto 5-8 mm) (B11) | item de veto — conferir contra o artigo na task |
| Bloco impresso | imprime as 4 categorias (inclusive valor 0/não avaliado) — total sempre bate (B22); cálculo separado de pintura (B23 — o Senna93 devolve `wilkinsScore`, quem pinta é React) | — |

### 2.7 Apresentação (a metade nova)

| Item | Decisão |
|---|---|
| Realce (vermelho) | **estruturado por achado/linha** (flag no resultado), NUNCA regex de português — "Baixa Probabilidade de Hipertensão Pulmonar" para de acender (B15) |
| Alerta das linhas da tabela | as **10 linhas** alertam (FE, massa, IMVE, ER incluídos — a metade direita para de ser sempre preta, B13) + raiz/asc/arco |
| Regra "VIDE" | portada como **campo estruturado** (`feT: null, motivo: 'dsve-ausente'`); a palavra impressa continua "VIDE" (comportamento atual — item de veto trocar por texto claro) (C4) |
| Sexo ausente | tabela/VR **silencia** (mesma postura das frases — régua masculina silenciosa MORRE) + alerta estruturado "sexo não informado" (C8). Bloquear emissão sem sexo = decisão de produto, fora desta esteira (relacionada à pendência S5 "sexo na whitelist adm") |
| Zero ≠ não medido | guardas por `null` explícito nos pontos novos/tocados (TAPSE/GLS 0 não somem) (B26) |
| Política numérica | truncar no cálculo (política Senna90) e formatar SEM re-arredondar na impressão — uma política só (B25); casas decimais da tabela preservadas (asc/er/aoae 2 casas, resto 1) |
| Rodapé do PDF | cita **por domínio**: Lang 2015 · Goldstein 2015 · ACC/AHA 2022 · WASE 2022 · ASE 2025 (coração direito) · ASE/EACVI 2025 (strain) — mata B20 |
| Frases "VR" inline | atualizadas junto com os cortes (PSAP "VR < 36 mmHg" fica; TAPSE/GLS mudam conforme 2.1) |
| Limpeza | `b27`, comparações `'Sim'`/`'Presente'` (B28), helpers mortos (`fmt`/`fmtPct`/`normalize.ts`) — não portados/removidos |

---

## 3. Arquitetura (C1-C10 — resoluções)

### C3 — `classificacoes/` (449 linhas mortas): reescrever, não reviver
Os 3 arquivos viram o **módulo de apresentação** do Senna93:
- `refVal(campo, sexo, idade)` e `isOOR(campo, valor, sexo, idade)` ganham `idade` na assinatura
  e são reescritos **número por número a partir dos cortes vivos da Seção 2** (nunca dos números
  atuais do módulo, que já derivaram em 7 pontos — A22).
- `cutoffs.ts` é **DELETADO** — os números vivem UMA vez, nos módulos de achados/classificação;
  refVal/isOOR importam de lá (uma segunda cópia é a origem da deriva).
- Cobertura: teste que pina refVal/isOOR de TODAS as linhas da tabela × sexo × faixas de idade.

### C2 — Kill-switch da metade dos números: estender `primary-engine-flag.ts`
Mesmo módulo, segunda chave: `localStorage['leo:params-engine']` com a MESMA precedência
(`'off'` por device vence tudo > `'senna93'` força ON > `NEXT_PUBLIC_PARAMS_ENGINE='senna93'`
default global). `senna93Params(): boolean` exportada ao lado de `senna90Primario()`.
- OFF → legado continua pintando `params-tbody`/`calc-*`/`#out-*` como hoje (zero regressão).
- ON → React renderiza dos `derivados`+apresentação; o legado continua RODANDO mas os nós que ele
  pinta são os do caminho morto (ou é impedido de pintar — detalhe da fase 3).
- O kill-switch vive até a fase de aposentadoria, onde morre JUNTO com o legado (último commit).

### C1 — Sombra com persistência (pré-requisito da etapa 4 do ADR)
A sombra hoje está MORTA (0 comparações persistidas). Decisão:
- **Caminho: retroativo com persistência** (não plugar o shadow-runner client-side — continua
  congelado/morto e é deletado na aposentadoria).
- `/api/admin/shadow-retroativo` passa a **gravar** cada execução em
  `workspaces/{wsId}/privado/shadow-execucoes/{execId}` (resumo + divergências por exame) via
  **Admin SDK**. Como `privado/**` já é deny-by-default pro cliente e leitura/escrita são
  server-side, **nenhuma regra Firestore nova é necessária**. Se alguma fase quiser leitura
  client-side do painel → aí sim regra nova → **confirmação do Sergio antes** (regra permanente).
- A sombra compara as DUAS metades: frases (já existente) **e** a metade dos números
  (derivados+refVal/isOOR do Senna93 × o que o legado pintaria) — reordenando b59/b60/b61
  conforme o Contrato da Ponte item 2.
- **Divergências ESPERADAS** (as correções deliberadas da Seção 2 — ex.: ectasia→aneurisma 45-49,
  TAPSE 17, GLS 3 faixas) entram numa allowlist versionada com justificativa; a meta operacional é
  **0 divergências INESPERADAS** no retroativo sobre o histórico real + janela de exames novos.

### C5/C6/C7 — consumidores
- `window.refluxoPulmonar` entra no **Contrato da Ponte** (9º item, com teste) ANTES de qualquer
  fase tocar nos consumidores (C5).
- Copiar Texto e Baixar Word passam a consumir `pdf-params.ts` (`montarParamsHtml`/uma variante
  texto) ANTES da troca de fonte — os 4 consumidores de params passam por UM template (C6).
- `#out-*` (identificação impressa no PDF assinado) migra **no mesmo passo** que params-tbody,
  nunca depois (C7) — invariante (5) do teste do contrato atualizada em conjunto.
- Banco de frases: o HTML com `onclick` inline (`_onInserirFrase`) e o CRUD localStorage
  (`medcardio_banco`, `FRASES_DEFAULT` 34 frases) migram pra componente React que insere no
  TipTap pelo mesmo caminho atual; comportamento e chave localStorage preservados byte-a-byte.
- Alerta PSAP: o override React de `alertaIT` passa a ler `resultado.alertas` do Senna93
  (`IT_SEM_PSAP`, `REFLUXO_PULM_SEM_PMAP`) — o corpo legado (que já não roda) morre com o legado.

### C9/C10 — testes primeiro (pré-requisito de TUDO)
- Os 72 casos de `src/senna90/tests/` entram no `npm run test:unit` (adaptador `.test.mjs` que
  invoca a suite; placar unit SOBE antes da primeira mudança de fórmula).
- O runner passa a comparar `resultado.alertas` (hoje ignora — DC24 não testa nada).
- Pinar ANTES de portar: os 3 tiers da aorta (por sexo × idade × mm, incluindo fronteiras 40/45/50
  e arco 40/55), os 12 derivados (vdf/vsf/fs/aoae nunca asseridos hoje), TAPSE, GLS 3 faixas,
  LAVI bandas, RAVI, refVal/isOOR de todas as linhas.

---

## 4. Os 9 consumidores — ordem de troca de cabo

| # | Consumidor | Risco | Fase |
|---|---|---|---|
| 1 | `calc-*` (10 ids, tela-only, zero scraper) | baixo (pior caso: painel mostra —) | 3 — primeiro cabo |
| 2 | `#alerta-psap`/`alertaIT` (já 100% React) | baixo | 3 |
| 3 | `window.refluxoPulmonar` | baixo (2 call-sites) | 3 |
| 4 | `#params-tbody` → 4 saídas (PDF assinado, Copiar Formatado, Copiar Texto, Word) | **ALTO** — documento assinado | 3 — depois de C6 unificar os 4 |
| 5 | `#out-*` identificação | **O MAIS CRÍTICO** — quebra silenciosa vira —/—/— no PDF | 3 — mesmo passo do 4 |
| 6 | `window.calc` / orquestração de disparo | médio | 3/5 — Senna93 expõe equivalente disparável pela delegação de eventos |
| 7 | `window._onInserirFrase` / banco de frases | médio | 3 |
| 8 | Sentinela `__WILKINS__` (4 pontas) | já é do Senna90 | inalterado (rótulos vigiados pela invariante 8) |
| 9 | Kill-switch (transversal) | — | 3 (nasce ANTES do primeiro cabo) |

---

## 5. Esqueleto de fases (o que o Sergio aprova)

Branch única `feat/senna93-unificacao` a partir da master. Cada fase = um plano SDD próprio em
`docs/planos/`, com tasks bite-sized, revisor por task, e **checkpoint com o Sergio no fim da fase**
(ledger + ADR + Obsidian + memória + push). Merge/deploy por fase SÓ com confirmação, fora do
horário da clínica.

- **FASE 0 — Rede de teste (sem mudança de comportamento).** C9 (72 casos no `test:unit` +
  runner compara alertas), C10 (pinar aorta/derivados/TAPSE/GLS/LAVI/RAVI atuais ANTES de mudar),
  C5 (`window.refluxoPulmonar` no Contrato da Ponte + teste). Placar unit sobe; nada muda no laudo.
- **FASE 1 — Números certos onde já vivem (frases do Senna90 — a metade que JÁ está no ar).**
  Todas as correções das Seções 2.1-2.6 que afetam achados/conclusões: aorta nova régua
  (ACC/AHA + WASE ♀38, arco ≤40/>40 [nota/angio mortas por V13 27/08]), GLS 3 faixas, TAPSE 17, LAVI, RAVI, E/e' FA 14,
  diastólica ≥2 campos/j22/divergência manual, valvas (mitral área-primária, aórtica conjunto,
  B4/B9/B18/B21/B27), Wilkins (literal, componente 0, descrições), massa +0,6, IMVE 115/95,
  sistólica B5/B7. **Tasks de fórmula = opus + teste pinando cada referência.** Sombra retroativa
  vai acusar essas mudanças — cada uma entra na allowlist de divergências esperadas JÁ nesta fase
  (arquivo versionado).
- **FASE 2 — A metade da apresentação (módulo pronto, ligado a NADA).** C3 (refVal/isOOR
  reescritos com sexo+idade, cutoffs.ts deletado), regra VIDE estruturada, formatação decimal,
  realce estruturado B15/B13, linhas asc/arco B14, sexo-ausente-silencia C8, rodapé por domínio
  (função pronta). Zero mudança visível — só módulo + testes.
- **FASE 3 — Trocar o cabo (kill-switch primeiro).** C2 (flag `leo:params-engine`), depois os
  cabos na ordem da Seção 4: calc-* → alerta PSAP → refluxoPulmonar → C6 (unificar 4 consumidores)
  → params-tbody + #out-* juntos → banco de frases. Rodapé por domínio entra no PDF aqui.
  Contrato da Ponte atualizado a cada cabo. **Cada task de cabo tem smoke de flag OFF = pixel
  igual ao de hoje.**
- **FASE 4 — Sombra com persistência + validação.** C1 (persistência admin-only via Admin SDK —
  sem regra nova; se precisar de leitura client, PARA e confirma com Sergio), sombra das duas
  metades, retroativo sobre o histórico real dos 3 workspaces, janela de acompanhamento com
  exames novos. Critério de saída: **0 divergências inesperadas** + relatório pro Sergio.
- **FASE 5 — Virada + aposentadoria (2 tempos, ambos com confirmação do Sergio).**
  (a) **Virada:** default global `NEXT_PUBLIC_PARAMS_ENGINE=senna93` em produção, kill-switch por
  device vivo, dias de observação com a sombra ainda gravando. (b) **Aposentadoria:** legado sai
  do fluxo (script não é mais injetado), `motorv8mp4.js` deletado (ÚNICA fase com toque no legado
  — revisor dedicado linha-a-linha), shadow-runner morto deletado, Contrato da Ponte encolhe
  (invariantes do legado removidas), kill-switch e flag antiga morrem, e2e estendido
  (`tests/e2e/secao5-roteiro.spec.ts` ganha o roteiro Senna93: tabela pinta por sexo/idade, VIDE,
  PDF params, identificação), teste ao vivo com o Sergio, tríade final adversarial da branch.

**Placar de partida que NENHUMA task pode rebaixar:** unit **251** · api **212** · rules **142** ·
wader **104** · `tsc` e `build` limpos. (Fase 0 SOBE o unit; cada fase registra o novo piso.)

---

## 6. Restrições permanentes (herdadas, valem em toda task)

- `public/motor/motorv8mp4.js` **intocável** até a Fase 5b (leitura livre; qualquer toque =
  revisor dedicado linha-a-linha). Direx intocável.
- Decisão **19b**: zero validação de faixa clínica. Decisão **nº24**: sexo = campo clínico do
  motor (zerado no Limpar; não é identificação).
- NÃO usar `git stash` (daemon `.claude-flow` engole edições). Scripts com efeito:
  `npm run x -- --commit` (com o separador `--`).
- Verificação manual/visual: conta **Gmail** (PJ de teste), NUNCA Yahoo.
- Regra Firestore nova SÓ com confirmação do Sergio (o desenho da sombra evita precisar).
- Camadas das Seções 1-5 não regridem — Contrato da Ponte + roteiro e2e vigiam.
- Dados de paciente identificáveis não entram em prompt de Perplexity/Gemini sem o Sergio decidir.
- Pendências vivas que esta esteira NÃO atropela: visita à clínica (Wader primeiro), imagens:privar
  pós-visita, 4 decisões leves da S5, senha do Orthanc, FEEGOW_API_TOKEN no Vercel.

---

## 7. Itens de veto pontual (defaults JÁ aplicados na spec; Sergio pode virar qualquer um antes da task correspondente)

| # | Item | Default aplicado | Alternativa |
|---|---|---|---|
| V1 | RAVI sem sexo (A14/A15) | JASE 2025 unificado | manter critério por sexo do legado |
| V2 | IMVE limite de HVE (B12) | 115♂/95♀ em tudo (Lang 2015) | manter 102/88 na geometria |
| V3 | Estenose aórtica (B3) | pior grau entre Vmax/grad médio/área | manter precedência por grad máx |
| V4 | Estenose mitral (B2/B19) | **ATUALIZADO 27/08 — ASE/EACVI 2017:** área primária, e **leve é >1,5 direto** (<1,0 importante · ≤1,5 moderada · ≤2,0 leve · >2,0 silêncio). O gradiente médio é confirmatório, não classificatório — a exigência de grad ≥5 na faixa 1,5-2,0 caiu (decisão do cardiologista: "o que dizem as diretrizes"; ACC/AHA 2020 põe >1,5 em Stage B) | manter gradiente-primeiro |
| V5 | Estenose pulmonar (A20) | ASE 2017 valvar (Senna90) | critério congênito do legado (80/50/25) |
| V6 | Tricúspide "restrição" (A21) | só ramos E (Senna90) | alinhar com a mitral (E/F/EF) |
| V7 | Wilkins literal (B10) | ≤7 favorável, texto "(escore < 8)" | 8 passa a favorável ("≤8") |
| V8 | Wilkins componente 0 (B29) | 0 = não avaliado → score null + alerta | 0 vale e soma (comportamento atual) |
| V9 | Wilkins espessura 2/3 (B11) | corrigir pro artigo original | manter textos atuais |
| V10 | Palavra "VIDE" (C4) | mantém "VIDE" (estruturado por dentro) | texto claro ("não medido — DSVE ausente") |
| V11 | Índice cm²/m no arco (A4) | NÃO (sem base em diretriz) | incluir |
| V12 | E/e' na FA (A18) | mantém >15 (decisão sua documentada no código: E/e' SEPTAL isolado) | mudar pra >14 (ASE 2016, régua da média) |
| V13 | Textos novos da F1 (nota cirúrgica ≥50/≥55, frase angio-TC/RM, faixa limítrofe do GLS, esclerose aórtica) | **DECIDIDO no teste ao vivo 27/08 — "o laudo é técnico e DESCREVE; sugestão de conduta é do médico assistente": NENHUMA frase de recomendação no laudo.** Morreram a nota cirúrgica (≥50/≥55) e a frase de angio-TC/RM; o aneurisma da RAIZ passou a imprimir "medindo XX mm" (paridade com a ascendente), a dilatação da raiz segue sem medida. GLS e esclerose aórtica ficam como estão | — (fechado) |
| V14 | Degraus de fronteira exata (B17: "leve a moderado" só no valor exato) | MANTIDOS nos campos em mm (semântica deliberada do V6); só o feT (float) vira banda na granularidade do truncamento (A13) | converter tudo pra faixas contínuas |

Tudo que NÃO está nesta lista segue a Seção 2 sem consulta (evidências fechadas ou recomendação
técnica da tabela 1-a-1 aceita pelo mandato de 26/08).

---

## 8. Adendo — consulta de velocidade/arquitetura (tríade, 27/08)

Pergunta do Sergio: melhorias de velocidade e arquitetura pra emissão. Tríade consultada
(Codex segurança · Ruflo arquitetura · Ponytail simplicidade), pareceres convergentes.

**Fato verificado 27/08:** o repo GitHub (SergioAbdon/souleo) é PÚBLICO e
`public/motor/motorv8mp4.js` é servido aberto em produção — todo o fonte do Senna90 já é
copiável hoje. A decisão de 16/05 "motor no servidor = proteção de IP" (docstring do
`senna90-bridge.ts`) está anulada na prática. Proteção real = **tornar o repo privado**
(decisão do Sergio, independente desta esteira; não apaga clones passados, estanca o futuro).

**P1 — cálculo do Senna93 no navegador (fim do round-trip por edição):**
- Veredito unânime da tríade: correto e viável (motor já é TS puro, isomórfico; não
  bifurca fonte; medidas do paciente DEIXAM de viajar; mata o rate-limit 60/min que
  pode bloquear 2 médicos atrás do mesmo IP de clínica). Recomendação era ADR próprio
  pós-virada.
- **DECISÃO DO SERGIO 27/08: P1 SUSPENSO.** "Estamos na fase de construção do LEO e
  precisamos garantir a propriedade intelectual" — a decisão de 16/05 (motor server-side
  = proteção de IP) está REAFIRMADA e volta a valer de verdade assim que o repo ficar
  privado. O Senna93 continua calculando no servidor. P1 só volta à mesa com decisão
  explícita futura do Sergio, ciente do trade-off IP × latência.
- Mitigação de latência DENTRO do desenho server-side (entra na esteira): consertar o
  rate-limit da rota `/api/laudo/calcular` (por UID com tolerância a burst, não por IP —
  achado Codex) e manter o debounce atual. O round-trip por recálculo fica.
- Pré-requisito barato que ENTRA na F0 mesmo assim: **teste de pureza** — falha se
  qualquer import node-only entrar no grafo de `calcular()` (bom contrato independente
  do P1; não compromete nada).
- **Ganho de IP da própria esteira:** na F5 o `motorv8mp4.js` (hoje servido ABERTO no
  site — é a metade do motor exposta a qualquer visitante) morre. Pós-virada, NENHUM
  código de motor viaja pro navegador — a unificação em si fecha a vitrine.

**P2 — trocar Puppeteer por @react-pdf/renderer:**
- Veredito unânime: **pós-virada, nunca dentro da esteira**. react-pdf não renderiza HTML —
  exigiria reconstruir a MolduraA4 como segunda implementação (desfaz a unificação da S5)
  sobre o documento assinado, sem caminho de replay equivalente ao snapshot de laudos-html/.
  Quando for: esteira própria com PDFs golden + rollback pro Puppeteer. Spike isolado
  (1 tipo de laudo, fora do /api/emitir) é aceitável se o Sergio quiser ver antes.
- **Remendos baratos pro tempo do Emitir, sem trocar gerador** (mini-task própria, fora
  desta esteira, autorização do Sergio): fixar região da function junto do Storage/Firestore
  (1 linha) + reusar a instância do Chromium entre invocações (variável de módulo, sem
  launch/close por chamada).

**Ajustes incorporados ao plano:**
- F0 += teste de pureza do motor (acima).
- F3 += smokes assertáveis SEPARADOS pra identificação (#out-*) e params-tbody (commit
  único mantido, mas falha aponta qual superfície quebrou) += carimbo de proveniência na
  emissão (qual motor/flag gerou o PDF — auditoria e rollback durante o corte).

**Follow-ups de segurança registrados (fora da esteira; Sergio prioriza):**
1. Trava de idempotência no `/api/emitir` — reemissão cobrar é política registrada, mas
   duplo-POST concorrente/retry cobra 2× (só guard de tela hoje). CONFIRMADO no código.
2. Allowlist de recursos externos no HTML que vai ao Puppeteer (hoje carrega qualquer URL).
3. PDF público por URL = decisão de produto de 14/05 MANTIDA (discordância do Codex
   registrada; HTML já é privado desde a S5).

---

## 9. Cronograma estimado (27/08/2026 — pedido do Sergio)

Base de estimativa: velocidade real das esteiras anteriores no ledger (S3 ~2 dias,
S4 ~3, S5 ~4, todas com o mesmo método SDD). "Sessão" = dia de trabalho da esteira;
"corrido" = calendário (inclui janelas de observação que rodam sozinhas). Datas são
ALVO assumindo início imediato e checkpoints do Sergio no ritmo das seções anteriores —
não promessa. Deploys sempre fora do horário da clínica.

| Etapa | Entrega | Esforço | Corrido (alvo) | Gate do Sergio |
|---|---|---|---|---|
| Imediato | Repo privado (ação do Sergio, 1 min) + mini-task Emitir (região, reuso do Chromium, trava anti-cobrança-dupla) | ½ sessão | 27/08 | OK pra mini-task + deploy |
| **F0** Rede de teste | 72 casos no test:unit, ~60 pins novos (aorta×sexo×idade, derivados, TAPSE/GLS/LAVI/RAVI), contrato refluxoPulmonar, teste de pureza | 1 sessão (4-6 tasks) | 27-28/08 | nenhum (sem mudança de comportamento) |
| **F1** Números nas frases | Aorta nova régua + arco, GLS 3 faixas, TAPSE, LAVI/RAVI, diastólica, valvas, Wilkins, massa/IMVE (tasks opus) | 2-3 sessões (10-14 tasks) | 28-31/08 | vetos V1-V11 antes das tasks; checkpoint no fim |
| **F2** Apresentação | refVal/isOOR sexo+idade, VIDE, realce estruturado, rodapé por domínio (módulo pronto, ligado a nada) | 1-1,5 sessão (5-7 tasks) | 01-02/09 | checkpoint |
| **F3** Trocar o cabo | Kill-switch, calc-*, PSAP, 4 consumidores unificados, params+out-* juntos, banco de frases, rate-limit por UID, proveniência | 2-3 sessões (8-10 tasks) | 02-05/09 | teste ao vivo + OK de merge/deploy |
| **F4** Sombra | Código da persistência (1 sessão) + retroativo no histórico + **janela de 7 dias corridos** acumulando exames reais | 1 sessão + espera | 05-12/09 | relatório de divergências; visita à clínica cabe NESTA janela |
| **F5a** Virada | Flag global senna93 em produção + observação | ½ sessão + 3-5 dias corridos | 13-17/09 | OK da virada |
| **F5b** Aposentadoria | Legado removido, contrato encolhe, e2e estendido, TRÍADE FINAL adversarial, teste ao vivo | 1-2 sessões | 17-19/09 | OK final + merge/deploy |

**Totais:** ~9-12 sessões de trabalho · **~3,5 semanas corridas** (as ~2 semanas de
janela F4/F5a são passivas — o sistema trabalha sozinho e a vida continua). O caminho
crítico incompressível é a sombra: encurtá-la é abrir mão da rede de segurança clínica.
Riscos de estouro: achados da sombra (cada divergência inesperada = investigação),
disponibilidade do Sergio pros gates, e a F1 crescer se algum veto virar rediscussão.
