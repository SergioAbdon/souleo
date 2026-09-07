# ADR — SEÇÃO 8 FECHADA (Histórico e Extrato) — última do mapa das 8 seções

**Data:** 07/09/2026 · **Levantamento + 3 ondas no mesmo dia**
**Merges:** onda 1 `81d248e` · onda 2 `07fc253` (⚠️ **regra AINDA NÃO publicada** — ver Pendências) · onda 3 `c1277f0`
**Placar final:** unit **771** · rules **162** · tsc+lint limpos (piso de partida 763/152 — só subiu).
**Esteira:** levantamento do fluxo real → 30 achados por tríade (Codex 17 · Ruflo 6 · Ponytail 7) →
plano de 3 ondas (`docs/planos/2026-09-07-secao8-plano-correcao.md`) → SDD (implementador +
revisor por task) → **tríade PRÉ-merge em TODAS as ondas** (Codex adversarial em até 4 rodadas,
Ruflo arquitetura, Ponytail deletar) → merges com aval do Sergio.

## O que a seção fechou, em uma linha por onda

- **Onda 1 — dente financeiro:** extrato parou de truncar em 500 laudos (pagina até o fim; teto
  de 20.000 ABORTA com aviso em vez de truncar) · mês de referência com dono único
  (`anoMesAtual`, viaja do check ao incremento) · contador atômico · erro de consulta visível
  ("Tentar novamente" no Histórico; Extrato avisa e não gera) · corrida de troca de período
  invalidada (`consultaGenRef` separado do `genRef` de honorários) · popup no gesto do clique,
  aborto fecha a janela, trava de duplo-clique, erro de plano aborta.
- **Onda 2 — camada de dados:** contador de extratos MONOTÔNICO por regra (nasce em 1, só anda
  +1, `ultimoEm is timestamp`; delete só suporte) · `config/` só aceita `honorarios` na forma
  exata do `saveHonorarios` (`valorUnico` ≥ 0) · `logs` só nasce assinado com o próprio uid
  (mesmo motivo do fechamento do `consumo`; cliente ainda escreve, mas não forja autoria) ·
  honorário negativo barrado em 3 camadas (input, `saveHonorarios` backstop, `getValor`
  defensivo — valores DENTRO do mapa `convenios` não são validáveis por rule) · Extrato
  **fail-closed**: incremento negado = não gera (subcontagem eterna era pior) · testes com
  payload REAL (10 novos; seed antigo de honorários usava forma inventada e foi corrigido).
- **Onda 3 — UX + Ponytail (saldo −):** nome do tipo vem do catálogo nas 2 telas e no extrato
  impresso (TIPOS_EXAME hardcoded deletado 2×) · dropdown de convênio acumulado por local (não
  colapsa ao filtrar; filtro herdado reseta na troca de local) · busca sem resultado oferece
  "Buscar nas próximas páginas" · falhas de honorários avisam (salvar mantém edição aberta;
  carga com erro alerta) · aviso de cobrança honesto (ilimitado nunca ameaça; franquia
  desconhecida não promete) · `fmt-data.ts` dono único · impressão com fast-path pela linha +
  conferência de PDF fresco quando a linha não tem · `useTiposLaudo` com carga etiquetada por
  local (corrida pré-existente que afetava Worklist/ficha também — consertada na raiz).

## Decisões desta seção

1. **Fonte da verdade do extrato continua `exames`** (paginado); migrar pro ledger `consumo`
   (que sobrevive ao apagar LGPD) fica pra onda de billing final — senão a S8 engordava pra
   dentro dela. (R3 do levantamento.)
2. **Billing do extrato continua contador-no-cliente** (decorativo) — mover check+increment pra
   rota server-side (espelho do `/api/exame`) é a onda de billing final. (R1.)
3. **Fail-closed no contador**: regra negando incremento → extrato NÃO sai. Verificação de
   produção pré-publicação (read-only, rito do E13): 1 contador + 1 honorários, ambos já na
   forma nova — zero migração, ninguém afetado.
4. **`logs` assinado ≠ `consumo` fechado**: `consumo` é dinheiro (create só servidor); `logs` o
   cliente ainda cria, mas só com a própria autoria.

## Registrados (não corrigidos, radar)

- **Onda de billing final** (já era o plano): R1 extrato server-side · R3 consumo como fonte ·
  cobrança real de extrato/excedente (E12) · `logAction('extrato_emitido')`+`incrementarExtrato`
  morrem juntos na migração (P7).
- **Conferência de convênios** (cruzar emitidos com extrato TISS da operadora — motivo do X23):
  não existe na plataforma; o `consumo` já guarda pacienteNome/convênio esperando por ela.
- `pacientes/{pacId}` é o último caminho gravável do workspace SEM `hasOnly` (Ruflo A2).
- Catálogo de planos em 2 cópias sem tripwire de teste (R6 — o de tipos de laudo tem).
- 3 convenções de erro coexistindo em firestore.ts (`erro?:boolean` × `null` × `boolean`) —
  padronizar quando houver 3º caller (Ruflo onda 3).
- Extrato.tsx com 13 states + 3 refs — maduro pra decomposição em hooks quando a S8 for
  revisitada (Ruflo). Flash do catálogo padrão no mount (pré-existente, BAIXA).
- Cancelamento some do Histórico (query filtra `status=='emitido'`) — o modal diz "fica
  registrado", e fica (consumo/log), mas nenhuma tela lista cancelados.

## Pendências (ação do Sergio)

1. ⚠️ **PUBLICAR a regra da onda 2** (`firebase deploy --only firestore:rules`) — o C2 (contador
   adulterável) só fecha DE VERDADE com a regra no ar. Código novo convive com regra velha e nova.
2. Clique de verificação no Extrato em produção pós-deploy (popup abre? duplo-clique conta 1?)
   — nenhuma rodada teve navegador logado; código verificado por inspeção em 3+ revisões.
3. Lixo na raiz do repo (`$TMPDIR_X`, `caixa`, `TEMP` — artefatos de hook, untracked): apagar
   quando quiser.

## Marco

**As 8 seções do mapa estão revisadas e fechadas** (S1 fechadura → S8 Histórico/Extrato).
Próximos da fila geral: onda de billing final (mitigações) · F5b aposentadoria do motor legado ·
pendências físicas da clínica (Wader.exe, senha Orthanc).
