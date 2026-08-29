# Senna93 F5a — Plano de testes ao vivo (gates da virada)

**Data:** 28/08/2026 · **Operador:** Sergio + Claude no browser · **Conta:** Gmail (PJ de
teste) — NUNCA Yahoo · **Ambiente:** dev server local + Firebase de produção (mesmo setup
dos testes de 25 e 27/08) · **Flag:** `leo:params-engine` ligada POR DEVICE (produção
continua OFF para todo mundo)

**O que este roteiro NÃO repete:** os 8/8 aprovados em 27/08 (tabela 12 linhas, realce,
alertas, aorta nova, VIDE, emissão com travas, cancelamento, kill-switch curando). Aqui
entram só os gates que ficaram PENDENTES + o que mudou desde então.

**Papel de cada um:** Claude dirige o browser e verifica; Sergio faz o login, olha cada
tela e dá o veredito clínico (✅/❌) por item.

---

## Preparo (Claude faz antes, Sergio só confere)

- [ ] P1. Dev server no ar (`npm run dev`), browser aberto em `/login`.
- [ ] P2. Sergio loga com a conta **Gmail** de teste.
- [ ] P3. Flag ON por device: console → `localStorage.setItem('leo:params-engine','senna93')` + F5.
- [ ] P4. Cartão do kill-switch escrito no runbook (`docs/runbook-kill-switch.md`) — gate
      documental, já sai pronto desta sessão.
- [ ] P5. Abrir um exame de teste na Worklist (criar um se a fila estiver vazia; nome
      "TESTE F5A" + data de hoje, para limpar depois).

## Bloco A — Smoke OFFLINE (gate 1: a emissão tem que BLOQUEAR, nunca assinar sem tabela)

O risco que este gate mata: com a flag ON a tabela vem do servidor; se a rede cair, o
laudo NÃO pode ser assinado com tabela vazia ou velha.

- [ ] A1. Com o exame aberto e a tabela pintada, **derrubar a rede** (DevTools → Network →
      Offline). Mexer numa medida (ex.: DDVE 50 → 51).
      **Esperado:** toast "Falha ao calcular a tabela…" e a tabela NÃO atualiza.
- [ ] A2. Ainda offline, tentar **Emitir**.
      **Esperado:** emissão BLOQUEADA com aviso "Tabela de medidas não carregou" — o botão
      não gera PDF nem cobra crédito.
- [ ] A3. Religar a rede (Network → No throttling) e mexer em qualquer campo.
      **Esperado:** tabela volta a pintar na próxima rodada (~1s) e a emissão destrava —
      sem F5, sem perder o que foi digitado.

## Bloco B — Kill-switch (gate 2: rollback em 10 segundos, sem deploy)

- [ ] B1. Console: `localStorage.setItem('leo:params-engine','off')` + **F5**.
      **Esperado:** quem pinta a tabela volta a ser o motor antigo (10 linhas, ponto
      decimal, sem realce na coluna direita) — o caminho de produção de hoje.
- [ ] B2. Sem F5: religar com `localStorage.setItem('leo:params-engine','senna93')` e
      mexer numa medida. **Esperado:** o Senna93 REASSUME na rodada seguinte (cura ao
      vivo — provado na F3-T5, agora conferido a olho).
- [ ] B3. Sergio lê o cartão do runbook e confirma que QUALQUER pessoa da clínica
      conseguiria executá-lo por telefone ("abre o console, cola essa linha, F5").

## Bloco C — Modal do banco de frases (gate 4: re-teste do incidente de 27/08)

Em 27/08 o modal não fechou ao inserir; o código estava correto e a hipótese foi build
antigo. Hoje o build é novo.

- [ ] C1. Abrir o banco de frases, escolher uma frase, **Inserir**.
      **Esperado:** a frase entra no editor E o modal FECHA sozinho.
- [ ] C2. Conferir o acervo: as frases pessoais do Sergio continuam lá (chave
      `medcardio_banco` intacta — nada de reset).
- [ ] C3. Se o modal NÃO fechar de novo: anotar e investigar FORA do BancoFrases
      (decisão registrada no ADR F0-F3) — não vira fix improvisado no meio do teste.

## Bloco D — Spot-checks do que mudou desde 27/08 (F4 não mexeu na tela, então é rápido)

- [ ] D1. Troca rápida de exame com ON: abrir exame A, mexer numa medida, trocar pro
      exame B ANTES da tabela voltar. **Esperado:** nenhum número do A aparece sob o B;
      emissão do B só destrava com a tabela DELE fresca (frescor da F3-T6).
- [ ] D2. Campo PSMAP: marcar refluxo pulmonar presente → campo aparece; desmarcar →
      some (com ON e OFF — F3-T6).
- [ ] D3. Sexo vazio: limpar o sexo → TODAS as VRs da tabela somem + alerta "sexo não
      informado" no topo. Repor o sexo → volta tudo.
- [ ] D4. Wilkins incompleto: ligar o toggle e deixar um componente em 0.
      **Esperado:** alerta estruturado WILKINS_INCOMPLETO na tela e NENHUM bloco de
      escore no laudo (score null — nunca um "TOTAL 0 pts").

## Bloco E — Emissão de ponta a ponta com ON (proveniência)

- [ ] E1. Emitir o exame de teste com a flag ON.
      **Esperado em dev:** o PDF pode falhar por config de bucket local (limitação
      conhecida de dev, não é bug) — o que importa conferir no doc do exame:
      `motorNumeros: 'senna93'` gravado NA transação, e o crédito consumido.
- [ ] E2. Cancelar a emissão de teste. **Esperado:** crédito devolvido (trava da S5).
- [ ] E3. Limpeza: remover o exame "TESTE F5A" da conta de teste.

## Fora do teste manual (tarefas de código da F5a, ficam registradas)

1. **e2e item 8 ramificado pela flag** (`tests/e2e/secao5-roteiro.spec.ts:174`) — o teste
   do alerta PSAP precisa cobrir os dois caminhos (legado `#alerta-psap` × lista
   estruturada do Senna93). Tarefa de código com revisor, antes da virada.
2. Rodada retroativa da sombra segue sendo o critério da virada — este teste ao vivo NÃO
   substitui a janela de 7 dias.

## Critério de saída do teste

Todos os blocos A-E ✅ pelo Sergio → os gates humanos da F5a estão fechados; restam
(1) e2e item 8 (código) e (2) a janela da sombra limpa. Qualquer ❌ → vira achado com
investigação antes de qualquer conversa de virada.
