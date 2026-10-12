# 2026-10-11 — Wader "nova versão": decomposição A/B/C e Fase A desenhada

> **Status:** design da Fase A aprovado pelo Sergio em 11/10, tríade sobre a spec aplicada em 12/10. **Próximo passo:** `superpowers:writing-plans` sobre a spec, em sessão nova.
> **Spec (fonte da verdade do desenho):** `docs/superpowers/specs/2026-10-11-wader-fase-a-design.md` (rev.2, commit `afee4ca`).
> **Dono:** Sergio (decisões) + Claude notebook.

## Contexto

Sergio perguntou se "a nova versão do Wader" estava pronta. Levantamento mostrou que ela foi **definida três vezes e nunca construída**: arquitetura de 07/05 (`wader.exe` + serviço Windows + instalador), visão de produto de 09/05 (Electron + bandeja + wizard) e ADR 26/06 (console: Fase 1 feita e absorvida pela S4, Fases 2 e 3 nunca começaram). Hoje o Wader é `npm start` numa janela cmd em `C:\Wader`, com cópia manual de `src`.

## Decisões do Sergio (11/10)

1. **MedCardio primeiro, produto por acréscimo.** Resolver as 11 dores reais vividas de maio a outubro (lista na spec §1), sem abstrair o que a MedCardio não usa.
2. **Decomposição em 3 sub-projetos, ordem A → B → C:**
   - **A. Processo robusto**: serviço do Windows, vigia, atualização com um clique, instalador. *(esta spec)*
   - **B. Janela do programa**: bandeja, conferência bonita, fila de DICOM pendente, erros visíveis, config do aparelho.
   - **C. Gerência pela nuvem**: painel no LEO com versão/atraso/alerta, "atualizar" pela nuvem, alerta por WhatsApp/e-mail.
3. **Abordagem 2, "já pensando em vender":** executável único (`@yao-pkg/pkg`, plano B Node SEA) + instalador Inno Setup + serviço via WinSW. Rejeitadas: NSSM com Node instalado (opção 1, menor) e Agendador de Tarefas (opção 3).
4. **Atualização avisa e espera o ok** (nunca sozinha). Fonte: release do GitHub com tag `wader-v*`.
5. **Aviso na tela da PC da clínica** (toast do Windows) quando o Wader para, volta, perde o Orthanc ou tem versão nova. Alerta ativo pro Sergio fica pro C.
6. Entram no A também: **cadeado de Wader único** (dor 10) e **scripts operacionais da clínica no repo** (dor 8). Backup do DICOM cru (dor 11) fica de fora.

## O que a tríade mudou no desenho (12/10)

- **Codex (9 achados, 4 estruturais):** a troca de versão sai de dentro do `wader.exe` e vai para um **lançador PowerShell** que o serviço roda antes do exe (sem renomear binário em execução, auto-rollback funciona mesmo com exe quebrado); código de saída **10** para atualização (WinSW só reinicia em saída ≠ 0); botão com **PIN + checagem de Origin**; serviço como **NetworkService**, não SYSTEM.
- **Ruflo (10 achados de fronteira):** build precisa copiar `src/ui/pages` e setar `NODE_ENV=production` (senão o exe cai na subida); `pedido.json` (exe escreve) × `lancador.json` (lançador escreve); identidade única `agentId` no batimento e no cadeado, só o líder escreve `integracoes/wader`; vigia usa campo novo gravado no `finally`, não `lastTickAt`.
- **Ponytail (8 cortes):** perder liderança = `exit(3)` e reiniciar; regras do aviso calculadas no exe (`/health.aviso`), o `.ps1` só mostra; pacote de atualização = só `wader.exe`; `releases/latest` em vez de semver; migração MedCardio vira `migrar-medcardio.ps1` de visita e `update-wader.ps1` morre; 12 tarefas → 8.

## Pendências que atravessam

- Merge `feat/wader-console` → master (import Feegow por nome + start com log): ainda espera o ok do Sergio desde 07/10. Independente da Fase A.
- Confirmar na clínica qual commit roda em `C:\Wader` (retry de 01/09 e ordem de chegada de 31/08).
- Senha do Orthanc no histórico público do git (repo é público): tarefa de 10 min na mesma visita.

## Infra desta sessão

