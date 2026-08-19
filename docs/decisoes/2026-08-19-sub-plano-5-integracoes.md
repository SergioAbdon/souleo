# Sub-plano 5 — Seção Integrações (ADR)

> **Status:** implementado e no ar em 19/08/2026. Regra publicada (ruleset
> `bbc98256-6fd8-44a3-868e-563b7a8ffb42`), migração gravada em produção, merge na
> master (`f2c9e78`). **Pendente:** atualizar o Wader na máquina da clínica e a
> limpeza dos campos antigos.
> **Spec:** `docs/superpowers/specs/2026-08-16-integracoes-design.md` (decisões D1–D6).
> **Plano:** `docs/planos/2026-08-16-plano5-integracoes.md` (8 tasks).

## O problema

`workspaces/{id}.feegowToken`, `.ortancUser` e `.ortancPass` moravam no documento
do local. A regra de leitura desse documento é `alcancaConta` — ou seja, **todo
membro do local que lê o timbre lia o token do Feegow e a senha do Orthanc
junto.** Com a recepção entrando na conta (Seção 1), isso deixou de ser teórico.

O Firestore não tem segurança por campo: protege documento inteiro. Enquanto o
segredo morasse junto do timbre, esconder um sem esconder o outro era impossível.

Faltava também o outro lado: ninguém sabia se a integração estava no ar.

## O que foi feito

| Onde | O quê |
|---|---|
| `workspaces/{wsId}/privado/{tipo}` | o segredo — `feegow.token`, `orthanc.user`/`pass`. Regra `allow read, write: if false`, só Admin SDK alcança |
| `workspaces/{wsId}/integracoes/{tipo}` | configuração e estado — leitura só do dono, **escrita negada a todo cliente** |
| `/integracoes` | tela do dono: três cartões (Feegow, Orthanc, Wader), testar conexão, credencial write-only |
| `POST /api/integracoes` | `testar` / `salvar` / `remover`, só dono, segredo nunca volta ao navegador |
| Wader | lê o segredo do lugar novo e publica batimento a cada 5 min |
| `scripts/integracoes/` | migração e limpeza, dry-run por default |

## Decisões que valem registrar

### A escrita da entidade nova é negada até para o dono

A spec previa `allow read, write: if ehDonoDoLocal(wsId)`. A revisão final mostrou
que a permissão de escrita abria uma segunda porta para o espelho divergir: o dono
poderia gravar `integracoes/orthanc.ativo` direto do cliente sem
`workspaces/{id}.ortancAtivo` acompanhar — e o botão "Importar DICOM" sumiria da
tela do laudo com o Orthanc ligado, sem erro nenhum. Nenhum código cliente escreve
nessa coleção (a tela só lê; rota e Wader usam Admin SDK), então fechar a escrita
não custa nada e transforma a atomicidade do `writeBatch` em garantia.

**Decidido contra o texto do plano, mais fechado.**

### `ortancAtivo` fica duplicado de propósito

`src/components/laudo/SidebarLaudo.tsx:187` usa esse campo para mostrar "Importar
DICOM" **a qualquer médico**, e a entidade nova só o dono lê. Se o sinalizador
mudasse de lugar, o botão sumiria para todo médico que não é dono. O motor é
código intocável.

Então `workspaces/{id}.ortancAtivo` permanece no documento do local, escrito por
`salvarIntegracao` no **mesmo `writeBatch`** de `integracoes/orthanc.ativo`, com
teste-tripwire cobrindo ligar e desligar. A limpeza tem três barreiras
independentes contra apagá-lo: lista fechada campo a campo, `throw` no
carregamento do módulo se ele entrar na lista, e um segundo `throw` exigindo que
todo campo declare como conferir o destino.

### Sem compatibilidade com o lugar antigo (D3)

O Wader lê só o lugar novo. A alternativa — código que tenta os dois lugares —
seria um fallback que ninguém removeria depois. O custo é uma virada coordenada.

### A ordem da virada inverteu: migrar **antes** do deploy

O plano previa deploy → migração. A revisão da Task 7 mostrou por que isso quebra:
com o fallback removido, na janela entre deploy e migração `resolverProcMap` cairia
num mapa hardcoded de 3 entradas (a clínica tem 17) e a importação do Feegow
traria menos pacientes **sem erro nenhum**; e `criar_mwl` responderia
`orthanc_offline`, parando a worklist que chega no Vivid.

Migrar antes é seguro porque a migração é **aditiva**: não escreve nada no
documento do local, então o código antigo continua funcionando igual enquanto os
campos antigos existirem.

### `feegowProcMap` ficou fora da limpeza desta rodada

