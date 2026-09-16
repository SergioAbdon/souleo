# Plano 2B-B1 — PJ + trava do CRM (ato médico) — design

> **Status:** ✅ Design aprovado pelo Dr. Sérgio (10/08/2026). Implementação não iniciada.
> **Antecede:** Plano 2B-B2 (convite por link), fora deste spec.
> **Depende de:** Plano 2A (fechadura + modelo de contas + `auth-admin.ts` + `/api/exame`) e 2B-A (`permissoes.ts` + AuthContext do local ativo).
> **Ler antes de mexer em:** `firestore.rules` (bloco `exames`), `src/app/login/page.tsx`,
> `src/lib/signup-server.ts`, `src/lib/firestore.ts` (empresas), `src/app/api/signup/route.ts`,
> `src/components/Historico.tsx`, `src/lib/permissoes.ts`.

---

## 1. Contexto e decisão que origina o plano

Decisão do Dr. Sérgio (10/08/2026, registrada no ADR §8.4): **"editar e liberar
laudo é ato médico; quem tem CRM pode, quem não tem, não — e a distinção nasce no
cadastro."**

Hoje a regra do banco decide "quem edita/emite laudo" pelo **papel administrativo**
(`ehDonoDoLocal`/`ehMedicoNoLocal`, que olham `vinculos.papel`), não por **ter CRM**.
Consequência (Crítico achado pela tríade do 2B-A): a regra `exames update`
(`firestore.rules:123-127`) deixa um **dono não-médico** editar conteúdo clínico de
laudo alheio — `(ehDonoDoLocal(wsId) && intacto('medicoUid'))` autoriza qualquer campo.
Exposição hoje é **zero** (o único dono é o Dr. Sérgio, que é médico); vira risco real
quando o cadastro PJ criar gestor de clínica não-médico como dono — exatamente o que
este plano introduz. Por isso a trava e o PJ andam juntos.

## 2. Decisões (aprovadas com o Dr. Sérgio, 10/08)

| # | Decisão |
|---|---|
| B1 | **Ato médico = CRM.** Editar conteúdo de laudo e reabrir emitido exigem **perfil médico** (`profissionais.tipoPerfil == 'medico'`), não só o papel. Vale no banco e na tela |
| B2 | **Dono não-médico administra a fila** (exame não-emitido: paciente, convênio, agendamento) e o financeiro/local, mas **não toca laudo** (conteúdo/emissão) |
| B3 | **Cadastro exige CRM+UF de quem se declara médico** (obrigatório, gravado, imutável — já é imutável desde o 2A). É onde "a distinção nasce" |
| B4 | **Verificação real de CRM é plugável.** Provedor no-op agora (`status: 'nao_verificado'`); Consultar.IO/CFM depois, sem mexer em cadastro nem regra. Pesquisa em `docs/decisoes/2026-08-10-verificacao-crm-pesquisa.md` (resumo no §7 deste spec) |
| B5 | **Selo de verificação é CONTROLE INTERNO.** Nunca aparece no laudo (PDF). Só nas telas internas (perfil, cadastro, futuro painel de gestão). Enquanto `nao_verificado`, o rótulo **não** diz "verificado" |
| B6 | **Cadastro PJ:** quem cadastra é o **dono** (pode ser gestor não-médico). Cria empresa + conta PJ + primeiro local + vínculo dono + assinatura PJ, atômico, no servidor |
| B7 | **Botão cancelar laudo** reusa `/api/exame` (`acao:'cancelar'`, já devolve franquia/loga/apaga PDF). Aparece só para dono ou médico autor |

## 3. Arquitetura

