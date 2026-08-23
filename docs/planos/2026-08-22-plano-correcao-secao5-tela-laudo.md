# Correção Seção 5 (Tela do Laudo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar as decisões D1-D8 da revisão da Seção 5: rascunho de verdade, merge por linha "última alteração vence", manual da diastólica funcionando, laudo emitido imutável fora dos caminhos oficiais, espelho A4 unificado, Contrato da Ponte travado por teste, e cortes.

**Architecture:** Uma frente única (web/tela), tasks sequenciais no mesmo arquivo-núcleo (`page.tsx`) — SEM paralelismo de implementadores. A Task 8 (motor legado) tem revisor dedicado. Task 14 fecha (tríade final + teste ao vivo com o Sergio + merge/deploy com confirmação).

**Tech Stack:** Next.js/React/TipTap; testes `npm run test:unit|test:api|test:rules`, `npx tsc --noEmit`, `npm run build`.

## Global Constraints

- Branch `feat/secao5-tela-laudo` da master (base `eee49a6`+). Commit+push por task.
- Spec: `docs/superpowers/specs/2026-08-22-correcao-secao5-tela-laudo.md`; decisões: tabela DECISÕES FINAIS em `docs/planos/2026-08-22-revisao-secao5-tela-laudo.md` (vencem em conflito).
- `src/app/laudo/[id]/page.tsx` e `src/components/laudo/**` são o OBJETO (regra intocável suspensa nesta esteira); `src/senna90/**` só o consumo de modoManual (D3, sem tocar fórmula); `public/motor/motorv8mp4.js` SÓ na Task 8 (revisor dedicado); Direx intocável.
- NÃO usar git stash. Placar nunca regride: unit 109+, api 196+, rules 142+, wader 104 (intocado), tsc+build limpos.
- A camada da Seção 4 (onSnapshot/guards/modal/galeria/guarda de emissão) NÃO regride — os testes visuais dela são o contrato.
- Decisão nº24: sexo é campo CLÍNICO (trava do motor, edição = reedição com crédito); NUNCA entra no caminho administrativo.
- Sem regra Firestore nova; papel no corrigir-laudo é decidido na ROTA (server).

---

### Task 1: Rascunho de verdade (D1, nº1, nº8, nº9)

**Files:** Modify: `src/app/laudo/[id]/page.tsx`, `src/components/laudo/EditorLaudo.tsx`; Test: `tests/unit/` (parte pura), verificação manual roteirizada.

**Interfaces:**
- `EditorLaudoRef` ganha `getHTML(): string` (documento inteiro; `getText` morto sai na Task 13).
- Exame ganha campos `laudoHtml?: string` (rascunho do texto) — gravado por `salvarLaudo`.
- Produces: `salvarLaudo` passa a ser USADO (era código morto).

- [ ] **Step 1:** `EditorLaudo.tsx`: adicionar `getHTML: () => editor?.getHTML() ?? ''` ao ref imperativo.
- [ ] **Step 2:** `page.tsx` `handleRascunho` (linhas 692-699) vira:

```ts
async function handleRascunho() {
  setPopupOpen(false);
  const okServer = await salvarLaudo('andamento', { laudoHtml: editorRef.current?.getHTML() ?? '' });
  try { // plano B local continua
    localStorage.setItem(`rascunho_${exameId}`, JSON.stringify({ medidas: coletarMedidas(), laudoHtml: editorRef.current?.getHTML() ?? '', timestamp: Date.now() }));
  } catch { /* */ }
  toast(okServer ? 'Rascunho salvo' : 'Rascunho salvo só neste navegador (sem conexão)');
}
```

- [ ] **Step 3:** restauração: em `preencherExame`, (a) o ramo do rascunho local aplica também `rascunho.laudoHtml` via `pendingHtml.current = rascunho.laudoHtml` quando presente, e NÃO retorna cedo — o bloco de identificação SEMPRE roda depois (nº8: trocar o `return` da linha 464 por fluxo que continua); (b) recusar NÃO faz `removeItem` (nº9 — apagar o else da linha 466); (c) exame com `exame.laudoHtml` (rascunho servidor) e SEM rascunho local mais novo → `pendingHtml.current = exame.laudoHtml`.
- [ ] **Step 4:** autosave 60s: `useEffect` com `setInterval(60_000)` que roda `salvarLaudo('andamento', { laudoHtml })` SÓ se houve mudança desde o último save (dirty flag setada pelo listener delegado do sidebar já existente + `onUpdate` do editor — expor `onDirty?: () => void` no EditorLaudo ou usar o mesmo flag da Task 2) e NUNCA quando `emitido`. beforeunload: `useEffect` registrando `e.preventDefault()` quando dirty e não emitido.
- [ ] **Step 5:** bateria completa + commit `feat(laudo): rascunho de verdade no servidor + autosave + recuperacao integra (S5-T1)` + push.

