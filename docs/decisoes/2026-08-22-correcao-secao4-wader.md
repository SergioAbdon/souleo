# ADR — Correção da Seção 4 (Wader / DICOM / Orthanc)

**Data:** 21-22/08/2026 · **Branch:** `feat/secao4-wader` (base `9cbde9c`) ·
**Status:** implementada e revisada; merge/deploy/regra aguardando confirmação do Sergio.

## Contexto

Revisão da Seção 4 pela tríade (20/08, `docs/planos/2026-08-20-revisao-secao4-wader.md`):
30 achados na lógica de ingestão (aparelho → Orthanc → casamento por ACC → medidas
do SR → laudo) + 7 cortes Ponytail. Todas as decisões tomadas pelo Sergio no 1-a-1
(tabela DECISÕES FINAIS do doc de revisão). Execução pela esteira
subagent-driven (15 tasks, implementador + revisor por task, tríade final
adversarial + onda de fix). Plano: `docs/planos/2026-08-21-plano-correcao-secao4-wader.md`.

## Decisões principais (as do Sergio — lei)

- **D1b** Schema antigo de medidas NÃO importa — reprocessa do original no Orthanc
  (flag `reprocessarDicom`; mutirão opcional `reprocessar-legado`). Mata o erro de
  10× (achados 1-2). A suspeita de 12/05 apontava para arquivo morto
  (`adaptador-motor.js`, apagado na T14) — o defeito real era o ramo legado do
  `dicom-sr-mapping.ts`.
- **D2** CPF do DICOM ≠ CPF do exame (ambos presentes, 11 dígitos, ≠ feegowPacienteId)
  → match BLOQUEADO, cai na conferência.
- **D3a** Tela de conferência no console (`/conferencia`, fora da recepção):
  vincular / trocar vínculo / excluir-p/-reenvio / reprocessar; sugestões por CPF;
  operador declarado + confirmação por nome digitado.
- **Excluir-p/-reenvio: DELETE direto, SEM quarentena** — o Vivid é o registro-mãe
  (LEO + Vivid guardam tudo; Orthanc não é cópia única). Ressalvas técnicas
  mantidas: ordem fixa marca→limpa→auditoria→DELETE→forget(finally), trava
  `estudosEmExclusao` conferida antes de cada write, recusa em emitido, 409 em
  UI-only, fingerprint anti-corrida, auditoria append-only em
  `workspaces/{ws}/auditoria` (só Admin SDK — sem regra nova). Disparo autenticado
  pelo LEO web = proteção futura.
- **Régua (i) estrita no recovery**: só entra sozinho ACC exato + CPF ok; o resto é
  vinculação manual.
- **16 ampliado**: Wader repassa TUDO do SR (nada descartado; não-classificado
  marcado); perfil do aparelho CUSTOMIZÁVEL em Integrações
  (`integracoes/perfilAparelho`, semeado GE Vivid T8, fallback embutido —
  config ausente nunca desliga comportamento); editor com "Mapeadas" +
  "Recebidas sem destino"; modal mostra "N de M mapeadas" e o campo de destino.
- **19a sim / 19b NÃO**: carimbo `parserVersao` entrou; validação de faixa
  clínica NÃO — julgamento de valor é exclusivo do médico (transparência + olho).
- **D4** Emitido = cofre (campos `*Pendente` + `dicomAtualizacaoPendente`, badge
  na fila); nem vínculo manual limpa dono emitido.
- **D5b** Imagens privadas AGORA: upload sem ACL pública, URL canônica vira
  identificador, exibição/PDF via URL assinada 1h (rota `imagens-urls` com
  confinamento ao prefixo `dicom/{ws}/{exame}/` — um Critical de revisão fechou o
  oráculo de assinatura), remoção das imagens na exclusão do exame, script
  `imagens:privar` (dry-run; `--commit` pós-deploy, decisão do Sergio).
- **D6** Única janela autorizada no Motor/laudo: tela viva (onSnapshot), modal
  estável, guarda de emissão, galeria assinada, consumo do perfil, reprocesso UI.
  Exceção usada por D6 E D5b (galeria) — registrado aqui de propósito. Fora
  disso, 1 comentário corrigido na T10 (precedente controlado, não regra).
- **D7** 7 cortes Ponytail + achado 30 (config de backup decorativa) executados.
- **Latência**: tick 5s (com clamp ≤15s no load — o config da clínica tinha 30
  explícito), SR processado na chegada (`NewSeries` → `soMedidas`), guarda de
  emissão avisa imagens pendentes/0 selecionadas.

## O que a tríade final atacou e resistiu

Guarda de CPF, régua estrita, wlHash (26 tags preservadas), trava de exclusão,
confinamento de assinatura, regra `perfilAparelho` (fail-closed; wildcard
intacto), schema antigo = [], nImgTentadas, batimento 2-Waders, CSRF do console.
Onda final corrigiu 26 itens (5 altos: paginação do recovery, regravação atômica
do .wl, meia-escrita na exclusão, cofre sem vitrine, refs da tela viva na
navegação laudo→laudo).

## Dívidas registradas (não bloqueiam)

- Alarme do parser (`CODIGOS_CONHECIDOS`) é hardcoded — quando o perfil for
  editado, alarme e perfil divergem; evolução: Wader ler o perfil.
- Validação do `campo` do perfil contra a lista real de inputs do motor.
- Console local sem autenticação (`/conferencia` acessível na máquina) — decisão
  atual: 127.0.0.1 + fora da recepção; disparo autenticado via LEO = futuro.
- `imagensSelecionadasPdf` de exame reprocessado pode zerar a seleção (aviso da
  guarda cobre); janela teórica de gravação-fantasma na exclusão (recuperável).
- e2e não rodado na esteira (ambiente); verificação visual do Sergio pendente
  (roteiro de 5 passos no task-12-report).

## Pendências da visita à clínica (ordem OBRIGATÓRIA)

1. Atualizar o Wader (acumula Sub-plano 5 + Seção 3 + **Seção 4**);
2. SÓ DEPOIS `integracoes:limpar -- --commit`;
3. `FEEGOW_API_TOKEN` fora do Vercel; 4. trocar senha do Orthanc;
5. Testes de 2 min: T8 re-renderiza cabeçalho na reexportação? retenção/purga do
   arquivo do Vivid? `StableAge` 60→30s no orthanc.json; conferir log "cursor à
   frente do feed" ao reiniciar o Orthanc (validação do achado 10);
6. `reprocessar-legado` em dry-run antes do 1º `--commit`;
7. Pós-deploy web: `imagens:privar` dry-run → `--commit` (quando o Sergio mandar).

## Placar

Partida: unit 67 · api 182 · rules 132 · wader 41 · e2e 5. Fechamento: unit 109 ·
api 196 · rules 142 · wader 104 · tsc/build limpos. Mapa das 8 seções: 1-4
fechadas; restam 5, 6 (motor — maior risco clínico), 7 e 8.
