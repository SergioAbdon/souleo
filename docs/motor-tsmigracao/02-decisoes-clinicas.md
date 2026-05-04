# LEO Motor — Fase 2: Decisões Clínicas

**Data:** 2026-05-03
**Aprovador:** Dr. Sérgio Roberto Abdon Rodrigues (CRM/PA 7952)
**Contexto:** Reescrita do motor JS → TS. Caminho C (ADAPTAR + correções pontuais).

---

## ✅ Inconsistências aprovadas para correção

### 1️⃣ `b27` (Exame Normal) — REMOVER ✅

- **Status atual:** órfão. Lido pelo motor mas sem UI. Sempre retorna `""`.
- **Decisão:** remover do motor TS, do adaptador e da memória interna.
- **Justificativa:** a dedução automática "Exame ecodopplercardiográfico transtorácico sem alterações significativas" cobre o caso quando nenhuma frase é gerada.

---

### 2️⃣ `b21` Renomear coerentemente — APROVADO ✅

- **Status atual:** no `adaptador-motor.js` o ID está rotulado como "tempo_desaceleracao", mas o motor lê como "e' septal" (texto j22 = "Velocidade e' septal=").
- **Decisão:** padronizar como **`eSeptal`** ou similar. Renomear no motor TS, no adaptador e no SidebarLaudo.
- **Justificativa:** elimina confusão clínica e descasamento entre adapter e motor.

---

### 3️⃣ `b24` ↔ `b24_diast` Consolidar — APROVADO ✅

- **Status atual:** UI tem 2 campos espelhados (Câmaras + Diastólica) sincronizados via listener no page.tsx. Frágil.
- **Decisão:** **um único campo** (Vol. AE index) na seção Função Diastólica (onde o JASE classifica como critério de pressão de enchimento).
- **Justificativa:** Vol AE index é parâmetro DIASTÓLICO. Manter o duplicado em Câmaras é desnecessário. Sincronização via listener some — sem fragilidade.

---

### 4️⃣ Mapeamento das paredes b56-b61 — APROVADO ✅

- **Status atual:** descasamento entre adaptador e wallText:
  - Adaptador (`adaptador-motor.js`): `b57`=parede inferior; `b58`=parede lateral; `b59`=parede septal; `b60`=parede posterior; `b61`=VD-segmentar.
  - Motor (`wallText`): `b56`=anterior; `b57`=septal anterior; `b58`=septal inferior; `b59`=lateral; `b60`=inferior; `b61`=inferolateral.
- **Decisão:** padronizar pelo **modelo AHA 17-segmentos**:
  - `b56` → P. Anterior
  - `b57` → P. Septal anterior (anteroseptal)
  - `b58` → P. Septal inferior (inferoseptal)
  - `b59` → P. Inferior
  - `b60` → P. Inferolateral
  - `b61` → P. Lateral (anterolateral)
- **Justificativa:** alinha código + adaptador + AHA + ordem clínica anti-horária aprovada.
- **Impacto:** importação DICOM SR vai mapear corretamente para as paredes corretas.

---

## ⛔ Inconsistências NÃO corrigir (manter como está)

### 5️⃣ Esclerose Aórtica sem texto de conclusão — MANTER ❌

- **Status atual:** quando `b50` está entre 16-26 mmHg, motor classifica como "esclerose aórtica" mas a função `concEstenAo` retorna vazio. Apenas o gradiente aparece em achados (`j32`).
- **Decisão do Dr. Sérgio:** **manter sem frase de conclusão**.
- **Justificativa:** esclerose aórtica não é estenose verdadeira; não merece linha de conclusão. O gradiente isolado no achado já comunica.

---

### 6️⃣ `b25` AD Volume — JASE 2025 unificado (Método dos Discos) ✅

- **Status atual no motor:** limites SEXO-ESPECÍFICOS (♀ ≤27/≤33/≤39 e ♂ ≤32/≤38/≤45).
- **Decisão final:** adotar **JASE 2025 unificado, Método dos Discos**.

| Grau | Cutoff |
|---|---|
| Normal | < 30 ml/m² |
| Aumento leve | 30 – 36 ml/m² |
| Aumento moderado | >36 – 41 ml/m² |
| Aumento importante | > 41 ml/m² |