Não é credencial — o objetivo da fase é tirar segredo do documento do local. Os
dois leitores já migraram (Task 7), então ele pode entrar na limpeza; fica de fora
por prudência, até a verificação confirmar que a importação continua trazendo os
17 procedimentos.

### Estado sem mentira

O cartão não diz "conectado" porque existe credencial gravada: mostra o resultado
do **último teste**, com data. Sem teste, "nunca testado". Trocar a credencial ou o
endereço **zera** o estado para `nunca_testado` — senão o cartão continuaria
dizendo "Conexão OK — testada 18/08" sobre uma credencial recém-colada e nunca
testada. Para o Wader, "no ar" é o batimento recente; um Wader que nunca apareceu
não pode dizer que está no ar.

## Furos fechados no caminho

Achados pelas revisões por task e pela revisão final da branch:

| Gravidade | O furo |
|---|---|
| Crítico | **`FEEGOW_API_TOKEN` do `.env` anulava o sub-plano inteiro.** Qualquer pessoa que se cadastrasse pelo signup público vira `dono` do próprio workspace, passa no gate de papel, cai no fallback — **que é o token real da MedCardio** — e lê CPF/nome/nascimento/telefone de pacientes da clínica, importa a sala de espera dela e altera status de agendamento nela. Fallback removido do código |
| Crítico | **`action=debug_sala` contornava o gate** que a própria task acabara de instalar: fazia a mesma consulta que o `sala_espera` protegido. `action=profissionais` devolvia CRM de médicos de outra clínica. 5 endpoints mortos deletados, gate içado para antes do despacho — ação nova nasce protegida |
| Crítico | **`ConexaoOrthanc` usava `usuario`/`senha`** em vez de `user`/`pass`. Depois da migração o Basic Auth nunca seria montado e o cartão diria "Erro 401" para sempre, com a credencial certa gravada. Passou verde na primeira rodada porque nenhum teste populava a gaveta — todos definiam os próprios nomes de campo |
| Crítico | **A limpeza podia apagar a origem sem o destino ter o valor.** O guard conferia só a existência do documento; a tela pode ter criado `integracoes/orthanc` com valor diferente, o `01` recusa sobrescrever (certo) e o `02` apagava assim mesmo. Agora confere **igualdade** com o valor legado |
| Importante | Mensagem de erro embutia o corpo da resposta do alvo, e o sanitizador tem piso de 6 caracteres: senha curta de clínica (`admin`, `12345`) vazava para a resposta, para o `ultimoErro` no banco e para a tela |
| Importante | Testar com credencial do corpo gravava `status:'ok'`: o dono testava, desistia sem salvar, e o cartão ficava verde sobre credencial inexistente |
| Importante | O formulário do Orthanc semeava só da entidade nova: antes da migração mostraria toggle **desligado** com `ortancAtivo: true`, e salvar faria o botão "Importar DICOM" sumir para todos os médicos |
| Importante | `privado/orthanc` ausente montava conexão com Basic Auth vazio, cacheada por 5 min — loop de 401 contra o Orthanc real na janela da migração |
| Importante | `feegowProcMap` tinha dois donos: a tela nova gravava no lugar novo, a importação lia o antigo — **editar o mapa na tela era no-op silencioso** |
| Importante | `LocalModal` era o segundo escritor de `ortancAtivo`, o que fazia o espelho divergir |
| Importante | `npm run integracoes:migrar --commit` rodava em ensaio silenciosamente (o npm engole a flag sem o separador `--`) |

## Sobra para depois

- **Trocar a senha do Orthanc da MedCardio.** O valor esteve em texto puro em
  `apps/wader/scripts/apontar-orthanc-medcardio.ts` e **continua no histórico do
  git**, num repositório público. O arquivo foi corrigido (lê de variável de
  ambiente), mas isso não desfaz o histórico.
- Remover `FEEGOW_API_TOKEN` das variáveis do Vercel — nada mais lê.
- Atualizar o Wader na máquina da clínica e confirmar que uma imagem entra.
- Só então a limpeza dos campos antigos.
- Console do Wader (`ui/api/orthanc-config.ts`) devolve usuário e os 3 últimos
  caracteres da senha. Só alcançável de `127.0.0.1`, mas é a única resposta HTTP
  da feature que devolve pedaço de credencial.
- `GET /api/orthanc` (~200 linhas, incluindo um parser de SR) não tem chamador
  vivo — candidato a deleção.
- `heartbeat` usa o relógio do PC da clínica; se ele atrasar mais de 15 min o
  cartão diz "sem sinal" com o Wader funcionando.
