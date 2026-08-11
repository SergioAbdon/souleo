# 2026-08-09 — Seção 1: reestruturação de contas, acesso e regras do Firestore

> **Status:** ✅ Design aprovado pelo Dr. Sérgio (09/08/2026). Implementação não iniciada.
> **Dono:** Claude do notebook. **Decidido com:** Dr. Sérgio.
> **Ler antes de mexer em:** `src/contexts/AuthContext.tsx`, `src/app/login/page.tsx`,
> `src/lib/firestore.ts` (blocos profissionais/empresas/workspaces/vinculos),
> `src/lib/billing.ts`, `src/components/LocalModal.tsx`, e QUALQUER regra do Firestore.
> **⚠️ Claude da clínica:** a Fase 6 é sua, mas só depois das Fases 1-5. Ver §7.

---

## 1. Contexto

"Seção 1" = cadastro, contas e acesso. Revisão feita com a **tríade** (Codex para bugs,
Ruflo para arquitetura, Ponytail para o que não construir). O motor da reestruturação,
escolhido pelo Dr. Sérgio, é **arrumar a fundação (modelo de dados)** — não telas novas.

### 1.1 Achado que define a prioridade — as regras do Firestore

- **Não há `firestore.rules` no repositório.** `firebase.json` declara apenas
  `firestore.indexes.json` e `storage.rules` → `firebase deploy` **nunca** publicou
  regra de Firestore a partir deste repo.
- Existe um `firestore.rules` de 05/04/2026 **fora** do repo
  (`C:\Users\sergi\Desktop\LEO\firestore.rules`) e uma cópia divergente em
  `legacy/scripts-py/firestore.rules`, que o `legacy/README.md` chama de "antigo".
- **Não se sabe se alguma está publicada.** Verificar no console é a Fase 0.
- **09/08/2026:** o arquivo foi trazido para a **raiz do repo** (`firestore.rules`) e
  declarado em `firebase.json`. ⚠️ **NÃO deployar** com esse conteúdo antes das Fases 0 e 5
  — publicar a regra de abril pode substituir uma regra melhor que esteja no ar. O
  cabeçalho do arquivo repete esse aviso.

O que essa regra antiga faz, se estiver no ar:

| Ponto | Avaliação |
|---|---|
| Impede o usuário de setar `superadmin` em si mesmo (L57-58) | ✅ fecha o crítico nº1 do Codex |
| `workspaces/{id}/exames` e `/pacientes`: `allow read, write: if isAuth()` | ❌ **qualquer logado de qualquer clínica lê/escreve exames e pacientes de todas as outras**. O comentário admite: "regra relaxada para não bloquear" |
| `profissionais`: `allow list: if isAuth()` | ❌ qualquer logado lista todos os profissionais, com CPF |
| `subscriptions`: `allow update: if isAuth()` | ❌ qualquer logado altera a própria franquia |
| `temPapel()` / `existeVinculoQuery()` | ❌ stubs: retornam só `isSuperAdmin()` |
| Referencia subcoleções inexistentes (`worklist`, `rascunhos`, `laudos`, `branding`) | Regra da era v3 |

Ela **já procurava o vínculo em `uid + '_' + wsId`** — o id composto que este design adota.
A ideia estava certa desde abril; o app é que nunca gravou o vínculo nesse formato.

### 1.2 Correções à tríade (não repetir os erros)

- Ruflo disse "franquia sem transação". **Falso no caminho real:**
  `src/app/api/emitir/route.ts:55` usa `runTransaction` do Admin SDK. O check-then-act
  existe só no helper client-side, que não consome franquia.
- Ruflo disse que o token do Feegow trafega pelo cliente. **Parcial:** `/api/feegow`
  já resolve o token no servidor; o furo é o campo morar no documento que o navegador lê
  e a rota ainda aceitar `x-feegow-token`.
- Claude (eu) disse "o Wader não é tocado". **Errado:** `apps/wader/src/adapters/workspace-repo.ts:69-79`
  lê `ortancUrl`/`ortancUser`/`ortancPass` do documento do workspace. Mover os segredos
  exige 3 linhas no Wader + deploy na clínica (Fase 6).

---

## 2. Decisões

| # | Decisão |
|---|---|
| D1 | **PF e PJ convivem desde o começo.** Um médico pode ter conta própria e ser membro de uma clínica |
| D2 | **Laudo:** só o médico autor edita. A conta pode **apagar, cancelar e transferir**. Toda ação deixa log |
| D3 | **Recepção:** cadastra paciente/exame, importa Feegow, vê worklist e andamento, imprime/entrega PDF. **Não** vê financeiro/extrato nem segredos |
| D4 | **Local** é escolhido ao entrar (contexto de sessão), não por exame |
| D5 | **Caminho A — camada acima.** `workspaces` continua sendo o *local*; nasce `contas` por cima. Nenhum exame ou paciente muda de lugar |
| D6 | **Uma franquia por conta**, somando todos os locais — coerente com a precificação aprovada em 11-12/04/2026 (PF paga por local extra; PJ tem locais ilimitados e cobra por usuário adicional) |
| D7 | Dentro de uma conta, **todo médico vê a fila toda e lê qualquer laudo; edita só os seus**. "Fila toda" = dos locais a que o vínculo dá acesso (ver `locais` em §3): lista vazia = todos os locais da conta; lista preenchida = só aqueles. Vale para todos os papéis |
| D8 | **Cancelar devolve o laudo à franquia.** Transferir → o novo médico consome de novo. Saldo justo: 1 laudo por exame. Abuso vigiado pelo log |
| D9 | **Fase 6 (segredos + Wader) é do Claude da clínica**, só após as Fases 1-5 |