Codex CLI atualizado (0.144 → 0.162; o MCP recusava o modelo); Ruflo MCP dava timeout no npx a frio → `MCP_TIMEOUT=120000` em `~/.claude/settings.json`. Detalhe em memória local `reference_mcps_triade_manutencao`.

## PoC do executável (Task 1 do plano) — 11/10

- Empacotador: **`@yao-pkg/pkg` 6.23.0** (alvo node24-win-x64). Funcionou de primeira — plano B (Node SEA) não foi preciso. Precisou de `"bin": "dist/index.js"` no `package.json` (o `pkg .` recusa sem `bin`; o plano não tinha).
- Tamanho do exe: **185 MB** (184.997.186 bytes — acima dos 90–120 MB previstos; é o firebase-admin/google-cloud inteiro dentro). Avisos do pkg (só 3): `Cannot find module firebase-admin/app`, `firebase-admin/firestore`, `firebase-admin/storage` (em `dist/adapters/firebase.js`) — **inofensivos**: o exe inicializou o Firebase e leu o Firestore normalmente. Em runtime só aparece `DEP0040 punycode` no stderr (aviso de depreciação, sem efeito).
- Provas (exe rodando com Node fora do PATH, `where node` sem resultado, pasta `%LOCALAPPDATA%\wader-poc`):
  - /version = `{"version":"1.0.0"}` — **sim**, sem precisar de `versao.json`.
  - /conferencia → **200**.
  - Firebase **autenticou**: log `Firebase inicializado` + leituras reais do Firestore (`Orthanc connection carregada`, `syncWorklists concluído` do workspace `wader-dev`). Log saiu em JSON (logger sem pino-pretty dentro do exe).
  - 1 estudo do Orthanc local: **FEITO (12/10, 2ª passada).** Estudo sintético (`img2dcm`, AccessionNumber `POC0001`, Modality US, 1 imagem JPEG) enviado ao Orthanc local via `POST /instances` (o `storescu` falhou na negociação da sintaxe JPEG Baseline). Com o exe rodando, `/api/dicom/worker` → `lastError: null`, `lastSeq: 8`, `execCount: 11`, `estudosOrfaos: 1`, `ultimosResultados` com 1 entrada (`accessionNumber: POC0001`, `matched: false` — "Exame com acc=POC0001 não encontrado em workspaces/wader-dev/exames", esperado: o estudo não tem exame no wader-dev). Prova: o exe lê o Orthanc e fala com o Firestore sem explodir.
  - **Mudança de estado compartilhado:** pra isso, `workspaces/wader-dev/integracoes/orthanc.url` foi trocado de `http://192.168.15.27:8042` (MedCardio) para `http://localhost:8042`, e `privado/orthanc` passou a `wader-test` (usuário de teste do `setup-dev.ts`; antes era `leo`). `wader-dev` é só de desenvolvimento (a clínica usa `medcardio`). **Pra voltar:** `npx tsx scripts/apontar-orthanc-medcardio.ts` em `apps/wader` (rodar no PC da clínica ou onde a senha do Orthanc da MedCardio estiver disponível).
- Achado pra Tarefa 7 (instalador/migração): `Set-Content -Encoding UTF8` do **Windows PowerShell 5.1** grava BOM, e `loadConfig` (`JSON.parse` puro) quebrava com BOM. **Tratado na raiz:** `loadConfig` agora remove o BOM inicial (`src/config/load.ts`) + teste `src/config/load.test.ts`. Script/instalador não precisa mais se preocupar, mas gravar sem BOM continua preferível.

## Ensaio da instalação — PENDENTE (precisa admin) — Task 7, 12/10

O instalador compila (`build/Wader-Setup-v0.0.1.exe`, Inno Setup 6.7.3), mas a sessão que o montou **não tinha admin**: instalar o serviço, registrar a tarefa do grupo Users e mexer em ACL de ProgramData ficam para o Sergio, nesta máquina, num PowerShell **como administrador**.

Já provado sem admin (12/10): `wader.exe` rodado de uma pasta de dados **sem `NODE_ENV`** sobe, loga em JSON e vira líder do `wader-dev` — não procura `pino-pretty` (guarda `process.pkg` da Task 1). Repetir o passo 0 se o exe for reconstruído.

