# Senna93 — Divergências esperadas (allowlist da sombra, F4)
Cada linha = mudança clínica DELIBERADA da F1 (spec §2). A sombra da F4 trata
divergência que case com estas linhas como esperada; qualquer outra é achado.

| Task | Domínio | O que mudou | Spec |
|---|---|---|---|
| F1-T1 | Aorta | Raiz ♀≥66a: corte 37→38 (WASE) · aneurisma raiz/asc ≥50→≥45 (ACC/AHA 2022) · arco: 3 réguas → ≤40 normal/>40 dilatado sem graus · flag `notaCirurgica` ≥50/≥55 (estruturada, hoje SEM texto no laudo) · alerta AORTA_SEM_IDADE novo | §2.2 |
| F1-T2 | Aorta | "Ectasia"→"Dilatação" nas frases | §2.2 |
| F1-T2 | Aorta | Aneurisma 45-49 passou a carregar índice cm²/m no achado e "com critérios de maior gravidade" na conclusão (I1 da revisão T1 — antes o índice sumia nessa faixa) | §2.2 |
| F3-fix | Aorta | **Frases de sugestão REMOVIDAS por decisão do cardiologista (teste ao vivo 27/08): o laudo é técnico e DESCREVE, conduta é do médico assistente.** Saíram a nota "sugere-se avaliação cirúrgica especializada" (≥50 raiz/asc · ≥55 arco) e a frase "Sugere-se complementação com angiotomografia ou angiorressonância…" (arco dilatado ou 'nv'). Nenhuma frase de recomendação sobra no laudo; a flag `notaCirurgica` fica no cálculo, sem texto | V13 |
| F3-fix | Aorta | Aneurisma da RAIZ passa a imprimir a medida: "Dilatação aneurismática da Raiz aórtica **medindo XX mm**…" (paridade com a ascendente). A DILATAÇÃO da raiz segue sem "medindo" (decisão 16/05 mantida); conclusões inalteradas | V13 |
| F3-fix | Valvas | **Estenose mitral pela diretriz** (decisão do cardiologista 27/08, "o que dizem as diretrizes"): com área presente, <1,0 importante · ≤1,5 moderada · ≤2,0 **leve DIRETO** · >2,0 silêncio. A exigência de gradiente médio ≥5 para fechar "leve" na faixa 1,5–2,0 SAIU — ASE/EACVI 2017 grada pela área (leve >1,5) e usa o gradiente só como confirmatório; ACC/AHA 2020 põe >1,5 em Stage B. Sem área, o gradiente decide como antes | §2.5/V4 |
| F1-T3 | Strain | GLS VE binário 20(achado)/18(conclusão) → 3 faixas 18/16 unificadas; contradição B1 extinta | §2.1 |
| F1-T4 | VD | Texto TAPSE VR ≥20 → >17 (ASE 2025) | §2.1 |
| F1-T5 | Câmaras | LAVI 48: importante → moderado (Lang 2015: grave é >48) | §2.3 |
| F1-T6 | Diastólica | j22 sinusal deixou de imprimir campos vazios ("Relação E/A= ;") | §2.4/B8 |
| F1-T6 | Diastólica | Entrada do algoritmo diastólico mudou: FE-baixa 50→52/54 por sexo (A12) e massa alta 102/88→115/95 (B12) trocam o RAMO da classificação. "Função diastólica do ventrículo esquerdo Indeterminada."/"Índices diastólicos do ventrículo esquerdo preservados" podem **APARECER** onde o texto antigo trazia outra classificação (achado no retroativo de 28/08, exames reais era-senna90). Conclusões atreladas ao ramo (ex. átrio esquerdo) acompanham e ficam explicadas caso a caso — NÃO allowlistadas | §2.1 A12 / §2.3 B12 |
| F1-T7 | Valvas | Mitral: área primária (grad em fluxo baixo não subclassifica mais) · Aórtica: pior grau entre critérios (low-flow-low-gradient deixa de sair "leve") · esclerose ganha achado · estenose tricúspide sempre imprime o gradiente | §2.5 |
| F1-T7 | Valvas | Mitral: área >2,0 SILENCIA grau e conclusão mesmo com gradiente alto — números seguem impressos no achado, grau some (área primária normal; gradiente alto = fluxo/FC). *(A faixa 1,5–2,0 saiu do silêncio em 27/08: virou "leve" direto — ver linha F3-fix abaixo.)* | §2.5/I1 rev |
| F1-T7 | Valvas | Aórtica: gradMax 16-26 + gradMédio >0 troca esclerose silenciosa por "Estenose Aórtica Leve." na conclusão (cria conclusão onde o motor antigo calava) — pauta V13: piso de esclerose no gradMédio? | §2.5/I2 rev |
| F1-T8 | Paredes/valvas | DD imprimia hipocinesia → discinesia · "septal anterior/inferior" com espaço · morfologia AV decide por morfologia (não refluxo) · acentos | §2.5/B4/B9/B21 |
| F1-T9 | Wilkins | componente 0 = não avaliado (score null + alerta, antes somava e imprimia "TOTAL 0 pts") · literal "(escore < 8)" · descrições de espessura 2/3 corrigidas pro artigo | §2.6 |
| F1-T10 | Massa/sistólica | massa +0,6 g (B24) · limite de HVE 102/88→115/95 (Lang 2015) · "apesar da alteração segmentar" só com parede alterada (B5) · conclusão de alteração segmentar isolada passou a existir (B7) · FE Teichholz: fronteiras exatas viram bandas do truncamento (A13) | §2.1/§2.3 |
| F3-T3 | Rodapé/fontes | Rodapé das fontes unificado em `rodapeFontes()` (B20) nos 4 lugares que tinham 3 redações — PDF, Copiar Formatado, Copiar Texto (era "ASE/EACVI 2015; ASE 2025.") e tela do SheetA4 (era a versão longa WASE/ACC-AHA). Todos passam a imprimir a mesma linha por domínio. Vale com a flag OFF (V13) | §2.7 |
| F3-T3 | Tabela (visual) | Realce vermelho do valor fora de referência passa a APARECER — correção B15 parcial (o PDF só ganha o realce na T4/T5, via flags OOR) | B15 |
| F3-fix | Tabela (visual) | Realce **ESCOPADO ao caminho novo** (`#params-tbody[data-engine="senna93"] td.alert`), achado do teste ao vivo 27/08: o `class="alert"` do motor LEGADO sai deslocado 3 linhas (bug antigo que o CSS da T3 tornou visível com a flag OFF). Só `pintarTabelaSenna93` assina o tbody com `data-engine`; com a flag **OFF** o legado pinta sem o atributo e não há realce — status quo de sempre, e o bug do legado morre com ele na F5 | B15 |
| F3-T3fix | Rodapé | 5ª saída (arquivo Word/exportDocx) também usa rodapeFontes() — redação antiga extinta em TODAS as saídas | I1 rev T3 |

