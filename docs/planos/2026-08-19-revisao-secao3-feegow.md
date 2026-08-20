# Revisão da Seção 3 — Integração Feegow

**Data:** 19/08/2026 · **Status:** ✅ **FECHADA em 20/08/2026 — 22 de 22 achados corrigidos e NO AR.**

Plano executado: `docs/planos/2026-08-19-plano-correcao-secao3-feegow.md` (9 tasks + fechamento,
branch `feat/secao3-feegow`, merge master `0fb2191`). Regra publicada (ruleset `9ebfc2fc`),
índices deployados, deploy Vercel verificado (rota `/api/orthanc` respondendo 404 em produção).
Pendente da visita à clínica: atualizar o Wader (acumula Sub-plano 5 + esta fase) e SÓ DEPOIS
a limpeza dos campos antigos. ADR: `docs/decisoes/2026-08-20-correcao-secao3-feegow.md`.

**Método:** tríade em três óticas independentes, cada uma instruída a não repetir as
outras — corretude/casos de borda, arquitetura/fronteiras, e Ponytail (o que deletar).
Escopo: `src/app/api/feegow/route.ts`, `src/lib/feegow-admin.ts`, o caminho da
importação na `Worklist`, o carimbo "Atendido" na emissão, e o que a Seção 3 toca no
Wader (`worklist-sync`, `wl-writer`, `getProcedimentos`).

**Contexto:** a superfície de **segurança** desta rota foi endurecida em 18-19/08
(Sub-plano 5, Task 7): cabeçalhos arbitrários removidos, gate de papel em todas as
ações, 5 endpoints mortos deletados, fallback de token do `.env` removido. O que nunca
tinha sido varrido — e é o objeto desta revisão — é a **lógica clínica e de dados**: se
a integração traz o paciente certo, no dia certo, com o status certo.

Dois achados foram confirmados pelo controller no código antes de publicar esta lista
(os de nº 1 e 2).

---

## ONDA 1 — Corrompe dado de paciente (fazer primeiro)

### 1. [CRÍTICO] A importação apaga o CPF que a secretária corrigiu na mão
`src/lib/feegow-admin.ts:184-189`

`tx.set(..., { merge: true })` grava `cpf: c.cpf ?? ''`. O `merge` só preserva campo
**ausente** — string vazia é valor e sobrescreve. E `c.cpf` é sempre string: paciente
sem CPF no Feegow chega como `''` (`route.ts:144`).

**Cenário:** paciente sem CPF no Feegow é importado na segunda; a secretária digita o
CPF na ficha do LEO (é a chave que pareia a imagem do aparelho). Na quarta ele volta
para um Doppler → nova importação → `cpf: ''` por cima. A ficha perde o CPF, o exame
novo nasce sem CPF, e o Vivid passa a agrupar os estudos dessa pessoa sob **dois
PatientID diferentes**. Vale igual para nome corrigido e data de nascimento.

**Fix mínimo:** montar o payload só com o que veio preenchido —
`...(c.cpf ? { cpf: c.cpf } : {})` para cpf/nome/dtnasc/telefone/sexo. É a mesma defesa
`#7c` que a `Worklist.tsx:316` já usa.

### 2. [ALTO] O Wader calcula "hoje" em UTC e apaga a worklist do aparelho às 21h
`apps/wader/src/workers/worklist-sync.ts:46`

`new Date().toISOString().slice(0, 10)` — em Belém (UTC−3), às 21:00 o UTC já virou o
dia seguinte. `listarDoDia` devolve 0 exames, `idsElegiveis` fica vazio, e o passo 2 do
sync **remove todo `.wl` da pasta** (`worklist-sync.ts:107-116`).

**Cenário:** eco marcado para 21:30, paciente importado às 14h, `.wl` na pasta. Às 21:00
o worker roda e o exame some da worklist do Vivid. A recepção digita o ACC na mão.

É o mesmo bug de fuso de 22/06 que foi corrigido no LEO web e **nunca aplicado no
Wader**. A intenção correta já existe no próprio Wader:
`apps/wader/src/ui/api/reconciliacao.ts:17` usa `CLINIC_TZ = 'America/Belem'`.
`apps/wader/src/ui/api/agendamentos.ts:114` (`hojeIso`) tem o mesmo defeito.

**Fix mínimo:** trocar as duas ocorrências pelo `Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ })` que já existe em `reconciliacao.ts`.

