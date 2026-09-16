# 2026-08-16 — Seção Pacientes (Sub-plano 4) no ar

> **Status:** ✅ **No ar em produção.** Merge `be3cfc2` + fix `5b8ee60` na master,
> deploy Vercel verificado. **Zero mudança de regra e zero migração** — foi o
> sub-plano de menor risco do sprint: só código sobre dados que já existiam.
> **Origem:** roadmap da reestruturação (`docs/planos/2026-08-13-reestruturacao-roadmap.md`),
> plano `docs/planos/2026-08-15-plano4-pacientes.md`.

## 1. O que entrou

| Tela | O quê |
|---|---|
| `/pacientes` | Lista ordenada por nome, busca única que filtra por nome (sem acento de caixa) **ou** por CPF (só dígitos), CPF **mascarado** (`***.***.***-NN`) |
| `/pacientes/{id}` | Ficha: CPF completo e formatado, nascimento com idade, sexo, telefone, convênio + **linha do tempo** de todos os exames |
| Modal de edição | Mesmos campos e mesmas defesas do cadastro da Agenda, na própria ficha |
| Agenda | Nome do paciente na fila virou **link** para a ficha (quando o exame tem `pacienteId`) |

A linha do tempo usa o catálogo `tiposLaudo` para o rótulo do tipo **e** para
decidir o botão: PDF emitido abre o PDF; laudo de texto vai pro `/laudo-texto`;
laudo de motor vai pro `/laudo`. O motor e o Direx não foram tocados.

## 2. As decisões que mudaram o plano

O plano escrito na sessão anterior tinha três pontos que não sobreviveram ao
contato com o código real. Todos foram decididos com o Dr. Sérgio.

### 2.1 O campo do nascimento não era o que o plano dizia

O plano falava em `nascimento`. O banco guarda **`dtnasc`** — é o que a Agenda
grava (`Worklist.tsx`) e o que o import do Feegow grava (`feegow-admin.ts`).
Pior: o único `nascimento` do repositório é a **resposta da API do Feegow**, que
vem em `dd-mm-aaaa`. Se um documento tivesse essa chave, a data apareceria
invertida e a idade sairia como "Invalid Date". A tolerância `nascimento ||
dtnasc` foi **removida**: lê-se `dtnasc` e ponto.

**Lição:** plano escrito de memória sobre nome de campo é chute. Conferir no
código que grava, não no que lê.

### 2.2 Exame por PDF não pode cair no motor de ECO

O plano mandava "texto vai pro `/laudo-texto`, senão `/laudo`". Só que `/laudo`
é o motor do ecocardiograma e **não tem guard de modalidade** (é código
intocável). Um ECG ou Holter cairia no motor errado. Na ficha, exame de
modalidade `pdf` sem PDF anexado oferece **"Ver na Agenda"** — anexar PDF
continua sendo do fluxo da fila.

### 2.3 Corrigir o nome na ficha agora chega aos exames abertos

O plano dizia que a ficha não toca nos exames. Isso era defensável **até** o
nome na Agenda virar link: o caminho natural passou a ser *ver o nome errado na
fila → clicar → corrigir → voltar → a fila continua com o nome velho*, o que o
operador lê como "não salvou".

**Decisão do Dr. Sérgio:** ao salvar a ficha, os exames do paciente que **ainda
não foram emitidos** recebem o nome e o CPF corrigidos, na **mesma escrita**
(um `writeBatch` com a ficha e os exames — a mesma atomicidade que a S2-T3
implantou). Laudo já emitido **não** é tocado: o PDF preserva o nome histórico
do documento. Exame `cancelado` fica de fora porque a regra nega escrita de
cliente nele, e um documento negado derrubaria o lote inteiro.

A defesa **#7c** continua valendo: CPF ou telefone em branco nunca sobrescrevem
o valor existente — CPF é a chave de pareamento do DICOM.

### 2.4 Não realizado: fora da linha do tempo, e sem janela

Exame `nao-realizado` **não aparece** na linha do tempo (política de 09/05: o
histórico do paciente não mostra falta). O rodapé conta quantos são.

**Decisão do Dr. Sérgio:** a contagem é do **histórico inteiro**, não dos
últimos 30 dias como o plano pedia. Motivo: quem marca "não realizado" é a
rotina da meia-noite, que também pega exame que foi feito mas ninguém abriu pra
laudar — com janela de 30 dias, esse exame sumia de vez da ficha.

## 3. O que a revisão final pegou

A revisão de branch inteira (independente das revisões por tarefa) devolveu
`NEEDS FIXES` com três achados importantes — os itens 2.1, 2.3 e 2.4 acima — e
mais um na re-revisão:

**Status desconhecido mentia na tela.** A pílula de status cai para "Aguardando"
em qualquer valor que ela não conheça, enquanto a decisão do botão usava o valor
cru. Resultado: exame `cancelado` (ou os legados `imagens-recebidas` /
`erro-imagens` que existem em exames reais) aparecia como "⏳ Aguardando" com um
botão "Abrir laudo" ao lado — de um exame cuja franquia já tinha sido devolvida.
Corrigido na **fonte única**: `StatusPill` ganhou o estilo `cancelado` e exporta
a normalização que a ficha consome, então pílula e ação leem o mesmo valor.

**Privacidade: auditada e limpa.** Nada de paciente em query string (só o id do
documento no caminho), nada de dado pessoal no console, CPF mascarado na lista,
e o Sentry está com session replay em zero — a lista de pacientes não vaza pra
terceiro.

## 4. Verificação

| Bateria | Resultado |
|---|---|
| unit | 52/52 (eram 35; +17 dos helpers novos) |
| regras | 118/118 (nenhuma regra mudou) |
| api | 83/83 |
| `tsc` + `next build` | limpos |
| Playwright (etapa 3) | 5/5 |
| Smoke logado da seção nova | ficha com CPF formatado, idade, linha do tempo com o exame, edição gravando e recarregando, máscara e busca por CPF na lista, zero erro de console |

O E2E falhou uma vez com 4/5 — **não era regressão**: eram exames de teste
residuais da sessão anterior. Com dois pacientes de mesmo nome na fila, o
seletor do Playwright casa com dois elementos e estoura. A causa raiz é do
próprio teste: a limpeza pergunta quantas linhas existem **antes de a fila
carregar**, recebe zero e sai calada, deixando lixo que quebra a rodada
seguinte. **Follow-up para o Sub-plano 5.**

## 5. Fica para depois

- Limpeza do teste E2E (acima) — o lixo se acumula a cada rodada.
- Propagação assimétrica: a ficha edita nascimento, sexo e convênio, mas só nome
  e CPF viajam para os exames abertos. Corrigir o nascimento na ficha deixa o
  antigo no cabeçalho do laudo de um exame já aberto.
- `/pacientes` carrega a coleção inteira sem paginação (o Histórico pagina com
  cursor). Irrelevante no volume atual, é o único ponto da seção que não escala.
- `loading` não desliga se o workspace vier vazio — padrão pré-existente do repo
  (`Historico.tsx` faz igual), conserta-se em todo lugar de uma vez ou em nenhum.
- Segurança dos GETs do Feegow com `wsId` (herdado do Sub-plano 2).