---

### Task 2: Merge por linha "última alteração vence" (D2, nº2)

**Files:** Create: `src/lib/laudo-merge.ts`, `tests/unit/laudo-merge.test.mjs`; Modify: `src/app/laudo/[id]/page.tsx` (integração em `_onLaudoGerado`), `src/components/laudo/EditorLaudo.tsx` (flag de escrita programática).

**Interfaces (produce):**
```ts
// src/lib/laudo-merge.ts — PURO, sem DOM
export function mesclarLinhas(prevGer: string[], novaGer: string[], atuais: string[]): string[]
```
Regras (decisão D2 do Sergio — "última alteração vence"):
1. Sem edição (`atuais` ≡ `prevGer`) → devolve `novaGer` inteira (fast path).
2. Alinhar `atuais`×`prevGer` por igualdade exata (LCS — listas ≤ ~40 linhas, O(n·m) trivial). Linha casada = linha do motor INTOCADA → sai `novaGer[i]` correspondente ao slot `prevGer[i]` (se o slot sumiu em novaGer, a linha some).
3. Linha de `atuais` NÃO casada: heurística de slot — se compartilha ≥60% dos tokens com algum `prevGer[i]` não-casado vizinho, é EDIÇÃO do slot i: se `novaGer[i] !== prevGer[i]` (motor tem conteúdo novo) → sai `novaGer[i]` (motor vence, médico re-edita se quiser); se igual → mantém a edição do médico. Senão é linha ACRESCENTADA → mantém, ancorada após a linha anterior.
4. Linhas novas de `novaGer` sem slot em `prevGer` (achado novo) → inseridas na ordem do motor.
5. `// ponytail:` na heurística dos 60% (limite conhecido; upgrade = diff word-level se doer).

- [ ] **Step 1 (RED):** tabela de testes com os cenários do Sergio: (a) frase acrescentada sobrevive a mudança de medida; (b) linha do VE editada ("...com trabeculações") + DDVE muda → vira a linha nova do motor; (c) linha editada + medida NÃO muda → edição fica; (d) sem edição → novaGer inteira; (e) achado novo entra; (f) achado que sumiu (intocado) sai; (g) conclusões (mesma função, listas separadas).
- [ ] **Step 2:** implementar a lib pura → verde.
- [ ] **Step 3:** integração em `page.tsx`: refs `prevGerAchados/prevGerConclusoes: string[] | null`; `_onLaudoGerado` deixa de receber HTML pronto — o disparador Senna90 (linha 322-329) passa a chamar um novo caminho: com `r.achados/r.conclusoes` em mãos, ler `atuais` do editor (`getAchadosLines/getConclusoesLines`), `mesclarLinhas` para cada bloco (prevGer null → primeira geração, usa novaGer direto), `setContent(montarLaudoHtml(mergedA, mergedC))`, atualizar os refs prevGer = novaGer. O caminho legado `_onLaudoGerado` (motor antigo) mantém assinatura p/ compat.
- [ ] **Step 4:** `EditorLaudo`: ref interna `settingContent` em volta do `setContent` para o `onUpdate` do TipTap distinguir digitação do médico (alimenta a dirty-flag da T1; nesta task nada mais).
- [ ] **Step 5:** bateria + commit `feat(laudo): merge por linha ultima-alteracao-vence (S5-T2)` + push.

---

### Task 3: Manual da diastólica funciona (D3, nº3)

**Files:** Modify: `src/lib/motor-ts-adapter.ts` (94-97), `src/senna90/**` (SÓ o consumo — localizar onde a classificação diastólica é decidida e respeitar `modoManual/selecaoManual`; ZERO mudança de fórmula), `src/app/laudo/[id]/page.tsx` (coletarMedidas + preencherExame), `src/components/laudo/SidebarLaudo.tsx` (botão Automático limpa o select). Test: unit no adapter (mock de DOM via jsdom? seguir padrão; senão extrair função pura) + caso no senna90 (fixtures já têm os campos).

