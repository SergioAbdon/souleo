# Bug ACC duplicado, remap operacional e arquitetura Wader+SR (13/05/2026)

> **Status:** Bloco 1 (remap) e Bloco 2 (fix preventivo) aplicados. Bloco 3 (Wader processa SR) **pendente** — próxima sessão.
> **Sessão:** PC clínica MedCardio (Clinic Claude) — começou pela manhã, foco original era debug do Wader.
> **Audience:** Notebook Claude + Sergio futuro.

---

## 1. Sintomas relatados

Sergio voltou na segunda-feira (11/05) e terça (12/05) de exames com 2 problemas:

1. **Worklist do Vivid não mostrou carótida** — só os ecocardiogramas apareceram. Doppler de carótidas (que estava cadastrado no Leo) sumiu da tela do aparelho.
2. **Imagens e dados não retornaram ao Leo** — fez ECO da Sonia e do Manoel no dia 12/05, mas no Leo nenhum dos exames mostrou ícone 📸. Médico achou que Wader/Orthanc estavam quebrados.

---

## 2. Diagnóstico — causa raiz única: **ACC duplicado**

Investigando o Firestore via service account (`C:\Wader\sa.json`), descobri que **3 exames de 12/05 compartilhavam o mesmo `AccessionNumber`** `EX12052610215916`:

| Doc Firestore | Paciente | tipoExame | ACC original |
|---|---|---|---|
| `uj1U5egIB7ox8CzbNRV8` | MANOEL | eco_tt | EX12052610215916 |
| `v7JvTfjOhJBzCMcNuNIk` | SONIA | eco_tt | EX12052610215916 |
| `He5dXgFCv1oft6xNlUlL` | SONIA | doppler_carotidas | EX12052610215916 |

**Impacto em cascata:**

- **Vivid (MWL):** recebe 3 `.wl` distintos com mesmo `AccessionNumber`. Colapsa/agrupa duplicatas → mostra só 1 → "carótida sumiu".
- **Wader (DICOM ingest):** ao processar estudo do Orthanc, faz `where('acc', '==', accession).limit(1)` em `dicom-ingest.ts:74`. Com 3 docs colidindo, sempre pega o **primeiro por ordem de doc ID** (`He5d... < uj1U... < v7Jv...`) e atualiza esse. Imagens do ECO da Sonia foram parar no documento da **carótida** da Sonia. Os outros 2 ficaram órfãos.

Confirmação cruzada (Orthanc REST API):

| Hora Orthanc | Paciente | ACC | StudyUID |
|---|---|---|---|
| 10:22:06 | MANOEL | EX12052610215916 | 2.25.7399... |
| 10:43:07 | SONIA | EX12052610215916 | 2.25.9435... |
| 10:50:58 | SONIA | **(none)** | 1.2.840...58.25.1 |

O 3º estudo (Sonia 10:50) ficou sem ACC porque o **Vivid não mostrou a carótida no worklist** (consequência do bug acima), então Sergio fez a carótida **manualmente no aparelho**, sem MWL.

### 2.1. Por que o ACC colidiu? — algoritmo + edge case

`gerarAccessionNumber()` (`src/lib/gerarAccessionNumber.ts`) gera formato `EX{ddmmaa}{hhmmsscc}` — 16 chars, único por centésimo de segundo.

O batch Feegow em `src/components/Worklist.tsx:300-326` já passava `i * 10` como offset (fix aplicado em 11/05/2026, commit `7449785`). Mas o bug **voltou em 12/05** porque:

- Hipótese A (provável): cache de service worker / bundle antigo no browser do Sergio quando o batch rodou às 10:21 BRT
- Hipótese B (possível): 3 chamadas separadas (Sergio importou Feegow 3 vezes em sequência rápida), cada uma com `i=0` → offset 0 → ACCs idênticos

Em ambos os casos, **o offset `i*10` cobre apenas batch dentro de uma única chamada `importarFeegow()`**. Não cobre chamadas avulsas no mesmo centésimo, nem cliente desatualizado.

### 2.2. Identificação do estudo sem ACC (10:50:58)

Sergio não sabia o que era esse 3º estudo da Sonia ("EU NAO SEI DO Q SE TRATA ESSE EXAME"). Baixei 4 previews via Orthanc REST e analisei visualmente — encontrei marcadores inequívocos de exame de carótida:

- "Rt ACE PS 81.46 cm/s, Rt ACE ED 22.70 cm/s" → **Artéria Carótida Externa direita** (Doppler espectral)
- "Rt ACC PS 68.09 cm/s, Rt ACC ED 17.40 cm/s" → **Artéria Carótida Comum direita**
- "IMT Post Avg 0.74 mm" → **Intima-Media Thickness** (parâmetro 100% específico de carótida)

Conclusão: estudo 10:50:58 = **Doppler de Carótidas da Sonia**, feito manualmente sem worklist.

---

## 3. Bloco 1 — Remap operacional dos 3 exames (aplicado)

Script: `C:\Wader\scripts\remap-exames-12-05.js` (fora do repo, usa `sa.json` local).

**Ações:**

