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
| **5** | **Publicar a fechadura definitiva** (`firestore.rules.definitiva`, 52 testes, já escrita e testada). Substitui a tranca provisória | Ponto de virada; reverter = republicar a anterior | notebook |
| **6** | Segredos: gravar nos dois lugares → Wader passa a ler do novo (3 linhas em `workspace-repo.ts`) → deploy `update-wader.ps1` → só então apagar o campo antigo | Na ordem certa, o Wader nunca fica sem credencial | **Claude da clínica** |
| **7** | Limpeza: vínculos antigos, fallbacks `profiles`/`memberships`, `profissionalId` | Nada | notebook |

> **Plano 1 concluído em 09/08/2026** (branch `feat/secao1-contas`). Fases 0 a 3
> feitas, mais a Fase 0.5 que não existia. Dois arquivos de regra convivem, e a
> distinção é vital:
>
> | Arquivo | O que é |
> |---|---|
> | `firestore.rules` | **O que está NO AR.** Tranca provisória por `ownerUid`. 35 testes. |
> | `firestore.rules.definitiva` | A fechadura do modelo de contas. 52 testes. **Não publicada** — publicar antes do cadastro server-side quebraria o cadastro em produção. É a Fase 5, última tarefa do Plano 2. |
>
> Regra de ouro: **`firestore.rules` sempre reflete exatamente o que está publicado.**

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

## 9. Fora de escopo (Seção 1 não resolve)

- Gateway de pagamento real (Stripe/Asaas).
- Divergência de preço/franquia entre memória e código (§2).
- Reconciliação Feegow no clique "🔗 Feegow" (item #6 do ADR de 16/05).
- Aposentadoria do motor antigo de laudo.
