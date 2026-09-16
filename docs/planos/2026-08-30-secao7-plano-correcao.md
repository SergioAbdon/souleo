# Seção 7 — Plano de correção (pós-onda-0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os ~60 achados restantes da Seção 7 (Emissão/PDF/exportação) em 4 ondas
por risco, cada onda com tríade completa PRÉ-merge.

**Architecture:** Os catálogos (`.superpowers/sdd/s7-leitor{1,2,3}-*.md`) mapearam 68 achados;
a onda 0 (mergeada, a54bf04) já fechou E1, P2, P6, P7 e o teto de fontes do P8. Este plano
ataca o resto: onda 1 = bugs que corrompem documento assinado ou dinheiro; onda 2 =
servidor/billing + 2 DESIGNS com parada obrigatória; onda 3 = Storage/escapes/fontes;
onda 4 = fidelidade das saídas. Achados sem task estão na seção TRIAGEM no fim.

**Tech Stack:** Next.js (App Router), Firebase Admin SDK, Puppeteer (@sparticuz/chromium),
node --test (tests/unit, tests/api com fakes/DI, tests/rules no emulador).

## Global Constraints

- **PLACAR-PISO (nenhuma task rebaixa):** unit 683 · api 249 · rules 142 · wader 104 ·
  `tsc`+`build` limpos · contrato-ponte 32 invariantes.
- Branch por onda: `feat/secao7-onda1` … `feat/secao7-onda4`, base master atual. Commit+push
  por task (Dual Claude). NUNCA `git add -A`. NÃO usar `git stash`.
- Tríade completa (Codex-role + Ruflo + Ponytail) PRÉ-merge em TODA onda; merge+deploy só
  com OK do Sergio, fora do horário da clínica.
- Regra Firestore nova SÓ com confirmação do Sergio (Task 11 PARA antes de publicar).
- Mudança de POLÍTICA de billing SÓ com decisão do Sergio (Task 10 PARA no design).
- Política registrada intocável: reemissão COBRA · PDF público por URL · o laudo DESCREVE ·
  motorv8mp4.js intocável · Direx intocável.
- Números de linha citados são do master pós-onda-0 (a54bf04) — confira ao editar.
- Testes: seguir o estilo existente de cada pasta (`tests/unit` puro, `tests/api` com
  fakes/DI — ver `tests/api/emitir-idempotencia.test.mjs`, `tests/api/exame.test.mjs`).

---

# ONDA 1 — bugs com dente (documento assinado + dinheiro)

### Task 1: X1 — corte achados/conclusão com UM dono só

Um `### ` digitado nos COMENTÁRIOS corrompe o PDF ASSINADO (tudo após o `<h3>` cai na caixa
CONCLUSÃO) enquanto Word/texto saem certos — o `EditorLaudo` corta no primeiro `<h3>`
qualquer; `laudo-linhas.ts` já corta certo (só `<h3>CONCLUS…`).

**Files:**
- Modify: `src/lib/laudo-linhas.ts` (exportar o corte)
- Modify: `src/components/laudo/EditorLaudo.tsx:135-166` (usar o corte exportado)
- Test: `tests/unit/laudo-linhas.test.mjs` (arquivo já existe — adicionar casos)

**Interfaces:**
- Produces: `cortarAchadosConclusoes(html: string): { achadosHtml: string; conclusoesHtml: string }`
  exportada de `laudo-linhas.ts`.

- [ ] **Step 1: Teste falhando** — em `tests/unit/laudo-linhas.test.mjs`:

```js
test('cortarAchadosConclusoes: h3 digitado no meio dos achados NAO corta', () => {
  const html = '<p>a</p><h3>Titulo do medico</h3><p>b</p><h3>CONCLUSÃO</h3><ol><li>c</li></ol>';
  const { achadosHtml, conclusoesHtml } = cortarAchadosConclusoes(html);
  assert.ok(achadosHtml.includes('Titulo do medico'));
  assert.ok(achadosHtml.includes('<p>b</p>'));
  assert.ok(!achadosHtml.includes('CONCLUS'));
  assert.ok(conclusoesHtml.includes('<li>c</li>'));
});
test('cortarAchadosConclusoes: sem titulo CONCLUS devolve tudo como achados', () => {
  const r = cortarAchadosConclusoes('<p>a</p><h3>IMPRESSAO</h3><p>b</p>');
  assert.ok(r.achadosHtml.includes('IMPRESSAO'));
  assert.equal(r.conclusoesHtml, '');
});
```

Run: `npm run test:unit` → FAIL (função não existe).

- [ ] **Step 2: Implementar** — em `laudo-linhas.ts`, logo após `corteConclusao`:

```ts
/**
 * X1: corte ÚNICO de achados×conclusões — mesmo critério do merge por linha.
 * O EditorLaudo cortava no primeiro <h3> QUALQUER: um "### " digitado nos
 * comentários jogava o resto do laudo na caixa CONCLUSÃO do PDF assinado,
 * enquanto Word/texto (que já usavam corteConclusao) saíam certos.
 */
export function cortarAchadosConclusoes(html: string): { achadosHtml: string; conclusoesHtml: string } {
  const i = corteConclusao(html);
  if (i < 0) return { achadosHtml: html || '', conclusoesHtml: '' };
  const resto = (html || '').slice(i);
  const fim = /<\/h3\s*>/i.exec(resto);
  return {
    achadosHtml: (html || '').slice(0, i),
    conclusoesHtml: fim ? resto.slice(fim.index + fim[0].length) : '',
  };
}
```

Refatorar `linhasAchados`/`linhasConclusoes` para usarem a nova função (mesmo comportamento,
zero duplicação do slice).

- [ ] **Step 3:** Em `EditorLaudo.tsx`, substituir os corpos de `getAchadosHTML`/`getConclusoesHTML`
(a caminhada de DOM inteira, linhas ~135-166) por:

```ts
getAchadosHTML: () => editor ? cortarAchadosConclusoes(editor.getHTML()).achadosHtml : '',
getConclusoesHTML: () => editor ? cortarAchadosConclusoes(editor.getHTML()).conclusoesHtml : '',
```

com `import { cortarAchadosConclusoes } from '@/lib/laudo-linhas';`.

- [ ] **Step 4:** `npm run test:unit` verde (683+2) · `npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit: `fix(secao7): X1 — corte achados/conclusao com um dono so (h3 digitado nao corrompe mais o PDF assinado)`

### Task 2: X10 + P17 — `corPrimaria` validada + logo/assinatura só `data:`

`p1 = workspace.corPrimaria` entra CRU em atributos `style` de todas as saídas HTML (XSS no
Chrome do servidor, congelado no snapshot, re-executado a cada correção, e na página do
médico via Copiar Formatado). `logoB64`/`sigB64` aceitam `https://` (beacon por emissão).

**Files:**
- Modify: `src/lib/pdf-moldura.ts` (exportar `corSegura`, aplicar em `montarPdfMoldura`; travar logo/sig em `data:`)
- Modify: `src/lib/pdf-params.ts` (aplicar `corSegura` na entrada da cor)
- Modify: `src/app/laudo/[id]/page.tsx:233` e `src/app/laudo-texto/[id]/page.tsx:44` (envolver `corPrimaria`)
- Test: `tests/unit/pdf-moldura.test.mjs` (ou o unit existente da moldura — seguir o padrão da pasta)

