# LEO Motor — Sub-Fase 1.7: Lista Consolidada de Inconsistências

**Data:** 2026-05-03
**Auditoria realizada por:** Claude (sub-fases 1.1-1.6)
**Decisões clínicas por:** Dr. Sérgio Roberto Abdon Rodrigues

---

## 📊 Visão geral

Total de **22 pontos** levantados durante toda a auditoria.

| Categoria | Quantidade |
|---|---|
| ✅ Aprovado para corrigir | 11 |
| ❌ Manter como está | 9 |
| ⚙️ Migrado/atualizado | 4 |
| ⚠️ Pendente revisão | 2 |

---

## 🔧 ALTERAÇÕES APROVADAS (11 itens)

### A) Limpeza de código legado e bugs estruturais

| # | Item | Antes | Depois |
|---|---|---|---|
| 1 | `b27` (Exame Normal — campo órfão) | Lido pelo motor mas sem UI; sempre vazio | **REMOVER** completamente |
| 2 | `b21` mal nomeado | Adaptador rotula como "tempo_desaceleracao", motor usa como "e' septal" | **RENOMEAR** para `eSeptal` consistente |
| 3 | `b24` ↔ `b24_diast` duplicado | UI tem 2 campos sincronizados via listener (frágil) | **CONSOLIDAR** num único campo na seção Diastólica |
| 4 | Mapeamento das paredes b56-b61 | Descasamento entre adaptador e wallText | **PADRONIZAR** seguindo modelo AHA 17 segmentos |

### B) Atualização de constantes/cutoffs

| # | Item | Antes | Depois | Justificativa |
|---|---|---|---|---|
| 5 | Constante DuBois (ASC) | 71,74 | **71,84** | Constante original DuBois 1916 |
| 6 | Cutoff GLS VE | -18% | **-20%** | Consenso EACVI/ASE 2024 |
| 7 | RAVI (Vol AD index) — sexo-específico | M ≤32/≤38/≤45/>45; F ≤27/≤33/≤39/>39 | **<30/30-36/>36-41/>41 unificado** | JASE 2025 Right Heart, Método dos Discos |
| 8 | Estenose Pulmonar — cutoffs | 25/50/80 mmHg (adult-congenital) | **<36/36-64/>64 mmHg** | ASE 2017 valvular |

### C) Coerência clínica (cutoffs E/e' septal)

| # | Item | Antes | Depois |
|---|---|---|---|
| 9 | E/e' septal (b22) — label | "Relação E/e'" | **"E/e' septal"** (explicitar) |
| 10 | E/e' septal — cutoff em FA | >14 (era pra ser média) | **>15** consistente em ambos contextos (sinusal + FA) |
| 11 | E/e' — fonte oficial | Inconsistente | **ASE 2016** (E/e' septal isolado >15) |

---

## 🔒 MANTIDO COMO ESTÁ (9 itens)

| # | Item | Status atual | Decisão |
|---|---|---|---|
| 1 | Esclerose aórtica sem conclusão | b50 16-26: classifica mas não emite conclusão | ✅ MANTER (não é estenose verdadeira) |
| 2 | RWT (Espessura Relativa) | (SIV+PP)/DDVE | ✅ MANTER (variante Reichek 1981, ASE aceita) |
| 3 | Aorta ascendente — equação | Única (sem dependência etária) | ✅ MANTER (Devereux 2012) |
| 4 | IMC — alerta visual | Sem highlight automático | ✅ MANTER sem alerta |
| 5 | Cutoffs com igualdade exata (`===`) | Disparam só em valores inteiros exatos | ✅ MANTER (intencional) |
| 6 | Wilkins =8 pontos | Classificado como "limítrofe" | ✅ MANTER (≥9 = não candidato) |
| 7 | Aorta corte etário | `<40` estrito | ✅ MANTER (40 anos exatos = grupo ≥40) |
| 8 | Estenose Aórtica leve por área | Não classifica via b52 (só via gradiente) | ✅ MANTER (apenas gradiente) |
| 9 | GLS VD subclínica | Texto "sugestivo de disfunção subclínica" | ✅ MANTER orientação |

---

## 🔒 RESOLVIDO — Manter como está (10 e 11)

### 12. Estenose Tricúspide — sem grau "leve"

- **Status atual:** motor classifica apenas "moderada" e "importante"
- ✅ **DECISÃO:** MANTER COMO ESTÁ (não adicionar grau leve)

### 13. PDPIP (Pressão Diastólica da Artéria Pulmonar)

- **Status atual:** não existe no motor
- ✅ **DECISÃO:** MANTER SÓ PMAP (não adicionar PDPIP por enquanto)

---

## 📋 Checklist final pra reescrita TS

A reescrita deve:

### Implementação

- [ ] Remover `b27` órfão
- [ ] Renomear `b21` → `eSeptal` (motor + adaptador + UI)
- [ ] Consolidar `b24`/`b24_diast` num único campo
- [ ] Reorganizar mapeamento paredes b56-b61 (AHA 17 segmentos)
- [ ] Trocar constante DuBois 71,74 → 71,84
- [ ] Atualizar cutoff GLS VE para -20%
- [ ] Migrar RAVI para JASE 2025 unificado (<30/30-36/>36-41/>41)
- [ ] Migrar Estenose Pulmonar para ASE 2017 valvular (36/64)
- [ ] Renomear label E/e' → "E/e' septal"
- [ ] Padronizar cutoff E/e' septal >15 (sinusal e FA)

### Preservar comportamento atual

- [x] Cutoffs com igualdade exata
- [x] Wilkins =8 limítrofe
- [x] Aorta corte etário <40
- [x] EAo só por gradiente (não área)
- [x] GLS VD texto subclínico
- [x] Esclerose aórtica sem conclusão
- [x] RWT (SIV+PP)/DDVE
- [x] Aorta ascendente sem dependência etária
- [x] IMC sem alerta

### Pendentes pra Dr. Sérgio decidir

- [ ] Estenose Tricúspide leve — adicionar?
- [ ] PDPIP — implementar campo?

---

## 🎯 Conclusão da Fase 1.7

A auditoria do motor identificou **22 pontos** de atenção. **20 foram decididos definitivamente** (11 alterações + 9 mantidos). **2 ainda dependem de decisão clínica final.**

A reescrita TS preservará 100% do comportamento clínico atual, exceto pelas 11 alterações explicitamente aprovadas.