1. Apagar imagens antigas do Storage em `dicom/{ws}/{exameId}/`
2. Re-baixar previews JPG do estudo Orthanc correto (série Modality=US)
3. Subir pro Storage com path `dicom/{ws}/{exameId}/{seq:3pad}.jpg`
4. Atualizar Firestore: `imagensDicom`, `imagensDicomDetalhes`, `dicomMeta`, `dicomStudyUid`, `dicomOrthancStudyId`, `status='andamento'`, `atualizadoEm`

**Resultado:**

| Doc | Antes | Depois |
|---|---|---|
| MANOEL eco | nao-realizado, 0 imgs | **andamento, 10 imgs**, studyUid 2.25.7399… ✅ |
| SONIA eco | nao-realizado, 0 imgs | **andamento, 10 imgs**, studyUid 2.25.9435… ✅ |
| SONIA carótida | imagens-recebidas, 9 imgs do ECO | **andamento, 12 imgs**, studyUid 1.2.840…58.25.1 ✅ |

Em seguida, segundo script (`C:\Wader\scripts\renomear-acc-12-05.js`) renomeou ACCs pra desambiguar:

```
MANOEL eco       EX12052610215916  (mantém)
SONIA eco        EX12052610215917
SONIA carotida   EX12052610215918
```

**Não mexido no Orthanc** — o `/modify` endpoint cria novo StudyUID, quebraria o `dicomOrthancStudyId` salvo. O risco residual é que se um exame futuro pegar ACC `…916` colide com o do Manoel — mas o fix preventivo (Bloco 2) impede isso.

---

## 4. Bloco 2 — Fix preventivo (commit `4b80c4e` nesta branch)

Branch: `claude/fix-acc-colisao`

### 4.1. `src/lib/gerarAccessionNumber.ts` — counter global

Quando o caller **não passa `offsetMs`**, agora usa `_autoOffsetCounter++ * 10` como fallback. Counter é module-scope (in-memory), reseta no reload da página (intencional: após reload os ms já são distintos).

Cobre:
- Cadastro manual sequencial (3 cliques rápidos em "+Paciente" no Worklist)
- Re-importação Feegow rápida (várias chamadas separadas em loop apertado)
- Misturar batch (offsetMs explícito) com avulso (sem offsetMs) — disjoint

### 4.2. `src/lib/firestore.ts` `saveExame()` — verificação defensiva

Antes de gravar exame **novo** (sem `id`), faz `where('acc', '==', acc).where('dataExame', '==', data).limit(1)`. Se já existe, regenera ACC com offset crescente — até 5 tentativas.

Cobre o residual: ACC vindo de fonte que não passou pelo `gerarAccessionNumber()`, contador zerado entre tabs/browsers, etc.

### 4.3. `scripts/test-gerar-acc.mjs` — teste standalone

6 cenários, 13 asserts, **13/13 passando**. Inclui o caso histórico do bug 12/05 — gera exatamente `EX12052610215916/17/18`, distintos.

Reroda com: `node scripts/test-gerar-acc.mjs`

---

## 5. Descoberta tangencial — **bug arquitetural Vercel ↔ Orthanc**

Ao investigar por que dados estruturados (medidas via DICOM SR) não chegavam ao Leo, notei:

- O parser de SR vive em `src/app/api/orthanc/route.ts:245-388` (`buscar_sr`)
- Ele roda no **Leo Cloud (Vercel)** — não no browser
- Mas o `ortancUrl` no workspace é `http://192.168.15.27:8042` — **IP da rede LOCAL da clínica**
- Vercel (internet pública) **não consegue alcançar 192.168.15.27** diretamente, sem VPN/túnel

**Implicação:** o botão "📡 Vivid" no sidebar do laudo (`SidebarLaudo.tsx:170-176`) provavelmente **nunca funcionou em produção**. Médico clica → fetch → Vercel server tenta `192.168.15.27:8042` → timeout silencioso. Esse comportamento foi atribuído a outras causas (DICOM SR não enabled, etc), mas a causa raiz é de rede.

**Implicação prática:** mesmo se consertarmos o ACC e o Wader subir imagens corretamente, as **medidas estruturadas (SR)** ainda não chegam ao Leo via fluxo atual.

---

## 6. Bloco 3 — **PRÓXIMA SESSÃO**: Wader processa SR

### Decisão arquitetural (validada com Sergio nesta sessão)

```
WADER (server-side, na rede local)         LEO (browser do médico)
──────────────────────────────────         ────────────────────────
• Lê DICOM do Orthanc                      • Lê do Firestore (listener real-time)
• Baixa imagens + SR                       • Interpreta:
• Parseia SR → medidas LOINC                  - Ícone 📸 quando imagens chegam
• Escreve TUDO no Firestore (atômico):        - Botão "📡 Vivid" se medidasDicom existe
   - imagensDicom (URLs)                      - Importa medidas no motor (sob clique)
   - medidasDicom (Record codLoinc→valor)     - Mostra status "andamento"
   - status: 'andamento'
   - dicomMeta, dicomStudyUid             • Exibe ao médico
```

**Regras de negócio confirmadas:**

