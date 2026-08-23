# Revisão da Seção 5 — Tela do Laudo

**Data:** 22/08/2026 · **Status:** 🔎 Achados consolidados — aguardando decisões do Sergio.

**Método:** tríade em três óticas independentes (corretude/casos-de-borda ·
arquitetura/fronteiras · Ponytail), instruídas a não repetir a Seção 4 (tela
viva/modal/galeria/guarda — que passou limpa nas três). Escopo: a tela onde o
médico lauda — `src/app/laudo/[id]/page.tsx` (1444), os 6 componentes de
`src/components/laudo/`, `emissao-guarda.ts` e a PONTE com o motor. O cálculo
em si é Seção 6; a emissão server é Seção 7.

**Resumo executivo:** 7 críticos (todos de perda/troca de trabalho clínico),
11 altos, 6 médios, ~12 baixos/cortes — e o entregável estratégico: o **Contrato
da Ponte tela↔motor** (7 itens), pré-requisito da Seção 6. Dois achados foram
confirmados por DOIS revisores independentes (sobrescrita do editor; override
diastólico inerte; corrigir-laudo; laudo→laudo; trava do emitido).

---

## ONDA 1 — Perda ou troca de trabalho clínico (CRÍTICOS)

### 1. [CRÍTICO] "Salvar Rascunho" NÃO salva o texto digitado — e nada é persistido no servidor antes da emissão
`page.tsx:692-699` (handleRascunho: só medidas → localStorage) · `:536-543` (salvarLaudo existe pronto e NUNCA é chamado — zero call-sites)

O conteúdo do TipTap (comentários + conclusões — o texto autoral) não entra no
rascunho; o rascunho é por-navegador (localStorage); não há autosave nem
beforeunload. **Cenário:** caso difícil, 3 parágrafos digitados, "Salvar
Rascunho" → toast de sucesso → luz cai/aba fecha → o texto nunca existiu em
lugar nenhum. Na outra máquina da clínica, nem as medidas aparecem.
**Fix mínimo:** handleRascunho chama o salvarLaudo já existente (status
'andamento' + laudoHtml do editor), localStorage vira plano B, beforeunload de
3 linhas. Restaurar laudoHtml no preencherExame via pendingHtml.

### 2. [CRÍTICO] Todo recálculo SOBRESCREVE o editor inteiro — texto digitado à mão some sem aviso
`page.tsx:266-279,322-344` · `EditorLaudo.tsx:166-172` — confirmado pelos DOIS revisores opus

Com o Senna90 primário (produção desde 16/05), qualquer input no sidebar agenda
setContent(html) 300ms depois — substitui o documento inteiro. A única guarda
(HTML idêntico → skip) funciona ao contrário: só poupa quando o médico NÃO
digitou nada. **Cenário:** acrescenta "paciente com marca-passo, janela
limitada", preenche a PSAP → a frase evapora (e o undo fica inconsistente,
setContent roda com emitUpdate:false). **Fix mínimo:** flag "sujo" no editor
(onUpdate fora do setContent); sujo → _onLaudoGerado não sobrescreve (ou
confirma "medidas mudaram — regerar o texto?").

### 3. [CRÍTICO] O seletor Manual da Função Diastólica é INERTE no motor que escreve o laudo
`motor-ts-adapter.ts:94-97` (modoManual:'auto', selecaoManual:-1 hardcoded) · `SidebarLaudo.tsx:353-381` — confirmado pelos DOIS

O adapter que alimenta o Senna90 nunca lê a escolha manual (e o Senna90 nem
consome os campos — só fixtures). **Cenário:** paciente em FA, médico clica
Manual → "grau III restritivo", a tabela mostra, o PDF sai com o texto
AUTOMÁTICO. A escolha não é nem gravada (fora do coletarMedidas) — sem
auditoria. **Fix mínimo:** adapter lê #diast-manual-sel do DOM (3 linhas) +
Senna90 consumir (fronteira S6 — task própria) + persistir no coletarMedidas;
enquanto não consumir, ESCONDER o toggle (controle que não faz nada é pior que
ausente).

### 4. [CRÍTICO] Seções fechadas do sidebar PERDEM os dados — a contratilidade segmentar evapora
`SidebarLaudo.tsx:500,509,578` (Sec só monta filhos com open) · `page.tsx:471-474` (setVal é no-op sem elemento)

Função Sistólica e Contratilidade Segmentar nascem fechadas = inputs fora do
DOM: na carga os valores salvos são descartados; no recálculo o Senna90 lê "sem
alteração segmentar". **Cenário:** laudo de infartado com acinesia emitido
certo; semanas depois, reaberto para corrigir convênio → a acinesia some do
texto regenerado → "Salvar correção" regrava o PDF oficial sem o achado (com o
nº 7). **Fix mínimo:** Sec oculta com hidden em vez de desmontar — mata a
classe inteira de bugs.

