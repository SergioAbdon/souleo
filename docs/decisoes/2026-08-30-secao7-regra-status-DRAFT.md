# DRAFT — Seção 7 · Onda 2 · Task 11 (E10 + E22 + E14 + E19)
## Regra do `status` do exame + whitelist do `dadosFinais`

**Status: RASCUNHO — aguardando OK do Dr. Sergio. Nada de código/regra foi alterado.**
Data: 30/08/2026 · Branch: `feat/secao7-onda2`

---

## 1. Resumo executivo (em português de gente)

Hoje o **carimbo de "emitido"** do exame é um campo comum do documento: quem tem a
caneta (o médico dono do laudo) consegue escrever nele **direto do navegador**, sem
passar pela porta que cobra a franquia, gera o PDF e grava o log. Duas consequências
reais: (a) dá pra criar um laudo com **cara de assinado sem PDF e sem cobrança**
(E10), e (b) dá pra **des-emitir** um laudo já assinado, que então entra num limbo —
não pode mais ser cancelado (não devolve a franquia) e só some se for apagado (E22).
Junto disso, a rota `/api/emitir` **copia para o exame tudo que o navegador mandar**
dentro do pacote `dadosFinais`, inclusive o endereço do PDF oficial (E14).

**O remédio:** `status` passa a ser campo de **dono único do servidor**. Pelo navegador
só sobra a única transição que as telas realmente fazem hoje — "abri o laudo, salvei"
(→ `andamento`). Emitir, cancelar, transferir e reabrir passam a ser exclusividade das
rotas de servidor, que é onde já moram a franquia e o log. E o `dadosFinais` passa por
uma **lista de campos permitidos** montada a partir do que as 3 telas de emissão de
fato enviam.

**O que muda na clínica no dia a dia: NADA.** Nenhum botão do LEO faz hoje o que a
regra vai passar a proibir — o levantamento tela por tela está na seção 3. Emitir,
reemitir, corrigir, cancelar e transferir continuam iguais, porque todos já passam
pelo servidor.

---

## 2. O furo hoje (E10 e E22)

### A regra atual, verbatim (`firestore.rules:204-215`)

```
        allow update: if request.resource.data.get('status', '') != 'cancelado'
                      && ((ehMedicoDeVerdade(uid()) && ehMedicoNoLocal(wsId)
                            && (!('medicoUid' in resource.data) || resource.data.medicoUid == uid())
                            && ('medicoUid' in resource.data ? intacto('medicoUid') : true))
                          || (alcancaLocal(wsId) && intacto('medicoUid')
                              && resource.data.get('status', '') != 'emitido'
                              && request.resource.data.get('status', '') != 'emitido'
                              && request.resource.data.diff(resource.data).affectedKeys().hasOnly(camposAdministrativos())));
```

O primeiro braço (médico-autor) **não olha `status`**: qualquer valor menos `cancelado`
passa. O comentário logo acima, em `firestore.rules:198`, é explícito e continua valendo:
"Reabrir para 'andamento' continua livre para o autor."

Helpers citados: `intacto()` em `firestore.rules:77-81`, `camposAdministrativos()` em
`firestore.rules:92-97` (o `status` está lá dentro, linha 95), `ehMedicoDeVerdade()` em
`firestore.rules:67-70`.

### E10 — laudo assinado de graça (cenário concreto)

1. Dr. X abre o console do navegador na tela do laudo (ou usa um cliente adulterado).
2. `updateDoc(exameRef, { status: 'emitido', emitidoEm: new Date(), conclusoes: '...' })`.
3. A regra aceita: ele é médico de verdade, é o autor, e `'emitido' != 'cancelado'`.
4. Resultado no LEO: o exame aparece **emitido** na Worklist, no Histórico, na ficha do
   paciente e no Extrato — **sem PDF, sem log em `logs`, sem doc em `consumo`, sem 1
   franquia debitada**. O ledger da conta e a fila contam histórias diferentes.
