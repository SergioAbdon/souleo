# Senna93 — Mapa de consumidores + Sombra em produção (leitura read-only)

**Data:** 2026-08-26 · **Papel:** CONSUMERS-AND-SHADOW reader (read-only) ·
**Mandato:** `docs/decisoes/2026-08-26-senna93-motor-unificado.md` (passo 1 — Leitura).
**Contrato de referência:** `docs/decisoes/2026-08-22-contrato-ponte-tela-motor.md` (8 contratos).

Zero escrita em código ou Firestore. As queries de produção rodaram via
`node --env-file=.env.local` com o padrão de `scripts/secao1/lib-admin.mjs`
(scripts temporários, apagados após uso — não ficaram no repo).

---

## A) CONSUMER MAP

### A1. `#params-tbody` — 4 consumidores, 2 caminhos

O motor legado (`motorv8mp4.js`) escreve linhas de parâmetros (medida/valor/
unidade/referência) em `<tr>` dentro de `#params-tbody`. Desde a S5-T13 existe
UM raspador central, `lerParamsDoDOM()` (`src/app/laudo/[id]/page.tsx:1420`),
que faz `querySelectorAll('#params-tbody tr')` e devolve `string[][]`
(`textContent` cru, não `innerHTML`).

A partir daí, **4 consumidores** se dividem em 2 caminhos:

| Consumidor | Linha (page.tsx) | Caminho | Onde imprime |
|---|---|---|---|
| `gerarPdfHtml()` | 1433, chama `montarParamsHtml(lerParamsDoDOM(), p1, {pdf:true})` | compartilhado (`src/lib/pdf-params.ts`) | PDF assinado |
| `handleCopiarFormatado()` | 1561, `montarParamsHtml(..., {pdf:false})` | compartilhado (`pdf-params.ts`) | Copiar Formatado (prontuário) |
| `handleCopiarTexto()` | 1603, `lerParamsDoDOM().forEach(...)` | **bespoke**, formatação própria (texto puro) | Copiar Texto |
| `handleBaixarWord()` | 1628, `lerParamsDoDOM().filter/map(...)` | **bespoke**, formatação própria (docx) | Baixar Word |

`pdf-params.ts` (`montarParamsHtml`) é puro, sem import `@/`, testado direto
(`tests/unit/pdf-params.test.mjs`) — a extração da S5-T13 unificou os dois
templates quase-idênticos que existiam antes (PDF e Copiar Formatado), mas
**não** tocou nos outros dois consumidores (Copiar Texto, Baixar Word), que
continuam raspando o DOM com formatação própria. São **2 pontos extras que a
task original não citava** e que também quebram se o formato de saída mudar.

Shape esperado: `string[][]` de 8 colunas por linha (2 blocos de
parâmetro/valor/unidade/referência lado a lado — ver `colgroup` em
`pdf-params.ts:52`).

### A2. `calc-*` — 10 ids, tela-only, NENHUM scraper

IDs existentes em `SidebarLaudo.tsx`: `calc-imc`, `calc-asc`, `calc-vdf`,
`calc-vsf`, `calc-fe`, `calc-fs`, `calc-massa`, `calc-im`, `calc-er`,
`calc-aoae`, mais `calc-wilkins` (texto do escore, distinto do bloco
`__WILKINS__`). Todos escritos por `motorv8mp4.js` via `getElementById`
direto (não pelo adapter/Senna90).

Busquei por esses 10 ids em `page.tsx` inteiro (`gerarPdfHtml`,
`handleCopiarFormatado`, `handleCopiarTexto`, `handleBaixarWord`) — **zero
ocorrências**. Confirmação: `calc-*` é **puramente tela** — nunca vai pro
PDF, pro copiar-formatado, pro copiar-texto nem pro Word. É o único grupo do
contrato de saída sem consumidor de impressão. Migração pra Senna93 é a de
**menor risco de regressão visível ao usuário** (o pior caso é o painel
lateral mostrar `—` até o cabo ser trocado).

### A3. `#alerta-psap` / `alertaIT`

