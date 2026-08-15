# Sub-plano 3: Catálogo de Tipos de Laudo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cada tipo de exame escolhe COMO o laudo é alimentado (motor Senna / texto com modelo / PDF anexado), editável em Clínica → Tipos de laudo; carótidas ganha laudo por texto e ECG/MAPA/Holter/Ergométrico entram por PDF — sem tocar no motor.

**Architecture:** Catálogo em `workspaces/{wsId}/tiposLaudo/{tipoId}` (regra: membro lê, dono escreve). Fluxo `texto` = página nova `/laudo-texto/[id]` reusando `EditorLaudo` (já isolado do motor) + `/api/emitir` INALTERADO (já recebe `pdfHtml` string e faz billing na transação). Fluxo `pdf` = branch `pdfBase64` no `/api/emitir` (validação `%PDF` + tamanho; pula Puppeteer; MESMA transação de franquia/ledger — um lugar só cobra). `/api/upload-pdf` (morto e sem auth) morre. `/laudo/[id]` (motor): só o dispatch de quem chega nele — a página em si é INTOCÁVEL.

**Tech Stack:** o existente. Nada novo instalado.

## Global Constraints

- **DECISÃO ASSUMIDA (default proposto, reversível em 1 linha): PDF anexado CONSOME franquia** — passa pela mesma transação do `/api/emitir` (`tipo: 'franquia'|'creditos'`). Sergio pode vetar até a Task 5.
- Branch atual `feat/reestruturacao-plataforma`; sem stash; commit+push por task; conta Gmail PJ p/ verificação.
- **Motor intocável:** `src/app/laudo/[id]/page.tsx` NÃO pode ser editado neste sub-plano (spec §9). O shell de cabeçalho/rodapé do PDF será DUPLICADO na lib nova com comentário `ponytail:` (unificação = Fase 2) — não refatorar o motor pra DRY.
- `signup-server.ts` não aceita import relativo/alias (testado por node --test) — seeds inline ou por parâmetro (padrão TRIAL_FALLBACK).
- Regra nova (`tiposLaudo`) é ADITIVA: publica no fechamento (T7), com confirmação do Sergio, antes do merge.
- Campos clínicos novos (`laudoTextoHtml`) ficam FORA de `camposAdministrativos()` — só médico escreve (fail-closed já garante).

**Mapa spec §4 → tasks:** modelo+regra→T1 · seeds→T2 · UI Clínica→T3 · Agenda/dispatch→T4 · fluxo pdf→T5 · fluxo texto→T6 · fechamento→T7.

---

### Task 1: Modelo `tiposLaudo` + regra + testes (payload real)

**Files:**
- Modify: `firestore.rules` (subcoleção nova dentro de `match /workspaces/{wsId}`)
- Modify: `tests/rules/fixtures.mjs`, `tests/rules/regras.test.mjs`
- Create: `src/lib/tipos-laudo.ts` (tipos TS + defaults compartilhados client-side)

**Interfaces:**
- Produces: type `TipoLaudo = { id: string; nome: string; icone: string; ativo: boolean; ordem: number; modalidade: 'motor'|'texto'|'pdf'; motorId?: string; modeloTexto?: string }`; const `TIPOS_LAUDO_PADRAO: TipoLaudo[]` (8 seeds: eco_tt/eco_te/eco_stress=motor·senna, doppler_carotidas=texto c/ modelo inicial, ecg/mapa/holter/ergometrico=pdf); `payloadTipoLaudo(extra)` nas fixtures. Tasks 2-4 e 6 consomem.

- [ ] **Step 1: `src/lib/tipos-laudo.ts`**

