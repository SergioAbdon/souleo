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