### 3. [ALTO] Procedimento não mapeado faz o paciente sumir — e a tela afirma o oposto
`src/app/api/feegow/route.ts:127` + `src/components/Worklist.tsx:412`

`if (!procMap[ag.procedimento_id]) continue` descarta em silêncio, e `total` conta só os
que sobraram. Se a clínica cadastrar um procedimento novo no Feegow e ninguém mexer no
mapa, e ele for o único do dia, a tela diz **"Nenhum paciente aguardando no Feegow"** —
o oposto da verdade. A recepção conclui que a agenda está vazia.

**Fix mínimo:** contar os descartados e devolvê-los —
`{ total, criados, ignorados: [{procedimento_id, count}] }` — com a mensagem dizendo
"N agendamento(s) ignorado(s): procedimento não mapeado".

### 4. [ALTO] Erro em UM paciente o derruba da fila, sem log nem contagem
`src/app/api/feegow/route.ts:129-157`

São N+1 chamadas à API (uma por agendamento), cada uma com timeout de 10s, e o `catch`
é vazio. Um 500 transitório do Feegow ou um timeout, e aquele paciente não aparece —
a secretária vê "4 importados" quando eram 5 e não tem como saber.

Além disso, `if (pac)` só testa truthy: resposta em formato inesperado empurra o
candidato com `pacienteNome: ''`, e entra na fila **um exame sem nome de paciente**.

**Fix mínimo:** acumular as falhas e devolvê-las junto com o total; trocar `if (pac)`
por `if (pac?.nome)`.

### 5. [ALTO] O "Atendido" que volta ao Feegow pode falhar sem ninguém saber
`src/app/api/feegow/route.ts:213-219` + `src/app/laudo/[id]/page.tsx:682-691`

`res.ok` nunca é conferido — 401/500 do Feegow viram `{ ok: true }`. O chamador (o
motor, intocável) não olha status nem corpo, de propósito, para não travar a emissão.
Resultado: **não existe caminho pelo qual essa falha seja percebida** — nem alerta, nem
log, nem campo no exame.

**Cenário:** o token do Feegow é rotacionado e ninguém atualiza a gaveta. Todo laudo
emitido continua "Aguardando" no Feegow, e o faturamento fecha o mês com exames feitos
marcados como não atendidos.

**Fix mínimo:** a rota devolve 502 quando `!res.ok`, e grava `feegowStatusOk: false` no
exame — o mesmo padrão do `mwlStatus` que já existe. Não precisa mexer no motor.

### 6. [ALTO] `criar_mwl` manda o número errado e cria um estudo fantasma que casa com o exame
`src/app/api/orthanc/route.ts:125-135` + `apps/wader/src/workers/dicom-ingest.ts:211-227`

A rota grava `'AccessionNumber': exameId` em vez do `acc` — e o payload que a
`Worklist.tsx:415-424` envia **não inclui o `acc`** (o servidor nunca o devolveu ao
navegador). A rota faz `POST /tools/create-dicom`, criando um estudo real no Orthanc.
O worker de ingestão processa qualquer `StableStudy`, não acha pelo `acc`, e cai no
**fallback legado por doc id** (`dicom-ingest.ts:222`) — que casa.

Com o match, o exame vira `andamento` no instante da importação: o cronômetro de espera
da fila nunca aparece, e o `.wl` some se `andamento` não estiver entre os status
elegíveis.

A worklist de verdade **não vem daqui** — vem do `worklist-sync` do Wader lendo o
Firestore, que usa o `acc` corretamente (`wl-writer.ts:112-138`). Este é um segundo
caminho gravando a chave errada.

**Fix mínimo:** passar `acc` no payload e usar `'AccessionNumber': acc || exameId`. Mas
ver a Onda 3 — a pergunta melhor é se `criar_mwl` ainda tem razão de existir.

**Não verificado:** se `integracoes/orthanc` está ativo em produção na MedCardio. Se
estiver desativado, o efeito acima não ocorre, mas `mwlStatus` marca `'falhou'` em todo
exame importado e o indicador "SEM MWL" da fila mente na direção oposta.

---

## ONDA 2 — Integridade e continuidade dos dados

### 7. [MÉDIO] Reconciliação: quem faltou fica na fila, e quem remarcou nunca mais entra
`route.ts:115` (só busca `status_id=4`, nunca reconsulta) + `feegow-admin.ts:171`

