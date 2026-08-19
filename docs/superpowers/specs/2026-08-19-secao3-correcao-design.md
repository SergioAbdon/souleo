# Correção da Seção 3 (Feegow) — Design

> **Status:** desenho aprovado pelo Dr. Sérgio em 19/08/2026 (D1, D2 e D3 pelo
> AskUserQuestion; D4 e D5 na conversa). Nada implementado ainda.
> **Origem:** `docs/planos/2026-08-19-revisao-secao3-feegow.md` — tríade, 22 achados.
> **Plano:** `docs/planos/2026-08-19-plano-correcao-secao3-feegow.md`.

## O diagnóstico em uma linha

Os 22 achados são 6 doenças: (A) a nuvem acha que alcança o Orthanc; (B) vazio
tratado como valor; (C) identidade mal escolhida para o exame importado; (D) falha
silenciosa como padrão; (E) tempo sem fonte única no Wader; (F) a tradução do
Feegow fora da camada testável.

## Fatos verificados que sustentam o desenho (19/08, produção + API real)

- **A nuvem nunca alcançou o Orthanc**: 100% dos `mwlStatus` recentes = `falhou`
  (16/16); a worklist do Vivid sempre veio do Wader (arquivos `.wl` que o Orthanc
  serve por C-FIND). O "estudo fantasma" do achado 6 nunca se materializou — a
  chamada morre antes. O indicador "SEM MWL" da fila acusa falha em todo exame
  importado: **alarme falso permanente**.
- **O Feegow preserva o `agendamento_id` ao remarcar** (provado: agendamento 66890,
  importado em 03/08, hoje diz 17/08 — mesmo id). O furo do remarcar ainda não
  mordeu porque só 23 dos 205 exames usam a identidade `fg-{id}` (entrou em 15/08).
- **O filtro de data da API é honrado** (`data_start`/`data_end` respeitados) e a
  resposta traz `status_id` por item — dá para reconciliar com UMA consulta.
- **`nascimento` vem como `DD-MM-YYYY`** nos dados reais; o guard aceita também ISO.

## Decisões

| # | Decisão | Racional |
|---|---|---|
| D1 | **Cada lado fala só com quem alcança.** A nuvem para de falar com o Orthanc: a rota `/api/orthanc` inteira morre (incl. `criar_mwl`), o botão "Testar conexão" do cartão Orthanc sai, e o estado do cartão passa a vir do **batimento do Wader** (que verifica o Orthanc da rede local e reporta). O indicador "SEM MWL" passa a ser gravado pelo Wader no momento em que escreve o `.wl` — só então ele diz a verdade. | A topologia é imutável: Vercel não enxerga `localhost` da clínica. Todo caminho nuvem→Orthanc é fadado a falhar; mantê-lo é fabricar alarme falso. |
| D2 | **Identidade do exame importado = `fg-{agendamento_id}-{dataExame}`.** Sem migração; vale só para importações novas. | A trava existe para impedir o mesmo exame do MESMO dia entrar duas vezes. Mesmo agendamento em dias diferentes = dois exames de verdade (o 66890 prova: uma falta em 03/08 + um emitido em 17/08). Descartado reaproveitar o doc antigo mudando a data: apagaria a falta do histórico e criaria o caso "e se já foi laudado". |
| D3 | **Reconciliação na própria importação.** A consulta do dia deixa de filtrar `status_id=4`: traz tudo, importa os aguardando (4) e marca `nao-realizado` os exames FEEGOW ainda `aguardando` cujo agendamento está em {6, 11, 22, 15}. Regra do ADR de 16/05: nunca apagar, nunca tocar em {2,3,5}. | Uma consulta só resolve importação + reconciliação. A fila fica verdadeira ao longo do dia, sem botão novo. |
| D4 | **"Estado sem mentira" estendido ao Feegow** (mesmo princípio da spec do Sub-plano 5 §5.2). A importação devolve e a tela mostra a contagem inteira: criados, **ignorados por procedimento não mapeado** (com ids), **falhas de busca** (com ids), **reconciliados**. O "Atendido" que falha grava `feegowStatusOk: false` no exame (padrão do `mwlStatus`), sem travar a emissão e sem tocar no motor. | Falha silenciosa foi a causa de metade dos achados. O que não aparece, ninguém conserta. |
| D5 | **Configuração do Feegow completa no cartão** de Integrações: o `profMap` migra do LocalModal (mesmo movimento já feito com o `procMap`), e o liga/desliga (`ativo`) ganha toggle e passa a ser **respeitado pela importação**. `PROC_MAP` embutido morre: mapa vazio = erro claro (`feegow_sem_procmap`), não adivinhação. | Critério da Seção 5: a configuração de uma integração mora num lugar. Mapa default com IDs de um inquilino específico dentro do código do produto importaria consultas como eco numa segunda clínica, sem erro. |
| D6 | **Endurecimentos herdados**: `#7c` na gravação da ficha (vazio = não mexe), CPF validado por dígitos, dedup de ficha por CPF, fonte única de "hoje" no Wader (`America/Belem`), `montarCandidatos` para a camada testável, tipo `AcaoFeegow` no contrato, regra `intacto('ortancAtivo')` fechando o outro lado do espelho. | Cada um fecha um achado com nome (1, 2, 9, 10, 11, 13, 14, 17, 19). |

## O que o Sergio vê mudar

- O cartão do Orthanc em Integrações deixa de ter "Testar conexão" e passa a dizer
  o que a máquina da clínica reporta ("Conexão OK — verificada há 3 min pela
  clínica"). O do Feegow mantém o teste (a nuvem alcança o Feegow de verdade).
- A importação passa a contar a verdade: "7 importados · 1 ignorado (procedimento
  não mapeado: 400) · 1 falha · 2 marcados não-realizado".
- O indicador "SEM MWL" some do alarme falso e volta a significar algo.
- O mapa de médicos (profMap) e o liga/desliga do Feegow aparecem no cartão.

## Fora de escopo (nomeado para não voltar por engano)

- Console de reconciliação do Wader (ADR 26/06) — segue futuro.
- Consertar o `handleDesbloquearId` do `SidebarLaudo` (motor, intocável; a chamada
  já morria em 401 antes desta fase). Registrado como follow-up de task própria.
- Surfacing do `feegowStatusOk` na fila/histórico — o campo nasce agora; a UI dele
  é follow-up.
- Corrigir a data dos 13 exames de maio (laudados em data posterior — explicado,
  histórico, sem ação).

## Riscos

| Risco | Mitigação |
|---|---|
| Apagar `/api/orthanc` órfã algum chamador | Ponytail já varreu: único chamador vivo é `criar_mwl` na Worklist, que morre junto. O grep é repetido na task. |
| Identidade nova × exames antigos | Zero interseção: docs antigos têm id aleatório ou `fg-{id}` sem data; a chave nova nunca colide com as velhas. |
| Reconciliação marcar exame errado | Regra fechada: só `origem=FEEGOW`, só `status=aguardando`, só `dataExame=hoje`, só ids em {6,11,22,15}. Payload real em teste. |
| Wader: mudanças pegam a atualização pendente da clínica | As mudanças do Wader (fuso, batimento, mwlStatus) entram na MESMA atualização já pendente do Sub-plano 5 — uma ida só. |
| Regra nova (`intacto('ortancAtivo')`) | Publicação com confirmação do Sergio, teste de regra antes. |
