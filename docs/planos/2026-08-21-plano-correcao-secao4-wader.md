# Correção Seção 4 (Wader/DICOM/Orthanc) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar as decisões da revisão da Seção 4 (30 achados + adendo): identidade conferida no match, vínculo manual soberano, tela de conferência com excluir-p/-reenvio, worklist que reflete o exame, ingest robusto e rápido, repasse total do SR com perfil customizável, tela viva no laudo, imagens privadas, e cortes de código morto.

**Architecture:** Duas frentes. Frente Wader (Tasks 1–9): tudo que vira binário instalado na clínica — entra na MESMA atualização da visita. Frente web (Tasks 10–14): deploya pela Vercel. Task 15 fecha (tríade final, ADR, merge+deploy com confirmação do Sergio).

**Tech Stack:** Wader = TypeScript CommonJS + Fastify + firebase-admin + dcmjs, testes vitest (`cd apps/wader && npx vitest run`). Web = Next.js + Firestore client/admin, testes `npm run test:unit` / `test:api` / `test:rules`, `npx tsc --noEmit`, `npm run build`.

## Global Constraints

- Branch `feat/secao4-wader` a partir da `master`. Commit+push por task.
- Spec: `docs/superpowers/specs/2026-08-21-correcao-secao4-wader.md`. Decisões: tabela "DECISÕES FINAIS" em `docs/planos/2026-08-20-revisao-secao4-wader.md`. Em conflito, as DECISÕES vencem.
- INTOCÁVEIS: `src/app/laudo/[id]/page.tsx`, `src/components/laudo/**`, Direx — exceção única: Task 12 (D6), cirúrgica, revisor dedicado.
- NÃO usar `git stash`. Placar nunca regride: wader vitest 41+, unit 67+, api 182+, rules 132+, tsc e build limpos.
- Regra nova do Firestore só com confirmação explícita do Sergio (Task 13 tem uma).
- Decisão 19b: NENHUMA validação automática de faixa/plausibilidade de valor clínico — em lugar nenhum.
- Fuso: `hojeClinica()` (`apps/wader/src/lib/clinica-tempo.ts`) é a única fonte de "hoje" no Wader.
- `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem' })` é o padrão para data/hora da clínica.

---

### Task 1: Guarda de identidade + vínculo manual soberano (achados 3, 4, 28)

**Files:**
- Modify: `apps/wader/src/workers/dicom-ingest.ts`
- Test: `apps/wader/src/workers/dicom-ingest.test.ts` (já existe — adicionar casos)

**Interfaces:**
- Produces: `export const CAMPOS_DICOM_LIMPAR = ['dicomStudyUid','dicomOrthancStudyId','dicomMeta','medidasDicom','medidasDicomMeta','imagensDicom','imagensDicomDetalhes','imagensSelecionadasPdf'] as const;` (Task 7 usa)
- Produces: `export const estudosEmExclusao = new Set<string>();` (Task 7 usa)
- Produces: `IngestResult.motivoBloqueio?: 'cpf-divergente'` (Task 3 e a tela leem)

- [ ] **Step 1: Testes que falham** — adicionar em `dicom-ingest.test.ts` (seguir o padrão de mocks existente no arquivo):

```ts
it('bloqueia match automático quando CPF do DICOM diverge do CPF do exame', async () => {
  // mock: study.PatientMainDicomTags.PatientID = '11122233344'
  // mock: exame com acc casando e cpf = '99988877766'
  const r = await processarEstudo({ client, orthancStudyId: 'S1', wsId: 'ws' });
  expect(r.matched).toBe(false);
  expect(r.motivoBloqueio).toBe('cpf-divergente');
  // e NENHUM update foi feito no exameRef
});

it('segue o match quando um dos CPFs está vazio', async () => { /* cpf exame '' → matched true */ });

it('vínculo persistido vence o ACC: exame com dicomOrthancStudyId==S1 é o alvo mesmo com ACC apontando outro', async () => {
  // mock: query where('dicomOrthancStudyId','==','S1') devolve exame E2;
  // ACC do estudo casaria com E1. Esperado: exameIdNoLeo === 'E2'.
});

it('override limpa o dono anterior (campos DICOM removidos do exame que tinha o estudo)', async () => {
  // mock: E1 tem dicomOrthancStudyId='S1'; override para E2.
  // Esperado: update em E1 com FieldValue.delete() nos CAMPOS_DICOM_LIMPAR.
});

it('estudo em estudosEmExclusao não grava nada', async () => {
  estudosEmExclusao.add('S1');
  const r = await processarEstudo({ client, orthancStudyId: 'S1', wsId: 'ws' });
  expect(r.errors[0]).toMatch(/exclus/i);
  estudosEmExclusao.delete('S1');
});
```

- [ ] **Step 2:** `npx vitest run` → novos casos FALHAM.
- [ ] **Step 3: Implementação** em `dicom-ingest.ts`:

```ts
// topo do arquivo
export const CAMPOS_DICOM_LIMPAR = ['dicomStudyUid','dicomOrthancStudyId','dicomMeta','medidasDicom','medidasDicomMeta','imagensDicom','imagensDicomDetalhes','imagensSelecionadasPdf'] as const;
/** Estudos em exclusão pela tela de conferência (Task 7). Conferido antes de CADA write. */
export const estudosEmExclusao = new Set<string>();

// em IngestResult:
motivoBloqueio?: 'cpf-divergente';

// no início de processarEstudo, logo após montar `result`:
if (estudosEmExclusao.has(opts.orthancStudyId)) {
  result.errors.push('Estudo em exclusão — processamento abortado');
  return result;
}

// no ramo AUTOMÁTICO, ANTES do loop de candidatos(): vínculo persistido vence o ACC
const porVinculo = await examesCol.where('dicomOrthancStudyId', '==', opts.orthancStudyId).limit(1).get();
if (!porVinculo.empty) {
  exameRef = porVinculo.docs[0].ref;
  exameId = porVinculo.docs[0].id;
  exameData = porVinculo.docs[0].data();
} else {
  /* loop de candidatos() existente */
}

// no ramo AUTOMÁTICO, DEPOIS de resolver exameRef e ANTES de result.matched = true:
const cpfDicom = digitos(String(study.PatientMainDicomTags?.PatientID ?? ''));
const cpfExame = digitos(String(exameData.cpf ?? ''));
if (cpfDicom && cpfExame && cpfDicom !== cpfExame) {
  result.motivoBloqueio = 'cpf-divergente';
  result.errors.push(`Identidade divergente: DICOM PatientID=${cpfDicom} ≠ exame cpf=${cpfExame} — nada gravado`);
  log.warn({ exameId, acc: accession, cpfDicom, cpfExame }, 'Match BLOQUEADO por CPF divergente (D2)');
  return result;
}

// no ramo exameIdOverride, ANTES de prosseguir: limpar donos anteriores (achado 4B)
const limpar: Record<string, unknown> = { atualizadoEm: FieldValue.serverTimestamp() };
for (const c of CAMPOS_DICOM_LIMPAR) limpar[c] = FieldValue.delete();
for (const campo of ['dicomOrthancStudyId', 'dicomStudyUid'] as const) {
  const valor = campo === 'dicomOrthancStudyId' ? opts.orthancStudyId : (study.MainDicomTags.StudyInstanceUID ?? '__none__');
  const donos = await examesCol.where(campo, '==', valor).get();
  for (const d of donos.docs) {
    if (d.id === opts.exameIdOverride) continue;
    await d.ref.update(limpar);
    log.info({ exameLimpo: d.id, orthancStudyId: opts.orthancStudyId }, 'Dono anterior limpo (troca de vínculo)');
  }
}

// e antes de CADA exameRef.update(...) (etapa 1 e etapa 2), a trava anti-corrida:
if (estudosEmExclusao.has(opts.orthancStudyId)) {
  result.errors.push('Estudo entrou em exclusão durante o processamento — write abortado');
  return result;
}

// logs (achado 28): trocar `{ exameId: accession, ... }` por `{ exameId, acc: accession, ... }` nas 3 ocorrências.
```

