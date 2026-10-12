# Wader

Agente local DICOM do LEO. Programa Windows que roda na clínica como serviço, captura imagens e medidas do aparelho de USG (via Orthanc), e sincroniza com a nuvem do LEO.

> **Status atual:** Fase 1 — Esqueleto (07/05/2026). Ver [docs/wader/00-arquitetura.md](../../docs/wader/00-arquitetura.md).

---

## O que está pronto na Fase 1

- ✅ Estrutura de pastas e configuração TypeScript
- ✅ Loader de configuração (`wader.config.json`) com validação e overrides por env
- ✅ Logger (pino) com modo dev/prod
- ✅ Servidor web local (Fastify) em `localhost:8043`
- ✅ 3 telas HTML placeholder: `/` (recepção), `/admin`, `/wizard`
- ✅ Endpoints `/health` e `/version`
- ✅ Graceful shutdown (SIGINT/SIGTERM)

## Instalação na clínica (Fase A, 10/2026)

Serviço do Windows + atualização com um clique. Spec: `docs/superpowers/specs/2026-10-11-wader-fase-a-design.md`.

1. Baixar `Wader-Setup-vX.Y.Z.exe` da release `wader-vX.Y.Z` no GitHub.
2. Clínica que já roda o Wader antigo em `C:\Wader`: antes, `scripts\migrar-medcardio.ps1 -Commit` como admin.
3. Rodar o Setup (SmartScreen → "Mais informações → Executar assim mesmo"). Primeira vez pede wsId, pasta de worklists, PIN e `sa.json`.
4. Conferir `http://127.0.0.1:8043/admin` → cartão "Atualização".

Dados em `C:\ProgramData\Wader` (sobrevivem a desinstalar). Logs em `C:\ProgramData\Wader\logs`.

---

## Rodando em dev

### Pré-requisitos

- Node.js 20+ (testado com 24.14)
- npm 10+

### Setup

```bash
cd apps/wader
npm install
cp wader.config.example.json wader.config.local.json
# Edite wader.config.local.json com seus paths e wsId locais
npm run dev
```

O servidor sobe em **http://localhost:8043** (configurável).

### Endpoints disponíveis (F1)

| Método | Path | Descrição |
|---|---|---|
| GET | `/` | Tela de recepção (placeholder) |
| GET | `/admin` | Painel admin (placeholder) |
| GET | `/wizard` | Wizard de instalação (placeholder) |
| GET | `/health` | Health check JSON |
| GET | `/version` | Versão do Wader |
| GET | `/api/status` | Status (placeholder F2) |
| POST | `/api/agendamento` | Cadastro manual (placeholder F2) |

### Variáveis de ambiente (override de config)

| Variável | Override |
|---|---|
| `WADER_WS_ID` | `wsId` |
| `WADER_UI_PORT` | `ui.port` |
| `WADER_ORTHANC_URL` | `orthanc.url` |
| `WADER_LOG_LEVEL` | nível de log (debug/info/warn/error) |
| `NODE_ENV` | `production` desliga pino-pretty |

---

## Estrutura de pastas

```
apps/wader/
├── src/
│   ├── index.ts                   ← entry point (orquestração)
│   ├── logger.ts                  ← logger pino compartilhado
│   ├── config/
│   │   ├── types.ts               ← tipos do wader.config.json
│   │   └── load.ts                ← loader + validação
│   ├── ui/
│   │   ├── server.ts              ← Fastify (localhost:8043)
│   │   └── pages/                 ← HTML estático das 3 telas
│   ├── workers/                   ← workers de sync e ingestão (F2+)
│   ├── adapters/                  ← Firebase, Orthanc, filesystem (F2+)
│   └── types/                     ← tipos compartilhados
├── package.json
├── tsconfig.json
├── wader.config.example.json
└── README.md
```

---

## Decisões fechadas (07/05/2026)

| # | Decisão | Resolução |
|---|---|---|
| 1 | Repositório | Monorepo — Wader em `apps/wader/`, compartilha tipos com Senna90 |
| 2 | Service Account Firebase | Por workspace (cada clínica tem a sua, gerada pelo LEO) |
| 3 | Identidade do Wader | Código de ativação `WADER-{wsId}-{hash}` gerado pelo LEO web |

Detalhes completos: [docs/wader/00-arquitetura.md](../../docs/wader/00-arquitetura.md).

---

## Próxima fase — F2: Manual UI

- Servidor web local (já feito) ganha rotas reais de cadastro
- Conexão Firestore via Firebase Admin SDK (com Service Account local)
- Lista de exames do dia em `/`
- Form de cadastro manual com validação CPF
- Tela admin com status real do serviço
