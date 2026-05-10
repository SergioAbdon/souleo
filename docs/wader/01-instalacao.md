# Wader — Guia de Instalação na Clínica

> **Versão:** 1.0 (07/05/2026)
> **Público-alvo:** Você (Dr. Sérgio) ou IT da clínica
> **Tempo estimado:** 30–45 minutos por clínica nova

---

## Visão geral

Wader é um programa local que precisa ser instalado **uma vez por máquina** em cada clínica. Ele se comunica com o Orthanc local (rede da clínica) e com o LEO Cloud (Firebase).

```
┌──────────────────────────────────────┐
│      PC LOCAL (clínica)              │
│  ┌──────────┐         ┌──────────┐  │
│  │ Vivid T8 │◄────────┤ Orthanc  │  │
│  └──────────┘  DICOM  └─────┬────┘  │
│                              │ REST  │
│                              ▼       │
│                       ┌──────────┐   │
│                       │  Wader   │   │
│                       └─────┬────┘   │
└─────────────────────────────┼────────┘
                              │ HTTPS
                              ▼
                      ┌─────────────┐
                      │  Firestore  │
                      │  + Storage  │
                      └─────────────┘
```

---

## Pré-requisitos da máquina

| Item | Mínimo | Como verificar |
|---|---|---|
| Sistema operacional | Windows 10/11 | `winver` |
| Node.js | 20.x ou superior | `node --version` |
| Memória RAM livre | 200 MB | Task Manager |
| Disco livre | 500 MB | `dir` |
| **Orthanc** instalado | qualquer versão recente | tentar `http://localhost:8042/system` no navegador |
| **OneDrive** sincronizando | configurado | ícone azul/verde na bandeja |
| Acesso à internet | sempre disponível | `ping souleo.com.br` |

---

## Etapa 1 — Configurar workspace no LEO web

**Quem faz:** você, no painel admin do LEO (souleo.com.br)
**Tempo:** 5 minutos

1. Logar como admin no LEO web
2. Ir em "Direx → Painel → Clientes"
3. Localizar o workspace da clínica (ou criar novo)
4. Abrir o **LocalModal** (configurações da unidade) e preencher:
   - **Orthanc URL:** `http://192.168.X.Y:8042` (IP do PC onde Orthanc roda na clínica)
   - **Orthanc User:** geralmente `leo`
   - **Orthanc Pass:** senha definida no `orthanc.json`
   - **Orthanc Ativo:** ✅ marcar
5. Salvar
6. **Anotar o `wsId`** do workspace (visível na URL ou no painel)

---

## Etapa 2 — Gerar Service Account Firebase

> **Por enquanto** (até implementarmos o gerador automático de SA por workspace), reusamos a SA dev manualmente.

1. Firebase Console → projeto `leo-sistema-laudos` → Configurações → Contas de serviço
2. "Gerar nova chave privada" → baixar JSON
3. Copiar o JSON pro PC da clínica (via TeamViewer/RDP) em local seguro **fora do repositório**, ex: `C:\ProgramData\Wader\sa.json`
4. Restringir permissões NTFS (Properties → Security): só usuário do serviço Wader pode ler

> **Roadmap:** quando o sistema escalar, vamos criar geração automática de SA por workspace via Cloud Functions, sem cópia manual.

---

## Etapa 3 — Instalar e configurar o Wader

**Tempo:** 15 minutos

### 3.1 Copiar o Wader pra máquina

> **Hoje:** rodamos via `tsx` em modo desenvolvimento. Empacotamento `.exe` virá em fase futura.

1. Copiar a pasta `apps/wader/` do repositório (sem `node_modules`) pra máquina da clínica
2. Local recomendado: `C:\Wader\` (raiz, fora de pasta de usuário)
3. Abrir terminal (cmd ou PowerShell) **como admin** em `C:\Wader\`
4. Rodar: `npm install`

### 3.2 Criar o arquivo `wader.config.json`

Na pasta `C:\Wader\`, criar `wader.config.json`:

```json
{
  "version": "1.0",
  "wsId": "ID_DO_WORKSPACE_AQUI",
  "agentId": "wader-001",

  "firebase": {
    "serviceAccountPath": "C:\\ProgramData\\Wader\\sa.json",
    "projectId": "leo-sistema-laudos"
  },

  "orthanc": {
    "worklistPath": "C:\\Orthanc\\worklists"
  },

  "backup": {
    "path": "C:\\OneDrive\\LEO-DICOM",
    "retentionDays": 30
  },

  "polling": {
    "worklistSyncSec": 60,
    "orthancChangesSec": 30
  },

  "ui": {
    "port": 8043,
    "showTrayIcon": true
  }
}
```

**Substituir:**
- `wsId`: ID do workspace anotado na Etapa 1
- `serviceAccountPath`: caminho do JSON da SA salvo na Etapa 2
- `worklistPath`: pasta onde o Orthanc lê arquivos `.wl`. Confira em `orthanc.json`, campo `WorklistsDatabase`. Caminhos comuns:
  - `C:\Orthanc\worklists`
  - `C:\Program Files\Orthanc Server\worklists`
- `backup.path`: pasta sincronizada com OneDrive (ou Google Drive, ou NAS) onde DICOM cru será copiado

### 3.3 Validar configuração

No terminal (em `C:\Wader\`):

```cmd
npm start
```

Espera-se ver:

```
INFO: Wader iniciando…
INFO: Configuração carregada {wsId: "...", agentId: "wader-001"}
INFO: Firebase inicializado {projectId: "leo-sistema-laudos"}
INFO: Pasta worklists validada e pronta
INFO: Worker de sync de worklist iniciado {intervalSec: 60}
INFO: DICOM ingest worker iniciado {intervalSec: 30}
INFO: UI server iniciado em http://localhost:8043
```

Abrir `http://localhost:8043/admin` no navegador. Deve mostrar painel com:
- ✅ Worker Worklist Sync · RODANDO
- ✅ Worker DICOM Ingest · RODANDO (sem erros se Orthanc estiver acessível)
- ✅ Conexão Orthanc · configurado
- ✅ Pasta de Worklists · existe + escrevível