- [ ] **Step 4:** `npx vitest run` → todos passam (41 + novos).
- [ ] **Step 5:** `git add -A && git commit -m "fix(wader): guarda de CPF no match + vinculo manual soberano + limpeza do dono anterior (S4-T1)" && git push`

---

### Task 2: Ingest robusto — cofre do emitido, path por instância, retry finito, cursor validado (achados 18, 12, 9, 10)

**Files:**
- Modify: `apps/wader/src/adapters/storage-uploader.ts`, `apps/wader/src/workers/dicom-ingest.ts`, `apps/wader/src/workers/dicom-ingest-worker.ts`, `apps/wader/src/workers/ingest-state.ts`
- Test: `dicom-ingest.test.ts`, `ingest-state.test.ts`

**Interfaces:**
- `uploadDicomPreview` ganha `instanceId: string` e o path vira `dicom/{wsId}/{exameId}/{orthancInstanceId}.jpg` (mantém `seq` só p/ ordenação do array).
- `StudySignature` ganha `nImgTentadas?: number`.
- `IngestStateStore.deleteSignature(studyId: string): void` (Task 7 usa).
- `DicomIngestWorker.forgetStudy(studyId: string): void` (Task 7 usa).

- [ ] **Step 1: Testes que falham:**

```ts
// ingest-state.test.ts
it('precisaProcessar usa nImgTentadas quando presente (falha permanente não loopa)', () => {
  store.setSignature('S', { nImg: 8, nImgTentadas: 9, nSR: 1, matched: true, at: 'x' });
  expect(store.precisaProcessar('S', 9, 1)).toBe(false);  // 9 tentadas = 9 no Orthanc
  expect(store.precisaProcessar('S', 10, 1)).toBe(true);  // chegou imagem nova
});
it('deleteSignature remove e persiste', () => { store.setSignature('S', sig); store.deleteSignature('S'); expect(store.getSignature('S')).toBeUndefined(); });

// dicom-ingest.test.ts
it('exame emitido: estudo novo vai para campos-sombra, nada sobrescrito', async () => {
  // mock exame status 'emitido' com medidasDicom antigas
  // esperado: update contém medidasDicomPendente/dicomAtualizacaoPendente e NÃO contém medidasDicom/imagensDicom
});
it('etapa 2 mescla imagens por orthancInstanceId (reprocesso parcial não encolhe a galeria)', async () => {
  // mock exame com imagensDicomDetalhes de 3 instâncias; reprocesso devolve 2 (1 falhou)
  // esperado: array final tem 3 (união por orthancInstanceId)
});
```

- [ ] **Step 2:** rodar → FALHAM.
- [ ] **Step 3: Implementação:**

```ts
// storage-uploader.ts — assinatura e path:
export async function uploadDicomPreview(opts: {
  wsId: string; exameId: string; instanceId: string; seq: number;
  buffer: Buffer; contentType?: string;
}): Promise<UploadResult> {
  const ext = (opts.contentType ?? 'image/jpeg').includes('png') ? 'png' : 'jpg';
  const path = `dicom/${opts.wsId}/${opts.exameId}/${opts.instanceId}.${ext}`;
  // resto igual (o cache de 1 ano agora é verdade: nome = conteúdo)

// dicom-ingest.ts — baixarImagensParalelo passa instanceId; etapa 2 vira merge:
const detalhesAtuais = (exameData.imagensDicomDetalhes as ImagemDicom[] | undefined) ?? [];
const porInstancia = new Map(detalhesAtuais.map((i) => [i.orthancInstanceId, i]));
for (const img of imagensDicom) porInstancia.set(img.orthancInstanceId, img);
const detalhesFinais = [...porInstancia.values()];

// cofre do emitido (D4): calcular uma vez `const cofre = statusAtual === 'emitido';`
// etapa 1: se cofre → gravar medidasDicomPendente / medidasDicomMetaPendente / dicomAtualizacaoPendente: true
//          e NÃO tocar em medidasDicom/dicomMeta/dicomStudyUid/status.
// etapa 2: se cofre → imagensDicomPendente; senão → imagensDicom/imagensDicomDetalhes = detalhesFinais.

// ingest-state.ts:
deleteSignature(studyId: string): void { if (this.state.studies[studyId]) { delete this.state.studies[studyId]; this.markDirty(); } }
// precisaProcessar: `const base = s.nImgTentadas ?? s.nImg; if (curImg > base) return true;`

// dicom-ingest-worker.ts:
forgetStudy(studyId: string): void { this.store.deleteSignature(studyId); }
// setSignature ganha: nImgTentadas: result.imagensProcessadas + result.imagensFalhadas,
// no tick, logo após `const desde = ...; const changes = await ...`:
if (changes.Last < desde) {
  log.warn({ desde, last: changes.Last }, 'Orthanc reiniciado/restaurado (cursor à frente do feed) — resetando cursor');
  this.store.reset();
  return;
}
```

- [ ] **Step 4:** `npx vitest run` → verde. Nota: o teste existente de path `{seq}.jpg` (se houver) atualiza junto.
- [ ] **Step 5:** commit `fix(wader): cofre do emitido + path por instancia + retry finito + cursor validado (S4-T2)` + push.

---

### Task 3: Recovery régua estrita (achados 8, 15, 26)

**Files:**
- Modify: `apps/wader/src/workers/acc-recovery-worker.ts`
- Test: `apps/wader/src/workers/acc-recovery-worker.test.ts` (novo)

**Interfaces:**
- Consome `digitos` de `lib/acc`, `hojeClinica` de `lib/clinica-tempo`, `IngestResult.exameIdNoLeo` (Task 1).

