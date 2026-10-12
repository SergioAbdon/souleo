# Wader Fase A — programa do Windows que não morre e atualiza com um ok

> **Status:** design aprovado pelo Sergio em 11/10/2026 após brainstorm + revisão adversarial do Codex (9 achados, 4 mudaram o desenho).
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
  updates\state.json               estado da atualização (ver §5)
  updates\wader-vX.Y.Z.zip         pacote baixado
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
- `<serviceaccount><username>NT AUTHORITY\NetworkService</username></serviceaccount>` (conta embutida, sem senha; confirmar na Task 9 que o WinSW 2.12 aceita sem `<password>`; se não, o instalador registra com `sc config obj=`).

**Regra dos códigos de saída** (WinSW só reinicia em saída diferente de zero):

| Código | Significado | Quem decide |
|---|---|---|
| 0 | nunca usado enquanto serviço (parada manual é `Stop-Service`, sem código) | — |
| 2 | config/credencial inválida | `index.ts` (já existe) |
| 3 | vigia: ciclo de ingestão parado > 2 min | vigia |
| 10 | pedido de atualização ou rollback gravado em `state.json` | botão do `/admin` |
| outro | queda | — |

Todos ≠ 0 → WinSW reinicia → lançador roda de novo.

## 4. Lançador `wader-launch.ps1` (a peça que o Codex pediu)

Roda a cada início do serviço, **antes** do `wader.exe`. É quem troca arquivos, porque nesse momento o exe não está em execução (sem renomear binário aberto, sem janela sem programa — achados Codex 3 e 4). Lógica, nesta ordem:

1. Lê `updates\state.json`: `{ pendente?: "1.2.0", rollback?: true, tentativas: [iso...], versaoRejeitada?: "1.2.0" }`.
2. **Se `rollback` ou (≥ 3 `tentativas` nos últimos 5 min e existe `wader.exe.prev`)**: copia `wader.exe.prev` → `wader.exe`, grava `versaoRejeitada` = versão que caiu, limpa `pendente`/`rollback`/`tentativas`.
3. **Senão, se `pendente` e existe `updates\wader-v{pendente}.zip`** com SHA-256 igual ao `wader-v{pendente}.zip.sha256`: extrai pra `updates\tmp\`; copia `wader.exe` → `wader.exe.prev`; copia `tmp\wader.exe`, `tmp\wader-launch.ps1`, `tmp\wader-aviso.ps1` por cima (PowerShell já leu o próprio script, pode ser sobrescrito); limpa `pendente`. SHA diferente ou zip ausente → limpa `pendente`, grava `erro`.
4. Anota a tentativa (`tentativas += agora`, mantém só as últimas 10), grava `state.json`.
5. Executa `wader.exe` e espera. Se rodou ≥ 5 min, zera `tentativas` ao terminar. Sai com o código do exe (`exit $LASTEXITCODE`).

Cada passo grava `state.json` antes de mexer em arquivo, então queda de luz no meio retoma do estado gravado. Cópia, não rename: o `.prev` só é sobrescrito depois que o zip novo foi verificado.

Só o instalador troca `wader-service.exe`/`.xml` (WinSW não se atualiza em execução). Uma release que precise de WinSW novo diz isso nas notas e exige rodar o `Wader-Setup`.

## 5. Atualização com ok (dentro do `wader.exe`)

- **Checagem:** a cada 1 h, `GET https://api.github.com/repos/SergioAbdon/souleo/releases?per_page=30` (repo público, sem token). Filtra `tag_name` que começa com `wader-v`, ignora `draft` e `prerelease`, pega a maior versão semver > versão atual (`package.json`, lida como hoje). Resultado vai pra `versaoDisponivel` no batimento e no `/health`. Falha de rede = silêncio, tenta na próxima hora.
- **Botão "Atualizar pra vX"** (`POST /api/admin/atualizar`): baixa `wader-vX.zip` e `.sha256` da release pra `updates\`, confere SHA, grava `state.json.pendente = X`, grava motivo `atualizacao` no batimento, sai com código 10. O lançador faz o resto (§4).
- **Botão "Voltar"** (`POST /api/admin/voltar`): só aparece se `wader.exe.prev` existe; grava `state.json.rollback = true`, sai com 10.
- **Segurança do botão** (achado Codex 1): os dois POSTs exigem header `X-Wader-Pin` igual a `adminPin` da config (6 dígitos, definido no instalador na primeira vez; comparação em tempo constante). 5 erros = 15 min bloqueado. Requisição com header `Origin` presente e diferente de `http://127.0.0.1:8043` / `http://localhost:8043` é recusada (CSRF de página aberta no navegador). Servidor continua só em `127.0.0.1`.
- **Nada acontece sem clique.** A única ação automática é o lançador voltar pra `.prev` após 3 quedas em 5 min, e isso é desfazer.
- Ao subir, o exe lê `state.json`: se há `versaoRejeitada` ou `erro`, publica no batimento e no `/health` e limpa.

