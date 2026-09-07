# Seção 8 (Histórico/Extrato) — Plano de Correção em 3 Ondas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os achados da tríade da Seção 8 — extrato financeiro correto (onda 1), camada de dados travada por regra (onda 2), UX + deleções Ponytail (onda 3).

**Architecture:** Telas `src/components/Historico.tsx` e `src/components/Extrato.tsx` sobre `getHistorico` (Firestore web SDK, paginação por cursor). Billing do extrato continua contador-no-cliente NESTA seção (cobrança real = onda final do projeto, decisão Sergio); aqui só corrigimos o que o contador conta e quem pode escrevê-lo. Motor Senna93 intocado.

**Tech Stack:** Next.js + Firebase web SDK (cliente) · firestore.rules + @firebase/rules-unit-testing (emulador) · node --test.

## Global Constraints

- NÃO tocar em `src/lib/senna93/**`, motor de laudo, nem `emitir-admin.ts` (Senna93 estável, sombra observa).
- Regra de segurança + código + teste com payload REAL no MESMO commit (regra de ouro do AGENTS.md).
- Publicar `firestore.rules` SÓ com aval explícito do Sergio (fim da onda 2).
- Cada onda mergeia sozinha, com tríade PRÉ-merge obrigatória e aval do Sergio.
- NÃO usar `git stash`. Commits pequenos por tarefa, mensagens em pt-BR como o histórico.
- Verificação mínima por tarefa: `npm run typecheck` (rápido). Suites completas no fim de cada onda: `npm run test:unit`, `npm run test:rules` (onda 2), `npm run lint`.
- Achados citados: C* = Codex, R* = Ruflo, P* = Ponytail (mapa no chat de 07/09, vai pro ADR).

---

## ONDA 1 — Dente financeiro (branch `secao8-onda1`)

### Task 1: Helper `anoMesAtual()` — mês calculado uma vez só (C5, P4)

**Files:**
- Modify: `src/lib/firestore.ts` (junto do bloco BILLING DO EXTRATO, ~linha 465)
- Modify: `src/lib/billing.ts:238-240` (checkExtratoLimit)
- Modify: `src/components/Extrato.tsx:65-66` (effect do workspace)

**Interfaces:**
- Produces: `export function anoMesAtual(): string` — `"AAAA-MM"` no fuso local. Task 4 usa na geração.

- [ ] **Step 1: Adicionar o helper em firestore.ts** (acima de `getExtratoContador`):

```ts
// Mês de referência do contador de extratos ("AAAA-MM", fuso local).
// Dono único (P4): Extrato.tsx e checkExtratoLimit calculavam cada um o seu —
// página aberta na virada do mês checava o limite num mês e incrementava no outro (C5).
export function anoMesAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Usar em `checkExtratoLimit`** (billing.ts) — trocar:

```ts
    // Buscar contador do mes atual
    const agora = new Date();
    const anoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
```

por:

```ts
    // Buscar contador do mes atual (dono único do formato: anoMesAtual)
    const anoMes = anoMesAtual();