- [ ] **Step 1: Testes que falham** (novo arquivo, mocks de `getDb` e `client` no padrão dos testes vizinhos):

```ts
it('cutoffData deriva de hojeClinica (não UTC)', () => { /* mockar hojeClinica → '2026-08-21'; janela 4 → '2026-08-17' */ });
it('só conta recuperado quando o estudo tem ACC EXATO e entrou no exame que originou a busca', async () => {
  // estudo com ACC '...3341' ≠ exame '...334' → NÃO processa (vira órfão p/ tela)
  // estudo com ACC exato '...334' → processarEstudo SEM override; conta só se result.exameIdNoLeo === e.id
});
it('query usa where dataExame >= cutoff com limit 25 (sem varrer coleção)', async () => { /* espionar cadeia where().where().limit() */ });
```

- [ ] **Step 2:** rodar → FALHAM.
- [ ] **Step 3: Implementação:**

```ts
import { hojeClinica } from '../lib/clinica-tempo';

private cutoffData(): string {
  const dias = this.opts.janelaDias ?? 4;
  const [y, m, d] = hojeClinica().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10);
}

// query (índice composto status+dataExame JÁ publicado):
const snap = await getDb().collection('workspaces').doc(this.opts.wsId).collection('exames')
  .where('status', '==', 'aguardando')
  .where('dataExame', '>=', this.cutoffData())
  .limit(25)
  .get();
// filtro em memória remanescente: só !dicomStudyUid && acc string não-vazia.

// laço por exame — régua (i): SÓ ACC exato entra sozinho:
const studyIds = await this.opts.client.findStudiesByAccession(d);
for (const studyId of studyIds) {
  const study = await this.opts.client.getStudy(studyId);
  const accEstudo = digitos(String(study.MainDicomTags?.AccessionNumber ?? ''));
  if (accEstudo !== d) {
    log.info({ exameId: e.id, acc, accEstudo, studyId }, 'ACC apenas PARECIDO — não vincula (régua estrita; resolver na tela de conferência)');
    continue;
  }
  const result = await processarEstudo({ client: this.opts.client, orthancStudyId: studyId, wsId: this.opts.wsId });
  if (result.exameIdNoLeo === e.id && result.matched) {
    this.recuperados++;
    log.info({ exameId: e.id, acc, orthancStudyId: studyId }, 'Exame recuperado por ACC exato');
    break;
  }
}
```

- [ ] **Step 4:** verde. **Step 5:** commit `fix(wader): recovery com regua estrita + query indexada + hojeClinica (S4-T3)` + push.

---

### Task 4: ACC no cartório — editar-exame e criarManual (achados 5, 6)

**Files:**
- Modify: `apps/wader/src/ui/api/reconciliacao.ts` (editar-exame), `apps/wader/src/adapters/exames-repo.ts` (criarManual)
- Test: `apps/wader/src/adapters/exames-repo.test.ts` (existe), `apps/wader/src/ui/api/reconciliacao.test.ts` (novo, só p/ editar-exame)

**Interfaces:**
- Produces: `export function gerarAccessionNumber(agora?: Date): string` em `exames-repo.ts` — formato `EX{ddmmaa}{hhmmsscc}` (16 chars), relógio de Belém via `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Belem', ... })` (portar de `src/lib/feegow-admin.ts:20-37`; duplicação consciente — mesmo motivo do `cpfValido`).
- Reserva: doc `workspaces/{ws}/accIndex/{acc}` com `{ exameId, em: FieldValue.serverTimestamp() }` criado com `.create()` (falha se existe).

- [ ] **Step 1: Testes que falham:**

```ts
// exames-repo.test.ts
it('gerarAccessionNumber tem 16 chars formato EX+14 dígitos', () => { expect(gerarAccessionNumber()).toMatch(/^EX\d{14}$/); });
it('criarManual grava acc, cpf e reserva accIndex no mesmo fluxo', async () => { /* mock db: set do exame contém acc e cpf; create em accIndex/{acc} */ });

// reconciliacao.test.ts (injetar app fastify com mocks, padrão dos testes de api existentes no wader)
it('editar-exame com acc duplicado responde 409', async () => { /* mock: query acc==novo devolve outro doc */ });
it('editar-exame com acc novo troca a reserva em batch (create novo + delete antigo + update exame)', async () => {});
```

- [ ] **Step 2:** FALHAM. **Step 3: Implementação:**

```ts
// exames-repo.ts — criarManual, após resolver paciente:
const acc = gerarAccessionNumber();
const dadosFirestore = { /* existente */, acc, cpf: paciente.cpf ?? input.cpf ?? '' };
const batch = getDb().batch();
batch.set(docRef, dadosFirestore);
batch.create(getDb().doc(`workspaces/${this.wsId}/accIndex/${acc}`), { exameId, em: FieldValue.serverTimestamp() });
await batch.commit();
// colisão de acc (create falha, ALREADY_EXISTS) → regenerar com offset +10ms e tentar 1x mais.

// reconciliacao.ts — dentro do editar-exame, quando 'acc' in update:
if (typeof update.acc === 'string' && update.acc !== (snap.data()?.acc ?? '')) {
  const novo = update.acc.trim();
  const dup = await getDb().collection('workspaces').doc(config.wsId).collection('exames')
    .where('acc', '==', novo).limit(1).get();
  if (!dup.empty && dup.docs[0].id !== exameId) {
    return reply.status(409).send({ ok: false, error: `ACC ${novo} já pertence ao exame ${dup.docs[0].id}` });
  }
  const batch = getDb().batch();
  batch.create(getDb().doc(`workspaces/${config.wsId}/accIndex/${novo}`), { exameId, em: FieldValue.serverTimestamp() });
  const antigo = (snap.data()?.acc as string) || '';
  if (antigo) batch.delete(getDb().doc(`workspaces/${config.wsId}/accIndex/${antigo}`));
  batch.update(ref, update);
  await batch.commit();  // create falhou = ACC em uso → catch responde 409
  return reply.send({ ok: true, exameId, atualizados: Object.keys(update) });
}
```

- [ ] **Step 4:** verde. **Step 5:** commit `fix(wader): acc com reserva no cartorio no editar-exame e criarManual (S4-T4)` + push.

---

### Task 5: Worklist verdade (achados 7, 21, 22, 27)

**Files:**
- Modify: `apps/wader/src/workers/wl-writer.ts`, `apps/wader/src/workers/worklist-sync.ts`, `apps/wader/src/adapters/exames-repo.ts`, `apps/wader/src/types/exame.ts` (expor `mwlStatus`/`wlHash` no tipo + `docToExame`)
- Test: `apps/wader/src/workers/wl-writer.test.ts` (novo), `worklist-sync.test.ts` (novo, com pasta temporária `fs.mkdtempSync`)

