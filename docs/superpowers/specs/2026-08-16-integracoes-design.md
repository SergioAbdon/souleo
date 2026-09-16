# Sub-plano 5 — Seção Integrações — Design

> **Status:** desenho aprovado pelo Dr. Sérgio em 16/08/2026. Nada implementado ainda.
> **Antecede:** `docs/planos/2026-08-16-plano5-integracoes.md` (a escrever).
> **Origem:** ADR `docs/decisoes/2026-08-10-secao-integracoes.md` (ideia registrada em
> 09/08) + roadmap `docs/planos/2026-08-13-reestruturacao-roadmap.md` (Sub-plano 5).

## 1. O problema

Hoje as credenciais das integrações moram no documento do local:
`workspaces/{id}.feegowToken`, `.ortancUrl`, `.ortancUser`, `.ortancPass`. A regra
de leitura desse documento é `alcancaConta` — **todo membro do local que lê o
timbre lê junto o token do Feegow e a senha do Orthanc.** Com a recepção
entrando na conta (Seção 1), isso deixou de ser teórico.

O Firestore não tem segurança por campo: protege documento inteiro. Enquanto o
segredo morar junto do timbre, esconder um sem esconder o outro é impossível.

Falta também o outro lado: **ninguém sabe se a integração está no ar.** Não há
onde ver "o Orthanc respondeu?", "o Wader está rodando?", "quando foi a última
sincronização?". Isso se descobre indo até a máquina da clínica.

Levantamento de 16/08 (leitura em produção): **um único local usa integração** —
`LDRtedkanx3bUvxpdmiL` (Grupo MedCardio), com token do Feegow, 17 procedimentos
mapeados e Orthanc ativo. A conta de teste não tem nada configurado; existe um
`wader-dev` de laboratório com Orthanc ativo e 4 mapeamentos.

## 2. Decisões fechadas com o Dr. Sérgio (16/08/2026)

| # | Pergunta | Decisão |
|---|---|---|
| D1 | O que entra nesta fase? | **Só o essencial:** três cartões com estado, testar conexão, credencial write-only, mapeamentos saindo do modal do Local. Console de reconciliação e Wader gerenciado pela nuvem ficam para depois. |
| D2 | O Feegow é da conta ou do local? | **Do local.** Cada unidade terá a sua assinatura do Feegow. A dimensão "escopo conta × local" do ADR original **cai fora** — tudo é por local. |
| D3 | Como virar o segredo do Orthanc sem quebrar o Wader instalado? | **Migrar e atualizar o Wader no mesmo dia**, aceitando a janela. Sem código de compatibilidade com o lugar antigo. Mitigação: virada fora do horário de exame + verificação imediata. |
| D4 | Como o cartão do Wader sabe que ele está no ar? | **Batimento.** O Wader passa a publicar "estou aqui" periodicamente; o cartão mostra "visto há N minutos". Única opção que distingue "parado" de "sem exame hoje". |
| D5 | Quem vê e quem mexe? | **Só o dono do local.** Não é apenas a barra lateral escondendo: a regra nega leitura a médico e recepção. |
| D6 | Modelo de dados | **Entidade própria** (`integracoes`), e não reaproveitar só a gaveta existente. Escolha consciente do Dr. Sérgio, pensando nas integrações futuras (TISS, WhatsApp, outros PACS); custa uma regra nova para publicar. |

## 3. Modelo de dados

### 3.1 A entidade

`workspaces/{wsId}/integracoes/{tipo}` — `tipo` ∈ `feegow` | `orthanc` | `wader`.
O id do documento **é** o tipo, então não há como duplicar integração do mesmo
tipo num local.

Campos comuns:

| Campo | Tipo | O que é |
|---|---|---|
| `tipo` | string | redundante com o id, para leitura em consultas de grupo |
| `ativo` | bool | integração ligada/desligada pelo dono |
| `status` | `'ok'` \| `'erro'` \| `'nunca_testado'` | resultado do último teste de conexão |
| `ultimoTeste` | timestamp | quando o botão "testar" rodou pela última vez |
| `ultimoErro` | string \| null | mensagem do último erro (sem segredo dentro) |
| `ultimaSync` | timestamp \| null | última vez que a integração fez trabalho útil |
| `atualizadoEm` | timestamp | carimbo de escrita |

Campos por tipo:

- **feegow:** `procMap` (mapa `procedimentoId` → `tipoExame`).
- **orthanc:** `url` (endereço; não é segredo).
- **wader:** `visto` (timestamp do batimento), `versao` (string), `maquina` (string).

### 3.2 O segredo

