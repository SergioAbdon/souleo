# ADR — Diastologia conforme ASE/EACVI 2016 (+ a regra que muda tudo)

**Data:** 28-29/08/2026 · **Merge:** master `6f74f2b` (--no-ff, 22 arquivos, +1274/−61)
**Origem:** pedido do Sergio 28/08 ("teste todas as combinações do algoritmo do guideline")
**Esteira:** auditoria exaustiva (6,7M combos) → verificação adversarial → 6 tasks SDD
(opus impl + opus revisor adversarial por task, 2 fix waves) → revisão final de branch com
blocker achado e corrigido → re-verificação → merge.
**Placar:** unit **660** · api 228 · rules 142 · wader 104 · tsc/build limpos (partida: 655→611 na fase)

## A REGRA PERMANENTE (28/08, decisão do Sergio)

> "Não existe decisão pessoal — os resultados devem seguir os guidelines; nos cabe apenas
> implementar as recomendações."

Vale para TODA lógica clínica do motor, para sempre. Consequências aplicadas nesta onda:
até teste deliberado (DC29) foi reescrito quando fixava comportamento não-conforme; o
anexo normativo venceu a instrução do controller quando conflitaram (T2b); V12 (E/e'
septal >15) SOBREVIVE porque é o corte sítio-específico do próprio ASE 2016.
Memória: `feedback_guidelines_mandam.md`.

## O que foi corrigido (8 não-conformidades da auditoria + 1 da revisão final)

| # | Defeito (antes) | Agora (ASE 2016) |
|---|---|---|
| D1 | Teichholz baixo atropelava Simpson normal → laudo se contradizia ("FE preservada" + diastólica de FE baixa) | Simpson decide a FE quando presente; Teichholz só na ausência |
| D3 | Sem FE nenhuma caía no ramo de FE baixa e graduava | Sem FE e sem doença miocárdica → algoritmo A (DC29 reescrito) |
| D4/D5 | Contagem fixa: 2/2 positivos saía "Indeterminada"; 1/2 saía "preservados" (falso-normal) | Maioria dos AVALIADOS: >50% gradua · 50% indeterminada · <50% preservados · <2 silêncio |
| T2b | Graduava "Pseudonormal" sem NENHUMA medida de fluxo mitral | Sem E/A não há grau → classe nova "grau não determinado"; E/A consultada na graduação |
| D2/T2c | Ramo de FE baixa graduava com 0-1 critério e sem fluxo | Zona média exige ≥2 dos 3 critérios; empate/insuficiente → Indeterminada; sem E/A não gradua |
| FA | Empate 50% saía "pressão elevada" (sinusal no mesmo empate saía indeterminada) | Empate → FA_INDETERMINADA (critérios LARS/ASE 2025 mantidos) |
| D6/NOVO-2 | Sem sexo, régua masculina CALADA (FE 53 sem sexo ≠ FE 53 feminino) | Dupla concordância: decide só onde ♂/♀ concordam; ambíguo → alerta; SEXO_AUSENTE dispara sempre que a régua da FE é consultada, com mensagem honesta |
| NOVO-1 | Hipertrofia grave sem peso/altura saía "preservados" MUDO | Alerta de tela MASSA_NAO_INDEXAVEL |
| **F1** (revisão final) | Zona média do ramo A graduava pela contagem da Fig-7 → FE preservada ganhava grau PIOR que FE deprimida com os mesmos dados (regressão criada pela própria onda, invisível à sombra) | Graduação da zona média pela maioria dos 3 critérios de pressão (Fig-8), a MESMA régua do ramo B — inversão morta, provada por varredura exaustiva |

## Frases/alertas novos (textos entregues ao Sergio para aval — regra: ele confere o TEXTO, o guideline decide QUANDO sai)

- Achado: **"Disfunção Diastólica do ventrículo esquerdo presente, de grau não determinado."**
- Conclusão: **"Disfunção diastólica do ventrículo esquerdo de grau não determinado."**
- Alerta novo (tela): "Massa do VE calculada mas não indexável — informe peso e altura para o índice de massa."
- Alerta alterado (tela): "Sexo não informado — referências e classificações dependentes de sexo estão suprimidas ou limitadas."