**Interfaces:**
- Produces: `export function hashCamposWl(exame: Exame, opts: GerarWlOpts): string` em `wl-writer.ts` — sha1 (node:crypto) do JSON ordenado dos campos que entram no dataset: `[pacienteNome, cpf, feegowPacienteId, id, pacienteDtnasc, sexo, acc, tipoExame, dataExame, horarioChegada, medicoExecutor, scheduledStationName, scheduledProcedureStepLocation]`.
- `ExamesRepo.marcarMwl(exameId, status, wlHash?)` — grava hash junto; `ExamesRepo.limparMwl(exameId)` — `FieldValue.delete()` em `mwlStatus` e `wlHash`.

- [ ] **Step 1: Testes que falham:**

```ts
// wl-writer.test.ts
it('horaHHMMParaDicom aguenta HH:MM:SS e vazio', () => {
  expect(horaHHMMParaDicom('14:30')).toBe('143000');
  expect(horaHHMMParaDicom('14:30:00')).toBe('143000');
  expect(horaHHMMParaDicom('')).toBe('');
});
it('hashCamposWl é estável e muda quando um campo do dataset muda', () => {});
// worklist-sync.test.ts (tmpdir + mocks de repo)
it('regrava .wl quando wlHash do exame diverge do atual', async () => {});
it('marca mwlStatus ok no ramo intactos quando estava diferente', async () => {});
it('limpa mwlStatus quando o .wl é removido', async () => {});
it('NÃO remove .wl quando dataAlvo != hojeClinica (consulta de outro dia é só leitura)', async () => {});
```

- [ ] **Step 2:** FALHAM. **Step 3: Implementação:**

```ts
// wl-writer.ts
export function horaHHMMParaDicom(hhmm: string): string {  // exportar p/ teste
  if (!hhmm) return '';
  return hhmm.replace(/:/g, '').padEnd(6, '0').slice(0, 6);
}
import { createHash } from 'node:crypto';
export function hashCamposWl(exame: Exame, opts: GerarWlOpts = {}): string {
  const campos = [exame.pacienteNome, exame.cpf, exame.feegowPacienteId, exame.id, exame.pacienteDtnasc,
    exame.sexo, exame.acc, exame.tipoExame, exame.dataExame, exame.horarioChegada, exame.medicoExecutor,
    opts.scheduledStationName, opts.scheduledProcedureStepLocation];
  return createHash('sha1').update(JSON.stringify(campos.map((c) => c ?? ''))).digest('hex');
}

// worklist-sync.ts — ramo "já existe":
const hashAtual = hashCamposWl(exame, optsWl);
if (idsExistentesNaPasta.has(exame.id)) {
  if (exame.wlHash === hashAtual && exame.mwlStatus === 'ok') { result.wlsIntactos++; continue; }
  // regrava (dado mudou) ou reafirma o selo (Wader reiniciou)
  if (exame.wlHash !== hashAtual) { salvarWl(...); result.wlsCriados++; }
  else result.wlsIntactos++;
  await repo.marcarMwl(exame.id, 'ok', hashAtual);
  continue;
}
// ramo criação: marcarMwl(exame.id, 'ok', hashAtual)
// laço de remoção: só roda `if (dataAlvo === hojeClinica())`; após deletarWl com sucesso → repo.limparMwl(exameId)
```

- [ ] **Step 4:** verde. **Step 5:** commit `fix(wader): wl regravado por hash + mwlStatus nos dois sentidos + remocao so hoje + TM valido (S4-T5)` + push.

---

### Task 6: Visibilidade e velocidade (achados 11, 13, 14, 29 + pacote de latência)

**Files:**
- Modify: `apps/wader/src/adapters/heartbeat.ts`, `apps/wader/src/index.ts`, `apps/wader/src/ui/server.ts`, `apps/wader/src/ui/api/dicom.ts`, `apps/wader/src/ui/api/orthanc-config.ts`, `apps/wader/src/workers/dicom-ingest-worker.ts`, `apps/wader/src/workers/dicom-ingest.ts`, `apps/wader/src/adapters/orthanc-client.ts`, `apps/wader/src/config/load.ts` (default do tick), `apps/wader/wader.config.example.json`
- Test: `heartbeat.test.ts` (existe), `dicom-ingest.test.ts`

**Interfaces:**
- `UiServerExtras` ganha `workspaceRepo?: WorkspaceRepo | null` e `versao?: string` — `registerDicomRoutes`/`registerOrthancConfigRoutes` passam a receber e usar as instâncias compartilhadas do `index.ts` (fim das 3 cópias).
- `iniciarBatimento(wsId, versao, repo, client, extras?: { ultimoErroIngest?: () => string | null })`.
- `OrthancClient.getSeries(seriesId: string): Promise<OrthancSeries & { ParentStudy?: string }>` (novo, GET `/series/{id}`).
- `processarEstudo` ganha `soMedidas?: boolean` — retorna após a etapa 1 (sem imagens), NÃO grava assinatura no worker.
- Config: `polling.orthancChangesSec` default 30 → **5**.

- [ ] **Step 1: Testes que falham:**

```ts
// heartbeat.test.ts
it('detecta outro Wader ativo: maquina diferente com visto < 10min grava conflito', async () => {});
it('mesma maquina limpa o campo conflito', async () => {});
// dicom-ingest.test.ts
it('soMedidas grava etapa 1 e NÃO baixa imagens', async () => {});
it('falha total de imagens grava dicomUltimoErro/dicomUltimoErroEm no exame', async () => {});
```

- [ ] **Step 2:** FALHAM. **Step 3: Implementação:**

