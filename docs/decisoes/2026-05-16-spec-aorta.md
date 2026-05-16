# Spec da Aorta (raiz / ascendente / arco) + j9 Massa (16/05/2026)

> **Status:** IMPLEMENTADO no master. Senna90 (flag OFF em produção).
> **Decidido com:** Dr. Sérgio (cardiologista). **Dono:** Claude notebook.
> **Audience:** Clinic Claude + Sérgio futuro.

---

## 1. Contexto

Decisões clínicas tomadas em conversa, **não commitadas** (mesmo padrão
do layout e do j9). Substituem a antiga classificação aórtica por
Z-score com graus leve/moderada/importante (decisão #16), que tinha
**inconsistência** Z-score × fallback absoluto. Esta spec reconcilia.

## 2. Regra final — 3 tiers por segmento

| Segmento | Normal | Ectasia | Aneurisma | Índice cm²/m | "medindo XX mm" |
|---|---|---|---|---|---|
| **Raiz** | ≤ corte (idade+sexo) | corte → < 50 mm | ≥ 50 mm | ✅ ≥10 ⇒ gravidade | ❌ (já no quadro de parâmetros) |
| **Ascendente** | ≤ corte (idade+sexo) | corte → < 50 mm | ≥ 50 mm | ✅ ≥10 ⇒ gravidade | ✅ sim |
| **Arco** | 22–36 mm (fixo) | 37–44 mm | ≥ 45 mm | ❌ (não validado p/ arco) | ✅ sim |

### Textos gerados

**COMENTÁRIOS:**
- Raiz ectasia: `Ectasia da Raiz aórtica, Y,Y cm²/m (valores acima de 10 cm²/m sugerem maior gravidade).`
- Raiz aneurisma: `Dilatação aneurismática da Raiz aórtica.`
- Asc ectasia: `Ectasia da aorta ascendente medindo XX mm, Y,Y cm²/m (valores acima de 10 cm²/m sugerem maior gravidade).`
- Asc aneurisma: `Dilatação aneurismática da aorta ascendente medindo XX mm.`
- Arco ectasia: `Ectasia do arco aórtico medindo XX mm.`
- Arco aneurisma: `Dilatação aneurismática do arco aórtico medindo XX mm.`
- (sem altura disponível → cai na variante sem índice, sem crash)

**CONCLUSÃO** (uma frase por segmento alterado, concatenadas):
- `Ectasia da [segmento].` ou `Ectasia da [segmento], com critérios de maior gravidade.` (se índice ≥ 10 — só raiz/asc)
- `Aneurisma da [segmento].`

## 3. Fundamentação literária

- **Aneurisma ≥ 50 mm (raiz/asc):** ACC/AHA 2022 — faixa cirúrgica
  esporádica (≥50–55 mm). É ~1,5× o normal pra quase todo adulto.
  Substituto absoluto, simples, reprodutível, sem Z no texto.
- **Arco ≥ 45 mm:** arco normal ~22–36 mm; ≥45 mm ≈ 1,5× o normal do
  arco (definição clássica de aneurisma). Menor que 50 mm da raiz/asc
  porque o arco é um segmento menor. **Sem índice** — o índice
  área/altura (Yale; ACC/AHA) é validado só p/ raiz/ascendente.
- **Índice ≥ 10 cm²/m:** ACC/AHA 2022 (área transversal cm² ÷ altura m).
  Gatilho de "maior gravidade" cravado em **≥ 10** (no 10,0 já conta).
- **Mulher / incerteza:** não cravar grau; descrever + indexar +
  informar; clínico decide. Aplicado com consistência no arco.

## 4. ⚠️ Interpretação que precisa do aval do Sérgio

**"corte (idade+sexo)" do limite normal→ectasia (raiz/asc):** mantive
o **método VALIDADO existente** — Z-score Roman/Devereux (idade+sexo+ASC),
fallback ASE 2015 por sexo (raiz M 32–40 / F 28–36; asc M 30–37 / F
27–34). **NÃO inventei** uma tabela WASE por década (não tenho os
números autoritativos na mão — fabricar corte clínico é inaceitável).
É age+sex como pedido, é o que já estava validado (72/72 + 24 reais).
**Se o Sérgio tinha uma tabela WASE específica na tela, é só trocar a
fronteira normal — o resto da spec não muda.**

Efeito real observado nos 24 exames: ascendente de 34 mm pode sair
"Ectasia" se o Z-score (porte do paciente) indicar — é o comportamento
"referenciado por idade e sexo" funcionando, não bug.

## 5. Mudanças colaterais (registradas)

- **Conclusão multi-segmento:** antes `Ectasia X da aorta (raiz, asc)`;
  agora **uma frase por segmento** (tier próprio + gravidade). Mais
  fiel à spec; lida com tiers mistos (ex.: raiz ectasia + asc aneurisma).
- **Teste B10** (`06-bordas.ts`): asc 50 mm — esperado mudou de
  "Ectasia" → **"Aneurisma da aorta ascendente." / "Dilatação
  aneurismática … medindo 50 mm"** (≥50 = aneurisma na spec nova).
- **Frase "com dimensões normais" PRESERVADA** (fix 07/05/2026 intacto).
- `classificarRaizAo/AoAscendente/ArcoAo` e graus leve/mod/imp
  **continuam existindo** (usados internamente p/ a fronteira normal e
  por comparadores) — só o TEXTO e o tiering do laudo mudaram.

## 6. j9 — Massa do VE (não "Espessura") · reaplicado

Commit `0350307` (preservado) **cherry-pick limpo no master** (`2811dc5`).
Input = massa (g) intacto; texto "Espessura miocárdica" → "Massa do
ventrículo esquerdo" nos DOIS motores (antigo + Senna90) + 2 testes.
Cutoffs ASE 2015 LV mass inalterados (H ≤200/227/254/≥255 · M
≤150/171/193/≥194 g). Ver `project_sessao_07maio` / commit 0350307.

## 7. getLimiteSuperior() — alinhado

`isOOR.ts`: helper interno estava com cutoff aórtico antigo
(`b7: 37/33`, `b28: 34/31`). Corrigido p/ bater com o `isOOR`
autoritativo (07/05): **b7: 40/36 · b28: 37/34**. Impacto clínico
baixo (só direção alto/baixo do alerta), mas elimina inconsistência.

## 8. Arquivos

| Arquivo | Mudança |
|---|---|
| `src/senna90/calculos/aorta.ts` | + camada de tiers (`tierRaizAo/AoAscendente/ArcoAo`, `indiceAortaAltura`, `SegmentoAortaResult`) |
| `src/senna90/achados/aorta.ts` | reescrito p/ spec (comentários por tier/segmento; normais preservado) |
| `src/senna90/achados/index.ts` | call sites passam `m.gerais.altura`; `jArcoAortico(b29,sexo)` |
| `src/senna90/conclusoes/index.ts` | `concAorta` por segmento; `montarD` ganha `altura` |
| `src/senna90/classificacoes/isOOR.ts` | `getLimiteSuperior` b7/b28 |
| `src/senna90/tests/casos/06-bordas.ts` | B10 → aneurisma |

## 9. Validação

`tsc --noEmit` exit 0 · **72/72** testes Senna90 · **24/24** exames
reais (0 vazio, 0 exception). Flag Senna90 **OFF** em produção →
zero risco; vira ativo só quando o Sérgio ligar e validar na tela.