```

com `import { anoMesAtual } from './firestore';` no topo (billing.ts já importa de './firebase'; conferir que não cria ciclo — firestore.ts NÃO importa billing.ts, então é seguro).

- [ ] **Step 3: Usar no effect do Extrato.tsx** — trocar as 2 linhas `const agora = new Date(); const anoMes = ...` por `const anoMes = anoMesAtual();` e adicionar `anoMesAtual` ao import de `@/lib/firestore`.

- [ ] **Step 4: Verificar** — `npm run typecheck` → sem erros.

- [ ] **Step 5: Commit** — `git commit -m "fix(extrato): anoMesAtual dono unico do mes de referencia (C5/P4 secao8)"`

### Task 2: `incrementarExtrato` atômico (C15)

**Files:**
- Modify: `src/lib/firestore.ts:480-491`

**Interfaces:**
- Produces: mesma assinatura `incrementarExtrato(wsId, anoMes): Promise<boolean>`; agora 1 escrita atômica (sem get prévio).

- [ ] **Step 1: Trocar o corpo** (get+update/set → setDoc merge com increment; `increment` já está importado no arquivo):

```ts
export async function incrementarExtrato(wsId: string, anoMes: string) {
  try {
    // Atômico (C15): setDoc+merge com increment cria em 1 ou soma 1 na mesma
    // escrita — o get+set anterior perdia contagem quando 2 cliques corriam
    // na criação do doc do mês.
    await setDoc(doc(db, 'workspaces', wsId, 'extratos', anoMes),
      { emitidos: increment(1), ultimoEm: now() }, { merge: true });
    return true;
  } catch (e) { console.error('incrementarExtrato:', e); return false; }
}
```

- [ ] **Step 2: Verificar** — `npm run typecheck` → sem erros.
- [ ] **Step 3: Commit** — `git commit -m "fix(extrato): incrementarExtrato atomico via setDoc merge+increment (C15 secao8)"`

### Task 3: `getHistorico` para de engolir erro + Histórico mostra falha (C11)

**Files:**
- Modify: `src/lib/firestore.ts:394-441` (HistoricoResult + catch)
- Modify: `src/components/Historico.tsx` (fetchData/carregarMais + estado de erro)

**Interfaces:**
- Produces: `HistoricoResult` ganha `erro?: boolean` (true = a consulta FALHOU; lista vazia legítima vem com `erro` ausente). Task 4 consome no Extrato.

- [ ] **Step 1: firestore.ts** — no type e no catch:

```ts
export type HistoricoResult = {
  items: Record<string, unknown>[];
  lastDoc: unknown; // DocumentSnapshot — ultimo doc pra proxima pagina
  hasMore: boolean;
  erro?: boolean;   // true = consulta falhou (indice/permissao/rede) — NAO e "sem laudos" (C11)
};
```

```ts
  } catch (e) { console.error('getHistorico:', e); return { items: [], lastDoc: null, hasMore: false, erro: true }; }
```

- [ ] **Step 2: Historico.tsx** — estado + uso. Adicionar `const [erroCarga, setErroCarga] = useState(false);` junto dos outros states. Em `fetchData`, após o guard de geração:

```ts
    if (meuGen !== genRef.current) return;
    setErroCarga(!!result.erro);
    setExames(result.items as ExameItem[]);