**Interfaces:**
- Produces: `corSegura(cor: unknown, fallback?: string): string` exportada de `pdf-moldura.ts`.

- [ ] **Step 1: Testes falhando:**

```js
test('corSegura: aceita hex, rejeita payload', () => {
  assert.equal(corSegura('#8B1A1A'), '#8B1A1A');
  assert.equal(corSegura('#abc'), '#abc');
  assert.equal(corSegura('#fff"><img src=x onerror=alert(1)>'), '#8B1A1A');
  assert.equal(corSegura('red'), '#8B1A1A');       // vocabulário fechado: só hex
  assert.equal(corSegura(undefined), '#8B1A1A');
});
test('moldura: logoB64 https vira vazio (P17)', () => {
  const html = montarPdfMoldura({ /* args mínimos do teste existente */ cfg: { ...cfgBase, logoB64: 'https://evil.tld/a.png' } });
  assert.ok(!html.includes('evil.tld'));
});
```

- [ ] **Step 2: Implementar** em `pdf-moldura.ts`:

```ts
// X10: a cor vem do doc do workspace (o dono escreve pelo navegador e a regra
// não valida formato) e entra em atributo style sem escape. Cor é vocabulário
// fechado: valida em vez de escapar. Fallback = o default das telas do laudo.
export function corSegura(cor: unknown, fallback = '#8B1A1A'): string {
  return typeof cor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(cor) ? cor : fallback;
}
```

Na `montarPdfMoldura` (linha ~70), trocar `const { p1 } = a.cfg;` por
`const p1 = corSegura(a.cfg.p1);`. Onde `logoB64`/`sigB64` viram `<img src>` (linhas ~120,
~140): só aceitar valor que começa com `data:` (senão string vazia — some do laudo, não
busca rede). Em `pdf-params.ts`, aplicar `corSegura` no ponto onde a cor entra
(import de `pdf-moldura` — se criar ciclo de import, mover `corSegura` para `pdf-params.ts`
e a moldura importa de lá; UMA definição só). Em `page.tsx:233` e `laudo-texto:44`:
`const p1 = corSegura((workspace?.corPrimaria as string) || '#8B1A1A');` (import).

- [ ] **Step 3:** `npm run test:unit` verde · `npx tsc --noEmit` limpo.
- [ ] **Step 4:** Commit: `fix(secao7): X10+P17 — corPrimaria validada (hex ou fallback) e logo/assinatura so data: em todas as saidas`

### Task 3: P1 — Puppeteer com JS desligado + allowlist de rede

O HTML renderizado vem do cliente; hoje o Chrome do SERVIDOR executa JS dele e busca
qualquer host (SSRF/exfiltração de signed URL), e o payload congela no snapshot.

**Files:**
- Modify: `src/lib/pdf-server.ts` (dentro de `renderizar`)
- Test: `tests/unit/pdf-server-allowlist.test.mjs` (novo — testa a função pura)

**Interfaces:**
- Produces: `urlPermitidaNoRender(url: string, bucketName: string): boolean` exportada de `pdf-server.ts`.

- [ ] **Step 1: Teste falhando:**

```js
test('allowlist do render: so data:, bucket e fontes', () => {
  const b = 'meu-bucket';
  assert.ok(urlPermitidaNoRender('data:image/png;base64,AAA', b));
  assert.ok(urlPermitidaNoRender('https://storage.googleapis.com/meu-bucket/dicom/x.png', b));
  assert.ok(urlPermitidaNoRender('https://fonts.googleapis.com/css2?family=IBM+Plex', b));
  assert.ok(urlPermitidaNoRender('https://fonts.gstatic.com/s/x.woff2', b));
  assert.ok(!urlPermitidaNoRender('https://storage.googleapis.com/OUTRO-bucket/x', b));
  assert.ok(!urlPermitidaNoRender('https://evil.tld/beacon', b));
  assert.ok(!urlPermitidaNoRender('http://169.254.169.254/latest/meta-data/', b));
  assert.ok(!urlPermitidaNoRender('file:///etc/passwd', b));
});
```

- [ ] **Step 2: Implementar** em `pdf-server.ts`:

```ts
// P1: o pdfHtml vem do cliente — o Chrome do servidor não pode ser o proxy
// dele. Só o que o laudo legitimamente usa: data: (logo/assinatura), o
// próprio bucket (signed URLs das imagens DICOM) e as fontes da moldura.
// Prefixo com barra no bucket: "meu-bucketX" não passa.
export function urlPermitidaNoRender(url: string, bucketName: string): boolean {
  return url.startsWith('data:')
    || url.startsWith(`https://storage.googleapis.com/${bucketName}/`)
    || url.startsWith('https://fonts.googleapis.com/')
    || url.startsWith('https://fonts.gstatic.com/');
}
```

Em `renderizar`, logo após `newPage()`:

```ts
// P1: o laudo não usa JS (o Chrome só pagina e imprime) e não pode fazer o
// servidor buscar host arbitrário — SSRF/beacon, congelado no snapshot e
// re-executado a cada correção administrativa.
await page.setJavaScriptEnabled(false);
await page.setRequestInterception(true);
page.on('request', (r) => {
  if (urlPermitidaNoRender(r.url(), bucket.name)) void r.continue();
  else void r.abort();
});
```

- [ ] **Step 3: Verificar que o pipeline continua de pé** — o `page.evaluateHandle('document.fonts.ready')`
roda via CDP e funciona com JS da página desligado, mas PROVE: rodar o dev server e emitir
um laudo de teste local (conta Gmail, NUNCA Yahoo) ou, no mínimo, um script local que chame
`gerarESalvarPdf` com um HTML de laudo real e confira que o PDF sai com fonte e imagens.
Se `evaluateHandle` falhar com JS off, substituir a espera de fontes por
`page.waitForNetworkIdle({ idleTime: 200, timeout: TETO_FONTES_MS }).catch(() => {})`.
- [ ] **Step 4:** `npm run test:unit` verde · `npx tsc --noEmit` limpo.
- [ ] **Step 5:** Commit: `fix(secao7): P1 — Chrome do servidor com JS desligado e allowlist de rede (data:+bucket+fontes)`

### Task 4: X20 + X21 — despacho por modalidade num lugar só + anexo grava o ID do tipo

Dois estragos: (a) Worklist/Histórico sem `pdfUrl` caem em `/laudo/`+id sem olhar
modalidade (Doppler abre no motor de eco; o guard do motor é por `emitidoEm`, não pega);
(b) `AnexarPdfModal` grava o NOME de exibição por cima de `exame.tipoExame` — corrompe o
dado, `modalidadeDe` cai no default 'motor' e o ECG emitido volta a abrir no motor de eco.

**Files:**
- Modify: `src/lib/tipos-laudo.ts` (helper `rotaDoLaudo`)
- Modify: `src/components/Worklist.tsx:418-448,931`, `src/components/Historico.tsx:103-117,250`,
  `src/app/pacientes/[id]/page.tsx:116-124` (as 3 telas usam o helper; ler ANTES a lógica
  de pacientes/[id] — ela é a referência correta)
- Modify: `src/app/laudo/[id]/page.tsx:295` (guard por `status === 'emitido'`)
- Modify: `src/components/agenda/AnexarPdfModal.tsx` (recebe id + label separados)
- Test: `tests/unit/tipos-laudo.test.mjs` (adicionar casos de `rotaDoLaudo`)

**Interfaces:**
- Produces: `rotaDoLaudo(exameId: string, tipoExame: string | undefined, tiposMap: Record<string, TipoLaudo>): string`
  exportada de `tipos-laudo.ts` — devolve `/laudo/{id}` (motor) ou `/laudo-texto/{id}` (texto/pdf).

- [ ] **Step 1: Teste falhando:**

```js
test('rotaDoLaudo: modalidade decide a tela', () => {
  const tipos = { eco: { nome: 'Ecocardiograma', modalidade: 'motor' }, dop: { nome: 'Doppler', modalidade: 'texto' } };
  assert.equal(rotaDoLaudo('e1', 'eco', tipos), '/laudo/e1');
  assert.equal(rotaDoLaudo('e2', 'dop', tipos), '/laudo-texto/e2');
  assert.equal(rotaDoLaudo('e3', undefined, tipos), '/laudo/e3'); // default motor (compat)
});
```

(Conferir o shape real de `TipoLaudo`/`modalidadeDe` em `tipos-laudo.ts:26-31` e ajustar o
fixture — o teste usa o MESMO default de `modalidadeDe`.)

- [ ] **Step 2: Implementar** `rotaDoLaudo` em `tipos-laudo.ts` reusando `modalidadeDe`:

```ts
// X20: 3 telas decidiam a rota do laudo por conta própria e 2 delas caíam no
// motor de eco para qualquer modalidade (a ficha do paciente já fazia certo —
// esta função é aquela lógica, promovida a dono único).
export function rotaDoLaudo(exameId: string, tipoExame: string | undefined, tiposMap: Record<string, TipoLaudo>): string {
  const m = modalidadeDe(tiposMap[tipoExame ?? ''], tipoExame ?? '');
  return (m === 'texto' || m === 'pdf') ? `/laudo-texto/${exameId}` : `/laudo/${exameId}`;
}
```

(Se a modalidade 'pdf' não tiver tela de edição — conferir o que a ficha do paciente faz
em `pacientes/[id]/page.tsx:116-124` — espelhar exatamente aquele destino.)

- [ ] **Step 3:** Trocar os `router.push('/laudo/' + …)` de fallback/edição em
`Worklist.tsx:427,431,448`, `Historico.tsx:111,115,250` e a lógica local da ficha por
`router.push(rotaDoLaudo(...))`. No motor (`laudo/[id]/page.tsx:295`), trocar o guard de
redirecionamento de `jaEmitidoDoc` (`!!emitidoEm`) para `status === 'emitido'` — o
transferido (status andamento, emitidoEm mantido) e o texto emitido passam a ser protegidos.
- [ ] **Step 4 (X21):** Em `Worklist.tsx:931`, passar o ID: `tipoExame: tipoId` (não
`tiposMap[...]?.nome`), e o nome de exibição num campo novo `tipoNome`. No
`AnexarPdfModal.tsx`: tipo `ExameRef` ganha `tipoNome?: string`; linha ~122 exibe
`exame.tipoNome ?? exame.tipoExame`; linha ~82 continua mandando `tipoExame` (agora o id)
em `dadosFinais`.
- [ ] **Step 5:** `npm run test:unit` verde · `npx tsc --noEmit` + `npm run build` limpos.
- [ ] **Step 6:** Commit: `fix(secao7): X20+X21 — rotaDoLaudo unico nas 3 telas, guard do motor por status, anexo grava o ID do tipo`

### Task 5: E8 + E6 — emitir recusa cancelado; cancelar/transferir com CAS

(a) Emitir um exame `cancelado` revive o documento cobrando de novo. (b) `cancelarExame`
lê o exame FORA de transação: uma emissão que commita no meio queima franquia num laudo
cancelado e tem o PDF novo apagado. Os dois interligam: o CAS do cancelamento só fecha de
vez se emitir também recusar cancelado.

**Files:**
- Modify: `src/lib/emitir-admin.ts` (guard `cancelado`)
- Modify: `src/lib/exame-admin.ts` (`cancelarExame` e `transferirExame` com CAS no update final)
- Modify: `src/app/api/emitir/route.ts:119` (mapear `cancelado` → 409) e `src/app/api/exame/route.ts` (mapear `conflito_emissao` → 409)
- Test: `tests/api/emitir-idempotencia.test.mjs` (caso cancelado) + `tests/api/exame.test.mjs` (caso CAS)

- [ ] **Step 1: Testes falhando** (seguir o estilo de fake/DI dos arquivos):

```js
test('emitir exame cancelado e recusado sem cobrar', async () => {
  // fake db com exame { status: 'cancelado' } e assinatura com saldo
  const r = await emitirComCobranca(db, { wsId, exameId, uid, medicoUid: uid, dadosFinais: {} });
  assert.deepEqual(r, { ok: false, motivo: 'cancelado' });
  // e NENHUM update na sub nem doc novo em consumo
});
test('cancelar aborta se uma emissao commitou no meio (CAS)', async () => {
  // fake db cujo runTransaction do update final ve emitidoEm DIFERENTE do lido
  const r = await cancelarExame(db, params);
  assert.deepEqual(r, { ok: false, motivo: 'conflito_emissao' });
  // e o doc NAO virou cancelado, e o pdfUrl NAO foi apagado
});
```

- [ ] **Step 2 (E8):** Em `emitirComCobranca`, logo após o guard de autor (linha ~106):

```ts
// E8: laudo cancelado não revive por emissão — o cancelamento já devolveu o
// consumo; emitir por cima criaria um doc emitido+cancelado ao mesmo tempo.
// Voltar do cancelado é ato deliberado (recriar/transferir), não um POST.
if (exame.status === 'cancelado') return { ok: false, motivo: 'cancelado' };
```

Adicionar `'cancelado'` a `MotivoEmissao`. Na rota `/api/emitir:119`:
`{ nao_encontrado: 404, exame_de_outro_medico: 403, cancelado: 409 }`. Conferir os 3
clientes (`page.tsx:~1487`, `laudo-texto`, `AnexarPdfModal`): se algum trata `!res.ok`
como "erro de conexão", ensinar a mensagem do motivo `cancelado` (1 linha por cliente).

- [ ] **Step 3 (E6):** Em `exame-admin.ts`, helper + CAS:

```ts
// E6: o get lá em cima é fora de transação — entre ele e a escrita final uma
// emissão pode commitar (cobrança nova + pdfUrl novo). O update final vira
// CAS: só aplica se status e emitidoEm ainda são os que decidimos cancelar.
// Perdendo a corrida: devolvemos o consumo antigo (líquido, idempotente), a
// emissão nova fica de pé com o PDF dela intacto — estado consistente.
function mesmaEmissao(a: unknown, b: unknown): boolean {
  if (!a && !b) return true;
  return !!a && !!b && typeof (a as Timestamp).isEqual === 'function'
    && (a as Timestamp).isEqual(b as Timestamp);
}
```

Em `cancelarExame`: manter a ordem `devolverConsumo` → CAS → `limparPdf` (o PDF só é
apagado DEPOIS do CAS confirmar — hoje ele é apagado antes, e é isso que mata o PDF novo).
Substituir o `exameSnap.ref.update({...})` final por:

```ts
const conflito = await db.runTransaction(async (t) => {
  const agora = await t.get(exameSnap.ref);
  if (!agora.exists) return true;
  const d = agora.data()!;
  if (d.status !== exame.status || !mesmaEmissao(d.emitidoEm, exame.emitidoEm)) return true;
  t.update(exameSnap.ref, {
    status: 'cancelado',
    canceladoEm: FieldValue.serverTimestamp(),
    canceladoPor: p.uid,
    motivoCancelamento: p.motivo ?? '',
    ...(emitido ? { pdfUrl: FieldValue.delete() } : {}),
  });
  return false;
});
if (conflito) return { ok: false, motivo: 'conflito_emissao' };
if (emitido) await limparPdf(exame, p);
```

Mesmo padrão no update final de `transferirExame` (mesma corrida, mesma classe). A rota
`/api/exame` mapeia `conflito_emissao` → 409 (seguir o mapa de motivos existente).

- [ ] **Step 4:** `npm run test:api` verde (249+2) · `npm run test:unit` · `npx tsc --noEmit`.
- [ ] **Step 5:** Commit: `fix(secao7): E8+E6 — emitir recusa cancelado; cancelar/transferir com CAS (corrida cancelar x emitir fechada)`

### Task 6: P4 + E4 — falha de PDF deixa marca + snapshot + caminho de recuperação sem 2ª franquia

Hoje: PDF falha pós-transação → franquia cobrada, exame emitido sem `pdfUrl`, SEM snapshot
(correção administrativa morta pra sempre) e SEM marca no doc. Único caminho = reemitir
(2ª franquia). A onda 0 já deixou `pdfPendente: true` na gaveta privada (replay-regenera);
falta: persistir a falha, salvar o snapshot mesmo na falha, e um botão de recuperação.

**Files:**
- Modify: `src/lib/pdf-server.ts` (exportar `salvarSnapshotHtml`; corrigir texto do fail-loud)
- Modify: `src/app/api/emitir/route.ts:164-172` (catch: snapshot + `pdfErro` no doc; sucesso limpa `pdfErro`)
- Modify: `src/components/Worklist.tsx` (botão "Regerar PDF" quando `pdfErro && !pdfUrl && status === 'emitido'`)
- Test: `tests/api/` (novo caso: falha de PDF grava snapshot + pdfErro)

- [ ] **Step 1:** Exportar `salvarSnapshotHtml` de `pdf-server.ts` (já é nunca-lança). Trocar
a mensagem do fail-loud (`:119`) de `'imagem não assinada — emissão abortada'` para
`'imagem não assinada — PDF abortado'` (a emissão já foi cobrada nesse ponto; o texto mentia).
- [ ] **Step 2:** No catch do braço `pdfHtml` da rota `/api/emitir` (linhas ~168-171):

```ts
} catch (e) {
  pdfErro = 'erro_pdf';                        // P10: detalhe só no log do servidor
  console.error('PDF gen error:', e);
  // P4/E4: a emissão JÁ cobrou. Congela o snapshot (sem ele a correção
  // administrativa deste exame morre pra sempre) e deixa marca no doc — a
  // tela passa a ver o laudo emitido-sem-PDF em vez de ninguém saber.
  await salvarSnapshotHtml(pdfHtml, wsId, exameId, sanitizarNomeArq(nomeArq, exameId)).catch(() => {});
  await dbAdmin.doc(`workspaces/${wsId}/exames/${exameId}`).update({ pdfErro: 'erro_pdf' }).catch(() => {});
}
```

(import `sanitizarNomeArq` de `pdf-path`). No caminho de sucesso dos DOIS braços (anexo e
Puppeteer), o update vira `{ pdfUrl, pdfErro: FieldValue.delete() }`. No catch do braço
`pdfAnexadoBuf`, aplicar a mesma máscara `pdfErro = 'erro_pdf'` + marca no doc (sem snapshot
— anexo não tem HTML).
- [ ] **Step 3 (recuperação):** No `Worklist.tsx`, no grupo do exame emitido: quando
`dados.pdfErro && !dados.pdfUrl`, mostrar botão "Regerar PDF" que chama `/api/corrigir-laudo`
com o convênio/solicitante ATUAIS do exame (correção sem mudança regenera o PDF a partir do
snapshot — rota existente, zero franquia; ler o contrato do corpo em
`src/app/api/corrigir-laudo/route.ts` antes). Resposta `pdfDesatualizado`/erro → toast
honesto ("Snapshot indisponível — reemita o laudo"). Reusar o handler/toast padrão da tela.
- [ ] **Step 4:** Teste api: fake em que `gerarESalvarPdf` lança → resposta tem
`pdfErro: 'erro_pdf'`, doc atualizado com `pdfErro` e snapshot salvo (spy no fake). Rodar
`npm run test:api` verde.
- [ ] **Step 5:** Commit: `fix(secao7): P4+E4 — falha de PDF persiste pdfErro + snapshot, e Regerar PDF recupera sem 2a franquia`

**FIM DA ONDA 1 →** bateria completa (unit+api+rules+wader+tsc+build) · TRÍADE COMPLETA
(Codex-role adversarial + Ruflo arquitetura + Ponytail deletar) · fix wave se preciso ·
merge+deploy SÓ com OK do Sergio, fora do horário da clínica.

---

# ONDA 2 — dinheiro/servidor + 2 designs com PARADA

### Task 7: E3 (+ metade ledger de E18/X22) — carimbos de auditoria derivados no servidor

`reemissao` e `identificacaoAlterada` vêm do navegador (cliente adulterado reemite trocando
CPF e loga `false`; o anexo reemitido entra como emissão nova no ledger). O servidor tem
antes×depois na MESMA transação — derivar lá resolve os três achados de uma vez.

**Files:**
- Modify: `src/lib/emitir-admin.ts` (derivar na transação; devolver no resultado)
- Modify: `src/app/api/emitir/route.ts:136-148` (log usa o derivado)
- Test: `tests/api/emitir-idempotencia.test.mjs` (casos novos)

**Interfaces:**
- Produces: braço ok de `ResultadoEmissao` ganha `reemissao: boolean` e
  `identificacaoAlterada: boolean` (replay devolve `false` nos dois).

- [ ] **Step 1: Testes falhando:**

```js
test('reemissao derivada do emitidoEm do servidor, nao do cliente', async () => {
  // exame com emitidoEm preenchido; dadosFinais SEM reemissao
  const r = await emitirComCobranca(db, { ...params, dadosFinais: { pacienteNome: 'A' } });
  assert.equal(r.reemissao, true);
  // e o doc de consumo gravado tem reemissao: true
});
test('identificacaoAlterada derivada comparando antes x depois', async () => {
  // exame com pacienteNome 'A'; dadosFinais com pacienteNome 'B' e identificacaoAlterada: false (mentira do cliente)
  // -> consumo/log com identificacaoAlterada: true
});
```

- [ ] **Step 2: Implementar** — antes de ler `identificacaoMudou()` em
`src/app/laudo/[id]/page.tsx:~1412` e copiar a MESMA lista de campos de identidade (a lista
é a fonte; espelhar num const com comentário apontando pra origem). Na transação:

```ts
// E3: os dois carimbos anti-fraude eram copiados do navegador. Derivados
// aqui do antes (exameSnap) × depois (dadosFinais) — cliente adulterado não
// esconde mais uma reemissão nem uma troca de identidade do paciente.
// Lista de campos espelha identificacaoMudou() (laudo/[id]/page.tsx).
const CAMPOS_IDENTIDADE = [/* copiar da função do cliente */] as const;
const reemissao = !!exame.emitidoEm;
const identificacaoAlterada = reemissao && CAMPOS_IDENTIDADE.some(
  (c) => c in p.dadosFinais && String(p.dadosFinais[c] ?? '') !== String(exame[c] ?? ''),
);
```

Usar `reemissao` derivado no doc de `consumo` (linha ~184, no lugar de
`!!(p.dadosFinais.reemissao)`) e devolver ambos no resultado. Na rota, o log (linhas
~142-143) passa a usar `resultado.reemissao` / `resultado.identificacaoAlterada`. Os
clientes podem continuar mandando os flags — o servidor simplesmente ignora.
- [ ] **Step 3:** `npm run test:api` verde · `npx tsc --noEmit`.
- [ ] **Step 4:** Commit: `fix(secao7): E3 — reemissao e identificacaoAlterada derivados na transacao (anexo reemitido entra certo no ledger)`

### Task 8: E15 + P10 + E16 — máscara de erro + HTTP honesto nas recusas de billing

**Files:**
- Modify: `src/app/api/emitir/route.ts:119-120` (statuses) e `:191-195` (catch-all)
- Modify: os 3 clientes SE tratarem `!res.ok` como erro de rede (conferir antes)
- Test: `tests/api/emitir-idempotencia.test.mjs` (asserts de status/corpo)

- [ ] **Step 1:** No catch-all da rota (linha ~193): trocar
`error: msg` por `error: 'erro_interno'` (detalhe fica no `console.error` — espelho exato
da `corrigir-laudo:166`).
- [ ] **Step 2 (E16):** Mapa de status completo:
`{ nao_encontrado: 404, exame_de_outro_medico: 403, cancelado: 409, sem_plano: 402, sem_saldo: 402, expirado: 402 }`.
ANTES: grep nos 3 clientes por como tratam a resposta — se algum usa `res.ok` para
distinguir "conexão" de "recusa", ajustar para ler `body.motivo` (o corpo não muda).
- [ ] **Step 3:** Testes: recusa `sem_saldo` responde 402 com `{ok:false, motivo:'sem_saldo'}`;
erro interno responde `error: 'erro_interno'` (sem path de bucket). `npm run test:api` verde.
- [ ] **Step 4:** Commit: `fix(secao7): E15+P10+E16 — erro interno mascarado e recusa de billing com HTTP honesto`

### Task 9: X22 + E18 (metade UI) — reanexo se declara reemissão na tela

O ledger já sai certo pela Task 7. Falta a tela: anexar de novo num exame emitido mostra
"Emitir laudo · 1 franquia consumida" sem avisar que é a 2ª.

**Files:**
- Modify: `src/components/Worklist.tsx:~441` (passa `jaEmitido` ao modal)
- Modify: `src/components/agenda/AnexarPdfModal.tsx` (aviso + rótulo + confirm)

- [ ] **Step 1:** `AnexarPdfModal` ganha prop `jaEmitido?: boolean`. Quando true: botão
"Reanexar (consome 1 franquia)", texto de aviso "Este exame JÁ FOI EMITIDO — reanexar
consome UMA NOVA franquia." e `confirm()` antes do POST (mesmo padrão do
`laudo-texto:135-137`). Worklist passa `jaEmitido={item.status === 'emitido'}` no ponto
que abre o modal para emitido.
- [ ] **Step 2:** `npx tsc --noEmit` + `npm run build` limpos (componente puro de UI; sem
teste novo — a lógica cobrada é a da Task 7).
- [ ] **Step 3:** Commit: `fix(secao7): X22+E18 — reanexo em exame emitido avisa e se declara reemissao na tela`

### Task 10: E11 — DESIGN da renovação de ciclo ⚠️ PARAR: política de billing

`franquiaUsada` NUNCA zera e `cicloFim` só anda na mão (Direx/Marina): no dia 31 toda conta
cai em `expirado`/`sem_saldo`. Renovar automaticamente SEM integração de pagamento =
franquia infinita de graça — é DECISÃO DE POLÍTICA, não bug de código isolado.

**Files:**
- Create: `docs/decisoes/2026-08-30-secao7-renovacao-ciclo-DRAFT.md` (design, SEM código de produção)

- [ ] **Step 1:** Ler `src/lib/signup-server.ts:170-180`, `src/lib/billing.ts:140-155`,
`src/app/api/marina/route.ts:470-515`, `src/app/api/cron/` (padrão dos 2 crons existentes)
e `vercel.json` (crons). Escrever o draft com as 3 opções e recomendação:
  - **A (recomendada):** cron diário `renovar-ciclos`: assinatura com `status: 'ativa'` e
    `cicloFim` vencido → `franquiaUsada: 0`, `cicloFim: +30d`, log em `logs`. Direx continua
    sendo quem SUSPENDE (inadimplência = mudar status, que o cron respeita). Cobrança segue
    manual/externa como hoje — o cron só automatiza o giro do ciclo que hoje é manual.
  - **B:** renovar só N ciclos à frente de um campo `pagoAte` (Direx grava ao confirmar
    pagamento) — mais fiel ao caixa, mais operação manual.
  - **C:** manter manual e só alertar (e-mail/painel) X dias antes do vencimento.
  Incluir: efeito em créditos (`creditosExtras` NÃO zeram — são comprados), interação com
  E13 (créditos furam expiração — decisão irmã), e o teste que cada opção ganharia.
- [ ] **Step 2:** Commit do draft: `docs(secao7): E11 — draft renovacao de ciclo (3 opcoes, aguardando decisao Sergio)`
- [ ] **Step 3: ⚠️ PARAR.** Apresentar ao Sergio. NÃO implementar nenhuma opção sem a
decisão dele registrada (vira ADR + task de implementação em onda futura).

### Task 11: E10 + E14 + E22 + E19 — DESIGN regra `status` + whitelist `dadosFinais` ⚠️ PARAR: regra Firestore

(a) A regra deixa o autor carimbar `status:'emitido'` pelo navegador (laudo com cara de
assinado, franquia zero) e reabrir o emitido para `andamento` (limbo de billing — E22);
(b) `dadosFinais` entra no doc sem whitelist (`pdfUrl` forjado etc. — E14/X16); (c) par
morto `emitExame`/`consumirEmissao`/`registrarConsumo` no repo é o gadget pronto (E19).

**Files:**
- Create: `docs/decisoes/2026-08-30-secao7-regra-status-DRAFT.md`
- Modify (SÓ após OK): `firestore.rules`, `src/app/api/emitir/route.ts` ou `emitir-admin.ts`
  (whitelist), `src/lib/firestore.ts` (apagar `emitExame`), `src/lib/billing.ts` (apagar
  `consumirEmissao`/`registrarConsumo`)
- Test (SÓ após OK): `tests/rules/regras.test.mjs` + `tests/api/emitir-idempotencia.test.mjs`

- [ ] **Step 1: Design no draft** — proposta concreta:
  - **Regra:** no `update` do médico-autor (`firestore.rules:204-215`), `status` vira campo
    de dono único do servidor: cliente só escreve update com `intacto('status')` OU transição
    permitida explícita (levantar quais transições legítimas o cliente faz hoje:
    aguardando→rascunho→andamento; grep nas telas por `updateExame`/writes de `status` ANTES
    de fechar a lista). Emitir/des-emitir/cancelar só Admin SDK. Isso fecha E10 E E22 na
    mesma linha. Atenção ao teste `regras.test.mjs:356` ("medico cria exame ja emitido —
    caminho legitimo"): o `create` emitido vira proibido também? Levantar quem cria emitido
    hoje (suspeita: ninguém legítimo) e propor fechar.
  - **Whitelist (E14, servidor):** em `emitirComCobranca`, filtrar `p.dadosFinais` por
    lista explícita ANTES do spread — campos clínicos + identificação + convênio/solicitante
    + `laudoHtml`/`cfgSnapshot`/`incluirImagensNoPdf` (levantar por grep o que os 3 clientes
    REALMENTE mandam em `dadosFinais` — a lista do draft nasce desse grep, não de chute).
    `pdfUrl`, `pdfHtmlPath`, `status`, `emitidoEm`, `acc`, `feegowAppointId`, `canceladoEm`,
    `medicoUid` NUNCA passam.
  - **Mortos (E19/E10):** apagar `emitExame` (firestore.ts:341-352), `consumirEmissao` e
    `registrarConsumo` (billing.ts) — zero chamadores, grep prova.
  - Payload REAL nos testes de regra (`tests/rules/fixtures.mjs`), regra + código no MESMO
    commit (regra de ouro).
- [ ] **Step 2:** Commit do draft: `docs(secao7): E10+E14+E22 — draft regra status + whitelist dadosFinais (aguardando OK Sergio)`
- [ ] **Step 3: ⚠️ PARAR.** Confirmar desenho com o Sergio. SÓ ENTÃO implementar
(steps 4-6), com teste de regra usando payload real, bateria completa, e publicar a regra
junto do deploy da onda (nunca antes do código).
- [ ] **Step 4 (pós-OK):** Implementar whitelist + apagar mortos + regra, TDD.
- [ ] **Step 5 (pós-OK):** `npm run test:rules` + `test:api` + `test:unit` verdes.
- [ ] **Step 6 (pós-OK):** Commit único regra+código: `fix(secao7): E10+E14+E22 — status so pelo servidor, whitelist de dadosFinais, mortos E19 apagados`

**FIM DA ONDA 2 →** bateria completa · TRÍADE COMPLETA · merge+deploy com OK do Sergio.
(Se as decisões das Tasks 10/11 demorarem, a onda mergeia com as Tasks 7-9 e os drafts;
a implementação decidida vira onda 2b.)

---

# ONDA 3 — Storage, escapes e fontes

### Task 12: P9 + P18 — snapshot sem Puppeteer + limite honesto do anexo

**Files:**
- Modify: `src/lib/pdf-path.ts` (recebe `pathSnapshotHtml` + `lerSnapshotHtml`)
- Modify: `src/lib/pdf-server.ts` (importa de lá), `src/lib/shadow/deps-admin.ts:14` (import novo)
- Modify: `src/lib/pdf-validacao.ts:10` (10MB → 3MB)
- Test: teste existente de `pdf-validacao` (ajustar limite) — `npm run test:unit`/`test:api`

- [ ] **Step 1:** Mover `pathSnapshotHtml` e `lerSnapshotHtml` de `pdf-server.ts` para
`pdf-path.ts` (sem mudança de corpo; `pdf-server` re-importa; a sombra importa de
`pdf-path` e para de arrastar `puppeteer-core`). Conferir com `grep -rn "lerSnapshotHtml" src/`
que todos os chamadores apontam pro novo lar.
- [ ] **Step 2:** `pdf-validacao.ts`: `LIMITE_BYTES = 3 * 1024 * 1024` com comentário
(a faixa 3-4,5MB morria no 413 opaco da Vercel; 3MB é o limite que o modal já anuncia).
Ajustar o teste do limite pro novo valor.
- [ ] **Step 3:** Bateria relevante verde. Commit:
`refactor(secao7): P9+P18 — snapshot le sem carregar Chromium; limite do anexo honesto em 3MB`

### Task 13: P3 + P19 — PDF corrigido sem cache de 1h, num round-trip só

**Files:**
- Modify: `src/lib/pdf-server.ts:33-39` (`salvarPdfBuffer`)

- [ ] **Step 1:** Trocar `file.save` + `makePublic` por:

```ts
await file.save(buf, {
  resumable: false,               // P19: buffer pequeno, um request só
  predefinedAcl: 'publicRead',    // P19: mata o segundo round-trip do makePublic
  metadata: {
    contentType: 'application/pdf',
    contentDisposition: `inline; filename="${nomeArquivo}.pdf"`,
    // P3: a correção administrativa regrava o MESMO objeto público — com o
    // default do GCS (max-age=3600) o link já entregue servia o PDF ERRADO
    // por até 1h depois da correção, sem sinal nenhum.
    cacheControl: 'no-cache',
  },
});
```

e remover o `await file.makePublic()`.
- [ ] **Step 2:** Verificação: o bucket usa ACL legada (o `makePublic` atual funciona, logo
`predefinedAcl` funciona). No deploy da onda, smoke: emitir 1 laudo de teste (conta Gmail)
e conferir `curl -sI <pdfUrl> | grep -i cache-control` → `no-cache`.
- [ ] **Step 3:** Commit: `fix(secao7): P3+P19 — PDF salvo com no-cache (correcao vale na hora) e sem 2o round-trip`

### Task 14: P5 — apagar exame apaga o snapshot clínico (LGPD)

**Files:**
- Modify: `src/lib/exame-admin.ts` (`Params` ganha `apagarSnapshot?`; `apagarExame` chama)
- Modify: `src/app/api/exame/route.ts` (injeta o callback)
- Test: `tests/api/exame.test.mjs` (spy: apagar chama o callback)

- [ ] **Step 1: Teste falhando:** apagarExame com `apagarSnapshot` injetado → foi chamado
com `(wsId, exameId)`; falha do callback NÃO bloqueia a exclusão (mesmo padrão do
`apagarImagens`).
- [ ] **Step 2:** Em `Params`: `apagarSnapshot?: (wsId: string, exameId: string) => Promise<void>;`.
Em `apagarExame`, junto do bloco `apagarImagens`:

```ts
// P5: o snapshot em laudos-html/ carrega o laudo clínico completo com
// identificação — "apagar o exame" (LGPD) tem que levar ele junto, senão o
// conteúdo sobrevive órfão no bucket. Nunca bloqueia a exclusão.
if (p.apagarSnapshot) {
  try { await p.apagarSnapshot(p.wsId, p.exameId); }
  catch (e) { console.error('apagarSnapshot:', e); }
}
```

Na rota `/api/exame`, injetar usando `pathSnapshotHtml` (agora em `pdf-path.ts`, Task 12):

```ts
apagarSnapshot: (w, e) =>
  getStorage().bucket().file(pathSnapshotHtml(w, e)).delete({ ignoreNotFound: true }).then(() => {}),