0. (opcional) Pasta de teste com cópia de `wader.config.local.json` como `wader.config.json`; `Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue`; rodar `apps\wader\build\wader.exe` dali → linhas `{"level":30,...}`, nada de pino-pretty; Ctrl+C.
1. Se o exe mudou: `cd apps\wader; npm run build; npm run pkg`; WinSW 2.12.0 x64 em `build\wader-service.exe`; `& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" /Q /DVersao=0.0.1 installer\wader.iss`. Rodar `build\Wader-Setup-v0.0.1.exe` como admin (SmartScreen → "Mais informações → Executar assim mesmo"). Preencher `wader-dev`, worklists `C:\Users\sergi\.wader\worklists`, PIN `123456`, `sa.json` = `C:\Users\sergi\.wader\sa.json`.
2. `Get-Service Wader` → `Running`. `Get-Content C:\ProgramData\Wader\logs\wader-service.out.log -Tail 20` → "Sou o líder", "UI server iniciado". `curl.exe -s http://127.0.0.1:8043/health` → `schema: 1`.
3. **ACL:** `Get-Acl C:\ProgramData\Wader | fl` → dono Administradores; só Administradores, SYSTEM e NETWORK SERVICE (nada de Usuários, nada herdado). `icacls C:\ProgramData\Wader\sa.json` → idem, NetworkService só leitura (R). `icacls "C:\Program Files\Wader\bin"` → NETWORK SERVICE com `(OI)(CI)(M)` (**só ali**). `icacls "C:\Program Files\Wader"` → NETWORK SERVICE **sem** escrita (nada de M/F/W): o lançador, o WinSW e os `.ps1` que o desinstalador roda elevado não podem ser trocados pelo serviço.
4. **Matar e ver levantar:** `Stop-Process -Name wader -Force` → em ~10 s `Get-Service Wader` volta a `Running`; `C:\ProgramData\Wader\updates\lancador.json` tem `quedasSeguidas: 1`.
5. **Vigia:** coberto por teste unitário. (Opcional: apontar `integracoes/orthanc.url` do `wader-dev` pra um IP que não responde e ver `aviso: "Wader sem Orthanc"` no `/health` após 5 min.)
6. **Toast:** logoff/logon (a tarefa dispara ao logon) ou `Start-ScheduledTask Wader-Aviso`; `Stop-Service Wader` → toast "Wader parado"; `Start-Service Wader` → "Wader de volta".
7. **Atualização por cima:** rodar o mesmo Setup de novo → não pede dados (config existe), sem "arquivo em uso" (o serviço para em `PrepareToInstall`, antes da cópia), serviço volta a `Running`. `bin\wader.exe.prev` e `updates\lancador.json` anteriores somem (D5; o lançador recria o `lancador.json` na subida).
8. **Desinstalar** pelo Painel de Controle → serviço some, tarefa `Wader-Aviso` some, `C:\ProgramData\Wader` continua.
9. **Atualização de verdade (lançador):** forjar `C:\ProgramData\Wader\updates\pedido.json` = `{"atualizar":"0.0.1","motivo":"atualizacao","em":"<agora ISO>"}` com `updates\wader-v0.0.1.exe` (cópia do próprio `C:\Program Files\Wader\bin\wader.exe`) + `updates\wader-v0.0.1.exe.sha256` correto (`(Get-FileHash ... -Algorithm SHA256).Hash`) → `Restart-Service Wader` → serviço volta `Running`, `pedido.json` sumiu, `updates\lancador.json` tem `versaoAplicada = 0.0.1` e **não** tem `atualizando`. (Prova que NetworkService escreve em `{app}\bin`: o lançador trocou `bin\wader.exe` via `wader.exe.tmp` + rename.) Atenção: com cópia **idêntica** o `bin\wader.exe.prev` NÃO é criado (SHA igual não sobrescreve o `.prev`); ele só aparece quando o exe novo é diferente (ex.: o exe de uma build nova).
10. **Voltar manual:** depois de uma atualização com exe **diferente** (`.prev` existe), botão "Voltar" no `/admin` (PIN) → serviço volta `Running` com o exe anterior; `curl.exe -s http://127.0.0.1:8043/health` → `versaoRejeitada: null`; `lancador.json` sem `versaoAplicada` (só o rollback automático por 3 quedas rejeita versão — D3/L2).
11. **Saída 3 por `lider` não conta queda:** com o serviço líder, tirar a rede por > 90 s (perde o cadeado → `exit 3` com `pedido.json {motivo:"lider"}`) e devolver → `lancador.json` com `quedasSeguidas` **igual ao de antes** e `ultimaSaida.motivo = "lider"`.
12. **Estudo CASADO com imagens (gate antes da tag `wader-v*`):** no `wader-dev`, criar doc em `exames` com o ACC de um estudo do Orthanc local (ex.: `POC0001` da PoC) e deixar o serviço processar → objetos do estudo no Storage + campos do exame preenchidos (imagens/medidas). `firebase-admin/storage` **nunca rodou dentro do exe** (os avisos do pkg citam esse módulo) — só a PoC sem casamento foi provada.

