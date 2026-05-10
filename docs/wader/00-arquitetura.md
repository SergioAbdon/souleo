# Wader — Manual de Arquitetura

> **Versão:** 1.0
> **Data:** 07/05/2026
> **Autor:** Dr. Sérgio Abdon (decisões) + Claude (redação técnica)
> **Status:** Aprovado para implementação

---

## Sumário

1. [Visão geral](#1-visao-geral)
2. [Arquitetura de alto nível](#2-arquitetura-de-alto-nivel)
3. [Fluxo end-to-end de um exame](#3-fluxo-end-to-end-de-um-exame)
4. [Stack tecnológica e distribuição](#4-stack-tecnologica-e-distribuicao)
5. [Estrutura do projeto](#5-estrutura-do-projeto)
6. [Modelo de dados](#6-modelo-de-dados)
7. [Identificação e autenticação](#7-identificacao-e-autenticacao)
8. [Interface do usuário (3 telas)](#8-interface-do-usuario-3-telas)
9. [Match e reconciliação](#9-match-e-reconciliacao)
10. [DICOM Structured Report (SR)](#10-dicom-structured-report-sr)
11. [Cobertura de modalidades](#11-cobertura-de-modalidades)
12. [Modelo de cobrança](#12-modelo-de-cobranca)
13. [Roadmap de implementação](#13-roadmap-de-implementacao)
14. [Estado atual e pendências](#14-estado-atual-e-pendencias)
15. [Apêndices](#15-apendices)

---

## 1. Visão geral

### 1.1. O que o Wader é

**Wader** é um programa local que roda no PC da clínica e atua como **ponte automatizada** entre:

- **Vivid T8** (ou outro aparelho de USG) — onde o exame é realizado
- **Orthanc** — servidor DICOM local que recebe os estudos
- **LEO Cloud** (Firebase) — onde o laudo será montado
- **OneDrive da clínica** — backup do DICOM cru

Ele elimina três tarefas manuais que hoje a recepção e o médico fazem:

1. **Cadastro do paciente no Vivid** (digitação duplicada da agenda)
2. **Digitação das medidas no laudo** (DICOM SR alimenta automaticamente)
3. **Inclusão das imagens no PDF** (galeria automática de seleção)

### 1.2. O que o Wader NÃO é

- ❌ **Não é um agente IA** — é programa determinístico (segue regras, não toma decisões abstratas)
- ❌ **Não fala DICOM diretamente** — Orthanc faz a comunicação com o aparelho
- ❌ **Não roda motor clínico** — Senna90 fica no servidor LEO
- ❌ **Não gera PDF** — `/api/emitir` na Vercel faz isso
- ❌ **Não tem janela própria** — UI é via navegador (`localhost:8043`)
- ❌ **Não é cliente desktop tradicional** — é Windows Service em background

### 1.3. Quem usa

| Papel | O que vê do Wader |
|---|---|
| **Recepcionista** | UI web em `localhost:8043/` (cadastro de paciente offline ou normal) |
| **Médico** | Nada diretamente — vê o resultado no LEO web (medidas pré-preenchidas, imagens automáticas) |
| **Admin/IT da clínica** | Painel em `localhost:8043/admin` (configurações, status) — uso raro |
| **Administrador do LEO** | Geração de código de ativação no LEO web |

---

## 2. Arquitetura de alto nível

```
┌─────────────────────────────────────────────────────────────────┐
│                     PC LOCAL DA CLÍNICA                          │
│                                                                  │
│  ┌──────────────┐    DICOM      ┌──────────────┐                │
│  │   Vivid T8   │ ────────────→ │   Orthanc    │                │
│  │  (aparelho)  │ ←──────────── │ (DICOM srv)  │                │
│  └──────────────┘    MWL        └──────────────┘                │
│                                        ↑                         │
│                                        │ REST                    │
│                                        ↓                         │
│                                 ┌──────────────┐                 │
│                                 │    Wader     │                 │
│                                 │ (Win Service)│                 │
│                                 └──────────────┘                 │
│                                  ↑          ↓                    │
│                       UI web     │          │ I/O arquivos       │
│                       (8043)     │          │                    │
└──────────────────────────────────┼──────────┼────────────────────┘
                                   │          │
                          HTTPS ←──┘          └──→ C:\OneDrive\
                                                   LEO-DICOM\
                                                   (sync auto)
                                   ↓
                      ┌─────────────────────────────┐
                      │      LEO Cloud (Vercel)      │
                      │                              │
                      │  ┌─────────────────────────┐ │
                      │  │ /api/dicom/sr-import    │ │
                      │  │  (parser SR + Senna90)  │ │
                      │  └─────────────────────────┘ │
                      │  ┌─────────────────────────┐ │
                      │  │ /api/emitir (PDF)       │ │
                      │  └─────────────────────────┘ │
                      │  ┌─────────────────────────┐ │
                      │  │ Firestore (exames)      │ │
                      │  │ Storage (JPG previews)  │ │
                      │  └─────────────────────────┘ │
                      └─────────────────────────────┘
                                   ↑
                                   │ web app
                                   ↓
                      ┌─────────────────────────────┐
                      │  souleo.com.br (LEO web)    │
                      │  (médico, recepção remoto)  │
                      └─────────────────────────────┘
```

### 2.1. Componentes e responsabilidades

| Componente | Onde roda | Responsabilidade |
|---|---|---|
| **Vivid T8** | Sala de exame | Captura imagens + DICOM SR, envia via DICOM Store |
| **Orthanc** | PC da clínica (serviço Windows) | Stack DICOM completo (Store SCP + MWL SCP) |
| **Wader** | PC da clínica (serviço Windows) | I/O entre Orthanc, LEO Cloud e OneDrive |
| **OneDrive client** | PC da clínica | Sincroniza pasta local com nuvem da clínica |
| **LEO Cloud (Vercel)** | Cloud | Servidor LEO, API, motor Senna90, gerador PDF |
| **Firebase** | Cloud | Banco de dados (Firestore) e armazenamento (Storage) |
| **LEO web** | Cloud (Vercel) | UI principal do médico |

---

## 3. Fluxo end-to-end de um exame

### Fase A — Pré-exame (cadastro e worklist)

```
1. Recepcionista cadastra paciente:
   - Online: LEO web → escreve em Firestore
   - Offline: Wader UI manual → escreve no Firestore quando voltar internet
   - Externo: Feegow/Calendly → LEO web puxa → escreve em Firestore

2. Wader monitora Firestore (worklist do dia):
   - A cada minuto, busca novos agendamentos
   - Para cada agendamento, gera arquivo .wl em C:\Orthanc\worklists\

3. Vivid T8 consulta Orthanc via DICOM MWL:
   - Recebe lista de pacientes do dia
   - Pré-popula tela com CPF, nome, data nascimento, sexo
```

### Fase B — Realização do exame

```
1. Médico seleciona paciente no Vivid (já preenchido)
2. Realiza eco — imagens 2D, M-mode, Doppler
3. Realiza medidas — ondas E/A, dimensões, FE, etc.
4. Pressiona "End Exam"
5. Vivid Auto-Send → empurra estudo completo via DICOM Store:
   - Imagens (.dcm)
   - Structured Report (.dcm com medidas)
   - Tudo identificado pelo AccessionNumber do .wl
```

### Fase C — Processamento (Wader em ação)

```
1. Wader monitora Orthanc /changes a cada 30s
2. Detecta estudo novo
3. Lê AccessionNumber do estudo
4. Busca exame correspondente no Firestore (match por ACC)
5. Para cada imagem:
   - Baixa preview JPG do Orthanc
   - Sobe pro Firebase Storage: dicom/{wsId}/{exameId}/{n}.jpg
6. Para o DICOM SR:
   - Baixa arquivo .dcm cru
   - POST multipart pro servidor LEO: /api/dicom/sr-import
   - Servidor parseia, mapeia pra Senna90, calcula achados, escreve Firestore
7. Para arquivos crus:
   - Copia .dcm pra C:\OneDrive\LEO-DICOM\{ano}\{mes}\{dia}\{cpf}_{exameId}\
   - OneDrive client sincroniza automaticamente
8. Atualiza Firestore exames/{id}:
   - imagensDicom: [urls]
   - medidasOrigem: 'dicom-sr'
   - dicomStudyUid, dicomMeta
```

### Fase D — Revisão e emissão (médico no LEO web)

```
1. Médico abre exame em souleo.com.br/laudo/{id}
2. Tela mostra:
   - Medidas pré-preenchidas (com selo "🟢 DICOM")
   - Achados/conclusões já calculadas pelo Senna90
   - Galeria lateral com TODAS as imagens DICOM
3. Médico:
   - Revisa medidas, ajusta se necessário
   - Clica em 6-8 imagens para incluir no PDF
   - Reordena por drag-drop
   - Adiciona texto interpretativo (contratilidade, achados qualitativos)
4. Clica "Emitir":
   - /api/emitir (Puppeteer) gera PDF com laudo + imagens selecionadas
   - PDF salvo em Storage
   - Status do exame → "Emitido"
```

---

## 4. Stack tecnológica e distribuição

### 4.1. Linguagem e runtime

- **TypeScript** (Node.js 20.x)
- Razão: consistência com o resto do LEO, reuso de tipos do Senna90

### 4.2. Bibliotecas principais (a definir na implementação)

| Função | Biblioteca candidata |
|---|---|
| HTTP server local | `fastify` ou `express` |
| Firebase Admin | `firebase-admin` |
| File system watching | `chokidar` |
| Cron jobs (polling) | `node-cron` |
| HTTP client (Orthanc) | `undici` ou `node-fetch` |
| Logs | `pino` |
| Sentry | `@sentry/node` |

### 4.3. Empacotamento

- **`pkg`** ou **`@yao-pkg/pkg`** → bundle do Node.js + código + node_modules em um único `wader.exe` (~90 MB)
- **NSIS** ou **Inno Setup** → instalador `Wader-Setup.exe` (~95 MB)
- **`node-windows`** ou `sc.exe` → registro como Windows Service

### 4.4. Por que NÃO outras opções

- **`.bat`:** exige Node instalado, janela DOS visível, frágil, sem proteção do código
- **Electron:** ~150 MB, roda Chromium duplicado, não precisa janela própria
- **Go/Rust:** reescreveria DICOM parsers + Firebase Admin, 3× mais tempo de dev
- **Python:** mesmo problema (reescreveria muito código já existente em TS)

### 4.5. Auto-update

- Wader checa a cada 24h: `GET https://souleo.com.br/api/wader/version`
- Se versão remota > local: baixa novo `.exe`, substitui, reinicia serviço
- Tudo invisível ao usuário

---

## 5. Estrutura do projeto

### 5.1. Repositório

**Monorepo** dentro do projeto LEO existente:

```
souleo/                              ← repo principal
├── src/                             ← LEO web (Next.js)
│   ├── senna90/                     ← motor clínico (compartilhado)
│   ├── app/
│   ├── components/
│   └── lib/
├── apps/
│   └── wader/                       ← Wader (NOVO)
│       ├── src/
│       │   ├── index.ts             ← entry point
│       │   ├── service/             ← Windows Service registration
│       │   ├── ui/                  ← servidor web local
│       │   │   ├── server.ts
│       │   │   ├── pages/
│       │   │   │   ├── reception.html
│       │   │   │   ├── admin.html
│       │   │   │   └── wizard.html
│       │   │   └── api/
│       │   ├── workers/
│       │   │   ├── worklist-sync.ts ← Firestore → .wl
│       │   │   ├── orthanc-watcher.ts ← /changes monitor
│       │   │   ├── upload-queue.ts  ← Storage + OneDrive
│       │   │   └── sr-forwarder.ts  ← POST /api/dicom/sr-import
│       │   ├── adapters/
│       │   │   ├── firebase.ts
│       │   │   ├── orthanc.ts
│       │   │   └── filesystem.ts
│       │   └── config/
│       │       ├── load.ts          ← lê wader.config.json
│       │       └── types.ts
│       ├── package.json
│       ├── tsconfig.json
│       ├── pkg.config.json          ← config do bundler
│       └── installer/
│           └── wader-setup.nsi      ← script NSIS
├── docs/
│   └── wader/
│       ├── 00-arquitetura.md        ← este documento
│       ├── 01-instalacao.md         ← guia de instalação na clínica
│       └── 02-troubleshooting.md
└── package.json                     ← workspaces config
```

### 5.2. Compartilhamento de tipos

Wader importa tipos do Senna90 sem duplicar:

```typescript
// apps/wader/src/sr-forwarder.ts
import type { MedidasEcoTT } from '../../../src/senna90/types'
```

### 5.3. Build e deploy

- **LEO web:** Vercel (automático em push pro master)
- **Wader:** GitHub Actions builda `wader.exe` + `Wader-Setup.exe` em release de tag
- Releases ficam em `github.com/SergioAbdon/souleo/releases`

---

## 6. Modelo de dados

### 6.1. Firestore — coleção `exames`

```typescript
interface Exame {
  // Identificação
  id: string                    // doc ID
  acc: string                   // AccessionNumber atual
  accHistorico: string[]        // ACCs anteriores (após merge)

  // Paciente e agendamento
  cpf: string
  nomePaciente: string
  data: string                  // YYYY-MM-DD
  procedimento: 'EcoTT' | 'Carotidas' | 'EcoTE' | ...
  horarioAgendado: string       // HH:MM

  // Origem
  fonteAcc: 'leo-web' | 'feegow' | 'manual-offline' | 'calendly'
  fonteCanonica: 'leo-web' | 'feegow' | 'manual'  // após merge

  // Workspace
  wsId: string
  unidadeId?: string

  // Estado
  status: 'agendado' | 'aguardando' | 'em-execucao' | 'imagens-recebidas' | 'em-laudo' | 'emitido'
  criadoEm: Timestamp
  atualizadoEm: Timestamp

  // DICOM
  dicomStudyUid?: string
  dicomMeta?: {
    stationName: string
    operatorName: string
    performedDate: string
    softwareVersion: string
  }
  imagensDicom?: string[]       // URLs no Firebase Storage
  imagensSelecionadas?: string[]  // selecionadas pro PDF
  dicomBackupPath?: string      // caminho relativo no OneDrive

  // Medidas e laudo
  medidas?: Partial<MedidasEcoTT>
  medidasOrigem?: 'dicom-sr' | 'manual' | 'mixed'
  achados?: string[]
  conclusoes?: string[]
  textoMedico?: string

  // PDF
  pdfUrl?: string
  emitidoEm?: Timestamp
  emitidoPor?: string           // uid do médico
}
```

### 6.2. Firebase Storage — layout

```
leo-sistema-laudos.appspot.com/
├── dicom/
│   └── {wsId}/
│       └── {exameId}/
│           ├── 001.jpg          ← previews JPG
│           ├── 002.jpg
│           └── ...
├── laudos/
│   └── {wsId}/
│       └── {exameId}.pdf        ← PDF final
└── logos/
    └── {wsId}/
        └── ...
```

### 6.3. OneDrive da clínica — layout

```
C:\OneDrive\LEO-DICOM\
└── 2026\
    └── 05\
        └── 07\
            └── 12345678901_a1b2c3\         ← {cpf}_{exameId}
                ├── 001.dcm                  ← imagens DICOM cruas
                ├── 002.dcm
                ├── ...
                ├── sr.dcm                   ← Structured Report
                └── manifest.json            ← metadados
```

`manifest.json`:
```json
{
  "exameId": "a1b2c3",
  "cpf": "12345678901",
  "nomePaciente": "JOAO SILVA SANTOS",
  "data": "2026-05-07",
  "procedimento": "EcoTT",
  "studyUid": "1.2.840.113619...",
  "totalArquivos": 47,
  "leoUrl": "https://souleo.com.br/laudo/a1b2c3"
}
```

---

## 7. Identificação e autenticação

### 7.1. Service Account por workspace

**Decisão:** cada clínica tem sua própria Service Account Firebase, não uma compartilhada.

**Geração:**
1. Cliente assina plano Wader no LEO web
2. Backend LEO usa Google Cloud SDK para criar SA específica:
   - Nome: `wader-{wsId}@leo-sistema-laudos.iam.gserviceaccount.com`
   - Permissões: leitura/escrita SOMENTE em `exames/{wsId}/*` e Storage `dicom/{wsId}/*`
3. SA JSON é salva no Firestore (criptografada) ou Cloud KMS

**Vantagens:**
- LGPD: vazamento isolado a uma clínica
- Revogação granular (cancelar plano = desativar SA)
- Auditoria por clínica

### 7.2. Código de ativação

**Formato:** `WADER-{wsId-slug}-{hash-8-chars}`

Exemplo: `WADER-MEDCARDIO-A1B2C3D4`

**Geração:** LEO web exibe código no painel do workspace quando plano é ativado.

**Uso:**
1. IT da clínica baixa `Wader-Setup.exe`
2. Wizard pede código
3. Wader faz POST `/api/wader/activate` com o código
4. Servidor valida + retorna SA JSON criptografada
5. Wader salva localmente em `C:\ProgramData\Wader\sa.enc`
6. Wader usa SA pra autenticar Firebase

**Revogação:**
- Admin clica "Revogar" no LEO web
- Servidor desativa SA via Google Cloud SDK
- Wader recebe 401 nas próximas chamadas → para de subir dados
- LEO web mostra badge 🔴

---

## 8. Interface do usuário (3 telas)

### 8.1. Tela de recepção (`localhost:8043/`)

**Quem usa:** recepcionista
**Frequência:** diária

**Funcionalidades:**
- Cadastro manual de paciente (nome, CPF, procedimento, horário)
- Lista da agenda do dia (com status: 🟢 enviado, 🟡 aguardando, 🔴 erro)
- Busca por paciente
- Edição de cadastros locais (antes da sincronização)

### 8.2. Tela de admin (`localhost:8043/admin`)

**Quem usa:** Sérgio (proprietário) ou IT da clínica
**Frequência:** raríssima (1× na instalação, depois quase nunca)

**Funcionalidades:**
- Status do serviço (uptime, versão, última sync)
- Configuração de aparelhos (AE titles, IPs)
- Pasta de backup OneDrive
- Logs (últimas 24h)
- Política de retenção
- Atualização manual

### 8.3. Wizard de instalação

**Quem usa:** IT da clínica (1×)
**Frequência:** uma vez na vida da instalação

**Etapas:**
1. Boas-vindas
2. Código de ativação (cola no campo)
3. Pasta de backup OneDrive (browser file)
4. Configuração do Vivid (AE Title, IP, porta)
5. Teste de conexão (Firebase + Orthanc)
6. Confirmação e início do serviço

---

## 9. Match e reconciliação

### 9.1. Chave principal — AccessionNumber

ACC é gerado automaticamente por quem cria o agendamento:
- LEO web: `LEO-{uuid}`
- Feegow: `appointmentId` do Feegow
- Manual offline (Wader): `TEMP-{uuid}`
- Calendly (futuro): `WPP-{id}`

**Match exame ↔ DICOM:** quando Wader recebe estudo do Orthanc, lê AccessionNumber do DICOM e busca exame com ACC igual no Firestore.

### 9.2. Reconciliação — quando há duplicatas

**Cenário:** manual offline criou TEMP-X, depois Feegow trouxe FEE-Y do mesmo exame.

**Chave de reconciliação:** `CPF + data + procedimento + horarioAgendado` (com tolerância de ±15min).

**Algoritmo:**
1. LEO web sincroniza com Feegow → para cada agendamento Feegow:
   - Busca exame com `cpf + data + procedimento + horario` aproximado
   - Se encontrou: merge
     - `acc` ← FEE-Y (canônico)
     - `accHistorico` ← TEMP-X (preserva DICOM antigo)
   - Se não encontrou: cria novo exame

### 9.3. Edição manual (último recurso)

Sempre no LEO web, nunca no Wader. UI mostra:
- Lista de exames órfãos (sem agendamento correspondente)
- Lista de agendamentos sem exame
- Sugestões de match por similaridade de nome
- Edição de CPF, procedimento, horário

---

## 10. DICOM Structured Report (SR)

### 10.1. O que vem do Vivid T8

Vivid emite o SR como objeto DICOM separado dentro do estudo, contendo medidas estruturadas com códigos LOINC/SNOMED.

**Cobertura típica do SR (Eco TT):**
- ✅ Estruturais: AO, AE, DDVE, DSVE, septo, PP, VD
- ✅ Função sistólica: FE Teich, VDF, VSF (Simpson se médico fizer)
- ✅ Doppler diastólico: ondas E/A, e' septal, IT, PMAP, vol AE
- ✅ Doppler valvar: gradientes, VTIs
- ✅ TDI: e' septal/lateral, S' anel
- ⚠️ Strain: só se Vivid tem pacote (GLS VE/VD, LARS)

**Total estimado:** 45-55 dos 68 campos do Senna90 vêm prontos. Restante (~15-20) são interpretativos, médico digita.

### 10.2. Onde parseia — servidor LEO

**Decisão:** parser SR fica no servidor (`/api/dicom/sr-import`), não no Wader.

**Razões:**
- Single source of truth (deploy Vercel atualiza todas as clínicas)
- Não precisa redeployar Wader pra ajustar mapeamento
- Servidor já roda Senna90, pode calcular achados em sequência

**Pipeline servidor:**
```
1. Recebe POST multipart com .dcm do SR + exameId
2. Auth via Service Account do workspace
3. dcmjs parseia .dcm → árvore de medidas
4. dicom-sr-adapter.ts mapeia códigos → MedidasEcoTT
5. Sanity check (valores plausíveis)
6. Senna90 calcula achados/conclusões
7. Escreve Firestore exames/{id}
```

### 10.3. Mapeamento (resumo)

```typescript
// src/lib/dicom-sr-adapter.ts
const SR_TO_SENNA90: Record<string, keyof MedidasEcoTT> = {
  'LN.11984-2':  'fe',         // Ejection Fraction
  'DCM.122142':  'ddve',       // LV End Diastolic Diameter
  'DCM.122143':  'dsve',       // LV End Systolic Diameter
  'DCM.122503':  'septo',
  'DCM.122504':  'pp',
  'LN.18152-1':  'relEsobreA',
  'DCM.122204':  'eSeptal',
  // ... ~50 mapeamentos completos
}
```

---

## 11. Cobertura de modalidades

| Exame | Adapter SR | Motor clínico | Template PDF | Status |
|---|---|---|---|---|
| **Eco TT** | ✅ Pronto | ✅ Senna90 | ✅ Pronto | MVP |
| **Eco TE** | ✅ Reusa Eco TT | ⚠️ ~80% reusa Senna90 | Ajuste pequeno | Fase 2 |
| **Carotidas** | ⚠️ Adapter novo (~3d) | ❌ Médico digita | Template novo (~1d) | Fase 2 |
| **Mama** | ❌ Sem SR padrão | ❌ Médico digita | Template novo (~1d) | Fase 3 |
| **Tireoide** | ❌ Sem SR padrão | ❌ Médico digita | Template novo (~1d) | Fase 3 |
| **Abdominal** | ❌ Sem SR padrão | ❌ Médico digita | Template novo (~1d) | Fase 3 |
| **Obstétrico** | ⚠️ Adapter novo (~3d) | ❌ Motor novo (~semanas) | Template novo | Fase 4 |

**Para MedCardio:** Eco TT (MVP) + Carotidas (Fase 2) cobrem 100% dos exames feitos hoje.

---

## 12. Modelo de cobrança

### 12.1. Três planos com Wader

| Plano | Wader | Senna90 | Multi-locais | Conferência convênios | Preço |
|---|---|---|---|---|---|
| **Wader Storage** (standalone) | ✅ Captura + storage | ❌ | ❌ | ❌ | R$ 79,90/mês |
| **LEO Profissional + Wader add-on** | ✅ | ✅ Eco TT | ✅ | ❌ | R$ 289,89/mês |
| **LEO Expert** (Wader incluso) | ✅ | ✅ Eco TT | ✅ | ✅ | R$ 249,99/mês |

Setup único: R$ 390 (Storage) ou R$ 590 (Pro/Expert)

### 12.2. Limites e excedentes

**Incluído em qualquer plano com Wader:**
- 200 exames/mês
- 2 GB de imagens (Firebase)
- 1 aparelho conectado

**Excedente:**
- R$ 0,30 por exame extra
- R$ 5,00 por GB extra
- R$ 30,00 por aparelho adicional

### 12.3. Anti-freerider

- Wader exige assinatura LEO ativa
- Inadimplência → Service Account desativada → Wader não sobe dados → badge 🔴 no LEO
- Lógica reusa item #11 da v3

---

## 13. Roadmap de implementação

### 13.1. Fases sequenciais

| Fase | Descrição | Esforço | Dependências |
|---|---|---|---|
| **F1 — Esqueleto** | Setup `apps/wader/`, package.json, pkg, Windows Service, UI vazia | 1 sprint | Nenhuma |
| **F2 — Manual UI** | Servidor web local, tela cadastro, escrita Firestore | 1 sprint | F1 |
| **F3 — Worklist sync** | Firestore → `.wl` files (gera worklist pro Vivid) | 1 sprint | F2 |
| **F4 — DICOM ingest** | Orthanc `/changes` watcher → upload Firebase + OneDrive | 1 sprint | F3 + Orthanc OK |
| **F5 — SR adapter** | `/api/dicom/sr-import` no servidor + mapeamento Eco TT | 1 sprint | **Senna90 cutover (Fase 7)** |

### 13.2. Paralelismo com Senna90

- F1-F4 podem ser desenvolvidas em paralelo ao Shadow Mode do Senna90
- F5 espera cutover do Senna90 (~18/05/2026)

### 13.3. Piloto

- MedCardio é a única clínica do piloto (F1-F5)
- Multi-tenant (outras clínicas) só após F5 estável

---

## 14. Estado atual e pendências

### 14.1. Pré-requisitos prontos

- ✅ Senna90 implementado (Shadow Mode rodando desde 04/05/2026)
- ✅ Storage Rules deployadas
- ✅ Puppeteer PDF funcionando
- ✅ Sentry configurado
- ✅ Firebase Admin SDK em uso (item #11 v3)
- ✅ Sistema de billing (3 eixos)
- ✅ **Orthanc instalado no PC da MedCardio**

### 14.2. Pendências de configuração (clínica)

- ⚠️ Vivid T8: confirmar DICOM SR habilitado
- ⚠️ Vivid T8: confirmar AE Title + IP do Orthanc configurados
- ⚠️ Confirmar OneDrive instalado e sincronizando
- ⚠️ Endereço IP/credenciais do Orthanc (pra dev)

### 14.3. Pendências de código

- ❌ Tudo do Wader (não existe ainda)
- ❌ `/api/dicom/sr-import` no servidor LEO
- ❌ `dicom-sr-adapter.ts`
- ❌ Painel de geração de código de ativação no LEO web
- ❌ UI de "exames órfãos" no LEO web
- ❌ Galeria de imagens DICOM na tela do laudo

---

## 15. Apêndices

### 15.1. Configuração `wader.config.json`

```json
{
  "version": "1.0",
  "wsId": "medcardio",
  "agentId": "wader-001",
  "activatedAt": "2026-05-15T10:30:00Z",

  "firebase": {
    "serviceAccountPath": "C:\\ProgramData\\Wader\\sa.enc",
    "projectId": "leo-sistema-laudos"
  },

  "orthanc": {
    "url": "http://localhost:8042",
    "auth": {
      "user": "leo",
      "passEncrypted": "..."
    },
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
  },

  "telemetry": {
    "sentryDsn": "https://...@sentry.io/...",
    "sampleRate": 0.1
  }
}
```

### 15.2. Endpoints do servidor LEO usados pelo Wader

| Método | Path | Uso |
|---|---|---|
| POST | `/api/wader/activate` | Ativar Wader com código |
| POST | `/api/dicom/sr-import` | Forwarding de SR cru |
| GET | `/api/wader/version` | Checagem de auto-update |
| GET | `/api/wader/version/download` | Baixar nova versão |
| POST | `/api/wader/heartbeat` | Sinal de vida (badge no LEO) |

### 15.3. Glossário

| Termo | Significado |
|---|---|
| **DICOM** | Padrão da indústria pra imagem médica (anos 80, ainda em uso) |
| **MWL** | Modality Worklist — lista de pacientes que o aparelho consulta |
| **DICOM Store** | Protocolo do aparelho mandar estudo pro servidor |
| **DICOM SR** | Structured Report — medidas estruturadas em formato máquina-legível |
| **AE Title** | Application Entity Title — identificador de cada equipamento DICOM |
| **AccessionNumber** | Identificador único de um agendamento |
| **Orthanc** | Servidor DICOM open source (substitui dezenas de PACS comerciais) |
| **Service Account** | Credencial digital pra programa autenticar (não é usuário humano) |
| **Windows Service** | Programa que roda em background sem janela |
| **MedidasEcoTT** | Interface TypeScript com os 68 campos de medidas do Senna90 |

### 15.4. Referências internas

- `docs/motor-tsmigracao/00-mapa-motor.md` — visão geral do Senna90
- `docs/motor-tsmigracao/01-inventario-inputs.md` — 68 campos catalogados
- `docs/motor-tsmigracao/04-formulas-referencias.md` — fórmulas e cutoffs
- Memória: `project_wader_arquitetura.md` (resumo executivo)
- Memória: `project_dicom_orthanc.md` (proposta original, agora superada por este documento)

---

**Fim do documento.** Próximo passo: implementação Fase 1 — Esqueleto.