É o item #6 do ADR de 16/05, marcado `⏳ futuro` e nunca feito. Tem duas metades, e a
segunda é a grave:

**(a) Dentro do dia** — paciente marcado "faltou" no Feegow às 9h continua `aguardando`
na fila e com `.wl` na pasta do aparelho até a meia-noite, quando o cron o vira
`nao-realizado`.

**(b) Reagendamento** — o doc id é `fg-{agendamento_id}` e a criação é `tx.create`. Se o
Feegow preserva o `agendamento_id` ao remarcar, o paciente remarcado para outro dia é
**silenciosamente pulado** na importação (o doc já existe, com a data velha), e a fila
filtra por `dataExame == hoje`. Ele fica invisível no dia em que o exame acontece, e
nenhum clique de importar resolve.

**Fix mínimo (b):** quando o doc já existe, ler e — se a data mudou — atualizar
`dataExame`/`horarioChegada`/`status` em vez de pular.
**Não verificado:** se o Feegow preserva o `agendamento_id` ao remarcar. **Confirmar com
o Sergio antes de implementar** — é a premissa inteira do achado.

### 8. [MÉDIO] Remover da fila apaga o documento — o paciente volta com ACC novo
`src/lib/exame-admin.ts:157`

A deduplicação é o próprio doc id, então apagar destrava a reimportação — e o exame
recriado ganha **ACC diferente**. Se o técnico já capturou imagens sob o ACC antigo,
elas chegam ao Orthanc sem exame correspondente: estudo órfão, vínculo manual.

Colateral confirmado: `apagarExame` não apaga a reserva em `accIndex`, deixando índice
órfão (inofensivo hoje, acumula).

**Fix mínimo:** apagar a reserva do `accIndex` junto; e, para exame de origem FEEGOW,
usar o caminho de *cancelar* (que mantém o doc) em vez de *apagar*.

### 9. [MÉDIO] A data de nascimento é remontada por posição, sem validação
`route.ts:134-137` e `274-277`

`split('-')` e inverte, assumindo cegamente `DD-MM-YYYY`. Se a API devolver ISO
(`1980-01-02`), o código produz `02-01-1980`. Isso vira `pacienteDtnasc`, vai para o
`.wl`, e **alimenta o cálculo de idade do laudo** — e os cortes da aorta na raiz são por
sexo e idade (WASE 2022). Data errada muda a classificação normal/ectasia. Se vier com
barras, o resultado é string vazia, sem aviso.

**Fix mínimo:** uma linha de guarda que detecta o formato ISO, e descartar o valor se
não casar `/^\d{4}-\d{2}-\d{2}$/`.

### 10. [MÉDIO] Ficha duplicada: nenhuma deduplicação por CPF
`feegow-admin.ts:180-182`

Paciente cadastrado à mão na fila e depois agendado pelo Feegow ganha uma **segunda
ficha** (`pacientes/fg-{id}`), cada uma com metade do histórico. A seção Pacientes lista
as duas.

**Fix mínimo:** se houver CPF, procurar `pacientes where cpf == c.cpf limit 1` e reusar
o ref antes de criar.

### 11. [MÉDIO] CPF nunca é validado, embora o validador já exista no repositório
`route.ts:144` e `284` — só `replace(/\D/g,'')`.

CPF digitado errado no Feegow (dígito trocado, ou o CPF de um familiar) entra no exame e
vira `PatientID` no `.wl` — o Vivid agrupa o estudo sob outra pessoa. `isValidCpf` já
existe em `apps/wader/src/ui/api/agendamentos.ts:118`.

**Fix mínimo:** aplicar a mesma checagem; CPF que não passa vira `''`, e o `.wl` cai no
fallback por `feegowPacienteId`, que é honesto.

### 12. [MÉDIO] `criadoEm` da ficha é reescrito a cada importação
`feegow-admin.ts:188` — todo paciente recorrente aparece como "cadastrado hoje".

### 13. [MÉDIO] Data e status do agendamento nunca são reconferidos
`route.ts:115-155` — o código confia 100% no filtro da query e carimba `dataExame: hoje`
em todo candidato, sem olhar `ag.data` nem `ag.status_id`. Se a API mudar a semântica
dos parâmetros, agendamentos de outros dias entram carimbados como de hoje.

