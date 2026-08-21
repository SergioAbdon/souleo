# Revisão da Seção 4 — Wader / DICOM / Orthanc

**Data:** 20/08/2026 · **Status:** 🔎 Achados consolidados — aguardando decisões do Sergio.

**Método:** tríade em três óticas independentes, cada uma instruída a não repetir as
outras — corretude/casos de borda (Opus), arquitetura/fronteiras (Opus) e Ponytail
(o que deletar, Sonnet). Escopo: a **lógica de ingestão** — o caminho da imagem do
aparelho até o laudo: `dicom-ingest.ts` (casamento por ACC), parser do SR +
`dicom-sr-mapping.ts`, `acc-recovery-worker.ts`, `worklist-sync.ts`/`wl-writer.ts`,
`exames-repo.ts`, `orthanc-client.ts`, e o consumo no laudo web
(`exame.medidasDicom`, botão Importar DICOM).

**Contexto:** a superfície de segurança/fronteira desta seção foi endurecida no
Sub-plano 5 e na Seção 3 (corte nuvem-Orthanc, batimento, mwlStatus, hojeClinica).
O que nunca tinha sido varrido — e é o objeto desta revisão — é se a imagem e a
medida chegam **no exame certo, do paciente certo, com o valor certo**.

**Urgência logística:** há uma atualização do Wader PENDENTE na máquina da clínica.
Todo conserto de Wader desta lista deve entrar ANTES da visita, para pegar a mesma
atualização. Os achados de lado web (Vercel) não têm essa restrição.

Quatro achados foram encontrados **independentemente por dois revisores** (3, 7, 21,
26 — deduplicados abaixo). Os achados 1 e 3 foram confirmados pelo controller no
código antes de publicar esta lista.

