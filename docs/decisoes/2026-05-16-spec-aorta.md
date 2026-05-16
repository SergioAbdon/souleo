# Spec da Aorta (raiz / ascendente / arco) + j9 Massa (16/05/2026)

> **Status:** IMPLEMENTADO no master. Senna90 atrás de flag (OFF em produção).
> A refVal da tabela de parâmetros (motor antigo) é ALTERADA para a Raiz.
> **Decidido com:** Dr. Sérgio (cardiologista). **Dono:** Claude notebook.

---

## 1. Tiers por segmento — Normal / Ectasia / Aneurisma

| Segmento | Normal (fronteira) | Ectasia | Aneurisma | Índice cm²/m | "medindo mm" |
|---|---|---|---|---|---|
| **Raiz** | **WASE 2022** ♂ 38/40/41 · ♀ 35/36/37 mm (idade ≤40 / 41–65 / ≥66); sem idade → Z-score Roman | > corte e < 50 | **≥ 50 mm** | ✅ ≥10 ⇒ gravidade | ❌ (já no quadro) |
| **Ascendente** | **ASE Chamber 2015 Tab.14** ♂ ≤ 38 · ♀ ≤ 35 mm | > corte e < 50 | **≥ 50 mm** | ✅ ≥10 ⇒ gravidade | ✅ |
| **Arco** | **ACR / ACRIN 6654** ♂ ≤ 35 · ♀ ≤ 32 mm | ♂ 36–43 · ♀ 33–40 mm | **♂ ≥ 44 · ♀ ≥ 41 mm** | ❌ (não validado) | ✅ |

- Corte WASE = média + 1,96·DP (percentil 97,5, critério do paper).
- Arco aneurisma = ≥ 1,5× a média normal ACRIN (♂ ~29→44 · ♀ ~27→41).
- "com dimensões normais" (fix 07/05) PRESERVADA.

## 2. Frases

- Raiz ectasia: `Ectasia da Raiz aórtica, Y,Y cm²/m (valores acima de 10 cm²/m sugerem maior gravidade).`
- Raiz aneurisma: `Dilatação aneurismática da Raiz aórtica.`
- Asc ectasia: `Ectasia da aorta ascendente medindo XX mm, Y,Y cm²/m (…).`
- Asc aneurisma: `Dilatação aneurismática da aorta ascendente medindo XX mm.`
- Arco ectasia: `Ectasia do arco aórtico medindo XX mm.`
- Arco aneurisma: `Dilatação aneurismática do arco aórtico medindo XX mm.`
- CONCLUSÃO: 1 frase por segmento; `…, com critérios de maior gravidade.` se índice ≥10 (só raiz/asc).

## 3. Referências (FECHADAS — melhor por segmento, sem miscelânia)

| O quê | Fonte |
|---|---|
| Raiz (normal) | **WASE 2022** — Normal Values of Aortic Root Size, JASE mar/2022 (PMC9111967) |
| Ascendente (normal) | **ASE/EACVI Chamber Quantification 2015** (Lang et al.), Tabela 14 — asc proximal ♂ 3,0±0,4 · ♀ 2,7±0,4 cm; ULN = média+2DP |
| **Arco (normal/ectasia/aneurisma)** | **ACR / ACRIN 6654** (NLST, rede de imagem do Colégio Americano de Radiologia). Caveats: medida TC borda-externa; população 55–74a (fumantes). Aneurisma pela régua relativa ACR (≥1,5×). |
| Aneurisma raiz/asc (≥50 mm) | ACC/AHA 2022 (faixa cirúrgica esporádica) |
| **Índice área÷altura ≥10 cm²/m** | **ACC/AHA 2022** (dados Yale / Zafar–Elefteriades), validado p/ **raiz + ascendente** — NÃO é do WASE |

## 4. Tabela de parâmetros (motor antigo — `motorv8mp4.js`)

- `refVal('b7',sexo,idade)`: a "Referência" da **Raiz Aórtica** passa a ser
  **dinâmica por sexo + idade** (WASE 2022): exibe `≤ XX mm`. Sem data de
  nascimento → faixa média (♂ ≤40 / ♀ ≤36). Espelhado em `src/` e `public/`.
- `SheetA4.tsx`: rodapé da tabela passa a **citar todas as referências**
  (WASE 2022 / ASE Chamber 2015 / ACR-ACRIN 6654 / ACC-AHA 2022 / demais ASE).
- ⚠️ NÃO mexido (fora de escopo, registrado): a coloração de alerta da
  célula b7 (`isOOR`) ainda usa 32–40/28–36. Avaliar depois com Sérgio.

## 5. j9 — Massa do VE · reaplicado

Cherry-pick `0350307` → `2811dc5`. "Espessura miocárdica" → "Massa do
ventrículo esquerdo" nos 2 motores + 2 testes. Cutoffs LV mass inalterados.

## 6. getLimiteSuperior() — alinhado

`isOOR.ts`: b7/b28 corrigidos (b7: 40/36 · b28: 37/34).

## 7. Arquivos tocados

`src/senna90/calculos/aorta.ts` (tiers + corteWaseRaiz/corteChamberAsc/
corteArcoNormal/corteArcoAneurisma), `achados/aorta.ts`, `achados/index.ts`,
`conclusoes/index.ts`, `classificacoes/isOOR.ts`, `tests/casos/06-bordas.ts`,
`src/motor/motorv8mp4.js` + `public/motor/motorv8mp4.js` (j9 + refVal Raiz),
`src/components/laudo/SheetA4.tsx` (rodapé referências).

## 8. Validação

`tsc --noEmit` + **72/72** testes Senna90 + **24/24** exames reais
(0 vazio, 0 exception). Flag Senna90 OFF → produção inalterada (exceto a
"Referência" da Raiz e o rodapé, que são exibição e foram pedidos pelo
Dr. Sérgio).