```

- [ ] **Step 3:** `npm run test:api` verde. Commit:
`fix(secao7): P5 — apagar exame apaga o snapshot laudos-html junto (LGPD)`

### Task 15: X11 + X12 + X13 — escapes same-origin + UMA função de escape

**Files:**
- Modify: `src/components/laudo/DicomGallery.tsx:246-251` (`<title>` escapado)
- Modify: `src/components/Extrato.tsx:174-212` (3 interpolações escapadas)
- Modify: `src/lib/pdf-params.ts:44` (`escHtml` morre; importa `escaparHtml` de `pdf-moldura`)

- [ ] **Step 1 (X11):** `<title>${escaparHtml(titulo)}</title>` — `escaparHtml` já está
importada no arquivo.
- [ ] **Step 2 (X12):** `Extrato.tsx` importa `escaparHtml` de `@/lib/pdf-moldura` e escapa
nome do paciente, convênio e local nas 3 interpolações do `document.write` (mesmo vetor do
X11: about:blank herda a origem do app).
- [ ] **Step 3 (X13):** Apagar `escHtml` de `pdf-params.ts` e usar `escaparHtml` (4
entidades) importada de `pdf-moldura` — se der ciclo de import, mover `escaparHtml` (e
`corSegura` da Task 2) para um `src/lib/html-escape.ts` mínimo e os dois importarem de lá.
Conferir que os pinos de formato em `tests/unit/pdf-params.test.mjs` continuam verdes
(`"` agora vira `&quot;` em célula — se algum pino quebrar, atualizar o esperado com a
justificativa no commit).
- [ ] **Step 4:** Bateria verde. Commit:
`fix(secao7): X11+X12+X13 — escapes same-origin (galeria+extrato) e uma funcao de escape so`

