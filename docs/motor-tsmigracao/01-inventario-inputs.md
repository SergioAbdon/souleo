# LEO Motor — Sub-Fase 1.1: Inventário de Inputs

**Data:** 2026-05-03
**Engine:** `motorv8mp4.js` (1523 linhas) · Adaptador: `adaptador-motor.js` · UI: `SidebarLaudo.tsx`
**Total de campos:** 68

---

## 👤 Identificação (5 campos)

| ID | Label | Type | Unit | Validação | Required |
|---|---|---|---|---|---|
| `nome` | Nome completo | text | — | livre | sim |
| `dtnasc` | Data de nascimento | date | — | YYYY-MM-DD | usado p/ idade |
| `dtexame` | Data do exame | date | — | YYYY-MM-DD (default hoje) | sim |
| `convenio` | Convênio | text | — | livre | não |
| `solicitante` | Médico solicitante | text | — | livre | não |

---

## 📏 Medidas Gerais (4 campos)

| ID | Label | Type | Unit | Validação | Crítico |
|---|---|---|---|---|---|
| `sexo` | Sexo | select | — | M / F / "" | **SIM** (várias regras dependem) |
| `ritmo` | Ritmo | select | — | S (regular) / N (irregular) | **SIM** (lógica de FA) |
| `peso` | Peso | number | kg | step 0.1 | usado p/ IMC, ASC |
| `altura` | Altura | number | cm | step 0.1 | usado p/ IMC, ASC |

**Calculados (read-only):** `calc-imc`, `calc-asc`

---

## 📐 Câmaras (11 campos)

| ID | Label | Type | Unit |
|---|---|---|---|
| `b7` | Raiz Aórtica | number | mm |
| `b8` | Átrio Esquerdo | number | mm |
| `b9` | DDVE (Diâm. diast. VE) | number | mm |
| `b10` | Septo IV | number | mm |
| `b11` | Parede Posterior | number | mm |
| `b12` | DSVE (Diâm. sist. VE) | number | mm |
| `b13` | Ventrículo Direito | number | mm |
| `b28` | Aorta Ascendente | number | mm |
| `b29` | Arco Aórtico | number | mm |
| `b24` | AE Vol. indexado | number | ml/m² |
| `b25` | AD Vol. indexado | number | ml/m² |

**Calculados:** `calc-vdf`, `calc-vsf`, `calc-fe`, `calc-fs`, `calc-massa`, `calc-im`, `calc-er`, `calc-aoae`

---

## 📊 Função Diastólica (9 campos)

| ID | Label | Type | Unit |
|---|---|---|---|
| `b19` | Onda E | number | cm/s |
| `b20` | Relação E/A | number | — |
| `b21` | e' septal | number | cm/s |
| `b22` | Relação E/e' | number | — |
| `b24_diast` | Vol. AE index (UI duplicada) | number | ml/m² |
| `lars` | LA strain (reservoir) | number | % (VR≥18) |
| `b23` | Vel. IT (refluxo tricuspídeo) | number | m/s |
| `b37` | PSAP | number | mmHg |
| `b38` | ≥2 sinais indiretos de HP? | select | "" / S |
| `diast-manual-sel` | Modo manual diastologia | select | -1 a 6 |

⚠️ **Nota:** `b24_diast` é cópia visual de `b24` (Câmaras). O motor só lê `b24`. Sem sincronização visível.

---

## 🔵 Válvulas (29 campos)

### Morfologia e Refluxos (11)

| ID | Label | Tipo |
|---|---|---|
| `b34` | V. Mitral (morfologia) | select |
| `b35` | Refluxo Mitral | select grau (L/LM/M/MI/I) |
| `b34t` | V. Tricúspide (morfologia) | select |
| `b36` | Refluxo Tricúspide | select grau |
| `b39` | V. Aórtica (morfologia) | select |
| `b40` | Refluxo Aórtico | select grau |
| `b39p` | V. Pulmonar (morfologia) | select |
| `b40p` | Refluxo Pulmonar | select grau |
| `psmap` | PMAP — Pressão Média da Artéria Pulmonar | number mmHg (condicional) |
| `b41` | Derrame Pericárdico | select grau |
| `b42` | Placas Arco Aórtico | select |