Nota: upgrade **não** re-executa `wader-service.exe install` (o `Check: not ServicoExiste` pula). Mudança no xml que mexe no registro do serviço (conta, `startmode`, `onfailure`) exige `wader-service.exe uninstall` + `install` manual, como admin.

Anotar aqui qualquer desvio (ex.: WinSW recusou NetworkService → contorno `sc.exe config Wader obj= "NT AUTHORITY\NetworkService"`).

Mudanças da Task 7 sobre o plano (controlador): `stop` do serviço foi pra `PrepareToInstall` (em `[Run]` o `wader.exe` estaria em uso na cópia); `icacls /inheritance:r` em `C:\ProgramData\Wader` a cada instalação e no `migrar-medcardio.ps1` (por herança, Usuários criariam `updates\wader-vX.exe` + `pedido.json` e rodariam código como NetworkService); Pester fixado em 5.7.1 no workflow; `registrar-aviso.ps1` valida argumentos antes de remover e para a tarefa antes de desregistrar; `migrar-medcardio.ps1` grava config UTF-8 sem BOM.


## Implementação (Tasks 1–8) — 11–12/10/2026, branch `claude/wader-fase-a`

Esteira `subagent-driven-development`: 1 subagente implementador por tarefa + revisor de spec/qualidade entre elas (7 revisões, 5 ondas de fix). Plano: `docs/planos/2026-10-11-wader-fase-a.md`. Ledger: `.superpowers/sdd/progress.md`.

| Task | Commits | O que entrou | Achados da revisão (corrigidos) |
|---|---|---|---|
| 1 PoC exe | a0dccdf, 7cbe010 | pkg 6.23 node24 (185 MB), `bin` no package.json, logger sem pino-pretty no pkg, loader tolera BOM, 4 provas | prova 4 (Orthanc local) exigiu apontar `wader-dev` pro localhost |
| 2 Lançador | 3ac61d3, b1a78c5 | `saida.ts` (códigos 2/3/10, pedido/lancador.json), `wader-launch.ps1`, Pester 7 | update não-idempotente sobrescrevia `.prev` após queda de luz; voltar sem `.prev` silencioso; `Set-Location` + try/catch no exe |
| 3 Vigia | b6112ee, cda54f7 | `vigia.ts`, `ultimoTickOkEm`/`ultimoOrthancOkEm` no worker | disparo falso ao religar (Math.max); **D2** carimbo de progresso por estudo; one-shot |
| 4 Cadeado | 93074ca, 6775af7 | `lider.ts` (transação, 30 s/90 s), `agentId` no batimento, sem `conflito`, LEO mostra líder (**D1**), guardas 409 `nao_lider` | uiOnly/não-líder podiam escrever (workers null, guardas em reset-cursor/excluir); 90 s por relógio (transação pendurada = 2 líderes); emVoo/parado; batimento sem override |
| 5 Atualização | 6fcce8a, 8b32ab8 | `release.ts`, `pin.ts`, `aviso.ts`, `health.ts` (schema 1 + fixture), `api/atualizacao.ts`, card no /admin, `adminPin` na config | duplo clique/sem timeout no download; falha de rede apagava versão achada; escapeHtml; adminPin string; tag semver; baseline sem-Orthanc = virou líder |
| 6 Toast | e62ad48 | `wader-aviso.ps1`, `registrar-aviso.ps1`, Pester 4 (lê a fixture do /health) | bug do plano `return ,$out` (toast vazio a cada 30 s) corrigido pelo implementador |
| 7 Instalador/CI | 7a7114d, 5b7a3a6 | `wader-service.xml` (WinSW 2.12, NetworkService, escada), `wader.iss`, `migrar-medcardio.ps1` (dry-run), `wader-release.yml`, README; `update-wader.ps1` morre | **crítico**: NetworkService sem escrita em `Program Files\Wader` (1º Atualizar derrubaria o serviço); `[Run]` roda antes de `ssPostInstall` (config depois do start → `BeforeInstall`); `stopwait`; `-ProgramDir %BASE%`; validações |

