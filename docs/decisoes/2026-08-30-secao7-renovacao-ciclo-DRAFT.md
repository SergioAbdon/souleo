# DRAFT — E11: renovação do ciclo de franquia (aguardando decisão do Sergio)

**Data:** 30/08/2026 · **Status:** ✅ DECIDIDO 30/08: Opção D (Sergio, via sessão).
Implementado (`src/lib/emitir-admin.ts` + `src/lib/billing.ts` + fix do "estender"
manual). Arquivo **não renomeado de propósito** — o ADR final da onda consolida;
isto continua sendo o registro de contexto/comparativo das 4 opções.

**Decisões de implementação** (tomadas na sessão que codou, seguindo os princípios
deste draft onde ele deixava aberto — nenhuma é política nova):
- **"Ativa"** = `franquiaMensal > 0` — não existe campo `status` na assinatura (§1b);
  este é o mesmo marcador que `bloquear_workspace` (Marina) já usa pra suspender.
- **Trial** (`sub.tipo === 'trial'`) **não gira** — mantém os 30 dias fixos, o Direx
  converte na mão (§3, a opção "mais simples" do draft).
- **Legado sem o campo `tipo`** (`sub.tipo === undefined`) **gira normal** — só trial
  fica de fora do predicado (`sub.tipo !== 'trial'`), então uma conta paga antiga sem
  esse campo não fica presa pra sempre.
- **Assinatura sem `cicloFim`** não gira (guard `cicloFim &&` — nunca compara contra
  null/Invalid Date).
- Gap de múltiplos ciclos parados: rola em passos de +30d a partir do `cicloFim`
  ANTIGO (não de "agora") num loop, até ficar no futuro — um único +30d não bastaria.

**Pendência para o merge (Sergio a confirmar):** devolução cruzada de ciclo —
cancelar um laudo emitido no ciclo VELHO devolve a franquia (`franquiaUsada -= 1`,
`exame-admin.ts`) que hoje já pode estar no ciclo NOVO (girado por outra emissão no
meio). Efeito: a devolução "vaza" pro ciclo novo em vez de ficar presa no antigo —
limitado (não pode devolver mais franquia do que existe), favorece o cliente (nunca
cobra a mais), e é auditável (ledger `consumo`/`logs` mostra os dois ciclos). Default
aceito por ora; upgrade futuro se virar problema real: carimbar o `cicloFim` vigente
no momento da cobrança dentro do próprio doc de `consumo`, e a devolução comparar
contra esse carimbo antes de decidir se ainda vale.

**Origem:** Seção 7 (emissão), achado E11 · decisão-irmã: E13 (segue em aberto,
não tocada por esta implementação)
**Natureza:** decisão de **política de cobrança**, não bug de código. O texto abaixo
(problema, as 4 opções, comparativo) é o registro de como se chegou na Opção D —
mantido como está.

---

## 1. O problema hoje

### A analogia

A franquia é um **talão de requisições**: 600 laudos por mês. Hoje o talão é entregue uma vez,
na abertura da conta, com validade de 30 dias carimbada. Ninguém emite talão novo no mês
seguinte — nem devolve as folhas usadas. No dia 31 o médico chega no consultório e o talão
está vencido e vazio ao mesmo tempo.

### O que o código faz

| Momento | Onde | O que acontece |
|---|---|---|
| Cadastro | `src/lib/signup-server.ts:168` | `franquiaUsada: 0`, `creditosExtras: 0` |
| Cadastro | `src/lib/signup-server.ts:173-174` | `cicloInicio = agora`, `cicloFim = agora + 30 dias` |
| Cadastro (caminho antigo/cliente) | `src/lib/billing.ts:148-149` | idem — `fimTrial = agora + 30 dias` |
| Cada emissão | `src/lib/emitir-admin.ts:363` | `franquiaUsada += 1` |
| Cancelar/devolver exame | `src/lib/exame-admin.ts:121` | `franquiaUsada -= n` (devolução) |
| **Zerar `franquiaUsada`** | **— não existe no repositório —** | nunca acontece |
| **Rolar `cicloFim`** | só na mão: `src/app/api/marina/route.ts:477` ("renovar_trial") e `src/app/direx/painel/licencas/page.tsx:109-121` | um humano precisa clicar |

`src/app/api/cron/` tem exatamente **dois** crons — `cleanup-worklist` e `shadow-diario`
(`vercel.json:2-11`). Nenhum toca em assinatura.

### O que acontece no dia 31

A porta de entrada de toda emissão é `src/lib/emitir-admin.ts:333-341`, dentro da transação:

| Ordem | Condição | Resultado |
|---|---|---|
| 1 | `agora <= cicloFim` **e** `franquiaUsada < franquiaMensal` | emite pela **franquia** |
| 2 | `creditosExtras > 0` | emite por **crédito** (mesmo com o ciclo vencido — ver §3) |
| 3 | `agora > cicloFim` e sem crédito | **`expirado`** — emissão bloqueada |
| 4 | resto (dentro do ciclo, franquia estourada, sem crédito) | **`sem_saldo`** — emissão bloqueada |

O pré-voo do cliente (`src/lib/billing.ts:194-203`) repete a mesma ordem, então a tela avisa
antes — mas o efeito é o mesmo: **no dia 31 toda conta para de emitir laudo** até alguém
estender na mão. E se a franquia estourar antes do dia 30, para igual (linha 4): o excedente
existe no modelo comercial e é barrado pelo código — esse é o achado E12, decisão separada.

### Como a clínica opera hoje

Hoje a MedCardio é uma conta só e o Sergio estende na mão quando trava. Isso funciona para
uma conta. Não funciona para dez.

### ⚠️ Dois problemas na saída de emergência manual

**(a) O painel do Direx não enxerga as contas novas.** A tela de Licenças junta workspace com
assinatura por `s.workspaceId === ws.id` (`licencas/page.tsx:146`), e a Marina consulta
`where('workspaceId','==',ws.id)` (`marina/route.ts:473`). Mas a assinatura criada pelo cadastro
novo é gravada em `subscriptions/{contaId}` **deliberadamente sem `workspaceId`**
(`signup-server.ts:163-165` — o comentário explica: duas assinaturas casariam na busca antiga e a
franquia oscilaria). Resultado: para conta criada pelo cadastro novo, a linha aparece com
"Expira —" e o botão de estender **não acha assinatura nenhuma**. Ou seja: hoje a saída de
emergência manual só funciona para as contas legadas.

**(b) Não existe campo de status na assinatura.** `status: 'ativa'` existe na **conta**
(`signup-server.ts:143`) e na empresa, nunca na assinatura. Suspender hoje é a Marina zerar a
franquia (`marina/route.ts:437`: `franquiaMensal: 0, creditosExtras: 0`) — um efeito colateral,
não um estado. Qualquer opção automática precisa primeiro de um interruptor explícito de
"esta conta pode girar".

---

## 2. As quatro opções

### Resumo em uma frase

| | Ideia |
|---|---|
| **A** | Um cron diário gira o ciclo sozinho; o Direx passa a ser quem **desliga** (inadimplência), não quem liga. |
| **B** | O cron só gira até a data que o Direx marcou como paga (`pagoAte`); sem pagamento confirmado, não gira. |
| **C** | Nada gira sozinho; o sistema só **avisa** com antecedência e o humano estende como hoje. |
| **D** | Sem cron nenhum: o próprio `emitirComCobranca` gira o ciclo dentro da transação de emissão, quando percebe que `cicloFim` venceu. |

### Comparativo

| Critério | **A — cron renova, Direx suspende** | **B — renova até `pagoAte`** | **C — só alerta** | **D — gira na emissão, sem cron** |
|---|---|---|---|---|
| O que muda no dado | `franquiaUsada → 0`, `cicloFim += 30d` na virada; grava log | idem, mas só enquanto `cicloFim < pagoAte`; Direx grava `pagoAte` ao confirmar pagamento | nada muda | mesmo giro de A (`franquiaUsada → 0`, `cicloFim += 30d`), mas só quando ALGUÉM tenta emitir depois do vencimento — dentro da MESMA transação que já lê `subRef` |
| Quem precisa agir todo mês | ninguém (só para **cortar** um inadimplente) | o Direx, em toda conta, todo mês (marcar pago) | o Direx, em toda conta, todo mês (estender) | ninguém (mesmo que A) |
| Risco de dar franquia de graça | **Alto se ninguém suspender.** Quem não pagar continua emitindo até alguém mudar o status. Detecta-se rápido (a lista de inadimplentes existe), mas o prejuízo é de laudos já emitidos. | **Baixo.** O sistema nunca renova sem alguém ter afirmado que o dinheiro entrou. | **Nenhum.** Ninguém emite de graça — o problema é o oposto: quem pagou também para. | mesmo risco de A (se ninguém suspender) — mas uma conta PARADA (ninguém tenta emitir) não acumula ciclos vencidos sozinha, porque nada gira até a próxima tentativa |
| Risco do lado do cliente | baixo — ninguém para no dia 31 | médio — se o Direx esquecer de marcar o pagamento, a conta para igual hoje | **alto — é o estado atual:** todo mundo para no dia 31 | baixo — mas com um **teto**: o painel do Direx mostra `cicloFim` VELHO até a 1ª emissão do novo ciclo acontecer (o giro só existe quando alguém emite) |
| Trabalho manual restante | cobrar (fora do sistema) + suspender inadimplente | cobrar + registrar pagamento + suspender | cobrar + estender conta por conta | mesmo que A |
| Campos novos | `status` na assinatura (`'ativa' \| 'suspensa'`) | `status` + `pagoAte` + gravação no fluxo de pagamento do Direx | nenhum (o alerta de expiração já existe em `direx/painel/page.tsx:110-135`) | mesmo que A (`status`) |
| Esforço | **Pequeno** — 1 rota de cron ~60 linhas no molde do `cleanup-worklist`, 1 linha no `vercel.json`, 1 seletor no painel | **Médio** — cron + campo + UI de pagamento + regra de Firestore para `pagoAte` | **Muito pequeno** — o alerta já existe; falta o e-mail/aviso ao médico, X dias antes | **Menor que A** — zero rota nova, zero peça de infraestrutura (sem `CRON_SECRET`, sem entrada no `vercel.json`, sem agendamento) — só um bloco a mais dentro de uma transação que já lê `subRef` |
| Pré-requisito comum | corrigir o join `workspaceId` da §1(a) — senão nem cron nem painel acham as contas novas | mesmo | mesmo (o alerta também depende do join) | mesmo |