`workspaces/{wsId}/privado/{tipo}` — a gaveta cuja regra **já está publicada** com
`allow read, write: if false` (confirmado em `firestore.rules.PUBLICADA.txt:114`).
Nenhum navegador lê, nem o superadmin. Só Admin SDK: as rotas do servidor e o
Wader (que entra por Service Account).

| Documento | Campos |
|---|---|
| `privado/feegow` | `token` |
| `privado/orthanc` | `user`, `pass` |

O Wader não tem segredo próprio (autentica por Service Account).

### 3.3 O espelho obrigatório: `ortancAtivo`

`src/components/laudo/SidebarLaudo.tsx:187` usa `ortancAtivo` para decidir se
mostra o botão "Importar DICOM" **na tela do laudo, para qualquer médico**. O
motor é código intocável, e a entidade `integracoes` só o dono lê — se o
sinalizador se mudasse para lá, o botão sumiria para todo médico que não é dono.

Portanto **`workspaces/{id}.ortancAtivo` permanece no documento do local**, escrito
pela tela de Integrações junto com `integracoes/orthanc.ativo`, na mesma escrita.
É duplicação deliberada de um booleano, com o mesmo padrão de espelho usado no
Sub-plano 3 (seeds): **um teste-tripwire garante que os dois não divirjam.**

`ortancUrl` **não** precisa de espelho — nenhum código cliente o lê; quem usa é a
rota `/api/orthanc` (Admin SDK) e o Wader.

## 4. Regras

Um bloco novo, dentro de `match /workspaces/{wsId}`:

```
// Integracoes: configuracao e estado. Segredo NAO mora aqui (vai em privado/).
match /integracoes/{tipo} {
  allow read, write: if ehDonoDoLocal(wsId);
}
```

O batimento do Wader e a gravação do resultado do teste vêm de Admin SDK, que
passa por cima das regras — a regra acima não precisa abrir nada para eles.

Teste de regra obrigatório (`tests/rules/regras.test.mjs`), com payload real:
dono lê e escreve; médico do local **não** lê; recepção **não** lê; membro de
outra conta **não** lê; ninguém escreve em `privado/{tipo}` pelo cliente.

## 5. A tela

Rota `/integracoes` no shell da plataforma, item novo na barra lateral **visível
só para o papel `dono`** (mesmo mecanismo de gate de `/financeiro` em
`src/lib/nav.ts`, com `podeVerIntegracoes` espelhando a matriz de permissões).

Três cartões, no vocabulário V7 (`bg-card`, `border-borda`, `text-ink*`), zero hex:

| Cartão | Mostra | Ações |
|---|---|---|
| **Feegow** | estado do último teste · data do último teste · nº de procedimentos mapeados · se há token cadastrado (e quando) | testar conexão · trocar token · editar mapa de procedimentos |
| **Orthanc** | ativo/inativo · endereço · estado do último teste | testar conexão · trocar endereço/usuário/senha · ligar/desligar |
| **Wader** | "visto há N minutos" ou "sem sinal desde \<data\>" · versão · máquina | nenhuma (só leitura nesta fase) |

### 5.1 Credencial write-only

O campo de credencial **nunca vem preenchido**. Mostra `Cadastrado em 12/08/2026`
ou `Não cadastrado`, e um campo vazio para digitar a substituição.

