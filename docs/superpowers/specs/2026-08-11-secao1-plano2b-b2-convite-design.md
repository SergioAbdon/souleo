# Plano 2B-B2 — Convite por link + gestão de membros — design

> **Status:** ✅ Design aprovado pelo Dr. Sérgio (11/08/2026). Implementação não iniciada.
> **Fecha:** a Seção 1 (contas e acesso). Depende de 2A + 2B-A + 2B-B1.
> **Ler antes de mexer em:** `firestore.rules` (vinculos/convites), `src/lib/signup-server.ts`,
> `src/lib/exame-admin.ts`, `src/lib/auth-admin.ts`, `src/app/dashboard/page.tsx`,
> `src/app/login/page.tsx`.

---

## 1. Contexto

Último bloco da Seção 1: fazer uma clínica (conta) **ter equipe**. Hoje só o dono
existe; não há como um segundo médico ou a recepção entrar numa conta existente. As
funções `getPendingInvites`/`acceptInvite`/`rejectInvite` (`firestore.ts`) escrevem em
`vinculos`, mas a regra publicada tem `vinculos create/update/delete: if false` — então
**convite e gestão de membros têm que ser rota de servidor** (Admin SDK). Não há e-mail
no projeto → convite por **link no WhatsApp** (decisão do Sérgio).

## 2. Decisões (aprovadas com o Dr. Sérgio, 11/08)

| # | Decisão |
|---|---|
| C1 | **Link aberto por papel+locais.** O dono escolhe papel (médico/recepção) + locais → link único, uso único, expira em **7 dias**. Quem abrir e aceitar entra com esse papel |
| C2 | **Aceite serve novos E existentes.** Quem já tem conta LEO faz login e ganha o vínculo; quem é novo se cadastra pelo link (médico → CRM obrigatório) e nasce vinculado |
| C3 | **Convidado ganha SÓ o vínculo da clínica**, não uma conta PF própria (entrar numa clínica ≠ abrir conta). Perfil é criado se novo; conta/workspace/assinatura não |
| C4 | **Gestão completa:** o dono lista membros, convida, **edita papel/locais**, **revoga** (vínculo vira `inativo`, mantém histórico) e cancela convite pendente |
| C5 | **`convites` é 100% servidor.** O cliente nunca lê o token direto; preview e aceite passam por rota |
| C6 | **Recepção convidada nasce `tipoPerfil:'assistente'`** (a trava do CRM a trata como não-médica) |
| C7 | **Pendência do B1:** `exame-admin.ts` (cancelar/transferir) passa a exigir **tipoPerfil médico** no braço do médico, não só o papel |
| C8 | Dono **não revoga a si mesmo**; não dá pra rebaixar o único dono |

## 3. Arquitetura

```
convites/{token}            ← coleção NOVA, 100% servidor (rules: read/write if false)
 { contaId, papel, locais[], criadoPor, criadoEm, expiraEm, usado, usadoPor, usadoEm }

Rotas (Admin SDK, requireUid + resolverPapel do 2A):
 /api/convite        POST(dono)  cria convite → devolve link          | DELETE(dono) cancela pendente
 /api/convite/info   GET(token)  preview público: {clinica, papel}    (sem dado sensível)
 /api/convite/aceitar POST(auth) valida token → perfil(se novo)+vínculo, marca usado
 /api/membros        GET(dono)   lista membros (nome, papel, locais, status) + convites pendentes
 /api/membro         PATCH(dono) edita papel/locais | DELETE(dono) revoga (status inativo)

src/lib/convite-server.ts (NOVO, sem import @/): criarConvite, aceitarConvite,
   listarMembros, editarMembro, revogarMembro — lógica pura testável no emulador.
src/lib/signup-server.ts: reusa a criação de perfil (extração leve criarPerfilDoc).
src/lib/exame-admin.ts: cancelar/transferir exigem tipoPerfil médico (C7).

UI:
 src/app/convite/[token]/page.tsx (NOVO) — landing do convite (login ou cadastro → aceitar)
 src/components/Membros.tsx (NOVO) — aba "Membros" do dono (lista + convidar + editar + revogar)
 src/app/dashboard/page.tsx — aba "Membros" (só dono, via podeGerenciarMembros)
```

### 3.1 Módulos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/convite-server.ts` (criar) | Lógica de convite/membros (Admin SDK), sem import relativo/@; funções puras testáveis |
| `src/app/api/convite/route.ts` (criar) | POST cria convite (dono); DELETE cancela pendente |
| `src/app/api/convite/info/route.ts` (criar) | GET preview por token (só nome da clínica + papel) |
| `src/app/api/convite/aceitar/route.ts` (criar) | POST aceite (auth): perfil+vínculo, marca usado |
| `src/app/api/membros/route.ts` (criar) | GET lista membros + convites pendentes (dono) |
| `src/app/api/membro/route.ts` (criar) | PATCH edita papel/locais; DELETE revoga (dono) |
| `src/app/convite/[token]/page.tsx` (criar) | Landing: preview + login/cadastro + aceitar |
| `src/components/Membros.tsx` (criar) | Tela de gestão de membros do dono |
| `src/app/dashboard/page.tsx` (modificar) | Aba "Membros" (gate `podeGerenciarMembros`) |
| `src/app/login/page.tsx` (modificar) | Cadastro com `?convite=token` cria perfil e aceita (sem nova conta PF) |
| `src/lib/exame-admin.ts` (modificar) | Braço do médico em cancelar/transferir exige tipoPerfil médico |
| `firestore.rules` (modificar) | `match /convites/{id} { allow read, write: if false; }` (só servidor) |
| `tests/api/convite.test.mjs`, `tests/rules/regras.test.mjs`, `tests/api/exame.test.mjs` | Testes |

