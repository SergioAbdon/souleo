# 2026-08-10 — Conta duplicada (Yahoo × Gmail) trava a clínica após a fechadura

> **Status:** ✅ **Diagnosticado e contornado na clínica em 10/08/2026.** Contorno
> não invasivo (troca de login). **Causa raiz de dados permanece** — decisão de
> consolidação é da Seção 1 (Claude do notebook).
> **Dono do achado:** Claude da clínica (MedCardio).
> **Ler antes de mexer em:** `src/lib/contas.ts`, `src/contexts/AuthContext.tsx`,
> `firestore.rules` (fechadura definitiva), e qualquer coisa de vínculo/conta.

---

## 1. Sintoma relatado

Dr. Sérgio, na clínica, logado no LEO: **o Feegow parou de "linkar" / a worklist
não sincroniza.** Nenhum paciente da sala de espera entrava na fila, mesmo com
pacientes agendados no Feegow. Não havia mensagem de erro clara — a fila
simplesmente ficava vazia.

## 2. O que foi verificado (e descartado)

Diagnóstico de ponta a ponta, na máquina da clínica, contra os dados reais:

| Verificação | Resultado |
|---|---|
| Token Feegow no workspace | ✅ válido (172 chars) |
| API Feegow `/professional/list` (teste de conexão) | ✅ HTTP 200 |
| Sala de espera de hoje (`/appoints/search status_id=4`) | ✅ **5 agendamentos** |
| Procedimentos casam com `feegowProcMap` | ✅ **5 de 5** (eco_tt, doppler…) |
| Workspace migrado (Seção 1) | ✅ tem `contaId` + `ownerUid` |
| Wader rodando e gerando `.wl` | ✅ |

**Conclusão parcial:** a integração Feegow (token, API, mapa de procedimentos)
estava 100% funcional. O import *server-side* geraria os 5 pacientes. O furo
estava **depois** — na gravação client-side dos exames, que passa pela fechadura.

**Achado que fechou o caso:** o último exame criado na coleção foi de **03/08**
(origem FEEGOW). De 04 a 10/08, **zero** exames — apesar de haver 5 pacientes no
Feegow hoje. Ou seja: o cadastro pelo navegador parou de gravar.

## 3. Causa raiz — DUAS contas do mesmo Sérgio

A migração da Seção 1 (Fases 1-3, 09/08) criou **duas contas** para a mesma
pessoa, e a fechadura definitiva (publicada 10/08 15:11 UTC) passou a separá-las
de verdade:

| Login LEO | e-mail | uid | Conta (Seção 1) | Relação com a clínica |
|---|---|---|---|---|
| **Yahoo** | `sergio_abdon@yahoo.com.br` | `PK7UMR0fBDOdiaRLA9XzxtsUVQw2` | PF `9PVCwndEgf9SWShFKkzf` | ✅ **DONA** do workspace da clínica (`LDRtedkanx3bUvxpdmiL`) e dos **191 exames** — todos criados por este uid |
| **Gmail** | `sergio.abdon@gmail.com` | `D49eVo1PQHMTzs0V2hEAVAR323I3` | PJ `WZJnmo3PYBbnL7lxaeba` | ❌ conta PJ separada, **sem vínculo na conta `9PVC`** |

- O workspace da clínica `LDRtedkanx3bUvxpdmiL` tem `contaId = 9PVC` (conta Yahoo).
- Vínculos no formato novo (`{contaId}_{uid}`):
  - `9PVC_PK7U` → papel `dono`, `locais: []` (todos) → **Yahoo alcança a clínica**.
  - `WZJn_D49e` → papel `dono` → **Gmail só alcança a conta PJ vazia**.
  - (`D49e` tem só um vínculo legado `master` sem `contaId`, ignorado por
    `getVinculosDoUsuario` em `contas.ts:24` porque filtra `!!v.contaId`.)

**Mecânica da quebra** (`firestore.rules`, regra de `exames`): tanto `read`
quanto `create` exigem `alcancaLocal(wsId)`, que resolve
`contaDoLocal(wsId) = 9PVC` e checa `temVinculo(9PVC)` = existe
`vinculos/9PVC_{uid}` ativo com papel válido.

- Logado como **Yahoo/PK7U** → `vinculos/9PVC_PK7U` existe → **libera ler a fila
  e gravar exames**. Tudo funciona.
- Logado como **Gmail/D49e** → `vinculos/9PVC_D49e` **não existe** → a fechadura
  **nega leitura E escrita** da fila do local `9PVC`. Fila vazia + import falha.
  E como o AuthContext resolve o contexto da Gmail para a conta PJ `WZJn` (que não
  tem workspace), a Gmail nem "vê" a clínica.

O Dr. Sérgio havia trocado o login do LEO para a conta **Gmail**. A partir da
fechadura de hoje, isso derrubou o acesso à clínica.

> Observação: antes disso, a tranca provisória (Fase 0.5, 09/08) já isolava por
> `workspaces.ownerUid` (= PK7U). Então a Gmail provavelmente já estava sem
> acesso desde 09/08; a fechadura definitiva só tornou o bloqueio total e
> definitivo. O último import bem-sucedido (03/08) é anterior a tudo isso.

## 4. Solução aplicada (contorno, sem tocar em produção)

**Login no LEO com a conta Yahoo (`sergio_abdon@yahoo.com.br`)**, que é a dona da
clínica (`9PVC`). A fila voltou na hora e o import do Feegow funcionou — os 5
pacientes de hoje entraram. **Zero mudança de dados, zero risco à fechadura.**

Dr. Sérgio confirmou (10/08): **vai continuar usando a conta Yahoo.**

## 5. Pendência para a Seção 1 (Claude do notebook)

A causa de dados continua lá: **duas contas para a mesma pessoa**, sendo que a
Gmail (`D49e` / conta PJ `WZJn`) está **órfã** (sem workspace, sem uso) e é uma
armadilha — se alguém logar nela, a clínica "some" de novo pelo mesmo motivo.

Decisões a tomar (não resolvidas aqui — são de arquitetura de contas):

- **Consolidar** os dois logins numa conta só? Se sim, qual sobrevive (a Yahoo,
  que tem os dados) e o que fazer com o e-mail Gmail?
- Ou **dar acesso** à Gmail na conta `9PVC` criando `vinculos/9PVC_D49e`? (Não
  recomendado agora: a decisão do Dr. Sérgio é ficar na Yahoo, e criar vínculo
  cruzado mistura duas contas que talvez devam virar uma.)
- Vale a UI de login **avisar** quando o usuário entra numa conta sem nenhum
  local acessível (hoje falha silenciosa → tela vazia), em vez de fila vazia sem
  explicação. Casa com o item de tratamento de erro do ADR da Seção 1 (§6:
  "falha é falha: mensagem + tentar de novo").

## 6. Lição

A fechadura fez **exatamente** o que devia (isolou contas). O incidente não foi
bug de regra — foi **dado de migração ambíguo** (uma pessoa, duas contas) somado
a **falha silenciosa no login** quando a conta não alcança nenhum local. O
sintoma ("Feegow não linka") apontava para o lugar errado; a integração estava
intacta. Regra prática: quando "parar de sincronizar" logo após publicar regras,
**checar primeiro qual conta/uid está logado e se ele alcança o workspace**,
antes de suspeitar da integração.