- [ ] Steps: adapter lê `#diast-manual-sel` (`modoManual: sel>=0 ? 'manual':'auto'`, `selecaoManual`); Senna90: quando manual, a classificação/texto usa a opção selecionada (as opções já existem no motor antigo — mapear 1:1); `coletarMedidas` ganha `'diast-manual-sel'`; `preencherExame` dispara o change (a Task 5 põe o change global — aqui garantir que o painel abre quando restaurado manual); botão "Automático" zera o select (-1) + dispara change. Testes RED→verde. Commit `feat(laudo): modo manual da diastolica chega ao laudo (S5-T3)` + push.

---

### Task 4: Integridade de dados da tela (nº4, 5, 6, 15, 23, 24)

**Files:** Modify: `src/components/laudo/SidebarLaudo.tsx` (Sec hidden; Wilkins; sexo→trava clínica; dtexame), `src/app/laudo/[id]/page.tsx` (setVal checkbox; change pós-preencher; linha do pacienteNome; Wilkins no Limpar). Test: unit onde puro + contrato (T11 cobre listas).

- [ ] **nº4:** `Sec` renderiza filhos SEMPRE, com `hidden={!open}` no container (children montados; CSS/behavior igual). Conferir que navTeclado (filtra `offsetParent`) continua pulando campos ocultos.
- [ ] **nº5:** apagar a linha 735 do page.tsx (`pacienteNome: (exame?.pacienteNome as string) || ...`) — o spread de `identificacao` já traz o certo.
- [ ] **nº6:** `#dtexame` sem `defaultValue` (SidebarLaudo:302) — `preencherExame` já cai em `dataLocalHoje()` no fallback.
- [ ] **nº15 (Wilkins):** botão dispara `cb.dispatchEvent(new Event('change',{bubbles:true}))` em vez de `motorCalc()`; `#wilkins-icon` alterna ☐/☑; `coletarMedidas` ganha `'wilkins-toggle'`; `setVal` trata checkbox (`el.checked = val === '1'` + abre `#wilkins-fields`); `handleLimpar` esconde `#wilkins-fields`.
- [ ] **nº23:** ao fim de `preencherExame`, disparar UM `change` borbulhado no `#laudo-sidebar` (revela condicionais: PSMAP, painel manual; e dispara o recálculo da carga — casa com T7/nº12).
- [ ] **nº24 (sexo=clínico):** em SidebarLaudo, o campo `sexo` segue a trava do MOTOR (`readOnlyMotor`), não a da identificação — desbloqueio administrativo não o libera; só a reedição clínica (crédito).
- [ ] Bateria + commit `fix(laudo): sec hidden + nome/data/sexo/wilkins integros (S5-T4)` + push.

---

### Task 5: Correção administrativa de verdade (D4, nº7)

**Files:** Modify: `src/app/api/corrigir-laudo/route.ts`, `src/app/api/emitir/route.ts` + `src/lib/pdf-server.ts` (snapshot do HTML na emissão), `src/app/laudo/[id]/page.tsx` (handleCorrigirLaudo enxuto + recusa em reedição), `src/components/Worklist.tsx` (ação de correção p/ recepção — NÃO intocável). Test: tests/api (novos casos).

**Desenho (D4 + adendo):**
- Na EMISSÃO, o servidor grava também o HTML final em `laudos/{wsId}/{exameId}.html` no Storage (snapshot — 1 linha no fluxo do pdf-server) e `exame.pdfHtmlPath`.
- `/api/corrigir-laudo` PARA de aceitar `pdfHtml` do cliente: carrega o snapshot, substitui SÓ os valores de convênio/solicitante (replace ancorado nos blocos `CONVÊNIO`/`MÉDICO SOLICITANTE` do template — função pura testada `substituirCamposAdministrativos(html, {convenio, solicitante})` em `src/lib/`), regera o PDF com o MESMO html (cabeçalho/assinatura originais preservados = autoria de quem emitiu), atualiza os campos no doc. Sem snapshot (emitidos antigos) → NÃO regera PDF (grava só os campos + aviso `pdfDesatualizado: true` na resposta; o médico reimprime se quiser).
- Papéis: a rota aceita médico-autor, dono E recepcao/admin (`resolverPapel`), sem crédito. NOME fora (continua no fluxo clínico).
- Cliente: `handleCorrigirLaudo` não manda mais pdfHtml; recusa quando `reedicaoAtiva` (`toast('Termine a reedição (emitir) ou saia sem salvar antes de corrigir')`).
- Recepção: na `Worklist.tsx`, exame emitido ganha ação "✏️ convênio/solicitante" (modal mínimo com os 2 campos → mesma rota) visível para papéis recepcao/dono.

