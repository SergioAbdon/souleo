# Plano 2 (Seção 1) — Levantamento antes de planejar

> Fatos apurados por varredura de código em 09-10/08/2026 (workflow de 7 agentes +
> conferência adversarial). **Ler antes de escrever/executar o Plano 2.** Cada fato
> foi confirmado no código com arquivo:linha. Fonte de verdade: este arquivo + o
> ADR `docs/decisoes/2026-08-09-secao1-contas-e-acesso.md`.

## Onde a Fase 1 parou (estado em 10/08 ~00:00)

- **Regra publicada** (`firestore.rules`, no ar): tranca por `ownerUid` + membro da
  conta, com papéis. 70 testes. Protege dados reais AGORA.
- **Fechadura definitiva** (`firestore.rules.definitiva`, NÃO publicada): modelo de
  contas completo. 62 testes. **Publicá-la é a etapa final da fase 1** — mas ela
  quebra coisas em produção se subir antes dos pré-requisitos abaixo.
- **Migração já rodada**: 2 contas criadas, vínculos `{contaId}_{uid}` com papel,
  `subscriptions/{contaId}`. Exames/pacientes intocados. Docs antigos marcados.
- **App** (`AuthContext` + `src/lib/contas.ts`): lê o modelo novo com fallback pro
  antigo. Emulador roda com JDK 21 (`npm run test:rules` / `test:rules:definitiva`).

## A ORDEM É OBRIGATÓRIA — 3 pré-requisitos antes de publicar a definitiva

Publicar `firestore.rules.definitiva` HOJE quebraria, em produção:

1. **Cadastro inteiro.** A definitiva tem `allow create: if false` em
   `contas` (:77), `workspaces` (:86), `vinculos` (:143), `subscriptions` (:150).
   O cadastro atual (`src/app/login/page.tsx:128-157`) cria os 4 pelo navegador.
   → **Pré-requisito: `/api/signup` no servidor (Admin SDK).**

2. **Billing de todo mundo.** `getSubscription` (`src/lib/billing.ts:157-165`)
   consulta `subscriptions` por `where('workspaceId','==',...)`. A definitiva só
   reconhece a assinatura por **doc-id = contaId** (:147-151). Regra de `list` no
   Firestore não filtra — precisa ser satisfeita pelos campos que a CONSULTA fixa;
   a consulta fixa `workspaceId`, a regra quer `contaId` → **a query é negada
   inteira**. `subscription` vira `null` para todos → ninguém emite laudo, ninguém
   vê extrato. → **Pré-requisito: billing lê a assinatura por `contaId`.**

3. **Os 2 botões de apagar.** `deleteDoc` de exame em `Worklist.tsx:304`
   ("Remover da fila") e `Historico.tsx:131` ("Excluir laudo") — a definitiva tem
   `allow delete: if false` em exames. → **Pré-requisito: rota de servidor para
   apagar/cancelar/transferir; trocar os 2 `deleteDoc` do cliente por ela.**

E uma regressão dentro da própria definitiva, a corrigir junto:

4. **Lacuna 1** — `config` e `extratos` na definitiva (:131-132) usam
   `ehMedicoNoLocal(wsId)`, que **não tem branch `superadmin()`** (a publicada tem,
   `firestore.rules:110-111`). Superadmin/suporte perde acesso a honorários e
   contador de extrato de outros locais. Adicionar `superadmin() ||`.

## Cadastro atual — os 7 passos que o `/api/signup` precisa replicar

Fonte: `src/app/login/page.tsx:123-157`, `firestore.ts:37-193`, `billing.ts:109-154`.

1. Valida client-side (nome/email/senha≥6; se médico, crm+uf). CPF não é coletado.
2. `createUserWithEmailAndPassword` → uid do Firebase.
3. `sendEmailVerification` (efeito colateral; e-mail via Firebase Auth).
4. `profissionais/{uid}` (doc-id = uid): `{uid, nome, email, crm, ufCrm,
   especialidade, tipoPerfil, cpf:'', rqe:'', superadmin:false, criadoEm,
   atualizadoEm}`.
5. `workspaces/{autoId}`: `{id, ownerUid, tipo:'PF', nomeClinica:'Consultório'
   (hardcoded), slogan, corPrimaria:'#1E3A5F', corSecundaria:'#2563EB', criadoEm}`.
   **NÃO grava `contaId` nem `status`** (é o buraco: nasce no formato antigo).
6. `vinculos/{autoId}`: `{id, medicoUid, profissionalId, workspaceId, empresaId:null,
   role, status:'ativo', convitePor:null, entrou, saiu:null, criadoEm}`.
   **NÃO é `{contaId}_{uid}`, não tem `papel`/`locais`/`contaId`.**
7. `subscriptions/{autoId}` (lê `configPlanos/atual` ou cai em `PLANOS_DEFAULT`,
   `billing.ts:69`): `{id, workspaceId, planoId:'trial', tipo:'trial',
   tipoPlano:'PF', franquiaMensal:600, franquiaUsada:0, creditosExtras:0,
   excedente, maxLocais:5, ..., cicloInicio, cicloFim:+30d, criadoEm}`.

**Toda falha é engolida** (try/catch interno retorna false/null; o handler só
confere o retorno de `createWorkspace`). Se qualquer passo falhar, o usuário vê
"Conta criada!" mesmo assim. A rota nova deve ser atômica (writeBatch) e, no catch,
apagar o Auth user (Admin SDK `deleteUser`) para não deixar órfão.

