# Wader Fase A — Runbook da instalação na MedCardio

> **Para:** Claude da PC da clínica (`C:\souleo`) + Sergio, na visita.
> **Pré-condição:** `git pull origin master` (master ≥ `a5327e0`, 12/10/2026). Ler antes o ADR
> `docs/decisoes/2026-10-11-wader-fase-a-decisao.md` (seções "Ensaio da instalação" e "Release").
> **Tempo:** ~20 min. **Precisa de uma sessão PowerShell como administrador** (UAC) para os passos 2 a 4.

## O que vai acontecer

O Wader de hoje (`npm start` numa janela cmd em `C:\Wader`) é substituído por `wader.exe` rodando como
**serviço do Windows** (`Wader`, conta `NT AUTHORITY\NetworkService`, início automático), instalado em
`C:\Program Files\Wader` com dados em `C:\ProgramData\Wader`. A config, a credencial (`sa.json`) e a
posição da fila (`.wader-ingest-state.json`) são **migradas**; `C:\Wader` fica intacto como reserva.
O workspace continua `medcardio`, o `agentId` continua `wader-001`, o Orthanc continua o da clínica
(a URL vem do Firestore, não muda nada).

## Passo 0 — antes de tocar em nada (sem admin)

```powershell
cd C:\souleo; git pull origin master; git log --oneline -1
Get-Content C:\Wader\wader.config.json          # conferir wsId=medcardio, agentId=wader-001, worklistPath
Test-Path C:\Wader\wader.config.local.json      # se True: os valores reais podem estar AQUI — o migrar avisa; conferir qual vale
Get-Content C:\Wader\DEPLOYED.json -ErrorAction SilentlyContinue   # qual commit roda hoje (registrar no ADR)
```

Baixar o instalador da release (repo público):
`https://github.com/SergioAbdon/souleo/releases/download/wader-v1.0.0/Wader-Setup-v1.0.0.exe` (38 MB)
para `C:\Users\<usuario>\Downloads`. Se o navegador/SmartScreen reclamar: "Mais informações → Executar assim mesmo" (sem assinatura nesta fase, previsto).

Escolher o **PIN de 6 dígitos** do painel de atualização (quem clica em "Atualizar" digita isso). Anotar num lugar seguro.

## Passo 1 — migração (PowerShell **como administrador**)

```powershell
cd C:\souleo\apps\wader\scripts
.\migrar-medcardio.ps1                 # DRY-RUN: só mostra o que faria; ler a saída inteira
.\migrar-medcardio.ps1 -Commit         # executa: pede o PIN, mata o node do Wader antigo (espera até 30 s),
                                       # copia config/sa/cursor para C:\ProgramData\Wader, reescreve o caminho do sa.json,
                                       # aplica a ACL (só Administradores, SYSTEM e NetworkService)
```

Esperado no fim: `OK ... Agora rode o Wader-Setup`. Se der `icacls falhou` ou `nao morreu em 30 s`, parar e me chamar — não seguir.

## Passo 2 — instalar (dois cliques, UAC)

Rodar `Wader-Setup-v1.0.0.exe`. Como `C:\ProgramData\Wader\wader.config.json` já existe, o assistente **não pede dados**. Ao terminar, o serviço já está no ar.

## Passo 3 — conferir (sem admin basta)

```powershell
Get-CimInstance Win32_Service -Filter "Name='Wader'" | Select Name,StartName,StartMode,State   # NetworkService / Auto / Running
curl.exe -s http://127.0.0.1:8043/health        # schema 1, versao 1.0.0, lider true, aviso null
curl.exe -s http://127.0.0.1:8043/api/dicom/worker | Select-String lastSeq   # lastSeq igual ao de antes (cursor migrado)
(Get-ScheduledTask -TaskName Wader-Aviso).State  # Running
```

Com admin: `icacls C:\ProgramData\Wader` → só SERVIÇO DE REDE (M), SISTEMA (F), Administradores (F), nada herdado.
`Get-Content C:\ProgramData\Wader\logs\wader-service.out.log -Tail 20` → "Sou o líder deste workspace", "DICOM ingest worker iniciado (cursor persistido)".

No LEO web, Integrações → cartão Wader: "No ar", versão 1.0.0, `Líder: <nome da PC>`.

## Passo 4 — o que mais fazer na mesma visita

1. **"Não incomodar" desligado** no Windows da recepção (painel de notificações, ícone azul no topo). Sem isso o aviso na tela nunca aparece. Testar: `Stop-Service Wader` (admin) → toast "Wader parado" → `Start-Service Wader` → "Wader de volta (v1.0.0)".
2. **Autostart antigo:** conferir que não existe atalho em `shell:startup` / tarefa agendada que suba o `npm start` do `C:\Wader` no boot (se existir, remover). O migrar só mata o processo em execução.
3. **Atalho na área de trabalho** para `http://127.0.0.1:8043/conferencia` (a conferência/vínculo por ACC continua lá; não há mais janela).
4. **Senha do Orthanc fora do histórico público do git** (tarefa separada de 10 min, já pendente desde 19/08).
5. Registrar no ADR (`docs/decisoes/2026-10-11-wader-fase-a-decisao.md`, nova seção "Instalação na MedCardio — DD/MM"): commit que rodava antes, hora, qualquer desvio. `git add`, commit, push.

## Se der errado

- Serviço não sobe: `Get-Content C:\ProgramData\Wader\logs\wader-service.err.log -Tail 30` e `updates\lancador.json`. Código 2 = config/credencial/porta (conferir `wader.config.json` em ProgramData e se o `npm start` antigo ainda ocupa a 8043).
- Voltar ao antigo (reserva): `Stop-Service Wader; Set-Service Wader -StartupType Disabled`, depois `cd C:\Wader; npm start` como antes. Nada do antigo foi apagado.
- `C:\Wader` só deve ser apagado depois de uma semana estável.

## Depois (não é na visita)

- Primeira mudança real → release `wader-v1.0.1` → em até 1 h o painel avisa → botão "Atualizar" + PIN. É o ensaio real de atualização (plano Task 8, passo 6).
- Fase B (bandeja + janela com fila de pendentes) começa depois de uns dias de A estável.