O motor legado define `alertaIT()` (`motorv8mp4.js:1099`), mas
**page.tsx sobrescreve `window.alertaIT` inteiramente** (`page.tsx:728-733`)
com uma reimplementação React que lê `#b23`/`#b37` direto e usa
`style.display` (não `classList.toggle`, que o motor usava e que quebrava
com o container virando TipTap — achado da revisão S5). Ou seja: a versão
do motor legado nunca roda de fato em produção — apenas a função global é
chamada (via `sc()` em `page.tsx:618` e onde mais `calcFn()` roda), mas o
CORPO que executa é o override do React. `#alerta-psap` em si é um `<div>`
JSX em `SidebarLaudo.tsx:425`.

Consumidor: nenhum além da tela (não vai pro PDF/copy — é um aviso
transitório de preenchimento).

### A4. Superfície `window.*` — cobertura do Contrato da Ponte vs. o que falta

O ADR de 22/08 (item 6, "Contrato de janela") lista explicitamente:
`window.calc`, `window.setDiastModo`, `window._onLaudoGerado`, a sentinela
`window.__WILKINS__`. Fui ao código conferir a superfície REAL chamada por
`page.tsx` e achei mais do que o contrato documenta:

| Global | Direção | Onde é definido | Onde é chamado | No Contrato da Ponte? |
|---|---|---|---|---|
| `window.calc` | motor → tela dispara | `motorv8mp4.js` (IIFE) | `page.tsx:546,773,810` (`calcFn`) | Sim (item 6 e 7) |
| `window.alertaIT` | tela SOBRESCREVE o motor | `page.tsx:728` (override) | `page.tsx:618` (via `sc()`) | Não citado — é uma variação do contrato inverso (item 5), não documentada como override total |
| `window.setDiastModo` | motor exporta, tela ENVOLVE (wrapper) | motor original + wrapper em `page.tsx:745` | botões Auto/Manual da diastólica | Sim (item 6, citado nominalmente) |
| `window._onLaudoGerado` | tela → recebe HTML do merge | definido em `page.tsx` (~587, fora da faixa lida) | chamado em `page.tsx:607` após `montarLaudoHtml` | Sim (item 6 e item 8 — é a porta de entrada da sentinela `__WILKINS__`) |
| `window._onInserirFrase` | motor (onclick inline no banco de frases) → tela insere | `page.tsx:507` | HTML gerado pelo motor legado (`onclick="_onInserirFrase(...)"`) | Sim (item 5, contrato inverso) |
| `window.refluxoPulmonar` | tela chama função do motor | `motorv8mp4.js:741` | `page.tsx:670,1736` | **NÃO está nos 8 contratos** — é uma chamada direta do motor que o ADR não lista |
| `window.showToast` | tela DEFINE, algo chama | `page.tsx:459` | usado por `handleCopiarFormatado`/etc (S5-T12) — busquei `showToast` em `motorv8mp4.js`: **zero ocorrências**, então quem chama é sempre React, não o motor | Não é um consumidor do motor — é utilitário interno, não pertence a este contrato |
| `window.__setDiastModoOrig` | interno, guarda referência original pra evitar empilhar wrappers a cada remount | `page.tsx:743` | só leitura interna | Não é do contrato — é implementação do wrapper de `setDiastModo` |
| `window.calcIdade`, `escH` | motor chama, espera existir globalmente | citado no ADR item 5 (contrato inverso) | não localizei o ponto exato de definição na leitura desta task (fora do escopo de tempo) — **fica como item a confirmar antes de mexer no cleanup do React** | Sim, citado no ADR (não reverifiquei a implementação) |

**Achado que o contrato não cobre:** `window.refluxoPulmonar` — chamada
direta de `page.tsx` para uma função do motor legado, fora da lista dos 4
globais do item 6. Se o Senna93 substituir essa função sem que `page.tsx`
pare de chamá-la (ou vice-versa), quebra sem exceção — mesmo padrão de risco
que os globais já documentados.

### A5. Kill-switch — `src/lib/primary-engine-flag.ts`

Semântica confirmada lendo o arquivo:

- Controla **só a origem de achados/conclusões** (Senna90 vs. motor antigo
  gerando pro `#achados-body`/`#conclusao-list` → TipTap). **NÃO** controla
  `params-tbody`, `calc-*` nem `#alerta-psap` — esses sempre rodam pelo motor
  legado, independente da flag (comentário no topo do arquivo é explícito
  sobre isso: "motor antigo CONTINUA rodando pra params-tbody + calc-*").
- Precedência: `localStorage['leo:primary-engine']==='off'` (kill-switch por
  device, vence tudo) > `==='senna90'` (força ON por device) >
  `NEXT_PUBLIC_PRIMARY_ENGINE==='senna90'` (default global, ativo em produção
  desde 16/05/2026).
- **Implicação pra Senna93:** o dia que o motor legado morrer, este
  kill-switch — do jeito que está — só desliga achados/conclusões. Ele
  **não tem equivalente pra params-tbody/calc-*/alerta-psap**. Se o Senna93
  assumir esses números sem um kill-switch próprio (ou sem estender este),
  não existe rollback instantâneo pra essa metade — só reverter deploy.

### A6. O que quebra no dia em que o legado morre — por consumidor

| Consumidor | Precisa migrar pra Senna93 antes do legado morrer? | Nota |
|---|---|---|
| `#params-tbody` (4 consumidores) | **Sim** — é a saída mais visível (PDF assinado, prontuário, Word) | `lerParamsDoDOM` seria trocado por leitura direta do `ResultadoLaudo` do Senna93; os 2 consumidores bespoke (Copiar Texto, Baixar Word) precisam de atenção redobrada por não passarem pelo template compartilhado |
| `calc-*` (10 ids) | Sim, mas risco baixo (tela-only) | Painel unicamente visual — pior caso é campo vazio, não corrompe documento assinado |
| `#alerta-psap`/`alertaIT` | Sim, mas já é 100% React hoje | Só precisa que o Senna93 exponha os 2 valores (Vel. IT, PSAP) pro override continuar funcionando — não depende mais do motor legado de fato |
| `#out-*` (identificação: nome/idade/nascimento/convênio/solicitante/data) | **Sim — É O MAIS CRÍTICO** | ADR já avisa: é produto do motor legado (`motorv8mp4.js:1180-1185`), lido por `gerarPdfHtml()` via `textContent`. Trocar sem portar quebra a identificação impressa **sem erro** (vira `—/—/—`) |
| `window.calc`/orquestração de disparo | Sim | Se Senna93 não expuser um `calc()`-equivalente que a delegação de eventos em `#laudo-sidebar` possa disparar, o recálculo simplesmente para de acontecer |
| `window.refluxoPulmonar` | Sim (achado desta leitura, fora do contrato documentado) | Chamada direta — se sumir sem substituto, `page.tsx:670`/`:1736` lançam undefined-is-not-a-function |
| `window._onInserirFrase` (banco de frases) | Sim | Só quebra se o HTML do motor legado com `onclick` inline sumir sem o Senna93 gerar algo equivalente OU sem a tela deixar de depender de onclick inline |
| Sentinela `__WILKINS__` (4 pontas) | Sim | Contrato mais frágil do lote — rótulos precisam casar exatamente entre `WK_DESC` (mora no Senna90 hoje) e o que `laudo-merge.ts` colapsa |
| Kill-switch (`primary-engine-flag.ts`) | **Precisa ser estendido**, não só migrado | Hoje só cobre achados/conclusões; a metade que o Senna93 está absorvendo (superfície corporal, volumes, massa, índices, params-tbody, calc-*, alerta PSAP) não tem rollback por device ainda |

**Contagem de consumidores mapeados nesta leitura: 9** pontos de consumo
distintos do motor legado (`#params-tbody` × 4 caminhos contados como 1 grupo
de saída + `calc-*` + `#alerta-psap` + `#out-*` identificação + `window.calc`
+ `window.refluxoPulmonar` + `window._onInserirFrase` + `__WILKINS__` + o
kill-switch como controle transversal) — cada um é um ponto de migração
separado no passo 3 (portar números) do ADR.