```ts
// Catálogo de tipos de laudo (spec §4): cada tipo define COMO o laudo é
// alimentado. Docs em workspaces/{wsId}/tiposLaudo/{tipoId}; estes defaults
// semeiam contas novas (signup-server duplica inline — sem import lá) e
// servem de fallback quando a coleção ainda não foi semeada.
export type ModalidadeLaudo = 'motor' | 'texto' | 'pdf';

export type TipoLaudo = {
  id: string; nome: string; icone: string;
  ativo: boolean; ordem: number;
  modalidade: ModalidadeLaudo;
  motorId?: string;      // modalidade 'motor' — registry: 'senna' (futuros entram aqui)
  modeloTexto?: string;  // modalidade 'texto' — HTML inicial do TipTap
};

export const MODELO_CAROTIDAS = [
  '<h2>DOPPLER DE CARÓTIDAS E VERTEBRAIS</h2>',
  '<p><strong>Técnica:</strong> exame realizado com transdutor linear, em repouso, com análise bidimensional, Doppler colorido e espectral.</p>',
  '<p><strong>Carótidas comuns:</strong> trajeto, calibre e fluxo preservados bilateralmente.</p>',
  '<p><strong>Bulbos e bifurcações:</strong> sem placas ou espessamento médio-intimal significativo.</p>',
  '<p><strong>Carótidas internas:</strong> fluxo preservado, sem estenoses hemodinamicamente significativas.</p>',
  '<p><strong>Carótidas externas:</strong> sem alterações.</p>',
  '<p><strong>Vertebrais:</strong> fluxo anterógrado bilateral.</p>',
  '<h3>CONCLUSÃO</h3>',
  '<p>Exame dentro dos limites da normalidade.</p>',
].join('');

export const TIPOS_LAUDO_PADRAO: TipoLaudo[] = [
  { id: 'eco_tt', nome: 'Eco Transtorácico', icone: '🫀', ativo: true, ordem: 1, modalidade: 'motor', motorId: 'senna' },
  { id: 'eco_te', nome: 'Eco Transesofágico', icone: '🫀', ativo: true, ordem: 2, modalidade: 'motor', motorId: 'senna' },
  { id: 'eco_stress', nome: 'Eco Stress', icone: '🫀', ativo: true, ordem: 3, modalidade: 'motor', motorId: 'senna' },
  { id: 'doppler_carotidas', nome: 'Doppler de Carótidas', icone: '🩺', ativo: true, ordem: 4, modalidade: 'texto', modeloTexto: MODELO_CAROTIDAS },
  { id: 'ecg', nome: 'ECG', icone: '📈', ativo: true, ordem: 5, modalidade: 'pdf' },
  { id: 'mapa', nome: 'MAPA', icone: '🩸', ativo: true, ordem: 6, modalidade: 'pdf' },
  { id: 'holter', nome: 'Holter', icone: '📟', ativo: true, ordem: 7, modalidade: 'pdf' },
  { id: 'ergometrico', nome: 'Teste Ergométrico', icone: '🏃', ativo: true, ordem: 8, modalidade: 'pdf' },
];
```

- [ ] **Step 2: fixture + testes que falham** — `tests/rules/fixtures.mjs`:

```js
/** Payload identico ao que a tela Clinica→Tipos de laudo grava (Task 3). */
export const payloadTipoLaudo = (extra = {}) => ({
  id: 'ecg', nome: 'ECG', icone: '📈', ativo: true, ordem: 5,
  modalidade: 'pdf', atualizadoEm: new Date(), ...extra,
});
```

`tests/rules/regras.test.mjs`, seção nova:

```js
describe('15. catalogo de tipos de laudo (Secao 2/Sub-plano 3)', () => {
  test('membro do local LE o catalogo', async () => {
    await assertSucceeds(getDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/tiposLaudo`, 'eco_tt')));
  });
  test('dono cria/edita tipo (payload real)', async () => {
    await assertSucceeds(setDoc(doc(como(DR_A), `workspaces/${LOCAL_A1}/tiposLaudo`, 'ecg'), payloadTipoLaudo()));
  });
  test('recepcao NAO escreve no catalogo', async () => {
    await assertFails(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/tiposLaudo`, 'ecg2'), payloadTipoLaudo({ id: 'ecg2' })));
  });
  test('medico nao-dono NAO escreve no catalogo', async () => {
    await assertFails(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/tiposLaudo`, 'ecg3'), payloadTipoLaudo({ id: 'ecg3' })));
  });
  test('fora do local NAO le o catalogo', async () => {
    await assertFails(getDoc(doc(como(DR_B), `workspaces/${LOCAL_A1}/tiposLaudo`, 'eco_tt')));
  });
});
```

Run: `npm run test:rules` → os `assertSucceeds` FALHAM (catch-all nega).

- [ ] **Step 3: regra** — em `firestore.rules`, dentro de `match /workspaces/{wsId}`, após o bloco de exames:

```
      // Catalogo de tipos de laudo (Sub-plano 3): membro le (a Agenda lista
      // os tipos no cadastro), so o DONO configura. Whitelist fail-closed.
      match /tiposLaudo/{tipoId} {
        allow read: if superadmin() || alcancaLocal(wsId);
        allow create, update: if ehDonoDoLocal(wsId)
          && request.resource.data.keys().hasOnly(['id', 'nome', 'icone', 'ativo',
             'ordem', 'modalidade', 'motorId', 'modeloTexto', 'criadoEm', 'atualizadoEm'])
          && request.resource.data.modalidade in ['motor', 'texto', 'pdf'];
        allow delete: if ehDonoDoLocal(wsId);
      }
