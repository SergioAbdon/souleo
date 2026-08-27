# Senna93 — Divergências esperadas (allowlist da sombra, F4)
Cada linha = mudança clínica DELIBERADA da F1 (spec §2). A sombra da F4 trata
divergência que case com estas linhas como esperada; qualquer outra é achado.

| Task | Domínio | O que mudou | Spec |
|---|---|---|---|
| F1-T1 | Aorta | Raiz ♀≥66a: corte 37→38 (WASE) · aneurisma raiz/asc ≥50→≥45 (ACC/AHA 2022) · arco: 3 réguas → ≤40 normal/>40 dilatado sem graus · notaCirurgica ≥50/≥55 · alerta AORTA_SEM_IDADE novo | §2.2 |
| F1-T2 | Aorta | "Ectasia"→"Dilatação" nas frases · nota cirúrgica ≥50/≥55 nova · frase angio-TC/RM nova (arco dilatado ou 'nv') | §2.2 |
| F1-T2 | Aorta | Aneurisma 45-49 passou a carregar índice cm²/m no achado e "com critérios de maior gravidade" na conclusão (I1 da revisão T1 — antes o índice sumia nessa faixa) | §2.2 |
| F1-T3 | Strain | GLS VE binário 20(achado)/18(conclusão) → 3 faixas 18/16 unificadas; contradição B1 extinta | §2.1 |
| F1-T4 | VD | Texto TAPSE VR ≥20 → >17 (ASE 2025) | §2.1 |
| F1-T5 | Câmaras | LAVI 48: importante → moderado (Lang 2015: grave é >48) | §2.3 |
| F1-T6 | Diastólica | j22 sinusal deixou de imprimir campos vazios ("Relação E/A= ;") | §2.4/B8 |
| F1-T7 | Valvas | Mitral: área primária (grad em fluxo baixo não subclassifica mais) · Aórtica: pior grau entre critérios (low-flow-low-gradient deixa de sair "leve") · esclerose ganha achado · estenose tricúspide sempre imprime o gradiente | §2.5 |
| F1-T7 | Valvas | Mitral: área >2,0 (ou 1,5-2,0 sem grad ≥5) SILENCIA grau e conclusão mesmo com gradiente alto — números seguem impressos no achado, grau some (área primária normal; gradiente alto = fluxo/FC) | §2.5/I1 rev |
| F1-T7 | Valvas | Aórtica: gradMax 16-26 + gradMédio >0 troca esclerose silenciosa por "Estenose Aórtica Leve." na conclusão (cria conclusão onde o motor antigo calava) — pauta V13: piso de esclerose no gradMédio? | §2.5/I2 rev |
| F1-T8 | Paredes/valvas | DD imprimia hipocinesia → discinesia · "septal anterior/inferior" com espaço · morfologia AV decide por morfologia (não refluxo) · acentos | §2.5/B4/B9/B21 |
| F1-T9 | Wilkins | componente 0 = não avaliado (score null + alerta, antes somava e imprimia "TOTAL 0 pts") · literal "(escore < 8)" · descrições de espessura 2/3 corrigidas pro artigo | §2.6 |
| F1-T10 | Massa/sistólica | massa +0,6 g (B24) · limite de HVE 102/88→115/95 (Lang 2015) · "apesar da alteração segmentar" só com parede alterada (B5) · conclusão de alteração segmentar isolada passou a existir (B7) · FE Teichholz: fronteiras exatas viram bandas do truncamento (A13) | §2.1/§2.3 |
| F3-T3 | Rodapé/fontes | Rodapé das fontes unificado em `rodapeFontes()` (B20) nos 4 lugares que tinham 3 redações — PDF, Copiar Formatado, Copiar Texto (era "ASE/EACVI 2015; ASE 2025.") e tela do SheetA4 (era a versão longa WASE/ACC-AHA). Todos passam a imprimir a mesma linha por domínio. Vale com a flag OFF (V13) | §2.7 |
| F3-T3 | Tabela (visual) | Realce vermelho do valor fora de referência passa a APARECER (`#params-tbody td.alert`): o motor legado sempre emitiu `class="alert"` na coluna esquerda, mas CSS nenhum existia — correção B15 parcial, visível JÁ com a flag OFF (o PDF só ganha o realce na T4/T5, via flags OOR) | B15 |