## Prova de segurança

- Bases: 6,7M combinações auditadas; 839.808 re-executadas velho×novo na revisão final:
  17→16 famílias de divergência, TODAS guideline-respaldadas e cobertas pela allowlist
  (F6-T1..T2b + pré-existentes). "Afirma mais que antes" = 3,9% das células, cada família
  com o artigo/figura que a sustenta (Fig 7/Fig 8/§8.2).
- Retroativo real MedCardio (175 exames): voltou às MESMAS 19 divergências explicadas da
  F4 (edições manuais/exame pré-S5), 0 inesperadas novas; números 3.664/0.
- Fronteiras: 26 cortes re-testados, todos do lado certo; nenhuma alterada nesta onda.

## Registrado (não bloqueia; decisões clínicas leves do Sergio)

1. F2: dois flips grandes "afirma normal" (Grau III→preservados quando E/A alto mas
   critérios Fig-7 negativos; Grau I→preservados via D3) — corretos pela diretriz, mas
   trocam afirmação de doença por afirmação de normalidade; exemplos no relatório.
2. Célula convergente E/A ≤0,8 + onda E ausente + maioria negativa: sai Indeterminada
   (conservador); o guideline permitiria Grau I. 3. Split feBaixa/massaAlta na maioria
   negativa sem E/A. 4. Ponto final da frase nova (único j21 com ponto). 5. Modo MANUAL
   da diastólica não tem opção "grau não determinado" (só texto livre). 6. Sombra: em
   exame sinusal o alarme de "sumiço de diastologia" foi absorvido pelos flips legítimos
   (residual documentado; morre com a sombra na F5b — antecipar a F5b). 7. Grau I é
   inalcançável na zona média do ramo A (álgebra provada; ramo mantido por completude,
   sem pin executável — se a regra de entrada mudar, revisar).

## Anexo — revisão da tríade (29/08/2026)

Três achados clínicos/estruturais corrigidos em `fix/diastologia-triade`, mesma regra
permanente ("os resultados seguem os guidelines"):

| # | O que estava errado | Correção |
|---|---|---|
| C-I1 | O achado terminava em "(fluxo mitral não avaliado)", mas 2 das 3 saídas disparam com **E/A medido** — e o laudo imprime esse E/A na linha de cima. O parêntese contradizia a própria folha | Parêntese removido. Frase final: **"Disfunção Diastólica do ventrículo esquerdo presente, de grau não determinado."** Conclusão inalterada |
| C-I2 | Inversão de PRESENÇA entre ramos: mesmos dados (e' 5 · LAVI 40 · sem E/A) davam "disfunção presente" com FE 60 (ramo A) e "Indeterminada" com FE 40 (ramo B) — o ventrículo pior recebia a frase mais branda | Fecha o item 3 do "Registrado": **split por gatilho**. Sem fluxo mitral, `feBaixa` afirma a presença (premissa do Algoritmo B do ASE 2016) → grau não determinado, em maioria+/−/empate/<2. Gatilho só de MASSA (HVE não prova disfunção diastólica) mantém Indeterminada fora da maioria+ |
| C-M3 | Campo `NaN`/`undefined` contava como critério AVALIADO e NEGATIVO (toda comparação com NaN é `false`) — voto silencioso contra a disfunção, e ainda empurrava `avaliados` acima do piso de 2 | Predicado único `medido()` (`Number.isFinite`) nas três contagens: Fig. 8, Fig. 7 e FA |

Zona média (fluxo mitral medido) **não** mudou: empate/insuficiente segue Indeterminada
nos dois ramos — é o pino anti-inversão da revisão final F1, e ele continua verde.

Allowlist da sombra: **nenhuma linha nova**. Os dois braços do flip da C-I2 caem em
matchers que já existiam — o sumiço do grau do legado (Grau I/II, `motorv8mp4.js:370-371`)
pela F6-T1, e a aparição da frase sem graduação pela F6-T2b.