---

## B) SHADOW DATA

### B1. Infraestrutura existente — 3 peças, 2 delas mortas

1. **`src/lib/shadow-runner.ts`** (client-side): `rodarShadowMode()` chama o
   Senna90 no servidor (`/api/laudo/calcular`), lê a saída do motor antigo do
   DOM (`#achados-body`, `#conclusao-list`), compara achado a achado e
   conclusão a conclusão, filtra divergências esperadas (regex de 3 padrões
   clínicos aprovados) e reporta via `reportarDivergencias()`.
   **Achado crítico: este arquivo NÃO é importado em lugar nenhum do app.**
   Busquei `shadow-runner`/`executarEReportar`/`rodarShadowMode`/
   `shadowModeAtivo` em todo `src/` — só aparecem dentro do próprio arquivo e
   em comentários de outros dois arquivos (`motor-ts-adapter.ts`,
   `senna90-bridge.ts`) que **explicam por que NÃO o usam**:
   `senna90-bridge.ts:10-12` diz literalmente que duplica a lógica de
   `calcularServerSide()` "de propósito — evita editar shadow-runner.ts
   (arquivo no congelamento da migração)". Ou seja: o caminho real de
   produção (`senna90-bridge.ts`, usado quando `senna90Primario()` está ON)
   é um **irmão gêmeo congelado**, não o shadow-runner. O shadow-runner é
   código morto, mantido intacto por decisão, mas nunca executado.

2. **`src/senna90/shadow-mode.ts`**: função pura `runShadowComparison()` que
   recebe medidas + resultado do motor antigo já em mãos e devolve
   divergências. Não busca DOM nem Firestore — é uma lib de comparação, não
   um runner. Não encontrei nenhum import dela fora de si mesma.

3. **`/api/admin/shadow-retroativo` + `/direx/painel/motor-shadow/retroativo`**:
   este é o único caminho **realmente executável hoje**. A página admin
   chama a API com `{wsId, from, to}`; a API busca exames `status==emitido`
   no período (`workspaces/{wsId}/exames`), roda `calcular()` (Senna90) em
   cima das medidas salvas, compara achados/conclusões salvos (extraídos de
   `dados.achados`/`dados.conclusoes`, tratando tanto array quanto string
   concatenada) contra o resultado do Senna90, e devolve um resumo +
   divergências por exame. **Isso funciona e roda contra dados reais** — mas
   é on-demand, disparado manualmente pelo médico no painel, um clique por
   vez.

### B2. Onde os resultados/divergências são logados — a resposta é "não são"

Segui a cadeia de gravação em cada uma das 3 peças:

- `shadow-runner.ts::reportarDivergencias()` — grava em **Sentry**
  (`captureMessage`, tag `component: shadow-runner`) e em
  **`localStorage['leo:shadow-mode:historico']`** (client-only, capado em 50
  entradas, por navegador/device — não sincroniza entre médico no notebook e
  médico na clínica). **Mas como o runner nunca é chamado, este caminho
  nunca grava nada.**
- `/direx/painel/motor-shadow/page.tsx` (o painel "principal") só **lê**
  `localStorage['leo:shadow-mode']` (toggle) e
  `localStorage['leo:shadow-mode:historico']` — não tem nenhuma leitura de
  Firestore. A UI promete "cada cálculo dispara verificação invisível" —
  essa promessa depende do shadow-runner estar plugado em `page.tsx`, o que
  **não está**.
- `/api/admin/shadow-retroativo/route.ts` — **não grava em Firestore em
  nenhum momento**. Lê `workspaces/{wsId}/exames` (read-only, confirmado
  lendo o arquivo inteiro: só tem `.get()`, zero `.set()`/`.update()`/
  `.add()`), monta o resultado em memória e devolve como JSON na resposta
  HTTP. A página `/direx/painel/motor-shadow/retroativo/page.tsx` só guarda
  esse resultado em `useState` do React — fecha a aba, o resultado some.

**Consulta em produção (read-only, confirmando a ausência):**