⚠️ Divergência anotada (fora do escopo): a memória registra PF Profissional R$189,99/350
laudos e Expert 500; o código (`src/lib/billing.ts`) tem R$199,99 e 600. O código é o que
está no ar. Decidir depois.

---

## 3. Modelo de dados alvo

```
CONTA (quem paga — PF ou PJ)
 ├── LOCAL (= workspaces de hoje: timbre, endereço, logo) → exames, pacientes
 ├── MEMBRO (vinculos: papel + locais que acessa)
 └── ASSINATURA (doc id = id da conta)
```

| Coleção | Mudança |
|---|---|
| `contas` | **Nova.** `tipo` PF/PJ, `nome`, CPF/CNPJ, `ownerUid`, `status` |
| `workspaces` | **Continua sendo o LOCAL, com o mesmo nome no banco** (o Wader lê esse caminho — não renomear). Ganha `contaId`. Na UI passa a se chamar "Local" |
| `workspaces/{id}/privado/integracoes` | **Nova subcoleção.** `feegowToken`, `ortancUrl`, `ortancUser`, `ortancPass`. Nunca lida pelo cliente |
| `vinculos` | Aponta para a **conta**; id determinístico **`{contaId}_{uid}`**; ganha `papel` ('dono'\|'medico'\|'recepcao') e `locais: string[]`. Perde `profissionalId` (duplicata de `medicoUid`) |
| `subscriptions` | **doc id = contaId** — mata a duplicata de assinatura por construção |
| `exames`, `pacientes` | **Nada muda.** Nem um documento sai do lugar |

**Por que o id determinístico:** regras do Firestore não fazem query, só `get()` por
endereço exato. Sem `vinculos/{contaId}_{uid}` nenhuma regra de papel é possível.

---

## 4. Papéis e permissões

| Ação | Dono | Médico | Recepção |
|---|:--:|:--:|:--:|
| Ver worklist e andamento | ✅ | ✅ | ✅ |
| Cadastrar paciente/exame · importar Feegow | ✅ | ✅ | ✅ |
| Imprimir / reenviar PDF pronto | ✅ | ✅ | ✅ |
| Ler laudo de qualquer médico da conta | ✅ | ✅ | ❌ |
| Editar conteúdo do laudo | só se médico **e** autor | só os seus | ❌ |
| Emitir (assinar) | só se médico | só os seus | ❌ |
| Corrigir convênio/solicitante em emitido | ✅ | só os seus | ❌ |
| Apagar rascunho / exame não emitido | ✅ | só os seus | ❌ |
| Apagar laudo emitido | ✅ | ❌ | ❌ |
| Cancelar laudo emitido | ✅ | só os seus | ❌ |
| Transferir exame para outro médico | ✅ | só os seus | ❌ |
| Ver extrato / honorários | ✅ | só os seus | ❌ |
| Editar o local (timbre, endereço, logo) | ✅ | ❌ | ❌ |
| Configurar Feegow / Orthanc | ✅ (grava, nunca lê de volta) | ❌ | ❌ |
| Convidar / remover membros | ✅ | ❌ | ❌ |
| Trocar plano, pagar | ✅ | ❌ | ❌ |

Dono **não** ganha direito de assinar laudo: se não for médico, não emite.
Superadmin/Direx continua fora deste modelo.

### Onde cada regra é cobrada

| Camada | Papel | É fechadura? |
|---|---|---|
| `firestore.rules` | pertence à conta · é autor do laudo · segredo não sai pelo cliente | **Sim** |
| Rotas server (Admin SDK) | signup, emitir, transferir, cancelar, apagar (transação + log) | **Sim** |
| UI | esconder botão | **Não** |

### As três ações sobre laudo emitido

| Ação | Efeito |
|---|---|
| **Cancelar** | Marca `cancelado` (motivo, autor, data). PDF antigo deixa de ser servido. **Devolve 1 à franquia** (D8) |
| **Transferir** | Exame passa a outro médico, que revisa e emite com a assinatura dele; o laudo anterior fica cancelado no histórico |
| **Apagar** | Sai da base. Deixa **uma linha em `logs`**: quem, quando, qual paciente |

---

## 5. Fluxos que mudam

1. **Criar conta** → rota `/api/signup` (Admin SDK, `writeBatch`): ou nasce inteiro ou não
   nasce. Permite a regra **proibir o navegador** de criar conta/vínculo/assinatura.
   Fecha 4 achados do Codex de uma vez.