1. **Status `andamento` é setado pelo Wader** quando ele grava `imagensDicom + medidasDicom` (escrita atômica). Antes disso, fica `aguardando`. Médico vê `andamento + 📸` = "exame chegou na nuvem, pode laudar".
2. **Medidas crus do DICOM ficam em campo separado** (`medidasDicom`) — não sobrescrevem `medidas` (que o motor/médico usa). Botão "📡 Vivid" importa sob demanda.
3. **Wader = produtor (server-side, na rede local).** Leo = consumidor + UI.

### Plano de implementação (próxima sessão)

| # | Arquivo | Mudança |
|---|---|---|
| 1 | `apps/wader/src/adapters/dicom-sr-parser.ts` (NOVO) | Port do parser de `src/app/api/orthanc/route.ts:321-367` |
| 2 | `apps/wader/src/workers/dicom-ingest.ts` | Adicionar passo: identificar série Modality=SR → extrair medidas → gravar `medidasDicom` + setar `status: 'andamento'` |
| 3 | `apps/wader/src/types/exame.ts` | Adicionar `medidasDicom?: Record<string, number>` ao tipo `Exame` |
| 4 | `src/app/laudo/[id]/page.tsx` + `SidebarLaudo.tsx` | Botão "📡 Vivid" passa a ler do Firestore (não chama mais `/api/orthanc?action=buscar_sr`) |
| 5 | Script ad-hoc (fora do repo) | Reprocessar SR dos 3 exames de 12/05 com novo flow — pra testar com dados reais |

Branch sugerida: `claude/wader-processa-sr`

---

## 7. Backlog / pontos abertos

- **Auto-Send do Vivid:** confirmar fisicamente no aparelho que "Auto-Send on End Exam" está ON em `Utility → Config → Conectividade`. Documento `docs/wader/01-instalacao.md:173` lista o caminho. Se não estiver, médico precisa apertar "Save As → Network" depois de cada exame.
- **DICOM SR no Vivid:** confirmar que `DICOM SR` está habilitado pra ECO e pra DOPPLER. Manual do Vivid T8 — provavelmente em `Setup → Connectivity → Dataflow`.
- **Endpoint `/api/orthanc?action=buscar_sr`:** com o Bloco 3, vira fallback / debug only. Considerar deprecar quando Wader+SR estiver estável.
- **Wader não estava rodando** na PC clínica no momento da investigação (`tasklist` sem `node.exe`). Precisa garantir que sobe no startup do Windows.

---

## 8. Convenção: scripts ad-hoc operacionais

