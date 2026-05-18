# 2026-05-18 — Wader ingest resiliente (cursor persistido + re-avaliação + recuperação por ACC + ACC normalizado)

> **Status:** ✅ IMPLEMENTADO e DEPLOYADO no C:\Wader (18/05/2026).
> **Dono:** Claude da clínica. **Decidido com:** Dr. Sérgio.
> **Origem:** incidente real 18/05 — Feegow caiu, exames feitos com cadastro
> manual; imagens/SR não chegavam ao Leo, chegavam lentas/parciais.
> Ler antes de mexer em `apps/wader/src/workers/*`.

## 1. Sintomas reais observados (18/05)

Com o Feegow fora, a recepção cadastrou exames manualmente no LEO e digitou
o ACC no Vivid. Resultado:

1. **Lentidão extrema** — imagens/SR demoravam minutos; "ao ponto de não
   chegarem ao Leo".
2. **Exame parcial travado** — chegou exame com **4 imagens e SEM SR**, e
   ficava assim.
3. **Recuperação só "no muque"** — pra 1 exame: apagar no Orthanc +
   reenviar pelo Vivid + **reiniciar o Wader** + esperar ~5 min ele
   paginar 800+ changes.

## 2. Causa raiz (uma só, arquitetural)

`dicom-ingest-worker.ts` (versão antiga):

- **Cursor `lastSeq` só em memória.** Restart ⇒ re-varre o feed `/changes`
  do seq 0. Feed lido 100/30s ⇒ 800+ changes = ~4-5 min.
- **`processedStudyIds` (Set em memória) = blacklist eterna.** Estudo
  visto como "órfão" (sem ACC na hora) **nunca mais era reavaliado**. Ao
  reenviar o exame já com ACC, o mesmo `orthancStudyId` (hash do
  StudyInstanceUID+paciente — estável) era filtrado e ignorado pra sempre.
- **Sem checagem de completude.** Se o Orthanc estabilizava o estudo
  parcial (4 imgs, SR atrasado), processava parcial e blacklistava ⇒
  travado parcial.
- **Match de ACC exato e só nível-estudo.** ACC digitado sem o prefixo
  `EX` (erro comum no Vivid quando o Feegow cai) ⇒ `where('acc','==')`
  falha. ACC presente só no SR e não nas imagens ⇒ nível-estudo do
  Orthanc fica vazio ⇒ órfão.

> Confirmado com dado real: Orthanc com `OverwriteInstances:false`;
> reenvio por cima NÃO substitui; estudo `9854ac18` (Amanda carótida)
> tinha SR com `EX18052616270366` e imagens com ACC vazio; o Wader só
> linkou após **restart** (que zerou a blacklist em memória).

## 3. Decisão — 4 fixes (todos implementados nesta data)

### Fix 1 — Cursor `lastSeq` persistido em disco
Novo `apps/wader/src/workers/ingest-state.ts` (`IngestStateStore`).
Grava `{ lastSeq, studies }` em `C:\Wader\.wader-ingest-state.json`
(raiz, **fora de `src\`** — o deploy manual `update-wader.ps1` copia só
`src\*`, então não apaga o estado). Escrita atômica (tmp+rename),
debounce 1,5s, `flush()` no fim de cada tick e no `stop()`.
Boot retoma de onde parou — **acabou o re-scan de 5 min**.

### Fix 2 — Re-avaliação por completude (fim da blacklist eterna)
`processedStudyIds` (Set) **removido**. No lugar, assinatura por estudo
`{nImg,nSR,matched,at}`. `precisaProcessar(studyId,curImg,curSR)`
reprocessa quando: nunca visto **OU** ainda não casou **OU** o Orthanc
agora tem mais imagens/SR do que gravamos. Contagem atual é barata
(`getStudySeries` conta instances por modalidade, não baixa nada).
`processarEstudo` já é idempotente. Resolve "4 imgs sem SR" (o resto
chega → novo `StableStudy` → reprocessa e completa) e o órfão que ganha
ACC depois (reenvio).

### Fix 3 — Recuperação dirigida por ACC (O(1), não pagina o feed)
Novo `apps/wader/src/workers/acc-recovery-worker.ts`. A cada ciclo
(intervalo do worklist-sync, 60s): pega exames LEO `status=aguardando`
sem `dicomStudyUid` (filtro em memória, `where('status','==')` simples —
sem índice composto), janela de 4 dias, ≤25 por vez; pra cada um,
`POST /tools/find {AccessionNumber:'*'+digitos+'*'}` no Orthanc; achou →
`processarEstudo` na hora. Recupera em ≤1 ciclo **sem esperar o feed**.

### Fix 4 — ACC normalizado + varredura em qualquer série
Novo `apps/wader/src/lib/acc.ts`: `digitos()` (só números),
`accIgual()`, `candidatos()` (`["18052616270366","EX18052616270366"]`).
Em `dicom-ingest.ts`: `resolverAccession()` — se nível-estudo vazio,
varre as séries (1ª instance de cada) e usa o 1º ACC achado; o match no
Firestore tenta os **candidatos** (≤3 queries, nunca varre a coleção).
Tolera digitação sem `EX` e ACC só no SR — **não precisaria nem
apagar/reenviar**.

## 4. Arquivos

| Arquivo | Mudança |
|---|---|
| `apps/wader/src/workers/ingest-state.ts` | **NOVO** — estado persistido |
| `apps/wader/src/lib/acc.ts` | **NOVO** — normalização de ACC |
| `apps/wader/src/workers/acc-recovery-worker.ts` | **NOVO** — Fix 3 |
| `apps/wader/src/workers/dicom-ingest-worker.ts` | reescrito (Fix 1+2) |
| `apps/wader/src/workers/dicom-ingest.ts` | `resolverAccession` + match por candidatos (Fix 4) |
| `apps/wader/src/adapters/orthanc-client.ts` | `post()` + `findStudiesByAccession()` |
| `apps/wader/src/index.ts` | sobe + encerra o `AccRecoveryWorker` |

## 5. Validação

- `npm run typecheck` (tsc --noEmit, strict + noUnusedLocals) **limpo**.
- Deploy manual: backup `src.bak-20260518-2000-adr0518` → copiar src →
  reiniciar. Estado persistido em `C:\Wader\.wader-ingest-state.json`.
- Pós-deploy: 13 exames de 18/05 seguem completos; restart NÃO re-varre
  do zero (retoma do `lastSeq` salvo).

## 6. Rollback

Parar Wader → restaurar `C:\Wader\src.bak-20260518-2000-adr0518` → `src`
→ apagar `C:\Wader\.wader-ingest-state.json` → reiniciar.

## 7. Pendente / futuro

- **UI de auto-cura na 8043** (secretária resolve órfão duvidoso com 1
  clique) — fora deste escopo, registrado.
- `update-wader.ps1`: documentar que `.wader-ingest-state.json` (raiz)
  é estado local e não deve ser versionado/apagado.
- Quando o Feegow volta, MWL automática — nada disso é exercido no
  caminho feliz; os fixes são a rede de proteção pros dias de Feegow fora.
