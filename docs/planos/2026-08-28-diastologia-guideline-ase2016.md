# Diastologia conforme ASE/EACVI 2016 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.
> Tasks bite-sized; 1 implementador opus + 1 revisor adversarial opus por task.

**Goal:** Eliminar as 8 não-conformidades da diastologia (D1-D6 + NOVO-1/NOVO-2 + empate
da FA) confirmadas pela auditoria adversarial, seguindo a REGRA PERMANENTE do Sergio
(28/08): **"não existe decisão pessoal — os resultados seguem os guidelines; nos cabe
apenas implementar as recomendações."** Até teste deliberado (DC29) se reescreve quando
contraria a diretriz.

**Anexo normativo:** `docs/planos/2026-08-28-auditoria-diastologia-ase2016.md` (auditoria
6,7M combos + adendo da verificação adversarial — TODAS as reproduções exatas de entrada
→ saída estão lá; os testes novos usam AQUELES valores). Guideline: ASE/EACVI 2016
(Nagueh) — Algoritmo A (FE preservada: e' septal <7 · E/e' septal >15 [sítio-específico,
= V12] · LAVI >34 · IT >2,8; >50% positivos = disfunção, 50% = indeterminada, <50% =
normal) · Algoritmo B (FE deprimida/doença miocárdica: E/A ≤0,8 + E ≤50 → GI · E/A ≥2 →
GIII · zona média → 2-3 dos critérios E/e'/IT/LAVI, maioria decide, empate/insuficiente
= indeterminada).

## Global Constraints

- Placar-piso: unit **611** · api **228** · rules 142 · wader 104 · tsc/build limpos.
- Arquivos-alvo: `src/senna90/calculos/diastologia.ts`, `src/senna90/achados/diastologia.ts`,
  `src/senna90/motor.ts` (alertas), testes em `src/senna90/tests/casos/` e `tests/unit/`.
  `public/motor/motorv8mp4.js` INTOCÁVEL. Direx intocável.
- REGRAS PERMANENTES: "o laudo DESCREVE, não recomenda" (nenhuma frase de conduta — alertas
  estruturados de TELA podem orientar preenchimento, frase de LAUDO não); guidelines mandam
  (esta esteira); decisão 19b (zero validação de faixa) segue — silenciar/alertar por dado
  AUSENTE não é validar faixa.
- **Toda mudança de frase = linha nova no md da allowlist + matcher** (tripwire da T2-F4
  força os dois juntos; os pins `refsMd.length === 38` e o count-assert sobem juntos).
- Frases de laudo novas/alteradas: texto exato citado no report da task (o Sergio confere
  o texto; a REGRA de quando sai é do guideline).
- Sexo ausente: postura C8 da casa — o dependente-de-sexo SILENCIA + alerta; régua
  masculina calada é proibida.
- Cada task: TDD com os valores de reprodução do anexo; casos DC existentes que fixavam
  comportamento não-conforme são REESCRITOS com comentário citando a regra 28/08.
- Commits/pushes por task na branch `feat/diastologia-ase2016` (a partir da master
  67bca3c). Merge+deploy no fechamento (produção já roda as frases — o fix vai ao ar).

## Estado do código (âncoras)

`calculos/diastologia.ts`: ~:86-95 seleção de ramo (`limFEsimpson 52/54`, `limFEteich`,
`feBaixa` com `else if` que deixa Teichholz atropelar Simpson [D1], `massaAlta` imVE
115/95, `feVide` → ramo simplificado [D3]); ramo completo com contagem fixa `c===2` →
Indeterminada / `c<=1` → preservados [D4/D5] e regra "≥2 campos" que não cobre n=2;
ramo simplificado sem suficiência [D2]; ramo FA com suficiência correta mas `elevados>=2`
fixo [empate]. `motor.ts:119-131` SEXO_AUSENTE exige medida de CÂMARA [D6/NOVO-2].
DC29 em `src/senna90/tests/casos/07-diastologia-completa.ts:613-635` fixa o D3.

---

### Task 1 — Seleção de ramo: Simpson manda; sem FE não é "FE baixa" (D1 + D3) — opus

**Regra do guideline:** o algoritmo B é para FE DEPRIMIDA ou doença miocárdica. FE de
referência = Simpson quando disponível (método recomendado); Teichholz só decide na
AUSÊNCIA do Simpson. FE indisponível (nem Simpson nem Teichholz) NÃO é evidência de FE
baixa → sem outro critério de doença miocárdica (massaAlta), segue o algoritmo A.