- [ ] Steps: testes api RED (recepção 200; corpo clínico do snapshot INTOCADO — asserção de que o html regravado difere só nos 2 campos; sem snapshot → sem regen; reedição client-side é UI) → implementar → verde → bateria → commit `feat(web): correcao administrativa congelada + recepcao sem credito (S5-T5)` + push.

---

### Task 6: Trava única do emitido (nº10, nº12-editor)

**Files:** Modify: `src/app/laudo/[id]/page.tsx` (CSS), `src/components/laudo/EditorLaudo.tsx` (`editable`), `src/components/laudo/SidebarLaudo.tsx` (deletar loop imperativo 74-97).

- [ ] CSS linha 1438: `.laudo-locked #laudo-sidebar input:not(#convenio):not(#solicitante), ...` (select/textarea idem).
- [ ] `EditorLaudo` ganha prop `editable?: boolean` → `useEditor({ editable })` + `useEffect(() => editor?.setEditable(editable), [editable])`; page passa `editable={!emitido}`.
- [ ] Deletar o loop imperativo `el.disabled` (o CSS é o dono único; conferir que os 2 campos admin continuam operáveis com laudo emitido).
- [ ] Bateria + commit `fix(laudo): trava unica do emitido — texto trava, admin libera (S5-T6)` + push.

---

### Task 7: Robustez de fluxo (nº11, 12, 16, 17, 21, 19-baixo)

**Files:** Modify: `src/app/laudo/[id]/page.tsx`, wrapper de página p/ `key`.

- [ ] **nº16:** dividir o componente: `export default function LaudoPage(){ const params=useParams(); return <LaudoPageInner key={String(params.id)} />; }` — remount limpo por exame (estados/refs zeram por construção; os resets manuais da S4 continuam inofensivos).
- [ ] **nº11:** `const emitindoRef = useRef(false);` — guard no topo de `handleEmitir` e `handleCorrigirLaudo` (`if (emitindoRef.current) return; emitindoRef.current = true;` + `finally` liberando) + toast/estado "Emitindo...".
- [ ] **nº12:** `scRef = useRef<() => void>()` setado no motorInicializar (`scRef.current = sc`); `safeCalc()` chama `scRef.current?.() ?? calc()`.
- [ ] **nº17:** no onSnapshot, APÓS os guards: `setImagensSelecionadasPdf(sel => sel.filter(u => todas.includes(u)))` (poda sempre; nunca adiciona).
- [ ] **nº21:** no efeito do motor: `if ((window as any).calc) { motorInicializar(); return; }` antes de injetar o script; cleanup ganha `delete w._onLaudoGerado; delete w._onInserirFrase;`.
- [ ] **nº19-baixo:** limpeza de rascunhos itera `Object.keys(localStorage)` (cópia).
- [ ] **nº14-alto (S5 corr):** `setDicomImportado(false)` dentro de `handleLimpar`.
- [ ] Bateria + commit `fix(laudo): remount por exame + guard de emissao + sc unico + poda de selecao (S5-T7)` + push.

---

### Task 8: Toques D5 no motor legado (nº13, 14, 22) — REVISOR DEDICADO

**Files:** Modify: `public/motor/motorv8mp4.js` (SÓ os 3 pontos), `src/components/laudo/DicomSrImport.tsx` (docstring), `src/app/laudo/[id]/page.tsx` (sc chama alertaIT).