```ts
// heartbeat.ts — no bater(), antes do set:
const ref = getDb().doc(`workspaces/${wsId}/integracoes/wader`);
const atual = (await ref.get()).data() as { maquina?: string; visto?: { toDate?: () => Date } } | undefined;
const eu = os.hostname();
let conflito: string | null = null;
const vistoDate = atual?.visto?.toDate?.();
if (atual?.maquina && atual.maquina !== eu && vistoDate && Date.now() - vistoDate.getTime() < 10 * 60 * 1000) {
  conflito = atual.maquina;
  log.warn({ outro: conflito }, '⚠️ DOIS Waders ativos no mesmo workspace');
}
await ref.set({ tipo: 'wader', visto: new Date(), versao, maquina: eu, conflito,
  ultimoErroIngest: extras?.ultimoErroIngest?.() ?? null }, { merge: true });

// dicom-ingest.ts — no else de (todasFalharam || semInstances):
await exameRef.update({
  dicomUltimoErro: semInstances ? 'Estudo sem instances no Orthanc' : `Falha ao subir ${result.imagensFalhadas} imagens`,
  dicomUltimoErroEm: FieldValue.serverTimestamp(),
});
// e no fim do caminho feliz da etapa 2: dicomUltimoErro: FieldValue.delete()

// soMedidas: após o log da etapa 1 → `if (opts.soMedidas) return result;`

// dicom-ingest-worker.ts — no tick, além de StableStudy: medidas na chegada
for (const c of changes.Changes) {
  if (c.ChangeType === 'NewSeries' && c.ResourceType === 'Series') {
    try {
      const serie = await this.opts.client.getSeries(c.ID);
      if ((serie.MainDicomTags?.Modality ?? '') === 'SR' && serie.ParentStudy) {
        await processarEstudo({ client: this.opts.client, orthancStudyId: serie.ParentStudy,
          wsId: this.opts.wsId, forceSr: true, soMedidas: true });
      }
    } catch { /* estudo pode ter sumido; StableStudy cobre depois */ }
  }
}
// worker expõe: getUltimoErro(): string | null → this.lastError

// index.ts: passar { worklistWorker, dicomWorker, orthancClient, workspaceRepo, versao: lerVersaoPackage() }
// e iniciarBatimento(..., { ultimoErroIngest: () => dicomWorker?.getUltimoErro() ?? null })
// server.ts /version: async () => ({ version: extras.versao ?? '0.0.0' })
// config/load.ts: default orthancChangesSec 5 (comentar o porquê: latência, chamada local barata)
```

- [ ] **Step 4:** verde. **Step 5:** commit `feat(wader): 2-waders detectado + erro visivel + cliente unico + SR na chegada + tick 5s + version real (S4-T6)` + push.

---

### Task 7: Tela de conferência + excluir para reenvio (D3, adendo, achado 23)

**Files:**
- Modify: `apps/wader/src/ui/api/reconciliacao.ts`, `apps/wader/src/adapters/orthanc-client.ts`, `apps/wader/src/ui/server.ts` (rota `/conferencia` + passar `dicomWorker`)
- Create: `apps/wader/src/ui/pages/conferencia.html`
- Test: `reconciliacao.test.ts`

**Interfaces:**
- `OrthancClient.deleteStudy(studyId): Promise<void>` — `DELETE /studies/{id}`, timeout próprio 60s, **404 = sucesso** (idempotente).
- `listStudies(limit, dataIso?: string)` — quando `dataIso` vier: `Query: { StudyDate: dataIso.replace(/-/g, '') }` (achado 23).
- `registerReconciliacaoRoutes(app, config, client, dicomWorker: DicomIngestWorker | null)`.
- Consome da Task 1: `CAMPOS_DICOM_LIMPAR`, `estudosEmExclusao`; da Task 2: `forgetStudy`.
- Auditoria: doc em `workspaces/{ws}/auditoria` (só Admin SDK escreve/lê — NENHUMA regra nova; cliente web não acessa).

- [ ] **Step 1: Testes que falham** (mocks; foco na ordem e nas recusas):

```ts
it('excluir-reenvio recusa quando dicomWorker é null (UI-only) com 409', async () => {});
it('excluir-reenvio recusa quando o exame dono está emitido', async () => {});
it('excluir-reenvio recusa quando a impressão digital divergiu (estudo mudou desde a renderização)', async () => {});
it('excluir-reenvio executa na ordem: marca → limpa donos+Storage → auditoria → DELETE → forget → desmarca', async () => {
  // espionar chamadas; verificar que estudosEmExclusao contém o id DURANTE a limpeza e não depois
});
it('reconciliacao usa where dataExame == data (não 5 varreduras por status)', async () => {});
it('sugestões: órfão com CPF que bate exame do dia vem com sugestaoExameId preenchido', async () => {});
```

- [ ] **Step 2:** FALHAM. **Step 3: Implementação (backend):**

```ts
// montarReconciliacao: trocar o laço de 5 status por
const snap = await examesCol.where('dataExame', '==', data).get();
// listStudies(80, data) — filtrado por StudyDate.
// órfãos ganham sugestões: sugestaoExameId = exame do dia cujo digitos(cpf) === digitos(PatientID do estudo)
//   (senão null); e a resposta lista também exames sem imagem p/ o dropdown da tela.

// POST /api/reconciliacao/excluir-reenvio
// Body: { orthancStudyId, fingerprint: { accDicom, patientIdDicom, nInstances }, operador }
app.post('/api/reconciliacao/excluir-reenvio', async (req, reply) => {
  const { orthancStudyId, fingerprint, operador } = req.body ?? {};
  if (!orthancStudyId || !fingerprint) return reply.status(400).send({ ok: false, error: 'orthancStudyId e fingerprint são obrigatórios' });
  if (!client) return reply.status(409).send({ ok: false, error: 'Orthanc não configurado' });
  if (!dicomWorker) return reply.status(409).send({ ok: false, error: 'Instância UI-only não pode excluir (o Wader de produção detém o estado de ingestão)' });

  const study = await client.getStudy(orthancStudyId).catch(() => null);
  if (!study) return reply.status(404).send({ ok: false, error: 'Estudo não existe (já excluído?)' });
  // anti-corrida com a própria tela: confere a impressão digital capturada na renderização
  const nInst = (study.Series ?? []).length;  // nº de séries como proxy barato + ACC + PatientID
  if (digitos(study.MainDicomTags?.AccessionNumber) !== digitos(fingerprint.accDicom) ||
      digitos(study.PatientMainDicomTags?.PatientID) !== digitos(fingerprint.patientIdDicom)) {
    return reply.status(409).send({ ok: false, error: 'O estudo mudou desde que a tela carregou — recarregue e confira' });
  }

  const examesCol = getDb().collection('workspaces').doc(config.wsId).collection('exames');
  const uid = study.MainDicomTags.StudyInstanceUID ?? '__none__';
  const donosSnap = [
    ...(await examesCol.where('dicomOrthancStudyId', '==', orthancStudyId).get()).docs,
    ...(await examesCol.where('dicomStudyUid', '==', uid).get()).docs,
  ];
  const donos = [...new Map(donosSnap.map((d) => [d.id, d])).values()];
  for (const d of donos) {
    if ((d.data().status as string) === 'emitido') {
      return reply.status(409).send({ ok: false, error: `Exame ${d.id} está EMITIDO — use o fluxo corrigir-laudo antes de excluir o estudo` });
    }
  }

  estudosEmExclusao.add(orthancStudyId);
  try {
    // 1) limpar donos (campos + status de volta + Storage)
    for (const d of donos) {
      const limpar: Record<string, unknown> = { atualizadoEm: FieldValue.serverTimestamp() };
      for (const c of CAMPOS_DICOM_LIMPAR) limpar[c] = FieldValue.delete();
      const st = d.data().status as string;
      if (st !== 'rascunho' && st !== 'emitido') limpar.status = 'aguardando';
      await d.ref.update(limpar);
      await removerImagensExame(config.wsId, d.id);
    }
    // 2) auditoria (retrato ANTES do DELETE)
    await getDb().collection('workspaces').doc(config.wsId).collection('auditoria').add({
      tipo: 'exclusao-estudo-orthanc', orthancStudyId, studyInstanceUID: uid,
      accDicom: study.MainDicomTags?.AccessionNumber ?? '', patientIdDicom: study.PatientMainDicomTags?.PatientID ?? '',
      patientNameDicom: study.PatientMainDicomTags?.PatientName ?? '', nSeries: nInst,
      examesLimpos: donos.map((d) => d.id), operadorDeclarado: String(operador ?? ''),
      maquina: os.hostname(), em: FieldValue.serverTimestamp(),
    });
    // 3) DELETE (404 = sucesso) e 4) esquecer assinatura
    await client.deleteStudy(orthancStudyId);
    dicomWorker.forgetStudy(orthancStudyId);
  } finally {
    estudosEmExclusao.delete(orthancStudyId);
  }
  return reply.send({ ok: true, examesLimpos: donos.map((d) => d.id), mensagem: 'Estudo excluído. Corrija o cadastro no aparelho e peça o REENVIO agora.' });
});

// POST /api/reconciliacao/reprocessar { orthancStudyId } → processarEstudo direto (forceSr: true)
```

