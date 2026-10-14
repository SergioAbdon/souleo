# Galeria DICOM com miniaturas pretas — 500 único a frio na rota de assinatura; retry curto no cliente

**Data:** 14/10/2026 (PC da clínica, primeiro dia do Wader como serviço)
**Status:** 🔧 implementado em `feat/wader-console`, **não testado no web local** (PC da clínica não tem `node_modules` do web) — notebook: `npm run typecheck` + `npm run test:unit` + merge/deploy com aval do Sergio.

## Sintoma

Sergio: "as imagens não estão carregando corretamente" no exame `fg-69453-2026-10-14` (Patricia). Captura: 9–10 miniaturas pretas "Imagem DICOM n" + faixa amarela "Imagens podem não carregar — recarregue a página".

## Investigação (tudo verificado, nada assumido)

| Camada | Resultado |
|---|---|
| Orthanc | 10 US + 1 SR, estudo estável |
| Wader 1.0.0 | 10 imagens, 0 falhas, 31 medidas, sem erro (duas passadas: 4 imgs às 16:14, 10 às 16:21) |
| Firestore | `imagensDicom` 10, `imagensDicomDetalhes` 10 (url+path), sem `dicomUltimoErro`, sem duplicata da paciente |
| Storage | 10 objetos, previews abertos e corretos (nome, data, medidas) |
| URL assinada local (sa.json) | HTTP 200 |
| **Rota `/api/exame/imagens-urls` em produção** | **1ª chamada (a frio, conta Yahoo = membro): HTTP 500 `{"motivo":"erro"}`**; em seguida 14 chamadas seguidas: todas 200 (2,6 s a frio, ~300–600 ms quente). Conta Gmail: 403 `sem_permissao` (não é membro — esperado, ADR 07/10) |

A faixa amarela é exatamente o `erroAssinadas` de `DicomGallery.tsx`: a rota falhou **uma vez**, a galeria guardou `{}` e nunca mais tentou — miniaturas pretas até o F5. A causa do 500 em si não foi lida (sem acesso aos logs da Vercel na PC da clínica); pelo padrão (só a 1ª chamada após ociosidade) é exceção na partida a frio da função (init do Admin SDK/Firestore). Fica como item pro notebook: olhar o `console.error('API /exame/imagens-urls:')` nos logs da Vercel de 14/10 ~16:5x.

Como foi testado: token de ID do Sergio gerado via custom token do Admin SDK (`sa.json` do Wader) + `signInWithCustomToken` com a web API key pública, chamando a rota como a galeria faz. Scripts ficaram no scratchpad da sessão (não versionados).

## Causa raiz (achada 17:40, depois do F5 não resolver)

Sergio reportou que persistia após F5 e em outro exame (Artur, 8 imagens). A rota voltou a dar 500 pra mim, sem deploy novo, após ter dado 200 catorze vezes. Padrão de **instância**: `src/app/api/laudo/calcular/route.ts` (chamada o tempo todo pela tela do laudo) e `src/app/api/marina/route.ts` faziam `initializeApp()` próprio **sem `storageBucket`** no escopo do módulo. Na instância da Vercel em que `calcular` carrega primeiro, `getApps()[0]` é o app sem bucket; `auth-admin.ts` reaproveita esse app e `adminStorage().bucket()` estoura → 500 em `/api/exame/imagens-urls` naquela instância, para sempre. Instâncias em que a galeria carregou primeiro respondem 200 — por isso a oscilação, e por isso o médico (que sempre abre o laudo antes da galeria) via SEMPRE falhar. É exatamente o bug que o cabeçalho de `auth-admin.ts` descreve ("storageBucket diferente conforme QUEM inicializava primeiro"); estas duas rotas tinham ficado de fora da consolidação.

**Fix:** as duas rotas passam a usar `adminAuth()`/`adminDb()` de `auth-admin.ts` (um init só, com bucket). O retry no cliente fica (ajuda em falha transitória real), mas não era a solução.

## Decisão

1. **Cliente tolera a falha a frio:** `buscarUrlsAssinadas` passa a tentar até 3× (pausas 0,8 s e 2 s) em 5xx/erro de rede; 4xx não repete. Helper puro `src/lib/retry.ts` (`tentar`, `ErroHttp`, `retentavel`) com 7 testes em `tests/unit/retry.test.mjs`.
2. **Workaround imediato na clínica:** F5 na página do exame.
3. **Pendente (notebook):** ler o erro real nos logs da Vercel; se for init a frio do Admin SDK, considerar aquecer/ordenar o init em `auth-admin.ts`. Não mexer em `storageBucket`/credencial sem ver o log.

## Arquivos

- `src/lib/retry.ts` (novo), `tests/unit/retry.test.mjs` (novo), `src/components/laudo/DicomGallery.tsx` (usa `tentar`).