Vivem em `C:\Wader\scripts\` (fora do repo souleo) porque:
- Usam `C:\Wader\sa.json` (service account, NÃO versionar)
- São operações pontuais (não fazem parte do pipeline normal)

Scripts dessa sessão (mantidos no FS local, **não commitados**):

- `debug-exames-sonia-manuel.js` — investigação inicial do estado no Firestore
- `inspect-orthanc.js` — cruzamento Orthanc × Firestore
- `identificar-estudo-sem-acc.js` — leitura de tags DICOM do estudo Sonia 10:50
- `baixar-previews-sonia-1050.js` — download de 4 previews pra identificação visual
- `remap-exames-12-05.js` — remap completo dos 3 exames (Bloco 1)
- `renomear-acc-12-05.js` — desambiguação dos ACCs

Se outro Claude precisar reproduzir investigação similar, esses scripts servem de modelo.

---

## 9. Referências cruzadas

- Commit do fix: `4b80c4e` na branch `claude/fix-acc-colisao` — PR: https://github.com/SergioAbdon/souleo/pull/new/claude/fix-acc-colisao
- Commit anterior que tentou corrigir o mesmo bug: `7449785` (11/05/2026 — funcionou parcial, só pra batch interno)
- Doc relacionada: `docs/wader/00-arquitetura.md` (fluxo Vivid → Orthanc → Wader → Leo)
- Doc relacionada: `docs/wader/01-instalacao.md` (configuração do Vivid T8)

---

## 10. Atualização — fechamento da sessão 13/05/2026 (madrugada 14/05)

> Adicionado ao mesmo ADR pra manter timeline linear. Cobre o que aconteceu DEPOIS das seções 1-9.

### 10.1. Bloco 3 implementado e mergeado (Wader processa SR)

Em vez de deixar como "próxima sessão", implementamos no mesmo dia. PRs mergeados em ordem:

| PR | sha merge | Conteúdo | Branch |
|---|---|---|---|
| **#14** | `07eb9d9` | fix: botão "📸 Imagens" aparece em qualquer status | `claude/fix-worklist-imagens-andamento` |
| **#15** | `5dab791` | feat: Wader processa DICOM SR, Leo lê do Firestore | `claude/wader-processa-sr` |
| **#16** | `c36704f` | fix ACC preventivo + ADR (este arquivo) | `claude/fix-acc-colisao` |

Mecânica de merge desta sessão: Sergio gerou Personal Access Token fine-grained (`claude-clinic-souleo`), Clinic Claude criou+mergeou PRs via API REST do GitHub. Token apagado do disco após cada uso. Sergio aprovou deixar token ativo até fechamento da sessão (vai revogar manualmente).

### 10.2. Bug derivado: botão 📸 desapareceu no Worklist

Ao remappear os 3 exames de 12/05 e mudar status pra `andamento` (Bloco 1), o botão "📸 Imagens (N)" sumiu da lista. Causa: no `Worklist.tsx:541` original, o botão estava dentro do bloco condicional `status === 'aguardando' || status === 'rascunho'`. Status novo `andamento` não tinha case.

Fix (PR #14): mover o botão pra fora dos blocos de status — agora aparece sempre que `imagensDicom.length > 0`, independente do status. Presença de imagens é ortogonal ao estado do laudo.

### 10.3. Reprocessamento operacional dos 3 exames com SR

Após o PR #15 (Wader processa SR), rodei `C:\Wader\scripts\reprocessar-sr-3-exames.js` (mesma mecânica dos outros scripts ad-hoc da seção 8). Resultado:

| Doc Firestore | tipoExame | Medidas LOINC extraídas |
|---|---|---|
| `uj1U5egIB7ox8CzbNRV8` MANOEL | eco_tt | **29** |
| `v7JvTfjOhJBzCMcNuNIk` SONIA | eco_tt | **37** |
| `He5dXgFCv1oft6xNlUlL` SONIA | doppler_carotidas | **5** (vascular tem menos SR padrão) |

71 medidas total gravadas em `exame.medidasDicom`. Quando o site Leo subir com o código novo, médico vai clicar "📡 Vivid (29)" no Manoel e ver as medidas importarem no motor automaticamente. **Primeira vez que esse fluxo funciona em produção** (ver §5 — fluxo antigo via Vercel→Orthanc nunca funcionou).

### 10.4. 🚨 BLOQUEIO ABERTO — Vercel falhando deploy

**Descoberta no fim da sessão:** ao testar o Leo em produção, o botão 📸 **ainda não apareceu**. Investigação via GitHub API revelou que **os 8 deploys mais recentes em produção/preview estão `state=failure`**, desde `e8463b2` (Production, 13/05 13:34 BRT) — incluindo todos os PRs mergeados hoje.

```
13:34  e8463b2  Production  FAILURE  ← merge PR #12 (handshake dual-claude, manhã)
17:56  07eb9d9  Production  FAILURE  ← merge PR #14 (fix botão 📸)
18:01  5dab791  Production  FAILURE  ← merge PR #15 (Wader+SR)
~22:00 c36704f  Production  FAILURE  ← merge PR #16 (fix ACC + este ADR — provável status)
```

**Conclusão dura:**

- O domínio `souleo.com.br` está servindo **versão antiga** (último deploy bem-sucedido, anterior a 13:34 BRT do dia 13/05)
- Nenhum dos PRs #14/#15/#16 está ativo em produção
- O bug que causou o failure foi introduzido por algo **antes da minha sessão começar** (PR #12 ou anterior)

**O que NÃO consegui daqui:**

- API GitHub só retorna `state` e `description` do deploy, **não o build log**
- Pra diagnosticar, preciso do log de build do Vercel — somente acessível via Vercel dashboard logado ou via Vercel API com token (que Sergio não me deu)

**Próximo passo combinado:** Sergio vai pegar o log de build da deploy `5dab791` no Vercel dashboard quando retomarmos. Com o log, eu corrijo, commito, e o site sobe.

**Mitigação:** os dados (Firestore + Storage) já estão certos. Quando o site subir, o estado fica consistente automaticamente — não tem migração de dados pendente.

### 10.5. Scripts ad-hoc adicionados nesta tarde

- `check-3-exames.js` — confirma estado pós-remap
- `reprocessar-sr-3-exames.js` — popula `medidasDicom` dos 3 exames (replica logic do `dicom-sr-parser.ts` em JS puro)
- `inspect-orthanc.js`, `identificar-estudo-sem-acc.js`, `baixar-previews-sonia-1050.js` — já mencionados §8

Todos em `C:\Wader\scripts\` (NÃO no repo).

### 10.6. Estado atual do checklist

- ✅ ACC duplicado: fix preventivo em produção (após merge PR #16). Counter global + validação defensiva no save.
- ✅ Exames quebrados: remappeados (imagens corretas) + ACCs distintos + medidasDicom populado.
- ✅ Wader processa SR: código mergeado.
- ✅ Leo lê Firestore (não chama Vercel→Orthanc): código mergeado.
- ✅ Status automático "andamento" pelo Wader: código mergeado.
- 🚨 **BLOQUEIO:** Vercel não deploya — site servindo versão antiga. Aguardando log de build.
- ⏳ Sergio revogar PAT (acordado pro fim da sessão).
- 📋 Backlog (registrado §7): galeria DICOM dentro do laudo, deprecar `/api/orthanc?action=buscar_sr` legacy, Auto-Send Vivid, Wader startup Windows.

### 10.7. Como retomar (próximo Clinic Claude ou Notebook Claude)

1. `git pull origin master` — pega os PRs #14/#15/#16
2. Pedir ao Sergio o log de build do Vercel (deploy `5dab791` ou mais recente)
3. Identificar erro no log (provavelmente TS error ou config issue)
4. Aplicar fix em branch nova → PR → merge via API
5. Após Vercel voltar a deployar com sucesso, testar:
   - Worklist mostra "📸 Imagens (10/10/12)" nos 3 exames
   - Laudo da Sonia carótida mostra "📡 Vivid (5)" habilitado
   - Click em "📡 Vivid" importa 5 medidas no motor

---

## 11. Continuação da sessão — 14/05/2026 (manhã/tarde)

> Apêndice ao ADR de 13/05. Mantém timeline linear pra próxima Claude (notebook ou clinic) pegar contexto via `/sync-me-up`.

### 11.1. Vercel destravado (Sergio, de casa)

PR #17 `claude/fix-vercel-build-exclude-wader` (commit `3811e1c`) mergeado pelo Sergio no início da madrugada de 14/05. Causa do bug Vercel descoberta:

```
Type error: Cannot find module 'fastify' (apps/wader/src/index.ts:27)
```

Next.js type-checkava tudo dentro do `tsconfig.include` do LEO web, incluindo `apps/wader/` — mas o Vercel só instala deps do projeto raiz (LEO), então `fastify`/`pino`/`dcmjs` (deps do Wader) não resolvem. Bug existia desde 09/05, mas só apareceu quando PRs começaram a tocar `src/` e quebrar o cache do build do LEO.

**Fix:** adicionar `apps/wader/**` e `scripts/**` ao `tsconfig.exclude`. Apps/wader tem seu próprio tsconfig pra dev local.

### 11.2. Galeria DICOM dentro do laudo (PR #19)

`src/components/laudo/DicomGallery.tsx` (NOVO):
- Modal full-screen com backdrop escuro
- Modo grid (thumbnails 2/3/4/5/6 cols responsivo) com lazy load
- Modo lightbox (imagem grande + setas + contador)
- Atalhos: ESC, ←, →

Integrado em `SidebarLaudo.tsx` (botão **"🖼️ Imagens (N)"** entre 📡 Vivid e 💾 Salvar) e em `page.tsx` (state `galeriaOpen`).

### 11.3. Imagens 403 — causa raiz e fix (PR #20)

Após PR #19, médico clicou no botão "🖼️ Imagens" mas as imagens vieram **pretas** (HTTP 403 Forbidden).

**Causa raiz:** URLs `storage.googleapis.com/{bucket}/{path}` são controladas por **IAM/ACL do objeto**, NÃO pelas Firebase Storage Rules. O comentário antigo no `storage-uploader.ts` mentia ("rules permitem leitura pública em dicom/"). O `<img src={url}>` no browser nunca enviou Firebase auth token, então sempre dava 403 — só nunca foi detectado porque a galeria não existia.

**Fix em 2 camadas:**
1. `apps/wader/src/adapters/storage-uploader.ts` — adiciona `predefinedAcl: 'publicRead'` ao `file.save()` (próximos uploads do Wader)
2. `storage.rules` — adiciona `match /dicom/...` com `allow read: if true` (redundante pra URLs públicas, mas mantém compat futura com Firebase SDK)

**Operacional:** script ad-hoc `C:\Wader\scripts\fix-acl-publica-imagens.js` re-aplicou ACL `publicRead` nas **61 imagens existentes** em `dicom/*` (5 exames do dia 11 + 12/05). URLs testadas após fix: HTTP 200 ✅.

### 11.4. Modal abre no Worklist (modo secretária — PR #20 também)

Bug: clicar "📸 Imagens (N)" no Worklist abria o motor do laudo. Importante porque o **modo secretária** não deve entrar no motor.

**Fix em `Worklist.tsx`:** importa `<DicomGallery />`, novo estado `galeria`, click no botão abre modal direto no contexto do Worklist. Por default usa `permitirSelecao=false` (secretária só visualiza).

### 11.5. Seleção de imagens pra impressão (PR #21)

Decisão tomada com Sergio em discussão:

- **N imagens selecionáveis** (qualquer número, sem limite forçado)
- **8 por página A4** no PDF final (grid 2×4), última página pode ter slots vazios
- **Páginas extras** após Conclusão (`page-break-before: always`)
- **Auto-save no toggle** (decisão: "todas ficaram salvas" — referindo-se ao Storage; a seleção também persiste automaticamente)
- **Default visual: 8 primeiras pré-selecionadas** ao abrir (só persiste quando médico toggle pela 1ª vez)
- **Modo secretária:** sem seleção (só visualiza)
- **Nome do botão:** "🖨️ Imprimir Seleção" (não "Salvar seleção") — abre janela com layout 2×4 + print dialog SEM laudo principal

Campo novo no Firestore: `exame.imagensSelecionadasPdf: string[]` (URLs na ordem de seleção).

Integração em `gerarPdfHtml()` do `page.tsx`: nova seção HTML com grid 2×4 após Conclusão.

### 11.6. 🐛 BUGS ABERTOS — pra próxima sessão

#### 11.6.a. UX de seleção confusa

Sergio reportou: "NAO FUNCIONOU AO CLICAR, A IMAGEM AMPLIA!!" Quer **caixinha de seleção SEPARADA** do click pra ampliar.

**Estado atual (PR #21):**
- Click na imagem → abre lightbox (ampliar) ✅
- Toggle de seleção é botão "+/✓" pequeno no canto sup. esq. da thumb, com `opacity-0 group-hover:opacity-100` (só aparece em hover, pouco visível)

**O que fazer:**
- Checkbox **sempre visível** (não dependente de hover)
- Maior, mais óbvio (ex: ícone ☐/☑ ou switch)
- Posição clara, separada do badge de ordem (badge fica no canto inferior direito, checkbox pode ir no canto sup. esq.)
- Click na imagem continua abrindo lightbox

#### 11.6.b. "Imprimir não está correto"

Sergio reportou (sem detalhar): "A FUNÇÃO IMPRIMIR NAO AJUSTOU." Possíveis cenários:
- Botão "🖨️ Imprimir Seleção" no modal não funciona (não abre janela, ou abre com layout errado/imagens não carregam)
- PDF final (Salvar/Emitir) não inclui a seção de imagens
- Outro problema

**Pra próxima sessão:** pedir esclarecimento + investigar. Possíveis suspeitas a checar:
- `window.open` bloqueado por popup blocker
- CSS `@page` ou `page-break-before` não funciona em alguns browsers
- Imagens DICOM podem demorar a carregar — print dispara antes (atualmente espera só 300ms)
- `imagensPdfHtml` definido fora do retorno do `gerarPdfHtml()` — pode estar caindo em escopo errado? Conferir
- PR #21 talvez ainda nem deployou no Vercel quando Sergio testou (esperar deploy + F5 hard)

### 11.7. Estado dos PRs do dia 14/05

| PR | sha | Branch | Conteúdo | Status |
|---|---|---|---|---|
| #17 | `58c27c4` | `fix-vercel-build-exclude-wader` | Fix tsconfig pro Vercel buildar | ✅ Mergeado, deploy OK |
| #18 | `90861be` | `adr-update-fechamento-13-05` | Apêndice ao ADR (seção 10) | ✅ |
| #19 | `730af43` | `galeria-dicom-no-laudo` | Componente `DicomGallery` | ✅ |
| #20 | `c74a9c0` | `fix-galeria-storage-rules-e-worklist-modal` | Fix 403 + modal no Worklist | ✅ |
| #21 | `88214dc` | `selecao-imagens-impressao` | Seleção + PDF com imagens | ✅ Merge OK, **UX com bug 11.6.a** + **imprimir com bug 11.6.b** |

### 11.8. Token PAT — ainda ativo

Sergio criou `claude-clinic-souleo` (fine-grained, scope `SergioAbdon/souleo` + Contents/PR write) e autorizou deixar **ativo até fim da sessão**. Usado pelo Clinic Claude pra criar+mergear PRs #14 a #21 via API.

**Pra revogar manualmente:** https://github.com/settings/tokens → claude-clinic-souleo → Delete.

### 11.9. keep-awake ainda rodando

PowerShell em background (PID 10088 quando armado) com `SetThreadExecutionState` previne sleep + display off. Mata com `Stop-Process -Id <PID>` ou fim do shell. PID atual salvo em `%TEMP%\keep-awake.pid`.

### 11.10. Próxima sessão deve

1. **Fix UX seleção (11.6.a):** checkbox sempre visível, click separado do ampliar
2. **Debug imprimir (11.6.b):** pedir detalhes ao Sergio, testar `imagensPdfHtml` rendering, conferir popup blocker, escopo de variável
3. (opcional) Galeria de imagens visível **dentro** do laudo (lado direito do sheet?) em vez de modal — médico pode marcar conforme digita o laudo
4. Backlog antigo: deprecar `/api/orthanc?action=buscar_sr`, Auto-Send Vivid, Wader startup Windows

---

## 12. Continuação da sessão — 15/05/2026

> Apêndice do dia 15/05. Coberta uma descoberta arquitetural enorme + 2 PRs grandes que destravam a integração SR de verdade.

### 12.1. Descoberta da lógica do DICOM SR do Vivid T8

**Sintoma:** ao tentar mapear LOINC → campo do motor, **só 2 de 29** códigos do Manoel eram reconhecidos via whitelist LOINC universal. Os outros 27 ou eram códigos GE proprietários (`G-0383`, `GEU-106-0103`, `F-32120`, `M-02550`) ou LOINCs que o Vivid usa com nome diferente do oficial.

**Descoberta:** o **próprio SR carrega o nome em texto** via campo `ConceptNameCodeSequence[0].CodeMeaning`. O Vivid se documenta sozinho dentro do DICOM. Exemplo:
```json
{
  "ConceptNameCodeSequence": [{
    "CodeValue": "29436-3",
    "CodeMeaning": "LV Internal End Diastolic Dimension",
    "CodingSchemeDesignator": "LN"
  }],
  "MeasuredValueSequence": [{
    "NumericValue": "5.3",
    "MeasurementUnitsCodeSequence": [{ "CodeValue": "cm" }]
  }]
}
```

**Implicação 1:** parser deve extrair `CodeMeaning` junto com `CodeValue` — não jogar fora.

**Implicação 2 (mais importante):** códigos genéricos como `M-02550` ("Diameter" no SNOMED-CT) aparecem em VÁRIOS Measurement Groups do SR (LA, LV, AO, MV...). Sozinho não dá pra saber qual diâmetro é. O contexto vive no grupo: se siblings mencionam "Left Atrium", o `M-02550` daquele grupo é o diâmetro AE.

**Estratégia adotada:** parser identifica o grupo pelos siblings e prefixa o código no schema final: `LA_M-02550`, `LV_29436-3`, `AO_18015-8`, etc.

Detalhes técnicos em `feedback_dicom_sr_vivid_logica.md` (memória local).

### 12.2. PR #23 — parser SR contextualizado + modal de import + UX completa

Commit `8bbac19` em master. 9 arquivos, +759/-154 linhas.

**O que mudou:**

| Onde | O quê |
|---|---|
| `apps/wader/src/adapters/dicom-sr-parser.ts` | Schema novo `Record<{grupo}_{codeValue}, MedidaSr>` com detecção de grupo |
| `apps/wader/src/types/exame.ts` | Tipo `MedidaSr` (value+unit+meaning+grupo) |
| `src/lib/dicom-sr-mapping.ts` (NOVO) | Whitelist `SR_TO_MOTOR` mapeando 7 inputs principais |
| `src/components/laudo/DicomSrImport.tsx` (NOVO) | Modal com checkbox 1-a-1 (Sugestão B) |
| `src/app/laudo/[id]/page.tsx` | Modal import + nome PDF dinâmico + toggle imagens |
| `src/components/laudo/SidebarLaudo.tsx` | Label "📡 Vivid" → "📡 Importar" |
| `src/components/laudo/DicomGallery.tsx` | Checkbox sempre visível (☐/☑) + fix 8/A4 (minmax 1fr) |
| `src/components/laudo/PopupEmitir.tsx` | Toggle "Incluir imagens DICOM no PDF" |
| `src/components/Worklist.tsx` | Secretária pode selecionar + imprimir |

**Reprocessamento operacional** (script ad-hoc):
- EDWALDO eco: **8/8** inputs mapeáveis
- SONIA eco: **8/8** inputs mapeáveis
- MANOEL eco: 7/8 (faltou AE Vol Index — Vivid não mandou esse exame)
- SONIA carótida: 0/8 (esperado, vascular tem SR diferente)
- CARMEN eco: 0/8 (estudo sem série SR no Orthanc — investigar)

### 12.3. PR #24 — fix import via DOM direto

Commit `913ee49`. Bug detectado em prod após PR #23: ao confirmar import, alert "Erro ao importar".

**Causa:** `window.importarDICOM()` do motor V8 espera payload `Record<LOINC, number>`. Estávamos passando `{ b7: 3.71, ... }` (IDs de campo do motor). Motor não interpretava → exception.

**Fix:** bypass do `importarDICOM`. Setar `input.value` direto + dispatch event `input` (bubbles) — o motor tem listener delegated em `#laudo-sidebar` que captura e recalcula tudo.

Detalhes em `feedback_dicom_sr_import_motor.md` (memória local).

### 12.4. Convenção sobre unidades cm vs mm

Decisão Sergio 15/05/2026: 

> "a gente depois modifica no vivid cm e mm!!! tem como enviar os valores assim mesmo, ao vamos perder tempo com esse ajuste!?"

Por enquanto:
- Vivid SR manda em **cm** (DDVE 5.32 cm, etc)
- Motor LEO tem labels em **mm**
- Código passa valor BRUTO sem converter — médico vê 5.32 onde label diz "mm" (mas é 5.32 cm = 53.2 mm)
- Quando Vivid for reconfigurado → valor já passa direto, código não precisa mudar

### 12.5. Quadro final dos PRs do dia 15/05

| PR | sha | Conteúdo | Status |
|---|---|---|---|
| #23 | `8bbac19` | Parser SR contextualizado + modal import + UX completa | ✅ |
| #24 | `913ee49` | Fix import via DOM direto (bypass importarDICOM) | ✅ |

### 12.6. 🐛 BUGS AINDA ABERTOS

#### 12.6.a Motor não auto-completa frases (achados + conclusão)

Reportado em 14/05 (§11.6, ainda aberto). Médico digita medida, valores calculados rolam (Massa, FE), mas **frases dos comentários e conclusão NÃO geram automaticamente**. 

Investigação pendente — precisa do **print do console F12** quando médico digita uma medida. Sergio prometeu mandar mas ainda não chegou.

Suspeita: regressão de algum `useEffect` mexido entre PRs #19-#23. O `_onLaudoGerado` callback (motor → TipTap) pode não estar disparando.

### 12.7. Validação pendente

Sergio precisa testar end-to-end com PR #23+#24 deployados:
1. Modal de import sem erro
2. Campos do motor preenchidos via DOM
3. Cascata de recalc rolando (Massa, FE)
4. PDF final com imagens 8/A4

### 12.8. Estado de coisas externas

- **PAT `claude-clinic-souleo`:** continua ativo (Sergio vai revogar quando terminar)
- **keep-awake (PID 10088):** continua rodando

### 12.9. Próxima sessão

1. **Bug das frases (12.6.a)** — investigar com print do console
2. (futuro) Sergio ajusta Vivid pra mandar SR em mm
3. (futuro) Mapear mais inputs SR quando Senna90 entrar
4. Backlog antigo: galeria DICOM dentro do laudo (visível enquanto digita), deprecar `/api/orthanc?action=buscar_sr`, Auto-Send Vivid

---

## 13. Definição canônica de STATUS + recuperação de órfãos — 15/05/2026 (tarde/noite)

### 13.1. Recuperação de 15 exames órfãos no Orthanc

Sergio registrou exames manualmente no Vivid (sem worklist) na semana de ajustes. Resultado: estudos no Orthanc sem ACC, exames no Leo sem imagens. Operação de link manual:

| Grupo | Exames | Método |
|---|---|---|
| **A** | 7 (ALANA, 2×JOSE, 2×MARIA, JURANDINA, ALESSANDRA) | Match nome+data (token-set, ignora ordem DICOM `SOBRENOME^NOME`). Link 1:1 |
| **B** | 6 (LETICIA, SILVANA, BENEDITA × eco+carótida) | Desambiguado por riqueza do SR: ECO 26-32 medidas, carótida 5 |
| **C** | KLAUS (linkado, confirmado via Feegow CPF) + ANA CAROLINA (criada retroativa) | Feegow lookup |

Critério-chave Grupo B (Sergio): "o exame que tem dados dicom são os ecos" → estudo com SR rico = eco_tt; SR pobre (5 medidas) = doppler_carotidas.

ANA CAROLINA: não tinha exame no Leo. Criado retroativo (data 11/05) com dados do Feegow (CPF 023.100.002-21, nasc 05/08/1997, F, eco_tt), ACC único `EX110526171900`, flag `criadoRetroativo: true`.

ADMIR NEGRAO MACEDO: agendado no Feegow + exame no Leo, mas **sem estudo no Orthanc** — DICOM nunca chegou (exame não realizado OU só no Vivid não enviado).

Scripts em `C:\Wader\scripts\` (fora do repo): `diagnostico-orfaos-v2.js`, `aplicar-link-grupo-a.js`, `analisar-grupo-b.js`, `aplicar-link-grupo-b.js`, `resolver-feegow-grupo-c.js`, `aplicar-grupo-c.js`.

### 13.2. Bug status legado (CARMEN/EDWALDO) + PR #26

CARMEN e EDWALDO ficaram com status legado `imagens-recebidas` (decisão antiga 11/05, removida em 13/05). Worklist não tinha bloco de botões pra esse status → exame "fantasma" sem ▶ Continuar.

- Operacional: 2 exames migrados `imagens-recebidas` → `andamento`
- PR #26 (`f292d2b`): normalização defensiva no Worklist — qualquer status fora de emitido/aguardando/rascunho cai no grupo `andamento`

### 13.3. DEFINIÇÃO CANÔNICA DE STATUS (fechada com Sergio)

**5 status oficiais:** `aguardando`, `andamento`, `rascunho`, `emitido`, `nao-realizado`.

| Status | Significado | Tem DICOM? |
|---|---|---|
| aguardando | Cadastrado, esperando paciente/imagens | não |
| andamento | REALIZADO, pendente de laudo (médico age) | sim |
| rascunho | Laudo iniciado, não emitido | sim ou não |
| emitido | Finalizado e assinado (documento médico-legal) | sim ou não |
| nao-realizado | Paciente faltou (cron, sem DICOM) | NUNCA |

**Regra de ouro:** tem DICOM ⇒ FOI REALIZADO ⇒ só caminha pra frente (andamento → rascunho → emitido). Nunca regride pra aguardando nem vira nao-realizado.

**3 travas:**
1. Cron meia-noite só marca `nao-realizado` quem é `aguardando` — código `cleanup-worklist/route.ts` JÁ filtra `status=='aguardando'` (verificado, correto, não mexido).
2. Wader ao processar DICOM (`dicom-ingest.ts`): `aguardando|nao-realizado → andamento`; `rascunho → mantém`; `emitido → mantém`. Lê status atual antes do update.
3. Emitido reaberto pra editar mas não reemitido → continua `emitido`. Leo avisa ao sair (Opção A).

**Legados mortos:** `imagens-recebidas`, `erro-imagens` — removidos do tipo, exames migrados.

### 13.4. Implementação (PR a mergear)

- `apps/wader/src/types/exame.ts`: `StatusExame` com comentário canônico + legados marcados mortos
- `apps/wader/src/workers/dicom-ingest.ts`: Trava 2 (lê status antes, preserva rascunho/emitido)
- `src/app/laudo/[id]/page.tsx`: Opção A — `reedicaoAtiva` state; handleDesbloquear marca; handleEmitir reseta; handleVoltar avisa
- Cron: NÃO mexido (já correto)

Memória local: `feedback_status_exame_canonico.md`.

### 13.5. Backlog dessa definição

- Dashboard: contador "⚠️ N exames realizados aguardando laudo" (andamento+rascunho com DICOM) — Sergio não decidiu ainda
- Opção C (rascunho de reedição persistido) — se quiserem não perder edição de emitido no futuro