2. **Entrar** → `emailVerified` passa a valer na sessão inteira (não só na tela de login);
   "Esqueci minha senha" (`sendPasswordResetEmail`) e "reenviar verificação"
   (`sendEmailVerification`) — recursos nativos, 1 linha cada, na tela que já existe.
3. **Escolher local** → **um** seletor no topo alimentando Dashboard/Worklist/Histórico/Extrato.
   Hoje Extrato e Histórico têm cada um o seu e a Worklist não tem nenhum (com 2+ locais a
   fila aparece vazia). **Sai código, não entra.** Com 1 local, o seletor não aparece.
4. **Convites** → dono informa CPF/e-mail, escolhe papel e locais → vínculo `pendente`.
   `getProfileByCPF`, `getPendingInvites`, `acceptInvite`, `rejectInvite` **já existem sem
   chamador**. Falta a tela: uma lista e dois botões.
5. **Cadastro PJ** → mesma tela (aba hoje vazia): CNPJ + razão social + formulário PF.
   Cria empresa + conta PJ + primeiro local + vínculo dono. Reusa `createEmpresa`, que já
   existe sem chamador.
6. **Segredos** → `LocalModal` grava e **nunca lê**; `/api/feegow` para de aceitar
   `x-feegow-token` do cliente.

---

## 6. Tratamento de erro

| Hoje | Passa a ser |
|---|---|
| Erro de rede vira `null`/`[]` → tela vazia sem aviso | Falha é falha: mensagem + "tentar de novo" |
| Cadastro falha no meio → "Conta criada!" | Uma resposta do servidor: criou, ou o motivo |
| Troca de sessão durante o carregamento → dados do usuário anterior na tela | Carregamento antigo descartado (guarda de geração no `onAuthStateChanged`) |

---

## 7. Migração — cada fase é aditiva

| Fase | O que | Quebra? | Quem |
|---|---|---|---|
| **0** | ✅ **FEITO 09/08** — script lê a regra publicada pela Rules API (não precisou do console) + inventário | Nada | notebook |
| **0.5** | ✅ **FEITO 09/08 18:34 — TRANCA PROVISÓRIA PUBLICADA.** Fase inexistente no plano original, criada porque a Fase 0 achou o banco aberto. Isolamento por `workspaces.ownerUid`, 35 testes | Nada quebrou | notebook |
| **1** | ✅ **FEITO 09/08** — 2 contas criadas (`wader-dev` pulado: sem dono, não é cliente) | Nada | notebook |
| **2** | ✅ **FEITO 09/08** — `subscriptions/{contaId}`, **sem** copiar `workspaceId` (senão duas assinaturas casariam na busca antiga e a franquia oscilaria entre elas) | Nada | notebook |
| **3** | ✅ **FEITO 09/08** — vínculos `{contaId}_{uid}` com papel. Os dois vínculos existentes viraram `dono` porque em ambos `medicoUid == ownerUid` | Nada | notebook |
| **4** | Deploy web: signup no servidor, seletor único, papéis na UI, convites, PJ | Reverter = deploy anterior | notebook |
| **5** | ✅ **FEITO 10/08/2026 15:11 UTC (Plano 2A)** — fechadura definitiva PUBLICADA (ruleset `bf7eed7f`), verificada byte a byte contra o repo. Rollback pronto: tag `pre-fase5` + `secao1:publicar-regras --file=<backup> --commit` | Reverter = republicar a tag | notebook |
| **6** | Segredos: gravar nos dois lugares → Wader passa a ler do novo (3 linhas em `workspace-repo.ts`) → deploy `update-wader.ps1` → só então apagar o campo antigo | Na ordem certa, o Wader nunca fica sem credencial | **Claude da clínica** |
| **7** | Limpeza: vínculos antigos, fallbacks `profiles`/`memberships`, `profissionalId` | Nada | notebook |

> **Plano 1 concluído em 09/08/2026** (branch `feat/secao1-contas`). Fases 0 a 3
> feitas, mais a Fase 0.5 que não existia. Dois arquivos de regra convivem, e a
> distinção é vital:
>
> | Arquivo | O que é |
> |---|---|
> | `firestore.rules` | **O que está NO AR desde 10/08/2026 15:11 UTC: a fechadura definitiva** (modelo de contas). Suíte única `tests/rules/regras.test.mjs`, 69 testes (`npm run test:rules`). |
> | ~~`firestore.rules.definitiva`~~ | **Não existe mais** — virou o `firestore.rules` na Fase 5 (Plano 2A). A tranca provisória vive na tag `pre-fase5` para rollback. |
>
> Regra de ouro: **`firestore.rules` sempre reflete exatamente o que está publicado.**
>
> **Plano 2A concluído em 10/08/2026** (branch `feat/secao1-plano2a`): `/api/signup`
> server-side no modelo de contas (rollback do Auth user); billing por
> `subscriptions/{contaId}` com fallback legado (cliente + `/api/emitir`);
> `/api/exame` (apagar/cancelar/transferir com papel, log, devolução LÍQUIDA de
> franquia e limpeza do PDF no Storage) substituindo os 2 `deleteDoc` do cliente;
> Lacuna 1 + P6 corrigidas com diff auditado (§8.2.2); Fase 5 publicada.
> Decisões fechadas no plano: P1 devolução de TODOS os consumos · P2 PDF apagado
> do Storage ao cancelar/apagar · P3 Feegow não é revertido (log registra
> divergência) · P4 recepção não apaga exame nem da fila · P5 cadastro PF nasce
> `papel:'dono'` · P6 Direx segue editando assinatura pelo navegador (update só
> superadmin) · P7 consulta de consumo sem índice composto.