- [ ] **nº13:** em `renderizarLaudo` (~1215-1229): `const ab = document.getElementById('achados-body'); if (ab) ab.innerHTML = ah;` (idem `#conclusao-list`) — o TypeError em toda chamada morre. No `sc()` do page.tsx, após `calcFn()`: `try { (window as any).alertaIT?.(); } catch {}` — o alerta de PSAP volta a viver.
- [ ] **nº14:** `inserirFraseSelecionada` → corpo vira `const f = FRASES_FILTRADAS[fraseSelecionada]; if (!f) return; (window._onInserirFrase||function(){})(f.txt); fecharBanco();` (nomes reais conferidos no arquivo).
- [ ] **nº22:** apagar `DICOM_TO_DOM`, `window.importarDICOM`, `importarDeArquivo` (grep antes: zero call-sites vivos); docstring do `DicomSrImport` passa a apontar `handleConfirmarImportSr`.
- [ ] ZERO outras linhas do motor. Bateria + commit `fix(motor): guards de render + banco de frases religado + importador podre removido [D5 cirurgico] (S5-T8)` + push. **Revisor dedicado confere o diff do motor linha a linha.**

---

### Task 9: Feegow no desbloqueio (nº18)

**Files:** Modify: `src/components/laudo/SidebarLaudo.tsx` (fetch com auth), `src/app/laudo/[id]/page.tsx` (prop wsId).

- [ ] SidebarLaudo ganha prop `wsId?: string`; a busca (linhas 101-153) vira `fetch(`/api/feegow?wsId=${wsId}`, { headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` }, ... })` (padrão do handleEmitir); resposta não-ok → toast visível ("Feegow indisponível — confira manualmente"), nunca silêncio. Bateria + commit `fix(laudo): busca Feegow do desbloqueio autenticada e com erro visivel (S5-T9)` + push.

---

### Task 10: Espelho A4 unificado + tipos (D6 a/b/c, nº19)

**Files:** Create: `src/lib/pdf-moldura.ts` (frame do PDF), `src/components/laudo/MolduraA4.tsx` (frame de tela); Modify: `src/app/laudo/[id]/page.tsx` (guarda+título+usa moldura), `src/components/laudo/SheetA4.tsx` (vira consumidor da moldura), `src/app/laudo-texto/[id]/page.tsx` (usa moldura na tela e no PDF), `src/lib/tipos-laudo.ts` (carótidas → texto), migração leve p/ catálogos gravados. Test: unit da moldura-PDF (string) + api se tocar emissão.

- [ ] **(a)** `/laudo/[id]` valida modalidade no catálogo (espelho de `laudo-texto:59-63`): texto → redirect `/laudo-texto/[id]`; título do PDF e do SheetA4 = `tipo.nome.toUpperCase()` (fallback atual).
- [ ] **(b)** extrair de `gerarPdfHtml` o FRAME (head/fonts/@page/thead identificação/tfoot assinatura/rodapé LEO) para `montarPdfMoldura({ titulo, identificacao, corpoHtml, cfg })` — `gerarPdfHtml` vira `montarPdfMoldura(...)` com o corpo do eco; `laudo-texto` gera seu PDF pela MESMA moldura (corpo = HTML do editor). Na tela: `MolduraA4` (cabeçalho+caixa identificação+rodapé) usada por SheetA4 e pela página do laudo-texto.
- [ ] **(c)** catálogo: `doppler_carotidas` → `modalidade:'texto'` no default; workspaces com catálogo já gravado: fallback em código (se tipo sem modalidade explícita e id==='doppler_carotidas' → texto) — sem script de migração. Exames de carótidas JÁ EMITIDOS pelo motor continuam abrindo/reimprimindo (guarda vale para `!emitidoEm`).
- [ ] Bateria + verificação visual (build + abrir preview local se possível) + commit(s) `feat(laudo): espelho A4 unificado + carotidas em texto livre (S5-T10)` + push.

---

### Task 11: Contrato da Ponte (D7)

**Files:** Create: `docs/decisoes/2026-08-22-contrato-ponte-tela-motor.md` (os 7 itens do parecer de arquitetura, copiados/adaptados), `tests/unit/contrato-ponte-ids.test.mjs`.

- [ ] O teste lê os ARQUIVOS FONTE (fs.readFileSync) e extrai: ids `b*`/`wk-*`/campos nomeados do JSX de `SidebarLaudo.tsx` (regex `id="([a-z0-9_-]+)"`), a lista `campos` de `coletarMedidas` e `camposNum/camposSel` de `handleLimpar` (page.tsx), os ids lidos em `motor-ts-adapter.ts` (`read(Num|Str|Checked)\('...'\)`). Asserções: (1) todo id que o adapter lê EXISTE no JSX; (2) todo id que o adapter lê está em coletarMedidas (persistência) — exceções documentadas numa allowlist NO TESTE com justificativa; (3) handleLimpar ⊇ (coletarMedidas ∩ campos-clínicos) — allowlist p/ identificação; (4) nenhuma referência a id extinto (b24_diast entra na allowlist até a Task 13 e é REMOVIDO dela lá — o teste força a limpeza).
- [ ] Doc com os 7 contratos + a divergência semântica b59/b60/b61 registrada com a decisão vigente (Senna90 é a verdade).
- [ ] Bateria + commit `test(laudo): contrato da ponte tela-motor travado por teste (S5-T11)` + push.

---

### Task 12: Autosave/UX residual + Ponytail parte 1 (page.tsx)

**Files:** Modify: `src/app/laudo/[id]/page.tsx`, `src/components/laudo/PopupEmitir.tsx`, `src/components/laudo/SidebarLaudo.tsx`, `src/components/laudo/EditorLaudo.tsx`.

- [ ] [DELETAR] `dicomLoading` (state+prop+2 JSX), prop `medicoNome`, `const script = {remove}` (305), `EditorLaudoRef.getText`.
- [ ] [SIMPLIFICAR] `toast()` local delega para `window.showToast` (cssText idêntico); `PopupEmitir` troca o setState-no-render por valor derivado (`incluirEfetivo`).
- [ ] `?v=${Date.now()}` só no retry (primeira carga sem cache-bust).
- [ ] b24_diast: remover das listas + listener de sync (372-383) + `preencherExame` mapeia legado `medidas.b24_diast → b24`; REMOVER da allowlist do teste da T11 (o teste passa a exigir ausência).
- [ ] CSS órfão `#achados-body/#conclusao-list/.linha-wrapper/.conclusao-text` removido.
- [ ] Bateria + commit `chore(laudo): cortes ponytail no nucleo da tela (S5-T12)` + push.