- [ ] TDD com as reproduções do anexo: (a) Simpson 60 + DDVE 55/DSVE 42 (feT 0,467) +
  diástole normal → **"Índices diastólicos preservados"** (hoje: Grau I; e mata a
  contradição com "FE preservada" impressa); (b) Simpson ausente + feT 0,467 → ramo B
  continua (Teichholz decide sozinho — conforme); (c) sem Simpson, sem DDVE/DSVE
  (`feVide`) + diástole normal → algoritmo A → preservados (hoje: Grau I); (d) `feVide` +
  massaAlta → ramo B (doença miocárdica ainda seleciona).
- [ ] Reescrever **DC29** (07-diastologia-completa.ts:613-635): expectativa nova =
  algoritmo A; comentário: `// Reescrito 28/08/2026 — regra permanente do Sergio:
  "os resultados seguem os guidelines". feVide não é FE baixa (ASE 2016: algoritmo B
  exige FE deprimida OU doença miocárdica).`
- [ ] Bateria + commit `fix(diastologia): Simpson vence Teichholz na selecao de ramo (D1) e feVide sem doenca miocardica vai ao algoritmo A (D3, DC29 reescrito)`.

### Task 2 — Ramo completo: maioria dos DISPONÍVEIS, não contagem fixa (D4 + D5) — opus

**Regra do guideline (Algoritmo A):** entre os critérios AVALIADOS: >50% positivos →
disfunção presente (gradua); exatamente 50% → indeterminada; <50% → normal. Menos de 2
avaliados → insuficiente (silêncio, spec §2.4 — hoje já coberto; manter).

- [ ] TDD com as reproduções do anexo: (a) IT 2,9(+) + LAVI 34,1(+), 2 avaliados 2
  positivos → **gradua** (hoje: Indeterminada); (b) e' 6(+) + IT 2,9(+) + LAVI 34(−) +
  E/A 2,2 → 2/3 positivos → gradua, e com E/A ≥2 o padrão é **restritivo (Grau III)**
  (hoje: Indeterminada); (c) e' 6(+) + E/e' 12(−), empate 1/2 → **Indeterminada** (hoje:
  preservados — o falso-normal D5); (d) 1 avaliado → silêncio (regra ≥2 intacta);
  (e) 4 avaliados 1 positivo (<50%) → preservados (conforme, não regride).
- [ ] Atenção do revisor: fronteiras `>`/`≥` não mudam (26 conferidas na auditoria);
  só a SEMÂNTICA da contagem muda.
- [ ] Bateria + commit `fix(diastologia): algoritmo A por maioria dos criterios avaliados — empate=indeterminada, 2/2 e 2/3 graduam (D4/D5)`.

### Task 3 — Ramo simplificado com suficiência + empate da FA (D2 + FA) — opus