### Detalhe da A (a recomendada)

Um cron diário `renovar-ciclos`, no mesmo molde dos dois existentes (`CRON_SECRET`
fail-closed, `runtime = 'nodejs'`, erro parcial devolve 500 — `cleanup-worklist/route.ts:16-25`
e `:69-75`):

- **Quem gira:** assinatura com `status: 'ativa'` **e** `cicloFim` já vencido.
- **O que faz:** `franquiaUsada: 0`, `cicloFim: cicloFim + 30d` (a partir do `cicloFim`, não de
  "hoje" — assim as datas não escorregam quando o cron falha um dia), e um documento em `logs`
  (mesmo padrão de `marina/route.ts:478-481`). O giro roda em `runTransaction` sobre o MESMO
  `subRef` que `emitirComCobranca`/`exame-admin.ts`/`ajustarCreditos` já escrevem — o cron é o
  **4º escritor** de `subscriptions/{id}`, entrando pela mesma porta transacional dos outros 3
  (nenhum mecanismo de consistência novo, nenhuma corrida nova pra fechar).
- **O que NÃO faz:** `creditosExtras` fica intacto (§3); `franquiaMensal` fica intacto; conta com
  status diferente de `'ativa'` é ignorada.
- **Trial:** decidir explicitamente — ver §3.
- **Cobrança:** continua **manual e externa**, exatamente como hoje. O cron não cobra ninguém;
  ele só automatiza o giro do calendário que hoje é feito no dedo.
- **Nota de implementação, se A (ou B) for a escolha:** não precisa nascer como uma 3ª rota de
  cron — pode ser um laço a mais dentro do `cleanup-worklist` que já existe (já roda todo dia,
  já tem `CRON_SECRET`, já está no `vercel.json`), em vez de provisionar um agendamento novo do
  zero.

A inversão que a A propõe é a que importa: hoje o Direx precisa agir para a conta **continuar
viva**; com a A, o Direx age para a conta **morrer**. É a diferença entre uma receita que
precisa ser reescrita todo mês e uma de uso contínuo com data de suspensão.

### Detalhe da D (sem cron)

A mesma virada de A (`franquiaUsada: 0`, `cicloFim: cicloFim + 30d`, status `'ativa'`
obrigatório), mas SEM rota de cron nenhuma: o giro acontece **dentro** de
`emitirComCobranca` (`src/lib/emitir-admin.ts`), que já roda em `runTransaction` e já lê
`subRef` no início da função. Se essa leitura mostrar `cicloFim` vencido (e `status:
'ativa'`), a própria transação de emissão gira o ciclo ANTES de decidir franquia/crédito —
zero rota nova, zero escritor novo de `subscriptions/{id}` (é o MESMO `emitirComCobranca`
que já escreve ali, só ganha mais um `if`).

**O teto que isso cria:** o giro só acontece quando ALGUÉM tenta emitir depois do
vencimento. Uma conta que fica dias sem ninguém emitir continua mostrando `cicloFim`
VELHO no painel do Direx até a próxima emissão — não é "renovado e escondido", é
"ainda não teve motivo pra renovar". Pra quem só olha o painel sem cruzar com a
Worklist, isso pode ler como "o cron não rodou" quando na verdade não há cron. Documentar
isso na tela do Direx (ou aceitar o teto) é decisão de quem escolher D.

---

## 3. Interações — coisas que precisam ser decididas junto

### Créditos extras não zeram

`creditosExtras` são **comprados ou dados de cortesia**, com trilha de auditoria
(`billing.ts:329-356`, coleção `creditosLog`). Não são franquia mensal. **Nenhuma** das opções
zera crédito na virada do ciclo. Isso é consenso, não é decisão — está aqui só para ficar escrito.