- **Justificativa:** alinhar com diretriz internacional mais atual; eliminar dimorfismo sexual obsoleto.

### 7️⃣ `b24` AE Volume — JASE 2015 (já alinhado) ✅

- **Status atual no motor:** limites já praticamente alinhados com JASE 2015.
- **Decisão final:** confirmar oficialmente os cutoffs do **JASE 2015 Chamber Quantification**:

| Grau | Cutoff |
|---|---|
| Normal | ≤ 34 ml/m² |
| Aumento leve | 35 – 41 ml/m² |
| Aumento moderado | 42 – 48 ml/m² |
| Aumento importante | > 48 ml/m² |

- **Justificativa:** unificado por sexo (já era), valores mantidos como ASE 2015 (sem alterações em 2025 para LAVI).

---

## 📊 Resumo das decisões

### Decisões originais (auditoria de inconsistências)

| # | Inconsistência | Decisão |
|---|---|---|
| 1 | `b27` órfão | ✅ REMOVER |
| 2 | `b21` mal nomeado | ✅ RENOMEAR para `eSeptal` |
| 3 | `b24` ↔ `b24_diast` duplicado | ✅ CONSOLIDAR (manter só na Diastólica) |
| 4 | Mapeamento paredes b56-b61 | ✅ PADRONIZAR (modelo AHA + ordem aprovada) |
| 5 | Esclerose aórtica sem conclusão | ❌ MANTER (não emitir frase) |
| 6 | AD Vol limites por sexo | ✅ JASE 2025 UNIFICADO (Método dos Discos: <30/30-36/>36-41/>41) |
| 7 | AE Vol cutoffs | ✅ CONFIRMADOS: ASE 2015 (≤34/35-41/42-48/>48) |

### Decisões adicionais (auditoria de fórmulas e referências)

| # | Item | Decisão |
|---|---|---|
| 8 | ASC DuBois — constante | ✅ Trocar 71,74 → **71,84** (DuBois 1916 original) |
| 9 | RWT — fórmula | ✅ Manter `(SIV+PP)/DDVE` (Reichek 1981, válida ASE 2015) |
| 10 | GLS VE — cutoff | ✅ Migrar `-18%` → **-20%** (consenso EACVI/ASE 2024) |
| 11 | Estenose Pulmonar — cutoffs | ✅ Migrar para **ASE 2017 valvular**: leve <36 / moderada 36-64 / severa >64 mmHg |
| 12 | E/e' (b22) — single value | ✅ Manter campo único, renomear label **"E/e' septal"**, cutoff **>15** consistente em ambos contextos (sinusal + FA) |
| 13 | e' septal (b21) — cutoff | ✅ Manter `<7 cm/s` (ASE 2016, e' septal isolado) |
| 14 | Aorta ascendente — equação | ✅ Manter equação única (Devereux 2012, sem dependência etária) |
| 15 | IMC — alerta visual | ✅ Manter sem alerta automático |

**Total: 15 decisões clínicas aprovadas pelo Dr. Sérgio.**

---

## 🔒 Compromissos

- **TODO o restante do comportamento clínico será preservado intacto.**
- Mesmas fórmulas, mesmos thresholds (exceto AD volume), mesmos textos de achados, mesmas conclusões.
- Sistema shadow mode (Fase 5) detectará qualquer divergência não documentada aqui.

---

## ✅ Status: Fase 2 CONCLUÍDA

Todas as decisões clínicas registradas e aprovadas pelo Dr. Sérgio em 03/05/2026.

Pronto para iniciar **Fase 3 — Construção do motor TS**.

## 📚 Referências bibliográficas adotadas

1. **JASE 2015** — *Recommendations for Cardiac Chamber Quantification by Echocardiography in Adults* (LAVI, massa VE, dimensões cavitárias)
2. **JASE 2016** — *Recommendations for the Evaluation of Left Ventricular Diastolic Function* (algoritmo diastológico)
3. **JASE 2017** — *Recommendations for Noninvasive Evaluation of Native Valvular Regurgitation* (refluxos)
4. **JASE 2025** — *Guidelines for the Echocardiographic Assessment of the Right Heart in Adults* (RAVI unificado, TR, HP)

Esses são os padrões médicos para todas as classificações do motor TS.