### Task 16: P8 follow-up — IBM Plex self-hosted no render (adeus fonts.googleapis)

**Files:**
- Create: `src/lib/pdf-fontes.ts` (woff2 base64 + `@font-face`)
- Modify: `src/lib/pdf-moldura.ts:103` (usa o CSS embutido no lugar do `<link>`)
- Modify: `src/lib/pdf-server.ts` (allowlist da Task 3 perde os hosts de fonte)
- Test: `tests/unit/pdf-server-allowlist.test.mjs` (fonts.* passa a ser negado)

- [ ] **Step 1:** Ler a URL do `<link>` em `pdf-moldura.ts:103` para saber EXATAMENTE
famílias/pesos usados. Baixar os woff2 correspondentes (uma vez, do próprio Google Fonts),
converter pra base64 e gerar `pdf-fontes.ts`:

```ts
// P8: cada render fazia round-trip a fonts.googleapis.com — CDN lenta ou
// bloqueada segurava o PDF (e caía no P4, cobrado sem PDF). Fonte embutida:
// zero rede, zero fallback silencioso, e a allowlist do P1 fecha de vez.
export const CSS_FONTES = `
@font-face { font-family: 'IBM Plex Sans'; font-weight: 400; src: url(data:font/woff2;base64,…) format('woff2'); }
/* …um @font-face por peso realmente usado na moldura… */
`;
```

