# 2026-10-07 — Dia de incidentes na clínica: Wader morto por console travado, 7 códigos novos do Feegow, imagens tardias em laudo emitido

> **Status:** ✅ **Tudo resolvido no mesmo dia** (dados da clínica), com 1 fix de código
> (`update-wader.ps1`) e 3 scripts operacionais novos em `C:\Wader`. **Pendente de
> decisão do Sergio:** merge `feat/wader-console` → `master` (import por nome, ADR
> 2026-09-21) — a causa de 2 dos 4 incidentes continua em produção.
> **Dono:** Claude da clínica (MedCardio). **Origem:** 4 reclamações do Dr. Sergio
> ao longo da tarde, todas com exame real de paciente em jogo.
> **Espelho Obsidian (`Leo/Decisões/`):** pendente — o vault não existe nesta máquina;
> Claude do notebook espelha no próximo `/sync-me-up`.

## Resumo em 4 linhas

| # | Sintoma relatado | Causa raiz | Solução aplicada |
|---|---|---|---|
| 1 | "Jheize não aparece no worklist" | Feegow criou `procedimento_id` **392** ("Trantorácico", com typo); procMap por ID não tinha | `392 → eco_tt` nos 2 procMaps; Sergio reimporta |
| 2 | "Mario: não chegou todas as imagens da carótida nem as medidas do eco" | **Wader morto às 16:08** (AppHang do console cmd); estudos chegaram com ele parado | Restart com stdout → arquivo; cursor recuperou tudo sozinho |
| 3 | "Marcia: sem imagens; eco não está no worklist" | Mesma queda do Wader (#2). Eco ESTAVA no LEO (17:30, status andamento após restart) | Mesma do #2 + esclarecimento |
| 4 | Carótidas do Mario e da Marcia **emitidas** antes das imagens chegarem | Cofre do emitido (ADR 22/08 D4): imagens foram pra `*Pendente`; LEO não tem botão pra promover | Script `promover-pendentes.ts` a pedido do Sergio, com auditoria; ele reemite |
| 5 | "Marlina não aparece no LEO nem no Vivid" | Feegow criou `procedimento_id` **403** às 14:38 (encaixe); + 391/396/399/402/404 também faltavam | `add-procmap-faltantes.ts --commit`: 6 códigos de uma vez |

## Incidente 1 e 5 — códigos novos do Feegow (3º, 4º… 9º caso em 3 semanas)

**Causa raiz, confirmada com dado real:** o Feegow cria um `procedimento_id` NOVO de
"Exame - Ecocardiograma Transtorácico" praticamente **a cada encaixe/convênio**. Hoje:
392 (criado 28/09), 403 (criado 07/10 14:38, encaixe da Marlina) e mais 391, 396, 399,
402, 404 que ninguém tinha percebido. O import em produção (`/api/feegow`, master) casa
por ID fixo em `workspaces/{ws}/integracoes/feegow.procMap` → código novo = exame
invisível → sem exame no LEO o Wader não gera `.wl` → Vivid também não vê.

**Por que ainda acontece se o ADR 2026-09-21 "resolveu":** o commit `fa29db2`
(`classificarProcedimentoPorNome`) está **só em `feat/wader-console`**. O master
recebeu apenas o ADR (`da26a8b`), não o código. Vercel publica master.

**Solução imediata (dados):** procMap agora com **28 códigos**
(6/194/291/303/306/311/312/313/319/320/323/324/351/369/377/379/380/391/392/396/399/402/403/404
= eco_tt; 67/285 = doppler_carotidas; 55/127 = eco_stress).

**Solução durável (código, pendente):** merge `feat/wader-console` → master. Com o
classificador por nome, 403 teria entrado sozinho ("exame" + "ecocardiograma").

## Incidente 2 e 3 — Wader morto por AppHang do console

**Linha do tempo (hora local Belém):**
- 15:37 Claude inicia Wader via `cmd /c npm start`, janela minimizada, **stdout no console**.
- 16:06 Wader processa carótida do Mario: **5 de 12 imagens** (estudo ainda chegando), `nImgTentadas: 5`.
- 16:08:46 **Windows Error Reporting 1001 `AppHangXProcB1`**: `cmd.exe` → `node.exe` travado. Leitura: alguém clicou na janela do console, o modo seleção (QuickEdit) bloqueou o `write` do pino no stdout, o event loop do node congelou, a janela foi fechada → processo morto. Último write do `.wader-ingest-state.json`: 16:08.
- 16:12 restante da carótida + SR do Mario chegam. 16:17 eco do Mario (pai, ACC 258). 16:18–16:40 carótida e eco da Marcia, eco do Mario Filho (ACC 252). **Nada processado** — Orthanc `/changes?last` = 5631, cursor Wader = 5558.
- 16:45 restart com `npm start >> wader-run.log 2>&1`. Cursor `lastSeq` (ADR 2026-05-18) retoma do 5558 e processa os 5 estudos em ~50 s. 16:47 cursor = Orthanc.

**Causa raiz:** iniciar processo de longa duração com saída no console interativo do
Windows. Não é bug do Wader; é o modo de iniciar. O `update-wader.ps1` oficial tinha o
mesmo comando sem redirecionamento.

**Fix de código:** `apps/wader/scripts/update-wader.ps1` (commit `bb1e0fd`) redireciona
pro `wader-run.log`. Cópia em `C:\Wader\scripts\` atualizada. Comando canônico:

```
Start-Process cmd.exe -ArgumentList '/c','cd /d C:\Wader && npm start >> wader-run.log 2>&1' -WindowStyle Minimized
```

**Diagnóstico que funcionou (reutilizável):** `Get-WinEvent Application` filtrando
`Windows Error Reporting`; comparar `curl localhost:8042/changes?last` com `lastSeq` do
`.wader-ingest-state.json`. Se Orthanc > cursor, o Wader ficou parado nesse intervalo.

**Dívida que fica:** Wader ainda roda manual, sem serviço Windows nem supervisor. Uma
queda só é percebida quando um médico reclama. (INSTALAR.txt já previa "registrar como
Windows Service" — nunca feito.)

## Incidente 4 — imagens tardias em laudo já emitido (cofre D4)

Dr. Sergio emitiu as duas carótidas enquanto o Wader estava morto, só com o que havia
(Mario: 5 imagens, Marcia: 0). Quando o Wader voltou, por **regra** (ADR 2026-08-22 D4,
"emitido = cofre, nada muda sem humano"), tudo foi pra `imagensDicomPendente` /
`medidasDicomPendente` + `dicomAtualizacaoPendente = true`. A worklist mostra a pílula
"📥 DICOM NOVO — REVISAR"… **e não existe ação no LEO pra promover.** A fila existia só
no Firestore (dívida já listada no ADR 22/08: "console local sem autenticação / disparo
autenticado via LEO = futuro").

**Decisão do dia (Sergio, 07/10):** "vou reemitir os laudos, mas baixe as imagens para o
LEO". Promoção manual via Admin SDK — `C:\Wader\promover-pendentes.ts`:
- espelha o caminho não-cofre do `dicom-ingest.ts`: merge por `orthancInstanceId` +
  `ordenarPorAquisicao`; medidas só se ao vivo vazio; ponteiros do estudo
  (`dicomOrthancStudyId/dicomStudyUid/dicomMeta`) só se ausentes (caso Marcia);
- **status não muda** (continua emitido — o médico reemite);
- remove `imagensSelecionadasPdf` (galeria nova entra no default das 8 primeiras);
- grava `auditoria/` append-only com motivo e contagens;
- dry-run por padrão, `--commit` pra gravar.

Resultado: Mario 12 imagens + 5 medidas; Marcia 10 imagens + 5 medidas + ponteiro do
estudo `8c7cdf2e…`. Filas vazias.

**Pergunta aberta (produto):** a fila de revisão precisa de um botão no LEO
("Aplicar imagens novas") ou de uma ação na `/conferencia` do Wader? Hoje depende de
um Claude com Admin SDK. Decisão do Sergio.

## Scripts operacionais novos em `C:\Wader` (não versionados — a pasta não é git)

| Script | O que faz | Grava? |
|---|---|---|
| `feegow-diag-nome.ts NOME` | agendamentos de hoje do paciente no Feegow: status_id, proc_id, nome, o que o import faria; exames do LEO | não |
| `add-procmap-faltantes.ts [--commit]` | varre `/procedures/list`, classifica por nome, adiciona faltantes nos 2 procMaps | com `--commit` |
| `diag-paciente-hoje.ts NOME` | Orthanc (estudos/séries/SR) × Firestore (campos DICOM ao vivo e pendentes) × cursor do Wader | não |
| `promover-pendentes.ts IDS [--commit]` | promove fila `*Pendente` de exame emitido pros campos ao vivo + auditoria | com `--commit` |

Candidatos a entrar em `apps/wader/scripts/` no repo — decisão do notebook (os scripts
dependem de `./src/config/load` e `./src/adapters/firebase` da cópia local).

## O que o Sergio precisa decidir / fazer

1. **Merge `feat/wader-console` → master** (deploy Vercel). Sem isso o incidente 1/5
   repete amanhã. Claude da clínica não faz push na master sem confirmação.
2. Reemitir as carótidas do Mario e da Marcia (imagens já ao vivo).
3. Clicar "Feegow" na Agenda pra Jheize e Marlina entrarem.
4. (Produto) botão de "aplicar DICOM pendente" no LEO — sim/não/quando.
5. (Infra) Wader como serviço Windows ou supervisor com restart — quando.

## Memórias locais atualizadas (PC clínica)

`feedback_feegow_procmap_codigo_novo_eco.md` (28 códigos, comando de 1 linha, fa29db2
fora do master) e nova `feedback_wader_start_console_hang.md` (comando canônico de
start, diagnóstico de queda, cofre sem botão).
