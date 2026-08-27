# ADR — Contrato da Ponte tela↔motor (D7)

**Data:** 22/08/2026 (decisão) · 25/08/2026 (documentado, S5-T11; ampliado na
tríade final, S5-T14) · **Branch:** `feat/secao5-tela-laudo`.
**Status:** aprovado pelo Sergio (tabela DECISÕES FINAIS, D7) · teste automático no ar (`tests/unit/contrato-ponte-ids.test.mjs`).

## Contexto

Revisão da Seção 5 (`docs/planos/2026-08-22-revisao-secao5-tela-laudo.md`) mapeou
que a tela do laudo (`src/app/laudo/[id]/page.tsx`) e o motor (Senna90 via
`src/lib/motor-ts-adapter.ts`, motor legado `public/motor/motorv8mp4.js`) se
comunicam por **~50 ids de DOM mantidos à mão em listas independentes**, sem
tipo compartilhado nem teste que os obrigue a bater. Isso já causou divergência
real: `wilkins-toggle` e `diast-manual-sel` nasceram sem persistência
(coletarMedidas), `b24_diast` é um id morto em três lugares, e
`b28`/`b29`/`b34t` já ficaram de fora do "Limpar" em algum momento.

Este é o **pré-requisito da Seção 6** (revisão do motor, maior risco clínico):
sem esse contrato escrito + travado por teste, qualquer refatoração do motor
pode silenciosamente parar de ler um campo que a tela ainda mostra, ou vice-versa.

## Os 9 contratos (7 do parecer de arquitetura da S5 + o 8º achado na tríade final + o 9º achado no levantamento Senna93)

1. **Contrato de IDs** — CINCO listas independentes dos ~50 campos `b*`
   mantidas à mão: JSX (`SidebarLaudo.tsx`), `coletarMedidas` (persistência),
   `motor-ts-adapter.ts` (leitura pro Senna90), o motor legado (leitura direta
   do DOM), e `limparCampos`/`handleLimpar` (reset). Divergências reais já
   encontradas: `wilkins-toggle`, `diast-manual-sel`, `b24_diast` (extinto),
   `b28`/`b29`/`b34t` faltando no Limpar.
   **Fechamento (S5-T11):** `tests/unit/contrato-ponte-ids.test.mjs` lê os
   arquivos-fonte (sem importar componentes React — não há DOM no test
   runner) e trava 4 invariantes entre JSX, `coletarMedidas` e
   `limparCampos`/adapter, com toda exceção em allowlist justificada no
   próprio teste (não escondida). O motor legado (`motorv8mp4.js`) fica fora
   do escopo deste teste — é território da Seção 6.