**Fix mínimo:** `if (ag.status_id != 4) continue` e comparar `ag.data` com hoje.

---

## ONDA 3 — Fronteiras (arquitetura)

### 14. A única tradução Feegow→LEO está fora da camada testável
`route.ts:97-161` (`montarCandidatos`, 65 linhas)

O cabeçalho de `feegow-admin.ts:2-5` declara a regra da seção: *"a rota compõe; a lógica
vive aqui — testável no emulador"*. Cinco funções seguem. `montarCandidatos` — a função
**mais frágil** (depende de 6 nomes de campo do fornecedor, 2 formatos de data e um
`status_id` mágico) — ficou de fora, e é a única com **zero cobertura**. Se o Feegow
renomear um campo, isso aparece na clínica, não no `npm test`.

Nada por acaso: os achados 3, 4, 9, 11 e 13 vivem todos dentro dela.

**Menor movimento:** mover para `feegow-admin.ts` recebendo `fetchImpl: typeof fetch = fetch` — o padrão que `integracoes-admin.ts:36` já usa. Isso destrava testar os cinco
achados acima.

### 15. A quarta "duas listas que precisam concordar e nada obrigando"
`route.ts:65-69` (`PROC_MAP`) × `apps/wader/src/adapters/workspace-repo.ts:123-133` (`getAllAsDefault`)

Quando o mapa está vazio, o LEO e o Wader adivinham **coisas diferentes**: o LEO cai em
3 IDs chumbados — que são os IDs *da MedCardio* — e o Wader cai em "todos os tipos".
Para uma segunda clínica cujo procedimento 6 seja "Consulta", a importação traz
consultas como eco, sem erro nenhum.

**Menor movimento:** `resolverProcMap` devolve `{}` quando não há mapa, e a importação
responde `feegow_sem_procmap` (400) em vez de adivinhar. Mapa vazio é configuração
faltando, não default. `PROC_MAP` fica só como semente do `setup-dev.ts`, onde é honesto.

### 16. O vocabulário do Feegow chega ao navegador
`src/app/laudo/[id]/page.tsx:682-691` → `route.ts:207-219`

O `status_id: 3` (= "Atendido") é decidido num componente React; a rota só repassa, e não
confere que aquele agendamento pertence a um exame deste workspace. Efeitos: o
significado mora na UI; qualquer membro da clínica pode carimbar qualquer status em
qualquer agendamento da agenda dela por um POST direto; e não há onde registrar o
carimbo.

**Menor movimento:** trocar por `{ action: 'marcar_atendido', exameId }` — a rota lê o
`feegowAppointId` do exame e conhece o `3`. Fecha os três de uma vez, com diff menor que
o atual. *(Não exige tocar no motor além da linha do `body`.)*

### 17. O espelho `ortancAtivo` fechou de um lado só
`firestore.rules:109-110` × `integracoes-admin.ts:309-311`

A regra fechou `integracoes/{tipo}` com `allow write: if false` justamente para o espelho
não divergir — mas `workspaces/{wsId}.ortancAtivo` cai na regra genérica, e o dono pode
escrevê-lo pelo navegador. Custo hoje: **zero** (nenhum chamador faz isso). Custo amanhã:
a quinta repetição do mesmo erro, com o mesmo sintoma (o botão "Importar DICOM" some para
todos os médicos, sem erro).

**Menor movimento:** `&& intacto('ortancAtivo')` na regra de `workspaces` — mesma forma do
`intacto('contaId')` que já está lá — mais um teste. Duas linhas.

### 18. A configuração do Feegow se edita em duas telas
`integracoes/page.tsx:190-197` × `LocalModal.tsx:129-137`

Token e `procMap` moram em Integrações e são escritos pelo servidor; `profMap` (mapa de
médicos, lido pelo servidor em `route.ts:104-113`) ficou no Local de Trabalho e é escrito
pelo cliente. Pelo critério que a própria seção adotou — *onde mora a configuração de uma
integração* — é a metade que ficou de fora.

**Menor movimento:** `'profMap'` entra em `CAMPOS_CONFIG.feegow` e o editor migra para o
cartão Feegow, como já foi feito com o de procedimentos.

### 19. O contrato cliente↔rota é uma string sem tipo — e já cobrou
`src/components/laudo/SidebarLaudo.tsx:104-111`