- [ ] **Step 2:** Na moldura, trocar o `<link href="https://fonts.googleapis.com/…">` por
`<style>${CSS_FONTES}</style>`. Remover `fonts.googleapis.com`/`fonts.gstatic.com` de
`urlPermitidaNoRender` e inverter os 2 asserts do teste. O `TETO_FONTES_MS` fica
(`document.fonts.ready` agora resolve local e rápido — o teto vira cinto barato).
- [ ] **Step 3:** Prova visual local: gerar 1 PDF pelo dev server e conferir a fonte (não
serifa de fallback). `npm run test:unit` verde · `npm run build` limpo (atenção ao tamanho
do bundle da rota — base64 de 3-4 pesos ≈ 300-500KB, ok pra lambda).
- [ ] **Step 4:** Commit: `fix(secao7): P8 — IBM Plex embutida no render, fontes fora da rede e da allowlist`

**FIM DA ONDA 3 →** bateria completa · TRÍADE COMPLETA · merge+deploy com OK do Sergio.

---

# ONDA 4 — fidelidade das saídas e telas

### Task 17: X4 + X2 + X3 — "🖨️ PDF" do emitido abre o DOCUMENTO ASSINADO

Hoje o botão do `ModoEmitido` gera um documento NOVO (config atual do local, imagens que o
assinado talvez não tenha) — Worklist/Histórico abrem o `pdfUrl`. Unificar: o assinado é o
que abre; regerar vira ação explícita.

