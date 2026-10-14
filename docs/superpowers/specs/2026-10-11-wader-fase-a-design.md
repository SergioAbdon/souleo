# Wader Fase A — programa do Windows que não morre e atualiza com um ok

> **Status:** design aprovado pelo Sergio em 11/10/2026 após brainstorm + tríade sobre a spec: Codex (9 achados, 4 mudaram o desenho), Ruflo reviewer (10 achados de fronteira, 8 aplicados) e Ponytail (8 cortes, 7 aplicados). Revisão 2 em 12/10.
> **Decisões de direção:** MedCardio primeiro, produto por acréscimo · ordem A → B → C · abordagem "executável único + instalador" (opção 2) já pensando em vender.
> **Escopo desta spec:** só a Fase A. A janela (B) e a gerência pela nuvem (C) têm specs próprias depois.
> **ADRs de base:** 2026-05-17 (não reescrever o núcleo), 2026-05-18 (cursor persistido), 2026-06-26 (console, `WADER_UI_ONLY`), 2026-08-22 (S4), 2026-10-07 (incidentes).

## 1. Problema

O Wader hoje é `npm start` numa janela `cmd` minimizada em `C:\Wader`, atualizado por cópia manual de `src`. Dores reais que esta fase ataca:

| Dor | Evidência | O que a Fase A faz |
|---|---|---|
| 1. Morre em silêncio (clique na janela = AppHang; não sobe no boot) | 13/05, 07/10 (5 exames parados 40 min) | Serviço do Windows + vigia interno |
| 2. Atualização manual e às cegas | 8 dias defasado em 05/2026; retry de 01/09 ainda não confirmado na clínica | Release no GitHub + aviso + troca com um clique + voltar |
| 8. Scripts "no muque" fora do repo | 4 scripts em `C:\Wader\scripts` | Entram em `apps/wader/scripts/` com dry-run |
| 10. Dois Waders no mesmo workspace escrevem em dobro | Achado 11 da S4 | Cadeado de líder no Firestore |

Fora da Fase A: janela/bandeja (B), alerta por WhatsApp/e-mail e painel no LEO (C), backup do DICOM cru, certificado de assinatura, outras marcas/agendas, senha do Orthanc no histórico público (tarefa separada de 10 min, fazer na mesma visita).

## 2. O que fica instalado na clínica

```
C:\Program Files\Wader\            (programa — trocado pelo instalador e pelas atualizações)
  wader.exe                        Node 24 + código, empacotado (@yao-pkg/pkg; plano B: Node SEA)
  wader.exe.prev                   versão anterior, pra voltar
  wader-launch.ps1                 lançador: aplica atualização/rollback ANTES de subir o exe
  wader-aviso.ps1                  notificador da sessão do usuário (toast)
  wader-service.exe                WinSW 2.12 renomeado (MIT)
  wader-service.xml                config do serviço
  unins000.exe                     desinstalador (Inno Setup)

C:\ProgramData\Wader\              (dados — sobrevivem a desinstalar/reinstalar)
  wader.config.json                config da máquina (wsId, agentId, worklistPath, porta, adminPin)
  sa.json                          credencial Firebase (ACL: só Administrators + conta do serviço)
  .wader-ingest-state.json         cursor do Orthanc (ADR 2026-05-18)
  updates\pedido.json              escrito SÓ pelo exe, lido e apagado pelo lançador (ver §4)
  updates\lancador.json            escrito SÓ pelo lançador, lido pelo exe na subida
  updates\wader-vX.Y.Z.exe         binário baixado (+ .sha256)
  logs\wader.out.log, wader.err.log  log rotativo do WinSW
```

**Conta do serviço:** `NT AUTHORITY\NetworkService` (sem senha, sem privilégio de administrador, tem rede). O instalador dá a ela permissão de modificar `ProgramData\Wader` e a pasta de worklists do Orthanc (`orthanc.worklistPath`). Não roda como SYSTEM (achado Codex 1).

**Pasta de trabalho do serviço** = `C:\ProgramData\Wader`. O código atual já lê `wader.config.json` e grava o cursor a partir de `process.cwd()`, então isso não muda uma linha dos workers.

**`/health` e `/admin` continuam em `127.0.0.1:8043`** (já é assim hoje, `server.ts:71`).

## 3. Serviço (WinSW)

`wader-service.xml`:

