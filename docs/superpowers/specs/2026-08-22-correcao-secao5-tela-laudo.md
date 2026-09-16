# Spec — Correção da Seção 5 (Tela do Laudo)

**Data:** 22/08/2026 · **Origem:** revisão da tríade
(`docs/planos/2026-08-22-revisao-secao5-tela-laudo.md` — 7 críticos + 11 altos +
médios/baixos + Contrato da Ponte) com TODAS as decisões do 1-a-1 (tabela
DECISÕES FINAIS do doc — parte integrante desta spec; em conflito, ela vence).

**Objetivo:** o médico nunca mais perde trabalho digitado; o que ele decide
(manual diastólico, sexo, linhas editadas) MANDA no laudo; laudo emitido é
imutável fora dos caminhos oficiais; a folha A4 vira moldura de todos os tipos
de exame; e a ponte tela↔motor fica documentada e travada por teste ANTES da
Seção 6.

## Restrições globais

- Branch `feat/secao5-tela-laudo` a partir da `master` (base `927f08d`). Commit+push por task.
- Os arquivos da tela (`src/app/laudo/[id]/page.tsx`, `src/components/laudo/**`)
  são o OBJETO desta correção — a regra "intocável" fica suspensa DENTRO desta
  esteira para eles; `src/motor/**` (cálculo) segue intocável EXCETO os 3 toques
  do D5 em `public/motor/motorv8mp4.js` (guards + banco de frases + apagar
  importarDICOM), com REVISOR DEDICADO. Direx intocável.
- Motor de CÁLCULO (Senna90 em src/senna90/, fórmulas, cortes) NÃO muda — exceto
  consumir `modoManual/selecaoManual` (D3), que é ponte, não fórmula.
- NÃO usar git stash. Bateria: `npm run test:unit` (109), `test:api` (196),
  `test:rules` (142), `npx tsc --noEmit`, `npm run build`; wader intocado (104).
  Nenhuma task termina com placar menor.
- Nenhuma regra Firestore nova prevista; se alguma surgir (papel recepção no
  corrigir-laudo é decidido na ROTA server-side, não em regra), confirmar com o
  Sergio antes de publicar.
- Merge+deploy ao final com confirmação do Sergio, fora do horário da clínica.
- Verificação final ao vivo com o Sergio (conta Gmail), como na Seção 4.

## Frentes de entrega (mapa decisão→task no plano)

1. **Rascunho de verdade (D1, nº1,8,9):** handleRascunho grava servidor
   (medidas + laudoHtml + status andamento) via salvarLaudo existente;
   restauração inclui o texto; autosave 60s com dirty-check; beforeunload;
   recuperação local preenche identificação; recusar não apaga.
2. **Merge por linha "última alteração vence" (D2, nº2):** rastrear a última
   geração do motor por linha; regeneração substitui apenas linhas do motor
   (intocadas OU cujo conteúdo novo difere da geração anterior — última
   alteração vence); linhas acrescentadas pelo médico ancoram e permanecem;
   marca visual discreta em linha editada é opcional se barato.
3. **Manual da diastólica funciona (D3, nº3):** adapter lê #diast-manual-sel;
   Senna90 consome modoManual/selecaoManual (ponte, sem mexer em fórmula);
   coletarMedidas persiste; botão Automático limpa.
4. **Integridade de dados da tela (nº4,5,6,15,23,24):** Sec com hidden;
   pacienteNome digitado vence (apagar linha); dtexame sem defaultValue;
   Wilkins (persistir toggle, setVal p/ checkbox, change no botão, esconder
   painel no Limpar, ícone); change borbulhado pós-preencherExame; sexo migra
   para o bloco clínico do motor (edição = reedição com crédito; sai da
   correção administrativa).
5. **Correção administrativa de verdade (D4, nº7,10):** corrigir-laudo usa
   cfgSnapshot da emissão, não regenera corpo clínico, recusa em reedição;
   rota aceita papel recepcao/admin (server-side) sem crédito; nome fora;
   trava única do emitido (CSS :not(#convenio):not(#solicitante) +
   editable={!emitido} no TipTap + deletar loop imperativo).
6. **Robustez de fluxo (nº11,12,16,17,21):** guard emitindo (emitir e
   corrigir); safeCalc via wrapper sc(); key={exameId} (remount por exame);
   poda da seleção de imagens no onSnapshot; reinjeção idempotente do motor +
   cleanup dos globals.
7. **Toques D5 no motor legado (nº13,14,22 — revisor dedicado):** guards nos
   getElementById extintos + alertaIT religado via wrapper; inserirFrase →
   window._onInserirFrase; apagar DICOM_TO_DOM/importarDICOM/importarDeArquivo
   + docstring do DicomSrImport corrigida.
8. **Feegow no desbloqueio (nº18):** chamada com wsId + Bearer (prop wsId no
   SidebarLaudo), erro visível.
9. **Espelho A4 unificado + tipos (D6 a/b/c, nº19):** guarda de modalidade na
   /laudo (espelho do laudo-texto); título do PDF do catálogo; extrair a
   moldura (cabeçalho/identificação/assinatura/estilos de impressão) em
   componente compartilhado usado por /laudo e /laudo-texto; doppler_carotidas
   vira modalidade texto no catálogo padrão (migração leve p/ workspaces
   existentes: só o tipo no catálogo; exames motor antigos de carótidas
   continuam abrindo onde foram emitidos).
10. **Contrato da Ponte (D7):** docs/decisoes/2026-08-2X-contrato-ponte-tela-motor.md
    com os 7 itens do parecer de arquitetura; teste tests/unit que extrai e
    compara os conjuntos de IDs (JSX SidebarLaudo × coletarMedidas ×
    lerMedidasDoDOM × handleLimpar × usos v()/n() do motor) e FALHA em
    divergência.
11. **Cortes Ponytail (D8 + nº20):** dicomLoading, medicoNome, const script,
    getText; toasts unificados; gerarPdfHtml usa renderPaginas; paramsHTML e
    raspagem do #params-tbody em helper único; catálogo de IDs único (vira
    parte do 10); PopupEmitir sem setState no render; src/motor/motorv8mp4.js
    (cópia morta) apagado; b24_diast; CSS órfão; ?v= só no retry; limpeza de
    rascunhos sem pular chaves.
12. **Fechamento:** tríade final adversarial no diff da branch; bateria; ADR;
    Obsidian; memória; teste ao vivo com o Sergio; merge+deploy com confirmação.

## Fora de escopo (registrado)
Reescrita do motor (S6); emissão/PDF server (S7) além do necessário no D4;
banco de frases multi-médico (registrado p/ S6); shadow-runner vs nó extinto
(nota p/ S6); motor próprio para carótidas (futuro; agora é texto livre).