- [ ] **Step 4: Frontend `conferencia.html`** — seguir o estilo/JS vanilla de `admin.html`. Conteúdo mínimo: seletor de data (default hoje); tabela "Exames do dia" (nome, ACC, status, vínculo, imagens, `dicomUltimoErro`, `matchStatus`); tabela "Estudos sem dono" (nome/CPF/hora do DICOM, sugestão pré-selecionada quando houver, dropdown de exames do dia, botões **Vincular** e **Excluir p/ reenvio**); em cada exame vinculado, botão **Trocar vínculo** (chama `/vincular` com outro exameId — a Task 1 limpa o dono anterior) e **Reprocessar**. Campo "Operador" (texto livre, persistido em `localStorage`, obrigatório para excluir). Confirmação de exclusão exige digitar o nome do paciente do DICOM e mostra o texto: *"Remover permanentemente o estudo do arquivo da clínica. As imagens some(m) do LEO e do Orthanc. Após excluir: corrija o cadastro no Vivid e REENVIE."* Aviso pós vincular/trocar: *"Confira as imagens antes de emitir."* Link no `admin.html` para `/conferencia`; **NÃO** adicionar em `reception.html`.
- [ ] **Step 5:** `npx vitest run` verde + subir Wader local (`WADER_UI_ONLY=1`) e conferir a página renderiza.
- [ ] **Step 6:** commit `feat(wader): tela de conferencia (vincular/trocar/excluir-p-reenvio/reprocessar) + recon por data (S4-T7)` + push.

---

### Task 8: Repasse total do SR — versão, empate honesto, alarme (achados 16-Wader, 19a)

**Files:**
- Modify: `apps/wader/src/adapters/dicom-sr-parser.ts`, `apps/wader/src/workers/dicom-ingest.ts` (meta), `apps/wader/src/types/exame.ts` (re-export do tipo — corte P7 da Task 9 depende)
- Test: `apps/wader/src/adapters/dicom-sr-parser.test.ts` (novo, fixtures sintéticas de ContentSequence)

**Interfaces:**
- Produces: `export const PARSER_VERSAO = 'sr-2026-08-21';` — gravado em `medidasDicomMeta.parserVersao`.
- Produces: `export const CODIGOS_CONHECIDOS = ['18015-8','M-02550','29436-3','18154-5','18152-9','29438-9','18012-5','18037-2','18038-0','59133-9','59111-5','GEU-106-0033'];` (p/ o alarme).

- [ ] **Step 1: Testes que falham:**

```ts
it('empate de votos vira general (nunca chuta estrutura)', () => { /* siblings 2 LV + 2 AO → general */ });
it('vitória clara continua funcionando', () => { /* 3 AO + 1 LV → AO */ });
it('warn quando código conhecido cai em general_*', () => { /* espionar log.warn */ });
it('nenhum item numérico é descartado: código sem grupo vem como general_{code}', () => {});
it('parserVersao acompanha o resultado', () => { /* SrParseResult.parserVersao === PARSER_VERSAO */ });
```

- [ ] **Step 2:** FALHAM. **Step 3: Implementação:**

```ts
// detectarGrupo — desempate honesto:
let max = 0; let grupo: GrupoSr = 'general'; let empate = false;
for (const g of Object.keys(votos) as GrupoSr[]) {
  if (g === 'general') continue;
  if (votos[g] > max) { max = votos[g]; grupo = g; empate = false; }
  else if (votos[g] === max && max > 0) empate = true;
}
return empate ? 'general' : grupo;

// SrParseResult ganha parserVersao: string; extrairMedidasDoEstudo o inclui.
// Após montar `medidas`: alarme de regressão
for (const key of Object.keys(medidas)) {
  if (key.startsWith('general_')) {
    const code = key.slice('general_'.length);
    if (CODIGOS_CONHECIDOS.includes(code)) {
      log.warn({ key, meaning: medidas[key].meaning }, '⚠️ Medida CONHECIDA caiu em general — rótulos do aparelho mudaram? (perfil pode precisar de ajuste)');
    }
  }
}
// dicom-ingest.ts etapa 1: medidasDicomMeta ganha parserVersao: srResult.parserVersao.
```

- [ ] **Step 4:** verde. **Step 5:** commit `feat(wader): parser SR com versao, empate honesto e alarme de regressao (S4-T8)` + push.

---

### Task 9: Reprocesso sob demanda + cortes Ponytail no Wader (D1b-Wader, D7 parcial, achado 30)

**Files:**
- Modify: `apps/wader/src/workers/dicom-ingest-worker.ts` (flag), `apps/wader/src/config/types.ts` + `config/load.ts` (cortes), `apps/wader/src/adapters/orthanc-client.ts` (cortes), `apps/wader/src/lib/acc.ts` (corte), `apps/wader/src/types/exame.ts` (P7: `export type { MedidaSr, GrupoSr } from '../adapters/dicom-sr-parser';`)
- Delete: `apps/wader/src/service/windows-service.ts`
- Create: `apps/wader/scripts/reprocessar-legado.ts` (mutirão opcional)
- Test: `dicom-ingest.test.ts` / ajustar mocks afetados

- [ ] **Step 1: Teste que falha:** worker consome flag:

```ts
it('exame com reprocessarDicom=true e dicomOrthancStudyId é reprocessado com override e a flag limpa', async () => {});
it('exame com flag mas sem vínculo: flag limpa + dicomUltimoErro gravado', async () => {});
```

- [ ] **Step 2:** FALHA. **Step 3:** no tick do worker (após o laço de stable):