---

### Task 13: Ponytail parte 2 (duplicações de export/print) + cópia morta do motor (nº20)

**Files:** Modify: `src/app/laudo/[id]/page.tsx`, `src/components/laudo/DicomGallery.tsx`; Delete: `src/motor/motorv8mp4.js` (+ irmãos em src/motor sem import vivo — grep antes).

- [ ] Helper único `lerParamsDoDOM(): string[][]` + `montarParamsHtml(p1, opts)` usados por gerarPdfHtml/handleCopiarFormatado/handleCopiarTexto/handleBaixarWord (4 raspagens viram 1).
- [ ] `gerarPdfHtml` usa `renderPaginas` exportada do DicomGallery (apaga a reimplementação 950-976; o comentário falso morre).
- [ ] Apagar `src/motor/motorv8mp4.js` e demais arquivos de `src/motor/` comprovadamente sem import (grep em src/tests/scripts/public) — deixar README de 1 linha apontando `public/motor/`.
- [ ] Bateria + commit `chore(laudo): helpers unicos de params/paginas + copia morta do motor apagada (S5-T13)` + push.

---

### Task 14: Fechamento

- [ ] Bateria COMPLETA (unit/api/rules/tsc/build + wader vitest intocado).
- [ ] TRÍADE FINAL adversarial no diff da branch (bugs opus / arquitetura opus / ponytail sonnet) + onda de fix + re-verificação.
- [ ] ADR `docs/decisoes/`, Obsidian, memória, ledger.
- [ ] **Teste AO VIVO com o Sergio (conta Gmail)** — roteiro: rascunho com texto sobrevive a F5 e aparece noutra máquina; frase manual sobrevive a mudança de medida (e o caso "última alteração vence"); manual diastólica chega à conclusão; seção fechada não perde acinesia; correção administrativa não muda o corpo; carótidas abre no editor livre com a moldura.
- [ ] Merge+deploy com confirmação do Sergio, fora do horário da clínica. Placar final.

## Self-review
Cobertura: D1→T1, D2→T2, D3→T3, nº4/5/6/15/23/24→T4, D4→T5, nº10→T6, nº11/12/16/17/21→T7, D5→T8, nº18→T9, D6→T10, D7→T11, D8→T12+T13, nº20→T13, fechamento→T14. Tipos cruzados: getHTML (T1←T12 não remove), dirty-flag (T1↔T2), scRef (T7 usado por T4-nº23), allowlist b24_diast (T11↔T12), moldura (T10 única). Ordem: T1→T2 (dirty), T4 antes de T7 (change pós-preencher usa sc), T11 antes de T12 (allowlist), T8 isolada (motor).
