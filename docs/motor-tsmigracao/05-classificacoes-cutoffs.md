# LEO Motor — Sub-Fase 1.4: Classificações com Cutoffs por Grau

**Data:** 2026-05-03

---

## 1. Câmaras

### AE diâmetro (b8) - j3
| Sexo | Normal | Leve | L→M | Moderado | M→I | Importante |
|---|---|---|---|---|---|---|
| M | ≤40 | >40 | =46 | >46 | =52 | >52 |
| F | ≤38 | >38 | =42 | >42 | =46 | >46 |

**Prioridade:** se `b24>0` (volume index AE), j3 é silenciado e só j4 emite texto.

### AE volume index (b24) - j4 — UNIFICADO
| Grau | Cutoff |
|---|---|
| Normal | ≤34 |
| Leve | >34 |
| Moderado | ≥42 |
| Importante | ≥48 |

### AD volume index (b25) - j5 — ATUAL (sexo-específico)
| Sexo | Normal | Leve | Moderado | Importante |
|---|---|---|---|---|
| M | ≤32 | ≤38 | ≤45 | >45 |
| F | ≤27 | ≤33 | ≤39 | >39 |

⚠️ **A reescrita TS vai migrar pra JASE 2025 unificado** (Decisão #6): <30 / 30-36 / >36-41 / >41

### DDVE (b9) - j6
| Sexo | Normal | Leve | L→M | Moderado | M→I | Importante |
|---|---|---|---|---|---|---|
| M | ≤58 | >58 | =63 | >63 | =68 | >68 |
| F | ≤52 | >52 | =56 | >56 | =61 | >61 |

### VD diâmetro (b13) - j7 — UNIFICADO
| Normal | Leve | L→M | Moderado | M→I | Importante |
|---|---|---|---|---|---|
| ≤35 | >35 | =42 | >42 | =50 | >50 |

---

## 2. Função Sistólica

### FE Teichholz (j11)
| Faixa | M | F |
|---|---|---|
| Preservada | >0,52 | >0,54 |
| Limítrofe | =0,52 | =0,54 |
| Leve | <0,52 | <0,54 |
| Leve-Mod | =0,40 | =0,40 |
| Moderada | <0,40 | <0,40 |
| Mod-Imp | =0,30 | =0,30 |
| Importante | <0,30 | <0,30 |

### FE Simpson (j12) — Prevalece sobre Teichholz
| Faixa | M | F |
|---|---|---|
| Preservada | ≥52 | ≥54 |
| Leve | <52 | <54 |
| Leve-Mod | =40 | =40 |
| Moderada | <40 | <40 |
| Mod-Imp | =30 | =30 |
| Importante | <30 | <30 |

### Disfunção VD (b32)
Qualitativo — 5 graus (L/LM/M/MI/I)

### TAPSE (b33)
- VR ≥17mm (texto), VR ≥20mm (no laudo)
- Apenas informativo, sem classificação automática

### GLS VE (jGLSve) — Atualizar para -20% (Decisão #10)
- ≥|18%| preservado / <|18%| reduzido (atual)
- **Após reescrita:** ≥|20%| preservado / <|20%| reduzido

### GLS VD (jGLSvd)
- ≥|20%| preservado / <|20%| reduzido

---

## 3. Função Diastólica

### Algoritmo j21 — Ritmo Sinusal

**Critérios diretos (sempre antes da contagem):**
- E/A ≥2 → **Grau III** (restritivo)
- E/A ≤0,8 + E ≤50 cm/s → **Grau I** (alteração de relaxamento)

**Pré-condição: FE baixa OU IMVE alto:**
- FE <50 ou IMVE >115 (M) / >95 (F)

**Score de critérios (FE preservada + massa normal):**
- e' septal <7
- E/e' >15 (atual; após decisão #12 será **>15** consistente)
- IT >2,8 m/s
- LAVI >34 ml/m²

| Critérios alterados | Resultado |
|---|---|
| ≤1 | Função preservada |
| =2 | **Indeterminada** |
| ≥3 | Classify (G I/II/III conforme E/A e E/e') |

### Algoritmo j21 — Fibrilação Atrial

Critérios:
- E/e' >14
- IT >2,8 m/s
- LAVI >34 ml/m²
- LARS <18%

| Disponíveis / Elevados | Resultado |
|---|---|
| <2 disponíveis | FA_INDETERMINADA |
| ≥2 elevados | FA_PRESSAO_ELEVADA |
| <2 elevados | FA_PRESSAO_NORMAL |

### LARS (LA Reservoir Strain)
- ≥18% preservado / <18% reduzido

### Probabilidade HP (j50)
| Vel IT | Sinais HP (b38) | Resultado |
|---|---|---|
| >3,4 | qualquer | **Alta probabilidade** |
| ≥2,9 | Sim/Presente | **Alta** |
| ≥2,9 | Não/vazio | **Intermediária** |
| <2,9 | Sim/Presente | **Intermediária** |
| <2,9 | Não/vazio | **Baixa** |

---

## 4. Massa e Geometria VE

### Massa absoluta (j9)
| Sexo | Normal | Leve | L-M | Moderada | M-I | Importante |
|---|---|---|---|---|---|---|
| M | ≤200 | >200 | =227 | >227 | =254 | >254 |
| F | ≤150 | >150 | =171 | >171 | =193 | >193 |

### IMVE + ER → Geometria (j10/j47)
- Limites IMVE: M >102 g/m² · F >88 g/m²
- Limite ER: 0,42

| ER | IMVE | Diagnóstico |
|---|---|---|
| ≤0,42 | normal | Normal |
| >0,42 | normal | Remodelamento concêntrico |
| ≤0,42 | aumentado | Hipertrofia excêntrica |
| >0,42 | aumentado | Hipertrofia concêntrica |

---

## 5. Aorta

### Por Z-score (com ASC) — `_classificarAorta`
Predito em cm: `a + b·ASC`

| Segmento | Idade | Predito | SD |
|---|---|---|---|
| Raiz | <40 | 1,50 + 0,95·ASC | 0,19 |
| Raiz | ≥40 | 1,92 + 0,74·ASC | 0,19 |
| Ascendente | qualquer | 1,47 + 0,91·ASC | 0,22 |
| Arco | qualquer | 1,26 + 0,61·ASC | 0,20 |

| Z-score | Classificação |
|---|---|
| ≤2 | Normal |
| 2-3 | Ectasia leve |
| 3-4 | Ectasia moderada |
| >4 | Ectasia importante |

### Fallback (sem ASC)
| Segmento | Sexo | Normal | Leve | Moderada | Importante |
|---|---|---|---|---|---|
| Raiz | M | ≤37 | ≤42 | ≤49 | >49 |
| Raiz | F | ≤33 | ≤40 | ≤47 | >47 |
| Asc | M | ≤34 | ≤39 | ≤48 | >48 |
| Asc | F | ≤31 | ≤36 | ≤43 | >43 |
| Arco | M=F | ≤30 | ≤35 | ≤41 | >41 |

---

## 6. Estenoses Valvares

### Mitral (calcEstenMit)
**Prioridade 1 — Gradiente médio (b46):**
| Cutoff | Grau |
|---|---|
| >10 | Importante |
| ≥5 | Moderada |
| >0 | Leve |

**Prioridade 2 — Área PHT (b47):**
| Cutoff | Grau |
|---|---|
| <1,0 | Importante |
| <1,5 | Moderada |
| ≤2,0 | Leve |

### Aórtica (calcEstenAo)
**Prioridade 1 — Gradiente máximo (b50):**
| Cutoff | Grau |
|---|---|
| ≥64 | Importante |
| ≥36 | Moderada |
| ≥27 | Leve |
| ≥16 | Esclerose (sem texto de conclusão) |

**Prioridade 2 — Gradiente médio (b51):**
| Cutoff | Grau |
|---|---|
| >40 | Importante |
| ≥20 | Moderada |
| >0 | Leve |

**Prioridade 3 — Área (b52):**
| Cutoff | Grau |
|---|---|
| <1,0 | Importante |
| <1,5 | Moderada |

### Tricúspide (calcEstenTric)
| Critério | Importante | Moderada |
|---|---|---|
| Gradiente médio (b46t) | >7 | ≥5 |
| Área (b47t) | <1,0 | ≤1,5 |

Pega o pior grau entre os 2 critérios.

### Pulmonar — ATUAL: gradiente máximo (b50p)
| Cutoff | Grau |
|---|---|
| ≥80 | Importante |
| ≥50 | Moderada |
| ≥25 | Leve |

⚠️ **A reescrita TS vai migrar pra ASE 2017** (Decisão #11):
- <36 leve / 36-64 moderada / >64 severa

---

## 7. Refluxos Valvares (qualitativos)

5 graus possíveis para todos:
- L = Leve
- LM = Leve a moderada
- M = Moderada
- MI = Moderada a importante
- I = Importante

Aplicado em: Mitral (b35), Tricúspide (b36), Aórtico (b40), Pulmonar (b40p)

---

## 8. Wilkins Score (jWilkins)

4 critérios × 0-4 pts = total 0-16

| Total | Recomendação |
|---|---|
| ≤7 | **Favorável** para valvuloplastia mitral percutânea |
| =8 | **Limítrofe** |
| ≥9 | **NÃO candidato** a valvuloplastia |

⚠️ **Verificar:** o briefing original mencionava "9-11 limítrofe / ≥12 contraindicado", mas o código atual classifica TUDO ≥9 como contraindicado. Decisão clínica do Dr. Sérgio.

---

## 9. Outras Classificações

### Derrame Pericárdico (b41) - qualitativo (5 graus)
### Placas Arco Aórtico (b42) - binário (sim / não visualizado)
### Morfologia valvar (b34, b34t, b39, b39p) - 15 combinações cada
### Contratilidade segmentar (b55-b62) - 18 padrões cada

---

## 🚨 Achados que merecem decisão clínica do Dr. Sérgio

1. **Igualdades exatas (`===`)** em câmaras, FE, massa: só disparam em valores inteiros exatos. **Risco:** valores com decimais não caem nos graus "leve a moderado" / "moderado a importante". Exemplo: AE de 46.5mm não vira "leve a moderado". É intencional?

2. **Wilkins =8:** atual é "limítrofe" (não favorável). Confirmar se está correto.

3. **Aorta idade <40 vs ≥40:** o cutoff é estrito (`<40`). Pacientes com 40 anos exatos caem na fórmula ≥40. Confirmar se intencional ou bug.

4. **Estenose Aórtica leve por área:** não há cutoff de "leve" via b52. Só moderada e importante. Em casos clínicos onde área >1.5 mas <2, o motor não emite. Confirmar.

5. **Função preservada GLS VD com strain anormal:** se VD normal (sem b32) + GLS<20%, motor diz "disfunção subclínica". Em pacientes assintomáticos, esse texto pode ser excessivo. Confirmar.
