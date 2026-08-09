# 2026-06-26 — Wader: console de reconciliação LEO ↔ Vivid (nova interface)

> **Status:** Em implementação (Fase 1) · **Branch:** `feat/wader-console` (base: `feat/wader-latencia`)
> **Autor:** Dr. Sérgio (decisões) + Claude (PC clínica MedCardio)

## Contexto / dor real

A "interface" atual do Wader são 3 páginas HTML cruas (`/`, `/admin`, `/wizard`) servidas em `localhost:8043`, e o processo roda numa janela `cmd` minimizada. Não é um programa de verdade.

Dores observadas em produção (22/06): vincular **exames órfãos** é o ponto mais difícil e frequente:
- **Identidade trocada** — 2 pacientes "Gabriela" tiveram os estudos vinculados ao paciente errado; corrigir no Vivid é complexo.
- **Sem ACC** — Francisley: o exame de carótida não existia no LEO (bug de fuso, ver [2026-06-22-... feegow]), recepção fez no Vivid sem ACC → estudo chega órfão, sem chave de match.
- Hoje a "solução" foi eu rodar scripts na mão (`link-armando`, `recover-acc`, `recon-orthanc`).

## Decisão

Construir uma **console de reconciliação** como nova interface do Wader, que mostra lado a lado:
1. **Agenda do LEO** (exames do dia no Firestore) — nome, ACC, procedimento, status.
2. **Recebido do Vivid** (estudos no Orthanc) — nome, ACC (ou vazio), nº imagens, nº SR.
3. **Status do vínculo** — casado (ACC bate) · aguardando Vivid · órfão.

Ações:
- **Editar exame** (nome, ACC, etc.) → grava no Firestore (facilita o envio antes do exame).
- **Vincular/reatribuir órfão** → escolhe na mão a qual exame do LEO o estudo pertence (ou cria novo), **ignorando o ACC/identidade do DICOM**. Reusa a lógica já provada de `processarEstudo`. Resolve os dois casos (Gabrielas trocadas; Francisley sem ACC) **sem tocar no Vivid**.
- **Preventivo:** badge "sem ACC gerado" + alerta "possível troca" (nomes parecidos no mesmo dia).

## Princípio inegociável: NÃO quebrar o Wader em produção

- **Aditivo, não destrutivo:** só ADIciona rotas/páginas. Workers e adapters atuais ficam intocados.
- **Reuso 100% do backend:** "nova versão" = mesma base + interface por cima. Não é fork.
- **Flag `WADER_UI_ONLY`** (nova, env/config): sobe servidor + console SEM os workers. Permite rodar uma instância de DEV noutra porta (ex.: 8044) na mesma máquina sem dois Waders processarem os mesmos exames (escrita dupla).
- **Deploy só explícito:** `C:\Wader` (cópia manual) só muda via `update-wader.ps1` (backup + restart). Até lá, produção idêntica.

## Casca (janela nativa) — DECISÃO ADIADA

A console em si é UI web servida pelo Fastify (independe de framework). O empacotamento como app nativo (tray + janela + instalador) fica pra Fase 3, escolhendo entre **Tauri** (~15MB, leve — PC roda Orthanc+Vivid) e **Electron** (entrega mais rápida). Reabre a decisão original (doc 00-arquitetura §4.4 rejeitava Electron) porque agora QUEREMOS interface de usuário.

## Plano

- **Fase 1:** flag `WADER_UI_ONLY` + endpoint de reconciliação (cruza exames × estudos) + ações editar/vincular.
- **Fase 2:** UI real (substitui as 3 páginas cruas) + tela de config/wizard.
- **Fase 3:** casca nativa (Tauri/Electron) — tray, janela, instalador, fim do `cmd`.

## Para o outro Claude (notebook)

Se for mexer em `apps/wader/`, ciente desta branch. O backend (workers/adapters/`dicom-ingest`) NÃO deve ser alterado por este trabalho — só adições em `ui/`. A branch `feat/wader-latencia` (latência, ainda não no master) é a base; precisa chegar ao master em algum momento (coordenar).