### Estenose Mitral (3)

| ID | Label |
|---|---|
| `b45` | Grad. máx. mitral (mmHg) |
| `b46` | Grad. médio mitral (mmHg) |
| `b47` | Área mitral PHT (cm²) |

### Wilkins Score (5, condicional ao toggle)

| ID | Label |
|---|---|
| `wilkins-toggle` | Ativar Wilkins (checkbox) |
| `wk-mob` | Mobilidade (0-4) |
| `wk-esp` | Espessamento (0-4) |
| `wk-cal` | Calcificação (0-4) |
| `wk-sub` | Subvalvar (0-4) |

### Estenose Aórtica (3)

| ID | Label |
|---|---|
| `b50` | Grad. máx. aórtico (mmHg) |
| `b51` | Grad. médio aórtico (mmHg) |
| `b52` | Área aórtica continuidade (cm²) |

### Estenose Tricúspide (2)

| ID | Label |
|---|---|
| `b46t` | Grad. médio tricúspide (mmHg) |
| `b47t` | Área tricúspide (cm²) |

### Estenose Pulmonar (1)

| ID | Label |
|---|---|
| `b50p` | Grad. máx. pulmonar (mmHg) |

---

## 💓 Função Sistólica (5 campos)

| ID | Label | Type | Unit |
|---|---|---|---|
| `b54` | Simpson VE | number | % |
| `b32` | Disfunção VD | select | grau |
| `b33` | TAPSE | number | mm (VR≥17) |
| `gls_ve` | GLS VE | number | % (VR≥-18) |
| `gls_vd` | GLS VD | number | % (VR≥-20) |

---

## 🗺️ Contratilidade Segmentar (8 campos)

| ID | Label | Opções |
|---|---|---|
| `b55` | Região Apical | "" / H / A / D |
| `b56` | P. Anterior | 19 opções (HB/HMB/HM/HMA/HA/H/AB/AMB/AM/AMA/AA/A/DB/DMB/DM/DMA/DA/D) |
| `b57` | P. Septal anterior | idem |
| `b58` | P. Septal inferior | idem |
| `b59` | P. Lateral | idem |
| `b60` | P. Inferior | idem |
| `b61` | P. Inferolateral | idem |
| `b62` | Demais paredes | NL/HD/HR/AD/DD |

---

## 🪦 Órfãos / Legado (1 campo)

| ID | Label | Status |
|---|---|---|
| `b27` | Exame normal | Lido pelo motor (`calcAll` linha 62) mas SEM input no JSX. Sempre retorna `""`. **Pode ser removido.** |

---

## 📊 Resumo

| Seção | Campos |
|---|---|
| Identificação | 5 |
| Medidas Gerais | 4 |
| Câmaras | 11 |
| Função Diastólica | 9 (incl. controle manual) |
| Válvulas — Morfologia | 11 |
| Válvulas — Wilkins | 5 |
| Válvulas — Estenoses | 9 |
| Função Sistólica | 5 |
| Contratilidade Segmentar | 8 |
| Legado | 1 |
| **TOTAL** | **68** |

---

## ⚠️ Observações importantes

1. **Sem validação de range no motor:** o motor não valida se DDVE > 200mm (impossível). Apenas usa thresholds clínicos para gerar texto.

2. **Campos críticos:** `sexo` e `ritmo` impactam dezenas de inferências. Vazios = laudo incompleto.

3. **`b27` pode sair:** referência ao "exame normal" do v6, sem UI atualmente. Remover na reescrita.

4. **`b24_diast` é UI ghost:** parece campo separado mas duplica `b24`. Resolver na reescrita (ou unifica ou diferencia de fato).

5. **Helpers do motor:**
   - `v(id)` → `string` (lê value sem parse)
   - `n(id)` → `number | null` (parseFloat)