- `<executable>powershell.exe</executable>` com `-NoProfile -ExecutionPolicy Bypass -File "C:\Program Files\Wader\wader-launch.ps1"`.
- `<startmode>Automatic</startmode>`, `<workingdirectory>C:\ProgramData\Wader</workingdirectory>`.
- `<onfailure action="restart" delay="10 sec"/>`, `<onfailure action="restart" delay="1 min"/>`, `<onfailure action="restart" delay="10 min"/>` — escada, não loop (achado Codex 2 sobre `resetfailure`).
- `<resetfailure>1 hour</resetfailure>`, `<stopparentprocessfirst>true</stopparentprocessfirst>`.
- `<log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>8</keepFiles></log>`.
- `<serviceaccount><username>NT AUTHORITY\NetworkService</username></serviceaccount>` (conta embutida, sem senha; confirmar na tarefa do instalador que o WinSW 2.12 aceita sem `<password>`; se não, `sc config obj=`).
- `<env name="NODE_ENV" value="production"/>` — sem isso o `logger.ts:10-20` tenta carregar o `pino-pretty` (worker thread fora do pacote) e o exe cai na subida (achado Ruflo 1).

**Regra dos códigos de saída** (WinSW só reinicia em saída diferente de zero):

| Código | Significado | Quem decide |
|---|---|---|
| 0 | nunca usado enquanto serviço (parada manual é `Stop-Service`, sem código) | — |
| 2 | config/credencial inválida | `index.ts` (já existe) |
| 3 | vigia: ciclo de ingestão parado > 2 min, ou perdeu a liderança (§7) | vigia / cadeado |
| 10 | pedido de atualização ou rollback gravado em `pedido.json` | botão do `/admin` |
| outro | queda | — |

Todos ≠ 0 → WinSW reinicia → lançador roda de novo. Antes de qualquer `exit`, o exe grava `{ motivo, em }` em `pedido.json` de forma síncrona (sem rede); a subida seguinte publica no batimento (corte Ponytail 3: nada de escrever no Firestore a caminho da saída).

## 4. Lançador `wader-launch.ps1` (a peça que o Codex pediu)

Roda a cada início do serviço, **antes** do `wader.exe`. É quem troca arquivos, porque nesse momento o exe não está em execução (sem renomear binário aberto, sem janela sem programa — achados Codex 3 e 4).

**Dois arquivos, um dono cada** (achado Ruflo 2):

| Arquivo | Escreve | Lê | Conteúdo |
|---|---|---|---|
| `pedido.json` | só o exe | lançador (e apaga depois de atender) | `{ atualizar?: "1.2.0", voltar?: true, motivo?: "travado"\|"lider"\|"atualizacao"\|"rollback"\|"config", em }` |
| `lancador.json` | só o lançador | exe na subida | `{ quedasSeguidas: 0, versaoRejeitada?: "1.2.0", erro?: "sha", ultimaSaida?: { motivo, em } }` |

Toda escrita é em `.tmp` + rename (atômica no NTFS).

Lógica, nesta ordem:

1. Lê `pedido.json` (se existir) e `lancador.json`.
2. **Se `voltar`, ou `quedasSeguidas ≥ 3` e existe `wader.exe.prev`**: copia `wader.exe.prev` → `wader.exe`, grava `versaoRejeitada` = versão que caiu (lida do nome do binário baixado), zera `quedasSeguidas`.
3. **Senão, se `atualizar` e existe `updates\wader-v{X}.exe`** com SHA-256 igual ao `.sha256` ao lado (a única conferência de SHA; o exe só baixa — corte Ponytail 4): copia `wader.exe` → `wader.exe.prev`, copia o novo por cima. SHA diferente ou arquivo ausente → grava `erro: "sha"`.
4. Copia `pedido.motivo/em` pra `lancador.ultimaSaida`, apaga `pedido.json`, grava `lancador.json`.
5. Executa `wader.exe` e espera. Viveu < 5 min → `quedasSeguidas += 1`; ≥ 5 min → `quedasSeguidas = 0`. Grava e sai com o código do exe (`exit $LASTEXITCODE`).

Queda de luz no meio: na próxima subida o `pedido.json` ainda está lá e o passo repete; a cópia por cima é idempotente.

**O pacote de atualização é só o `wader.exe`** (corte Ponytail 6). Lançador, aviso, WinSW e xml só trocam pelo `Wader-Setup`; uma release que precise deles diz isso nas notas.

## 5. Atualização com ok (dentro do `wader.exe`)