A cirurgia na rota (commit `b2c7e00`) órfãou um chamador em outro arquivo, dentro da
própria revisão que endureceu a rota, e **nem o compilador nem os testes disseram nada**.
O recurso "conferir o nome atualizado no Feegow antes de desbloquear a identificação"
está morto em produção, em silêncio.

**Menor movimento:** exportar `type AcaoFeegow = 'buscar_cpf' | 'procedimentos' | 'profissionais'` e tipar os chamadores. Não muda runtime; faz o `tsc` gritar da próxima
vez. ~6 linhas. *(`SidebarLaudo.tsx` é intocável — o conserto do chamador em si é decisão
à parte.)*

---

## ONDA 4 — Cortes Ponytail

| # | Local | Corte |
|---|---|---|
| 20 | `route.ts:147,149,150,154` | 4 campos calculados a cada importação e **descartados**: `convenioId`, `procedimentoId`, `profissionalId`, `origem`. O tipo `Candidato` nem os declara; `gravarImportacao` grava seu próprio `origem` fixo. Zero chamadores (grep no repo inteiro). |
| 21 | `01-migrar.mjs:58` | `integracoes/feegow.ativo` é escrito uma vez e **nunca lido** — `CAMPOS_CONFIG.feegow` só permite `procMap`, e nenhum código consulta o campo. Confirmar com o Sergio se não há plano de um liga/desliga do Feegow. |
| 22 | `route.ts:133-137` × `273-277` | A normalização de `dtnasc` e `sexo` é o mesmo bloco escrito duas vezes no mesmo arquivo. Vale extrair **junto com o achado 9**, não sozinho. |

### O que parece supérfluo e NÃO é (proteger de limpeza futura)

- Os scripts `01-migrar` / `02-limpar`: a limpeza ainda não rodou; são o caminho oficial da virada.
- `TipoIntegracao` duplicado entre `integracoes.ts` e `integracoes-admin.ts`: duplicação deliberada e documentada (restrição do `node --test`).
- `getProcedimentos` do Wader duplicando `resolverProcMap`: são dois runtimes separados, sem módulo compartilhável.
- `feegowProfMap` no `LocalModal`: um escritor, um leitor — não é dual-owner (mas ver achado 18).

### A forma da rota está CERTA — não quebrar em quatro

`/api/feegow` com `action` despachando parece um "God route", mas ganhou a propriedade
que importa: **o gate roda incondicionalmente antes do `switch`, sem receber `action`**.
Uma ação nova nasce protegida por construção, e não há lista para esquecer — foi
exatamente uma lista esquecida que produziu o furo do `debug_sala`. Rotas separadas
replicariam o gate em cada arquivo. **Vale um comentário no topo do arquivo** dizendo
isso, para ninguém "melhorar" depois.

---

## O que a tríade verificou e está CORRETO

- **Idempotência da importação:** `fg-{agendamento_id}` + `tx.create` (não check-then-write). Duas máquinas importando ao mesmo tempo produzem exatamente um exame. Coberto por teste real no emulador.
- **Geração de ACC:** distintos por candidato dentro do lote, reserva na mesma transação do exame, formato dentro do limite DICOM, com teste.
- **Fuso no LEO web:** `America/Belem` na importação, no filtro da fila e no cron. Importar às 23h50 traz o dia certo. O bug de 22/06 está de fato fechado **no web** — o problema é só no Wader (achado 2).
- **Id externo não vira caminho do Firestore:** `/^\d+$/` em `feegowAppointId` e `feegowPacienteId`, com teste.
- **`undefined` não derruba a escrita:** todo campo opcional tem `?? ''`, com teste. *(É justamente isso que causa o achado 1 — a defesa está certa, o efeito colateral é que string vazia sobrescreve.)*
- **Falha parcial não perde a worklist do aparelho:** a worklist de verdade vem do `worklist-sync` lendo o Firestore por conta própria.
- **O "Atendido" vai para o agendamento certo:** usa o `feegowAppointId` do próprio exame; exame manual não dispara; reemitir é idempotente. O defeito do achado 5 é só a falha silenciosa.
- **Cancelar exame registra a divergência com o Feegow** no log — decisão consciente.
- **Dois exames do mesmo paciente no mesmo dia** (eco + carótidas): dois exames, dois ACCs, uma ficha. Correto.
- **Segurança (endurecida em 18-19/08):** gate por construção, segredo na gaveta, sem fallback para o lugar antigo, guard de esquema onde a URL é usada.