**A Fase 0 travava tudo — e o que ela encontrou reordenou o plano.** A regra
publicada estava aberta (§1.1), então a Fase 0.5 furou a fila e trancou o banco no
mesmo dia, sem esperar o modelo de contas.

### ⚠️ Instruções para o Claude da clínica (Fase 6)

1. **Não iniciar** antes de as Fases 1-5 estarem no master e deployadas.
2. Ordem obrigatória: (a) LEO grava o segredo nos dois lugares; (b) alterar
   `apps/wader/src/adapters/workspace-repo.ts` para ler de
   `workspaces/{wsId}/privado/integracoes`, com fallback para o campo antigo;
   (c) `update-wader.ps1` (backup + restart) e confirmar imagem+SR chegando;
   (d) só então remover `ortancUrl`/`ortancUser`/`ortancPass` do documento do workspace.
3. O Wader usa Service Account (Admin SDK) — as regras do Firestore **não** se aplicam a
   ele. Publicar a fechadura não derruba a clínica.

---

## 8. Testes

Emulador do Firebase + `@firebase/rules-unit-testing` (nova dependência de dev — é o único
jeito honesto de provar isolamento; não simplificar aqui):

| Teste | Prova |
|---|---|
| Médico da conta A lê exame da conta B → **negado** | Isolamento multi-tenant |
| Recepção lê extrato → **negado** | Papel cobrado pelo banco |
| Qualquer um escreve `superadmin: true` em si → **negado** | Sem autopromoção |
| Não-autor edita laudo → **negado** | Caneta do autor |
| Cliente lê `privado/integracoes` → **negado** | Segredos fora do navegador |
| Cliente cria conta/vínculo/assinatura → **negado** | Só o servidor cria |

Mais: 1 teste da rota `/api/signup` (inclusive falhando no meio → não sobra conta pela
metade) e checklist de tela.

### Pronto quando

1. Com 2+ locais, escolher o local mostra a fila daquele local.
2. Recepção não encontra extrato, financeiro nem token.
3. Segundo médico vê a fila, lê o laudo do colega, não consegue editar.
4. Cancelar laudo emitido devolve 1 à franquia.
5. Os 6 testes de fechadura passam.
6. Wader segue recebendo imagem e SR, sem mudança de comportamento.

---

## 8.1 O que a tríade pegou (09/08, depois do Plano 1)

Revisão em três óticas sobre o branch inteiro — Codex (bugs), Ruflo (arquitetura),
Ponytail (o que deletar). Três defeitos que os 87 testes não pegavam:

| # | Achado | Onde doeu |
|---|---|---|
| 1 | **A tranca publicada quebrou o cadastro.** A regra exigia o campo `superadmin` ausente; `createProfile()` sempre envia `superadmin: false`. O teste passava porque usava payload inventado, sem o campo. | Produção, das 18:34 às 22:53 |
| 2 | **Consulta de locais por `contaId` era negada.** Regra de `list` no Firestore não filtra resultado — precisa ser satisfeita pelos campos que a **consulta** fixa. A consulta fixa `contaId`, a regra olhava `ownerUid`. | Travaria o login de todo migrado quando o Plano 2 subisse |
| 3 | **`subscriptions/{contaId}` é retrato congelado.** Quem debita a franquia (`/api/emitir`, `billing.ts`) continua no documento antigo; a tela mostraria número parado. | Mesma coisa |

Lição que vale para o resto do projeto: **teste com payload de mentira prova
mentira.** O teste de cadastro usava `{nome, crm}`; o app manda doze campos, um
deles fatal. Daqui em diante, teste de regra copia o payload real do código.

Também corrigidos: `vinculos` podia ser fabricado apontando para clínica alheia e
reescrito depois (papel incluído); `empresas` era legível por qualquer autenticado;
`AuthContext` sem `try/finally` prendia a tela em "carregando"; e o caminho novo
assumia a sessão mesmo cobrindo só parte dos locais do usuário.

## 8.2 Auditoria do estado final (10/08 00:36)

As correções da §8.1 foram feitas em cima das revisões e publicadas direto —
**ninguém tinha revisado o resultado.** Auditoria do que estava no ar, por Codex
e Ruflo em paralelo.

**Corrigido em produção:**