**Decisão de forma:** cliente cria o Auth user + `sendEmailVerification`, pega o
idToken e manda pra `/api/signup`; a rota **verifica o idToken** e cria os docs no
modelo novo (`contas/{id}`, `workspaces/{id}` com `contaId`, `vinculos/{contaId}_{uid}`
com `papel:'dono'`+`locais:[]`, `subscriptions/{contaId}`). Senha nunca vai ao
servidor. ⚠️ As rotas existentes (`/api/emitir`, `/api/corrigir-laudo`) **não
verificam auth** — a rota nova deve, e é padrão a seguir para as próximas.

## Cancelar/apagar/transferir — o que a rota precisa saber

Fonte: `api/emitir/route.ts`, `api/corrigir-laudo/route.ts`, `billing.ts`, laudo page.

- **Emitir** (`/api/emitir`) usa `runTransaction`: consome franquia OU crédito e grava
  1 doc em `consumo`. Reemissão **consome de novo** a cada vez.
- **Cancelar** precisa: ler `consumo` por `exameId` (pode haver vários se reemitido)
  para saber se devolver **franquia** (decrementar `franquiaUsada`) ou **crédito**
  (`ajustarCreditos`, que só mexe em `creditosExtras`). **Não existe função que
  decremente `franquiaUsada`** — criar. `logs`/`consumo` são append-only por regra:
  cancelar registra um lançamento novo (`tipo:'cancelamento'`), não apaga.
- **PDF no Storage**: caminho por nome+tipo, **sem exameId, sem versionamento**.
  Apagar/cancelar não restaura PDF anterior nem revoga o já baixado. Se a rota não
  apagar o objeto do Storage, o PDF público de um exame apagado **continua acessível
  pela URL** (dado de paciente). Decidir: apagar o objeto na rota.
- **Feegow**: emitir empurra `status_id:3` pro Feegow (`laudo/[id]/page.tsx:672-681`).
  Não há reversão. Decidir se cancelar tenta desfazer ou aceita a divergência.
- **Billing ainda é por `workspaceId`** (`contas.ts:39-42` documenta a pendência) —
  a rota de cancelar deve usar a MESMA chave que `/api/emitir` usa, ou devolve saldo
  no lugar errado. (Resolve junto com o pré-requisito 2.)

## Código morto encontrado (candidatos a apagar no Plano 2/3)

- `emitExame()` (`firestore.ts:334-345`): grava `status:'emitido'` do navegador, sem
  franquia/PDF/log. Ninguém chama. Atalho perigoso — remover.
- `acceptInvite`, `rejectInvite`, `deactivateMembership`, `getPendingInvites`
  (`firestore.ts`): sem chamador, e `vinculos` update/delete = `if false` nas duas
  regras — **não dá para só ligar a UI**; aceitar convite terá de ser rota de servidor.
- `handleEditar` (`Historico.tsx:115-121`): reabertura de laudo com log, morta.
- `consumirEmissao`, `registrarConsumo`, `checkWorkspaceLimit` (`billing.ts`): sem uso.

## Achados de UX que o Plano 2B (não a fechadura) precisa tratar

- **Seletor de local não existe.** Com 2+ locais, `AuthContext.workspace` fica `null`
  para sempre (nada chama `selecionarContexto`) → Worklist, dashboard e `/laudo/[id]`
  ficam **vazios, sem aviso**. Extrato e Histórico têm cada um seu `wsIdSel` próprio,
  que **reseta a cada troca de aba** e não conversam entre si. O "seletor único"
  pedido é criar o primeiro seletor de verdade, não unificar 3.
- **Dois conceitos de "papel"**: `profile.tipoPerfil` (autoeditável, cosmético/CRM)
  vs `membership.role`/`papel` (do vínculo, imutável pelo cliente). Worklist testa
  `role === 'medico'` (`Worklist.tsx:67`) — **não reconhece `papel:'dono'`**. Gate
  novo precisa decidir isso explicitamente.
- **Falha silenciosa**: `Historico.tsx:131` (deleteDoc) não tem try/catch — recepção
  negada pela regra trava o modal sem feedback. Piora quando a definitiva subir.
- **LocalModal** mostra token Feegow + credencial Orthanc em texto claro a qualquer
  membro que clique "Editar" (só o `ownerUid` salva, mas todos leem). Fecha com a
  seção Integrações (`docs/decisoes/2026-08-10-secao-integracoes.md`) ou Fase 6.
- **Convite por link**: zero capacidade de e-mail no projeto. Decisão do Sérgio:
  gerar link, mandar por WhatsApp (não enviar e-mail automático). Convite endereça um
  e-mail antes de existir uid → precisa de doc de convite (uso único, expiração, não
  adivinhável, preso ao e-mail) + rota que cria o `vinculos/{contaId}_{uid}` quando a
  pessoa se cadastra pelo link.

## Divisão proposta

- **Plano 2A — "a fechadura sobe" (etapa final da fase 1):** pré-requisitos 1-4 acima
  + publicar a definitiva (Fase 5). É o que fecha a fase 1.
- **Plano 2B — multiusuário/comercial:** papéis na tela, seletor único de local,
  convite por link, cadastro PJ. Destrava vender para clínica; não bloqueia a fechadura.
- **Plano 3 — limpeza + Integrações:** apagar docs antigos e código morto; Fase 6
  (segredos + Wader, do Claude da clínica); seção Integrações.