## Premissas — RESOLVIDAS em 19/08 (consulta à API real + confirmação do Sergio)

### 1. O Feegow preserva o `agendamento_id` ao remarcar? **SIM — provado.**
Agendamento **66890** estava em 03/08 quando o LEO o importou; hoje o Feegow diz 17/08,
**mesmo número**. O achado 7b é real.

**Por que ainda não deu sintoma:** dos 205 exames Feegow da MedCardio, só **23** usam a
identidade `fg-{id}` (entrou em 15/08, Sub-plano 2); **182** têm id antigo aleatório e
não travam nada. O 66890 apareceu normal na fila em 17/08 porque o registro antigo dele
não bloqueou. **A partir de agora morde.**

**SOLUÇÃO ESCOLHIDA (Sergio, 19/08):** a identidade passa a ser
**`fg-{agendamento_id}-{dataExame}`**.

| Situação | Hoje | Com a mudança |
|---|---|---|
| Importar duas vezes no mesmo dia | não duplica ✅ | não duplica ✅ |
| Dois computadores importando juntos | não duplica ✅ | não duplica ✅ |
| Paciente remarca para outro dia | **sumido da fila** ❌ | entra normal ✅ |

A trava sempre serviu para impedir o mesmo exame **do mesmo dia** entrar duas vezes —
nunca precisou impedir o mesmo agendamento em **dias diferentes**, que são dois exames de
verdade. Os dados confirmam: o paciente do 66890 aparece corretamente como uma falta
(03/08, `nao-realizado`) e um exame emitido (17/08). Sem migração — vale só para
importações novas.

*Descartado:* reaproveitar o exame antigo mudando a data — apagaria a falta do histórico
e criaria o caso "e se já foi laudado".

### 2. `integracoes/orthanc` está ativo na MedCardio? **SIM — verificado.**
Logo, é a metade do **estudo fantasma** do achado 6 que acontece hoje: o exame vira
`andamento` no instante da importação e o cronômetro de espera nunca aparece na fila.

### 3. O filtro de data da API é honrado? **SIM — testado.**
Pedir um dia devolve só aquele dia (`data_start`/`data_end` respeitados). O achado 13
permanece como **defesa**, não como bug ativo.

### 4. Há plano de liga/desliga do Feegow na tela? **SIM (Sergio).**
Logo o achado 21 se inverte: `integracoes/feegow.ativo` **não** é apagado — ganha o
liga/desliga no cartão Feegow, igual ao do Orthanc, e passa a ser lido.

### 5. Pendente: o endereço `localhost` do Orthanc
`integracoes/orthanc.url` do Grupo MedCardio é `http://localhost:8042`; o `wader-dev` é
que tem o IP da rede (`192.168.15.27:8042`). Copiado verbatim do campo antigo pela
migração. Correto se o Wader roda na mesma máquina do Orthanc — **confirmar com o
Sergio**.

---

## Achado extra, aparecido durante a investigação (resolvido)

Treze exames de maio têm `dataExame` = 16/05 mas foram criados no LEO em 11-12/05, e o
Feegow confirma 11-12/05. **Explicação do Sergio, confirmada no código:** foram laudados
em data posterior à realização. O motor carrega o campo como
`exame.dataExame || dataLocalHoje()` (`src/app/laudo/[id]/page.tsx:424`) — em maio a
importação ainda não gravava data, então abrir para laudar dias depois trazia o dia do
laudo, e salvar gravava aquilo.

Hoje a importação sempre grava a data, então o caminho só sobra para exame que chegue
**sem** data. Não é bug ativo; é o histórico desses treze exames que ficou com a data do
laudo em vez da data da realização.

## Zumbis 291 e 303 — efeito real, menor que o esperado

Confirmado: eles vivem em `integracoes/feegow.procMap`, não no mapa embutido. Para a
**importação** são inofensivos — nenhum agendamento carrega um `procedimento_id` que não
existe mais, então o filtro nunca os alcança. O efeito é no Wader:
`workspace-repo.ts:127` faz `new Set(Object.values(procMap))`, então o tipo de exame para
o qual eles apontam aparece na lista de procedimentos oferecidos mesmo que a clínica não
o faça mais.

---

**Total: 22 achados** — 1 crítico, 5 altos, 7 médios, 6 de fronteira, 3 de corte.
