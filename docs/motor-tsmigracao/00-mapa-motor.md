# 🗺️ LEO Motor — Mapa Mestre da Reescrita TS

**Data:** 2026-05-03
**Status:** Fase 1 (Mapeamento) **CONCLUÍDA**
**Aprovador clínico:** Dr. Sérgio Roberto Abdon Rodrigues (CRM/PA 7952)

---

## 📚 Documentos da Fase 1 (sub-fases 1.1 a 1.7)

| Sub | Documento | Conteúdo |
|---|---|---|
| 1.1 | [01-inventario-inputs.md](./01-inventario-inputs.md) | 68 campos de input mapeados |
| 1.2 | [03-inventario-outputs.md](./03-inventario-outputs.md) | 11 cálculos + 35 funções de achados + 15 conclusões |
| 1.3 | [04-formulas-referencias.md](./04-formulas-referencias.md) | Validação contra ASE/EACVI 2015-2025 |
| 1.4 | [05-classificacoes-cutoffs.md](./05-classificacoes-cutoffs.md) | Cutoffs por grau de gravidade |
| 1.5 | [06-achados-templates.md](./06-achados-templates.md) | ~200 templates de texto literais |
| 1.6 | [07-conclusoes-templates.md](./07-conclusoes-templates.md) | 18 funções de conclusão + ordem fixa |
| 1.7 | [08-inconsistencias-consolidadas.md](./08-inconsistencias-consolidadas.md) | 22 pontos auditados, 13 alterações aprovadas |
| Decisões | [02-decisoes-clinicas.md](./02-decisoes-clinicas.md) | 15+ decisões clínicas oficiais |

---

## 📊 Anatomia do motor atual

### Arquitetura

```
Browser (DOM)
  ↓ inputs (68 campos)
motorv8mp4.js (1523 linhas)
  ↓ calcAll() → calcula derivados
  ↓ gerarAchados() → ~35 funções j*
  ↓ gerarConclusao() → ~18 funções
DOM output (achados + conclusões + tabela)
```

### Quantitativos

| Categoria | Total |
|---|---|
| Inputs (campos) | 68 |
| Cálculos numéricos | 11 |
| Classificações por grau | 13 |
| Funções de achados (j*) | ~35 |
| Funções de conclusões | ~18 |
| Templates de texto literais | ~200 |
| Diretrizes médicas referenciadas | 7 (ASE 2015-2025, ESC 2022, ACC/AHA 2020) |

---

## 🩺 Diretrizes médicas adotadas

1. **JASE 2015** — Chamber Quantification (LAVI, massa, cavidades)
2. **JASE 2016** — Diastolic Function
3. **JASE 2017** — Valvular Stenosis
4. **EACVI/ASE 2015** — Speckle Tracking (atualizado 2024)
5. **JASE 2025** — Right Heart (RAVI unificado, TR, HP)
6. **ESC/ERS 2022** — Pulmonary Hypertension
7. **ACC/AHA 2020** — Valvular Heart Disease

---

## ✅ Decisões clínicas finais (Fase 2)

### 13 alterações aprovadas para a reescrita TS

#### Limpeza de código (4)

| # | Alteração |
|---|---|
| 1 | Remover `b27` (órfão) |
| 2 | Renomear `b21` → `eSeptal` |
| 3 | Consolidar `b24`/`b24_diast` num único campo |
| 4 | Padronizar paredes b56-b61 (AHA 17 segmentos) |

#### Atualização de constantes/cutoffs (4)

| # | Alteração |
|---|---|
| 5 | DuBois: 71,74 → **71,84** |
| 6 | GLS VE: -18% → **-20%** (consenso 2024) |
| 7 | RAVI: sexo-específico → **JASE 2025 unificado** (`<30 / 30-36 / >36-41 / >41`) |
| 8 | Estenose Pulmonar: 25/50/80 → **ASE 2017** (`<36 / 36-64 / >64`) |

#### Coerência clínica E/e' (3)