```
firestore.rules (bloco exames)
 └── novo helper ehMedicoDeVerdade(uid) = profissionais/{uid}.tipoPerfil == 'medico'
     · editar conteúdo / reabrir emitido → exige ehMedicoDeVerdade + autoria
     · administrar fila não-emitida → dono/medico/recepcao do local (administrativo)

src/lib/verificar-crm.ts (NOVO — interface plugável, sem I/O externo por ora)
 └── verificarCrm(crm, uf): Promise<{ status: 'nao_verificado'|'verificado'|'reprovado', fonte, checadoEm }>
     provedor default = no-op → 'nao_verificado'

src/lib/signup-server.ts (estende)
 └── executarSignupPJ(...) : empresa + conta PJ + local + vínculo dono + assinatura
     · médico → CRM+UF obrigatórios; grava crmVerificacao (via verificarCrm)

src/app/api/signup/route.ts (roteia PF vs PJ)
src/app/login/page.tsx (aba PJ ganha formulário)
src/components/SeloCrm.tsx (NOVO — lê profile.crmVerificacao; nunca no PDF)
src/components/Historico.tsx (botão Cancelar → /api/exame)
src/lib/permissoes.ts (podeCancelarLaudo já derivável de podeEditarLaudo; +selo helpers)
```

### 3.1 Módulos

| Arquivo | Responsabilidade |
|---|---|
| `firestore.rules` (modificar bloco `exames` + helper) | `ehMedicoDeVerdade(uid)`; `exames update` separa conteúdo (médico+autor) de administração de fila (não-emitido) |
| `src/lib/verificar-crm.ts` (criar) | Interface `verificarCrm(crm, uf)`; provedor no-op. Sem import relativo/@ (testável por node --test) |
| `src/lib/signup-server.ts` (modificar) | `executarSignupPJ(db, authAdmin, uid, dados)`: cria empresa+conta PJ+local+vínculo+assinatura; grava `crmVerificacao` |
| `src/app/api/signup/route.ts` (modificar) | Corpo com `tipoConta: 'PF'|'PJ'` roteia para `executarSignup`/`executarSignupPJ` |
| `src/app/login/page.tsx` (modificar) | Aba PJ: CNPJ + razão social + (é médico? → CRM+UF) + nome do local |
| `src/components/SeloCrm.tsx` (criar) | Selo interno do estado de verificação. **Nunca importado por `pdf-server`/`gerarPdfHtml`** |
| `src/app/dashboard/page.tsx` (modificar) | Mostra `<SeloCrm>` no cabeçalho do perfil |
| `src/components/Historico.tsx` (modificar) | Botão "Cancelar laudo" → `/api/exame` com motivo; gate via `permissoes.ts` |
| `src/lib/permissoes.ts` (modificar) | `podeCancelarLaudo(perfil, exame, uid, papel)` (dono ou médico autor); helper de rótulo do selo |
| `tests/rules/regras.test.mjs`, `tests/api/signup.test.mjs`, `tests/unit/*` | Testes das três frentes |

## 4. Fluxos

### 4.1 Trava do CRM no banco (B1/B2)

`exames update` passa a ser (conceito; texto final no plano):

```
allow update: if request.resource.data.get('status','') != 'cancelado' && (
  // Conteúdo do laudo / reabrir emitido = ATO MÉDICO (CRM) + autoria
  (ehMedicoDeVerdade(uid()) && ehMedicoNoLocal(wsId)
     && (!('medicoUid' in resource.data) || resource.data.medicoUid == uid())
     && ('medicoUid' in resource.data ? intacto('medicoUid') : true))
  // Administração da fila: exame NÃO-emitido, sem virar emitido, medicoUid intacto
  || (ehDonoDoLocal(wsId) && intacto('medicoUid')
       && resource.data.get('status','') != 'emitido'
       && request.resource.data.get('status','') != 'emitido')
);
```

Onde `ehMedicoDeVerdade(uid)` = existe `profissionais/{uid}` com `tipoPerfil == 'medico'`.
Financeiro (`config`/`extratos`), editar local e (no B2) membros continuam por **papel**
(dono/médico) — não são ato médico. `/api/emitir` e `/api/exame` (servidor) inalterados.

### 4.2 Cadastro PJ (B6)

Cliente cria o Auth user + idToken → `/api/signup` com `tipoConta:'PJ'` → `executarSignupPJ`
(batch atômico): `empresas/{id}` (CNPJ, razão social, masterUid) + `contas/{id}`
(tipo PJ, empresaId, ownerUid) + `workspaces/{id}` (contaId, ownerUid) +
`vinculos/{contaId}_{uid}` (papel dono, locais []) + `subscriptions/{contaId}` (plano PJ).
Se o dono se declara médico → CRM+UF obrigatórios e `crmVerificacao` gravado. Rollback do
Auth user em falha (igual PF).