- **Checagem:** a cada 1 h, `GET https://api.github.com/repos/SergioAbdon/souleo/releases/latest` (repo público, sem token; o GitHub já exclui draft e prerelease). Se `tag_name` ≠ `wader-v{versão atual}` e começa com `wader-v`, é versão nova (corte Ponytail 5: sem semver; reintroduzir se o repo ganhar outra linha de release). Resultado vai pra `versaoDisponivel` no batimento e no `/health`. Falha de rede = silêncio, tenta na próxima hora.
- **Botão "Atualizar pra vX"** (`POST /api/admin/atualizar`): baixa `wader.exe` e `wader.exe.sha256` da release pra `updates\wader-vX.exe` / `.sha256`, grava `pedido.json { atualizar: X, motivo: "atualizacao" }`, sai com código 10. O lançador confere o SHA e faz o resto (§4).
- **Botão "Voltar"** (`POST /api/admin/voltar`): só aparece se `wader.exe.prev` existe; grava `pedido.json { voltar: true, motivo: "rollback" }`, sai com 10.
- **Segurança do botão** (achado Codex 1): os dois POSTs exigem header `X-Wader-Pin` igual a `adminPin` da config (6 dígitos, definido no instalador na primeira vez; comparação em tempo constante). 5 erros = 15 min bloqueado. Requisição com header `Origin` presente e diferente de `http://127.0.0.1:8043` / `http://localhost:8043` é recusada (CSRF de página aberta no navegador). Servidor continua só em `127.0.0.1`.
- **Nada acontece sem clique.** A única ação automática é o lançador voltar pra `.prev` após 3 quedas em 5 min, e isso é desfazer.
- Ao subir, o exe lê `lancador.json` e publica `versaoRejeitada`, `erro` e `ultimaSaida` no batimento e no `/health` (não apaga: o arquivo é do lançador).
- **Versão atual:** `index.ts:50` lê `../package.json` relativo a `__dirname`; dentro do pkg isso resolve pro snapshot, onde o `package.json` entra como asset. A PoC confirma; se devolver `0.0.0`, o build passa a gerar `dist/versao.json` (achado Ruflo 6).

## 6. Vigia (watchdog)

- `DicomIngestWorker` passa a gravar `ultimoTickOkEm` no `finally` do tick (uma linha). **Não reusar `lastTickAt`** (`dicom-ingest-worker.ts:119`): ele marca o início do tick e esconderia a trava (achado Ruflo 7).
- Timer separado (30 s): se `agora − ultimoTickOkEm > 2 min` **e** o worker está ligado (líder), grava `pedido.json { motivo: "travado" }` (síncrono, sem rede — achado Codex 6), loga e `process.exit(3)`.
- Cobre o travamento real de 07/10 (loop preso num `write`). Não cobre congelamento total do processo; isso a fase C vê pelo batimento parado. Tick legítimo > 2 min não existe hoje (tick é 5 s com página de 100 changes); se um dia existir, o limite vira config.

## 7. Cadeado de Wader único

Documento `workspaces/{ws}/integracoes/wader`, campo `lider: { agentId, maquina, ate, geracao }`. Mora em `adapters/lider.ts`, novo, chamado pelo `index.ts` no mesmo ponto onde hoje se decide `uiOnly` (achado Ruflo 5). **Os workers não ganham código**: quem decide ligar ou não é o `index.ts`, como já faz.

- **Aquisição** na subida, em transação: pega se `lider` ausente, expirado (`ate < agora`) ou é o próprio `agentId`. Incrementa `geracao`. Conseguiu → sobe os workers e o batimento. Não conseguiu → sobe só a UI (reusa `uiOnly`), `/health` diz `"outro Wader ativo em {maquina}"`, e tenta de novo a cada 1 min; ao conseguir, sobe os workers (chamada ao mesmo `start()` de hoje).
- **Renovação** a cada 30 s, em transação, só se `lider.agentId` e `geracao` ainda são os meus; `ate = agora + 90 s`. Se descobre outro dono, ou não consegue renovar por 90 s (sem rede): grava `pedido.json { motivo: "lider" }` e `process.exit(3)` (corte Ponytail 1: sair é mais simples que "parar nos checkpoints", e o cursor persistido do ADR 2026-05-18 torna o reinício seguro). Reintroduzir parada suave se um reinício comprovadamente perder estudo em voo.
- **Uma identidade só** (achados Ruflo 3 e 4): `agentId` passa a ser a chave do batimento também (hoje `heartbeat.ts:38,51` usa `os.hostname()`). **Só o líder escreve** `integracoes/wader`; o campo `conflito` deixa de existir e é derivado de `lider` por quem lê (cartão do LEO em `src/app/(plataforma)/integracoes/page.tsx:681`, uma linha; e o aviso). Sem dois escritores, o cartão não pisca.
- Duas instâncias na **mesma** máquina já colidem na porta 8043; a segunda morre com erro claro.
- `agentId` passa a ser `{hostname}-{4 hex aleatórios}` gerado pelo instalador em instalação nova. Na migração da MedCardio o `wader-001` da config atual é mantido (achado Codex 5 é sobre cópia de config entre máquinas).