**Regra (Algoritmo B):** regras DIRETAS ficam como estão (E/A ≥2 → GIII; E/A ≤0,8 +
E ≤50 → GI — não exigem critério adicional). ZONA MÉDIA (E/A ≤0,8 + E >50, ou
0,8 < E/A < 2): exige ≥2 dos 3 critérios (E/e', IT, LAVI) avaliados; maioria positiva →
GII; maioria negativa → GI; empate ou <2 avaliados → **indeterminada** (nunca GI por
falta de dado). **FA:** manter critérios atuais (LARS/ASE 2025 — diretriz mais nova é
guideline também); corrigir SÓ o empate: `elevados/avaliados` por maioria — empate →
FA_INDETERMINADA (hoje empate 2/4 sai "pressão elevada" enquanto o sinusal no mesmo
empate sai indeterminada).

- [ ] TDD (anexo): (a) FE 40 + E/A 1,2 + E 80, zero critérios → **indeterminada** (hoje
  GI); (b) idem + LAVI 40(+) + E/e' 8(−), empate → indeterminada (hoje GI); (c) FE 40 +
  E/A 1,2 + E/e' 20(+) + LAVI 40(+) → GII (conforme); (d) FE 40 + E/A 2,2 → GIII direto
  (sem exigência extra — não regride); (e) FA com E/e' 20(+) + IT 2,9(+) + LAVI 30(−) +
  LARS 25(−), empate 2/4 → **FA_INDETERMINADA** (hoje: pressão elevada); (f) FA 3/4
  elevados → pressão elevada (maioria, não regride).
- [ ] Bateria + commit `fix(diastologia): zona media do algoritmo B exige >=2 criterios e empate=indeterminada (D2); empate da FA unificado por maioria`.

### Task 4 — Sexo ausente e massa não-indexável: silêncio honesto + alerta (D6 + NOVO-1 + NOVO-2) — opus

**Regra da casa (C8) + guideline:** régua dependente de sexo NÃO roda calada com default
masculino. Zona decidível sem sexo continua decidindo (FE <52 é baixa em AMBAS as réguas;
FE ≥54 normal em ambas; imVE >115 alto em ambos; ≤95 normal em ambos). Zona AMBÍGUA
(FE [52,54) · imVE (95,115]) sem sexo → tratar como não-avaliável para o gatilho + alerta.

- [ ] Gatilhos: `feBaixa`/`massaAlta` com sexo ausente usam a régua de DUPLA concordância
  (baixo/alto só se for baixo/alto nas duas réguas; zona ambígua → null/não dispara).
- [ ] `SEXO_AUSENTE` (motor.ts): gatilho passa a incluir campos diastológicos/FE quando
  alguma régua dependente de sexo seria consultada; mensagem corrigida para a verdade:
  `'Sexo não informado — referências e classificações dependentes de sexo estão
  suprimidas ou limitadas.'` (texto exato no report pro Sergio conferir).
- [ ] NOVO-1: alerta estruturado novo `MASSA_NAO_INDEXAVEL` quando massa (b9+b10+b11)
  calculável e imVE null (peso/altura ausentes): `'Massa do VE calculada mas não
  indexável — informe peso e altura para o índice de massa.'` — alerta de TELA
  (orienta preenchimento; NÃO é frase de laudo, regra "descreve não recomenda" intacta).
  Com o alerta, `massaAlta=false` silencioso deixa de ser mudo.
- [ ] TDD (anexo): sexo '' + Simpson 53 + diástole normal → SEM "Grau I" fantasma, COM
  alerta (hoje: preservados sem alerta, e com F viraria GI); imVE 100 sem sexo → gatilho
  não dispara + alerta (hoje: régua ♂ calada); SIV/PP 16 + DDVE 50 sem peso →
  MASSA_NAO_INDEXAVEL presente (hoje: "preservados" mudo); FE 40 sem sexo → feBaixa
  dispara (baixo nas duas réguas — decidível).
- [ ] Bateria + commit `fix(diastologia): sexo ausente sem regua masculina calada (dupla concordancia + alerta corrigido, D6) + alerta MASSA_NAO_INDEXAVEL (peso/altura ausentes)`.

### Task 5 — Allowlist, spec e prova retroativa (fechamento documental) — opus

- [ ] `docs/planos/2026-08-27-senna93-divergencias-esperadas.md`: UMA linha nova por
  mudança de frase observável (ref `F6-diast` ou continuação do padrão — conferir o
  formato que o tripwire extrai `F[0-9]-\w+`; usar `F6-T1..T4` com Domínio Diastológica)
  + matchers correspondentes em `src/lib/shadow/allowlist.ts` (DIRECIONAIS onde couber,
  como o precedente A12/B12). Pins do teste de cobertura (38 → N) sobem juntos.
- [ ] Spec anotada (`docs/superpowers/specs/2026-08-27-senna93-unificacao.md` §2.4):
  registrar a regra 28/08 ("guidelines mandam") e os deltas — supersede o texto antigo
  onde conflitar, no padrão das anotações V13/V4.
- [ ] Rodar `npm run shadow:retroativo -- --ws LDRtedkanx3bUvxpdmiL --from 2026-01-01`
  (ENSAIO) e colar no report o delta de frases: os flips novos devem cair TODOS nas
  linhas novas da allowlist; qualquer inesperada nova = investigar antes do merge.
- [ ] Bateria completa final + commit `docs(diastologia): allowlist +flips ASE2016, spec anotada (regra guidelines-mandam), retroativo ensaio`.

## Fechamento (controller)

1. Bateria completa (nenhum piso rebaixado; unit sobe).
2. Revisão final da branch (opus) — foco: nenhuma frase de conduta nova, fronteiras
   intactas, DC-cases reescritos citando a regra, coerência entre os 3 ramos.
3. Merge master + deploy (produção recebe — informar o Sergio do horário) + smoke em
   produção com 2-3 reproduções do anexo.
4. Ledger, ADR (`docs/decisoes/`), Obsidian, memória.