```ts
const flagSnap = await getDb().collection('workspaces').doc(this.opts.wsId).collection('exames')
  .where('reprocessarDicom', '==', true).limit(10).get();
for (const d of flagSnap.docs) {
  const studyId = d.data().dicomOrthancStudyId as string | undefined;
  if (studyId) {
    await processarEstudo({ client: this.opts.client, orthancStudyId: studyId, wsId: this.opts.wsId,
      forceSr: true, exameIdOverride: d.id });
    await d.ref.update({ reprocessarDicom: FieldValue.delete() });
  } else {
    await d.ref.update({ reprocessarDicom: FieldValue.delete(),
      dicomUltimoErro: 'Reprocesso pedido mas exame sem estudo vinculado', dicomUltimoErroEm: FieldValue.serverTimestamp() });
  }
}
```

- [ ] **Step 4: Cortes (D7, com o grep de call-sites do relatório como prova):** apagar `accIgual()` de `lib/acc.ts`; `getStudyInstances()` e `getInstanceFile()` de `orthanc-client.ts` (ajustar o shape do mock em `dicom-ingest.test.ts:96`); `windows-service.ts` inteiro (+ linha no README do wader); campos `activatedAt`, `TelemetryConfig`, `showTrayIcon` e `backup` (achado 30 — validação em `load.ts:94-96` sai junto) de `config/types.ts`/`load.ts`/`wader.config.example.json`.
- [ ] **Step 5: Script mutirão** `reprocessar-legado.ts`: lista exames cujo `medidasDicom` tem primeiro valor `number` (schema antigo) E `dicomOrthancStudyId` presente → seta `reprocessarDicom: true`. Dry-run por default; grava só com `--commit` (lembrete: `npm run reprocessar-legado -- --commit`).
- [ ] **Step 6:** `npx vitest run` + `npx tsc --noEmit` no wader → verdes. Commit `feat(wader): reprocesso sob demanda + cortes ponytail (S4-T9)` + push.

---

### Task 10 (web): Schema antigo não importa + tradutor com rede de testes (D1b-web, 17-web)

**Files:**
- Modify: `src/lib/dicom-sr-mapping.ts`
- Test: `tests/unit/dicom-sr-mapping.test.mjs` (novo — hoje este arquivo tem ZERO testes)

**Interfaces:**
- `normalizarParaImport` — schema antigo → retorna `[]` SEMPRE (fim do ramo legado; achados 1 e 2 mortos por construção).
- Produces: `export function isSchemaAntigo(medidas): boolean` (Task 12 usa p/ mostrar o botão de reprocesso).
- Schema novo com `unit === ''` e `map.alvo !== ''` → item **fora** da lista (achado 17). Item com unit válida segue convertendo.
- `normalizarParaImport` ganha 2º parâmetro opcional `mapa?: Record<string, {campo,nomePt,casas,alvo}>` (default `SR_TO_MOTOR`) — Task 13 injeta o perfil.