Regra de gravação (mesma defesa #7c que protege o CPF na Agenda): **campo vazio
significa "não mexe", nunca "apaga"**. Para remover uma credencial existe um botão
explícito de remover, com confirmação.

### 5.2 Estado sem mentira

O cartão não pode dizer "conectado" com base em "existe um token gravado". O que
ele mostra é o resultado do **último teste de conexão**, com a data. Sem teste
nenhum, o estado é "nunca testado" — não "ok".

Para o Wader, "no ar" é o batimento: `visto` há menos de 15 minutos → no ar;
mais que isso → "sem sinal desde \<data e hora\>".

## 6. Rotas do servidor

### 6.1 Testar conexão

Uma rota por integração, ou uma rota com `acao: 'testar'` — decisão do plano. O
que o desenho exige:

- Autenticada, e **só o dono do local** passa (`resolverPapel` no servidor; o gate
  de tela não basta).
- Lê o segredo da gaveta com Admin SDK, bate no alvo (Feegow: endpoint leve da
  API; Orthanc: `GET /system`), e grava `status`, `ultimoTeste` e `ultimoErro` no
  documento da integração.
- **Nenhum segredo volta para o navegador**, em nenhuma resposta, nem em mensagem
  de erro. A mensagem de erro é sanitizada antes de ser gravada.
- Testar **antes** de salvar (credencial nova ainda não gravada): a credencial
  digitada viaja no corpo da requisição para a rota, é usada para o teste e
  **não é persistida** se o usuário não salvar.

### 6.2 Endurecimento herdado do Sub-plano 2

Follow-up registrado no ledger da Seção 2, que vence nesta fase:

1. **`resolverToken` aceita `x-feegow-token` arbitrário** (`src/app/api/feegow/route.ts:53`):
   qualquer chamador autenticado pode mandar um token próprio e usar a rota como
   proxy. Depois desta fase o cabeçalho **deixa de ser aceito**: o token vem sempre
   da gaveta. O único caminho em que uma credencial digitada viaja para o servidor
   é o corpo da requisição de **testar** (§6.1), que exige papel `dono` e não
   persiste nada.
2. **GETs sem gate de papel** (`buscar_cpf`, `sala_espera`): passam a exigir
   `resolverPapel` com o `wsId` da requisição, como o POST `importar` já faz.

## 7. Wader (`apps/wader`)

Duas mudanças, ambas na mesma atualização que vai para a máquina da clínica:

1. **`workspace-repo.ts:69-79`** passa a ler usuário e senha do Orthanc em
   `workspaces/{wsId}/privado/orthanc`, e o endereço em
   `workspaces/{wsId}/integracoes/orthanc.url`. **Sem compatibilidade com o lugar
   antigo** (decisão D3).
2. **Batimento:** escreve `visto`, `versao` e `maquina` em
   `workspaces/{wsId}/integracoes/wader` a cada 5 minutos. Uma escrita pequena,
   com falha silenciosa (o batimento nunca pode derrubar a ingestão de imagem).

## 8. Migração e ordem da virada

Um script em `scripts/`, no padrão dos anteriores: **dry-run por default**,
`--commit` para gravar, idempotente, e recusa rodar se o destino já existe com
conteúdo diferente.

O que ele faz, por local que tenha configuração: cria `integracoes/feegow`
(com `procMap`), `integracoes/orthanc` (com `url`, `ativo`), `privado/feegow`
(`token`) e `privado/orthanc` (`user`, `pass`). **Não apaga nada** — a limpeza dos
campos antigos é um segundo passo, depois da verificação.

Ordem, no mesmo dia e **fora do horário de exame** (D3):

1. Publicar a regra (com confirmação do Dr. Sérgio).
2. Merge + deploy do código.
3. Rodar a migração com `--commit` (1 local real + `wader-dev`).
4. Atualizar o Wader na máquina da clínica.
5. Verificar: cartões mostram estado, testar conexão dá verde, **e uma imagem
   entra de verdade** pelo Wader.
6. Só então rodar a limpeza dos campos antigos do documento do local
   (`feegowToken`, `ortancUser`, `ortancPass`, `ortancUrl`, `feegowProcMap` —
   **exceto `ortancAtivo`**, que fica por causa do espelho da §3.3).

## 9. O que sai do modal do Local

`src/components/LocalModal.tsx` perde os campos de integração (token do Feegow,
mapa de procedimentos, endereço/usuário/senha do Orthanc) e volta a ser o que o
nome diz: dados da unidade e timbre. O componente é grande e tangido; a remoção
deve deixá-lo menor, não reorganizá-lo.

## 10. Fora de escopo (nomeado para não voltar por engano)

- Console de reconciliação do Wader (ver o que trouxe, reprocessar preso) — ADR de 26/06.
- Wader gerenciado pela nuvem: configuração e atualização remota — ADR de 17/05.
- Google Secret Manager: mais correto, mais caro de operar. Fica registrado como
  caminho futuro se a exigência de conformidade aparecer.
- Integrações novas (TISS, WhatsApp, outros PACS): a entidade nasce preparada
  para elas, mas nenhuma entra agora.
- Alerta ativo ("me avisa quando o Wader cair"): a tela mostra, não notifica.

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Janela sem Wader entre a migração e a atualização na clínica (D3) | Virada fora do horário de exame; verificação de imagem real no passo 5 antes de limpar qualquer campo |
| Espelho `ortancAtivo` divergir do `integracoes/orthanc.ativo` | Escrita única (as duas no mesmo `writeBatch`) + teste-tripwire |
| Regra nova fechar demais e quebrar tela existente | Teste de regra com payload real antes de publicar; a única leitura cliente que existia (`ortancAtivo`) fica fora da entidade por desenho |
| Mensagem de erro do teste vazar credencial no `ultimoErro` | Sanitizar antes de gravar; teste com resposta de erro que contenha o token |
| Migração rodar duas vezes | Script idempotente, dry-run por default, recusa sobrescrever destino divergente |
