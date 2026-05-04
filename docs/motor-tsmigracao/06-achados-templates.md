# LEO Motor — Sub-Fase 1.5: Templates de Geração de Achados

**Data:** 2026-05-03

Documento completo com TODAS as frases literais que o motor produz para achados (findings).

---

## 📊 Resumo

- **35+ funções** de geração de achados (j2-j50, jWilkins, jLARS, jGLSve, jGLSvd, jTricMorf, jEstenTric, jPulmMorf, jEstenPulm, jRefluxoPulm)
- **~200 templates de texto literais** mapeados
- Texto exato preservado para garantir 100% paridade na reescrita TS

---

## Documento completo

[Tabela completa salva separadamente — ver versão extensa]

### Resumo das seções:

1. **Câmaras** (j2-j8): Ritmo, AE, AD, VE, VD + síntese
2. **Massa e Geometria** (j9-j10): Espessura miocárdica + padrão geométrico
3. **Função Sistólica** (j11-j12): FE Teichholz + Simpson
4. **Paredes** (j13-j20 + wallText): Apex + 6 paredes + demais
5. **Diastologia** (j21, j21FA, j22, j22FA, j43, jLARS): Sentinelas FA + sinusal
6. **Strain** (jGLSve, jGLSvd): Templates VE/VD
7. **VD Sistólica** (j23): Disfunção + TAPSE combinados
8. **Mitral** (j24-j28): Morfologia (15 padrões), gradientes, refluxo
9. **Tricúspide** (j29, jTricMorf, jEstenTric): Refluxo, morfologia, estenose
10. **Aórtica** (j30-j35): PSAP, morfologia, gradientes, refluxo
11. **Pulmonar** (jPulmMorf, jEstenPulm, jRefluxoPulm): Morfologia, estenose, refluxo
12. **HP** (j50): 5 níveis de probabilidade
13. **Wilkins** (jWilkins): Sentinela + 3 frases por score
14. **Pericárdio** (j36): 5 graus + ausência
15. **Aorta** (j37-j40): Raiz, ascendente, arco, placas

### Detalhes-chave:

- **Sentinelas FA** (`FA_PRESSAO_ELEVADA`, `FA_PRESSAO_NORMAL`, `FA_INDETERMINADA`, `FA_SEM_DADOS`)
- **Sentinela Wilkins** (`__WILKINS__{json}` → renderização especial)
- **Sufixo TAPSE** (`. TAPSE= {b33} mm (VR ≥ 20 mm).`) anexado ao texto de disfunção VD
- **Frases de "preservado"** só aparecem quando regras específicas atendidas (ex: j28 só diz "Fluxo AV preservado" se sem b35, b36, b45-b47, b34t, estenTricGrau)
- **Combinatória aorta** (j37): 8 textos possíveis dependendo de quantos segmentos (raiz/asc/arco) estão alterados

---

## ✅ Implicações para a reescrita TS

A reescrita TS deve preservar:
1. **Texto literal** de cada template (espaços, pontuação, emojis se houver)
2. **Ordem** das verificações (importante para `if/else if/else`)
3. **Sentinelas** (`__WILKINS__`, `FA_*`) — comportamento especial na renderização
4. **Combinações** (j8 síntese, j28/j35 fluxo preservado, j37 aorta combinada)

Comparação automática (Fase 4) garantirá que cada um dos ~200 templates produz texto idêntico ao motor original.