```
ROOT COLLECTIONS: [configPlanos, consumo, contas, empresas, logs,
                    profissionais, subscriptions, vinculos, workspaces]
workspace LDRtedkanx3bUvxpdmiL subcollections: [accIndex, config, exames,
                    extratos, integracoes, pacientes, privado, tiposLaudo]
workspace dIJfZvmsVFDrkod9eraJ subcollections: [exames, integracoes,
                    pacientes, tiposLaudo]
workspace wader-dev subcollections: [exames, integracoes, pacientes,
                    privado, tiposLaudo]
```

Nenhuma coleção `shadow*`, `comparac*` ou `divergenc*` em lugar nenhum —
nem na raiz, nem como subcoleção de workspace. Conferi também um documento
de exame `emitido` de cada um dos 3 workspaces (16 a 34 campos por
documento) — **zero campos** com nome relacionado a shadow/comparação/
divergência. Não existe rastro persistido de nenhuma comparação já rodada.

### B3. Veredito

**SOMBRA MORTA.** Especificamente:

- **0 comparações logadas** — não há onde procurar, porque nada grava.
- **0 divergências logadas** — mesma razão.
- O único uso real (`shadow-retroativo`) é **funcional e correto no código**
  (roda contra Firestore de verdade, com deduplicação de frases e
  similaridade Jaccard para tolerância textual), mas é **efêmero por
  design** — cada clique no botão "Analisar exames" processa e descarta.
  Não há evidência (nem no código, nem no Firestore, nem em Sentry via
  código-fonte) de que ele já rodou em produção contra o histórico completo
  de exames — só existe o botão manual, sem agendamento nem persistência.
- O runner "ao vivo" (`shadow-runner.ts`) está desconectado da aplicação —
  é código congelado, não uma proteção ativa.

**Implicação direta pro passo 4 do ADR (Senna93 — "Sombra em produção"):**
o texto do ADR diz "shadow-runner (já existe) compara os dois em exames
reais" como se fosse um fato operacional. Não é — existe o **código**, mas
ele não está plugado em lugar nenhum e não persiste nada. Antes do passo 4
poder acontecer de verdade, alguém precisa decidir: (a) plugar
`shadow-runner.ts` em `page.tsx` de fato (ligado por
`shadowModeAtivo()`/toggle no painel) E adicionar persistência em Firestore
(hoje é só localStorage + Sentry, que não dá pra agregar entre médicos/
devices), OU (b) rodar `shadow-retroativo` periodicamente (cron/agendado) E
gravar o resultado nalgum lugar persistente em vez de deixar morrer no
`useState` da página. Sem uma dessas duas ações, o passo 4 do ADR não tem
como gerar o volume de dados (a meta documentada no próprio painel é "0
inesperadas em 7 dias consecutivos com 100+ execuções") — hoje, 0 execuções
estão sendo acumuladas em qualquer lugar consultável.

---

## Arquivos lidos nesta leitura

- `docs/decisoes/2026-08-26-senna93-motor-unificado.md`
- `docs/decisoes/2026-08-22-contrato-ponte-tela-motor.md`
- `src/lib/pdf-params.ts`
- `src/lib/primary-engine-flag.ts`
- `src/lib/shadow-runner.ts`
- `src/lib/senna90-bridge.ts`
- `src/senna90/shadow-mode.ts`
- `src/app/api/admin/shadow-retroativo/route.ts`
- `src/app/direx/painel/motor-shadow/page.tsx`
- `src/app/direx/painel/motor-shadow/retroativo/page.tsx`
- `src/app/laudo/[id]/page.tsx` (trechos: 440-820, 1400-1660)
- `src/components/laudo/SidebarLaudo.tsx` (ids `calc-*`, `alerta-psap`)
- `public/motor/motorv8mp4.js` (grep pontual: `alertaIT`, `refluxoPulmonar`, `showToast`)
- Firestore produção (leo-sistema-laudos): `listCollections()` raiz + 3
  workspaces + 1 doc de exame emitido por workspace (read-only, via
  `scripts/secao1/lib-admin.mjs`, sem `--commit`, scripts temporários
  apagados após uso)
