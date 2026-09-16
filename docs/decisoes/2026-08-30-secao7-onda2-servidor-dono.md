# ADR — Seção 7 ondas 2 e 2b: o servidor vira dono dos carimbos, do status e do ciclo

**Data:** 30/08/2026 · **Merges:** onda 2 `2bc333b` · onda 2b `cb6beb7` (master)
**Regra Firestore:** PUBLICADA 30/08 junto do deploy da 2b (release direto do arquivo do
repo, 150/150 no emulador com payload real). **Deploy Vercel:** READY verificado.
**Esteira:** SDD + tríade completa pré-merge nas duas ondas (Codex adversarial em múltiplas
rodadas → READY FOR MERGE; Ruflo e Ponytail com fix waves aplicadas).
**Placar final:** unit 743 · api 299 · rules 150 · tsc+build limpos.

## Onda 2 — carimbos anti-fraude derivados no servidor (E3, E15/E16, X22/E18, E19)

- `reemissao` e `identificacaoAlterada` deixaram de ser copiados do navegador: derivados
  DENTRO da transação de cobrança. `reemissao` vem do **ledger de consumo** (cobre até
  exames pré-onda-0); a **identidade assinada** (nome/dtnasc/data/convênio) fica carimbada
  na gaveta server-only a cada emissão — a comparação seguinte é contra o que foi
  ASSINADO, não contra o doc editável. Semântica: recepção corrigir um dado entre emissões
  flagra `identificacaoAlterada: true` na reemissão (correto). O `false` significa "nenhum
  dos campos que ESTE cliente mandou mudou".
- Erros internos mascarados (`erro_interno`); recusas de billing saem como **402** (o
  contrato dos clientes é o CORPO, não o status — não "melhorar" cliente com `!res.ok`).
- Reanexo em exame emitido (inclusive o reaberto, que mantém `emitidoEm`) pede confirmação
  explícita de nova franquia.
- Mortos E19 deletados: `emitExame` (o gadget pronto do E10), `consumirEmissao`,
  `registrarConsumo`, `DadosConsumo`, `checkWorkspaceLimit`.

## Onda 2b — as duas decisões do Sergio (30/08) implementadas

### E11 opção D — o ciclo renova ao emitir (`docs/decisoes/2026-08-30-secao7-renovacao-ciclo.md`)
Giro DENTRO da transação de cobrança: vencido + ativa (`franquiaMensal > 0`) + não-trial →
zera `franquiaUsada`, rola `cicloFim` em passos de +30d ancorados no fim velho, cobra por
franquia. Replay não gira. Pré-voo do cliente espelha o predicado. **`src/lib/ciclo.ts`**
é o dono único do predicado (`podeGirar`/`proximoCicloFim`/`vigente`) — e TODOS os
leitores de dinheiro/churn (MRR, inadimplentes, pills, Marina) usam `vigente()`:
**contrato novo do `cicloFim`** = "válido até a última emissão"; vigência real é
`vigente()`. Bônus da onda: o freio manual (bloquear/estender do Direx e da Marina) estava
QUEBRADO para contas novas (join por `workspaceId`) — consertado em 8 pontos via join
canônico; estender manual agora também zera o uso.

**Pendências de política registradas (defaults em vigor, Sergio pode reverter):**
1. *Devolução cruzada de ciclo:* cancelar laudo do ciclo velho devolve folha no ciclo novo
   (limitado, favorece o cliente, auditável no ledger). Upgrade futuro: carimbar
   `cicloFim` no `consumo`. — a lacuna é do ledger, não do cancelamento.
2. *Estender manual zera `franquiaUsada`* (estender = ciclo novo).

### E10/E14/E22 — status é do servidor (`docs/decisoes/2026-08-30-secao7-regra-status.md`)
Regra publicada: cliente só escreve `status` na transição "abriu o laudo e salvou"
(destino `andamento`, origem ≠ emitido/cancelado) ou não toca; `emitidoEm` e `pdfUrl`
intactos no braço do autor E ausentes no create; **ninguém cria exame já emitido pelo
navegador** (teste que chamava isso de "caminho legítimo" invertido). No servidor,
`/api/emitir` só aceita a **whitelist de 13 campos** que as telas realmente mandam
(pin cross-file contra os literais dos 3 clientes). Cancelado ficou congelado pro cliente.

## Dívidas registradas para as ondas 3-4
`pdfErro` client-writable (cosmético — servidor recusa regeneração indevida) ·
`gerar_relatorio` da Marina com estatística agregada no join misto · parâmetro `status`
morto de `salvarLaudo` · extrair helpers de whitelist/autoria do corpo da transação ·
catálogo de planos ainda em 2 cópias (planosMap × PLANos_DEFAULT/configPlanos) ·
`incluirImagensNoPdf` entra na whitelist na onda 4 (X2).