## 8. Batimento (campos novos)

`versao` (já existe), `versaoDisponivel`, `lider`, `aviso` (string ou null, ver §9), `ultimaSaida { motivo, em }` e `versaoRejeitada` (os dois últimos lidos de `lancador.json` na subida). Sai `restarts24h` (corte Codex 9), saem `iniciadoEm` e `motivoUltimaSaida` soltos (corte Ponytail 3). O cartão de Integrações do LEO hoje lê só `versao`, `maquina`, `conflito`, `ultimoErroIngest` (`src/lib/integracoes.ts:17-23`) e ignora o resto; campos novos ficam invisíveis até a fase C, por desenho.

## 9. Aviso na tela (`wader-aviso.ps1`)

Registrado pelo instalador como tarefa agendada "ao fazer logon, qualquer usuário". A cada 30 s lê `http://127.0.0.1:8043/health` (timeout 3 s). Mostra toast nativo (WinRT `ToastNotificationManager`, PowerShell 5.1, sem módulo).

**A regra mora no exe, não no script** (corte Ponytail 2, achado Ruflo 8): o `/health` ganha `schema: 1` e um campo `aviso: string | null` calculado pelo exe. O `.ps1` só faz duas coisas: texto do `aviso` mudou → toast com esse texto; duas leituras sem resposta → toast "Wader parado" (e "Wader de volta (vX)" quando responder). Toda a lógica abaixo é TypeScript com teste, e o formato do `/health` é travado por um teste de contrato que o Pester reusa.

| Condição (no exe) | `aviso` |
|---|---|
| Orthanc sem resposta há 5 min | "Wader sem Orthanc" |
| `versaoDisponivel` | "Wader vX disponível — abra o painel pra atualizar" |
| não-líder | "Outro Wader ativo em {maquina}" |
| `versaoRejeitada` na subida | "Wader voltou pra vY: a vX caiu 3 vezes" |
| nada | null |

Sem sessão aberta não há aviso; é limitação aceita (fase C cobre).

## 10. Release e instalador

- `apps/wader/package.json` → `1.0.0`; `engines.node >= 24`. Tag `wader-v1.0.0` tem que bater com o `package.json`, senão o workflow falha.
- **Build:** `tsc` **não copia** `src/ui/pages` (achado Ruflo 1: `dist/ui/` hoje só tem `api/` e `server.js`). O script `build` passa a ser `tsc && copia src/ui/pages → dist/ui/pages`. O pkg entra com `assets: ["dist/ui/pages/**", "package.json"]`.
- **`.github/workflows/wader-release.yml`** (primeiro CI do repo), disparado por tag `wader-v*`, runner `windows-latest`: `npm ci` → `npm test` (vitest) → Pester no lançador → build → `@yao-pkg/pkg` alvo `node24-win-x64` → `choco install innosetup` → `iscc /Q wader.iss` → SHA-256 → release com `Wader-Setup-vX.exe`, `wader.exe`, `wader.exe.sha256`.
- **Inno Setup (`apps/wader/installer/wader.iss`)**: instala em `Program Files\Wader`; cria `ProgramData\Wader` com ACL; primeira instalação pergunta `wsId`, `worklistPath`, caminho do `sa.json` (copia pra ProgramData) e `adminPin`, e gera `agentId`; `wader-service.exe install` + `start`; `schtasks` pro aviso; desinstalar = `stop` + `uninstall` do serviço, remove tarefa, **preserva ProgramData**. O instalador é genérico: não sabe nada da MedCardio.
- **Migração MedCardio** = `apps/wader/scripts/migrar-medcardio.ps1`, rodado uma vez na visita, **antes** do `Wader-Setup` (corte Ponytail 7 + achado Codex 8): (1) mata `node.exe` com `tsx src/index` e **espera até não existir mais** (até 30 s); (2) copia `wader.config.json`, `sa.json`, `.wader-ingest-state.json` de `C:\Wader` pra ProgramData, ignorando `wader.config.local.json` (`load.ts:5` dá precedência a ele — achado Ruflo 6); (3) reescreve `firebase.serviceAccountPath` pro caminho novo e mantém `agentId = wader-001`; (4) `C:\Wader` fica intacto como rollback até o Sergio apagar. Na mesma tarefa, `update-wader.ps1` é apagado: morre no dia em que o serviço existe.
- **Sem assinatura** nesta fase: SmartScreen avisa na instalação ("Mais informações → Executar assim mesmo"). Certificado entra quando for vender.