## A VIRADA DO CABO (F3-T5) — o que muda quando `senna93Params()` está ON

Com a flag **OFF** nada abaixo acontece: quem pinta `#out-*`, `#calc-*` e
`#params-tbody` continua sendo o motor legado, linha por linha igual a hoje.
Com a flag **ON**, quem pinta é o Senna93 (`pintarTabelaSenna93`) — mesmos nós,
mesma raspagem, formato novo. Célula a célula:

| Task | Domínio | O que mudou | Spec |
|---|---|---|---|
| F3-T5 | Tabela · separador | Decimal com **vírgula** e **truncamento** no lugar de ponto + `toFixed` (arredondava). Ex.: FE Teichholz `70.4%` → `70,3%` | B25 |
| F3-T5 | Tabela · casas | Medidas em mm passam de 1 casa para **0** (`34.0` → `34`). Peso/Altura continuam com 1 casa, agora truncada (`80.45` → `80,4`, era `80.5`) | B25 |
| F3-T5 | Tabela · FE/FS | Como a exibição trunca em vez de arredondar, FE e FS podem sair **1 ponto percentual abaixo** do valor antigo na mesma medida | B25 |
| F3-T5 | Tabela · valores | Deltas de VALOR herdados da F1/F2 aparecem na tabela: Massa do VE `+0,6 g` (B24, ex. `181.3` → `181,9`), ASC pela constante DuBois 71,84 (era 71,74 → ex. `1,91`), FE/imVE calculados sobre os truncados | §2.1/§2.3 |
| F3-T5 | Tabela · linhas | 10 → **12 linhas**: Aorta Ascendente (b28) e Arco Aórtico (b29) passam a ter linha própria | B14 |
| F3-T5 | Tabela · realce | O vermelho passa a acender também na **metade direita** (derivados: IMC, VDF, VSF, FE, FS, massa, imVE, ER) — no legado só a coluna esquerda acendia | B13 |
| F3-T5 | Tabela · referências | VRs corrigidas na V13 aparecem na coluna Referência: FE `≥ 52%` (era `>51%`), Massa `≤ 200 g` (era `<201 g`), Índice de Massa `≤ 115 g/m²` (era `<103 g/m²`) | V13 |
| F3-T5 | Tabela · sexo vazio | Sem sexo, **TODAS** as VRs somem — inclusive as 3 que o legado imprimia incondicionalmente: IMC `<25 kg/m²`, Fração de Encurtamento `30–40%` e Espessura Relativa `<0,43` | C8 |
| F3-T5 | Caixas da sidebar | `calc-*` seguem a mesma vírgula/truncamento (FE/FS mantêm 1 casa + `%` na caixa, contra 0 casas na tabela — divergência do legado preservada) | B25 |
| F3-T5 | Caixa Wilkins | `calc-wilkins` **limpa** quando o escore sai de cena (toggle desligado ou componente 0 → score null). O legado só escrevia, nunca apagava: o "N pts" ficava fantasma na tela | F1-T9 |
| F3-T5 | Identificação | Idade dos `#out-*` passa a vir do cálculo do motor (comparação por string `AAAA-MM-DD`, imune a fuso) em vez de `new Date()` local; plural "N anos"/"1 ano" e datas em pt-BR seguem verbatim. Nome/convênio/solicitante saem **aparados** (trim) | §2.7 |
| F3-T5 | Word (.docx) | Identificação passa a vir dos `#out-*`, como o PDF assinado: data do exame em **pt-BR** (era ISO `2026-08-27`) e campo vazio sai como `—` (era string vazia). Vale com a flag OFF | §2.7 |
| F3-T5 | Alertas | Com a flag ON o `#alerta-psap` legado deixa de ser atualizado (o `alertaIT` não roda mais): quem avisa é a lista estruturada do motor, no topo da sidebar (F3-T2) | F3-T2 |
| F3-T5 | Proveniência | Exame emitido ganha o campo `motorNumeros` (`'senna93'` ou `'legado'`) — aditivo, nenhum consumidor existente muda. **27/08:** gravado dentro da TRANSAÇÃO, junto de `status:'emitido'` (antes ia no update pós-PDF e se perdia quando a geração do PDF falhava — foi o que aconteceu no teste ao vivo) | §2.7 |
| F3-T6 | Emissão · tabela velha | Com ON, a emissão também é bloqueada quando a tabela **está na tela mas ficou velha** — o médico mexeu numa medida e a rodada seguinte da ponte falhou: os números visíveis são os de ANTES da edição. Mesmo toast ("Tabela de medidas não carregou"); sai do bloqueio na primeira rodada que voltar a dar certo (mexer em qualquer campo com a rede de volta) ou com um F5. Com OFF, nada — o motor legado pinta local e síncrono | re-revisão T5, concern 3 |
| F3-T6 | Campo PSMAP | `#field-psmap` (Pressão Sist. Média Art. Pulmonar) passa a ser revelado por função local, não mais pelo motor: aparece/some igual, **com a flag ON e OFF**, e agora funciona também se o `change` acontecer antes do motor terminar de carregar (antes era engolido em silêncio) | F3-T6 |
| F3-T5 | Janela de carga | Com ON a tabela nasce **vazia** e a identificação em `—` até a 1ª volta da ponte (~0,8–1 s após abrir o exame): o motor legado pintava local no `init`, o Senna93 depende do round-trip do servidor. Se a ponte falhar (rede/auth/rate-limit) a tabela **fica** vazia — aparece o toast "Falha ao calcular a tabela…" e a **emissão é bloqueada** ("Tabela de medidas não carregou"), para nenhum laudo ser assinado sem a tabela. Com OFF nada disso existe | revisão I2 |