```

Em `carregarMais`, se `result.erro`: `alert('Não foi possível carregar mais. Tente novamente.'); setLoadingMore(false); return;` (sem avançar cursor nem concatenar).

- [ ] **Step 3: Historico.tsx render** — antes do branch `filtrados.length === 0`, inserir o branch de erro:

```tsx
      ) : erroCarga ? (
        <div className="text-center py-12 text-gray-300">
          <p className="text-3xl mb-2">⚠️</p>
          <p className="text-sm text-gray-500">Não foi possível carregar o histórico.</p>
          <button onClick={fetchData} className="mt-3 px-4 py-1.5 bg-[#1E3A5F] text-white text-xs rounded-lg hover:bg-[#2563EB] transition">Tentar novamente</button>
        </div>
```

- [ ] **Step 4: Verificar** — `npm run typecheck`; abrir preview (`/laudos`) e conferir que a lista normal continua carregando.
- [ ] **Step 5: Commit** — `git commit -m "fix(historico): erro de consulta deixa de virar 'Nenhum laudo emitido' (C11 secao8)"`

### Task 4: Extrato consulta TODAS as páginas + corrida de período (C1/R2, C3, C11-b)

**Files:**
- Modify: `src/components/Extrato.tsx:74-89` (handleConsultar + effect de reset)

**Interfaces:**
- Consumes: `HistoricoResult.hasMore/lastDoc/erro` (Task 3).

- [ ] **Step 1: Reescrever `handleConsultar`** com laço de cursor e geração própria:

```ts
  // Buscar exames — só quando clica "Consultar". Percorre TODAS as páginas
  // (C1: teto fixo de 500 truncava período movimentado e o extrato saía com
  // total errado). meuGen = ++genRef (C3): consulta nova ou troca de datas
  // invalida a resposta lenta da anterior.
  async function handleConsultar() {
    if (!wsIdSel || !dateFrom || !dateTo) return;
    const meuGen = ++genRef.current;
    setLoading(true);
    setGerado(false);
    const todos: ExameItem[] = [];
    let cursor: DocumentSnapshot | null = null;
    // ponytail: teto de 40 paginas (20.000 laudos) — acima disso é uso fora da
    // curva; subir o teto se algum dia um período real chegar perto.
    for (let pag = 0; pag < 40; pag++) {
      const result = await getHistorico(wsIdSel, { dateFrom, dateTo, limitN: 500, cursor });
      if (meuGen !== genRef.current) return;
      if (result.erro) {
        setLoading(false);
        alert('Não foi possível consultar os exames. Tente novamente.');
        return;
      }
      todos.push(...(result.items as ExameItem[]));
      cursor = result.lastDoc as DocumentSnapshot | null;
      if (!result.hasMore) break;
    }
    setExames(todos);
    carregadoWsId.current = wsIdSel;
    setLoading(false);
    setGerado(true);
  }
```

(Adicionar `import { DocumentSnapshot } from 'firebase/firestore';` no topo.)

- [ ] **Step 2: Effect de reset também invalida** (C3 — mudar datas com consulta em voo):

```ts
  // Resetar quando muda filtros — e invalidar consulta em voo (C3): sem o ++,
  // a resposta lenta do período antigo preenchia a tela e o extrato saía
  // rotulado com as datas novas.
  useEffect(() => { genRef.current++; setGerado(false); setExames([]); }, [wsIdSel, dateFrom, dateTo]);
```

- [ ] **Step 3: Verificar** — `npm run typecheck`; no preview, consultar um período com laudos e conferir tabela + resumo.
- [ ] **Step 4: Commit** — `git commit -m "fix(extrato): consulta pagina ate o fim (C1) + corrida de periodo invalidada (C3) secao8"`

### Task 5: `handleGerarExtrato` — popup primeiro, trava de clique, erro de plano (C4, C10, C14)

**Files:**
- Modify: `src/components/Extrato.tsx:146-171` + botão `:406-411`

**Interfaces:**
- Consumes: `anoMesAtual()` (Task 1).

- [ ] **Step 1: Estado de trava** — junto dos states: `const [gerandoExtrato, setGerandoExtrato] = useState(false);`

- [ ] **Step 2: Reescrever `handleGerarExtrato`:**

```ts
  // Gerar extrato (imprimir). Ordem importa: window.open ANTES de qualquer
  // await (C10 — popup fora do gesto do clique era bloqueado e a contagem já
  // tinha acontecido); trava de duplo-clique (C4); erro do checkExtratoLimit
  // aborta em vez de contar às cegas (C14).
  async function handleGerarExtrato() {
    if (!wsIdSel || !user?.uid || gerandoExtrato) return;
    // Nao cobrar/logar o local B com os exames ainda do A (janela de troca).
    if (carregadoWsId.current !== wsIdSel) {
      alert('Aguarde os dados do local carregarem.');
      return;
    }
    const win = window.open('', '_blank');
    if (!win) {
      alert('O navegador bloqueou a janela do extrato. Habilite popups para este site e tente de novo.');
      return;
    }
    setGerandoExtrato(true);
    try {
      const limiteExtrato = await checkExtratoLimit(wsIdSel);
      if (!limiteExtrato.pode) {
        win.close();
        alert('Não foi possível verificar seu plano. Tente novamente.');
        return;
      }
      if (!limiteExtrato.gratis && limiteExtrato.custo > 0) {
        const msg = `Voce ja usou ${limiteExtrato.usados} de ${limiteExtrato.franquia} extrato(s) gratis neste mes.\nO proximo custara R$ ${limiteExtrato.custo.toFixed(2)}.\n\nDeseja continuar?`;
        if (!confirm(msg)) { win.close(); return; }
      }
      const anoMes = anoMesAtual();
      await incrementarExtrato(wsIdSel, anoMes);
      await logAction('extrato_emitido', { wsId: wsIdSel, periodo: `${dateFrom} a ${dateTo}`, totalExames: exames.length, totalValor: totalGeral }, user.uid);
      setExtratoInfo(prev => prev.mes === anoMes
        ? { mes: anoMes, emitidos: prev.emitidos + 1 }
        : { mes: anoMes, emitidos: 1 });
      win.document.write(gerarHtmlExtrato());
      win.document.close();
    } finally {
      setGerandoExtrato(false);
    }
  }
```

(O ramo morto `franquia === -1 ? 'Extrato ilimitado...'` some: com franquia -1, `gratis` já vem true.)

- [ ] **Step 3: Botão com trava:**

```tsx
            <button onClick={handleGerarExtrato} disabled={gerandoExtrato}
              className="bg-[#1E3A5F] text-white px-8 py-3 rounded-lg font-semibold hover:bg-[#2563EB] transition flex items-center gap-2 disabled:opacity-50">
              {gerandoExtrato ? 'Gerando...' : '🖨️ Gerar Extrato'}
            </button>
```

- [ ] **Step 4: Verificar** — `npm run typecheck`; no preview: gerar um extrato (janela abre com a tabela), duplo-clique não conta 2.
- [ ] **Step 5: Commit** — `git commit -m "fix(extrato): popup no gesto do clique, trava de duplo-clique, erro de plano aborta (C4/C10/C14 secao8)"`

### Task 6: Fechamento da onda 1

- [ ] `npm run typecheck && npm run lint && npm run test:unit` — tudo verde (piso: unit 763).
- [ ] Tríade PRÉ-merge no diff da onda (Codex adversarial · Ruflo · Ponytail).
- [ ] Aval do Sergio → merge na master + push.

---

## ONDA 2 — Camada de dados (branch `secao8-onda2`)

### Task 7: Regras de `config/` e `extratos/` — whitelist + contador monotônico (C2, R5, C9-regra)

**Files:**
- Modify: `firestore.rules:261-267`
- Modify: `tests/rules/fixtures.mjs` (payloads novos)
- Modify: `tests/rules/regras.test.mjs` (seeds ~54-55, teste ~183-185, describe novo)

**Interfaces:**
- Produces: `payloadHonorarios(extra)` e regra nova; Task 9 alinha o cliente.

- [ ] **Step 1: Payloads reais em fixtures.mjs** (espelho exato de `saveHonorarios` e `incrementarExtrato`):

```js
/**
 * Payload identico ao que `saveHonorarios()` envia (src/lib/firestore.ts):
 * so `convenios` (mapa) e `valorUnico` (number | null).
 */
export const payloadHonorarios = (extra = {}) => ({
  convenios: { UNIMED: 150, PARTICULAR: 300 },
  valorUnico: null,
  ...extra,
});
```

- [ ] **Step 2: Regra nova** — substituir o bloco atual (linhas 261-266):

```
      // Honorarios/extratos: financeiro, so quem atende (medico) ou o dono —
      // recepcao nao ve valor por convenio. superadmin(): suporte (Lacuna 1).
      // S8 onda 2 (C2/R5): whitelist de forma — unicos caminhos gravaveis do
      // workspace que nao tinham hasOnly(). `config` so aceita o doc
      // 'honorarios' com os 2 campos do saveHonorarios (valores DENTRO do mapa
      // `convenios` nao sao validaveis por regra — clamp no cliente, C9).
      match /config/{docId} {
        allow read: if superadmin() || ehMedicoNoLocal(wsId);
        allow create, update: if superadmin() || (ehMedicoNoLocal(wsId)
          && docId == 'honorarios'
          && request.resource.data.keys().hasOnly(['convenios', 'valorUnico'])
          && request.resource.data.convenios is map
          && (request.resource.data.valorUnico == null
              || (request.resource.data.valorUnico is number
                  && request.resource.data.valorUnico >= 0)));
        allow delete: if superadmin();
      }
      // Contador de extratos (C2): nasce em 1 e so anda +1 — zerar, saltar ou
      // apagar o mes e evasao do "1 gratis/mes". O incrementarExtrato do
      // cliente (setDoc merge + increment(1)) passa nos dois ramos.
      match /extratos/{docId} {
        allow read: if superadmin() || ehMedicoNoLocal(wsId);
        allow create: if superadmin() || (ehMedicoNoLocal(wsId)
          && request.resource.data.keys().hasOnly(['emitidos', 'ultimoEm'])
          && request.resource.data.emitidos == 1);
        allow update: if superadmin() || (ehMedicoNoLocal(wsId)
          && request.resource.data.keys().hasOnly(['emitidos', 'ultimoEm'])
          && request.resource.data.emitidos == resource.data.emitidos + 1);
        allow delete: if superadmin();
      }
```

- [ ] **Step 3: Corrigir seed + teste antigos em regras.test.mjs** — o seed da linha 54 usa forma INVENTADA plana `{ UNIMED: 120 }` (o motivo de existir fixtures.mjs!). Trocar:

```js
    await setDoc(doc(db, `workspaces/${LOCAL_A1}/config`, 'honorarios'), { convenios: { UNIMED: 120 }, valorUnico: null });
```

E o teste `medico le e escreve honorarios` (~185) passa a usar o payload real:

```js
    await assertSucceeds(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/config`, 'honorarios'), payloadHonorarios()));
```

(importar `payloadHonorarios` no topo junto dos outros payloads). O teste do superadmin (~486) pode manter payload solto — superadmin bypassa a whitelist, e é isso que ele afirma.

- [ ] **Step 4: Testes novos** — `describe('secao 8 — honorarios e contador de extratos', ...)`:

```js
describe('secao 8 — honorarios e contador de extratos', () => {
  test('medico nao grava campo fora da whitelist de honorarios', async () => {
    await assertFails(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/config`, 'honorarios'),
      payloadHonorarios({ hack: true })));
  });
  test('valorUnico negativo e barrado', async () => {
    await assertFails(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/config`, 'honorarios'),
      payloadHonorarios({ valorUnico: -50 })));
  });
  test('medico nao cria outro doc sob config/', async () => {
    await assertFails(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/config`, 'outra-coisa'), { x: 1 }));
  });
  test('recepcao nao escreve honorarios', async () => {
    await assertFails(setDoc(doc(como(RITA), `workspaces/${LOCAL_A1}/config`, 'honorarios'), payloadHonorarios()));
  });
  // Contador: payload real do incrementarExtrato = setDoc merge {emitidos: increment(1), ultimoEm}
  test('medico incrementa o contador do mes (payload real, doc novo e existente)', async () => {
    await assertSucceeds(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/extratos`, '2026-09'),
      { emitidos: increment(1), ultimoEm: serverTimestamp() }, { merge: true }));
    await assertSucceeds(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/extratos`, '2026-08'),
      { emitidos: increment(1), ultimoEm: serverTimestamp() }, { merge: true }));
  });
  test('medico nao zera nem salta o contador', async () => {
    await assertFails(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/extratos`, '2026-08'), { emitidos: 0 }));
    await assertFails(setDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/extratos`, '2026-08'),
      { emitidos: increment(5), ultimoEm: serverTimestamp() }, { merge: true }));
  });
  test('medico nao apaga o contador do mes', async () => {
    await assertFails(deleteDoc(doc(como(DR_A2), `workspaces/${LOCAL_A1}/extratos`, '2026-08')));
  });
});
```

(`increment` e `serverTimestamp` entram no import de `firebase/firestore` do teste.)

- [ ] **Step 5: Rodar** — `npm run test:rules` → tudo verde (piso 152, sobe).
- [ ] **Step 6: Commit** — `git commit -m "fix(seguranca): whitelist config/honorarios + contador de extratos monotonico, testes payload real (C2/R5 secao8)"`

### Task 8: Regra de `logs` — autor amarrado (R4)

**Files:**
- Modify: `firestore.rules:332-336`
- Modify: `tests/rules/regras.test.mjs` (testes novos no describe da secao 8)

**Contexto pro implementador:** chamadores client-side de `logAction` hoje: `Extrato.tsx:164` (passa `user.uid`) e 4 chamadas em `src/app/direx/painel/configuracoes/page.tsx` (passam `profile?.id`, e usuário do Direx é superadmin). O fallback `'sistema'` de `logAction` só é alcançável por chamador que omite `medicoUid` — nenhum client-side hoje. Admin SDK (servidor) ignora regras.

- [ ] **Step 1: Regra** — substituir o bloco `match /logs/{logId}`:

```
    match /logs/{logId} {
      // S8 onda 2 (R4): mesmo fechamento do `consumo` — auth() sozinho deixava
      // qualquer logado forjar trilha em nome de outro medico/clinica. Cliente
      // so cria log ASSINADO com o proprio uid; 'sistema' e uid alheio, so
      // Admin SDK. Chamadores reais conferidos: Extrato (user.uid) e Direx
      // configuracoes (superadmin).
      allow create: if superadmin() || (auth() && request.resource.data.medicoUid == uid());
      allow read:   if superadmin();
      allow update, delete: if false;
    }