5. O "gadget" pronto para isso já existe no repo: `emitExame()`
   (`src/lib/firestore.ts:341-352`) faz exatamente esse update — está sem nenhum
   chamador (E19, seção 6).

### E22 — des-emitir e cair no limbo do billing

1. Mesmo Dr. X: `updateDoc(exameRef, { status: 'andamento' })` num laudo emitido.
   Isso é exatamente o teste que existe hoje e passa: `tests/rules/regras.test.mjs:494`
   ("autor AINDA reabre o proprio emitido para andamento").
2. A franquia **já foi cobrada** e continua cobrada.
3. `/api/exame` ação `cancelar` só devolve a franquia se o exame estiver emitido
   (`src/lib/exame-admin.ts:181,278`) — com o status em `andamento`, cancelar não
   estorna nada.
4. `/api/corrigir-laudo` responde `nao_emitido` (409).
5. Sobra apagar o exame: destrói o registro **sem devolver o crédito**.
6. O próprio código do cliente reconhece e tenta se defender à mão em três lugares
   (`src/app/laudo/[id]/page.tsx:1206-1217` e `:298-304`,
   `src/app/laudo-texto/[id]/page.tsx:122-129`) — três guardas de tela para um buraco
   que é de regra. Guarda de tela não vale contra quem não usa a tela.

### Brinde do mesmo buraco: exame cancelado ressuscita