Se algo falhar, ver logs do terminal pra diagnóstico.

---

## Etapa 4 — Configurar o Vivid T8 (uma vez)

**Já feito na MedCardio em 06/05/2026** — ver [project_vivid_t8_medcardio.md](../../memory/project_vivid_t8_medcardio.md).

Pra clínica nova:

1. No Vivid: `Utility → Config → Conectividade → TCP/IP`
2. Adicionar servidor:
   - Nome: `ORTHANC`
   - IP: do PC onde Orthanc roda
3. Em `DICOM → Adicionar`:
   - **DicomStorage:** AE Title `ORTHANC`, porta 4242, **habilitar SR** + **Velocidades Doppler Marcadas**
   - **DicomWorklist:** AE Title `ORTHANC`, porta 4242
4. Em `Dataflow`, selecionar: `Worklist/Local Archive - DICOM Server/Int. HD`
5. Marcar `Default ✓` e `Direct Store ✓`
6. Salvar

---

## Etapa 5 — Registrar Wader como Windows Service (produção)

> **Hoje:** rodamos manualmente via `npm start`. Em produção, registrar como serviço pra rodar 24/7.

```cmd
:: Instalar node-windows globalmente (na máquina da clínica)
npm install -g node-windows

:: Criar script install-service.js (futuro)
:: Por enquanto, pode usar nssm (https://nssm.cc/)
nssm install Wader "C:\Program Files\nodejs\npx.cmd" "tsx" "C:\Wader\src\index.ts"
nssm set Wader AppDirectory C:\Wader
nssm set Wader DisplayName "Wader DICOM Agent"
nssm set Wader Description "Wader - agente DICOM do LEO"
nssm set Wader Start SERVICE_AUTO_START
nssm start Wader
```

---

## Etapa 6 — Smoke test final

1. Abrir `http://localhost:8043/` (recepção) — deve mostrar agenda do dia (vazia se não cadastrou nada)
2. Cadastrar um paciente teste manualmente
3. Em `/admin`, clicar "⟳ Sync agora" no Worker Worklist
4. No Vivid, ir em "Lista de Trabalho" → atualizar — paciente deve aparecer
5. Selecionar paciente, fazer um exame curto, apertar "End Exam"
6. Em `/admin`, esperar até 30s — Worker DICOM Ingest deve incrementar `Estudos processados`
7. Abrir laudo do exame no LEO web → ver imagens carregadas

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Pasta worklists inválida` | `worklistPath` errado em `wader.config.json` | Confira `orthanc.json` da clínica |
| `Falha ao inicializar Firebase` | SA JSON inválida ou caminho errado | Confira `firebase.serviceAccountPath` |
| `Workspace não tem Orthanc configurado` | `ortancAtivo: false` no Firestore | Editar via LocalModal do LEO web |
| `Falha de rede: fetch failed` no DICOM worker | Orthanc inacessível | Conferir se Orthanc está rodando + IP correto |
| Vivid não vê paciente na lista | `.wl` não foi escrito ou Orthanc não leu | Conferir `localhost:8043/api/worklist/list` + reiniciar Orthanc |
| Imagem não chega no LEO web | DICOM SR não habilitado no Vivid OU Storage Rules bloqueando | Conferir Etapa 4 + storage.rules |

---

## Endpoints úteis pra debug

| URL | Pra quê |
|---|---|
| `/admin` | Painel admin com status dos workers |
| `/api/status` | Status básico do Wader |
| `/api/orthanc/config` | Config Orthanc resolvida (Firestore + local) |
| `/api/dicom/test` | Testa conexão com Orthanc |
| `/api/worklist/list` | Lista `.wl` na pasta |
| `/api/worklist/sync` (POST) | Força sync manual |

---

## Próximas melhorias (roadmap)

- [ ] Empacotamento como `.exe` único via `pkg`
- [ ] Wizard de instalação NSIS (`Wader-Setup.exe`)
- [ ] Geração automática de SA por workspace via Cloud Functions
- [ ] Auto-update via GitHub Releases
- [ ] Tray icon discreto (status 🟢/🟡/🔴)
- [ ] Backup OneDrive automático do DICOM cru
- [ ] DICOM SR adapter (depois do cutover Senna90)