**Files:**
- Modify: `src/components/laudo/PopupEmitir.tsx:~110` + `src/app/laudo/[id]/page.tsx:1742`
- Modify: `src/app/laudo/[id]/page.tsx:121,1424` e `src/app/laudo-texto/[id]/page.tsx:184` (mortos X2/X3)

- [ ] **Step 1 (X4):** No `ModoEmitido`, botão primário "🖨️ PDF": se o exame tem `pdfUrl`,
`abrirPdfUrl(pdfUrl)` (import de `@/lib/pdfUtils` — mesmo helper das outras telas). Ação
secundária "Gerar novamente (dados atuais do local)" mantém o `handleImprimir` atual, com
o rótulo dizendo a verdade. Sem `pdfUrl` (falha de PDF/legado), o primário cai no
`handleImprimir` como hoje.
- [ ] **Step 2 (X2):** Persistir a escolha de imagens: `handleEmitir` inclui
`incluirImagensNoPdf: incluirEfetivo` em `dadosFinais` (entra na whitelist da Task 11); na
carga do exame, `setImagensIncluidasNoPdf(dados.incluirImagensNoPdf ?? true)` — o setter
morto passa a ter o único chamador certo. `handleImprimir`/regenerações usam o state.
- [ ] **Step 3 (X3):** `cfgSnapshot` morre: remover as 2 escritas (page.tsx:1424,
laudo-texto:184) e o campo do tipo (`senna90/types.ts:164`) — nunca foi lido; o documento
assinado é o `pdfUrl`, que a Task resolve. (Registrado na triagem como decisão leve —
se o Sergio preferir honrar o snapshot de config, reverter é 1 commit.)
- [ ] **Step 4:** `npx tsc --noEmit` + `npm run build` limpos; smoke visual = Sergio.
- [ ] **Step 5:** Commit: `fix(secao7): X4+X2+X3 — emitido abre o PDF assinado; escolha de imagens persistida; cfgSnapshot morto removido`