## 11. Scripts operacionais no repo

`promover-pendentes.ts`, `add-procmap-faltantes.ts`, `feegow-diag-nome.ts`, `diag-paciente-hoje.ts` entram em `apps/wader/scripts/` com dry-run padrão e `--commit` pra gravar. Dependência: o Claude da clínica manda os 4 arquivos (branch `claude/scripts-clinica`). Não entram no `wader.exe`; rodam com `tsx` a partir do repo, como os scripts que já existem.

## 12. Erros e situações

| Situação | Comportamento |
|---|---|
| Sem internet | Sem nuvem não há worklist a ler nem upload a fazer, então os workers pausam quando o cadeado expira (90 s) e retomam sozinhos quando a renovação volta a funcionar. Isso também evita escrita atrasada de um Wader que perdeu a liderança. Batimento e checagem de release falham em silêncio e tentam no próximo ciclo |
| Orthanc fora | Como hoje: tenta a cada tick. Aviso após 5 min |
| Binário corrompido / SHA ≠ | Lançador descarta, mantém versão, grava `erro` |
| Versão nova cai 3× em 5 min | Lançador volta pra `.prev` sozinho, `versaoRejeitada` no batimento e no aviso |
| Config inválida | Código 2; escada do WinSW (10 s, 1 min, 10 min) evita loop quente |
| Parada manual (`Stop-Service Wader`) | Não reinicia; aviso diz "Wader parado" |
| Porta 8043 ocupada | Sai com código 2 e mensagem clara |

## 13. Testes

- **Unitários (vitest, suíte atual de 33):** detecção de versão nova a partir de `releases/latest`; transação do cadeado (fake do Firestore: aquisição, renovação com dono trocado, expiração); vigia com relógio falso; cálculo do `aviso`; PIN (tempo constante, bloqueio após 5); checagem de `Origin`; leitura de `lancador.json` na subida; contrato do `/health` (`schema: 1`).
- **Pester (CI Windows), 3 casos:** lançador em pasta temporária aplica `atualizar`, recusa SHA errado, volta pra `.prev` (por `voltar` e por `quedasSeguidas ≥ 3`).
- **Prova de conceito = Task 1 do plano:** empacotar o Wader de hoje, rodar numa VM/sandbox sem Node, autenticar no Firebase de teste, servir `/conferencia`, processar 1 estudo no Orthanc local. Se o pkg falhar com firebase-admin/grpc → Node SEA com esbuild antes de qualquer outra tarefa.
- **Ensaio no notebook** (Orthanc local de 09/05): instalar, matar o processo e ver o serviço levantar, travar o tick de propósito e ver o vigia, publicar `wader-v1.0.0` e depois `wader-v1.0.1` de verdade, atualizar pelo botão, voltar pela `.prev`.
- **Clínica:** visita do Sergio, instalação por cima com `C:\Wader` intacto.

## 14. Riscos assumidos

1. **Empacotamento** (pkg × firebase-admin) é o único ponto sem precedente documentado. Plano B pronto.
2. WinSW 2.12 é de 2023; estável, mas sem evolução. Trocar por 3.x quando sair estável é só trocar um `.exe`.
3. Toast depende de sessão aberta. Aceito.
4. Vigia não vê congelamento total. Fase C.

## 15. Sequência proposta de tarefas (entrada do `writing-plans`)

Oito tarefas (corte Ponytail 8):

1. PoC do executável (decide pkg × SEA; inclui cópia das páginas e `NODE_ENV`).
2. Lançador + `pedido.json`/`lancador.json` + códigos de saída + leitura na subida + Pester.
3. Vigia (`ultimoTickOkEm` + timer).
4. Cadeado de líder (`adapters/lider.ts`, identidade única, `conflito` derivado no LEO).
5. Atualização: checagem de release + botões `/admin` com PIN e Origin + `/health` com `schema` e `aviso`.
6. `wader-aviso.ps1`.
7. WinSW xml + Inno + `migrar-medcardio.ps1` + workflow de release.
8. Scripts da clínica + tríade + ADR + release `wader-v1.0.0`.