**Fato novo que muda um registro antigo:** a suspeita de 12/05 ("códigos LOINC
errados no adaptador-motor.js") apontava para o arquivo errado. O
`src/motor/adaptador-motor.js` é **código morto** (banner DEPRECATED de 16/05,
zero imports ativos — confirmado por dois revisores via grep). Os LOINC errados
dele não chegam ao laudo. O defeito real está no substituto vivo,
`src/lib/dicom-sr-mapping.ts` — achados 1 e 2.

---

## ONDA 1 — Dado clínico errado no laudo (fazer primeiro)

### 1. [CRÍTICO] Exame antigo importa medidas em cm como se fossem mm (erro de 10×)
`src/lib/dicom-sr-mapping.ts:173` — **lado web**

O ramo legado do `normalizarParaImport` chama `converter(valor, '', map.alvo)` —
unidade vazia de propósito — e `converter()` trata unidade vazia como "já está na
unidade alvo". Só que o schema antigo é exatamente o dos exames **pré-15/05/2026**,
quando o Vivid mandava **cm e m/s** (documentado no próprio arquivo, linhas 40-42;
o parser da época gravava `Record<codigo, number>` sem unidade). O único caso em
que a conversão é indispensável é o único em que ela é desligada.

O que entra no motor num exame legado típico: raiz aórtica 3,3 cm → **3 mm**;
AE 3,9 → **4**; DDVE 5,3 → **5**; septo 0,9 → **1**; PP 0,9 → **1**; DSVE 3,4 →
**3**; Ao asc 3,4 → **3**; onda E 0,63 m/s → **1 cm/s**; e' septal 0,024 m/s →
**0**. As razões (E/A, E/e', AE vol index) importam certas — mistura de valores
certos e errados, o pior caso para a detecção humana.

**Cenário:** o Dr. Sérgio reabre o eco do Manoel (feito em maio, schema antigo)
para corrigir a conclusão. O botão mostra "📡 Importar (12)", o modal lista tudo já
marcado com rótulo "mm" ao lado, ele confirma. Massa de VE ≈ 0 g, Teichholz sem
sentido, E/e' 26,8 com e' 0. Os 9 campos errados vão pro PDF assinado se ele não
conferir um a um.

**Fix mínimo (decisão do Sergio — ver D1):** (a) assumir cm/m·s no ramo legado
(`converter(valor, map.alvo === 'mm' ? 'cm' : 'm/s', map.alvo)`), ou (b) — mais
honesto, dado o achado 2 — **não importar schema antigo**: devolver `[]` e
reprocessar o estudo no Wader (o parser novo grava unidade e grupo corretos).
Teste com o `medidasDicom` real do Manoel fixa o contrato.

### 2. [CRÍTICO] No schema antigo, `M-02550` cai no Átrio Esquerdo — mas pode ser o diâmetro de outra estrutura
`src/lib/dicom-sr-mapping.ts:169-174` — **lado web**

`M-02550` é "Diameter" genérico do SNOMED e aparece em vários Measurement Groups
(LA, LV, AO, MV — ADR de 13/05, §12.1). O parser antigo fazia
`medidas[codeValue] = v` sem guarda: cada grupo **sobrescrevia** o anterior, então
o `M-02550` que sobrou no Firestore é o do **último** grupo do SR — que pode ser
aorta ou anel mitral. O ramo legado acha 1 só chave terminando em `_M-02550`
(`LA_M-02550`), considera "não-ambíguo" e joga no b8 (Átrio esquerdo). Unicidade
da **chave** confundida com unicidade da **medida**.

**Cenário:** exame legado em que o Vivid fechou o SR com o grupo da aorta por
último → "Átrio esquerdo: 34" que é a aorta ascendente. Valor plausível,
invisível, e o motor conclui "átrio esquerdo normal" sobre um dado de outra
estrutura.

**Fix mínimo:** o mesmo do achado 1 — no schema antigo, não importar (a opção (b)
de D1 resolve os dois de uma vez). Alternativa cirúrgica: excluir os códigos
SNOMED genéricos do ramo legado, mantendo só LOINC específicos.

### 3. [CRÍTICO] O casamento estudo↔exame usa só o ACC — nunca confere se o paciente do DICOM é o paciente do exame
`apps/wader/src/workers/dicom-ingest.ts:211-228` — **Wader** · achado pelos DOIS revisores Opus

O estudo traz `PatientMainDicomTags.PatientID` (= CPF, posto lá pelo próprio
`.wl` — `wl-writer.ts:124`) e `PatientName`; o exame traz `cpf`/`pacienteNome`.
Nada é comparado: o match é `where('acc','==',forma).limit(1)`, sem filtro de
data, mais o fallback legado por doc id. Três caminhos levam ao ACC errado:
(a) técnica seleciona a linha errada na worklist do Vivid (dois eco_tt seguidos);
(b) ACC digitado à mão com um dígito trocado que **coincide** com o ACC de outro
exame — inclusive de outro dia; (c) unicidade parcial: `saveExame`
(`src/lib/firestore.ts:310-326`) só confere duplicidade dentro do mesmo
`dataExame` e não registra em `accIndex` — o espaço de nomes do caminho manual e
do Feegow não é o mesmo.

**Cenário:** a recepção cadastra a Sra. Maria (`EX20082609153341`) e o Sr. José
(`EX20082609153347`). A operadora digita o ACC do José à mão no Vivid e erra o
último dígito para 41. As imagens e o **SR com as medidas do José** entram no
exame da Maria. A médica abre, vê "📡 Importar (12)", importa. Laudo da Maria
emitido com o coração do José; o exame do José fica órfão sem imagem. O
`PatientName` do DICOM dizia "JOSE" o tempo todo — ninguém leu.

**Fix mínimo:** no caminho automático (não no `exameIdOverride`, que é o vínculo
consciente), quando `study.PatientID` e `exameData.cpf` estiverem **ambos**
preenchidos e `digitos()` deles diferirem: não gravar, logar, devolver
`matched:false` com motivo — cai na lista de órfãos da reconciliação. ~6 linhas,
reusa `digitos()` de `lib/acc.ts`, não bloqueia nada quando falta CPF.

### 4. [CRÍTICO] O vínculo manual não persiste — o worker automático desfaz, e o dono anterior nunca é limpo
`apps/wader/src/workers/dicom-ingest.ts:194-206` · `apps/wader/src/ui/api/reconciliacao.ts:80-90` — **Wader**

`exameIdOverride` é parâmetro de uma chamada, não estado: depois do vínculo
manual, `dicomOrthancStudyId` fica no exame, mas o caminho automático **nunca lê
esse campo** — resolve só por ACC. E nada limpa o exame que tinha o estudo antes.

**Cenário A (desfaz):** operadora vincula o órfão ao exame certo às 10h00; às
10h05 chegam mais 2 imagens do mesmo estudo → novo `StableStudy` → reprocesso SEM
override → casa pelo ACC (ou vira órfão de novo) e o exame certo para de receber
imagem. **Cenário B (dois donos):** estudo casou errado no exame A às 9h;
operadora vincula ao B às 11h. O A continua com `dicomStudyUid`, `imagensDicom`,
`medidasDicom` e status `andamento` — dois exames exibindo o mesmo estudo.

**Fix mínimo:** antes do match por ACC,
`where('dicomOrthancStudyId','==',orthancStudyId).limit(1)` — se achar, o vínculo
manual vence o ACC. E no ramo `exameIdOverride`, com a mesma query, limpar os
campos DICOM do dono anterior quando for outro doc.
**Nota:** `/api/reconciliacao*` não tem NENHUMA página que a chame (admin.html e
reception.html só chamam `/api/dicom/*` e `/api/worklist/*`) — hoje recuperar
órfão exige curl; na prática, a clínica não recupera. Ver D3.

### 5. [CRÍTICO] O console do Wader edita `acc` por fora da reserva de unicidade (`accIndex`)
`apps/wader/src/ui/api/reconciliacao.ts:11-14,100-124` — **Wader**

O lado web trata `acc` como chave reservada (`feegow-admin.ts:351,392` cria
`accIndex/{acc}` em transação; `exame-admin.ts:164` apaga a reserva junto com o
exame). O Wader escreve com Service Account, por cima das regras, e `acc` está na
whitelist do `editar-exame` — sem reservar o novo, sem liberar o antigo, sem
checar duplicidade.

**Cenário:** para "consertar o match", a operadora copia para o exame o ACC que
aparece no estudo do Orthanc — que é o ACC de outro exame do mesmo dia. Dois
exames com o mesmo `acc`; `limit(1)` passa a devolver um dos dois **sem ordem
definida** — cada reprocesso pode escolher outro. `accIndex/{antigo}` fica órfã, e
na exclusão o web apaga a reserva do ACC atual, não a antiga.

**Fix mínimo:** no `editar-exame`, quando vier `campos.acc`: rejeitar (409) se já
existir outro exame com esse `acc`; trocar em `batch` — `create` de
`accIndex/{novo}` + `delete` de `accIndex/{antigo}` + `update` do exame. Mesmo
padrão do `feegow-admin`, ~15 linhas.

### 6. [CRÍTICO] Exame criado na recepção do console local nasce sem `acc` e sem `cpf` — órfão garantido
`apps/wader/src/adapters/exames-repo.ts:70-89` · `apps/wader/src/workers/wl-writer.ts:117,124` — **Wader**

`criarManual` (POST `/api/agendamentos` da reception.html — o caminho de
contingência quando o LEO/Feegow cai) não grava `acc` nem `cpf`, ao contrário dos
outros dois criadores da mesma entidade. O `.wl` sai com
`AccessionNumber = doc id` (20 chars — o VR SH do DICOM aceita 16; o comentário
na linha 116 já admite "Vivid trunca/rejeita") e `PatientID = doc id` em vez do
CPF.

**Cenário:** internet oscila, a recepção cadastra pelo console do Wader. O estudo
volta com ACC truncado → `candidatos()` não casa → órfão permanente; a
ACC-recovery nem tenta (exige `typeof acc === 'string'`). E as imagens ficam
agrupadas no aparelho sob um ID que não é o CPF — quebra a chave paciente↔imagem
de todo exame futuro dessa pessoa.

**Fix mínimo:** `criarManual` grava `acc` (gerar como `feegow-admin.ts:27` gera)
e `cpf: paciente.cpf`. Se o achado 5 for feito, reservar `accIndex/{acc}` no
mesmo batch.

---

## ONDA 2 — Exame some ou o fluxo da clínica trava (ALTOS)

### 7. [ALTO] O `.wl` nunca é regravado quando o exame muda — o aparelho congela no estado da criação
`apps/wader/src/workers/worklist-sync.ts:84-108` — **Wader** · achado pelos DOIS revisores Opus

A sincronização decide por **presença de arquivo**, nunca por conteúdo. Correção
de nome, CPF, horário, tipo de exame feita DEPOIS do `.wl` escrito nunca chega ao
Vivid — e o Vivid **queima o nome errado nos pixels** das imagens que voltam.
Pior: corrigir o ACC pelo console (o "conserto" do match) não regrava o `.wl`, o
aparelho continua carimbando o ACC velho e o match continua falhando.

**Cenário:** 07h40 recepção cadastra com CPF do marido; 08h05 corrige no LEO;
08h20 o Vivid puxa a worklist com o dado velho — nome errado nos JPGs do laudo e
`PatientID` errado no Orthanc, permanentes.

**Fix mínimo:** gravar um `wlHash` (hash dos campos que entram no dataset) e
regravar o `.wl` quando o hash divergir (comparar bytes não dá: `gerarWlBuffer`
sorteia UIDs a cada chamada). Alternativa mais simples: comparar
`mtime` do arquivo com `exame.atualizadoEm`.

### 8. [ALTO] O recovery por ACC pode dar "recuperado" processando o exame de OUTRO paciente — e desiste do alvo para sempre
`apps/wader/src/workers/acc-recovery-worker.ts:121-143` · `adapters/orthanc-client.ts:148-156` — **Wader**

A busca é wildcard nos dois lados (`*{digitos}*`), e os estudos achados vão para
`processarEstudo` **sem `exameIdOverride`** — que re-resolve pelo ACC do estudo,
podendo casar com outro exame. `if (result.matched) { recuperados++; break; }`
conta sucesso sem verificar `result.exameIdNoLeo === e.id`.

**Cenário:** o exame do Antônio (`...334`) está sem imagem. Existe um estudo com
ACC digitado com um dígito a mais (`...3341`, da Maria). O wildcard casa, o
estudo entra na Maria, `recuperados++`, break — e isso se repete a cada tick. O
painel diz "recuperado" enquanto o Antônio segue sem imagem para sempre.

**Fix mínimo:** passar `exameIdOverride: e.id` (a intenção é explícita), ou
trocar o teste por `result.exameIdNoLeo === e.id`. Duas linhas.

### 9. [ALTO] Uma instance que falha de forma permanente prende o estudo em reprocessamento infinito
`apps/wader/src/workers/dicom-ingest-worker.ts:140,165-170` · `workers/ingest-state.ts:120` — **Wader**

A assinatura grava `nImg` = imagens que **subiram**; `precisaProcessar` compara
com `curImg` = total de instances não-SR. Instance que falha sempre (preview 415
em série não-imagem, instance corrompida, cine loop que estoura o timeout de
10 s) → `curImg > nImg` para sempre → reprocesso completo a cada 30 s, sem
contador de tentativas nem backoff: re-upload de todas as imagens boas, rewrite
de `imagensDicom` no Firestore, indefinidamente.

**Fix mínimo:** guardar `nImgTentadas = processadas + falhadas` e comparar
`curImg > nImgTentadas`. Uma linha em cada arquivo; o retry legítimo (imagem
nova) continua.

### 10. [ALTO] `lastSeq` aponta para a sequência interna do Orthanc e ninguém valida que ela ainda faz sentido
`apps/wader/src/workers/dicom-ingest-worker.ts:103-104,185` · `workers/ingest-state.ts:83-88` — **Wader**

Orthanc reinstalado ou restaurado de backup → a sequência recomeça do zero. O
Wader volta com `lastSeq = 5200`, o Orthanc está em 40: o feed devolve vazio para
sempre — nenhum estudo novo é ingerido — e o cartão de Integrações continua verde
(o `/system` responde). O sintoma chega como "as imagens pararam de aparecer".

**Fix mínimo:** no tick, `if (changes.Last < store.getLastSeq()) { log.warn;
store.reset(); }`. Três linhas; `resetCursor()` já existe.

### 11. [ALTO] Nada impede nem detecta dois Waders no mesmo workspace — e o batimento esconde o segundo
`apps/wader/src/adapters/heartbeat.ts:37-46` · `index.ts:84-96` — **Wader**

Duas máquinas com a mesma Service Account e o mesmo `wsId` (cenário real:
notebook + PC da clínica) rodam dois conjuntos completos de workers. O batimento
escreve o mesmo doc com `merge` — o segundo sobrescreve `maquina`/`visto` do
primeiro e o cartão fica verde.

**Cenário:** Wader aberto no notebook "para testar" com o config da clínica: o
sync escreve `.wl` numa pasta que o Orthanc da clínica não lê, mas marca
`mwlStatus:'ok'` em todos os exames do dia — a fila do LEO jura que a MWL está ok
enquanto o aparelho não vê ninguém. Os dois ingests disputam os mesmos estudos,
cada um com seu `lastSeq`.

**Fix mínimo:** o batimento lê o doc antes de escrever; se `maquina` ≠
`os.hostname()` e `visto` < ~10 min, grava `conflito: <hostname>` + warn; o
cartão mostra "2 Waders ativos". ~8 linhas, sem lock distribuído.

### 12. [ALTO] Caminho da imagem é posicional (`{seq}.jpg`) mas servido como imutável por 1 ano
`apps/wader/src/adapters/storage-uploader.ts:37,48` · `workers/dicom-ingest.ts:99,325` — **Wader**

`seq` é índice posicional, não identidade — mas o objeto sobe com
`cacheControl: max-age=31536000`. Reprocesso com ordem de séries diferente troca
o conteúdo de `003.jpg` na mesma URL: o navegador do médico mostra a imagem
antiga do cache por 1 ano; outro médico vê outra coisa na mesma posição. E
reprocesso com menos imagens deixa `.jpg` órfãos públicos no bucket.

**Fix mínimo:** path `dicom/{wsId}/{exameId}/{orthancInstanceId}.jpg` (o id já
está em mãos). O nome vira conteúdo, o cache longo fica verdadeiro, o reprocesso
vira upsert idempotente. `seq` continua só ordenando o array.

### 13. [ALTO] Três instâncias independentes de `OrthancClient`/`WorkspaceRepo`, cada uma com cache próprio de 5 min
`apps/wader/src/ui/api/dicom.ts:27-28` · `ui/api/orthanc-config.ts:19` · `index.ts:87-88` — **Wader**

O admin troca a senha do Orthanc no LEO; `POST /config/refresh` invalida o cache
de uma instância que **nenhum worker usa**; `GET /api/dicom/test` (terceira
instância) diz "conectado" enquanto o ingest bate no endereço velho por até
5 min — o diagnóstico do console e o comportamento real discordam.

**Fix mínimo:** passar `orthancClient`/`workspaceRepo` do `index.ts` via
`UiServerExtras` — a plumbing já existe para a reconciliação (`server.ts:62`).

### 14. [ALTO] Falha de ingestão não deixa rastro no Firestore — o erro só existe na tela local que ninguém abre
`apps/wader/src/workers/dicom-ingest.ts:344-352` · `workers/dicom-ingest-worker.ts:155-181` — **Wader**

`result.errors` morre em memória (últimos 20) e no log local. Storage devolvendo
403 (chave rotacionada): etapa 1 grava medidas e status `andamento`, as 9 imagens
falham, o botão de imagens fica "aguarde Wader processar" — para sempre (não há
novo StableStudy, e a ACC-recovery exige `status=='aguardando'`, que já avançou).

**Fix mínimo:** quando `todasFalharam || semInstances`, gravar
`dicomUltimoErro`/`dicomUltimoErroEm` no doc do exame e `ultimoErroIngest` no
batimento — a fila do LEO e o cartão passam a dizer a verdade sem canal novo.

### 15. [ALTO] Varreduras de coleção inteira no caminho quente — o custo cresce com o histórico, não com o dia
`apps/wader/src/workers/acc-recovery-worker.ts:90-107` · `ui/api/reconciliacao.ts:143-153` — **Wader**

A ACC-recovery roda a cada 20 s um `where('status','==','aguardando').get()` SEM
limite e filtra em memória — mas `aguardando` acumula (todo exame que o cron da
meia-noite não pegou). ~500 encalhados × 4.320 ticks/dia = 2,2 M leituras/dia
para pescar 1 exame; o sintoma chega como conta do Firestore. A reconciliação
faz 5 `get()` de coleção inteira por carregamento. O índice composto
`status + dataExame` **já existe** no `firestore.indexes.json`.

**Fix mínimo:** `.where('status','==','aguardando').where('dataExame','>=',cutoff).limit(25)`;
na reconciliação, `where('dataExame','==',data)`.

---

## ONDA 3 — Mentiras na tela e zonas sem rede (MÉDIOS)

### 16. [MÉDIO] `detectarGrupo` resolve empate pela ordem das chaves e cai em `general` no silêncio
`apps/wader/src/adapters/dicom-sr-parser.ts:152-158` — **Wader**

Empate de votos vence para o grupo declarado antes (`>` estrito sobre
`Object.keys`); grupo sem nenhuma palavra-chave vira `general` e a chave
`general_18015-8` não existe na whitelist — a medida **some do modal sem aviso**.
Atualização de firmware/preset do Vivid que mude os CodeMeanings ("Ao Root" sem
"aortic") faz a raiz aórtica sumir da importação e ninguém percebe que a
integração regrediu.

**Fix mínimo:** desempate explícito (empate = `general`) + `log.warn` quando uma
medida cair em `general_*` com `codeValue` que existe na whitelist sob outro
grupo.

### 17. [MÉDIO] Unidade ausente é tratada como "já está certo" também no schema novo
`apps/wader/src/adapters/dicom-sr-parser.ts:190-199` · `src/lib/dicom-sr-mapping.ts:79-92` — **ambos**

Se o valor vem de `NumericValue` sem `MeasuredValueSequence`, `unit` fica `''` e
`converter()` devolve o valor cru — 3,71 (cm) importa como "4 mm" num exame novo,
sem o aviso de "schema antigo" para orientar a suspeita.

**Fix mínimo:** unidade vazia/desconhecida em campo com `alvo !== ''` = medida
não-importável (fora do modal). E uma tabela de testes para `converter()` —
`dicom-sr-mapping.ts` hoje não tem NENHUM teste, sendo o último código entre o
aparelho e o laudo assinado.

### 18. [MÉDIO] Exame já emitido tem `medidasDicom` e `imagensDicom` sobrescritos — a Trava 2 protege o status, não o conteúdo
`apps/wader/src/workers/dicom-ingest.ts:244-246,298-306,337-342` — **Wader**

Reenvio do estudo depois do laudo emitido: `medidasDicom` trocado por baixo de um
PDF assinado (sem registro do que havia), e `imagensDicom` substituído por apenas
as imagens que deram certo NESTA passada — 3 timeouts e a galeria cai de 9 para
6 imagens num exame emitido.

**Fix mínimo (decisão do Sergio — ver D4):** em exame `emitido`, gravar em
campos-sombra (`medidasDicomPendente`) em vez de sobrescrever; na etapa 2,
mesclar por `orthancInstanceId` em vez de substituir o array.

### 19. [MÉDIO] `medidasDicom` é contrato entre dois apps sem versão de parser nem validação de faixa
`apps/wader/src/adapters/dicom-sr-parser.ts:135-159` · `src/lib/dicom-sr-mapping.ts:45-66` — **ambos**

A chave `{grupo}_{code}` nasce de uma votação por maioria no Wader e é consumida
por whitelist no web, deployados separadamente; `medidasDicomMeta` não guarda a
versão do parser — quando o parser for corrigido, não há como saber quais exames
gravados foram afetados. E não existe faixa de plausibilidade: é o único ponto do
pipeline onde um valor clinicamente absurdo passa sem guard.

**Fix mínimo:** (a) `medidasDicomMeta.parserVersao` (constante no parser);
(b) `min`/`max` por campo em `SR_TO_MOTOR` (ex.: b7 15–60 mm) e descartar o que
cair fora em vez de oferecer para importar.

### 20. [MÉDIO] Imagem de paciente é pública para sempre e não existe caminho de remoção
`apps/wader/src/adapters/storage-uploader.ts:44,70` — **Wader + web**

`predefinedAcl: 'publicRead'` põe a única cópia de PHI fora do perímetro de
autenticação (proteção = sigilo da URL). E `removerImagensExame` não tem NENHUM
chamador: apagar o exame deixa as imagens no bucket, públicas, sem referência —
sem inventário e sem expiração.

**Fix mínimo:** chamar `removerImagensExame` no caminho de exclusão do exame
(lado web, Admin SDK). O `publicRead` em si é decisão de produto — ver D5.

### 21. [MÉDIO] `mwlStatus` só é escrito na criação do `.wl` — o selo "SEM MWL" mente nos dois sentidos
`apps/wader/src/workers/worklist-sync.ts:91-108` — **Wader** · achado pelos DOIS revisores Opus

Wader reinicia com os `.wl` do dia na pasta → tudo cai em `wlsIntactos` → quem
não tinha `mwlStatus` fica "SEM MWL" na fila com o arquivo funcionando (a
recepção reage a alarme falso, apaga e recria o exame — e aí quebra o match de
verdade). No outro sentido: `.wl` removido (emitido, reagendado, meia-noite) →
`mwlStatus:'ok'` para sempre.

**Fix mínimo:** no ramo intactos, gravar `'ok'` quando o valor atual divergir;
no laço de remoção, `FieldValue.delete()` do campo.

### 22. [MÉDIO] `POST /api/worklist/sync {data}` apaga a worklist do dia inteiro
`apps/wader/src/ui/api/worklist.ts:25-32` · `workers/worklist-sync.ts:111-122` — **Wader**

O `data` chega direto ao sync, e a fase 2 remove todo `.wl` que não pertença aos
elegíveis DAQUELA data. Chamar com a data de amanhã ("conferir a agenda") apaga
os `.wl` de hoje no meio do expediente; o worker só reconstrói 60 s depois — e
nesse vão a técnica digita o ACC à mão, que é a origem dos achados 3 e 8.

**Fix mínimo:** só executar a remoção quando `dataAlvo === hojeClinica()`.

### 23. [MÉDIO] A reconciliação cruza a agenda de UMA data com os 80 estudos mais recentes do Orthanc, sem filtro
`apps/wader/src/ui/api/reconciliacao.ts:160` · `adapters/orthanc-client.ts:162-169` — **Wader**

`listStudies(80)` com `Query: {}`. Reconciliação de anteontem: os estudos do dia
já não estão entre os 80 → "0 órfãos" com os exames `aguardando` — conclusão
invertida. Com ~40 estudos/dia o horizonte útil é ~2 dias.

**Fix mínimo:** `Query: { StudyDate: data.replace(/-/g,'') }` quando houver data.

### 24. [MÉDIO] O laudo lê `medidasDicom` UMA vez — o botão fica cinza para sempre, contrariando o próprio tooltip
`src/app/laudo/[id]/page.tsx:117-121` (consumo em `SidebarLaudo.tsx:187-211`) — **⚠️ MOTOR/INTOCÁVEL — task própria**

`getExame().then(setExame)` — chamada única, sem `onSnapshot`. O médico abre o
laudo com o paciente na maca; o Wader entrega as medidas 40 s depois (a etapa 1
existe para isso); o botão continua cinza com o tooltip "aguarde Wader processar"
— e nada reavalia. A otimização de latência do ADR 2026-06-22 é perdida na última
perna. Agravante: o botão inteiro fica atrás de `ortancAtivo` — desligar o
Orthanc em manutenção esconde medidas JÁ entregues (decisão de produto, D6).

**Fix (task própria, arquivo intocável):** `onSnapshot` no doc do exame no
`page.tsx`. Corrigir JUNTO com o 25 (senão o 25 vira bug ativo).

### 25. [MÉDIO] O modal de import remarca todas as caixas se o laudo re-renderizar com o modal aberto
`src/components/laudo/DicomSrImport.tsx:41-45` + `page.tsx:1198` — **⚠️ laudo/** — mesma task do 24**

`inputs={getInputsImportaveis()}` é array novo a cada render e o
`useEffect(...,[open, inputs])` compara por identidade → re-render com o modal
aberto remarca tudo, inclusive a medida que o médico desmarcou por estar errada.
Hoje é bomba armada (não achei caminho garantido de re-render); o fix do 24
(`onSnapshot`) a detona — os dois têm que sair juntos.

**Fix mínimo:** dependência `[open]` ou `useMemo` no pai.

---

## ONDA 4 — Robustez e higiene (BAIXOS)

### 26. [BAIXO] O recovery calcula a janela de dias em UTC — a mesma classe do bug das 21h, num arquivo esquecido
`apps/wader/src/workers/acc-recovery-worker.ts:78-83` — **Wader** · achado pelos DOIS revisores Opus

`new Date().toISOString().slice(0,10)` — o padrão que o `clinica-tempo.ts` foi
criado para eliminar. Efeito pequeno (janela de 4 dias encolhe após as 21h), mas
é o último vazamento da fonte única de "hoje". **Fix:** derivar de
`hojeClinica()`.

### 27. [BAIXO] `horaHHMMParaDicom` troca só o primeiro `:` — `HH:MM:SS` gera TM DICOM inválido
`apps/wader/src/workers/wl-writer.ts:214-218` — **Wader**

`"14:30:00"` → `"1430:0000"`. A rota do Wader valida `HH:MM`, mas o campo é
editável pela web sem validação equivalente — um único registro ruim pode fazer o
Vivid rejeitar o `.wl`. **Fix:** `hhmm.replace(/:/g,'').padEnd(6,'0').slice(0,6)`.

### 28. [BAIXO] Os logs do ingest chamam o ACC de `exameId` — inclusive vazio no vínculo manual
`apps/wader/src/workers/dicom-ingest.ts:308,321,356` — **Wader**

`log.info({ exameId: accession })`; no override, `accession` é `''`. Auditar um
exame com medidas erradas pelo log da clínica fica impossível justo no caminho
mais propenso a erro humano. **Fix:** `{ exameId, acc: accession }`.

### 29. [BAIXO] `/version` devolve `0.1.0` fixo — duas fontes de verdade para a versão do Wader
`apps/wader/src/ui/server.ts:77-80` — **Wader**

Na visita, o suporte confere `/version`, lê "0.1.0 — F1 Esqueleto" e decide
reinstalar com base em dado errado; o batimento publica a versão real do
`package.json`. **Fix:** `/version` usa a mesma função do batimento. (Vale
entrar: é exatamente o check da visita à clínica.)

---

## PONYTAIL — O que deletar (com prova de call-sites)

- **P1.** `src/motor/adaptador-motor.js` (293 linhas) + `legacy/motores/adaptador-motor.js`
  (cópia idêntica sem o banner) — DEPRECATED desde 16/05, zero imports ativos
  (grep: só docs e um script Python legado). **É o arquivo da suspeita de 12/05 —
  apagar fecha aquele registro.**
- **P2.** `apps/wader/src/lib/acc.ts:21` — `accIgual()`: zero call-sites.
- **P3.** `apps/wader/src/adapters/orthanc-client.ts:175` — `getStudyInstances()`:
  zero chamadores reais (só shape de mock).
- **P4.** `apps/wader/src/adapters/orthanc-client.ts:217` — `getInstanceFile()`:
  zero call-sites.
- **P5.** `apps/wader/src/service/windows-service.ts` (54 linhas) — placeholder
  nunca importado; os 5 métodos só logam "não implementado".
- **P6.** `apps/wader/src/config/types.ts:29,36,85,88-91` — `activatedAt`,
  `TelemetryConfig`, `showTrayIcon`: nenhum código lê. Config especulativa.
- **P7.** [SIMPLIFICAR] `apps/wader/src/types/exame.ts:31-40` — `MedidaSr`
  duplicado dentro do próprio Wader; re-exportar de `dicom-sr-parser.ts` elimina
  o risco de divergência silenciosa. (Obs.: a duplicação Wader↔web continua por
  falta de pacote compartilhado — registrada no achado 19.)

---

## Decisões que são do Sergio

- **D1 (achados 1+2):** exame com schema antigo (pré-15/05): (a) converter
  assumindo cm/m·s, ou (b) **não importar** — botão orienta a reprocessar no
  Wader, que grava o schema novo com unidade e grupo certos. A tríade recomenda
  (b): elimina os DOIS críticos de uma vez e sem adivinhação; os ~exames legados
  reprocessam sob demanda.
- **D2 (achado 3):** divergência CPF do DICOM × CPF do exame: bloquear o match e
  mandar para a reconciliação (recomendado), ou só alertar e gravar assim mesmo?
- **D3 (achado 4-nota):** a reconciliação não tem tela — hoje o vínculo manual só
  existe por curl. Entra nesta correção uma tela mínima no console do Wader
  (listar órfãos + botão vincular), ou fica para depois?
- **D4 (achado 18):** exame emitido que recebe estudo reprocessado: campos-sombra
  + aviso na fila (recomendado), ou manter sobrescrita?
- **D5 (achado 20):** imagens `publicRead` — nesta onda só ligamos a remoção na
  exclusão do exame; a migração para URL assinada é mudança de produto. Registrar
  o `publicRead` como decisão consciente ou agendar a migração?
- **D6 (achados 24+25):** são no Motor/laudo (intocáveis) — task própria com
  aprovação explícita, na mesma esteira ou em sessão separada? E o gate
  `ortancAtivo` do botão: deve esconder medidas já entregues?
- **D7 (Ponytail):** autorizar os 7 cortes? (P1 fecha a suspeita de 12/05.)

## O que a tríade verificou e está CERTO (não re-varrer)

- **Corte nuvem↔Orthanc real:** zero fetch do web para o Orthanc; `.wl` tem
  escritor único (`wl-writer.ts`).
- **Escritor único dos campos DICOM** (`medidasDicom`, `imagensDicom`,
  `dicomStudyUid`, `dicomOrthancStudyId`): só o Wader grava; o web lê.
- **Trava 2 de status** correta nos 4 estados e testada; falha de imagem não
  regride o trabalho do médico.
- **Guarda contra re-parse vazio** (`usaNovoSr`): SR transitório não apaga medida
  boa; testada.
- **Cursor do ingest:** avança só depois da página processada; persistência
  atômica (tmp+rename); crash reprocessa; `processarEstudo` idempotente por
  sobrescrita. (Ressalva: validade do cursor = achado 10.)
- **`candidatos()`/`digitos()`:** fazem o que prometem, bounded (≤3 formas);
  dígito trocado que NÃO coincide com outro exame cai como órfão (seguro).
- **`hojeClinica()`** com teste do caso 21h30 — o bug das 21h está morto no
  worklist-sync (o resíduo é o achado 26).
- **Sanitização do `.wl`:** ASCII/ISO_IR 100 em todos os campos texto, PN
  consistente com a decisão de 09/05, fallbacks Type 2 corretos, hierarquia de
  PatientID como documentado; `orderBy('horarioChegada')` não dropa exames Feegow
  (campo sempre gravado, mesmo vazio).
- **Cliente Orthanc:** timeout com AbortController em tudo, credencial nunca em
  erro/log (teste dedicado), `findStudiesByAccession('')` → `[]`.
- **Segredo write-only:** "ativo sem credencial" tratado como não-ativo;
  heartbeat redige user/pass antes de publicar erro.
- **SR_TO_MOTOR (schema novo) confere com o motor real:** rótulos e campos batem
  com `docs/motor-tsmigracao/01-inventario-inputs.md`; alvos de unidade e casas
  coerentes com os valores reais do `teste-adapter-sr.ts` (E 63, E/e' 26,8,
  e' 2,4 — fecha). Modal exige confirmação, mostra valor+unidade, permite
  desmarcar; `String(s.valor)` + eventos com bubbles é o que o motor espera.
- **Pool de imagens:** cursor `next++` seguro em single-thread, ordem
  determinística, filtro `Modality !== 'SR'` na mesma unidade do `curImg`.
- **Suíte 41/41.** Zona SEM rede de teste: `dicom-sr-parser`, `worklist-sync`,
  `wl-writer`, `acc.ts`, `acc-recovery-worker`, `dicom-sr-mapping` — os achados
  1, 2, 16 e 17 vivem todos aí.
- **Ponytail — já está mínimo:** workers/repos/cliente Orthanc sem camadas
  supérfluas; `dcmjs` é dependência legítima; validações inline do tamanho do
  problema; `clinica-tempo` usa Intl nativo.

## ADENDO 20/08 — Veredito da tríade sobre a proposta do Sergio "excluir estudo p/ reenvio"

Proposta do operador: na tela de conferência, ação que apaga o estudo do Orthanc,
limpa o exame e permite reenviar do Vivid (corrigido) para ingestão limpa.

**Placar: Ponytail CONCORDA C/ RESSALVAS · Corretude CONCORDA C/ RESSALVAS ·
Arquitetura DISCORDA da forma (DELETE puro) e CONCORDA como QUARENTENA.**

Consenso dos três: a ação é legítima e não-redundante (só ela resolve conteúdo
errado/pixels; o "trocar vínculo" resolve ponteiro errado e continua sendo a
1ª opção), mas NUNCA como DELETE simples. Forma aprovada pela tríade:

- **QUARENTENA, não exclusão:** `GET /studies/{id}/archive` → ZIP em
  `backup.path/quarentena/` → verificar → só então remover. Falhou o arquivo,
  não remove. (Isso faz o `backup.path` virar verdade — ver achado 30.)
- **Ordem fixa e travada:** marcar estudo "em exclusão" (guarda em memória que o
  ingest confere antes de CADA update — mata a corrida da gravação-fantasma) →
  limpar TODOS os donos e TODOS os 8 campos (constante única compartilhada com o
  escritor) + `removerImagensExame` + status→`aguardando` → DELETE (timeout
  próprio, 404=sucesso) → `deleteSignature(studyId)` na instância VIVA do store
  (nunca `resetCursor`, nunca segunda instância) → só então instruir o reenvio.
- **Recusas:** exame `emitido` (vai pro fluxo corrigir-laudo com snapshot),
  409 em `WADER_UI_ONLY`, e aviso em `rascunho` (medidas já importadas no laudo
  não são removidas).
- **Quem/onde:** fora da reception.html. Disparo pelo LEO web (autenticado, gate
  por papel) gravando comando em `workspaces/{ws}/comandosWader/`; o Wader puxa e
  executa (preserva o corte nuvem↔Orthanc). Auditoria append-only em
  `workspaces/{ws}/auditoria` com retrato do que foi removido (regras no mesmo
  commit, teste com payload real), breadcrumb na timeline do exame, contador de
  exclusões no cartão de Integrações.
- **Pré-requisitos duros:** achados 3 (bloqueio por CPF) e 12 (path por
  `orthancInstanceId`) ANTES ou JUNTO — sem o 3 a ação não converge (loop com
  perda a cada volta), sem o 12 a imagem errada continua aparecendo do cache.
- **Válvula de escape:** botão "reprocessar estudo" na mesma tela (endpoint
  `POST /api/dicom/import/:id` já existe, falta a UI).
- **Onda B (só se doer depois):** avaliar `POST /studies/{id}/modify` (corrige
  etiqueta preservando pixels, sem tocar no Vivid) e `OverwriteInstances:true`.

### 30. [ALTO] O backup do DICOM cru NÃO EXISTE — config validada sem nenhum código
`apps/wader/src/config/types.ts:66-69` · `config/load.ts:94-96` · `docs/wader/00-arquitetura.md:39`

A doc promete "OneDrive = backup do DICOM cru", o config valida `backup.path`
como obrigatório — e NENHUMA linha escreve um byte lá (grep confirmado por dois
revisores). O Orthanc local é a ÚNICA cópia do dado clínico primário (o LEO só
tem JPGs de preview; o SR cru é parseado e descartado). Qualquer raciocínio "tem
backup" é pelo documento, não pelo sistema. **Fix:** a quarentena acima estreia o
uso; avaliar backup periódico real (ou remover a promessa da doc e o campo).

### Extensão do achado 11 (registrada pela arquitetura)
A credencial do Orthanc vem do FIRESTORE (`workspace-repo`), não do config local
— qualquer Wader com o `wsId` da clínica (notebook, instância DEV/UI-only)
alcança o Orthanc da clínica. Qualquer poder novo do console (ex.: a quarentena)
precisa disso resolvido/gateado antes.

### Refinamento do achado 8 — DECIDIDO pelo Sergio 20/08: régua (i) ESTRITA
O robô de recuperação vira SUGERIDOR. Só entra sozinho o casamento 100%: ACC
exato (formas do `candidatos()`) + CPF conferindo (D2). Tudo que for por
semelhança — e todo exame sem ACC — vai para a tela de conferência como
sugestão, e a vinculação é MANUAL pelo operador. O contador "recuperados" passa
a contar só entradas automáticas verdadeiras.

### Adições à tela de conferência (D3, decididas no 1-a-1 com o Sergio)
Listar também estudos JÁ vinculados (ação "trocar vínculo"); sugestões de
candidato por CPF/nome/data; rastro de quem/quando vinculou; aviso pós-reenvio
"confira as imagens antes de emitir" (comportamento do T8 re-render vs. pixel
queimado: teste de 2 min agendado para a visita); ação de quarentena conforme
acima.

## Sequência proposta (após decisões)

1. Spec em `docs/superpowers/specs/` + plano em `docs/planos/` (esteira
   subagent-driven-development, branch nova da master).
2. **Ordem por urgência logística:** primeiro tudo que é binário do Wader
   (achados 3-15, 16-18 lado Wader, 21-23, 26-29, P2-P7) — precisa estar na
   MESMA atualização que a visita à clínica vai instalar. Depois o lado web
   (1, 2, 17-parte, 19-parte, 20, 24, 25, P1), que deploya pela Vercel a
   qualquer momento.
3. Tríade final de verificação adversarial + ADR + Obsidian + memória + placar.
