# LEO Motor — Sub-Fase 1.2: Inventário de Outputs

**Data:** 2026-05-03
**Engine:** `motorv8mp4.js` (1523 linhas)

## 📊 Resumo Quantitativo

| Categoria | Quantidade |
|---|---|
| Valores numéricos calculados (`calc-*`) | 11 |
| Derivados internos (não exibidos) | 2 (aoIdx, idade) |
| Classificações derivadas | 4 (estenMit/Ao/Tric/Pulm) |
| Funções de achados (j*) | ~35 |
| Funções de conclusões | 15 |
| Linhas da tabela de parâmetros | 10 |
| Mecanismos de alerta visual | 6 |

---

## 🧮 Parte 1 — Cálculos Numéricos

| Output | Descrição | Fórmula | Unidade | Inputs |
|---|---|---|---|---|
| `calc-imc` | IMC | `peso / (altura/100)²` | kg/m² | peso, altura |
| `calc-asc` | ASC (DuBois) | `0.0001 · 71.74 · peso^0.425 · altura^0.725` | m² | peso, altura |
| `calc-aoae` | Relação Ao/AE | `b7 / b8` | razão | b7, b8 |
| `calc-vdf` | Vol Diast Final (Teichholz) | `((b9/10)³ · 7) / (2.4 + b9/10)` | ml | b9 |
| `calc-vsf` | Vol Sist Final (Teichholz) | `((b12/10)³ · 7) / (2.4 + b12/10)` | ml | b12 |
| `calc-fe` | FE Teichholz | `(VDF - VSF) / VDF` | % | b9, b12 |
| `calc-fs` | Fração Encurtamento | `(b9 - b12) / b9` | % | b9, b12 |
| `calc-massa` | Massa VE (Devereux mod.) | `(((b9+b10+b11)³ - b9³) · 1.04 · 0.8 + 0.6) / 1000` | g | b9, b10, b11 |
| `calc-im` | Índice Massa VE | `massa / asc` | g/m² | massa, asc |
| `calc-er` | Espessura Relativa | `(b10 + b11) / b9` | razão | b9, b10, b11 |
| `calc-wilkins` | Escore Wilkins | `wkMob + wkEsp + wkCal + wkSub` | pts (0-16) | wk-* (toggle) |

**Internos (não exibidos):**
- `aoIdx` = `b52 / asc` (área aórtica indexada)
- `idade` = anos completos `dtnasc → dtexame`

**Truncagem `T(x,d)`:** o motor TRUNCA (não arredonda). Ex.: 1.999 → 1.99 (com d=2).

---

## 🩺 Parte 2 — Funções de Achados (~35)

Documentação completa em `motorv8mp4.js`. Resumo das principais:

### Câmaras
- `j2` — Ritmo (regular/irregular)
- `j3` — AE pelo diâmetro (sexo-específico, ignorado se b24>0)
- `j4` — AE pelo volume indexado (prioritário sobre j3)
- `j5` — AD pelo volume indexado (sexo-específico → mudará pra unificado JASE)
- `j6` — VE diâmetro (sexo-específico)
- `j7` — VD diâmetro
- `j8` — Síntese de câmaras normais
- `j9` — Espessura miocárdica
- `j10` — Geometria/remodelamento
- `j47` — Conclusão de hipertrofia/remodelamento

### Função Sistólica
- `j11` — FE Teichholz (sexo-específico)
- `j12` — FE Simpson (prioritário, sexo-específico)
- `j13`-`j20` — Paredes do VE (apex + 6 paredes + demais)
- `j23` — Disfunção VD + TAPSE
- `jGLSve`, `jGLSvd` — Strain VE/VD
- `concSistolica` — Conclusão unificada VE+VD
- `concStrainVE`, `concStrainVD` — Conclusões de strain

### Diastologia
- `j21` — Algoritmo principal (sinusal vs FA, retorna sentinela)
- `j21FA_achado` — Wrapper que vira "Avaliação limitada por arritmia"
- `j22` / `j22FA` — Linha detalhada com valores
- `j43` — Conclusão diastológica (Grau I/II/III/Indeterminada/FA)
- `jLARS` — LA strain
- `concLARS` — Conclusão LA strain
- `diastAchado` / `diastConclusao` — Wrappers auto/manual

### Hipertensão Pulmonar
- `j30` — PSAP (b37)
- `j50` — Probabilidade HP (Alta/Intermediária/Baixa)
- `concHP` — Conclusão HP