```

- [ ] **Step 4:** `npm run test:rules` → 118/118 (113+5). Commit: `feat(catalogo): tiposLaudo — modelo, regra e testes payload real` + push.

---

### Task 2: Seeds — signup (PF/PJ), local novo e migração dos existentes

**Files:**
- Modify: `src/lib/signup-server.ts` (seed inline nas DUAS transações, após cada `t.set(wsRef, ...)`)
- Modify: `src/lib/firestore.ts` (`createWorkspace` semeia via batch client — dono cria local, regra permite)
- Create: `scripts/reestruturacao/seed-tipos-laudo.mjs` (migração dos workspaces existentes, padrão `--commit` dos scripts secao1, usando `lib-admin.mjs`)
- Test: `tests/api/signup.test.mjs` (asserção nova: signup cria os 8 tipos)

**Interfaces:**
- Consumes: `TIPOS_LAUDO_PADRAO` (Task 1) — no signup-server os 8 docs são DUPLICADOS inline como const local `TIPOS_PADRAO` (sem import, regra do arquivo), com comentário apontando `src/lib/tipos-laudo.ts` como espelho + o teste compara os dois (tripwire de drift: o teste de api PODE importar ambos).

- [ ] **Step 1: teste que falha** — em `tests/api/signup.test.mjs`, no caso de signup PF existente, adicionar após o assert do workspace:

```js
  const tipos = await db.collection(`workspaces/${wsId}/tiposLaudo`).get();
  assert.equal(tipos.size, 8, 'signup semeia catalogo padrao');
  assert.equal(tipos.docs.find(d => d.id === 'eco_tt').data().modalidade, 'motor');
  assert.equal(tipos.docs.find(d => d.id === 'ecg').data().modalidade, 'pdf');
```

(replicar no caso PJ; ajustar à variável real do wsId de cada teste.)

- [ ] **Step 2: seed no signup-server** — const inline no topo (após TRIAL_FALLBACK):

```js
// Espelho de TIPOS_LAUDO_PADRAO (src/lib/tipos-laudo.ts) — inline porque este
// arquivo nao pode ter import relativo (node --test). Teste de api compara os dois.
const TIPOS_PADRAO = [
  { id: 'eco_tt', nome: 'Eco Transtorácico', icone: '🫀', ativo: true, ordem: 1, modalidade: 'motor', motorId: 'senna' },
  /* ... os 8, idênticos à Task 1 (o modeloTexto de carótidas TAMBÉM inline) ... */
];
```

E após CADA `t.set(wsRef, {...})` (PF `:118-123` e PJ `:218-222`):

```js
    for (const tipo of TIPOS_PADRAO) {
      t.set(wsRef.collection('tiposLaudo').doc(tipo.id),
        { ...tipo, criadoEm: FieldValue.serverTimestamp() });
    }
