# Cronograma de testes — Seção 3 atualizada

> Roteiro de verificação manual da correção da Seção 3 (no ar desde 20/08, merge
> `0fb2191`). Cada teste prova um conserto específico. Executar NA ORDEM — a
> barreira antes do T19 é o ponto sem volta.
> Resultado vai sendo anotado aqui mesmo (☐ → ✅/❌ + observação).

**Regra de parada:** qualquer ❌ → parar naquele ponto e chamar o Claude. Até o
T19 (limpeza), reverter tudo é de graça — os dois mundos convivem.

## Fase 0 — hoje, de casa, conta de TESTE (Gmail) · ~10 min

| # | Teste | Tem de acontecer | Prova |
|---|---|---|---|
| T1 | Abrir `/integracoes` | Cartão Orthanc SEM botão "Testar conexão", com a legenda "Estado verificado pela máquina da clínica a cada 5 min". Feegow COM o botão. | D1 (corte nuvem-Orthanc) |
| T2 | Agenda → 🔗 Feegow (sem mapa configurado) | Mensagem "Nenhum procedimento mapeado. Vá em Integrações > Feegow…" — não um erro genérico | achado 15 |
| T3 | Cartão Feegow → desligar o toggle → salvar → 🔗 Feegow → religar | "A integração Feegow está desligada. Ligue em Integrações > Feegow." | D5 / achado 21 |

## Fase 1 — hoje, de casa, conta REAL (Yahoo), fora do horário · ~15 min

| # | Teste | Tem de acontecer | Prova |
|---|---|---|---|
| T4 ⚠️ | Cartão Feegow: conferir "17 procedimento(s) mapeado(s)" e clicar "Carregar profissionais" | Os médicos aparecem com os mapeamentos EXISTENTES preenchidos. **Se vier vazio: PARAR, NÃO CLICAR SALVAR, chamar o Claude** | fix do profMap (revisão final) |
| T5 | Toggle ligado · "Testar conexão" do Feegow | Verde: "Conexão OK — testada \<agora\>" | Task 3 do Sub-plano 5 |
| T6 | Cartão Orthanc | Se mostrar "Erro" de teste antigo: Salvar (com endereço preenchido) zera para "Nunca testado" | transição documentada |
| T7 | 🔗 Feegow à noite (agenda de amanhã) | Contagens honestas: "0 importado(s)" se vazio; se criou, reimportar → "N já estava(m) na fila" | D4 / achados 3-4 |
| T8 | Se importou paciente por engano: 🗑 remover da fila | Confirm diz "fica registrado como cancelado"; a linha SOME da fila | achado 8 |

## Fase 2 — próximo dia de clínica, uso real acompanhado

| # | Teste | Tem de acontecer | Prova |
|---|---|---|---|
| T9 | Recepção importa de manhã, como sempre | Alert multi-linha: importados · ignorados · falhas · não-realizados | D4 |
| T10 | Desmarcar um paciente no Feegow → 🔗 Feegow de novo | "1 marcado(s) não-realizado" e o paciente esmaece na fila (não some do dia) | D3 (reconciliação) |
| T11 | Remarcar um agendamento de hoje para outro dia no Feegow; NO DIA NOVO, importar | O paciente ENTRA na fila do dia novo | D2 (o furo do 66890) |
| T12 | Emitir 2-3 laudos de exames do Feegow (se der, um exame ANTIGO pendente) | No Feegow, os agendamentos viram "Atendido" | achado 5 + fix do número antigo |

## Fase 3 — visita à clínica, fora do horário de exame

| # | Teste | Tem de acontecer | Prova |
|---|---|---|---|
| T13 | Atualizar o Wader (uma atualização acumula Sub-plano 5 + Seção 3) | Serviço volta a rodar | — |
| T14 | Esperar ≤5 min → cartão Wader | "No ar — visto há N min" | batimento |
| T15 | Cartão Orthanc | "Conexão OK — verificada \<hora\>". Se "Erro": ler a mensagem (não pode ter usuário/senha dentro) e chamar o Claude | D1 |
| T16 | Importar/cadastrar um paciente | `.wl` aparece na pasta do Orthanc e o selo "SEM MWL" NÃO acende na fila | mwlStatus verdadeiro |
| T17 | No Vivid: worklist mostra o paciente; capturar uma imagem | A imagem entra no LEO (exame sai de "aguardando") | ingestão ponta a ponta |
| T18 | Depois das 21:00 (pode ser outro dia) | Os `.wl` do dia CONTINUAM na pasta | bug das 21h morto |

---

## ⛔ BARREIRA — só cruzar com T13–T17 todos ✅

| # | Passo | Observação |
|---|---|---|
| T19 | `npm run integracoes:limpar -- --commit` (na máquina do Sergio) | O ponto sem volta. Conferir depois: importação + uma imagem entrando |
| T20 | Remover `FEEGOW_API_TOKEN` do painel do Vercel | Nada mais lê |
| T21 | Trocar a senha do Orthanc (no Orthanc + no cartão de Integrações) | O valor antigo está no histórico público do git |

## Registro de execução

- **Fase 0: ✅ 20/08, executada pelo Claude** (Playwright na conta de teste + contraprova
  no banco via Admin SDK). T1 ✅ · T2 ✅ · T3 ✅ · **T4-mecanismo ✅** (seed de mapa legado
  → 1º Salvar → `integracoes/feegow.profMap` recebeu o mapa intacto) · **T5-mecanismo ✅**
  (token fake da gaveta → "Feegow 401" na tela, token não vazou em campo nenhum) ·
  **T8 ✅** (confirm fala "cancelado", linha some, doc vira `cancelado` — não apagado).
  Conta de teste limpa depois (zero resíduo).
  **1 bug achado e corrigido (`72c6eef`):** a mensagem de token ausente mandava para
  "Local de Trabalho > Integração Feegow" — lugar que não existe mais; agora aponta
  para Integrações > Feegow.
- **Fase 1 em andamento (20/08, print do Sergio):** T5 ✅ ("Conexão OK — testada 20/08
  às 21:12") · T6 ✅ (Orthanc "Nunca testado", sem botão, legenda certa) · contadores
  certos (17 procedimentos, 4 profissionais). **Bug nº 2 achado e corrigido:** a migração
  não gravava o carimbo `credencialCadastradaEm` — os cartões migrados diziam "Não
  cadastrado" com a credencial na gaveta e **travavam** os botões Carregar. Backfill
  aplicado nos 2 locais + script corrigido (`fix: migracao grava o carimbo`).
  **T4 ✅ (print do Sergio, 20/08 ~21h30):** pós-backfill, "Cadastrado em 19/08/2026",
  botões destravados, os 4 médicos preenchidos (Amanda, Camila, Nagib, Sérgio) e o
  procMap com os mapeamentos certos. **FASE 1 FECHADA** (T7 dispensado — a Fase 2 cobre
  a importação real amanhã).
- Fase 2: ☐  ·  Fase 3: ☐  ·  Pós-barreira: ☐