Hoje `updateDoc({ status: 'andamento' })` num exame **cancelado** também passa (a
regra só olha o valor NOVO). Quem segura isso é o cliente
(`src/app/laudo/[id]/page.tsx:302-304`: "Cancelado entra na lista porque salvar
gravaria `status:'andamento'` e ressuscitaria o exame na fila"). O desenho proposto
fecha isso de graça, na mesma linha.

---

## 3. Transições legítimas levantadas (grep tela por tela)

Varredura de **toda** escrita de exame vinda do navegador (`updateDoc`/`setDoc`/
`writeBatch.update`/`saveExame` em `src/`):

| Onde (arquivo:linha) | Operação | Escreve `status`? | Valor |
|---|---|---|---|
| `src/components/Worklist.tsx:302-317` (cadastro manual) | **create** via `saveExame` | sim | `'aguardando'` |
| `src/components/Worklist.tsx:275-287` (editar paciente na fila) | update em lote | **não** (`soAdministrativos`) | — |
| `src/app/laudo/[id]/page.tsx:1204-1222` `salvarLaudo()` | update | sim | `'andamento'` |
| ↳ chamadores: autosave 60s (`:498`) e "Salvar rascunho" (`:1376`) | | | ambos passam `'andamento'` — **`'rascunho'` é tipo aceito na assinatura mas nenhum chamador usa** |
| `src/app/laudo/[id]/page.tsx:441` (seleção de imagens do PDF) | update | não | — |
| `src/app/laudo/[id]/page.tsx:1292` (`reprocessarDicom`) | update | não | — |
| `src/app/laudo-texto/[id]/page.tsx:131-136` `handleSalvarRascunho()` | update | sim | `'andamento'` |
| `src/components/pacientes/EditarPacienteModal.tsx:89-108` | update em lote | não | — |
| `src/lib/firestore.ts:293-339` `saveExame()` | create/update genérico | default `'rascunho'` no create | **inalcançável**: o único create é o da Worklist, que sempre manda `'aguardando'` |
| `src/lib/firestore.ts:341-352` `emitExame()` | update | `'emitido'` | **código morto, zero chamadores** (E19) |
| `src/app/laudo/[id]/page.tsx:1563-1568` `handleDesbloquear()` | — | **não escreve nada** | só estado local (`setReedicaoAtiva`) |
| `src/components/Historico.tsx:183,210` (cancelar/apagar) | `fetch('/api/exame')` | servidor | — |
| `src/components/Worklist.tsx:341` (remover da fila) | `fetch('/api/exame')` | servidor | — |
| `src/app/laudo/[id]/page.tsx:1592` (corrigir laudo) | `fetch('/api/corrigir-laudo')` | servidor | — |
| 3 telas de emissão | `fetch('/api/emitir')` | servidor (`src/lib/emitir-admin.ts:346`) | `'emitido'` |

**Conclusão do levantamento — o cliente só precisa de duas coisas:**

1. **create** com `status: 'aguardando'` (cadastro na fila).
2. **update** escrevendo `status: 'andamento'` (médico abriu e salvou o laudo).

Tudo o mais (`emitido`, `cancelado`, `nao-realizado`, `transferido`) já é 100% servidor:
`/api/emitir` (`emitir-admin.ts:346`), `/api/exame` (`exame-admin.ts:278,320`),
cron de limpeza (`src/app/api/cron/cleanup-worklist/route.ts:54`), Feegow
(`src/lib/feegow-admin.ts:383,439`).

**Detalhe importante para o desenho — a ORIGEM tem que ficar aberta.** Existem exames
reais em produção com status legado `'imagens-recebidas'`/`'erro-imagens'`
(documentado em `src/components/Worklist.tsx:715-734` — casos EDWALDO e CARMEN), e
exames `'nao-realizado'` que o médico pode reabrir. Todos esses caem no botão
"▶ Continuar" → tela de laudo → `salvarLaudo('andamento')`. Uma lista fechada
(`aguardando|rascunho|andamento`) quebraria esses exames com "não consigo salvar" na
clínica. Por isso o desenho abaixo diz **"destino = `andamento`, origem = qualquer uma
menos `emitido` e `cancelado`"** em vez de enumerar origens.

---

## 4. A regra proposta (diff concreto de `firestore.rules`)

### 4.1 Helper novo (dentro de `match /exames/{exameId}`, antes dos `allow`)

```
        // ── `status` é campo de DONO ÚNICO do servidor (E10/E22, 30/08) ──
        // Emitir (/api/emitir), cancelar e transferir (/api/exame) mexem em
        // `status` JUNTO com franquia, ledger `consumo`, log e PDF. Pelo
        // navegador existe UMA transição legítima, levantada tela por tela
        // (ADR 30/08 §3): o médico abrindo/salvando o laudo, que grava
        // 'andamento' (salvarLaudo em laudo/[id]:1204 e handleSalvarRascunho
        // em laudo-texto/[id]:131). Todo o resto tem que chegar INTACTO.
        //  • fecha E10: o autor carimbava status:'emitido' pelo SDK — laudo
        //    com cara de assinado, sem PDF, sem log e sem franquia debitada
        //    (o gadget pronto era emitExame(), apagado no mesmo commit).
        //  • fecha E22: o autor reabria o próprio emitido para 'andamento' —
        //    limbo de billing (cancelar não estorna, corrigir dá 409, e só
        //    apagar resolve, destruindo sem devolver o crédito).
        //  • 'cancelado' vira terminal de verdade: hoje a regra só olha o
        //    valor NOVO, então update({status:'andamento'}) num cancelado
        //    ressuscitava o exame — só o cliente guardava disso
        //    (laudo/[id]:302-304).
        // A ORIGEM fica propositalmente aberta (qualquer status que não seja
        // emitido/cancelado) porque existem status legados em produção
        // ('imagens-recebidas'/'erro-imagens', Worklist.tsx:715-734) e
        // 'nao-realizado' do cron — todos abrem o laudo e salvam.
        function statusSoDoServidor() {
          return resource.data.get('status', '') != 'cancelado'
            && (intacto('status')
                || (request.resource.data.get('status', '') == 'andamento'
                    && resource.data.get('status', '') != 'emitido'));
        }
```

### 4.2 `allow update` — antes → depois

**ANTES** (`firestore.rules:204-215`):

```
        allow update: if request.resource.data.get('status', '') != 'cancelado'
                      && ((ehMedicoDeVerdade(uid()) && ehMedicoNoLocal(wsId)
                            && (!('medicoUid' in resource.data) || resource.data.medicoUid == uid())
                            && ('medicoUid' in resource.data ? intacto('medicoUid') : true))
                          || (alcancaLocal(wsId) && intacto('medicoUid')
                              && resource.data.get('status', '') != 'emitido'
                              && request.resource.data.get('status', '') != 'emitido'
                              && request.resource.data.diff(resource.data).affectedKeys().hasOnly(camposAdministrativos())));
```

**DEPOIS**:

```
        allow update: if statusSoDoServidor()
                      && ((ehMedicoDeVerdade(uid()) && ehMedicoNoLocal(wsId)
                            && (!('medicoUid' in resource.data) || resource.data.medicoUid == uid())
                            && ('medicoUid' in resource.data ? intacto('medicoUid') : true))
                          || (alcancaLocal(wsId) && intacto('medicoUid')
                              && resource.data.get('status', '') != 'emitido'
                              && request.resource.data.diff(resource.data).affectedKeys().hasOnly(camposAdministrativos())));
```

Três linhas mexidas:
- a guarda de topo `request... != 'cancelado'` vira `statusSoDoServidor()` (mais forte:
  também cobre o doc que **já está** cancelado);
- some `request.resource.data.get('status','') != 'emitido'` do segundo braço — virou
  redundante (ninguém mais escreve `'emitido'` pelo cliente, médico ou não). Os testes
  `regras.test.mjs:605` (recepção) e `:543` (gestor) continuam provando isso;
- fica `resource.data.get('status','') != 'emitido'` no segundo braço: continua sendo
  o que impede a recepção/dono de mexer no administrativo de um laudo **já assinado**
  (isso vai pela `/api/corrigir-laudo`).

**Resistência a `setDoc` sem merge:** coberta. Nesse caso `request.resource.data` só tem
os campos enviados; se `status` sumir, `intacto('status')` devolve `false` (mesma lógica
de `firestore.rules:77-81`) e o outro ramo exige `status == 'andamento'` explícito.

### 4.3 `allow create` — fechar o "nasce emitido"

Grep de quem cria exame hoje: **só** `saveExame` create, chamado **só** pela Worklist
(`Worklist.tsx:302`), sempre com `'aguardando'`. Nenhum caminho legítimo cria exame já
emitido pelo navegador — o servidor cria/emite pelo Admin SDK, que ignora regras. O
teste `regras.test.mjs:356` ("medico cria exame ja emitido — caminho legitimo") é
**sintético**: descreve uma permissão que nenhuma tela usa.

**ANTES** (`firestore.rules:177-179`):

```
        allow create: if alcancaLocal(wsId)
                      && (ehMedicoNoLocal(wsId)
                          || request.resource.data.get('status', '') != 'emitido')
```

**DEPOIS**:

```
        // Ninguém cria exame já carimbado como 'emitido' pelo navegador —
        // nem o médico (era o mesmo E10 pela porta do create: laudo com cara
        // de assinado sem PDF, sem log e sem franquia). Quem nasce emitido é
        // sempre o Admin SDK (/api/emitir), que ignora regras. Grep 30/08:
        // o único create do cliente é o cadastro da fila (Worklist.tsx:302),
        // sempre 'aguardando'.
        allow create: if alcancaLocal(wsId)
                      && request.resource.data.get('status', '') != 'emitido'
```

(o resto do `create`, linhas 180-189 — `medicoUid` e whitelist administrativa para
não-médico — fica intacto.)

**O que NÃO entra (Ponytail):** não vou proibir `create` com `'cancelado'` nem enumerar
os status válidos num `in [...]`. Criar exame cancelado não move dinheiro nem forja
assinatura; enumerar status quebraria os legados. Adicionar quando existir um caso real.

---

## 5. Whitelist do servidor (E14) — `dadosFinais`

Hoje (`src/lib/emitir-admin.ts:284,343-350`) o corpo cru do cliente entra inteiro no
update que assina o laudo; a única filtragem é o `reemissao`/`identificacaoAlterada`
que a onda 1 (M3) tirou. Ou seja: `pdfUrl` (o ponteiro do documento legal que o
paciente recebe), `pdfHtmlPath`, `acc`, `cpf`, `feegowAppointId`, `mwlStatus`,
`imagensSelecionadasPdf`, `criadoEm`, `versao` — tudo ainda passa. (`status`,
`emitidoEm`, `medicoUid` e `atualizadoEm` o servidor sobrescreve logo depois do spread,
`emitir-admin.ts:346-349`, então esses hoje não colam — mas dependem da **ordem** das
chaves no objeto, o que é frágil demais para ser a defesa.)

### 5.1 Lista ACEITA — nasceu do grep dos 3 clientes de produção

| Campo | Quem manda |
|---|---|
| `medidas` | `laudo/[id]:1436` (`coletarMedidas`) |
| `achados` | `laudo/[id]:1436` |
| `conclusoes` | `laudo/[id]:1436` |
| `laudoHtml` | `laudo/[id]:1442` |
| `laudoTextoHtml` | `laudo-texto/[id]:188` |
| `cfgSnapshot` | `laudo/[id]:1444`, `laudo-texto/[id]:192` |
| `tipoExame` | os 3 (`laudo/[id]:1450`, `laudo-texto:190`, `AnexarPdfModal:98`) |
| `pacienteNome` | os 3 (via `coletarIdentificacao` no motor) |
| `pacienteDtnasc` | `laudo/[id]` (`coletarIdentificacao`, `:1183`) |
| `dataExame` | `laudo/[id]` (`coletarIdentificacao`, `:1184`) |
| `convenio` | os 3 |
| `solicitante` | `laudo/[id]` (`coletarIdentificacao`, `:1186`) |
| `sexo` | `laudo/[id]` (`coletarIdentificacao`, `:1187`) |

São 13 campos e **é exatamente isso que sai dos 3 clientes hoje** — conferido em
`src/app/laudo/[id]/page.tsx:1435-1457`, `src/app/laudo-texto/[id]/page.tsx:187-197`,
`src/components/agenda/AnexarPdfModal.tsx:96-100`. O brief mencionava
`incluirImagensNoPdf`: **não existe** no corpo — a escolha de imagens vive em
`imagensSelecionadasPdf`, gravado à parte pelo próprio médico (`laudo/[id]:441`), e o
`incluirImagens` da emissão só decide o HTML do PDF, não vai no `dadosFinais`.

### 5.2 NUNCA aceitos (a whitelist já nega por construção; a lista é para a revisão)

`status`, `emitidoEm`, `medicoUid`, `atualizadoEm`, `criadoEm`, `id`, `versao`,
`pdfUrl`, `pdfErro`, `pdfHtmlPath`, `acc`, `cpf`, `pacienteId`, `feegowAppointId`,
`feegowPacienteId`, `mwlStatus`, `origem`, `horarioChegada`, `medicoExecutor`,
`canceladoEm`/`motivoCancelamento`, `reprocessarDicom`, `medidasDicom`,
`imagensSelecionadasPdf`, `motorNumeros` (é carimbo do servidor,
`api/emitir/route.ts:53-55`), `reemissao`, `identificacaoAlterada`.

### 5.3 Implementação (pós-OK) — `src/lib/emitir-admin.ts`

```ts
// E14: dadosFinais é corpo CRU do cliente e entrava inteiro no update que
// assina o laudo. Whitelist nascida do grep dos 3 clientes (ADR 30/08 §5).
// reemissao/identificacaoAlterada ficam de fora de propósito (M3): são
// carimbos de auditoria derivados no servidor — o auditado não os escreve.
const CAMPOS_DADOS_FINAIS = new Set([
  'medidas', 'achados', 'conclusoes', 'laudoHtml', 'laudoTextoHtml', 'cfgSnapshot',
  'tipoExame', 'pacienteNome', 'pacienteDtnasc', 'dataExame', 'convenio',
  'solicitante', 'sexo',
]);

// (dentro da transação, substituindo o destructuring de emitir-admin.ts:284)
const dadosFinaisSemCarimbo = Object.fromEntries(
  Object.entries(p.dadosFinais).filter(([k]) => CAMPOS_DADOS_FINAIS.has(k)),
);
```

Dois pontos que **não** mudam: a derivação de `reemissao`/`identificacaoAlterada`
continua lendo `p.dadosFinais` cru (`emitir-admin.ts:265-276`) — é assim que ela pega o
cliente mentindo; e `nomeArq` (`api/emitir/route.ts:83`) continua lendo
`tipoExame`/`pacienteNome`, ambos na whitelist.

Observação registrada (não é mudança): `solicitante` e `sexo` são aceitos mas **não**
entram em `CAMPOS_IDENTIDADE` (`emitir-admin.ts:93`), que carimba
`identificacaoAlterada`. É o comportamento de hoje e a Seção 5 decidiu assim —
identidade auditada = nome, nascimento, data do exame e convênio.

---

## 6. Mortos a deletar (E19) — prova de zero chamadores

Grep em todo o repo (excluindo `node_modules`, `legacy/` e docs):

| Função | Onde | Chamadores em `src/` |
|---|---|---|
| `emitExame` | `src/lib/firestore.ts:341-352` | **0** — só a própria definição |
| `consumirEmissao` | `src/lib/billing.ts:207-222` | **0** |
| `registrarConsumo` | `src/lib/billing.ts:294-310` | **0** |

As ocorrências restantes são: `legacy/prototipos/**` (protótipo HTML/JS antigo, que
chama as versões *dele*, não estas), `legacy/scripts-py/**` (geradores de diagrama) e
docs de plano — nenhuma importa de `src/`. A própria `firestore.rules:308-311` já
documenta que `registrarConsumo` é morto, e a remoção estava agendada desde o Plano 3
(`docs/decisoes/2026-08-09-secao1-contas-e-acesso.md:434`).

Some junto: o tipo `DadosConsumo` (`billing.ts:45`), usado **só** por
`registrarConsumo`. `checkEmissao` **fica** (tem chamador: `Worklist.tsx:505`).

Carona opcional, mesma linha, fora do escopo declarado da Task 11:
`checkWorkspaceLimit` (`billing.ts:233-253`) também está com zero chamadores. Digo o
que penso e deixo a decisão: apagar junto (1 função a menos) ou deixar para o Plano 3.

---

## 7. Plano de execução pós-OK

Tudo num **commit único** (regra de ouro: regra + código + teste com payload real):

1. **Teste primeiro (TDD).** Em `tests/rules/fixtures.mjs`, uma fixture nova com o
   payload REAL do `salvarLaudo` (`laudo/[id]:1221`):
   `payloadSalvarLaudo = { id, medidas, pacienteNome, pacienteDtnasc, dataExame,
   convenio, solicitante, sexo, status:'andamento', medicoUid, laudoHtml, atualizadoEm }`.
2. **`firestore.rules`**: helper `statusSoDoServidor()` + `allow update` + `allow create`
   (seção 4).
3. **`src/lib/emitir-admin.ts`**: whitelist (seção 5).
4. **Apagar** `emitExame`, `consumirEmissao`, `registrarConsumo`, `DadosConsumo`
   (seção 6).
5. **Bateria**: `npm run test:rules` + `test:api` + `test:unit` verdes.
6. Publicar a regra **junto do deploy da onda**, nunca antes do código.

### Testes de regra — o que muda e o que entra

| Teste | Hoje | Depois |
|---|---|---|
| `regras.test.mjs:356` "medico cria exame ja emitido (caminho legitimo)" | `assertSucceeds` | vira `assertFails` e renomeia: "ninguém cria exame já emitido — nem o médico" |
| `:494` "autor AINDA reabre o proprio emitido para andamento" | `assertSucceeds` | vira `assertFails` — é o E22 |
| `:540` "medico autor edita/reabre o proprio laudo emitido" | um `updateDoc` com `conclusoes` **+** `status:'andamento'` | quebra em dois: conteúdo com status intacto **passa**; a virada de status **falha** |
| **novo** | — | autor NÃO carimba `status:'emitido'` no próprio exame (E10) |
| **novo** | — | autor NÃO ressuscita exame cancelado para `'andamento'` |
| **novo** | — | médico salva o laudo com `payloadSalvarLaudo` num exame `aguardando` → **passa** (o dia a dia) |
| **novo** | — | médico salva com `payloadSalvarLaudo` num exame com status legado `'imagens-recebidas'` → **passa** (não quebrar EDWALDO/CARMEN) |
| `:631` "medico assume o orfao no primeiro save (payload real)" | passa | continua passando — é `aguardando → andamento` |
| `:203` "autor edita conclusoes de ex1 (emitido)" | passa | continua passando — `status` intacto |
| `:605` recepção não promove a `emitido` · `:543` gestor não marca `emitido` | passam | continuam passando (agora por `statusSoDoServidor`) |

Em `tests/api/emitir-idempotencia.test.mjs`, um teste novo: emitir com
`dadosFinais: { pdfUrl:'https://forjado', status:'x', medicoUid:'outro', acc:'FORJADO',
cpf:'000', pdfHtmlPath:'..' }` e assertar que **nada disso** encostou no doc do exame.
Os `dadosFinais` que os testes já usam (`:71` `{pacienteNome, tipoExame, convenio}`,
`:144` `{convenio}`, `:243` identidade) estão todos na whitelist — não quebram.

### Riscos de regressão e como os testes cobrem

| Risco | Cobertura |
|---|---|
| Médico não consegue mais salvar rascunho (fluxo mais usado da clínica) | teste com payload REAL do `salvarLaudo` em exame `aguardando` |
| Exame com status legado (`imagens-recebidas`) trava ao salvar | teste dedicado; e o desenho não enumera origens, justamente por isso |
| Recepção não consegue mais corrigir a fila | testes existentes da seção 14 (`:538`, `:603`, `:636`) não tocam `status` |
| Propagação de nome/CPF do `EditarPacienteModal` quebra | não manda `status` → `intacto('status')` → passa; coberto pelo `payloadEditarExame` existente |
| Whitelist derruba campo que alguma tela manda | a lista veio do grep dos 3 clientes, não de chute; teste de API com o payload real de cada um |
| Emissão para de funcionar | `test:api` inteiro (idempotência, replay, billing) roda antes do merge |

### Fora de escopo (registrado, não corrigido aqui)

Com `status` intacto, o médico-autor **continua** podendo reescrever o conteúdo
clínico (`conclusoes`, `medidas`) de um laudo já emitido pelo SDK, sem gerar PDF novo:
o documento legal (PDF) fica congelado e o doc no banco diverge. Isso é permitido de
propósito hoje (a reedição da tela depende disso) e é assunto de outro achado — não
misturo na Task 11.

---

## 8. Pergunta objetiva pro Sergio

Confirma este desenho para eu implementar (regra + código + teste no mesmo commit,
publicada junto do deploy da onda)?

- **`status` do exame passa a ser do servidor.** Pelo navegador só sobra "abri o laudo
  e salvei" (→ *em andamento*). **Emitir, reabrir um emitido, cancelar e ressuscitar
  um cancelado passam a ser exclusividade das rotas de servidor** — que é onde a
  franquia é cobrada/devolvida e o log é escrito. Nenhum botão do LEO faz isso hoje
  pelo navegador, então na clínica **nada muda**.
- **Ninguém mais cria exame já "emitido" pelo navegador, nem o médico** (hoje a regra
  deixa, e o teste `regras.test.mjs:356` chama isso de "caminho legítimo" — o grep
  mostrou que nenhuma tela usa; vira teste de proibição).
- **A rota `/api/emitir` passa a aceitar só 13 campos do pacote que a tela manda**
  (medidas, achados, conclusões, textos do laudo, identificação do paciente, convênio,
  solicitante, tipo de exame, snapshot da clínica) — **o endereço do PDF oficial, o
  ACC, o CPF e os carimbos de auditoria deixam de poder vir do navegador**. Junto vão
  para o lixo 3 funções mortas (`emitExame`, `consumirEmissao`, `registrarConsumo`),
  sendo a primeira o gadget pronto para o furo E10.
