# ADR — SEÇÃO 7 FECHADA (Emissão, PDF e exportação)

**Data:** 31/08/2026 · **Períodos:** levantamento 29/08 → onda 0 (29/08) → ondas 1-4 (30-31/08)
**Merges:** onda 0 `f3025d2`+`a54bf04` · onda 1 `18ae790` · ondas 2+2b `2bc333b`+`cb6beb7`
(⚠️ regra Firestore publicada 30/08) · onda 3 `264cb6b` · onda 4 `8a894e4`
**Placar final da seção:** unit **757** · api **301** · rules **150** · tsc+build limpos
(piso de partida era 683/249/142 — só subiu).
**Esteira:** 68 achados de 3 leitores → plano de 4 ondas
(`docs/planos/2026-08-30-secao7-plano-correcao.md`) → SDD (implementador + revisor
adversarial por task) → **tríade completa pré-merge em TODAS as ondas** (Codex adversarial
em múltiplas rodadas — 7 na onda 1 —, Ruflo arquitetura, Ponytail deletar) → merges com OK
do Sergio.

## O que a seção fechou, em uma linha por onda

- **Onda 0** (ADR próprio): gru1 + Chromium reutilizado + teto de fontes + trava
  anti-cobrança-dupla (`emissaoKey`) com gaveta server-only.
- **Onda 1** (ADR próprio): os 6 bugs com dente (corte X1, corSegura, allowlist do Chrome,
  rotaDoLaudo, CAS cancelar×emitir, Regerar sem 2ª franquia) + o REDESENHO da publicação:
  transações condicionais de ponteiro+bandeiras, objeto por tentativa, snapshot
  pós-publicação, `emissaoKey` obrigatória.
- **Ondas 2+2b** (ADR próprio): servidor dono dos carimbos anti-fraude (ledger +
  identidade assinada na gaveta), E11 opção D (ciclo renova ao emitir; `ciclo.ts`;
  painéis/MRR no significado novo; freios Direx/Marina consertados), regra do `status`
  PUBLICADA (cliente só "abri e salvei"; create sem carimbo; whitelist de campos).
- **Onda 3**: `pdf-storage` sem Puppeteer (sombra leve) · PDF com `no-cache` (correção
  vale na hora no link entregue) · apagar exame leva os snapshots (LGPD, matcher exato
  por tentativa) · `escaparHtml` única + escapes same-origin (galeria/Extrato) ·
  IBM Plex **variável injetada no render pelo servidor** (65KB; fora do bundle, do POST e
  do snapshot; conserta render de snapshot antigo sob a allowlist).
- **Onda 4**: ModoEmitido abre o **PDF ASSINADO** (porta única `abrirPdfUrl` + noopener;
  "Gerar novamente" explícito; pdfUrl fresco no state) · guard de tabela nas 4 saídas
  (vazio bloqueia tudo; stale só bloqueia emissão e avisa nas saídas) · linha incompleta
  filtrada igual nas 4 · escolha de imagens persistida e lembrada no checkbox ·
  laudo-texto: transferido salva rascunho + beforeunload + docFechado alinhado ·
  docx com `nomeArquivoLaudo` (dono único de composição) e cabeçalho do tipo · cópia
  verificada · html2pdf e mortos removidos.

## Decisões leves ainda abertas (nenhuma urgente — apresentadas ao Sergio no fechamento)

1. **E12** — excedente: os planos vendem R$/laudo excedente e o motor bloqueia no limite
   (com a renovação D o aperto diminuiu, mas o comercial ainda anuncia o que o código nega).
2. **E13** — créditos extras furam a expiração do plano/trial. Política desejada?
3. **X6** — realce vermelho (fora de referência) deve sair no PDF assinado? Hoje só na tela.
4. **X23-nota** — `consumo` guarda pacienteNome/convênio (extrato precisa). Confirmar
   intencional.
5. **X24-lacuna** — laudo-texto sem Imprimir/Copiar/Word (só PDF). Decisão ou lacuna?
6. *(defaults já em vigor, reversíveis: devolução cruzada de ciclo; estender manual zera
   uso; checkbox de imagens começa marcado em exame novo.)*

## Dívidas registradas (radar das próximas seções)

`publicarEArquivar` dono da sequência publicar→snapshot · par pathParaEscrita/Leitura ·
`apagarPdfObjeto`/storage-laudos com DI · `lerSnapshotHtml` com Firestore ambiente ·
invariante key↔emitidoEm (teste) · `podeRegerarPdf` em permissoes.ts · falha de PDF em
REEMISSÃO escondida pelo gate `!pdfUrl` · X1: título CONCLUSÃO renomeado/negritado →
caixa vazia (upgrade = atributo via extensão TipTap) · `gerar_relatorio` da Marina no
join misto · catálogo de planos em 2 cópias · verificação ao vivo do render @sparticuz
com a fonte variável no 1º uso real pós-deploy.

## Próximo da fila

Seção 8 (Histórico/Extrato — última não revisada) · F5b aposentadoria do motor legado
(estacionada, pós-plantão) · **segunda 31/08 = 1º plantão real do Sergio com o Senna93**.
