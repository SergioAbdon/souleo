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

## Handoff pro notebook — decidido pelo Sergio 14/10 17:55: "vamos fazer mais tarde os ajustes pelo notebook"

**Estado ao sair da clínica:** galeria continua sem imagens na tela (miniaturas pretas) em TODO exame, até o hotfix ir pro ar. **Os dados estão íntegros**: Orthanc, Firestore (`imagensDicom`/`imagensDicomDetalhes`) e Storage conferidos exame a exame (Patricia 10/10, Luiz 9/9, Artur 8). Nada a reprocessar no Wader. Emissão de PDF com imagens provavelmente também falha (`pdf-server.ts` usa o mesmo `assinarImagensExame` → mesmo app sem bucket na instância ruim) — confirmar.

**Branch pronta:** `hotfix/galeria-bucket-admin` (commit `d94ddbb`, a partir de `origin/master` 999d042; só 7 arquivos). O mesmo conteúdo também está em `feat/wader-console` (`b33613f` + `483ca14`), mas essa branch carrega o Feegow-por-nome não testado — **mesclar o hotfix, não a feature**.

Checklist no notebook, nesta ordem:
1. `git fetch && git checkout hotfix/galeria-bucket-admin` → `npm run typecheck` → `npm run test:unit` (inclui `retry.test.mjs`) → `npm run build`. Se o typecheck reclamar de `adminDb()`/`adminAuth()` em `marina`/`calcular`, é só tipo de retorno (Firestore/Auth) — mesmas funções já usadas em `/api/exame`.
2. Reproduzir ANTES do merge, com a produção atual: chamar `POST /api/exame/imagens-urls` (token da conta Yahoo, membro do `LDRtedkanx3bUvxpdmiL`) logo após chamar `POST /api/laudo/calcular` algumas vezes → deve dar 500 na mesma instância; é o teste adversarial da causa raiz. Ler o `console.error('API /exame/imagens-urls:')` nos logs da Vercel de 14/10 16:55–17:45 — a mensagem esperada é algo como "Bucket name not specified or invalid" (confirma ou refuta de vez).
3. Codex: revisão do diff (pequeno) + pergunta específica: sobra algum `initializeApp` fora de `auth-admin.ts` em código que roda na Vercel? (grep na sessão: só `calcular`, `marina` e scripts de teste `src/lib/teste-*.ts`/`src/senna90/valida-exames-reais.ts`, que não são rotas.)
4. Merge no master com aval do Sergio → Vercel → abrir o laudo da Patricia (`fg-69453-2026-10-14`) e a galeria: 10 miniaturas. Emitir um PDF de teste com imagens.
5. Depois do fix: considerar guarda em `auth-admin.ts` — se `getApps()[0]` existir sem `storageBucket`, logar erro alto (ou lançar), pra esse bug não voltar silencioso. Ponytail decide se vale.
6. Pendências da mesma visita que ficaram: toasts do Wader não confirmados; "Não incomodar" na recepção; cartão Wader em Integrações; senha do Orthanc fora do histórico (ela está lá: `ortancPass` aparece em `git log -S`, foi assim que a achei); merge `feat/wader-console` → master (Feegow por nome) continua pendente desde 07/10; espelho Obsidian desta sessão e da instalação do Wader.

7. **(21/10) Badge "IMAGEM FALHOU" transitório no worklist.** Maria Heliana (`fg-69687-2026-10-21`, ACC EX21102617232793): o Vivid mandou o SR como **estudo separado** (`b6c54ef0`, 1 série SR, 0 imagens) e as 10 imagens em outro estudo (`f0cbc0ba`) com o mesmo ACC. O Wader processou o só-SR primeiro → `dicomUltimoErro: "Estudo sem instances no Orthanc"` → badge vermelho; 20 s depois processou o estudo com imagens e limpou (`imagensDicom` 10, 28 medidas, erro null). Nada a corrigir nos dados; é cosmético, mas assusta o médico. Sugestão pro notebook: em `dicom-ingest.ts`, quando o estudo tem 0 instâncias de imagem **e** só séries SR (`metodoSr` presente), não gravar `dicomUltimoErro` — ou gravar um aviso neutro ("aguardando imagens") em vez de erro. Cobrir com teste (fixture: estudo só-SR). Já havia padrão parecido no cursor antigo ("nImg":0,"nSR":1 seguido de "nImg":9,"nSR":0 no mesmo minuto — ex.: 2026-09-16, 09-19, 09-21, 09-30, 10-07), ou seja, é o comportamento normal do Vivid desde setembro.

**Scripts de diagnóstico** (scratchpad da sessão da clínica, não versionados; recriar se precisar): leitura do doc do exame + conferência dos objetos no Storage; token de ID via `createCustomToken` + `signInWithCustomToken` com a web API key pública; martelar a rota e baixar as URLs assinadas devolvidas. Todos usam `C:\Wader\sa.json` + `C:\Wader\node_modules\firebase-admin`.

## Arquivos

- `src/lib/retry.ts` (novo), `tests/unit/retry.test.mjs` (novo), `src/components/laudo/DicomGallery.tsx` (usa `tentar`).