| Achado | Por quê importava |
|---|---|
| A **recepção podia emitir** por fora do `/api/emitir` | A regra olhava só o estado anterior; ela pegava um exame "aguardando" e gravava `status:'emitido'` com conclusões de uma vez — sem franquia, sem log, sem PDF. Agora o estado **resultante** também é checado |
| `intacto()` era a versão ingênua | Um `setDoc` sem merge **apagava** o campo protegido e passava: dava para remover `ownerUid` do próprio local (travando o acesso de todos, inclusive do dono) |

**Corrigido na fechadura definitiva** (que estava divergindo em silêncio):
vínculo sem papel voltaria a dar acesso; `empresas` voltaria a ser legível por
qualquer autenticado; `profissionais` create **repetiria o apagão de cadastro**;
e o autor podia transferir o laudo trocando `medicoUid` na própria edição.

> ⚠️ **Antes da Fase 5, reler a definitiva linha a linha contra a publicada.**
> Dois arquivos irmãos sincronizados na mão divergiram na **primeira semana**.
> Os testes dela provam consistência interna — não que ela incorporou o que o
> irmão aprendeu sob fogo. Melhor ainda: rodar o mesmo payload contra as duas.

### 8.2.1 O quinto furo — e a prova de que esta auditoria não foi exaustiva

Poucas horas depois da auditoria acima, uma **varredura Ponytail** (7 óticas em
paralelo, cada achado com verificador adversarial) encontrou **mais um furo da
mesma leva**, na definitiva:

```
allow create: if alcancaLocal(wsId)
              && (!('medicoUid' in request.resource.data) || ... )
```

O `create` **nunca olhava `status`**. Uma pessoa com papel `recepcao` podia gravar
um exame novo já com `status: 'emitido'` e conclusões — laudo com cara de assinado,
por fora do `/api/emitir`: **sem PDF, sem log, sem franquia debitada.** É o mesmo
vetor que derrubou a produção na manhã de 09/08.

Corrigido em `d344f2d`: o `create` da definitiva passou a exigir médico/dono para
qualquer documento que nasça `emitido`, espelhando a regra publicada. Três testes
novos (`recepcao NAO cria exame ja carimbado como emitido`, `recepcao cria exame na
fila normalmente`, `medico cria exame ja emitido (caminho legitimo)`). Suíte: 62/62.

**O que isso ensina, e por que o aviso acima continua valendo com mais força:**
a auditoria de `b6a6577` fechou quatro furos desta leva e passou batido no quinto —
não por descuido, mas porque **ela olhou o arquivo que estava no ar**, e este mora
no irmão. Duas fechaduras sincronizadas à mão não divergem por preguiça; divergem
porque a atenção vai para a que está protegendo dados agora.

**Regra de trabalho, a partir daqui:** toda correção de segurança entra **nos dois
arquivos no mesmo commit**, com o mesmo caso de teste rodando nas duas suítes. A
`tests/rules/fixtures.mjs` (criada em `d344f2d`) existe para isso — o payload real
mora num lugar só justamente para as duas suítes não poderem divergir em silêncio.

**A dívida está crescendo, não encolhendo** (achado do Ruflo). O cadastro
continua criando vínculo no formato antigo (`role`, id aleatório, sem `conta`).
Só as 2 contas da migração existem no modelo novo; todo usuário novo nasce no
velho. **O `/api/signup` do Plano 2 é o que estanca isso** — cada semana de
atraso aumenta a base a remigrar.

**Sobre confiar em revisor:** o Codex deu como correto o item do `profissionais`
create na definitiva; o Ruflo disse que estava quebrado. Conferi na mão — o
Ruflo estava certo. Revisor é ótica, não oráculo.

### 8.2.2 Diff auditado antes da Fase 5 (Plano 2A)

Task 4 fechou dois furos deixados na definitiva: **Lacuna 1** (`config`/`extratos`
do local sem `superadmin()` — suporte perdia acesso a honorários e ao contador de
extrato que a publicada sempre teve) e **P6** (`subscriptions update` era `if
false`, mas o painel Direx — `licencas/page.tsx` + `ajustarCreditos` — troca plano
e ajusta créditos pelo navegador; teria quebrado ao publicar). As duas entraram
nos dois arquivos no mesmo commit, com o mesmo caso de teste nas duas suítes
(regra de ouro do §8.2.1): `firestore.rules` ganhou só os testes (prova de que
já tinha o comportamento, sem regressão); `firestore.rules.definitiva` ganhou
teste + correção.

Depois da correção, `git diff --no-index firestore.rules firestore.rules.definitiva`
foi percorrido linha a linha contra a lista de divergências intencionais do brief:

| # | Divergência | Por que é intencional | Confirmada no diff? |
|---|---|---|---|
| 1 | `workspaces create`: publicada permite dono; definitiva `false` | Local nasce no `/api/signup` (Task 1) | Sim |
| 2 | `vinculos create`: publicada permite dono-do-local; definitiva `false` | Vínculo nasce no `/api/signup`; convite será rota (2B) | Sim |
| 3 | `subscriptions create`: publicada permite dono; definitiva `false` | Assinatura nasce no `/api/signup` | Sim |
| 4 | `subscriptions update`: publicada tem braço legado do dono; definitiva só superadmin | Doc legado morre; franquia é do servidor (agora com o braço `allow update: if superadmin()` desta task) | Sim |
| 5 | `exames delete`: publicada permite; definitiva `false` | `/api/exame` (Task 3) é o único caminho | Sim |
| 6 | `exames update`: definitiva exige autor (`medicoUid == uid()`) e `intacto('medicoUid')` | Caneta do autor (D2) — é o ganho da definitiva | Sim |
| 7 | `exames create`: definitiva exige `medicoUid` próprio/ausente | Anti-forja de autoria | Sim |
| 8 | Leituras por `ownerUid` (publicada) vs por vínculo (definitiva) | Modelo de contas substitui o provisório | Sim (`workspaces`, `contas` get/list) |
| 9 | `pacientes delete`: publicada `alcancaLocal`; definitiva só dono | Matriz §4 | Sim |
| 10 | `privado/**` explícito na definitiva | Gaveta de segredos (Fase 6) | Sim |
| 11 | `contas get/list`: braço `ownerUid` na publicada | Redundante quando todo dono tem vínculo `dono` | Sim |
| 12 | `vinculos get`: definitiva permite ao dono da conta ler vínculo de membro da própria conta; publicada só o próprio | Intencional desde o Plano 1 (spec: "leitura do proprio e do dono da conta"); suporta a matriz §4 "Convidar/remover membros = dono" | Sim |

A 12ª linha não estava na lista original de 11 do brief — foi um achado deste
próprio task durante a auditoria linha a linha, reportado como BLOCKED antes de
ser confirmado. Confirmação: o spec da definitiva no Plano 1
(`docs/planos/2026-08-09-secao1-plano1-fundacao.md`, Task 3 Step 4) já trazia
esse braço, com o comentário `── VINCULOS ── leitura do proprio e do dono da
conta; escrita so servidor` — e a matriz §4 deste ADR dá ao dono "Convidar /
remover membros", que depende de ler os vínculos da própria conta (tela de
membros do Plano 2B). É um ganho da definitiva, análogo à divergência #6 (a
publicada nunca teve o conceito de papel `dono` formal para expor essa leitura;
a definitiva tem e o expõe). Coberto por 2 testes novos em
`tests/rules/definitiva.test.mjs` (dono lê vínculo de membro da própria conta /
dono de outra conta não lê); a suíte da publicada não ganhou o caso equivalente
de propósito — lá o comportamento continua sendo "nega", e isso agora está
documentado nesta tabela em vez de correr o risco de divergir em silêncio de novo.

**Veredito:** as 12 divergências da tabela — confirmadas, sem surpresa. Nenhuma
divergência fora da lista sobrou depois da correção acima.

### 8.3 Tríade do Plano 2A (10/08/2026)

Revisão em 3 óticas (Codex bugs / Ruflo arquitetura / Ponytail o-que-não-construir)
depois da fechadura publicada. Os 4 **Críticos** foram corrigidos na mesma onda:

| # | Furo | Correção |
|---|------|----------|
| 1 | `consumo create: if auth()` — qualquer logado forjava `tipo:'cancelamento'` e zerava o ledger da própria clínica | `if false` (só Admin SDK). `registrarConsumo` do cliente é código morto |
| 2 | Cliente gravava `status:'cancelado'` direto no exame — laudo sumia sem devolver franquia nem logar | `exames update` exige `status != 'cancelado'`; reabrir para `andamento` continua livre |
| 3 | `resolverPapel` (`/api/exame`) ignorava `locais` do vínculo e ainda dava `dono` por `ownerUid` — rota mais frouxa que a fechadura (achado Ruflo #3) | Respeita `locais` (vazio = todos) e o braço `ownerUid` morreu: paridade rota ↔ regra |
| 4 | `/api/emitir` sem autenticação: qualquer um queimava a franquia de clínica alheia ou emitia em nome de outro médico | 401 sem token; 403 sem papel `dono`/`medico` no local; 403 se `medicoUid != uid`. Init do Admin unificado em `src/lib/auth-admin.ts` (achado Ruflo #1) |

Importantes na mesma onda: `apagarPdf` confinado ao prefixo `laudos/{wsId}/`;
doc de `consumo` dentro da transação de `/api/emitir` (débito sem ledger quebrava
a devolução líquida); `getLocaisDaConta` busca doc a doc quando o vínculo é
restrito (a query por `contaId` é negada inteira — quebrava o login desses
usuários); ledger de cancelamento registra só o que foi aplicado (0 quando não há
assinatura); `signup-server` virou `runTransaction` (duplo-clique podia apagar o
Auth user recém-criado).

**Fechamento do furo remanescente no #4 (verificação adversarial do Codex, 10/08):**
`/api/emitir` também confere, **dentro da transação e antes das escritas**, que o
exame existe (404 `nao_encontrado`) e que o `medicoUid` já gravado é o próprio
emissor (403 `exame_de_outro_medico`; exame sem autor pode ser assumido, igual à
regra publicada), e exige `profissionais/{uid}.tipoPerfil == 'medico'` (403
`nao_medico` — matriz §4: dono assistente administra tudo menos a caneta; campo
ausente conta como médico, que é o default do resto do app).

**Último elo (Codex, 3ª rodada adversarial):** `tipoPerfil` era autoeditável — um
assistente-dono se autopromovia a "médico" e passava no gate novo do emitir. Agora
é imutável no self-update (`intacto('tipoPerfil')`, `firestore.rules`); só o
superadmin muda; reenviar o mesmo valor (PerfilModal) continua passando. Limitação
residual conhecida: `tipoPerfil` é **autodeclarado no cadastro** (sem validação de
CRM) — verificação de identidade médica é produto, pendência do Plano 2B.

**Pendências aceitas, com destino:**

- `/api/corrigir-laudo` sem verificação de token → **Plano 2B**.
- TOCTOU: papel e exame lidos fora da transação de emissão/ação → **Plano 2B**.
- Testes pareados `getSubscription` (cliente) vs `resolverAssinatura` (servidor) → **Plano 2B**.
- Extrair `resolverPapel` para módulo próprio antes da rota de convite → **Plano 2B**.
- Fallbacks legados (assinatura por `workspaceId`, `ownerUid` em `workspaces`) morrem no **Plano 3**, com critério verificável: `npm run secao1:inventario` mostra **zero workspaces sem `contaId` e zero vínculos sem `papel`**.
- Código morto listado pelo Ponytail, remoção no **Plano 3**: `createProfile`, `createWorkspace`, `createMembership`, `emitExame`, `createSubscription`, `consumirEmissao`, `convites`.

## 8.4 Plano 2B-A — dor diária (10/08/2026)

Primeiro bloco do 2B: seletor de local, papéis na tela, aviso "conta sem local",
`/api/corrigir-laudo` autenticada. Executado com o pipeline padrão (brainstorm →
plano → subagentes → tríade). Spec em `docs/superpowers/specs/2026-08-10-secao1-plano2b-a-dor-diaria.md`.

| Entrega | O que |
|---|---|
| Fluxo de entrada | 0 locais → tela "conta sem local" (fim da fila-vazia-silenciosa do incidente 10/08); 1 → entra direto; 2+ → "qual local hoje?" (contexto de sessão, sem localStorage) |
| Seletor único | No topo, só com 2+ locais; `AuthContext` é a fonte única (`localAtivo`/`selecionarLocal`). Histórico e Extrato largaram o `wsIdSel` próprio |
| Papéis na tela | `src/lib/permissoes.ts` (matriz §4 em código puro, testável). Esconde o que o papel não pode. Gate de editar laudo virou **perfil médico + autoria** — corrigiu o bug do dono-médico (botão "Editar" sumido) |
| `/api/corrigir-laudo` | Última rota aberta fechada: `requireUid` + `resolverPapel` (401/403); `medicoUid` deixou de vir do corpo; **médico só corrige os seus**, dono qualquer, só laudo emitido (`podeCorrigir` em `exame-admin.ts`) |

**Tríade (Codex/Ruflo/Ponytail) — corrigido na mesma leva:** corrida de troca de
conta entre abas (guarda de geração `genRef` no `AuthContext`: callback obsoleto
não reescreve user, não solta o loading, não aplica contexto antigo); corrida de
troca de local (guarda de geração em Histórico/Extrato; Extrato só gera/cobra com
`carregadoWsId === wsIdSel` — não cobra o local errado).

**DECISÃO do Dr. Sérgio (10/08) — ato médico = CRM:** *"editar e liberar laudo é
ato médico; quem tem CRM pode, quem não tem, não — e a distinção nasce no cadastro."*
Consequências, a cravar no **Plano 2B-B** (onde surge o dono não-médico, com o
cadastro PJ):
- **Cadastro** captura e valida CRM; `tipoPerfil='medico'` passa a significar CRM real (hoje é autodeclarado).
- **Banco** (`firestore.rules`, `exames update`): hoje o braço do dono
  (`ehDonoDoLocal && intacto('medicoUid')`) deixa um dono **não-médico** editar
  conteúdo clínico de laudo alheio — contra a matriz §4. **Must-fix no 2B-B**, com
  regra + teste + tríade próprios. Exposição hoje é **zero** (o único dono é o Dr.
  Sérgio, que é médico); a UI já trava certo (`podeEditarLaudo` = médico+autoria).

**Pendências aceitas do 2B-A, com destino:**
- Regra do banco "conteúdo clínico = só médico (CRM)" + validação de CRM no cadastro → **Plano 2B-B** (decisão do Sérgio acima).
- Unificar a matriz de "quem edita laudo", hoje em 3 lugares (`permissoes.ts` por perfil, `exame-admin.ts` por papel, `/api/emitir` por perfil) num ponto de verdade → **Plano 2B-B**.
- Wrapper único de rota autenticada (`requireUid`+`resolverPapel` repete em 4 rotas) → **Plano 2B-B**.
- TOCTOU do `/api/corrigir-laudo` (update fora de transação) + `handleConsultar`/`carregarMais` obsoletos não resetam loading + validação de tipo/tamanho do corpo → estreitos, **Plano 3**.
- `AuthContext` não reage a mudança de vínculo em runtime (convite/PJ só aparecem ao relogar) → **Plano 2B-B**.

## 8.5 Plano 2B-B1 — PJ + trava do CRM (10-11/08/2026)

Primeiro bloco do 2B-B: cadastro PJ e a trava do CRM (a decisão de §8.4 no ar).
Spec em `docs/superpowers/specs/2026-08-10-secao1-plano2b-b1-pj-e-crm-design.md`.

| Entrega | O que |
|---|---|
| **Trava do CRM (banco)** | `exames update`: editar conteúdo/reabrir laudo exige `ehMedicoDeVerdade` (perfil médico) + autoria. Dono não-médico só administra a **fila não-emitida**, e — decisão do Sérgio — **só campos administrativos** (whitelist `camposAdministrativos()`); conteúdo clínico (conclusões/medidas/achados) é só de médico, **até em rascunho**. Idem no `create`. Correção administrativa de emitido é da `/api/corrigir-laudo` |
| **`ehMedicoDeVerdade`** | médico = `tipoPerfil` ausente **ou** `'medico'` (qualquer outro valor não é médico); alinhado com `permissoes.ts` e `/api/emitir` |
| **Cadastro PJ** | `/api/signup` roteia PF/PJ por `tipoConta`; `executarSignupPJ` cria empresa+conta PJ+local+vínculo dono+assinatura, atômico, CNPJ único (query na transação), rollback do Auth; `ja_cadastrado` antes de `dados_invalidos` |
| **Verificação de CRM plugável** | `crmVerificacao` no perfil via provedor injetado (no-op agora); **imutável** no self-update (só servidor/superadmin seta) e **não nasce 'verificado'** no create — o selo não é forjável. Pesquisa das fontes (CFM SOAP ~R$948/ano com carta de finalidade; Consultar.IO ~R$0,20/consulta) resumida no spec §7 |
| **Selo interno** | `SeloCrm` lê `crmVerificacao`; rótulo honesto (só diz "verificado" quando é); **nunca entra no laudo/PDF** (grep prova) |
| **Cancelar laudo** | Botão no Histórico → `/api/exame` (`acao:'cancelar'`); gate `podeCancelarLaudo` (dono ou médico autor); some quando já cancelado |

**Tríade (Codex/Ruflo/Ponytail) + 3 rodadas adversariais do Codex — fechado na leva:**
selo forjável por self-update E por create (crmVerificacao imutável/não-nasce-verificado);
`ehMedicoDeVerdade` frouxo (valor esquisito virava médico); conteúdo clínico gravável
por não-médico em rascunho (whitelist fail-closed no create+update); conteúdo clínico no
create por médico-de-perfil com papel recepção (exige `ehMedicoDeVerdade && ehMedicoNoLocal`).
Suítes: unit 22/22, api 39/39, rules 96/96.

**DECISÃO do Dr. Sérgio (10/08):** verificação real de CRM = **Consultar.IO/CFM** (a forte),
mas **plugável** — a trava (exigir+guardar CRM, banco travado) sobe agora; o provedor real
liga depois sem mexer em cadastro nem regra. E: **só médico escreve conteúdo do laudo, até
em rascunho** (não a equipe).

**Pendências do 2B-B1, com destino:**
- Ligar o provedor real de verificação de CRM (Consultar.IO/CFM) → follow-up quando o Sérgio contratar. **Ao ligar:** falha do provedor deve degradar para `nao_verificado` (não abortar o cadastro — hoje o `catch` apaga o Auth) — achado Ruflo.
- Convite (recepção/médico entra em conta existente) = rota própria `/api/convite`, **não** crescer `/api/signup` → **Plano 2B-B2**. Ao criar recepção, setar `tipoPerfil:'assistente'` (hoje recepção com `tipoPerfil` ausente contaria como médico na trava do create).
- Unificar a matriz "quem mexe no laudo": `exame-admin.ts` (cancelar/apagar/transferir) ainda gateia por **papel** só, sem `tipoPerfil` — um `papel:'medico'` com `tipoPerfil:'assistente'` cancelaria/transferiria → **Plano 2B-B2**.
- CNPJ: unicidade sob corrida (dois cadastros simultâneos do mesmo CNPJ) + dígitos verificadores; e-mail do corpo não conferido contra o Auth (vale PF e PJ) → **follow-up de segurança**.
- Extrair passos repetidos do signup (perfil/vínculo/assinatura) + `planoPorId` (dedup `planoTrial`/`planoTrialPJ`) + apagar `createEmpresa`/`getEmpresa`/`getEmpresaByCNPJ` mortos → **Plano 3**.

## 9. Fora de escopo (Seção 1 não resolve)

- Gateway de pagamento real (Stripe/Asaas).
- Divergência de preço/franquia entre memória e código (§2).
- Reconciliação Feegow no clique "🔗 Feegow" (item #6 do ADR de 16/05).
- Aposentadoria do motor antigo de laudo.