```

**ATENÇÃO:** escrever os 8 docs completos no const inline (copiar da Task 1 incluindo MODELO_CAROTIDAS) — sem "..." no código real. No teste de api, adicionar tripwire: importar `TIPOS_LAUDO_PADRAO` de `../../src/lib/tipos-laudo.ts` e comparar `JSON.stringify` com os docs semeados (pega drift entre espelhos).

- [ ] **Step 3: `createWorkspace` (local adicional)** — em `src/lib/firestore.ts`, importar `TIPOS_LAUDO_PADRAO` de `./tipos-laudo` (mesmo tooling-check da nav: tipos-laudo.ts não importa nada local → node não o carrega aqui de qualquer forma, é client-only) e trocar o corpo por um `writeBatch` que grava o workspace + os 8 tipos (dono está criando o local; a regra de create do tiposLaudo cobre via ehDonoDoLocal... **CUIDADO**: no momento do batch o vínculo do local novo pode não existir ainda — VERIFICAR como o fluxo de criar local adicional funciona hoje (quem chama createWorkspace? o vínculo é criado antes?). Se a regra negar, mover o seed pro primeiro acesso do dono à tela de Tipos (lazy-seed na Task 3, botão "Restaurar padrão"). O implementador DEVE testar o caminho real e reportar qual dos dois ficou.

- [ ] **Step 4: script de migração** — `scripts/reestruturacao/seed-tipos-laudo.mjs`:

```js
// Semeia tiposLaudo nos workspaces EXISTENTES que ainda nao tem o catalogo.
// Dry-run por padrao; --commit grava. Le TIPOS_LAUDO_PADRAO do fonte TS? Nao:
// node puro — duplicar aqui o array (3o espelho, aceito: script one-shot,
// morre apos a migracao).
import { getDb } from '../secao1/lib-admin.mjs';
const COMMIT = process.argv.includes('--commit');
const TIPOS = [ /* os 8, idênticos à Task 1 */ ];
const db = getDb();
const ws = await db.collection('workspaces').get();
for (const w of ws.docs) {
  const existentes = await w.ref.collection('tiposLaudo').limit(1).get();
  if (!existentes.empty) { console.log(`${w.id}: ja semeado, pulo`); continue; }
  console.log(`${w.id} (${w.data().nomeClinica ?? '?'}): semear 8 tipos${COMMIT ? '' : ' [dry-run]'}`);
  if (COMMIT) {
    const batch = db.batch();
    for (const t of TIPOS) batch.set(w.ref.collection('tiposLaudo').doc(t.id), { ...t, criadoEm: new Date() });
    await batch.commit();
  }
}
console.log(COMMIT ? 'GRAVADO' : 'dry-run — rode com --commit para gravar');
```

(escrever os 8 completos; rodar `node --env-file=.env.local ... ` SEM --commit na verificação; o `--commit` real é do fechamento T7, é ação em produção.)

- [ ] **Step 5:** `npm run test:api` verde (com os asserts novos) + tsc. Commit: `feat(catalogo): seed dos 8 tipos no signup, local novo e script de migracao` + push.

---

### Task 3: UI — Clínica → subseção "Tipos de laudo"

**Files:**
- Create: `src/components/clinica/TiposLaudo.tsx`
- Modify: `src/app/(plataforma)/clinica/page.tsx` (abas internas: Equipe | Tipos de laudo)

**Interfaces:**
- Consumes: `TipoLaudo`, `TIPOS_LAUDO_PADRAO`, `MODELO_CAROTIDAS` (Task 1); `EditorLaudo` + ref (`src/components/laudo/EditorLaudo.tsx` — reusável, sem motor: `setContent(html)`, `getHTML()`; NÃO passar `onAddFrase`); Firestore client (`collection/onSnapshot/setDoc/doc`).
- Produces: `<TiposLaudo />` (dono-only, gate feito pela página).

Comportamento (código completo no arquivo — ~180 linhas):
1. `onSnapshot` de `workspaces/{wsId}/tiposLaudo` ordenado por `ordem`. Se vazio: estado "catálogo não semeado" + botão **"Semear padrão"** (grava TIPOS_LAUDO_PADRAO via batch — é o lazy-seed que também cobre o fallback da Task 2 Step 3).
2. Lista: ícone, nome, pílula da modalidade (`motor`=azul `Motor Senna` · `texto`=âmbar `Texto com modelo` · `pdf`=cinza `PDF anexado`), toggle ativo/inativo.
3. Editar (expande a linha): nome, ícone (input curto), modalidade (select das 3), motorId (select fixo `senna`, visível só se motor), botão "Editar modelo" (visível só se texto) que abre modal com `EditorLaudo` carregado do `modeloTexto` → salvar grava `getHTML()`.
4. Criar tipo novo: botão "+ Tipo de exame" → linha em edição com id gerado de slug do nome (`nome.toLowerCase().replace(/[^a-z0-9]+/g,'_')`), ordem = max+1.
5. Todas as escritas: `setDoc(..., { ...tipo, atualizadoEm: serverTimestamp() })` — payload EXATAMENTE o whitelisted da regra.

Na página Clínica: abas internas simples (`useState<'equipe'|'tipos'>`), aba Tipos só pra `podeGerenciarMembros(papel)` (dono).

- [ ] Steps: implementar → `npx tsc --noEmit` → verificação no preview (semear, editar carótidas, criar tipo, desativar) → commit `feat(clinica): subsecao Tipos de laudo (catalogo editavel)` + push.

---

### Task 4: Agenda lê o catálogo + dispatch do Laudar por modalidade

**Files:**
- Modify: `src/components/Worklist.tsx`

**Interfaces:**
- Consumes: `TipoLaudo`, `TIPOS_LAUDO_PADRAO` (fallback quando coleção vazia). Produces: dispatch usado também pelo Histórico na Fase 2.

1. Estado `tipos: TipoLaudo[]` — `getDocs` de `tiposLaudo` no mount (com `wsId`); vazio → `TIPOS_LAUDO_PADRAO`. O objeto `TIPOS_EXAME` hardcoded MORRE; selects do modal de cadastro e rótulos da tabela derivam de `tipos` (`ativo !== false`), ordenados por `ordem`.
2. `abrirLaudo(exameId, tipoExame)`: resolve `modalidade` do tipo (fallback: 'motor'):
   - `motor` → comportamento atual (`checkEmissao` + `router.push('/laudo/'+id)`).
   - `texto` → `checkEmissao` + `router.push('/laudo-texto/'+id)`.
   - `pdf` → abre `AnexarPdfModal` (Task 5).
3. Botões "Laudar"/"Continuar" passam `item.tipoExame`.

- [ ] Steps: implementar → tsc + `npm run test:unit` → commit `feat(agenda): cadastro e Laudar dirigidos pelo catalogo de tipos` + push.

---

### Task 5: Fluxo PDF anexado — branch `pdfBase64` no `/api/emitir` + modal + morte do upload-pdf

**Files:**
- Modify: `src/app/api/emitir/route.ts` (branch pdfBase64; validação `%PDF` + ≤10MB; pula Puppeteer)
- Create: `src/components/agenda/AnexarPdfModal.tsx`
- Delete: `src/app/api/upload-pdf/route.ts` (morta, sem auth — a revisão da S2 já tinha flagrado o padrão)
- Modify: `src/lib/pdfUtils.ts` (remover `uploadPdfLegacy`/`gerarESalvarPdf` client órfãos; manter `abrirPdfUrl`)
- Test: `tests/api/` — caso novo no teste que cobre emitir (ou arquivo novo `emitir-anexo.test.mjs` se emitir não tiver teste de lib isolável — VERIFICAR e seguir o padrão existente)

Detalhe do branch na rota (após a transação, no lugar do bloco Puppeteer):

```ts
    // PDF: gerado do HTML (motor/texto) OU anexado pronto (modalidade 'pdf').
    // Anexo pula o Puppeteer mas passa pela MESMA transacao acima — franquia,
    // ledger e log num lugar so (decisao: anexo CONSOME franquia, default 15/08).
    if (body.pdfBase64 && body.nomeArq) {
      const buf = Buffer.from(body.pdfBase64, 'base64');
      if (buf.length > 10 * 1024 * 1024) return NextResponse.json({ ok: false, motivo: 'pdf_grande' }, { status: 413 });
      if (buf.subarray(0, 5).toString() !== '%PDF-') return NextResponse.json({ ok: false, motivo: 'nao_e_pdf' }, { status: 400 });
      pdfUrl = await salvarPdfBuffer(buf, wsId, exameId, body.nomeArq);   // extrair de pdf-server.ts:70-85
      await exameRef.update({ pdfUrl });
    } else if (body.pdfHtml && body.nomeArq) { /* caminho atual, inalterado */ }