### 5. [CRÍTICO] Corrigir o nome do paciente na emissão é descartado
`page.tsx:730-743` — `pacienteNome: exame?.pacienteNome || ...` vence o spread da identificação digitada. É o MESMO bug corrigido para convenio em 16/05, que ficou no campo ao lado. **Fix:** apagar a linha.

### 6. [CRÍTICO] A data do exame vira "hoje" — exame de quinta laudado na sexta muda de dia
`SidebarLaudo.tsx:302` (defaultValue=hoje) · `page.tsx:476-487` (fallback só preenche campo VAZIO — nunca está). O PDF e o dataExame regravado saem com a data do laudo, não do exame; o exame troca de dia na fila/extrato. **Fix:** tirar o defaultValue (o preencherExame já cai em hoje quando falta).

### 7. [CRÍTICO] "Salvar correção (sem custo)" REGRAVA o PDF assinado com o estado vivo da tela — e com a assinatura de quem estiver logado
`page.tsx:833-861` · `api/corrigir-laudo/route.ts:41-88` — confirmado pelos DOIS

A rota grava só convênio/solicitante mas aceita pdfHtml cru e SUBSTITUI o PDF
oficial: corpo clínico do estado atual (com os furos 2/3/4 dentro), cabeçalho/
CRM/assinatura do usuário LOGADO (o dono corrigindo o laudo do colega assina
por cima), imagens forçadas com true fixo. Auditoria só registra convênio.
**Fix mínimo:** com emitidoEm, gerarPdfHtml usa o cfgSnapshot gravado na
emissão (autoria certa); recusar quando reedicaoAtiva; incluirImagens conforme
o emitido; enquanto 2/3/4 não fecham, não regerar corpo clínico.

---

## ONDA 2 — Fluxo trava ou estado mente (ALTOS)

### 8. [ALTO] Rascunho recuperado ZERA o convênio
`page.tsx:462-465` — aceitar a recuperação pula o bloco de identificação (return); convenio saiu do coletarMedidas em 16/05. Emite com convenio:'' — reabre o furo de glosa. **Fix:** trocar return por if/else.

### 9. [ALTO] Recusar a recuperação APAGA o rascunho na hora
`page.tsx:465-467` — ESC/Cancelar por reflexo = única cópia destruída. **Fix:** não remover no "não" (a limpeza de 7 dias já cuida).

### 10. [ALTO] A trava do laudo emitido tem 3 donos que se contradizem
`page.tsx:1438-1440` (CSS pega TODOS os inputs — inclusive convênio/solicitante que a Phase E liberou) · `SidebarLaudo.tsx:74-97` (loop imperativo com setTimeout 800ms) · `EditorLaudo.tsx` (TipTap NUNCA travado) — confirmado pelos DOIS