## 6. Vigia (watchdog)

- `DicomIngestWorker` passa a gravar `ultimoTickOkEm` ao fim de cada tick completo (sucesso ou falha tratada).
- Timer separado (30 s): se `agora − ultimoTickOkEm > 2 min` **e** o worker está ligado (líder), grava `motivoSaida: 'travado'` no batimento com timeout de 3 s (não espera mais que isso — achado Codex 6), loga e `process.exit(3)`.
- Cobre o travamento real de 07/10 (loop preso num `write`). Não cobre congelamento total do processo; isso a fase C vê pelo batimento parado. Tick legítimo > 2 min não existe hoje (tick é 5 s com página de 100 changes); se um dia existir, o limite vira config.

## 7. Cadeado de Wader único

Documento `workspaces/{ws}/integracoes/wader`, campo `lider: { agentId, maquina, ate, geracao }`.

- **Aquisição** na subida, em transação: pega se `lider` ausente, expirado (`ate < agora`) ou é o próprio `agentId`. Incrementa `geracao`.
- **Renovação** a cada 30 s, em transação, só se `lider.agentId` e `geracao` ainda são os meus; `ate = agora + 90 s`. Se a renovação descobre outro dono (achado Codex 5): seta `perdiLideranca = true`, os workers param no próximo ponto de verificação (entre estudos no ingest, antes de cada escrita de `.wl`), e o processo volta a tentar o cadeado a cada 1 min.
- **Não-líder:** sobe só a UI (reusa `WADER_UI_ONLY`), `/health` diz `"outro Wader ativo em {maquina}"`, não escreve o batimento principal (só o campo `conflito`, como hoje).
- Duas instâncias na **mesma** máquina já colidem na porta 8043; a segunda morre com erro claro.
- `agentId` passa a ser `{hostname}-{4 hex aleatórios}` gerado pelo instalador em instalação nova. Na migração da MedCardio o `wader-001` da config atual é mantido (achado Codex 5 é sobre cópia de config entre máquinas).

## 8. Batimento (campos novos)

`versao`, `versaoDisponivel`, `iniciadoEm`, `motivoUltimaSaida` (`travado` | `atualizacao` | `rollback` | `config` | `queda`), `versaoRejeitada`, `lider`. Sai `restarts24h` (o `state.json` já conta — corte do Codex 9). É o que a fase C vai ler.

## 9. Aviso na tela (`wader-aviso.ps1`)

Registrado pelo instalador como tarefa agendada "ao fazer logon, qualquer usuário". A cada 30 s lê `http://127.0.0.1:8043/health` (timeout 3 s). Mostra toast nativo (WinRT `ToastNotificationManager`, PowerShell 5.1, sem módulo) **só quando o estado muda**:

| Estado | Texto |
|---|---|
| sem resposta por 2 leituras | "Wader parado" |
| voltou | "Wader de volta (vX)" |
| `orthanc.ok = false` por 5 min | "Wader sem Orthanc" |
| `versaoDisponivel` | "Wader vX disponível — abra o painel pra atualizar" (uma vez por versão) |
| `lider` de outra máquina | "Outro Wader ativo em {maquina}" |
| `versaoRejeitada` | "Wader voltou pra vY: a vX caiu 3 vezes" |

Sem sessão aberta não há aviso; é limitação aceita (fase C cobre).

## 10. Release e instalador

- `apps/wader/package.json` → `1.0.0`; `engines.node >= 24`. Tag `wader-v1.0.0` tem que bater com o `package.json`, senão o workflow falha.
- **`.github/workflows/wader-release.yml`** (primeiro CI do repo), disparado por tag `wader-v*`, runner `windows-latest`: `npm ci` → `npm test` (vitest) → Pester no lançador → `tsc` → `@yao-pkg/pkg` alvo `node24-win-x64` com `assets: ["dist/ui/pages/**", "package.json"]` → `choco install innosetup` → `iscc /Q wader.iss` → SHA-256 → release com `Wader-Setup-vX.exe`, `wader-vX.zip` (exe + 2 scripts), `wader-vX.zip.sha256`.
- **Inno Setup (`apps/wader/installer/wader.iss`)**: instala em `Program Files\Wader`; cria `ProgramData\Wader` com ACL; primeira instalação pergunta `wsId`, `worklistPath`, caminho do `sa.json` (copia pra ProgramData) e `adminPin`; `wader-service.exe install` + `start`; `schtasks` pro aviso; desinstalar = `stop` + `uninstall` do serviço, remove tarefa, **preserva ProgramData**.
- **Migração MedCardio** (achado Codex 8), no instalador quando detecta `C:\Wader\wader.config.json`: (1) mata `node.exe` com `tsx src/index` e **espera até não existir mais** (até 30 s); (2) copia `wader.config.json`, `sa.json`, `.wader-ingest-state.json` pra ProgramData; (3) reescreve `firebase.serviceAccountPath` pro caminho novo; (4) registra e inicia o serviço; (5) `C:\Wader` fica intacto como rollback até o Sergio apagar.
- **Sem assinatura** nesta fase: SmartScreen avisa na instalação ("Mais informações → Executar assim mesmo"). Certificado entra quando for vender.

