# Spec da Aorta (raiz / ascendente / arco) + j9 Massa (16/05/2026)

> **Status:** IMPLEMENTADO e VALIDADO no master. Senna90 (flag OFF em produção).
> **Decidido com:** Dr. Sérgio (cardiologista). **Dono:** Claude notebook.
> **Audience:** Clinic Claude + Sérgio futuro.

---

## 1. Contexto

Substitui a antiga classificação aórtica por Z-score com graus
leve/moderada/importante (decisão #16), que superestimava ectasia e
tinha inconsistência Z-score × fallback absoluto. Esta spec reconcilia
e usa **a referência mais recente disponível por segmento**.

## 2. Tiers por segmento — 3 níveis: Normal / Ectasia / Aneurisma

| Segmento | Fonte da fronteira Normal→Ectasia | Aneurisma | Índice cm²/m | "medindo mm" |
|---|---|---|---|---|
| **Raiz** | **WASE 2022** (seio de Valsalva), sexo+idade | ≥ 50 mm | ✅ ≥10 ⇒ gravidade | ❌ (já no quadro) |
| **Ascendente** | **ASE Chamber 2015** — ≤ 36 mm absoluto | ≥ 50 mm | ✅ ≥10 ⇒ gravidade | ✅ |
| **Arco** | **ASE Chamber 2015** — ≤ 36 mm (Chamber não tabula arco) | ≥ 45 mm | ❌ não validado | ✅ |

### Corte da RAIZ — WASE 2022 (média + 1,96·DP = percentil 97,5, critério do paper)

| Faixa etária | ♂ Normal até | ♀ Normal até |
|---|---|---|
| ≤ 40 anos | 38 mm | 35 mm |
| 41–65 anos | 40 mm | 36 mm |
| ≥ 66 anos | 41 mm | 37 mm |

**Sem idade no exame** → cai no Z-score Roman validado (rede de
segurança — nunca quebra, é método ASE-endossado).

### Textos gerados (inalterados da v1 desta spec)

- Raiz ectasia: `Ectasia da Raiz aórtica, Y,Y cm²/m (valores acima de 10 cm²/m sugerem maior gravidade).`
- Raiz aneurisma: `Dilatação aneurismática da Raiz aórtica.`
- Asc ectasia: `Ectasia da aorta ascendente medindo XX mm, Y,Y cm²/m (…).`
- Asc aneurisma: `Dilatação aneurismática da aorta ascendente medindo XX mm.`
- Arco ectasia: `Ectasia do arco aórtico medindo XX mm.`
- Arco aneurisma: `Dilatação aneurismática do arco aórtico medindo XX mm.`
- CONCLUSÃO: 1 frase por segmento. `Ectasia da [seg].` / `…, com critérios de maior gravidade.` (índice ≥10, só raiz/asc) / `Aneurisma da [seg].`
- Frase "com dimensões normais" (fix 07/05) PRESERVADA.

## 3. Referências (decisão FECHADA — não é miscelânia, é a melhor por segmento)

- **Raiz = WASE 2022** (Normal Values of Aortic Root Size, JASE mar/2022,
  PMC9111967). Mais recente, sexo+idade+raça (usamos sexo+idade).
- **Ascendente + Arco = ASE/EACVI Chamber Quantification 2015** (Lang
  et al.). É a diretriz oficial do ASE e a fonte mais recente que
  tabula a ascendente (≤36 mm). WASE 2022 **só tem raiz** — por isso
  cada segmento usa a fonte mais recente que existe **pra ele**.
- **Aneurisma absoluto** ≥50 raiz/asc · ≥45 arco (ACC/AHA 2022, faixa
  cirúrgica esporádica). **Índice área(cm²)÷altura(m) ≥10** ⇒ maior
  gravidade (ACC/AHA 2022; só raiz/asc — não validado p/ arco).

## 4. Honestidade registrada

- **Arco:** ASE Chamber não tabula o arco transverso isolado; o ≤36 mm
  é o número da **ascendente proximal** do Chamber, aplicado ao arco
  por falta de fonte específica. É a fonte mais fraca das três —
  registrado e aceito pelo Dr. Sérgio.
- A provenance antiga ("ascendente ASE 2015 M37/F34") era herança do
  código (Devereux 2012 + fallback rotulado "ASE 2015" da sessão
  07/05), substituída agora pelo Chamber ≤36 mm absoluto.

## 5. Mudanças colaterais

- Conclusão multi-segmento: 1 frase por segmento (lida com tiers mistos).
- Teste B10 (`06-bordas.ts`): asc 50 mm → aneurisma.
- `classificarRaizAo/AoAscendente/ArcoAo` (graus leve/mod/imp)
  continuam existindo (Roman fallback da raiz + comparadores).

## 6. j9 — Massa do VE (não "Espessura") · reaplicado

Cherry-pick limpo `0350307` → `2811dc5`. Texto "Espessura miocárdica"
→ "Massa do ventrículo esquerdo" nos 2 motores + 2 testes. Input e
cutoffs ASE 2015 LV mass inalterados.

## 7. getLimiteSuperior() — alinhado

`isOOR.ts`: b7/b28 corrigidos p/ bater com isOOR (b7: 40/36 · b28: 37/34).

## 8. Arquivos

`calculos/aorta.ts` (corteWaseRaiz + tiers), `achados/aorta.ts`,
`achados/index.ts`, `conclusoes/index.ts`, `classificacoes/isOOR.ts`,
`tests/casos/06-bordas.ts`, motor antigo (j9).

## 9. Validação (com os cortes finais WASE/Chamber)

`tsc --noEmit` exit 0 · **72/72** testes · **24/24** exames reais
(0 vazio, 0 exception). **Impacto clínico observado:** cortes novos
**deixaram de superestimar ectasia** — pacientes com raiz/asc
borderline (ex.: ascendente 34 mm) voltaram a "dimensões normais";
ascendente realmente aumentada (40 mm) segue como ectasia. Flag
Senna90 **OFF** em produção → zero risco até o Dr. Sérgio ligar e
validar na tela.