## 4. Fluxos

### 4.1 Criar convite (C1)

Dono no dashboard → "Convidar" → escolhe papel + locais → `POST /api/convite`
(`requireUid` + `resolverPapel`==dono) → cria `convites/{autoId}` (`expiraEm` = +7 dias,
`usado:false`) → devolve `link = https://souleo.com.br/convite/{autoId}`. O dono copia e
manda no WhatsApp.

### 4.2 Aceitar (C2/C3)

1. Pessoa abre `/convite/[token]` → `GET /api/convite/info?token` mostra "Convite para
   **[Clínica]** como **[papel]**". Se expirado/usado → mensagem clara, sem preview.
2. **Já tem conta:** faz login → `POST /api/convite/aceitar` (token + idToken).
   **Nova:** cadastra pelo link (médico → CRM+UF obrigatórios) → o cadastro cria só o
   Auth user + perfil, sem conta PF (C3) → então aceita.
3. `aceitarConvite`: valida token (existe, não usado, não expirado), cria `profissionais/{uid}`
   se não existir (recepção → `tipoPerfil:'assistente'`; médico → com CRM + `crmVerificacao`
   no-op), cria `vinculos/{contaId}_{uid}` (papel+locais do convite, `status:'ativo'`), marca
   o convite `usado:true, usadoPor:uid`. Tudo numa transação. Já-membro → `{ok:false, motivo:'ja_membro'}`.

### 4.3 Gestão de membros (C4/C8)

- `GET /api/membros` (dono): lê `vinculos where contaId==conta`, junta nomes de
  `profissionais`, devolve membros + convites pendentes (não usados, não expirados).
- `PATCH /api/membro` (dono): edita `papel`/`locais` de um vínculo. Não rebaixa o último dono.
- `DELETE /api/membro` (dono): `status:'inativo'` (mantém histórico/logs). Dono não revoga a si (C8).

### 4.4 Pendência do B1 (C7)

`exame-admin.ts` — no braço do médico de `cancelarExame`/`transferirExame`, além de
`papel==='medico'` exigir que o perfil seja médico (`tipoPerfil` ausente ou `'medico'`),
lendo `profissionais/{uid}`. O dono segue podendo (administrativo).

## 5. Segurança / erros

| Situação | Comportamento |
|---|---|
| Token inexistente/expirado/usado | Preview e aceite recusam com motivo; nada é criado |
| `convites` lido pelo cliente | Negado pela regra (`if false`); só rotas acessam |
| Convite forjado (papel/locais adulterados no corpo do aceite) | O aceite lê papel/locais **do doc do convite**, nunca do corpo |
| Não-dono tenta criar convite / gerir membros | `resolverPapel != dono` → 403 |
| Aceitar duas vezes / dois cliques | `usado` na transação; segunda vez → `ja_usado`/`ja_membro` |
| Dono revoga a si mesmo ou rebaixa único dono | Bloqueado (C8) |

## 6. Testes

| Alvo | Prova |
|---|---|
| `convite.test.mjs` (emulador) | criar convite (só dono); aceitar novo (perfil+vínculo); aceitar existente; médico sem CRM → recusa; expirado/usado → recusa; já-membro → recusa; papel/locais vêm do doc, não do corpo; editar/revogar; dono não revoga a si |
| `regras.test.mjs` | cliente não lê nem escreve `convites` (if false) |
| `exame-admin`/`exame.test.mjs` | médico com `tipoPerfil:'assistente'` NÃO cancela/transfere; médico de verdade sim; dono sim |

## 7. Pronto quando

1. O dono gera um link, manda no WhatsApp, a pessoa abre e entra na clínica (nova ou existente).
2. Médico convidado entra com CRM; recepção entra como assistente.
3. O dono vê a lista de membros, edita papel/locais e revoga.
4. Convite expirado/usado/forjado não deixa ninguém entrar.
5. `exame-admin` respeita tipoPerfil em cancelar/transferir.

## 8. Fora deste spec (fecha a Seção 1; o resto é outra seção)

| Item | Onde |
|---|---|
| Ligar provedor real de verificação de CRM (Consultar.IO/CFM) | Follow-up quando o Sérgio contratar |
| CNPJ unicidade sob corrida + dígitos; e-mail do corpo vs Auth | Follow-up de segurança |
| Fase 6 (segredos + Wader) | Claude da clínica |
| Código morto + fallbacks legados + dedup signup | **Plano 3** |
| Reenvio de convite por e-mail (não há e-mail no projeto) | Fora — WhatsApp é o canal |
