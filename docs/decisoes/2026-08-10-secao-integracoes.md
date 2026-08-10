# 2026-08-10 — "Integrações" como seção própria do LEO

> **Status:** 💡 **Ideia registrada, NÃO implementada.** Direção acordada com o
> Dr. Sérgio em 09/08/2026. Nada aqui está no código.
> **Origem:** ao fechar a Seção 1, ficou claro que qualquer membro que lê o
> documento do local lê junto o token do Feegow e a senha do Orthanc. A resposta
> do Dr. Sérgio: *"você pode abrir uma seção chamada Integrações — estamos
> reorganizando o LEO, não precisa ser tão engessado."*

## 1. O diagnóstico

Integração não existe como conceito no LEO. Ela está esfarelada em quatro
lugares, nenhum deles pensado para isso:

| Onde vive hoje | O quê | Problema |
|---|---|---|
| `workspaces/{id}.feegowToken` | token da API do Feegow | texto puro, no mesmo documento que guarda o timbre — quem lê o timbre lê o token |
| `workspaces/{id}.ortancUrl/User/Pass` | credencial do Orthanc | idem; e o Wader lê daqui (`workspace-repo.ts:69-79`) |
| `workspaces/{id}.feegowProcMap` | procedimento Feegow → tipo de exame | configuração de integração misturada com dados do local |
| `wader.config.json` na máquina da clínica | tudo do Wader | invisível pela nuvem; só se vê indo até lá |
| **Nenhum lugar** | está conectado? última sincronização? deu erro? | ninguém sabe sem abrir console |

O Firestore **não tem segurança por campo** — protege documento inteiro. Enquanto
o segredo morar junto do timbre, esconder um sem esconder o outro é impossível.
Não é limitação de regra: é o modelo que está errado.

## 2. A direção

Integração vira **entidade de primeira classe**, com tela própria.

- `integracoes/{id}`: `escopo` (`'conta'` | `'local'`), `tipo` (`'feegow'`,
  `'orthanc'`, `'wader'`, `'aparelho'`), `status`, `ultimaSync`, `ultimoErro`.
  Feegow é da **conta** (a agenda é da clínica); Orthanc e aparelho são do
  **local** (a máquina é física).
- **Segredo em subcoleção que nenhuma regra libera para o cliente.** Só Admin SDK
  (as rotas `/api/feegow` e `/api/orthanc`, que já resolvem token no servidor) e o
  Wader, que usa Service Account.
- Credencial **write-only** na tela: digita uma vez e nunca mais volta, como
  senha de banco. Esqueceu? Digita outra.
- Tela "Integrações": cada uma com seu estado, botão de testar conexão, e o
  histórico de sincronização.

## 3. Por que vale além da segurança

- É onde o **console de reconciliação do Wader** (ADR de 26/06) naturalmente
  aparece dentro do LEO, em vez de numa página solta em `localhost:8043`.
- É o alicerce do **Wader como plugin gerenciado pela nuvem** (ADR de 17/05):
  configuração, monitoramento e atualização vindos do LEO.
- É onde entram as próximas: TISS/faturamento, WhatsApp, outros PACS.

## 4. Relação com a Fase 6 da Seção 1

A Fase 6 (mover os segredos para `workspaces/{id}/privado` + 3 linhas no Wader)
continua sendo o **caminho curto** se a urgência aparecer antes. Esta seção é o
caminho certo: resolve a causa, não o sintoma, e a Fase 6 vira um passo dela.

Enquanto nenhuma das duas acontecer, vale saber: **todo membro do local lê os
segredos daquele local.** Com a recepção entrando na conta, isso deixou de ser
teórico.

## 5. Não decidido

- Se `integracoes` é coleção raiz ou subcoleção de `contas`/`workspaces`.
- Como o Wader publica o próprio estado (escreve direto no Firestore? rota?).
- Se a credencial fica no Firestore (com regra fechada) ou num cofre de verdade
  (Secret Manager). O segundo é mais correto e mais caro de operar.