**Decisões tomadas na execução (pra bater o martelo):**
- **D1** — só o líder escreve `integracoes/wader`; o cartão do LEO mostra `Líder: {maquina}` quando difere do batimento e perde a detecção "2 Waders ativos" até a fase C (fica local, no aviso).
- **D2** — vigia carimba progresso a cada estudo processado (não só no fim do tick): a spec dizia "tick > 2 min não existe hoje", mas página com vários estudos (uploads, retries) pode passar de 2 min e viraria loop de restart com cursor no fim da página.
- **D3** — saídas **2** (config/credencial/porta) e **10** (atualização pedida), e saída **3 com `pedido.motivo = "lider"`** (rede), **não contam como queda** no lançador (nem somam nem zeram `quedasSeguidas`); `travado` conta. `versaoRejeitada` só no rollback automático (3 quedas), nunca no "Voltar" manual. Sem pedido e código ≠ 0 → `ultimaSaida = codigo-N`.
- **D4** — NetworkService só grava em `Program Files\Wader\bin` (onde mora o `wader.exe`); o resto de `{app}` (lançador, WinSW, `registrar-aviso.ps1` que o desinstalador roda elevado) fica só-admin. Substitui o `(OI)(CI)M` em `{app}` inteiro do 5b7a3a6 (escalada de privilégio). ACL de `ProgramData\Wader`: `setowner` Administradores + `reset` + `inheritance:r` com grants (o `/grant:r` sozinho não tirava ACE explícita de outro SID nem trocava o dono); `icacls` **sem `/C`** (com `/C` devolve 0 mesmo falhando); falha de ACL/config → o Setup **não inicia** o serviço.
- **D5** — o Setup é a âncora zero do estado do lançador: toda instalação apaga `bin\wader.exe.prev`, `updates\lancador.json` e `updates\pedido.json`.
- **D6** — saída 10 é tratada em laço interno do lançador (roda o exe de novo sem devolver ao WinSW), pra não gastar a escada 10 s/1 min/10 min. Troca do exe é atômica (`.tmp` + rename) e retomável (`lancador.json.atualizando` marcado antes; queda de luz no meio não sobrescreve o `.prev` bom). Após aplicar, apaga `updates\wader-v*.exe(.sha256)` de outras versões.
- Regra dos 90 s sem margem (spec manda 90). agentId do instalador = hostname + 4 dígitos decimais. PIN por `prompt()` do navegador.
- `wader-dev` agora aponta pro Orthanc local (reverter com `apontar-orthanc-medcardio.ts`).

**Testes no HEAD 5b7a3a6:** Wader vitest 181/181 (23 arquivos; era 120), Pester 11/11, LEO unit 790/790, typecheck limpo nos dois. Workflow de release NUNCA executado (só na tag).

**Fora do escopo entregue:** scripts da clínica (spec §11) — branch `claude/scripts-clinica` não existe no origin em 12/10; entram em commit à parte quando o Claude da clínica mandar.

### Tríade pré-merge (Codex / Ruflo / Ponytail + revisão final de branch)

Rodada sobre o HEAD 5b7a3a6 (diff master…branch, 55 arquivos), 12/10. Quatro óticas independentes, cada uma instruída a não repetir as outras:

| Ótica | Veredito | Achados que bloqueavam |
|---|---|---|
| **Codex** (bugs/segurança/edge cases, adversarial, via `codex exec` — MCP fora) | NEEDS FIX (9) | **Crítico:** `(OI)(CI)M` em `Program Files\Wader` inteiro deixava NetworkService alterar `registrar-aviso.ps1`/`wader-service.exe`, que o desinstalador roda elevado (escalada). `icacls /inheritance:r /grant:r` não remove ACEs explícitas de outros SIDs nem troca o dono. Migração copiava `sa.json` antes da ACL e parava num `Read-Host`. Queda de luz **no meio** da cópia do exe sobrescrevia o `.prev` bom com exe truncado. Aquisição do cadeado concluída após 90 s subia workers com lease vencido. `POST /api/worklist/sync` e `/api/reconciliacao/vincular` sem guarda de líder. Vigia sem carimbo nos laços `soMedidas` e `reprocessarDicom`. `emVoo` solto antes da saída e `/voltar` sem guarda. Instalador gravava config em ANSI (caminho acentuado quebrava). |
| **Ruflo** (arquitetura/fronteiras) | NEEDS FIX (2 + 1 recomendado) | Lançador contava saída 2 (config) como queda → rollback culpando versão boa. Setup por cima deixava `.prev`/`lancador.json` velhos (Voltar iria duas versões atrás). Saída 10 gasta a escada de reinício do WinSW (2 falhas na hora = Atualizar espera 10 min). Guarda de liderança espalhada em 3 rotas, fail-open. |
| **Ponytail** (o que deletar) | APPROVED | Nada bloqueia. Poda para depois: `AtualizacaoDeps` com 5 campos (2 injetados), `DbTx` vs tipo do Firestore, parâmetros nunca injetados em `lider`/`vigia`, `aviso.ts` cabe em `health.ts`, tarefa agendada do toast vira atalho em `{commonstartup}` do Inno, `ServicoExiste`, `version`/`port` redundantes no config gerado, comentários "achado Codex N" que apodrecem. |
| **Revisão final de branch** (integração entre tarefas) | WITH FIXES | Voltar manual gravava `versaoRejeitada` (contradição interna do plano: T2 × T8). Saída 3 por `lider` (rede) contava como queda. Vigia de 2 min apertado para a esteira (upload sem timeout; cursor avança só no fim da página → loop) — spec já previa "limite vira config". **Gate antes da tag:** `firebase-admin/storage` nunca rodou dentro do exe (estudo casado com imagens). |

**O que entrou na onda de fix final** (commits após 5b7a3a6): lançador com laço interno para a saída 10, troca do exe atômica e retomável (`atualizando` + `.tmp` + rename, limpeza de downloads antigos), saídas 2/10/3-lider não contam queda, `versaoRejeitada` só no rollback automático, `ultimaSaida` sempre gravado; instalador com `wader.exe` em `Program Files\Wader\bin` (único lugar gravável pelo serviço), ACL de `ProgramData\Wader` com `setowner` + `reset` + `inheritance:r`, Setup zera `.prev`/`lancador.json`/`pedido.json` (`[InstallDelete]`), dados e ACL em `ssInstall` com `Check: DadosOk` no start, config em UTF-8; migração pede PIN e aplica ACL antes de copiar; cadeado recusa aquisição fora da validade; guarda central de não-líder (`onRequest` em todo POST `/api/*` exceto `/api/admin/*` e `worker/stop`); vigia configurável (`polling.vigiaSeg`, default 300) com carimbo em todos os laços; saída agendada bloqueia Atualizar e Voltar; LEO mostra o líder e mantém `conflito` legado até a migração.

**Fica para depois do merge (ledger `.superpowers/sdd/progress.md`):** contrato `pedido/lancador.json` com `schema` e fixture compartilhada (Ruflo 1); amostra do config gerado pelo instalador passando por `loadConfig` (Ruflo 7); poda do Ponytail; pin do Inno/WinSW no CI; lock não liberado no shutdown gracioso; margem nos 90 s; PIN mascarado (fase B).

**Efeito colateral aceito da guarda central:** um Wader não-líder (ou em `WADER_UI_ONLY`) também recusa `POST /api/agendamentos` (cadastro manual da recepção) com 409 `nao_lider` — não-líder é só leitura, como a spec §7 manda; a recepção usa a máquina líder.

**Commits da onda:** cd8a14f (lançador/instalador/migrar/ADR) e 37bfe8a (TypeScript/LEO). Suítes no HEAD: Wader vitest 186/186 (24 arquivos), Pester 17/17, LEO unit 790/790, typecheck limpo nos dois.