### Task 18: X5 — guard de tabela vazia nas 4 saídas

**Files:**
- Modify: `src/app/laudo/[id]/page.tsx:1449-1453,1742,1766,1802,1825`

- [ ] **Step 1:** Extrair o guard da emissão (tbody vazio / `tabelaFrescaRef` velha) para
`function tabelaProntaOuAvisa(): boolean` (mesmo toast + return false). `handleEmitir` usa.
- [ ] **Step 2:** `handleImprimir`, `handleCopiarFormatado`, `handleCopiarTexto` e
`handleBaixarWord` abrem com `if (!tabelaProntaOuAvisa()) return;` — PDF/prontuário/Word
não saem mais com "MEDIDAS E PARÂMETROS" vazio e cara de completo.
- [ ] **Step 3:** `npx tsc --noEmit` limpo. Commit:
`fix(secao7): X5 — as 4 saidas ganham o guard de tabela vazia da emissao`

### Task 19: X7 — linha incompleta some das 4 saídas (não só de 2)

**Files:**
- Modify: `src/lib/pdf-params.ts` (`montarParamsHtml` filtra como os irmãos)
- Test: `tests/unit/pdf-params.test.mjs`

- [ ] **Step 1: Teste falhando:** linha com `cells.length < 8` não aparece no HTML de
`montarParamsHtml` (hoje aparece; nos extratores de texto/Word já é filtrada — divergência
clínica silenciosa entre PDF e prontuário).
- [ ] **Step 2:** Aplicar o MESMO filtro `cells.length >= 8` das linhas ~98/111 no caminho
HTML (~49). Uma linha só válida nas 4 saídas ou em nenhuma.
- [ ] **Step 3:** `npm run test:unit` verde. Commit:
`fix(secao7): X7 — linha incompleta filtrada igualmente nas 4 saidas`

### Task 20: X17 + X18 — laudo-texto: transferido volta a ter rascunho + aviso ao sair

**Files:**
- Modify: `src/app/laudo-texto/[id]/page.tsx:47` e (beforeunload) topo do componente

- [ ] **Step 1 (X17):** `emitidoDoc = status === 'emitido'` (não `|| !!emitidoEm`) — mesmo
critério e mesmo motivo do motor (`page.tsx:278-284`): o médico que recebeu o laudo
transferido precisa salvar rascunho. Copiar o comentário-razão do motor.
- [ ] **Step 2 (X18):** Portar o `beforeunload` do motor (`page.tsx:485-496`) usando o
`dirty` do `onDirty` do editor — fechar a aba com Doppler digitado avisa antes de perder.
- [ ] **Step 3:** `npx tsc --noEmit` + `npm run build` limpos. Commit:
`fix(secao7): X17+X18 — laudo-texto transferido salva rascunho e avisa ao sair sujo`

### Task 21: X24 + P11 — mortos, nome do docx, cópia verificada, html2pdf fora

**Files:**
- Modify: `src/lib/exportDocx.ts:~203`, `src/app/laudo/[id]/page.tsx:1796,1819`
- Delete: `public/lib/html2pdf.min.js` · Modify: `package.json` (rm html2pdf.js),
  `next.config.ts:12` (chave morta `/api/gerar-pdf`), `src/lib/pdfUtils.ts:6-7` e
  `storage.rules:7` (comentários)

- [ ] **Step 1 (docx):** `gerarDocx` recebe o prefixo por parâmetro (chamador passa
`prefixoArquivoPorTipo(tipoExame)` — mesmo helper do PDF) e o nome passa por
`sanitizarNomeArq` de `pdf-path.ts`. Doppler baixado deixa de se chamar `ECOTT_…`.
- [ ] **Step 2 (cópia):** `handleCopiarFormatado`/fallback do Copiar Texto: checar o
retorno de `document.execCommand('copy')` — `false` → toast de erro (não "Copiado").
- [ ] **Step 3 (P11):** `npm rm html2pdf.js` · apagar `public/lib/html2pdf.min.js` ·
apagar a chave `'/api/gerar-pdf'` do `next.config.ts` · corrigir os 2 comentários que
citam o pipeline morto. `npm run build` prova que nada dependia.
- [ ] **Step 4:** Bateria completa verde. Commit:
`chore(secao7): X24+P11 — docx com nome certo, copia verificada, html2pdf e rota morta fora`

**FIM DA ONDA 4 →** bateria completa · TRÍADE COMPLETA · merge+deploy com OK do Sergio ·
ADR final da Seção 7 em `docs/decisoes/` + espelho Obsidian + memória + push.

---

# TRIAGEM DOS DEMAIS ACHADOS (sem task de código)

**Fechados pela onda 0:** E1 (trava emissaoKey) · P2 (tracing corrigir-laudo) · P6 (gru1) ·
P7 (Chromium reutilizado) · P8-parcial (teto 8s; o resto na Task 16) · E5 (mitigado:
gru1+reuso+teto encolheram o relógio; risco residual registrado no ADR da onda 0).

**OK-notáveis (nada a fazer):** E7, E17, E21, X8, X9, X14, P12, P13 (rodar 1× a varredura
`scripts/diagnostico/varredura-laudos-html.mjs` antes de fechar a seção), P14, P15, P20.

**Decisões registradas (não reabrir):** E2 (reemissão cobra) · P16 (PDF público) · P22
(campos antes do CAS) · X19 (trava do emitido no laudo-texto — X18 fecha o risco residual) ·
X23 (limites do anexo).

**Dívidas registradas (ficam no radar, sem código agora):** E9 (bordas de
franquia/crédito ganham testes nas Tasks 5/7; concorrência real fica) · E20 (mensagem do
pré-voo pra recepção — UX menor) · P21 (fail-loud casa 1 forma de URL — nada grava a outra) ·
X15 (pdfHtml arbitrário: a Task 3 aplica o remédio mínimo do leitor — JS off + allowlist;
montar o HTML no servidor fica como dívida maior) · X16 (coberto pela whitelist da Task 11) ·
X24-lacuna (laudo-texto sem Imprimir/Copiar/Word — ver decisões abaixo).

**DECISÕES DE PRODUTO para o Sergio (apresentar no fim da onda 2):**
1. **E11** — renovação de ciclo (Task 10, draft com 3 opções). ⚠️ bloqueia escala.
2. **E10/E14/E22** — regra de `status` + whitelist (Task 11, draft). ⚠️ regra Firestore.
3. **E12** — excedente: os planos vendem R$/laudo excedente, o código BLOQUEIA no 601º.
   Ou o motor passa a cobrar excedente, ou o comercial para de anunciar. (Casa com E11.)
4. **E13** — créditos extras furam a expiração do plano/trial. Política desejada?
5. **X6** — realce vermelho (fora de referência) deve sair no PDF assinado? Hoje só a tela.
6. **X23-nota** — `consumo` guarda pacienteNome/convênio (dado de paciente em coleção de
   billing). Intencional (extrato precisa)? Confirmar e registrar.
7. **X24-lacuna** — laudo-texto sem saídas além do PDF: decisão ou lacuna a preencher?
8. **X3** — `cfgSnapshot` removido na Task 17 (nunca lido); se preferir "reimprimir com
   config da época", vira feature nova.