```

**NOTA de desenho:** a validação do PDF deve rodar ANTES da transação de billing (não debitar franquia de um upload inválido) — o implementador move os dois `if` de validação pro início do handler, deixando só o `salvarPdfBuffer` pós-transação. `salvarPdfBuffer(buf, wsId, exameId, nomeArq)` = extração do trecho de save do `gerarESalvarPdf` (`pdf-server.ts:70-85`) reusada pelos dois caminhos.

`AnexarPdfModal`: input file (accept="application/pdf"), preview do nome/tamanho, identifica o exame (nome do paciente/tipo), envia `POST /api/emitir` com `{ wsId, exameId, medicoUid: user.uid, dadosFinais: {}, pdfBase64, nomeArq }` → sucesso: exame vira emitido com pdfUrl, alerta de franquia consumida. **Gate de UI: só médico (assinaComoAutor) anexa** — a rota já exige médico (403 `nao_medico`), o modal não aparece pra recepção (mesma matriz do Laudar).

- [ ] Steps: teste do branch (base64 de um `%PDF-` mínimo + um buffer inválido) → implementar → `npm run test:api` + tsc → commit `feat(laudo): modalidade PDF anexado via /api/emitir (franquia unica) + morte do upload-pdf` + push.

---

### Task 6: Fluxo texto — `/laudo-texto/[id]` com modelo do tipo

**Files:**
- Create: `src/app/laudo-texto/[id]/page.tsx` (client; ~200 linhas; fora do route group `(plataforma)` — tela cheia como o motor)
- Create: `src/lib/pdf-texto.ts` (`gerarPdfHtmlTexto`)

**Interfaces:**
- Consumes: `EditorLaudo`+`EditorLaudoRef` (`setContent`, `getHTML`); `getExame`/`saveExame` (firestore.ts); `useAuth` (workspace: corPrimaria/nomeClinica/slogan/endereco/telefone/logoB64; profile: nome/especialidade/crm/ufCrm/sigB64); `/api/emitir` com `pdfHtml`; catálogo (`tiposLaudo/{tipoExame}.modeloTexto`).
- Produces: rota `/laudo-texto/[id]` que a Task 4 despacha.

Comportamento:
1. Carrega exame; guard: médico (ehMedico) — recepção volta pra `/agenda`.
2. Conteúdo inicial: `exame.laudoTextoHtml` (rascunho salvo) OU `modeloTexto` do tipo no catálogo OU vazio.
3. Topo coerente com a plataforma: voltar → `/agenda`, nome do paciente, ACC, tipo.
4. Salvar rascunho: `saveExame(wsId, { id, laudoTextoHtml: editor.getHTML(), status: 'andamento', medicoUid: user.uid }, user.uid)` (assume órfão — mesmo contrato do motor; campo clínico → só médico passa na regra).
5. Emitir: monta `gerarPdfHtmlTexto(...)` e `POST /api/emitir` `{ wsId, exameId, medicoUid, dadosFinais: { laudoTextoHtml, cfgSnapshot }, pdfHtml, nomeArq }` — billing/ledger/log idênticos ao motor. Sucesso → alerta + volta pra `/agenda`.
6. `gerarPdfHtmlTexto({ p1, clinica..., assinatura..., tituloExame, htmlCorpo, identificacao })`: cabeçalho do local (logoB64/cores), identificação (nome/nasc/convênio/solicitante/data), corpo = HTML do TipTap, assinatura do médico. **Shell `@page`/thead/tfoot COPIADO VERBATIM de `src/app/laudo/[id]/page.tsx:863-918`** com comentário `ponytail: shell duplicado do motor (motor intocavel nesta fase) — unificar na Fase 2`.

- [ ] Steps: implementar página+lib → tsc → verificação no preview (carótidas: catálogo→cadastro→Laudar→editor com modelo→salvar rascunho→[emitir só se trial renovado]) → commit `feat(laudo): modalidade texto — /laudo-texto com modelo do catalogo` + push.

---

### Task 7: Fechamento

- [ ] C1: bateria completa (unit + rules + api + tsc + build).
- [ ] C2: revisão FINAL da branch (visão de conjunto, modelo capaz).
- [ ] C3: ⚠️ CONFIRMAÇÃO DO SERGIO → publicar regra (`tiposLaudo`, aditiva) + rodar `seed-tipos-laudo.mjs --commit` em produção.
- [ ] C4: merge master + deploy + verificação (catálogo na Clínica, cadastro da Agenda com os 8 tipos, fluxo carótidas-texto no preview) + ledger/roadmap/Obsidian/memória.