### E13 — crédito fura a expiração (decisão irmã, decidir no mesmo dia)

Pela ordem de `emitir-admin.ts:333-341`, o braço `expirado` só dispara com `creditosExtras <= 0`.
Consequência hoje: **um trial vencido com 1 crédito emite para sempre** — sem limite de tempo.
O pré-voo do cliente (`billing.ts:194`) concorda com isso, então é comportamento consistente,
só nunca foi escolhido por ninguém.

As duas leituras possíveis:

| Leitura | Regra | Consequência |
|---|---|---|
| "Crédito é dinheiro pago, não vence" | como está hoje | trial vencido com crédito vira conta gratuita vitalícia |
| "Crédito vale dentro de uma conta viva" | crédito só emite se `status: 'ativa'` (independente do `cicloFim`) | conta suspensa para de emitir mesmo com crédito; crédito comprado não evapora, fica guardado |

A segunda leitura combina com a A: o `status` vira o interruptor único de "esta conta emite",
e o `cicloFim` volta a ser só o calendário da franquia.

### Contas em trial

Se o cron da A rodar em cima de trial sem filtro, o trial de 30 dias vira **eterno** — o pior
resultado possível. Três saídas:

| Saída | Efeito |
|---|---|
| Cron ignora `tipo: 'trial'` | trial mantém os 30 dias de hoje; ao converter para pago, o Direx muda o plano e o cron assume — **a mais simples** |
| Cron renova trial N vezes e para | mais gentil, mais estado para guardar |
| Trial vira `status: 'suspensa'` ao vencer | o médico vê "conta suspensa" em vez de "expirado" — melhor mensagem, mesmo bloqueio |

---

## 4. O teste que cada opção ganharia

| Opção | Teste (um só, mínimo) |
|---|---|
| **A** | Assinatura com `cicloFim` ontem: `ativa` → `franquiaUsada` zera e `cicloFim` anda 30d; `suspensa` → nada muda; `trial` → nada muda; e rodar o cron duas vezes no mesmo dia não anda 60d. |
| **B** | Mesma coisa, mais: `cicloFim` já ≥ `pagoAte` → o cron não renova. |
| **C** | Assinatura vencendo em X dias entra na lista de alerta; vencendo em X+1, não entra. |
| **D** | Emitir com `cicloFim` ontem e `status:'ativa'`: gira o ciclo E emite pela franquia nova, na MESMA chamada; emitir duas vezes seguidas não gira 2x (a 2ª já vê `cicloFim` futuro); `status:'suspensa'` com `cicloFim` vencido → `expirado`, não gira. |
| **E13** (junto) | Assinatura expirada com 1 crédito: emite (regra atual) ou é bloqueada (regra nova) — o teste fixa qual das duas foi escolhida. |

---

## 5. Recomendação

**Opção A**, com o cron ignorando trial e com a leitura nova do E13 (crédito só emite em conta
`ativa`).

Três frases: (1) o risco da A — alguém emitir de graça por um mês até ser suspenso — é um risco
de **cobrança**, recuperável e visível na lista de inadimplentes que o painel já monta, enquanto
o risco de hoje é **clínico e imediato**: laudo pronto que não sai porque o calendário virou.
(2) A é a de menor esforço das que resolvem de fato (uma rota de cron no molde de duas que já
existem e rodam todo dia), e não inventa nenhuma promessa de integração com gateway de pagamento
— a cobrança continua manual e externa, igual hoje. (3) A B é a opção certa **depois** que
existir integração de pagamento de verdade: enquanto o `pagoAte` for digitado à mão, ela só
troca uma tarefa mensal manual por outra, com a diferença de que esquecer dela ainda derruba a
emissão do médico.

### As perguntas para o Sergio

1. **A, B, C ou D?** (D é A sem cron — mesmo giro, mas só dentro da transação de
   emissão; ver §2 "Detalhe da D" pro teto que isso cria.)
2. Se A: **trial renova sozinho?** (recomendo **não** — trial mantém 30 dias e o Direx converte na mão)
3. **E13:** crédito comprado deve emitir em conta vencida/suspensa — **sim** (como hoje) ou **não** (só conta ativa)?
4. Quando um inadimplente for suspenso, ele deve **perder** os créditos extras que comprou, ou eles ficam guardados até voltar? (recomendo **ficam guardados**)

Decidido, isto vira ADR + tarefa de implementação em onda futura. Enquanto não houver resposta
registrada, **nada é implementado**.

### Correção que entra de qualquer jeito

Independente de A/B/C/D: o join por `workspaceId` (§1a) precisa ser corrigido, senão as contas
criadas pelo cadastro novo continuam invisíveis para o Direx e para a Marina — e a saída de
emergência manual, que é o plano B de todas as opções, não existe para elas.
