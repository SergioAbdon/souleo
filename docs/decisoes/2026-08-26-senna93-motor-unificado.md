# ADR — Senna93: motor unificado (decisão de direção)

**Data:** 2026-08-26 · **Decisor:** Sergio · **Status:** direção aprovada, levantamento iniciado

## Decisão

A Seção 6 (revisão do motor) tem mandato ampliado: não é só conferir os dois motores,
é CONFERIR PARA UNIFICAR. O motor unificado se chamará **Senna93** — evolução do
Senna90 (que já gera achados/conclusões desde 16/05) absorvendo a metade dos números
que hoje vive no motor legado (`public/motor/motorv8mp4.js`): superfície corporal,
volumes, massa, índices, params-tbody, calc-*, alerta PSAP.

## Ordem acordada (risco controlado)

1. **Leitura** — tríade read-only inventaria TODAS as fórmulas dos dois motores + divergências (zero risco).
2. **1-a-1 com o Sergio** — cada fórmula/divergência decidida pelo cardiologista.
3. **Portar números pro Senna93** — fórmula a fórmula, teste pinando cada referência.
4. **Sombra em produção** — shadow-runner (já existe) compara os dois em exames reais.
5. **Virada + aposentadoria do legado** — kill-switch vive até o fim.

## Ganhos esperados

Um motor só em TS testado; PDF para de raspar números da tela; Contrato da Ponte
encolhe; kill-switch morre ao final. Referências clínicas que valem: cortes fechados
nas sessões de maio (WASE 2022, ASE Chamber, aneurisma ≥50/≥45, índice cm²/m≥10) e a
decisão "Senna90 é a verdade" no b59/b60/b61.