2. **Semântica versionada por motor** — `b59`/`b60`/`b61` significam paredes
   **diferentes** conforme o motor:
   - Motor legado (`motorv8mp4.js`): `b59`=lateral, `b60`=inferior,
     `b61`=inferolateral.
   - Senna90 (`motor-ts-adapter.ts:150-156`): `b59`→inferior,
     `b60`→inferolateral, `b61`→lateral (ordem AHA correta).
   **Decisão vigente: Senna90 é a verdade** — a tela e o adapter seguem a
   semântica do Senna90 (produção desde 16/05, flag `senna90Primario`); o
   motor legado é o que está desatualizado nesse ponto. Qualquer comparação
   shadow-runner entre os dois motores precisa reordenar `b59`/`b60`/`b61`
   antes de comparar — comparar posição-a-posição sem essa reordenação produz
   falso-positivo de divergência (o "achado" onda 4 já registrou isso: "shadow-
   runner compara com nó extinto" é sintoma do mesmo tipo de descompasso).
   Não há teste automático pra este item (é semântica de rótulo, não
   presença/ausência de id) — fica documentado aqui como a fonte da verdade a
   consultar antes de mexer em `motorv8mp4.js` ou no adapter nessa seção.

3. **Contrato de eventos** — delegação única em `#laudo-sidebar`
   (`input`/`change` com `bubbles: true`) é como o motor legado escuta
   mudança nos campos. Quatro produtores dependem disso hoje: digitação
   direta, `setVal()` (page.tsx), o reset de `limparCampos`/`Sec` (clique
   reseta e dispara evento sintético), e a importação DICOM SR. Trocar
   qualquer input pra "controlado" (React `value`+`onChange` sem
   `dispatchEvent`) ou passar a escutar por-input quebra o recálculo sem
   erro nenhum — o motor simplesmente não é avisado.

4. **Contrato de saída** (TRAVADO POR TESTE desde a tríade final — invariante
   (5) do `contrato-ponte-ids.test.mjs`) — os nós DOM que o motor ESCREVE e a
   tela RASPA de volta: `#params-tbody` (com índice de linha hardcoded em 4
   lugares diferentes — acha nº 21/Ponytail), `#out-*`, `#calc-*` (ids como
   `calc-fe`, `calc-imc`, `calc-wilkins` — ver lista completa na JSX de
   `SidebarLaudo.tsx`). Mudar o formato de saída do motor sem atualizar os 4
   pontos de raspagem quebra silenciosamente (a tabela renderiza errada ou
   vazia, sem exceção).

   ⚠️ **O primeiro fio a puxar com cuidado na Seção 6:** a IDENTIFICAÇÃO
   IMPRESSA NO PDF ASSINADO (nome, idade, nascimento, convênio, solicitante,
   data do exame) é **produto do motor legado** — `motorv8mp4.js:1180-1185`
   escreve nos `#out-*` e `gerarPdfHtml()` (page.tsx) lê de volta por
   `textContent`. Trocar `renderIdentificacao` do motor por render React
   deixa a TELA certa e o PDF com `— / — / —`, sem erro nem exceção. A S5-T10
   moveu essas âncoras (`SheetA4` → `MolduraA4`) e nenhum teste piscou — daí
   a invariante (5).

   ### Atualização F3-T5 (27/08/2026) — DOIS escritores, exclusivos por flag

   A virada do cabo do Senna93 acrescentou um **segundo escritor** dos mesmos
   nós: `src/lib/params-render.ts` (`pintarTabelaSenna93`). Quem pinta
   `#out-*`, `#calc-*` e `#params-tbody` passa a ser decidido pelo kill-switch
   `senna93Params()`:

   | flag | quem pinta | como |
   |---|---|---|
   | OFF (produção de hoje) | motor legado | `sc()` → `calcFn()` → `renderizarLaudo()` |
   | ON | Senna93 | ponte (`/api/laudo/calcular`) → `pintarTabelaSenna93(r)` |

   **Nunca os dois.** `paramsOn` é lido UMA vez por montagem do efeito do motor
   (o `paramsOn` do render é state e o efeito tem deps `[]`); trocar a flag
   **exige recarregar** a página do laudo. Com ON, as três chamadas de
   `calcFn()` do efeito (`sc`, branch sintético, init) ficam atrás de
   `if (!paramsOn)`, e o override de `alertaIT` também não roda (os alertas
   viraram lista estruturada do motor na F3-T2).

   Ponto cego coberto junto: `SidebarLaudo.tsx` chama `window.calc` DIRETO
   (`motorCalc()`, 3 botões da diastólica) — fora do alcance daquele guard e
   invisível pro regex do contrato. Com a flag ON a page reaponta
   `window.calc` para o `sc()`, e `calcFn` passa a vir de `window.__calcOrig`
   (o `calc()` cru guardado na 1ª montagem) pra que um remount depois de
   virar o kill-switch não faça `sc()` chamar a si mesmo.

   Este arranjo de dois escritores é **temporário até a F5** (quando o motor
   legado sai de cena e sobra um só). Enquanto durar, a invariante (5) exige
   que os dois escrevam EXATAMENTE o mesmo conjunto de `#out-*` (5.0b), que
   toda pintura do Senna93 esteja sob `if (paramsOn)` e toda chamada legada
   sob `if (!paramsOn)` (5.4), e que o wrap de `window.calc` continue no ar
   enquanto `motorCalc` existir na sidebar (5.5).

   Proveniência (mesma task): `handleEmitir` manda
   `motorNumeros: 'senna93' | 'legado'` no corpo de `/api/emitir`, e a rota
   grava esse campo no exame ao lado do `pdfUrl` (validado contra a lista de
   duas palavras; qualquer outra coisa é ignorada). É o carimbo que diz de
   qual motor saíram os números daquele PDF assinado.

5. **Contrato inverso** — o motor legado DEPENDE de coisas que só o React
   fornece: `calcIdade`/`escH` chamadas globais, o modal do banco de frases
   com `onclick` inline apontando pra funções globais (`_onInserirFrase`).
   Remover esses globais no cleanup do React sem o motor saber quebra o
   banco de frases (achado nº 14) e o cálculo de idade.

6. **Contrato de janela (`window.*`)** — `window.calc`, `window.setDiastModo`,
   `window._onLaudoGerado`, a sentinela `window.__WILKINS__`, e o formato de
   HTML que `EditorLaudo` fatia em achados/conclusões pro TipTap. Mudar o
   formato do HTML gerado sem avisar o fatiador produz conclusões vazias
   **sem erro** — o pior tipo de quebra silenciosa deste contrato.

7. **Ciclo de vida** — o motor precisa ser idempotente na reinjeção (S5
   corrigiu remount por `key={exameId}`, achado nº 16) e tolerar seções que
   nascem fechadas e só montam os inputs depois (`Sec` com `hidden` em vez de
   desmontar, achado nº 4). Reinjetar o script sem reusar (`if (w.calc)`)
   redeclara `const` e quebra em silêncio (achado nº 21) — contrato que a
   Seção 6 precisa manter ao mexer no motor.

   A `key={exameId}` **faz parte do contrato**, não é otimização: o único
   mecanismo de cancelamento de execução tardia é `vivoRef` + o cleanup dos
   efeitos, e é a `key` que garante que uma instância morta nunca volta. Os
   três órfãos já achados (debounce do Senna90, `onload` do `<script>` e o
   timer de 500ms do `preencherExame` — este último na tríade final) escreviam
   a identificação do paciente ANTERIOR na tela viva do paciente novo.
   Invariante (7) do teste.

8. **Sentinela `__WILKINS__` (contrato de 4 pontas)** — `senna90/achados/
   wilkins.ts` PRODUZ `__WILKINS__{json}`, `senna90-render.ts` embrulha,
   `page.tsx` RENDERIZA o bloco (rótulos + descrições + "TOTAL: N pontos.") e
   `laudo-merge.ts` COLAPSA o bloco renderizado de volta pra sentinela, casando
   pelo TEXTO VISÍVEL dos rótulos. Renomear um rótulo só de um lado faz o merge
   parar de colapsar: o bloco vira "linha manual" preservada **e** a sentinela
   nova entra de novo — escore de Wilkins duplicado e desatualizado dentro do
   laudo assinado. A tabela de critérios (`WK_DESC`) tem dono único desde a
   tríade final: mora no Senna90 e a page importa. Invariante (8) do teste.

9. **`window.refluxoPulmonar` (achado do levantamento Senna93, 26/08)** — `page.tsx`
   (:670, :1736) chama direto `window.refluxoPulmonar`, função definida pelo motor
   legado (`motorv8mp4.js:741`) que mostra/esconde `#field-psmap`. Fora da lista
   original do item 6. Invariante (9) do teste trava as duas pontas: a F3 do Senna93
   migra o consumidor, a F5 remove a definição — juntas, nunca uma só.

## O que o teste trava, exatamente

`tests/unit/contrato-ponte-ids.test.mjs` — invariantes (1)-(4) da S5-T11 + as
invariantes (5)-(8) da tríade final (S5-T14) + 3 checagens de allowlist "não fica pra trás" (cada allowlist só é válida enquanto a exceção
que ela documenta continuar sendo verdade; se a realidade do código mudar sem
atualizar a allowlist, o teste falha e força a atualização):

1. Todo id que `motor-ts-adapter.ts` lê existe como `id="..."` na JSX de
   `SidebarLaudo.tsx`.
2. Todo id que o adapter lê está na lista `campos` de `coletarMedidas`
   (persistência) — exceto `convenio` (allowlist: canônico só no topo do
   exame desde 16/05, fora de `coletarMedidas` de propósito).
3. Todo campo de `coletarMedidas` que não é de identificação está em
   `camposNum`/`camposSel` de `limparCampos` — exceto `nome`/`dtnasc`/
   `dtexame`/`solicitante` (allowlist: zerados só em troca de exame, não em
   "Limpar" comum). `sexo` **não** está nessa allowlist — decisão nº24 da
   revisão S5: sexo é campo do motor (muda os cortes clínicos), não de
   identificação, e por isso é zerado normalmente.
4. Nenhum id referenciado em `coletarMedidas`/`limparCampos` está ausente da
   JSX, exceto `b24_diast` (allowlist: unificado com `b24`, dead id em 3
   lugares — `coletarMedidas`, `limparCampos`, o handler de sincronização
   `b24`↔`b24_diast` em `page.tsx`). **Esta allowlist é a que a Task 13
   remove** — o teste falha se `b24_diast` for limpo do código mas
   esquecido na allowlist (força fechar as duas pontas juntas).

Na tríade final entraram mais quatro, cobrindo o lado que faltava (a SAÍDA) e
o que a Seção 6 vai abrir:

5. Todo `#out-*` que `motorv8mp4.js` escreve existe como nó na tela
   (`SheetA4` → `MolduraA4`) e todo `#out-*` que `gerarPdfHtml()` raspa é
   escrito pelo motor — mais `#params-tbody` nas 3 pontas. O motor é lido
   **read-only** pelo teste (o arquivo continua intocável).
   **F3-T5:** o mesmo vale pro segundo escritor (`params-render.ts`), que
   precisa cobrir o MESMO conjunto de 6 ids (5.0b); a raspagem do PDF passa a
   aceitar qualquer um dos dois escritores (5.2); e (5.4)/(5.5) travam a
   exclusividade por flag e o wrap de `window.calc`.
6. Identificação não mora em `medidas`: `coletarMedidas` não persiste
   `nome`/`dtnasc`/`dtexame`/`convenio`/`solicitante`/`sexo`, e a restauração
   ignora as cópias que exames antigos ainda têm (`SO_DO_TOPO`).
7. O timer de 500ms do `preencherExame` tem `clearTimeout` no cleanup **e**
   guard de `vivoRef` (ver contrato 7).
8. Os rótulos do bloco Wilkins renderizados em `page.tsx` são exatamente os
   que `RENDER_WILKINS` (`laudo-merge.ts`) colapsa, e `WK_DESC` vem do
   Senna90 (sem cópia viva na page).

O que fica **fora** do escopo deste teste (fronteira deliberada, não
esquecimento): a lógica do motor legado (`public/motor/motorv8mp4.js`) e do
Senna90 (`src/senna90/`) — ambos são território da Seção 6; as invariantes
(5) e (8) só LEEM esses arquivos pra travar a fronteira, nunca o cálculo. Este teste garante que a
**tela e a persistência concordam entre si e com o que o adapter TypeScript
lê**; não garante que o motor (legado ou Senna90) consome cada campo
corretamente — isso é o trabalho da Seção 6, e o item 2 acima (semântica
b59/b60/b61) é o aviso mais concreto do que ela vai encontrar.

## Achado de drift real durante S5-T11

Nenhum — os 3 arquivos-fonte já batiam nas 4 invariantes acima no momento
desta task (211+7 testes verdes, ver relatório). A única divergência
conhecida (`b24_diast`) já estava mapeada pela revisão S5 (achado Ponytail
"b24_diast fantasma, 2 pontos" — na prática 3, contando o handler de sync) e
entrou na allowlist como planejado, para a Task 13 remover.