Consequências: a correção-sem-custo está bloqueada pela trava global (campo não
clica, botão clica — salva o valor inalterado e regrava o PDF à toa); o TEXTO
de um laudo emitido segue 100% editável (imprimir 2ª via pode divergir do PDF
oficial; com o nº 7, vira gravação). **Fix:** CSS com :not(#convenio):not(#solicitante);
editable={!emitido} no TipTap; deletar o loop imperativo.

### 11. [ALTO] "Emitir" sem trava de duplo clique — 2 créditos, 2 PDFs
`page.tsx:701-821` — 15s de Puppeteer sem estado emitindo; a rota não é idempotente. O irmão laudo-texto já tem setEmitindo. **Fix:** ref de guarda no handleEmitir (e no handleCorrigirLaudo).

### 12. [ALTO] Limpar/carga-lenta deixam o TEXTO do laudo de outro momento
`page.tsx:426-433` (safeCalc chama window.calc direto, fora do wrapper sc() que dispara o Senna90) — 🗑️ Limpar esvazia a tabela mas os comentários/conclusão do exame ANTERIOR continuam na folha; na carga com rede lenta, o texto é gerado da tela vazia e nunca se corrige. **Fix:** safeCalc chamar o sc() (uma linha via ref).

### 13. [ALTO] `calc()` do motor ESTOURA em toda chamada (#achados-body não existe mais) — e engole o alerta de PSAP
`motorv8mp4.js:1221` vs SheetA4 (container virou TipTap) — o TypeError é engolido (console.warn); a tabela renderiza ANTES do throw por sorte; alertaIT() (Vel. IT sem PSAP) NUNCA roda — o aviso clínico está morto. **Fix:** guardar os 2 getElementById no motor (toque mínimo autorizado no arquivo do motor — decisão) + chamar alertaIT no wrapper.

### 14. [ALTO] Banco de Frases: "Inserir no Laudo" não faz NADA desde a migração TipTap
`motorv8mp4.js:1431-1451` (escreve no nó extinto) · page.tsx:281-283 (_onInserirFrase pronto e nunca chamado). **Fix:** motor chama window._onInserirFrase (12 linhas viram 2 — toque mínimo no motor).

### 15. [ALTO] Escore de Wilkins: liga sem recalcular, não persiste o toggle, e sobra na tela após Limpar
corr+arch consolidado — `SidebarLaudo.tsx:437-450` (troca checked sem change; #wilkins-icon nunca muda) · coletarMedidas sem o toggle · setVal não trata checkbox · handleLimpar deixa o painel visível. **Cenário:** reemissão de estenose mitral SAI SEM o Wilkins. **Fix:** dispatchEvent(change) no botão; persistir 'wilkins-toggle'; setVal com checkbox; esconder painel no Limpar.

### 16. [ALTO] Navegar laudo→laudo (sem desmontar): medidas, imagens e travas do paciente ANTERIOR
`page.tsx:221-229` (deps booleanas nunca re-disparam o preencherExame) — confirmado pelos DOIS. Os inputs b* ficam com o paciente A (coletarMedidas de B grava as medidas de A!); emitido nunca volta a false; imagens de A podem entrar no PDF de B (emissão aborta DEPOIS do débito). Hoje o caminho normal desmonta (via dashboard) — mas o código da S4 já provou que a rota direta existe. **Fix:** key={exameId} na página (remount limpo) — 1 linha, mata a família toda.

### 17. [ALTO] Seleção de imagens não é podada no remap — crédito cobrado e PDF abortado
`page.tsx:167-185` — o guard congela a seleção da 1ª leitura; URLs remapeadas ficam órfãs; o fail-loud do servidor aborta DEPOIS da transação de billing. **Fix:** podar sempre dentro do onSnapshot (sel.filter(u => todas.includes(u))) — 1 linha.

### 18. [ALTO] A busca do nome no Feegow ao desbloquear está morta (401 silencioso)
`SidebarLaudo.tsx:101-153` — chamada sem wsId e sem Authorization desde o endurecimento da Seção 3; o erro é engolido e o médico conclui "Feegow igual". **Fix:** padrão do handleEmitir (wsId + Bearer via prop).

---

## ONDA 3 — MÉDIOS

19. [MÉDIO] A tela HARDCODA eco transtorácico e não valida modalidade — eco TE/stress saem com título de TT; URL direta de carótidas abre a tela do eco e emite (`SheetA4.tsx:45-47`, `page.tsx:1002`; laudo-texto valida, esta não). **Fix:** guarda de modalidade (espelho do laudo-texto) + título do catálogo.
20. [MÉDIO] Duas cópias byte-idênticas do motor (`public/motor/` servida, `src/motor/` morta) — armadilha de editar o arquivo errado na S6. **Fix:** apagar src/motor/motorv8mp4.js (+ irmãos mortos).
21. [MÉDIO] Remontagem re-executa o motor: `const` redeclarado quebra em silêncio e a tela roda com closures da montagem anterior; globals nunca limpos no cleanup. **Fix:** if (w.calc) reusar; delete dos _on* no cleanup. (S6: motor idempotente — contrato.)
22. [MÉDIO] `window.importarDICOM`/DICOM_TO_DOM do motor está PODRE (LVEF→b25=Vol AD! TAPSE→id inexistente) e a docstring do DicomSrImport ainda aponta pra ele. **Fix:** apagar do motor + corrigir docstring.
23. [MÉDIO] preencherExame seta valor sem disparar change — campo condicional (PSMAP) volta ESCONDIDO com valor dentro. **Fix:** um change borbulhado ao fim do preencher (resolve também a carga do nº 12B).
24. [MÉDIO] identificacaoMudou() ignora sexo (muda cortes WASE!) e solicitante. **Fix:** incluir.

## ONDA 4 — BAIXOS + PONYTAIL (cortes com prova de zero call-sites)

- Limpeza de rascunhos pula chaves (iteração com removeItem); b24_diast fantasma (2 pontos); CSS órfão de #achados-body/#conclusao-list; `?v=Date.now()` re-baixa 85KB por laudo; shadow-runner compara com nó extinto (painel Direx do shadow não significa nada — nota, Direx fora do escopo).
- [DELETAR] dicomLoading (state+prop+2 JSX, sempre false); prop medicoNome nunca lida; const script órfã (page.tsx:305); EditorLaudoRef.getText sem chamador; salvarLaudo (OU passa a ser usado pelo nº 1 — preferido).
- [SIMPLIFICAR] toasts duplicados (cssText idêntico 2×); gerarPdfHtml reimplementa renderPaginas da galeria (comentário jura reuso falso); paramsHTML duplicado verbatim (gerar/copiar); raspagem de #params-tbody reescrita 4×; catálogos de IDs duplicados (coletarMedidas × handleLimpar — vira o teste do Contrato); PopupEmitir setState no corpo do render.
- Banco de frases em localStorage por-máquina com nome de clínica hardcoded — colide com multi-médico PJ (fronteira S6, registrar).

---

## ⭐ O CONTRATO DA PONTE tela↔motor (pré-requisito da Seção 6)

O revisor de arquitetura mapeou os 7 contratos implícitos que hoje quebram em
silêncio (detalhe completo no parecer, resumo):
1. **Contrato de IDs**: CINCO listas independentes dos ~50 campos b* mantidas à
   mão (JSX, coletarMedidas, adapter, motor, handleLimpar) — divergências REAIS
   hoje (wilkins-toggle, diast-manual-sel, b24_diast, b28/b29/b34t faltando no
   Limpar). Fix: teste em tests/unit que parseia os arquivos e obriga os
   conjuntos a bater (~40 linhas, roda no CI).
2. **Semântica versionada por motor**: b59/b60/b61 significam paredes
   DIFERENTES no motor legado vs Senna90 (a tela segue o Senna90). Documentar
   com auditoria.
3. **Contrato de eventos**: delegação única em #laudo-sidebar (input/change com
   bubbles) — 4 produtores dependem; virar controlado OU escutar por-input
   quebra sem erro.
4. **Contrato de saída**: os nós DOM que o motor escreve e a tela raspa de
   volta (#params-tbody com idx===4 hardcoded 4×, #out-*, #calc-*...).
5. **Contrato inverso**: o motor DEPENDE da tela (calcIdade/escH fornecidos
   pelo React; modal do banco com onclick globais).
6. **Contrato de janela**: calc, setDiastModo..., _onLaudoGerado, sentinela
   __WILKINS__, e o formato de HTML que o EditorLaudo fatia (mudar o formato →
   conclusões vazias SEM erro).
7. **Ciclo de vida**: motor precisa ser idempotente na reinjeção e tolerar
   inputs que aparecem depois (Sec).

**Recomendação da tríade (forte):** `docs/decisoes/` com os 7 itens + o teste
de conjuntos de IDs **antes da primeira linha da Seção 6**.

## Decisões que são do Sergio

- **D1 (nº 1):** rascunho de verdade — salvar TUDO (medidas+texto) no servidor
  no "Salvar Rascunho", localStorage como plano B, beforeunload. Autosave
  automático periódico também? (custo: writes; recomendação: sim, a cada 60s
  quando houver mudança).
- **D2 (nº 2):** quando você editou o texto à mão e muda uma medida: (a) motor
  NUNCA mais sobrescreve (você regenera por botão), ou (b) pergunta "regerar o
  texto?" uma vez. Recomendação: (b).
- **D3 (nº 3):** o modo Manual da diastólica deve funcionar no Senna90 (toca a
  fronteira da S6 — o adapter e o consumo no motor TS). Autorizar essa task
  "ponte" agora, ou esconder o toggle até a S6? Recomendação: fazer agora (é
  controle clínico seu).
- **D4 (nº 7):** corrigir-laudo congela o corpo clínico (cfgSnapshot, recusa em
  reedição) — confirmar o desenho.
- **D5 (nºs 13/14/22):** três toques MÍNIMOS no arquivo do motor legado
  (public/motor/motorv8mp4.js: 2 guards + ponte do banco de frases + apagar
  importarDICOM podre). O motor é território da S6 — autorizar estes 3 toques
  cirúrgicos antecipados?
- **D6 (nº 19):** guarda de modalidade + título dinâmico do catálogo.
- **D7 (Contrato da Ponte):** escrever o doc + teste de IDs nesta correção
  (recomendação: SIM — é o seguro da Seção 6).
- **D8 (Ponytail):** autorizar os cortes/simplificações.

## O que a tríade verificou e está CERTO
Toda a camada da Seção 4 (tela viva, guards, modal, galeria assinada, guarda de
emissão, importação SR com perfil) passou limpa nas três óticas; a ponte
handleConfirmarImportSr é "a fronteira mais bem desenhada da tela"; a flag
senna90Primario (kill-switch por device) é exatamente o que a S6 vai precisar;
billing/autoria/permissão decididos no servidor; navTeclado saudável; optimistic
UI da seleção documentada.