- [ ] **Step 1: Testes que falham** (tabela; usar os valores reais documentados — Manoel: DDVE 5,3cm; E 0,63 m/s; E/e' 26,8):

```js
// converter: ('cm'→mm ×10), ('m'→mm ×1000), ('m/s'→cm/s ×100), ('mm/s'→cm/s ÷10), razões nunca
// isSchemaNovo / isSchemaAntigo: objetos vs números
// normalizarParaImport(schemaAntigo) === []  ← o contrato central
// normalizarParaImport(schemaNovo com unit '') NÃO inclui o campo com alvo 'mm'
// normalizarParaImport(schemaNovo ok) converte e arredonda como hoje (E 0.63 m/s → 63 cm/s)
```

- [ ] **Step 2:** FALHAM (o ramo legado hoje devolve itens). **Step 3:** implementar: apagar o ramo `else` legado (linhas 161-177) → `return []` para schema antigo; skip de unit vazia no ramo novo (`if (map.alvo !== '' && !dado.unit) continue;`); parâmetro `mapa`.
- [ ] **Step 4:** `npm run test:unit` verde + `npx tsc --noEmit`. **Step 5:** commit `fix(web): schema antigo nao importa + unidade ausente barrada + testes do tradutor (S4-T10)` + push.

---

### Task 11 (web): Imagens privadas (D5b, achado 20)

**Files:**
- Modify: `apps/wader/src/adapters/storage-uploader.ts` (tirar `predefinedAcl`), `src/lib/exame-admin.ts` (exclusão chama remoção), rota de emissão (`src/app/api/emitir/**` — montagem do PDF)
- Create: `src/app/api/exame/imagens-urls/route.ts` (URLs assinadas p/ a galeria), `scripts/imagens-privar.mjs` (migração ACL dos objetos existentes, `--commit`)
- Test: `tests/api/` novo caso p/ a rota; ajuste dos testes do uploader

**Interfaces:**
- `POST /api/exame/imagens-urls { exameId }` — autenticado (mesmo gate de membro das rotas vizinhas), devolve `{ urls: Array<{ path, url, expiraEm }> }` com `getSignedUrl` (Admin SDK, validade 1h), derivando o path de `imagensDicomDetalhes[].path` (fallback: extrair path da URL pública antiga p/ os 182 legados).
- A galeria/laudo passam a buscar por essa rota — **atenção**: componentes do laudo são INTOCÁVEIS; a troca do consumo na galeria acontece na Task 12 (mesma task cirúrgica D6). Esta task entrega a rota + uploader + exclusão + script.
- Upload novo: sem `predefinedAcl` (privado por default). `cacheControl` mantém 1 ano (path por instância da Task 2 torna isso verdade).

- [ ] Steps: teste da rota (401 sem auth; 200 com membro; deriva path de URL legada) → FALHA → implementar → verde → `exame-admin` exclusão chama `removerImagensExame`-equivalente do lado web (Admin SDK, mesmo prefixo) → script de migração dry-run/`--commit` → bateria completa web → commit `feat(web): imagens privadas com URL assinada + remocao na exclusao (S4-T11)` + push.

---

### Task 12 (web, D6 — ÚNICA task que toca o Motor/laudo): Tela viva + modal + guarda + reprocesso UI (achados 24, 25; D1b-UI; rodapé do 16)

**Files:**
- Modify: `src/app/laudo/[id]/page.tsx` (CIRÚRGICO), `src/components/laudo/DicomSrImport.tsx`
- Test: `tests/unit/` p/ helpers extraíveis; verificação manual roteirizada (conta Gmail) no fim

**Escopo FECHADO (nada além disto):**
1. `page.tsx`: trocar o `getExame().then(setExame)` (linhas 117-142) por `onSnapshot` do doc do exame — atualiza `exame` a cada mudança; a inicialização de `imagensSelecionadasPdf` roda SÓ na primeira snapshot (guard `useRef`). Zero mudança em qualquer outra parte do arquivo.
2. `page.tsx`: `const inputsImportaveis = useMemo(() => getInputsImportaveis(), [exame?.medidasDicom])` e passar `inputsImportaveis` ao modal (mata o achado 25 na raiz).
3. `DicomSrImport.tsx`: dependência do reset vira `[open]`; rodapé ganha a linha "N de M medidas recebidas estão mapeadas" (props novas `totalRecebidas?: number`); quando `isSchemaAntigo(exame.medidasDicom)` → corpo mostra *"Medidas em formato antigo — solicitar reprocessamento no Wader"* + botão que grava `reprocessarDicom: true` no doc (a Task 9 consome) e fecha.
4. Guarda de emissão em `page.tsx`, no handler de emitir: se `exame.dicomUltimoErro` OU (`exame.medidasDicomMeta` existe E `(exame.imagensDicom ?? []).length === 0`) → `confirm()` com *"Imagens do exame ainda não chegaram/falharam (detalhe). Emitir mesmo assim?"*.

- [ ] Steps: implementar → `npx tsc --noEmit` + `npm run build` verdes → **verificação manual do Sergio na conta Gmail** (abrir laudo antes do Wader terminar e ver o botão acender sozinho; desmarcar uma medida com o modal aberto e confirmar que ela NÃO se remarca) → commit `feat(laudo): tela viva + modal estavel + guarda de emissao + reprocesso legado [D6 cirurgico] (S4-T12)` + push.
- **Revisor DEDICADO nesta task** (além do revisor padrão): conferir diff linha a linha contra o escopo fechado acima — qualquer linha fora dos 4 itens = reprovar.

---

### Task 13 (web): Perfil do aparelho no Firestore + editor em Integrações (16 ampliado; 19b NÃO entra)

**Files:**
- Create: `src/lib/perfil-aparelho.ts` (tipos + fallback + leitura), seção nova no cartão DICOM/Orthanc de `src/app/integracoes/**`
- Modify: `src/app/laudo/[id]/page.tsx` **NÃO** — o perfil chega ao laudo via `normalizarParaImport(medidas, mapa)` já plugado na Task 12? Não: a Task 12 não deve depender desta. Ordem: esta task passa o mapa ao `getInputsImportaveis` por contexto/prop FORA dos arquivos intocáveis se possível; se exigir tocar `page.tsx`, a mudança é 1 linha (origem do mapa) e entra como adendo explícito do escopo D6, com o mesmo revisor dedicado.
- Modify: `firestore.rules` (⚠️ REGRA NOVA — ver step de confirmação), `tests/rules/` payload real
- Test: `tests/unit/perfil-aparelho.test.mjs`, `tests/rules/`

**Interfaces:**
- Doc: `workspaces/{ws}/integracoes/perfilAparelho` → `{ nome: 'GE Vivid T8', atualizadoEm, atualizadoPor, mapeamentos: Record<string, { campo, nomePt, casas, alvo }> }` — semeado com `SR_TO_MOTOR` atual na primeira leitura pelo editor (não por migração).
- `carregarPerfilAparelho(wsId): Promise<Record<string, ...>>` — doc ausente/vazio → retorna `SR_TO_MOTOR` embutido (lição: config ausente nunca desliga comportamento).
- Editor no cartão de Integrações (padrão visual/gate dos editores procMap/profMap já existentes): tabela "Mapeadas" (linhas editáveis: nomePt, campo, alvo, casas; remover linha) + tabela "Recebidas sem destino" (agrega as chaves de `medidasDicom` dos últimos 20 exames com medidas, menos as mapeadas; mostra `meaning` e unit reais; botão "mapear" abre linha pré-preenchida). Gate por papel admin (mesmo `resolverPapel` das ações vizinhas). SEM coluna de faixa/min/max (decisão 19b).
- Regra: `match /workspaces/{ws}/integracoes/perfilAparelho` — read: membro; write: admin (espelhar a regra dos docs vizinhos de integracoes).

- [ ] Steps: testes (fallback embutido; merge de doc parcial; rules com payload real) → implementar → **PARAR e pedir confirmação do Sergio para publicar a regra** (`firebase deploy --only firestore:rules` só após o "sim") → bateria completa → commit `feat(web): perfil do aparelho customizavel no cartao Integracoes (S4-T13)` + push.

---

### Task 14 (web): Cortes Ponytail finais (D7)

**Files:**
- Delete: `src/motor/adaptador-motor.js` (293 linhas, DEPRECATED, zero imports — **fecha a suspeita de 12/05**), `legacy/motores/adaptador-motor.js` (cópia idêntica)
- Test: bateria completa

- [ ] Steps: `grep -rn "adaptador-motor" src/ apps/ --include=*.ts --include=*.tsx --include=*.js` → confirmar zero imports ativos (docs e legacy/scripts-py não contam) → deletar os 2 arquivos → `npx tsc --noEmit` + `npm run build` + bateria completa verdes → commit `chore: apaga adaptador-motor morto (suspeita 12/05 encerrada) (S4-T14)` + push.

---

### Task 15: Fechamento

- [ ] Bateria COMPLETA das duas frentes (wader vitest, unit, api, rules, tsc, build, e2e se ambiente permitir) — placar ≥ partida.
- [ ] TRÍADE FINAL adversarial sobre o diff completo da branch (Codex bugs/segurança com verificação adversarial; revisor arquitetura/fronteiras; Ponytail o-que-deletar) — achados críticos → onda de fix + re-verificação.
- [ ] ADR `docs/decisoes/2026-08-2X-correcao-secao4-wader.md` (decisões D1-D7 + adendo excluir-reenviar + o que ficou de fora).
- [ ] Obsidian (`Leo/Decisões/`, direto no disco) + memória local (sessão + atualização do mapa das 8 seções) + `.superpowers/sdd/progress.md`.
- [ ] **Merge na master + deploy Vercel SÓ com confirmação do Sergio, fora do horário da clínica.** A regra da Task 13 idem.
- [ ] Placar final pro Sergio + lembrete das pendências da visita (spec, seção "Pendências da visita").

## Self-review (feito na escrita)
- Cobertura da spec: frentes 1-9 → Tasks 1-9; 10-14 → Tasks 10-14; fechamento → 15. Decisões D1-D7 todas mapeadas; 19b explicitamente EXCLUÍDA (constraint global).
- Tipos cruzados: `CAMPOS_DICOM_LIMPAR`/`estudosEmExclusao` (T1→T7), `deleteSignature`/`forgetStudy` (T2→T7), `soMedidas` (T6), `mapa` opcional (T10→T13), `reprocessarDicom` (T9←T12), `hashCamposWl` (T5), `parserVersao` (T8).
- Riscos de ordem: T7 depende de T1+T2; T12 depende de T10; T13 depois de T12; T11 antes de T12 (rota pronta p/ a galeria futura, mas a galeria atual continua funcionando com URLs gravadas — sem quebra).