| # | Alteração |
|---|---|
| 9 | Label: "Relação E/e'" → **"E/e' septal"** |
| 10 | Cutoff: **>15 consistente** (sinusal + FA) |
| 11 | Fonte: **ASE 2016** (E/e' septal isolado) |

### 11 itens mantidos como atualmente

1. RWT (SIV+PP)/DDVE — variante Reichek aceita
2. Aorta ascendente — equação única (Devereux 2012)
3. Aorta corte etário <40 estrito
4. IMC sem alerta visual
5. Cutoffs com igualdade exata (`===`)
6. Wilkins =8 = limítrofe
7. EAo leve só por gradiente
8. GLS VD subclínica — texto atual
9. Esclerose aórtica sem conclusão
10. Estenose Tricúspide sem grau leve
11. Sem PDPIP (apenas PMAP)

---

## 🚀 Próxima fase: Fase 3 — Construir motor TS

A reescrita pode começar agora. Plano da Fase 3:

```
Estrutura de pastas: src/motor-ts/

src/motor-ts/
├── types.ts              # Interfaces (MedidasEcoTT, Achado, Conclusao, etc.)
├── helpers/
│   ├── truncate.ts       # T(x,d) — TRUNCAR (não arredondar)
│   ├── format.ts         # fmt(x, d)
│   └── normalize.ts      # parseNumber, parseSelect
├── calculos/
│   ├── demografia.ts     # IMC, ASC, idade
│   ├── ventricle.ts      # VDF, VSF, FE, FS, Massa, IM, ER
│   ├── aorta.ts          # Z-score + fallback
│   ├── valvas.ts         # Classificação de estenoses
│   └── diastologia.ts    # Algoritmo j21 (sinusal + FA)
├── classificacoes/
│   ├── cutoffs.ts        # Cutoffs por sexo/grau
│   ├── refValues.ts      # Tabela de referência
│   └── isOOR.ts          # Out-of-range checker
├── achados/
│   ├── camaras.ts        # j2-j8
│   ├── massa.ts          # j9, j10
│   ├── sistolica.ts      # j11, j12
│   ├── paredes.ts        # j13-j20, wallText
│   ├── diastologia.ts    # j21, j22, j43, jLARS
│   ├── strain.ts         # jGLSve, jGLSvd
│   ├── valvas.ts         # j23-j35, morfologias, estenoses
│   ├── aorta.ts          # j37-j40
│   └── wilkins.ts        # jWilkins (sentinela)
├── conclusoes/
│   ├── orquestrador.ts   # gerarConclusao (ordem dos 18 itens)
│   ├── diastologia.ts    # diastConclusao + j43
│   ├── geometria.ts      # j47
│   ├── sistolica.ts      # concSistolica (10 variantes)
│   ├── valvas.ts         # concEstenMit, concEstenAo, concHP
│   ├── strain.ts         # concStrainVE, concStrainVD, concLARS
│   └── aorta.ts          # concAorta
├── motor.ts              # API pública (calcular, render)
└── shadow-mode.ts        # Sistema de comparação com motor antigo
```

---

## 🛡️ Estratégia de validação (Fases 4-7)

### Fase 4 — Testes automatizados
- 10-20 laudos reais como casos-teste
- Comparação byte-a-byte: motor antigo × motor novo
- Aceitar apenas as 11 alterações aprovadas como divergências legítimas

### Fase 5 — Shadow mode
- Motor TS roda em paralelo, invisível
- Sentry coleta divergências automaticamente
- Painel `/admin/motor-comparison` (opcional)

### Fase 6 — Validação clínica no MedCardio
- Dr. Sérgio usa normalmente por 2 semanas
- Critério de aprovação: 0 divergências em 7 dias com 100+ laudos

### Fase 7 — Cutover
- Motor TS = primário
- Motor JS = fallback emergencial 30 dias
- Aplicação das 11 correções aprovadas
- Botão "🚨 Reverter pro motor antigo" no admin

### Fase 8 — Limpeza
- Remover motor JS antigo (após 30 dias estáveis)
- Tag final: `motor-ts-v1.0`

---

## 📅 Cronograma sugerido

| Fase | Trabalho | Tempo estimado |
|---|---|---|
| ✅ Fase 1 | Mapeamento (sub-fases 1.1-1.8) | 5h (CONCLUÍDA) |
| ✅ Fase 2 | Decisões clínicas | 1h (CONCLUÍDA) |
| Fase 3 | Construir motor TS | 8h |
| Fase 4 | Testes automatizados | 3h |
| Fase 5 | Shadow mode | 3h |
| Fase 6 | Validação MedCardio | 2 semanas (rotina) |
| Fase 7 | Cutover | 1.5h |
| Fase 8 | Limpeza | 1h |
| **TOTAL trabalho** | | **~22h** |

---

## 🎯 Compromissos finais

1. ✅ **Texto literal preservado** (~200 templates)
2. ✅ **Ordem fixa preservada** (achados + conclusões)
3. ✅ **Fórmulas matemáticas idênticas** (truncagem T(x,d))
4. ✅ **Comportamento clínico inalterado** exceto pelas 11 alterações aprovadas
5. ✅ **Diretrizes médicas atualizadas** (JASE 2025, ASE 2024, ASE 2017)
6. ✅ **Sistema reversível em 1 clique** durante validação

---

**A Fase 1 está completa. Pronto para iniciar a Fase 3 (construção do motor TS) quando o Dr. Sérgio aprovar.**
