# LEO Motor — Sub-Fase 1.6: Templates de Geração de Conclusões

**Data:** 2026-05-03

---

## 📋 Ordem das Conclusões no Laudo (CRÍTICO)

A sequência abaixo é clínica e **não pode ser alterada** sem modificar o laudo:

```
1.  Diastologia (diastConclusao → j43 ou texto manual)
2.  Hipertrofia/Remodelamento VE (j47)
3.  Sistólica unificada VE+VD (concSistolica)
4.  Insuf Mitral (b35)
5.  Insuf Tricúspide (b36)
6.  Insuf Aórtica (b40)
7.  Estenose Mitral (concEstenMit)
8.  Estenose Tricúspide (estenTricGrau inline)
9.  Estenose Aórtica (concEstenAo)
10. Estenose Pulmonar (estenPulmGrau inline)
11. Insuf Pulmonar (b40p)
12. Hipertensão Pulmonar (concHP = j50)
13. Pericárdio (b41)
14. Aorta (concAorta)
15. Placas (b42 = 's')
16. Strain VE (concStrainVE)
17. Strain VD (concStrainVD)
18. Strain Atrial (concLARS)

→ Se lista vazia: "Exame ecodopplercardiográfico transtorácico sem alterações significativas."
```

---

## 🧬 Sumário das funções de conclusão

| # | Função | Linhas | Templates |
|---|---|---|---|
| 1 | `diastConclusao` (wrapper) | 873-885 | Auto: chama j43 / Manual: 6 sentenças |
| 2 | `j43` | 555-570 | 9 ramos (FA + sinusal) |
| 3 | `j47` | 571-578 | 3 textos + silêncio |
| 4 | `concSistolica` | 583-634 | **10 variantes** combinando dilatação × disfVE × disfVD × Simpson |
| 5 | Insuf Mitral inline | 1006-1007 | 5 graus |
| 6 | Insuf Tricúspide inline | 1008-1009 | 5 graus |
| 7 | Insuf Aórtica inline | 1010-1011 | 5 graus |
| 8 | `concEstenMit` | 637-644 | 3 graus |
| 9 | Estenose Tricúspide inline | 1015-1016 | 2 graus (mod/imp) |
| 10 | `concEstenAo` | 646-653 | 3 graus + silêncio (esclerose) |
| 11 | Estenose Pulmonar inline | 1019-1021 | 3 graus |
| 12 | Insuf Pulmonar inline | 1023 | 5 graus |
| 13 | `concHP = j50` | 410-416 | 5 níveis (Alta/Inter/Baixa) |
| 14 | Pericárdio inline | 1025 | 5 graus |
| 15 | `concAorta` | 977-996 | 1 segmento (4 textos) ou 2-3 segmentos (combinado) |
| 16 | Placas inline | 1028 | 1 texto (s) |
| 17 | `concStrainVE` | 661-678 | 3 cenários |
| 18 | `concStrainVD` | 680-691 | 2 cenários (silencia se VD alterado) |
| 19 | `concLARS` | 693-706 | 2 cenários (silencia se diast alterada) |
| 20 | Fallback | 1033 | "Exame sem alterações significativas" |

---

## 🎯 Regras importantes

### Concorrência (silêncio inteligente)

Algumas funções **silenciam quando outra já cobriu o tema**:

- `concStrainVD` → silencia se b32 (disfunção VD) preenchido (concSistolica já tratou)
- `concLARS` → silencia se diastologia anormal (j43 já tratou)
- `concAorta` → consolida 1-3 segmentos em UMA frase (nunca duplica)

### Prefixo dilatação

`concSistolica` adiciona "Miocardiopatia Dilatada com..." sempre que VE>limVE OR VD>35mm.

### Formatação visual

- **Numeração:** 1, 2, 3... sequencial via `renderConcLinha(txt, num)` 
- **Sem highlight vermelho:** `isAlert` só se aplica aos achados, NÃO às conclusões
- Cada item tem: número + texto editável + handle de arraste + botão remover
- Botão "+ Adicionar item" no final pra inserção manual

### Modo manual diastologia

Quando ativado:
- Prevalece sobre cálculo automático
- `diastDivergencia()` detecta inconsistência e alerta no UI
- Texto livre (`_diastManualTextoLivre`) é repassado verbatim

---

## 📐 Detalhamento `concSistolica` (a função mais complexa — 10 variantes)

Limites: DDVE M=58/F=52; FE Simpson M=52%/F=54%; FE Teich. M=0,52/F=0,54; VD>35mm

| Caso | Texto |
|---|---|
| Normal (sem disfunção, sem dilatação) | "" (silêncio) |
| Dilatado sem disfunção | "Miocardiopatia Dilatada com função sistólica preservada." |
| disfVE + disfVD não dilatado | "Disfunção sistólica biventricular." |
| disfVE + disfVD dilatado | "Miocardiopatia Dilatada com Disfunção sistólica biventricular." |
| disfVE só, Simpson preservado, dilatado | "Miocardiopatia Dilatada com função sistólica do ventrículo esquerdo preservada, apesar da alteração contrátil segmentar." |
| disfVE só, Simpson preservado, não dilatado | "Alteração contrátil segmentar do ventrículo esquerdo." |
| disfVE só, Simpson reduzido, não dilatado | "Disfunção sistólica do ventrículo esquerdo." |
| disfVE só, Simpson reduzido, dilatado | "Miocardiopatia Dilatada com Disfunção sistólica do ventrículo esquerdo." |
| disfVD só, não dilatado | "Disfunção sistólica do ventrículo direito." |
| disfVD só, dilatado | "Miocardiopatia Dilatada com Disfunção sistólica do ventrículo direito." |

---

## ✅ Implicações para a reescrita TS

A reescrita deve preservar:

1. **Ordem dos 18 itens** (diastologia → ... → strain atrial)
2. **Texto literal** de cada conclusão
3. **Lógica de silêncio inteligente** (concStrainVD/LARS quando outra função cobriu)
4. **Prefixo "Miocardiopatia Dilatada com..."** quando aplicável
5. **Combinação aorta** (1 segmento mostra grau, 2-3 lista sem grau)
6. **Fallback "exame sem alterações significativas"** quando tudo vazio
7. **Sem highlight visual nas conclusões** (apenas achados)
8. **Numeração sequencial** começando em 1
9. **Modo manual diastologia** com texto livre + alerta de divergência
