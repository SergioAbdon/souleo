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

## 2. Tiers por segmento — Normal / Ectasia / Aneurisma

| Segmento | Fronteira Normal→Ectasia | Aneurisma | Índice cm²/m | "medindo mm" |
|---|---|---|---|---|
| **Raiz** | **WASE 2022** (seio de Valsalva), sexo+idade | ≥ 50 mm | ✅ ≥10 ⇒ gravidade | ❌ (já no quadro) |
| **Ascendente** | **ASE Chamber 2015 Tab.14** — ♂ ≤ 38 · ♀ ≤ 35 mm | ≥ 50 mm | ✅ ≥10 ⇒ gravidade | ✅ |
| **Arco** | **ASE Chamber 2015 Tab.14** — ♂ ≤ 38 · ♀ ≤ 35 mm (mesmo da asc) | ≥ 45 mm | ❌ não validado | ✅ |

### RAIZ — WASE 2022 (média + 1,96·DP = percentil 97,5, critério do paper)

| Faixa etária | ♂ Normal até | ♀ Normal até |
|---|---|---|
| ≤ 40 anos | 38 mm | 35 mm |
| 41–65 anos | 40 mm | 36 mm |
| ≥ 66 anos | 41 mm | 37 mm |

Sem idade no exame → Z-score Roman validado (rede de segurança).

### ASCENDENTE / ARCO — ASE Chamber 2015, Tabela 14 (ascendente proximal)

Média ± DP: **Homem 30 ± 4 mm · Mulher 27 ± 4 mm**.
Limite normal = **média + 2 DP → Homem ≤ 38 mm · Mulher ≤ 35 mm**.
Arco usa o mesmo (Chamber não tabula o arco transverso isolado).

### Textos gerados

- Raiz ectasia: `Ectasia da Raiz aórtica, Y,Y cm²/m (valores acima de 10 cm²/m sugerem maior gravidade).`
- Raiz aneurisma: `Dilatação aneurismática da Raiz aórtica.`
- Asc ectasia: `Ectasia da aorta ascendente medindo XX mm, Y,Y cm²/m (…).`
- Asc aneurisma: `Dilatação aneurismática da aorta ascendente medindo XX mm.`
- Arco ectasia: `Ectasia do arco aórtico medindo XX mm.`
- Arco aneurisma: `Dilatação aneurismática do arco aórtico medindo XX mm.`
- CONCLUSÃO: 1 frase por segmento; `…, com critérios de maior gravidade.` se índice ≥10 (só raiz/asc).
- Frase "com dimensões normais" (fix 07/05) PRESERVADA.

## 3. Referências (decisão FECHADA — melhor por segmento, não miscelânia)

- **Raiz = WASE 2022** (Normal Values of Aortic Root Size, JASE
  mar/2022, PMC9111967). Mais recente, sexo+idade.
- **Ascendente + Arco = ASE/EACVI Chamber Quantification 2015**
  (Lang et al.), **Tabela 14** "Aortic root dimensions in normal
  adults", linha *Proximal ascending aorta* (♂ 3,0±0,4 · ♀ 2,7±0,4 cm).
  WASE 2022 **só tem raiz** → cada segmento na fonte mais recente
  que existe pra ele.
- **Aneurisma absoluto** ≥50 raiz/asc · ≥45 arco (ACC/AHA 2022).
  **Índice área(cm²)÷altura(m) ≥10** ⇒ maior gravidade (só raiz/asc).

## 4. Honestidade registrada

- Versão inicial usou ≤36 mm fixo (fonte secundária). **Corrigido**
  pela Tabela 14 primária do ASE (sexo-específico ♂38/♀35) quando
  o Dr. Sérgio enviou a tabela oficial.
- Arco: Chamber não tabula o arco transverso; usa-se a linha de
  ascendente proximal como proxy. Fonte mais fraca das três —
  registrado e aceito pelo Dr. Sérgio.

## 5. Mudanças colaterais

- Conclusão multi-segmento: 1 frase por segmento.
- Teste B10 (`06-bordas.ts`): asc 50 mm → aneurisma.
- `classificarRaizAo/AoAscendente/ArcoAo` continuam existindo
  (Roman fallback da raiz + comparadores).

## 6. j9 — Massa do VE · reaplicado

Cherry-pick limpo `0350307` → `2811dc5`. "Espessura miocárdica" →
"Massa do ventrículo esquerdo" nos 2 motores + 2 testes. Cutoffs
ASE 2015 LV mass inalterados.

## 7. getLimiteSuperior() — alinhado

`isOOR.ts`: b7/b28 corrigidos (b7: 40/36 · b28: 37/34).

## 8. Arquivos

`calculos/aorta.ts` (corteWaseRaiz + corteChamberAsc + tiers),
`achados/aorta.ts`, `achados/index.ts`, `conclusoes/index.ts`,
`classificacoes/isOOR.ts`, `tests/casos/06-bordas.ts`, motor antigo (j9).

## 9. Validação (cortes finais WASE / Chamber Tab.14 por sexo)

`tsc --noEmit` exit 0 · **72/72** testes · **24/24** exames reais
(0 vazio, 0 exception). Impacto clínico: cortes pararam de
superestimar ectasia; com a correção por sexo, ascendente de 36 mm
em **mulher** (corte 35) sai ectasia, 40 mm em **homem** (corte 38)
sai ectasia — coerente com a Tabela 14. Flag Senna90 **OFF** em
produção → zero risco até o Dr. Sérgio ligar e validar na tela.
