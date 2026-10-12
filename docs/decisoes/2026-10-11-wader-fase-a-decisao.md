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
3. **ACL:** `Get-Acl C:\ProgramData\Wader | fl` → só Administradores, SYSTEM e NETWORK SERVICE (nada de Usuários, nada herdado). `icacls C:\ProgramData\Wader\sa.json` → idem, NetworkService só leitura (R).
4. **Matar e ver levantar:** `Stop-Process -Name wader -Force` → em ~10 s `Get-Service Wader` volta a `Running`; `C:\ProgramData\Wader\lancador.json` tem `quedasSeguidas: 1`.
5. **Vigia:** coberto por teste unitário. (Opcional: apontar `integracoes/orthanc.url` do `wader-dev` pra um IP que não responde e ver `aviso: "Wader sem Orthanc"` no `/health` após 5 min.)
6. **Toast:** logoff/logon (a tarefa dispara ao logon) ou `Start-ScheduledTask Wader-Aviso`; `Stop-Service Wader` → toast "Wader parado"; `Start-Service Wader` → "Wader de volta".
7. **Atualização por cima:** rodar o mesmo Setup de novo → não pede dados (config existe), sem "arquivo em uso" (o serviço para em `PrepareToInstall`, antes da cópia), serviço volta a `Running`.
8. **Desinstalar** pelo Painel de Controle → serviço some, tarefa `Wader-Aviso` some, `C:\ProgramData\Wader` continua.

Anotar aqui qualquer desvio (ex.: WinSW recusou NetworkService → contorno `sc.exe config Wader obj= "NT AUTHORITY\NetworkService"`).

Mudanças da Task 7 sobre o plano (controlador): `stop` do serviço foi pra `PrepareToInstall` (em `[Run]` o `wader.exe` estaria em uso na cópia); `icacls /inheritance:r` em `C:\ProgramData\Wader` a cada instalação e no `migrar-medcardio.ps1` (por herança, Usuários criariam `updates\wader-vX.exe` + `pedido.json` e rodariam código como NetworkService); Pester fixado em 5.7.1 no workflow; `registrar-aviso.ps1` valida argumentos antes de remover e para a tarefa antes de desregistrar; `migrar-medcardio.ps1` grava config UTF-8 sem BOM.