```

- [ ] **Step 2: Testes** (no describe da secao 8):

```js
  test('log so nasce assinado com o proprio uid', async () => {
    await assertSucceeds(addDoc(collection(como(DR_A2), 'logs'),
      { tipo: 'extrato_emitido', wsId: LOCAL_A1, ts: serverTimestamp(), medicoUid: DR_A2 }));
    await assertFails(addDoc(collection(como(DR_A2), 'logs'),
      { tipo: 'extrato_emitido', wsId: LOCAL_A1, ts: serverTimestamp(), medicoUid: DR_A }));
    await assertFails(addDoc(collection(como(DR_A2), 'logs'),
      { tipo: 'qualquer', ts: serverTimestamp(), medicoUid: 'sistema' }));
  });
```

- [ ] **Step 3: Rodar** — `npm run test:rules` → verde.
- [ ] **Step 4: Commit** — `git commit -m "fix(seguranca): log de auditoria so nasce assinado pelo proprio uid (R4 secao8)"`

### Task 9: Clamp de honorários no cliente (C9-cliente)

**Files:**
- Modify: `src/components/Extrato.tsx:111-116` (setValorConvenio), `:123-126` (handleSalvarValores), `:134-143` (toggle), `:341-345` (input valor único)

- [ ] **Step 1:** Em `setValorConvenio`: `const num = Math.max(0, parseFloat(valor) || 0);`
- [ ] **Step 2:** Em `handleSalvarValores`: `valorUnico: usarValorUnico ? Math.max(0, parseFloat(valorUnicoInput) || 0) : null,`
- [ ] **Step 3:** No onChange do input de valor único e no `handleToggleValorUnico`: mesmo `Math.max(0, ...)` nos `parseFloat`. Adicionar `min="0"` nos dois `<input type="number">` de valores.
- [ ] **Step 4:** `npm run typecheck` → verde.
- [ ] **Step 5: Commit** — `git commit -m "fix(extrato): honorario nao aceita valor negativo (C9 secao8)"`

### Task 10: Fechamento da onda 2

- [ ] `npm run typecheck && npm run lint && npm run test:unit && npm run test:rules` — verdes.
- [ ] Tríade PRÉ-merge no diff.
- [ ] Aval do Sergio → merge + push. **Publicar regra (`firebase deploy --only firestore:rules`) SÓ com aval explícito** — regra nova e código novo já convivem (o incrementarExtrato da Task 2 passa na regra velha e na nova).

---

## ONDA 3 — UX + Ponytail (branch `secao8-onda3`)

### Task 11: `fmt-data.ts` compartilhado (P2)

**Files:**
- Create: `src/lib/fmt-data.ts`
- Modify: `src/components/Historico.tsx` e `src/components/Extrato.tsx` (deletar as cópias locais de `fmtDate`/`fmtEmitido`, importar)

**Interfaces:**
- Produces: `fmtDataExame(d?: string): string` ("AAAA-MM-DD" → "DD/MM/AAAA", senão devolve cru, vazio → "—") e `fmtDataHora(t?: { toDate?: () => Date }): string` ("DD/MM/AAAA HH:mm" ou "—").

- [ ] **Step 1: Criar** `src/lib/fmt-data.ts`:

```ts
// Formatação de datas das telas de Histórico/Extrato (P2 — era copiada 2x).
export function fmtDataExame(d: string | undefined): string {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

export function fmtDataHora(t: { toDate?: () => Date } | undefined): string {
  try {
    const dt = t?.toDate?.();
    if (dt) return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { /* */ }
  return '—';
}
```

- [ ] **Step 2:** Nas 2 telas: deletar `fmtDate` e `fmtEmitido` locais; importar e trocar chamadas (`fmtDate(` → `fmtDataExame(`, `fmtEmitido(ex)` → `fmtDataHora(ex.emitidoEm)`). No `gerarHtmlExtrato`, os `escaparHtml(...)` em volta ficam como estão.
- [ ] **Step 3:** `npm run typecheck` → verde. Commit — `git commit -m "refactor(secao8): fmt de data dono unico (P2)"`

### Task 12: Nome do tipo de laudo vem do catálogo (P1)

**Files:**
- Modify: `src/components/Historico.tsx` (deletar `TIPOS_EXAME`, usar `tiposMap`)
- Modify: `src/components/Extrato.tsx` (deletar `TIPOS_EXAME`, adicionar `useTiposLaudo`)

- [ ] **Step 1: Historico.tsx** — deletar o const `TIPOS_EXAME`; na célula de tipo: `{tiposMap[ex.tipoExame as string]?.nome || ex.tipoExame}` (o hook `useTiposLaudo` já está montado).
- [ ] **Step 2: Extrato.tsx** — deletar o const; adicionar `const { tiposMap } = useTiposLaudo(wsIdSel || undefined);` com `import { useTiposLaudo } from '@/hooks/useTiposLaudo';`. Na tabela e no `gerarHtmlExtrato`: `tiposMap[ex.tipoExame as string]?.nome || ex.tipoExame || '—'` (no HTML, dentro do `escaparHtml`).
- [ ] **Step 3:** `npm run typecheck`; no preview, coluna Tipo mostra os nomes do catálogo (inclusive tipo criado pelo usuário, que antes saía como id cru). Commit — `git commit -m "refactor(secao8): nome do tipo vem do catalogo, TIPOS_EXAME hardcoded deletado 2x (P1)"`

### Task 13: `imprimirPdf` sem round-trip + tipos honestos (P3, P5, P6)

**Files:**
- Modify: `src/components/Historico.tsx` (imprimirPdf, imports, casts)
- Modify: `src/lib/firestore.ts:396` (tipo de lastDoc)

- [ ] **Step 1: Historico.tsx** — trocar `imprimirPdf(exameId)` por versão síncrona sobre a linha já carregada (o item de `getHistorico` já traz `pdfUrl`); deletar o import de `getExame`:

```ts
  // 🖨️: abre o PDF emitido; sem PDF, cai na tela do laudo (P3 — a versão
  // anterior refazia um getExame só pra ler o pdfUrl que já está na linha).
  function imprimirPdf(ex: ExameItem) {
    if (ex.pdfUrl) { abrirPdfUrl(ex.pdfUrl); return; }
    const rota = rotaDoLaudo(ex.id, ex.tipoExame, tiposMap);
    if (rota) { router.push(rota); return; }
    alert('Exame de anexo — use a Worklist para anexar o PDF.');
  }
```

No botão: `onClick={() => imprimirPdf(ex)}`.

- [ ] **Step 2: firestore.ts** — `lastDoc: DocumentSnapshot | null;` no `HistoricoResult` (import de tipo já existe no arquivo). Em `getHistorico`, o retorno já é DocumentSnapshot — remover comentário defasado.
- [ ] **Step 3: Historico.tsx/Extrato.tsx** — deletar os casts que sobram: `filtros as any` vira objeto tipado `FiltrosHistorico` (montar com spreads condicionais), `result.lastDoc as DocumentSnapshot | null` vira `result.lastDoc`. Deletar os `eslint-disable` órfãos.
- [ ] **Step 4:** `npm run typecheck && npm run lint` → verdes. Commit — `git commit -m "refactor(historico): imprimir sem round-trip, tipos sem any (P3/P5/P6)"`

### Task 14: Dropdown de convênio estável + busca × paginação (C12, C13)

**Files:**
- Modify: `src/components/Historico.tsx`

- [ ] **Step 1: Opções acumuladas (C13)** — trocar a derivação `conveniosUnicos` por estado acumulado que NÃO encolhe ao filtrar:

```ts
  const [convOpcoes, setConvOpcoes] = useState<string[]>([]);
  // Opções do dropdown (C13): acumuladas por local — derivar da página filtrada
  // colapsava a lista pra 1 opção e escondia convênios fora da 1ª página.
  useEffect(() => { setConvOpcoes([]); }, [wsIdSel]);
```

Em `fetchData` e `carregarMais`, após `setExames`:

```ts
    if (!convenioSel) {
      const novos = result.items.map(e => (e as ExameItem).convenio).filter(Boolean) as string[];
      setConvOpcoes(prev => [...new Set([...prev, ...novos])].sort());
    }
```

No `<select>`: `{convOpcoes.map(c => ...)}` (deletar `conveniosUnicos`).

- [ ] **Step 2: Busca não esconde "Carregar mais" (C12)** — no estado vazio com busca ativa e `hasMore`:

```tsx
          <p className="text-sm">{busca ? `Nenhum resultado para "${busca}" nas páginas carregadas` : 'Nenhum laudo emitido'}</p>
          {busca && hasMore && (
            <button onClick={carregarMais} disabled={loadingMore}
              className="mt-3 px-4 py-1.5 bg-[#1E3A5F] text-white text-xs rounded-lg hover:bg-[#2563EB] transition disabled:opacity-50">
              {loadingMore ? 'Carregando...' : 'Buscar nas próximas páginas'}
            </button>
          )}
```

- [ ] **Step 3:** `npm run typecheck`; preview: filtrar convênio mantém o dropdown completo; buscar nome inexistente com 50+ laudos oferece carregar mais. Commit — `git commit -m "fix(historico): dropdown de convenio estavel (C13) e busca alcanca proximas paginas (C12)"`

### Task 15: Feedback de erro em honorários + aviso de billing honesto (C6, C7, C8, C16)

**Files:**
- Modify: `src/components/Extrato.tsx`

- [ ] **Step 1: Salvar com falha avisa e mantém edição aberta (C6):**

```ts
  async function handleSalvarValores() {
    if (!wsIdSel) return;
    setSalvandoValores(true);
    const config: HonorariosConfig = {
      convenios: honorarios.convenios,
      valorUnico: usarValorUnico ? Math.max(0, parseFloat(valorUnicoInput) || 0) : null,
    };
    const ok = await saveHonorarios(wsIdSel, config);
    setSalvandoValores(false);
    if (!ok) { alert('Não foi possível salvar os valores. Tente novamente.'); return; }
    setHonorarios(config);
    setEditandoValores(false);
  }
```

- [ ] **Step 2: Carga de honorários com falha avisa (C8)** — `getHonorarios` ganha o mesmo padrão do `getHistorico`: no catch, `return { convenios: {}, valorUnico: null, erro: true } as HonorariosConfig & { erro: true }`… **não** — mínimo real: em `firestore.ts`, mudar `getHonorarios` pra devolver `null` no catch (`Promise<HonorariosConfig | null>`); no Extrato:

```ts
    getHonorarios(wsIdSel).then(h => {
      if (meuGen !== genRef.current) return;
      if (!h) { alert('Não foi possível carregar os valores de honorários — os totais podem sair zerados.'); }
      const cfg = h || { convenios: {}, valorUnico: null };
      setHonorarios(cfg);
      setUsarValorUnico(cfg.valorUnico !== null);
      setValorUnicoInput(cfg.valorUnico !== null ? String(cfg.valorUnico) : '');
    });
```

- [ ] **Step 3: incrementarExtrato com falha (C7)** — em `handleGerarExtrato` (Task 5 já reescreveu): `const contou = await incrementarExtrato(wsIdSel, anoMes); if (!contou) console.warn('extrato: contador nao incrementou');` — extrato ainda sai (não travar o médico por causa do contador decorativo; registrado no ADR).
- [ ] **Step 4: Aviso honesto (C16)** — guardar a franquia na carga: novo state `const [extratoFranquia, setExtratoFranquia] = useState<number | null>(null);` e no effect do workspace: `checkExtratoLimit(wsIdSel).then(l => { if (meuGen === genRef.current) setExtratoFranquia(l.franquia); });`. Texto:

```tsx
      <div className="text-xs text-gray-400 mb-3">
        {extratoFranquia === -1
          ? `${extratoInfo.emitidos} extrato(s) emitido(s) em ${wsNome} neste mês — ilimitados no seu plano`
          : extratoInfo.emitidos === 0
            ? `Nenhum extrato emitido em ${wsNome} neste mês${extratoFranquia ? ` (${extratoFranquia} grátis)` : ' (1 grátis)'}`
            : `${extratoInfo.emitidos} extrato(s) emitido(s) em ${wsNome} neste mês${extratoFranquia !== null && extratoInfo.emitidos >= extratoFranquia ? ' — próximo será cobrado' : ''}`}
      </div>
```

- [ ] **Step 5:** `npm run typecheck`; preview: aviso não ameaça cobrança em plano ilimitado. Commit — `git commit -m "fix(extrato): falha de honorarios avisa em vez de fingir sucesso (C6/C7/C8) e aviso de cobranca honesto (C16)"`

### Task 16: Fechamento da onda 3

- [ ] `npm run typecheck && npm run lint && npm run test:unit && npm run test:rules` — verdes.
- [ ] Tríade PRÉ-merge no diff.
- [ ] Aval do Sergio → merge + push.

---

## Pós-ondas (mesma sessão ou seguinte)

- ADR `docs/decisoes/2026-09-XX-secao8-historico-extrato.md` com o mapa completo dos 30 achados, os fechados por onda e os REGISTRADOS pra onda de billing final: R1 (extrato server-side), R3 (fonte da verdade = ledger `consumo`), conferência de convênios (motivo do X23), R6 (tripwire do catálogo de planos), P7, C7-nota.
- Espelho no Obsidian (`Leo/Decisões/`), memória local, push.