## 11. Scripts operacionais no repo

`promover-pendentes.ts`, `add-procmap-faltantes.ts`, `feegow-diag-nome.ts`, `diag-paciente-hoje.ts` entram em `apps/wader/scripts/` com dry-run padrão e `--commit` pra gravar. Dependência: o Claude da clínica manda os 4 arquivos (branch `claude/scripts-clinica`). Não entram no `wader.exe`; rodam com `tsx` a partir do repo, como os scripts que já existem.

## 12. Erros e situações

| Situação | Comportamento |
|---|---|
| Sem internet | Sem nuvem não há worklist a ler nem upload a fazer, então os workers pausam quando o cadeado expira (90 s) e retomam sozinhos quando a renovação volta a funcionar. Isso também evita escrita atrasada de um Wader que perdeu a liderança. Batimento e checagem de release falham em silêncio e tentam no próximo ciclo |
| Orthanc fora | Como hoje: tenta a cada tick. Aviso após 5 min |
| Zip corrompido / SHA ≠ | Lançador descarta, mantém versão, grava `erro` |
| Versão nova cai 3× em 5 min | Lançador volta pra `.prev` sozinho, `versaoRejeitada` no batimento e no aviso |
| Config inválida | Código 2; escada do WinSW (10 s, 1 min, 10 min) evita loop quente |
| Parada manual (`Stop-Service Wader`) | Não reinicia; aviso diz "Wader parado" |
| Porta 8043 ocupada | Sai com código 2 e mensagem clara |

## 13. Testes

- **Unitários (vitest, suíte atual de 33):** comparação semver e escolha da release (fixtures da API do GitHub, com draft/prerelease); transação do cadeado (fake do Firestore: aquisição, renovação com dono trocado, expiração); vigia com relógio falso; PIN (tempo constante, bloqueio após 5); checagem de `Origin`; leitura de `state.json` na subida.
- **Pester (CI Windows):** lançador em pasta temporária: aplica pendente, recusa SHA errado, faz rollback por `rollback` e por 3 tentativas, zera tentativas após 5 min, retoma de `state.json` parcial.
- **Prova de conceito = Task 1 do plano:** empacotar o Wader de hoje, rodar numa VM/sandbox sem Node, autenticar no Firebase de teste, servir `/conferencia`, processar 1 estudo no Orthanc local. Se o pkg falhar com firebase-admin/grpc → Node SEA com esbuild antes de qualquer outra tarefa.
- **Ensaio no notebook** (Orthanc local de 09/05): instalar, matar o processo e ver o serviço levantar, travar o tick de propósito e ver o vigia, publicar `wader-v1.0.0` e depois `wader-v1.0.1` de verdade, atualizar pelo botão, voltar pela `.prev`.
- **Clínica:** visita do Sergio, instalação por cima com `C:\Wader` intacto.

## 14. Riscos assumidos

1. **Empacotamento** (pkg × firebase-admin) é o único ponto sem precedente documentado. Plano B pronto.
2. WinSW 2.12 é de 2023; estável, mas sem evolução. Trocar por 3.x quando sair estável é só trocar um `.exe`.
3. Toast depende de sessão aberta. Aceito.
4. Vigia não vê congelamento total. Fase C.

## 15. Sequência proposta de tarefas (entrada do `writing-plans`)

1. PoC do executável (decide pkg × SEA). 2. Pasta de dados + `state.json` + leitura na subida. 3. Lançador + Pester. 4. Códigos de saída + vigia. 5. Cadeado de líder. 6. Checagem de release + batimento. 7. Botões `/admin` com PIN + Origin. 8. `wader-aviso.ps1`. 9. WinSW xml + Inno + migração. 10. Workflow de release. 11. Scripts da clínica. 12. Tríade + ADR + release `wader-v1.0.0`.
