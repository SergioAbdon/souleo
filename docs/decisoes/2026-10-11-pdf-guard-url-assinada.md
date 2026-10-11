# PDF abortava em toda emissão com imagem — guard de URL assinada (11/10/2026)

**Status:** correção no branch `claude/pdf-guard-url-assinada`, aguardando aval do Sergio para publicar.
**Gatilho:** Sergio emitiu o laudo de carótidas fg-69204 em produção e recebeu "Laudo emitido com
sucesso! (Aviso: o PDF falhou ao gerar — reemita ou contate o suporte.)".

## O que foi encontrado

Reproduzi localmente o caminho exato do servidor com o exame real (HTML → assinatura das imagens →
Chrome), sem gravar nada:

- 10/10 imagens assinadas em 104 ms; Chrome carrega as 8 (HTTP 200) e renderiza o PDF em 6 s.
- Mesmo assim o guard `htmlAssinado.includes('https://storage.googleapis.com/<bucket>/dicom')` em
  `pdf-server.ts` dispara: a **URL assinada começa com o mesmo prefixo da canônica**
  (`…/dicom/<ws>/<exame>/x.jpg?GoogleAccessId=…`). O guard (de 22/08, S4-T15 X1-X6) tratava toda
  assinada como "não assinada" e abortava o PDF.
- Dados da clínica, últimos 60 dias (só contagens): `eco_tt` 69 emitidos, 47 com `pdfErro`, 56 sem
  `pdfUrl`; 11 com imagens no PDF → 7 com `pdfErro`. `doppler_carotidas` 8 emitidos, 1 com `pdfErro`
  (o de hoje). Por dia: 31/08 10/10 com erro, 21/09 9/10, 30/09 10/12, 07/10 11/15.
- **Conclusão:** toda emissão COM imagem morria neste guard. Emissões SEM imagem também falham desde
  31/08 por **outra causa**, que só aparece no console da Vercel (sem acesso daqui: token da CLI
  inválido). Ou seja: a geração de PDF em produção está quebrada desde o fim de agosto, para o eco
  também — independente do trabalho de hoje.

## Correção

| Arquivo | Mudança |
|---|---|
| `src/lib/pdf-server.ts` | `temImagemNaoAssinada(html, bucket)`: só a canônica **nua** (sem `?query`) conta como não assinada. 4 testes em `pdf-server-allowlist.test.mjs` (assinada v2 e v4 passam; canônica nua aborta; outro bucket não conta). |
| `src/app/api/emitir/route.ts` | O detalhe do erro de PDF (HTML e anexo) passa a ir também para `logs{tipo:'pdf_erro', erro}` via Admin SDK — nunca ao cliente. Próxima falha fica legível daqui. |
| `src/app/laudo-texto/[id]/page.tsx` | Seleção de imagens sempre possível. O laudo de texto não tem o passo "Editar": editar o texto e Reemitir **é** a reedição. A 1ª versão (hoje de manhã) aplicou a regra "emitido = só leitura" do ECO a uma tela sem Editar — e o médico não conseguia trocar as imagens da reemissão (achado do Sergio). No emitido a lista fica só na tela (a regra do Firestore nega o autosave) e vale na reemissão, em `dadosFinais`. |

Codex (verificação adversarial, 3ac7cab): qualquer `?` passava como assinatura (`?alt=media` daria 403 e imagem em branco) e host em caixa alta escapava; log podia guardar token assinado. Atendido em bd8a8ba: assinada = query com `GoogleAccessId=` ou `X-Goog-Signature=`, varredura em minúsculas, query strings trocadas por `?…` no log; +2 testes.

Codex rodada 2: assinatura precisa ter valor (v2 = GoogleAccessId + Expires + Signature; v4 = X-Goog-Signature), e uma imagem DICOM que o Chrome não consiga carregar (403/404/rede) agora aborta o PDF em vez de sair em branco; console.error também sem query. unit 789/789.

Codex rodada 3: imagem que responde 200 mas vem vazia (naturalWidth 0) também aborta — `page.evaluate` funciona com o JS da página desligado (conferido com o exame real: 8/8 carregadas, 1016 px).

Verificação: `tsc` limpo · unit 789/789 · visual carótidas 3/3 · reprodução local do fg-69204 com o
guard novo: não aborta, PDF de 3,8 MB em 6 s.

## Pendente

- Aval para publicar.
- Causa das falhas de PDF **sem imagem** (desde 31/08): precisa do log da Vercel (`npx vercel login`
  nesta máquina, ou copiar a linha "PDF gen error" do painel). Com o log novo em `logs`, a próxima
  emissão que falhar já diz o motivo.
- O fg-69204 de hoje ficou emitido (franquia consumida) e sem PDF novo: reemitir depois da correção.