### 4.3 Verificação plugável + selo (B4/B5)

`verificarCrm(crm, uf)` no-op retorna `{ status:'nao_verificado' }`. Gravado em
`profissionais.crmVerificacao`. `<SeloCrm>` lê o campo e mostra o rótulo honesto
(§ tabela abaixo). **Nunca** é usado em `pdf-server.ts`/`gerarPdfHtml`.

| `status` | Rótulo interno |
|---|---|
| `nao_verificado` | "CRM informado — verificação automática em breve" (neutro) |
| `verificado` | "CRM verificado no CFM · <data>" (verde) |
| `reprovado` | "CRM não confirmado — falar com o suporte" (vermelho) |

### 4.4 Cancelar laudo (B7)

Botão "Cancelar" no Histórico (e no laudo emitido) → confirma com motivo →
`/api/exame` `{ acao:'cancelar', wsId, exameId, motivo }` (rota do 2A: devolve franquia,
loga, apaga PDF). Visível só se `podeCancelarLaudo(perfil, exame, uid, papel)`.

## 5. Tratamento de erro

| Situação | Comportamento |
|---|---|
| Médico se cadastra sem CRM/UF | Recusa no cliente e no servidor (`dados_invalidos`) |
| Dono não-médico tenta editar laudo emitido | Banco nega; a UI já não oferece o botão |
| Cancelamento sem motivo | Permitido (motivo é opcional no `/api/exame`), mas a UI pede motivo |
| CNPJ já cadastrado (empresa existente) | Rota recusa com motivo claro; sem criar conta órfã |

## 6. Testes

| Alvo | Prova |
|---|---|
| `regras.test.mjs` | médico-de-verdade edita/reabre; **dono NÃO-médico não edita laudo emitido**; dono administra fila não-emitida; ninguém marca emitido pelo navegador |
| `signup.test.mjs` (PJ) | nasce empresa+conta PJ+local+vínculo dono+assinatura; médico sem CRM → recusa; `crmVerificacao` nasce `nao_verificado`; CNPJ duplicado → recusa; rollback do Auth user |
| `tests/unit/verificar-crm.test.mjs` | no-op retorna `nao_verificado`; contrato da interface estável |
| `tests/unit/permissoes.test.mjs` | `podeCancelarLaudo`: dono sim, médico autor sim, médico não-autor não, recepção não |

## 7. Verificação de CRM — o que a pesquisa achou (resumo, para o B4 futuro)

- **CFM oficial (SOAP `WebServiceConsultaMedicos`):** ~R$948/ano, contrato SEI + chave anual; operação `Consultar(CRM,UF,chave)` → nome/situação; **"A – Regular" = apto**. Resolução CFM 2.309/2022 restringe uso "comercial" → precisa carta de finalidade ("validação interna, sem revenda"). Sólido, porém burocrático.
- **Terceiros REST:** Consultar.IO (~R$0,20/consulta, `Authorization: Token`), InfoSimples (~R$0,24), APIBrasil (~R$0,40). Rápidos; são RPA sobre fonte pública → exigir DPA/LGPD e origem.
- **Descartados:** raspar portal CFM (reCAPTCHA); validar só formato (CRM é sequencial).
- **Regra de negócio quando ligar:** só `status == 'A – Regular'` conta; conferir CRM+UF retornados; cachear curto e revalidar antes de atos críticos.

## 8. Fora deste spec

| Item | Onde |
|---|---|
| Convite por link (WhatsApp) + aceitar via rota + telas | **Plano 2B-B2** |
| Ligar o provedor real de verificação de CRM (Consultar.IO/CFM) | Follow-up, quando o Dr. Sérgio escolher/contratar |
| Unificar a matriz de "quem edita laudo" num ponto de verdade; wrapper único de rota autenticada | Refactors, quando tocarem esses arquivos (não junto do redesenho da regra) |
| Código morto + fallbacks legados | **Plano 3** |
