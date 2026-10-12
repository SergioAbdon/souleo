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
  - 1 estudo do Orthanc local: **NÃO feito.** O `wader-dev` no Firestore aponta `integracoes/orthanc` pro Orthanc da MedCardio (`192.168.15.27:8042`, gravado pelo `apontar-orthanc-medcardio.ts`), não pro `localhost:8042`. O exe tentou ler (`/api/dicom/worker` com `running: true`, `execCount` subindo) e deu timeout no IP da clínica — prova que o worker roda e chama o Orthanc de dentro do exe, mas não que lê um estudo. Re-apontar o `wader-dev` pro localhost mexe em dado compartilhado com a PC da clínica → fica pro Sergio decidir (ou fazer na clínica, onde o IP responde).
- Achado pra Tarefa 7 (instalador/migração): `Set-Content -Encoding UTF8` do **Windows PowerShell 5.1** grava BOM, e `loadConfig` (`JSON.parse` puro) quebra com BOM. No PoC o BOM foi tirado à mão; script que gerar `wader.config.json` precisa gravar sem BOM (ou o loader tolerar).