### Válvulas
- `j24`, `jTricMorf`, `j31`, `jPulmMorf` — Morfologias (15 códigos cada)
- `j25`-`j27` — Gradientes mitrais
- `j28`, `j29`, `j35` — Refluxos (mitral/tric/aórtico)
- `j32`-`j34` — Gradientes aórticos
- `concEstenMit`, `concEstenAo` — Conclusões de estenose
- `jEstenTric`, `jEstenPulm` — Estenoses tric/pulm
- `jRefluxoPulm` — Insuf pulmonar + PMAP
- `jWilkins` — Escore + sentinela `__WILKINS__`

### Outros
- `j36` — Pericárdio
- `j37`-`j39` — Aorta (raiz, ascendente, arco)
- `j40` — Placas/visualização
- `concAorta` — Conclusão aorta consolidada

---

## 📋 Parte 3 — Tabela de Parâmetros (10 linhas × 2 colunas duplas)

| # | Coluna A | Range A | Coluna B | Range B |
|---|---|---|---|---|
| 1 | Sexo | — | IMC | <25 kg/m² |
| 2 | Peso (kg) | — | Relação Ao/AE | — |
| 3 | Altura (cm) | — | Vol Diast final VE | M:62-150 / F:46-106 ml |
| 4 | Raiz Aórtica | M:31-37 / F:27-33 mm | Vol Sist final VE | M:21-61 / F:14-42 ml |
| 5 | Átrio Esquerdo | M:30-40 / F:27-38 mm | FE Teichholz | M:>51% / F:>53% |
| 6 | DDVE | M:42-58 / F:38-52 mm | Fração Encurtamento | 30-40% |
| 7 | Septo IV | M:6-10 / F:6-9 mm | Massa do VE | M:<201 / F:<151 g |
| 8 | Parede Posterior | M:6-10 / F:6-9 mm | Índice Massa VE | M:<103 / F:<89 g/m² |
| 9 | DSVE | M:25-40 / F:21-35 mm | Espessura Relativa | <0.43 |
| 10 | VD | 21-35 mm (M=F) | ASC | — |

**Valores fora do range:** célula recebe classe `alert` (vermelha).

---

## ⚠️ Parte 4 — Alertas Visuais

| Mecanismo | Quando dispara |
|---|---|
| `alertaIT` | b23>0 e b37 vazio (IT preenchida sem PSAP) |
| `refluxoPulmonar` | b40p preenchido → mostra campo `psmap` |
| `wilkins-toggle` | Checkbox abre/fecha bloco Wilkins |
| `diast-manual-panel` | Modo "Manual" exibe seletor de 7 graus |
| `isAlert(txt)` | Regex em achados: marca em vermelho linhas com "Disfunção/Hipertrofia/Ectasia/Insuficiência/Estenose/etc." |
| `isOOR(campo, val, sexo)` | Valor numérico fora do range de referência |

---

## 🔄 Parte 5 — Ordem de Operações

1. **Lê inputs** (DOM via `v(id)` ou `n(id)`)
2. **Calcula derivados** (imc, asc, aoae, vdf, vsf, feT, fs, massa, imVE, er, aoIdx)
3. **Classifica estenoses** (estenMit/Ao/Tric/Pulm)
4. **Renderiza tabela de parâmetros** (10 linhas com isOOR)
5. **Gera achados** (35+ funções j em ordem fixa)
6. **Gera conclusões** (15+ funções em ordem fixa)
7. **Aplica alertas visuais** (alertaIT, isAlert)

**Fallback final:** se conclusão vazia → "Exame ecodopplercardiográfico transtorácico sem alterações significativas."

---

## 🎯 Implicações para a Reescrita TS

Para a reescrita preservar 100% do comportamento:

1. **Implementar `T(x,d)` truncado** (não usar `Math.round`)
2. **Manter ordem EXATA** de geração de achados e conclusões
3. **Preservar TODOS os 35+ templates de texto literais**
4. **Replicar as 4 classificações** (estenMit/Ao/Tric/Pulm) com mesmos thresholds
5. **Manter o mecanismo de sentinelas** (`__WILKINS__`, `FA_*`)
6. **Implementar `isAlert`/`isOOR`** com mesmas regras
7. **Preservar prioridades** (ex: b54 prevalece sobre Teichholz; b24 prevalece sobre b8)
