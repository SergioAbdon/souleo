# Wader Fase A — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec (fonte da verdade):** `docs/superpowers/specs/2026-10-11-wader-fase-a-design.md` (rev.2). **ADR:** `docs/decisoes/2026-10-11-wader-fase-a-decisao.md`.

**Goal:** Transformar o Wader de `npm start` numa janela cmd em `wader.exe` instalado como serviço do Windows que não morre, avisa na tela, atualiza com um clique (e volta sozinho se a versão nova cair) e garante um só Wader por workspace.

**Architecture:** O exe (Node 24 + código, `@yao-pkg/pkg`) roda sob um serviço WinSW cujo executável é um lançador PowerShell: o lançador aplica atualização/rollback nos arquivos **antes** de subir o exe, e o exe só pede (grava `pedido.json`) e sai com código 10. Dentro do exe entram três peças pequenas e testáveis: vigia (tick parado > 2 min → sai 3), cadeado de líder no Firestore (transação; perdeu → sai 3) e checagem de release do GitHub + botões `/admin` com PIN. O `/health` ganha `schema: 1` e um `aviso` calculado no exe; o script de toast só mostra texto. Instalador Inno Setup genérico; migração da MedCardio é um script de visita.

**Tech Stack:** TypeScript (CommonJS, `tsc`), Fastify 4, firebase-admin 13, pino, vitest 2 (já no repo) · `@yao-pkg/pkg` 6.23.0 (alvo `node24-win-x64`; plano B Node SEA + esbuild) · WinSW 2.12.0 · Windows PowerShell 5.1 (lançador, aviso, migração; **ASCII puro**, ver `scripts/update-wader.ps1` cabeçalho) · Pester 5 (CI) · Inno Setup 6 · GitHub Actions `windows-latest`.

## Global Constraints

- **Nunca** `git stash` (daemon `.claude-flow` engole edições). **Nunca** gravar arquivo com `>>`/`>` no Bash (hook despeja `[INFO] Recording...` dentro do arquivo) — usar Write/Edit ou `node -e`.
- Scripts `.ps1` da clínica em **ASCII puro** (PowerShell 5.1 lê sem BOM como ANSI; acentos quebram o parse). Comentários sem acento nesses arquivos.
- **Motor e workers intocáveis** além do que a spec lista: `dicom-ingest-worker.ts` ganha 2 campos e 2 getters, nada mais. Nenhum worker ganha lógica de líder (quem liga/desliga é `index.ts`).
- Códigos de saída (spec §3): `2` config/credencial/porta ocupada · `3` vigia ou perda de liderança · `10` pedido de atualização/rollback · `0` nunca como serviço. Antes de **todo** `exit ≠ 0` decidido pelo exe: gravar `pedido.json` **síncrono, sem rede**.
- Donos dos arquivos (spec §4): `updates\pedido.json` só o exe escreve; `updates\lancador.json` só o lançador escreve. Toda escrita `.tmp` + rename.
- Só o **líder** escreve `workspaces/{ws}/integracoes/wader`. O campo `lider` do doc é escrito **apenas** pelas transações de `adapters/lider.ts`; o batimento nunca manda a chave `lider`.
- Conta do serviço `NT AUTHORITY\NetworkService`. Em `icacls` usar **SIDs** (`*S-1-5-20` NetworkService, `*S-1-5-32-544` Administrators, `*S-1-5-18` SYSTEM) — o Windows pt-BR traduz os nomes ("AUTORIDADE NT\SERVIÇO DE REDE").
- Servidor continua só em `127.0.0.1:8043`. Botões `/api/admin/*` exigem `X-Wader-Pin` (comparação em tempo constante, 5 erros = 15 min) e recusam `Origin` ≠ `http://127.0.0.1:8043` / `http://localhost:8043`.
- Pacote de atualização = **só `wader.exe`** + `wader.exe.sha256`. Lançador, aviso, WinSW e xml só trocam pelo `Wader-Setup`.
- Nada acontece sem clique; a única ação automática é o lançador voltar pra `.prev` após 3 quedas (< 5 min cada).
- `apps/wader/package.json` → `version: "1.0.0"`, `engines.node: ">=24"`. Tag `wader-v1.0.0` tem que bater com o `version`.
- Dual Claude: commit após cada tarefa; **push na master pede ok do Sergio**. Decisões novas em `docs/decisoes/`.
- Dados reais de paciente nunca vão em prompt pra Perplexity/Gemini sem perguntar ao Sergio.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/wader/package.json` | versão 1.0.0, `build` copia páginas, `pkg` gera o exe, campo `pkg.assets` |
| `apps/wader/src/logger.ts` | não tentar `pino-pretty` dentro do pkg |
| `apps/wader/src/lib/saida.ts` | **novo** — tipos de `pedido.json`/`lancador.json`, `gravarPedido`, `lerLancador`, `sairCom`, `CODIGO` |
| `apps/wader/src/lib/estado.ts` | **novo** — `EstadoWader`: o que `/health`, batimento e aviso leem (versão, versão disponível, líder, lançador) |
| `apps/wader/src/lib/vigia.ts` | **novo** — timer que mata o processo se o tick parou |
| `apps/wader/src/adapters/lider.ts` | **novo** — cadeado de líder (transação Firestore), aquisição/renovação |
| `apps/wader/src/lib/release.ts` | **novo** — `releases/latest` do GitHub, detecção de versão nova, download do exe |
| `apps/wader/src/lib/pin.ts` | **novo** — `GuardaPin` (tempo constante + bloqueio) e `origemPermitida` |
| `apps/wader/src/lib/aviso.ts` | **novo** — `calcularAviso`: a regra do toast, pura |
| `apps/wader/src/ui/health.ts` | **novo** — `montarHealth` (contrato `schema: 1`) |
| `apps/wader/src/ui/api/atualizacao.ts` | **novo** — `POST /api/admin/atualizar` e `/voltar` |
| `apps/wader/src/ui/server.ts` | `/health` novo, rotas admin, guarda de "não-líder" nos botões Iniciar |
| `apps/wader/src/ui/api/dicom.ts`, `worklist.ts` | 409 em `worker/start` quando não-líder |
| `apps/wader/src/ui/pages/admin.html` | cartão "Atualização" (versão, botão Atualizar, botão Voltar, PIN) |
| `apps/wader/src/adapters/heartbeat.ts` | `agentId`, campos novos, sem `conflito`, sem leitura prévia |
| `apps/wader/src/workers/dicom-ingest-worker.ts` | `ultimoTickOkEm` (finally) e `ultimoOrthancOkEm` |
| `apps/wader/src/config/types.ts`, `load.ts` | `adminPin?: string` (6 dígitos) |
| `apps/wader/src/index.ts` | códigos de saída, estado, líder decide ligar workers, vigia, checagem de release |
| `apps/wader/installer/wader-launch.ps1` | **novo** — lançador (spec §4) |
| `apps/wader/installer/wader-aviso.ps1` | **novo** — toast (spec §9) |
| `apps/wader/installer/registrar-aviso.ps1` | **novo** — cria/remove a tarefa agendada do aviso |
| `apps/wader/installer/wader-service.xml` | **novo** — WinSW (spec §3) |
| `apps/wader/installer/wader.iss` | **novo** — Inno Setup (spec §10) |
| `apps/wader/installer/tests/*.Tests.ps1`, `health-exemplo.json` | **novo** — Pester + fixture do contrato do `/health` |
| `apps/wader/scripts/migrar-medcardio.ps1` | **novo** — visita: mata `tsx`, copia config/sa/cursor, reescreve caminho |
| `apps/wader/scripts/update-wader.ps1` | **apagado** |
| `.github/workflows/wader-release.yml` | **novo** — primeiro CI do repo |
| `src/lib/integracoes.ts`, `src/app/(plataforma)/integracoes/page.tsx` (LEO) | `lider` no tipo, cartão mostra o líder em vez de `conflito` |

**Decisão de plano D1 (pra tríade e pro Sergio):** com um escritor só no doc, o LEO **não** consegue mais ver "2 Waders ativos" (o não-líder não bate). O cartão passa a mostrar `Líder: {lider.maquina}`; a detecção do segundo Wader fica local (aviso "Outro Wader ativo em …") até a fase C. É a leitura literal da spec §7 ("conflito deixa de existir").

**Ambiente de ensaio (notebook):** Orthanc local de 09/05 (`http://localhost:8042`, credenciais em `apps/wader/scripts/setup-dev.ts`), workspace `wader-dev`, `wader.config.local.json` já existente em `apps/wader/`. Windows 11 Home não tem Windows Sandbox: "máquina sem Node" = sessão PowerShell com `node` fora do `Path` (Task 1, Step 7).

---

### Task 1: Prova de conceito do `wader.exe` (decide pkg × SEA)

**Files:**
- Modify: `apps/wader/package.json`
- Modify: `apps/wader/src/logger.ts:9`
- Modify: `apps/wader/.gitignore`
- Modify: `docs/decisoes/2026-10-11-wader-fase-a-decisao.md` (seção "PoC")

**Interfaces:**
- Produces: `npm run build` → `dist/` com `dist/ui/pages/*`; `npm run pkg` → `apps/wader/build/wader.exe` (alvo `node24-win-x64`). `GET /version` devolve `{"version":"1.0.0"}` de dentro do exe. Tarefas 2–8 assumem que **o exe roda sem Node instalado**.

- [ ] **Step 1: Instalar o empacotador e subir a versão**

```bash
cd apps/wader && npm i -D @yao-pkg/pkg@6.23.0
```

Editar `apps/wader/package.json` (campos `version`, `scripts`, `engines`, `pkg`):

```json
{
  "name": "@souleo/wader",
  "version": "1.0.0",
  "private": true,
  "description": "Wader — agente local DICOM do LEO",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc && node -e \"require('node:fs').cpSync('src/ui/pages','dist/ui/pages',{recursive:true})\"",
    "pkg": "pkg . --targets node24-win-x64 --output build/wader.exe",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "reprocessar-legado": "tsx scripts/reprocessar-legado.ts"
  },
  "pkg": {
    "assets": ["dist/ui/pages/**/*", "package.json"]
  },
  "engines": {
    "node": ">=24"
  }
}
```

(manter `dependencies`/`devDependencies` como estão, mais o `@yao-pkg/pkg` que o `npm i` adicionou).

Em `apps/wader/.gitignore` acrescentar a linha `build/`.

- [ ] **Step 2: Logger não pode tentar `pino-pretty` dentro do exe (achado Ruflo 1)**

`apps/wader/src/logger.ts:9` — trocar:

```ts
const isDev = process.env.NODE_ENV !== 'production';
```

por:

```ts
// Dentro do pkg (`process.pkg` existe) nunca há pino-pretty (worker thread fora
// do snapshot) — cair pra JSON mesmo sem NODE_ENV. O xml do serviço também
// seta NODE_ENV=production; aqui é o cinto, lá o suspensório.
const isDev = process.env.NODE_ENV !== 'production' && !('pkg' in process);
```

- [ ] **Step 3: Build + páginas copiadas**

```bash
cd apps/wader && npm run build && ls dist/ui/pages
```

Expected: `admin.html conferencia.html reception.html wader-ui.js wader.css wizard.html`.

- [ ] **Step 4: Empacotar**

```bash
cd apps/wader && npm run pkg 2>&1 | tail -30
```

Expected: `build/wader.exe` (~90–120 MB). Avisos `Warning Cannot resolve 'xxx'` do pkg são **anotados** (lista completa vai pro ADR) — só importam se o Step 7 falhar.

- [ ] **Step 5: Pasta de dados de ensaio (fora do repo)**

PowerShell:

```powershell
$d = "$env:LOCALAPPDATA\wader-poc"; New-Item -ItemType Directory -Force $d | Out-Null
Copy-Item C:\Users\sergi\Desktop\souleo\apps\wader\wader.config.local.json "$d\wader.config.json"
# sa.json: o caminho que está em firebase.serviceAccountPath do config local; copiar e apontar:
$cfg = Get-Content "$d\wader.config.json" -Raw | ConvertFrom-Json
Copy-Item $cfg.firebase.serviceAccountPath "$d\sa.json"
$cfg.firebase.serviceAccountPath = "$d\sa.json"
$cfg | ConvertTo-Json -Depth 5 | Set-Content "$d\wader.config.json" -Encoding UTF8
```

- [ ] **Step 6: Rodar o exe "sem Node"**

Em **outra** janela PowerShell (não a do repo):

```powershell
$env:Path = (($env:Path -split ';') | Where-Object { $_ -notmatch 'nodejs|npm|nvm' }) -join ';'
where.exe node   # Expected: INFO: Could not find files for the given pattern(s).
$env:NODE_ENV = 'production'
Set-Location "$env:LOCALAPPDATA\wader-poc"
& C:\Users\sergi\Desktop\souleo\apps\wader\build\wader.exe
```

Expected no log (JSON, uma linha por evento): `Configuração carregada`, `Firebase inicializado`, `UI server iniciado em http://localhost:8043`, `DICOM ingest worker iniciado`.

- [ ] **Step 7: Verificar as 4 provas da spec §13**

Na janela do repo:

```bash
curl -s http://127.0.0.1:8043/version
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8043/conferencia
curl -s http://127.0.0.1:8043/api/dicom/worker
```

Expected: `{"version":"1.0.0"}` · `200` · JSON com `running: true` e `lastError: null` (Orthanc local no ar). Depois mandar 1 estudo pro Orthanc local (mesmo comando `storescu` do setup de 09/05) e, após ~70 s (StableAge), `curl -s http://127.0.0.1:8043/api/dicom/worker` mostra `execCount` subindo e `ultimosResultados` com 1 entrada (`matched` pode ser `false` se o estudo não tem exame no `wader-dev` — o que se prova é que o exe lê o Orthanc e escreve no Firestore sem explodir).

Se `/version` devolver `0.0.0`: o `package.json` não entrou no snapshot — mudar `lerVersaoPackage` em `index.ts:50` pra ler **também** `join(__dirname, 'versao.json')` e acrescentar ao `build`: `node -e "require('node:fs').writeFileSync('dist/versao.json', JSON.stringify({version: require('./package.json').version}))"` (achado Ruflo 6). Registrar no ADR.

- [ ] **Step 8: Se o pkg falhou (firebase-admin/grpc) → plano B Node SEA, antes de qualquer outra tarefa**

Só se o Step 6/7 falhar com erro de módulo não resolvido:

```bash
cd apps/wader && npm i -D esbuild postject
npx esbuild dist/index.js --bundle --platform=node --format=cjs --outfile=build/wader.cjs
```

`apps/wader/sea-config.json`:

```json
{ "main": "build/wader.cjs", "output": "build/sea.blob", "disableExperimentalSEAWarning": true }
```

```powershell
node --experimental-sea-config sea-config.json
Copy-Item (Get-Command node).Source build\wader.exe
npx postject build\wader.exe NODE_SEA_BLOB build\sea.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
```

No SEA não existe snapshot de arquivos: `server.ts` precisa servir as páginas a partir de uma pasta ao lado do exe (`path.join(path.dirname(process.execPath), 'pages')`) em vez de `__dirname/pages`, e o instalador copia `dist/ui/pages` pra `Program Files\Wader\pages`. Essa mudança (2 linhas em `server.ts:19` e `:56`) e o script `pkg` trocado pelos 3 comandos acima entram neste mesmo commit. Repetir Steps 6–7.

- [ ] **Step 9: Registrar o resultado e commitar**

No ADR `docs/decisoes/2026-10-11-wader-fase-a-decisao.md`, acrescentar ao fim:

```markdown
## PoC do executável (Task 1 do plano) — DD/MM

- Empacotador: `@yao-pkg/pkg` 6.23.0 (alvo node24-win-x64) **ou** Node SEA (dizer qual e por quê).
- Tamanho do exe: X MB. Avisos do pkg: (lista).
- Provas: /version = 1.0.0 (sim/não — e se precisou de versao.json), /conferencia 200, Firebase autenticou, 1 estudo lido do Orthanc local.
```

```bash
git add apps/wader/package.json apps/wader/package-lock.json apps/wader/src/logger.ts apps/wader/.gitignore docs/decisoes/2026-10-11-wader-fase-a-decisao.md
git commit -m "feat(wader): PoC wader.exe — pkg node24-win-x64, build copia paginas, logger sem pino-pretty no exe"
```

---

### Task 2: Lançador + `pedido.json`/`lancador.json` + códigos de saída + Pester

**Files:**
- Create: `apps/wader/src/lib/saida.ts`, `apps/wader/src/lib/saida.test.ts`
- Create: `apps/wader/installer/wader-launch.ps1`, `apps/wader/installer/tests/wader-launch.Tests.ps1`
- Modify: `apps/wader/src/index.ts:62-79, 142, 199-202`
- Modify: `apps/wader/vitest.config.ts` (nada) — Pester roda fora do vitest

**Interfaces:**
- Produces (TS): `CODIGO = { CONFIG: 2, VIGIA: 3, ATUALIZACAO: 10 }`; `type Motivo = 'travado'|'lider'|'atualizacao'|'rollback'|'config'`; `interface Pedido { atualizar?: string; voltar?: true; motivo: Motivo; em: string }`; `interface Lancador { quedasSeguidas: number; versaoRejeitada?: string; versaoAplicada?: string; erro?: string; ultimaSaida?: { motivo: string; em: string } }`; `dirUpdates(cwd?)`, `gravarPedido(pedido, dir?)`, `lerLancador(dir?)`, `sairCom(codigo, pedido, dir?): never`.
- Produces (PS1): `wader-launch.ps1 [-ProgramDir] [-DataDir] [-ExeNome]` — sai com o código do exe. `lancador.json` ganha `versaoAplicada` (dono: lançador) pra saber qual versão rejeitar no rollback.

- [ ] **Step 1: Teste do módulo de saída**

`apps/wader/src/lib/saida.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { gravarPedido, lerLancador, CODIGO } from './saida';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wader-saida-'));
}

describe('saida', () => {
  it('gravarPedido escreve pedido.json sem deixar .tmp e cria a pasta', () => {
    const dir = path.join(tmp(), 'updates');
    gravarPedido({ atualizar: '1.2.0', motivo: 'atualizacao', em: '2026-10-11T00:00:00.000Z' }, dir);
    expect(fs.readdirSync(dir)).toEqual(['pedido.json']);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'pedido.json'), 'utf-8'))).toEqual({
      atualizar: '1.2.0', motivo: 'atualizacao', em: '2026-10-11T00:00:00.000Z',
    });
  });

  it('lerLancador devolve null sem arquivo ou com JSON quebrado', () => {
    const dir = tmp();
    expect(lerLancador(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'lancador.json'), '{nope');
    expect(lerLancador(dir)).toBeNull();
  });

  it('lerLancador lê o que o lançador gravou', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'lancador.json'), JSON.stringify({ quedasSeguidas: 2, erro: 'sha' }));
    expect(lerLancador(dir)).toEqual({ quedasSeguidas: 2, erro: 'sha' });
  });

  it('códigos de saída da spec §3', () => {
    expect(CODIGO).toEqual({ CONFIG: 2, VIGIA: 3, ATUALIZACAO: 10 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/wader && npx vitest run src/lib/saida.test.ts
```

Expected: FAIL — `Cannot find module './saida'`.

- [ ] **Step 3: Implementar `saida.ts`**

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Saída do processo e a troca de bilhetes com o lançador (spec §3-§4).
 *
 * Dois arquivos, um dono cada:
 *   updates/pedido.json   — SÓ o exe escreve; o lançador lê e apaga.
 *   updates/lancador.json — SÓ o lançador escreve; o exe lê na subida.
 * Toda escrita é .tmp + rename (atômica no NTFS). Nada aqui toca a rede:
 * é o último ato antes de um process.exit.
 */
export const CODIGO = { CONFIG: 2, VIGIA: 3, ATUALIZACAO: 10 } as const;

export type Motivo = 'travado' | 'lider' | 'atualizacao' | 'rollback' | 'config';

export interface Pedido {
  atualizar?: string;
  voltar?: true;
  motivo: Motivo;
  em: string;
}

export interface Lancador {
  quedasSeguidas: number;
  versaoRejeitada?: string;
  versaoAplicada?: string;
  erro?: string;
  ultimaSaida?: { motivo: string; em: string };
}

export function dirUpdates(cwd: string = process.cwd()): string {
  return path.join(cwd, 'updates');
}

export function gravarPedido(pedido: Pedido, dir: string = dirUpdates()): void {
  fs.mkdirSync(dir, { recursive: true });
  const alvo = path.join(dir, 'pedido.json');
  fs.writeFileSync(alvo + '.tmp', JSON.stringify(pedido));
  fs.renameSync(alvo + '.tmp', alvo);
}

export function lerLancador(dir: string = dirUpdates()): Lancador | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'lancador.json'), 'utf-8')) as Lancador;
  } catch {
    return null;
  }
}

/** Grava o pedido (síncrono) e sai. Falha na gravação não impede a saída. */
export function sairCom(codigo: number, pedido: Omit<Pedido, 'em'>, dir?: string): never {
  try {
    gravarPedido({ ...pedido, em: new Date().toISOString() }, dir);
  } catch {
    // disco cheio / sem permissão: sair mesmo assim — o WinSW reinicia.
  }
  process.exit(codigo);
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/wader && npx vitest run src/lib/saida.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: `index.ts` passa a usar os códigos e a ler `lancador.json`**

`apps/wader/src/index.ts` — trocar os dois `process.exit(1)` do bloco de config/Firebase (linhas 62–79) e o do `main().catch` (199–202):

```ts
import { CODIGO, sairCom, lerLancador } from './lib/saida';
```

```ts
  let config;
  try {
    config = loadConfig();
    log.info({ wsId: config.wsId, agentId: config.agentId }, 'Configuração carregada');
  } catch (err) {
    if (err instanceof ConfigError) {
      log.fatal(err.message);
      sairCom(CODIGO.CONFIG, { motivo: 'config' });
    }
    throw err;
  }

  try {
    initFirebase(config.firebase);
  } catch (err) {
    log.fatal({ err }, 'Falha ao inicializar Firebase');
    sairCom(CODIGO.CONFIG, { motivo: 'config' });
  }

  // O que o lançador deixou pra nós (spec §5): publicado no /health e no
  // batimento pelas tarefas seguintes. Não apagar — o arquivo é do lançador.
  const lancador = lerLancador();
  if (lancador) log.info({ lancador }, 'lancador.json lido na subida');
```

E no fim do arquivo:

```ts
main().catch((err) => {
  // Porta ocupada = outro Wader nesta máquina (spec §12): código 2, mensagem clara.
  if ((err as NodeJS.ErrnoException)?.code === 'EADDRINUSE') {
    logger.fatal({ err }, 'Porta ocupada — já existe um Wader rodando nesta máquina?');
    sairCom(CODIGO.CONFIG, { motivo: 'config' });
  }
  logger.fatal({ err }, 'Erro fatal no startup do Wader');
  process.exit(1);
});
```

(`lancador` fica sem uso até a Task 5 — pra não quebrar `noUnusedLocals`, por ora passe-o adiante: `startUiServer(config, { ..., versao: lerVersaoPackage(), lancador })` e em `UiServerExtras` acrescente `lancador?: Lancador | null;` importando o tipo de `../lib/saida`. A Task 5 substitui isso por `estado`.)

```bash
cd apps/wader && npm run typecheck && npm test
```

Expected: typecheck limpo; 124 passed (120 + 4).

- [ ] **Step 6: Teste Pester do lançador (os 3 casos da spec §13)**

`apps/wader/installer/tests/wader-launch.Tests.ps1` (ASCII puro):

```powershell
# Pester 5. Roda o lancador numa pasta temporaria com um stub .cmd no lugar do exe.
BeforeAll {
  $script:Launch = Join-Path $PSScriptRoot '..\wader-launch.ps1'
  function New-Ambiente {
    $raiz = Join-Path ([IO.Path]::GetTempPath()) ('wader-launch-' + [guid]::NewGuid().ToString('N'))
    $prog = Join-Path $raiz 'prog'; $dados = Join-Path $raiz 'dados'
    New-Item -ItemType Directory -Force $prog, $dados, (Join-Path $dados 'updates') | Out-Null
    @{ Prog = $prog; Dados = $dados; Upd = (Join-Path $dados 'updates') }
  }
  function New-Stub($Caminho, [int]$Codigo, [string]$Marca) {
    # .cmd que imprime a marca e sai com o codigo: e o "exe" do teste
    Set-Content -Path $Caminho -Value "@echo off`r`necho $Marca`r`nexit /b $Codigo" -Encoding ASCII
  }
  function Sha($p) { (Get-FileHash -Path $p -Algorithm SHA256).Hash.ToLower() }
  function Rodar($a) {
    & $script:Launch -ProgramDir $a.Prog -DataDir $a.Dados -ExeNome 'stub.cmd' 2>&1
    $global:CodigoSaida = $LASTEXITCODE
  }
  function Lanc($a) { Get-Content (Join-Path $a.Upd 'lancador.json') -Raw | ConvertFrom-Json }
}

Describe 'wader-launch.ps1' {
  It 'aplica atualizar quando o SHA bate, guarda .prev e versaoAplicada, apaga pedido.json' {
    $a = New-Ambiente
    New-Stub (Join-Path $a.Prog 'stub.cmd') 0 'VELHO'
    $novo = Join-Path $a.Upd 'wader-v1.0.1.exe'
    New-Stub $novo 0 'NOVO'
    Set-Content "$novo.sha256" -Value ((Sha $novo) + '  wader.exe') -Encoding ASCII
    Set-Content (Join-Path $a.Upd 'pedido.json') -Value '{"atualizar":"1.0.1","motivo":"atualizacao","em":"2026-10-11T00:00:00Z"}' -Encoding ASCII
    $saida = Rodar $a
    ($saida -join "`n") | Should -Match 'NOVO'
    Get-Content (Join-Path $a.Prog 'stub.cmd.prev') -Raw | Should -Match 'VELHO'
    Test-Path (Join-Path $a.Upd 'pedido.json') | Should -BeFalse
    $l = Lanc $a
    $l.versaoAplicada | Should -Be '1.0.1'
    $l.ultimaSaida.motivo | Should -Be 'atualizacao'
    $l.erro | Should -BeNullOrEmpty
  }

  It 'recusa SHA errado: mantem a versao, grava erro=sha' {
    $a = New-Ambiente
    New-Stub (Join-Path $a.Prog 'stub.cmd') 0 'VELHO'
    $novo = Join-Path $a.Upd 'wader-v1.0.1.exe'
    New-Stub $novo 0 'NOVO'
    Set-Content "$novo.sha256" -Value ('0' * 64) -Encoding ASCII
    Set-Content (Join-Path $a.Upd 'pedido.json') -Value '{"atualizar":"1.0.1","motivo":"atualizacao","em":"x"}' -Encoding ASCII
    $saida = Rodar $a
    ($saida -join "`n") | Should -Match 'VELHO'
    (Lanc $a).erro | Should -Be 'sha'
    Test-Path (Join-Path $a.Prog 'stub.cmd.prev') | Should -BeFalse
  }

  It 'volta pra .prev por pedido voltar e por 3 quedas seguidas (versaoRejeitada = versaoAplicada)' {
    # por pedido
    $a = New-Ambiente
    New-Stub (Join-Path $a.Prog 'stub.cmd') 0 'ATUAL'
    New-Stub (Join-Path $a.Prog 'stub.cmd.prev') 0 'ANTERIOR'
    Set-Content (Join-Path $a.Upd 'lancador.json') -Value '{"quedasSeguidas":0,"versaoAplicada":"1.0.1"}' -Encoding ASCII
    Set-Content (Join-Path $a.Upd 'pedido.json') -Value '{"voltar":true,"motivo":"rollback","em":"x"}' -Encoding ASCII
    ((Rodar $a) -join "`n") | Should -Match 'ANTERIOR'
    (Lanc $a).versaoRejeitada | Should -Be '1.0.1'
    # por quedas
    $b = New-Ambiente
    New-Stub (Join-Path $b.Prog 'stub.cmd') 0 'ATUAL'
    New-Stub (Join-Path $b.Prog 'stub.cmd.prev') 0 'ANTERIOR'
    Set-Content (Join-Path $b.Upd 'lancador.json') -Value '{"quedasSeguidas":3,"versaoAplicada":"1.0.1"}' -Encoding ASCII
    ((Rodar $b) -join "`n") | Should -Match 'ANTERIOR'
    (Lanc $b).versaoRejeitada | Should -Be '1.0.1'
    (Lanc $b).quedasSeguidas | Should -Be 1   # o stub saiu em < 5 min: conta como queda
  }

  It 'conta quedas (< 5 min) e sai com o codigo do exe; saida 10 nao conta como queda' {
    $a = New-Ambiente
    New-Stub (Join-Path $a.Prog 'stub.cmd') 7 'CAIU'
    Rodar $a | Out-Null
    $global:CodigoSaida | Should -Be 7
    (Lanc $a).quedasSeguidas | Should -Be 1
    Rodar $a | Out-Null
    (Lanc $a).quedasSeguidas | Should -Be 2
    New-Stub (Join-Path $a.Prog 'stub.cmd') 10 'ATUALIZANDO'
    Rodar $a | Out-Null
    $global:CodigoSaida | Should -Be 10
    (Lanc $a).quedasSeguidas | Should -Be 0
  }
}
```

- [ ] **Step 7: Rodar Pester e ver falhar**

```powershell
powershell -NoProfile -Command "Invoke-Pester -Path apps/wader/installer/tests -Output Detailed"
```

Expected: 4 falhas — `wader-launch.ps1` não existe. (Se `Invoke-Pester` não existir no 5.1 desta máquina: `Install-Module Pester -Scope CurrentUser -Force -SkipPublisherCheck` uma vez.)

- [ ] **Step 8: Escrever o lançador**

`apps/wader/installer/wader-launch.ps1` (ASCII puro):

```powershell
# ====================================================================
# wader-launch.ps1 -- lancador do servico Wader (spec Fase A, secao 4)
# ====================================================================
# Roda a cada inicio do servico, ANTES do wader.exe. E quem troca arquivos,
# porque nesse momento o exe NAO esta em execucao.
#   pedido.json   -- so o exe escreve; aqui lemos e apagamos.
#   lancador.json -- so este script escreve; o exe le na subida.
# Ordem: voltar (pedido ou 3 quedas) > atualizar (SHA confere) > rodar o exe.
# ASCII PURO de proposito (PowerShell 5.1 sem BOM = ANSI).
# ====================================================================
param(
  [string]$ProgramDir = 'C:\Program Files\Wader',
  [string]$DataDir    = 'C:\ProgramData\Wader',
  [string]$ExeNome    = 'wader.exe'
)
$ErrorActionPreference = 'Stop'

$exe  = Join-Path $ProgramDir $ExeNome
$prev = "$exe.prev"
$upd  = Join-Path $DataDir 'updates'
New-Item -ItemType Directory -Force -Path $upd | Out-Null
$pedidoPath = Join-Path $upd 'pedido.json'
$lancPath   = Join-Path $upd 'lancador.json'

function Ler-Json($p) {
  if (-not (Test-Path $p)) { return $null }
  try { Get-Content $p -Raw | ConvertFrom-Json } catch { $null }
}
function Gravar-Json($p, $obj) {
  $tmp = "$p.tmp"
  ($obj | ConvertTo-Json -Compress -Depth 4) | Set-Content -Path $tmp -Encoding ASCII
  Move-Item -Force $tmp $p
}
function Sha256($p) { (Get-FileHash -Path $p -Algorithm SHA256).Hash.ToLower() }

# 1. le os dois bilhetes
$pedido = Ler-Json $pedidoPath
$lanc = @{ quedasSeguidas = 0 }
$lido = Ler-Json $lancPath
if ($lido) { $lido.PSObject.Properties | ForEach-Object { $lanc[$_.Name] = $_.Value } }
if (-not $lanc.quedasSeguidas) { $lanc.quedasSeguidas = 0 }
$lanc.Remove('erro')

# 2. voltar: pedido explicito ou 3 quedas seguidas, e existe .prev
$querVoltar = ($pedido -and $pedido.voltar) -or ([int]$lanc.quedasSeguidas -ge 3)
if ($querVoltar -and (Test-Path $prev)) {
  Copy-Item -Force $prev $exe
  if ($lanc.versaoAplicada) { $lanc.versaoRejeitada = $lanc.versaoAplicada; $lanc.Remove('versaoAplicada') }
  $lanc.quedasSeguidas = 0
  Write-Host "lancador: voltou para a versao anterior"
}
# 3. senao, atualizar: binario baixado + SHA-256 conferido (unica conferencia de SHA)
elseif ($pedido -and $pedido.atualizar) {
  $v = [string]$pedido.atualizar
  $novo = Join-Path $upd "wader-v$v.exe"
  $shaPath = "$novo.sha256"
  $ok = (Test-Path $novo) -and (Test-Path $shaPath) -and
        ((Get-Content $shaPath -Raw) -match '^\s*([0-9a-fA-F]{64})') -and
        ($Matches[1].ToLower() -eq (Sha256 $novo))
  if ($ok) {
    Copy-Item -Force $exe $prev
    Copy-Item -Force $novo $exe
    $lanc.versaoAplicada = $v
    $lanc.Remove('versaoRejeitada')
    $lanc.quedasSeguidas = 0
    Write-Host "lancador: aplicou v$v"
  } else {
    $lanc.erro = 'sha'
    Write-Host "lancador: v$v recusada (arquivo ausente ou SHA diferente)"
  }
}

# 4. ultimaSaida vem do pedido; pedido atendido some
if ($pedido) {
  if ($pedido.motivo) { $lanc.ultimaSaida = @{ motivo = [string]$pedido.motivo; em = [string]$pedido.em } }
  Remove-Item -Force $pedidoPath
}
Gravar-Json $lancPath $lanc

# 5. roda o exe e espera (stdout/stderr herdados -> log do WinSW)
$inicio = Get-Date
& $exe
$codigo = $LASTEXITCODE
if ($null -eq $codigo) { $codigo = 1 }
$viveuSeg = ((Get-Date) - $inicio).TotalSeconds
if ($codigo -eq 10) { $lanc.quedasSeguidas = 0 }          # saida planejada nao e queda
elseif ($viveuSeg -lt 300) { $lanc.quedasSeguidas = [int]$lanc.quedasSeguidas + 1 }
else { $lanc.quedasSeguidas = 0 }
Gravar-Json $lancPath $lanc
Write-Host "lancador: exe saiu com $codigo apos $([int]$viveuSeg)s (quedasSeguidas=$($lanc.quedasSeguidas))"
exit $codigo
```

- [ ] **Step 9: Rodar Pester e ver passar**

```powershell
powershell -NoProfile -Command "Invoke-Pester -Path apps/wader/installer/tests -Output Detailed"
```

Expected: `Tests Passed: 4, Failed: 0`.

- [ ] **Step 10: Commit**

```bash
git add apps/wader/src/lib/saida.ts apps/wader/src/lib/saida.test.ts apps/wader/src/index.ts apps/wader/src/ui/server.ts apps/wader/installer/wader-launch.ps1 apps/wader/installer/tests/wader-launch.Tests.ps1
git commit -m "feat(wader): lancador wader-launch.ps1 + pedido/lancador.json + codigos de saida 2/3/10 (Pester 4/4)"
```

---

### Task 3: Vigia (`ultimoTickOkEm` + timer)

**Files:**
- Modify: `apps/wader/src/workers/dicom-ingest-worker.ts:44-48, 80-93, 106-109, 120-122, 335-337`
- Modify: `apps/wader/src/workers/dicom-ingest-worker.test.ts` (2 testes novos no fim)
- Create: `apps/wader/src/lib/vigia.ts`, `apps/wader/src/lib/vigia.test.ts`
- Modify: `apps/wader/src/index.ts` (liga o vigia logo após `dicomWorker.start()`)

**Interfaces:**
- Consumes: `CODIGO.VIGIA`, `sairCom` (Task 2).
- Produces: `DicomIngestWorker.getUltimoTickOkEm(): Date | null` (gravado no `finally` do tick — fim do tick, com ou sem erro) e `getUltimoOrthancOkEm(): Date | null` (última vez que `/changes` respondeu; a Task 5 usa pro aviso "sem Orthanc"). `iniciarVigia(opts): () => void` com `opts = { ultimoTickOkEm: () => Date | null; ligado: () => boolean; aoTravar: () => void; limiteMs?: number (120_000); intervaloMs?: number (30_000); agora?: () => number }`.

- [ ] **Step 1: Teste do worker — os dois campos novos**

Acrescentar ao fim de `apps/wader/src/workers/dicom-ingest-worker.test.ts` (dentro do `describe` existente ou um novo):

```ts
describe('vigia: carimbos do tick', () => {
  it('ultimoTickOkEm é gravado no finally — mesmo quando /changes falha; ultimoOrthancOkEm só quando responde', async () => {
    const w = makeWorker('carimbos');
    expect(w.getUltimoTickOkEm()).toBeNull();
    expect(w.getUltimoOrthancOkEm()).toBeNull();

    // 1º tick: Orthanc fora
    (w as any).opts.client.changes = async () => { throw new Error('ECONNREFUSED'); };
    await (w as any).tick();
    expect(w.getUltimoTickOkEm()).toBeInstanceOf(Date);
    expect(w.getUltimoOrthancOkEm()).toBeNull();

    // 2º tick: Orthanc de volta
    (w as any).opts.client.changes = async () => ({ Changes: [], Done: true, Last: 0 });
    await (w as any).tick();
    expect(w.getUltimoOrthancOkEm()).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/wader && npx vitest run src/workers/dicom-ingest-worker.test.ts -t carimbos
```

Expected: FAIL — `w.getUltimoTickOkEm is not a function`.

- [ ] **Step 3: Implementar no worker (2 campos, 2 getters, 2 linhas no tick)**

`apps/wader/src/workers/dicom-ingest-worker.ts`:

Após a linha 44 (`private lastTickAt`):

```ts
  // Vigia (spec §6): FIM do tick, com ou sem erro — gravado no finally.
  // NÃO reusar lastTickAt: ele marca o INÍCIO e esconderia a trava (Ruflo 7).
  private ultimoTickOkEm: Date | null = null;
  // Aviso "sem Orthanc" (spec §9): última resposta do /changes.
  private ultimoOrthancOkEm: Date | null = null;
```

Após `getUltimoErro()` (linha 109):

```ts
  getUltimoTickOkEm(): Date | null {
    return this.ultimoTickOkEm;
  }

  getUltimoOrthancOkEm(): Date | null {
    return this.ultimoOrthancOkEm;
  }
```

Logo após `const changes = await this.opts.client.changes(desde, 100);` (linha 122):

```ts
      this.ultimoOrthancOkEm = new Date();
```

No `finally` (linha 335–337):

```ts
    } finally {
      this.tickEmAndamento = false;
      this.ultimoTickOkEm = new Date();
    }
```

```bash
cd apps/wader && npx vitest run src/workers/dicom-ingest-worker.test.ts
```

Expected: todos passam (os anteriores + 1).

- [ ] **Step 4: Teste do vigia (relógio falso)**

`apps/wader/src/lib/vigia.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { iniciarVigia } from './vigia';

describe('iniciarVigia', () => {
  afterEach(() => vi.useRealTimers());

  it('tick recente → não dispara', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    let ultimo = new Date();
    const parar = iniciarVigia({ ultimoTickOkEm: () => ultimo, ligado: () => true, aoTravar });
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(30_000);
      ultimo = new Date(); // tick acontecendo normalmente
    }
    expect(aoTravar).not.toHaveBeenCalled();
    parar();
  });

  it('tick parado há mais de 2 min → dispara uma vez por checagem', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    const ultimo = new Date();
    const parar = iniciarVigia({ ultimoTickOkEm: () => ultimo, ligado: () => true, aoTravar });
    vi.advanceTimersByTime(2 * 60_000);       // exatamente 2 min: ainda não (> e não ≥)
    expect(aoTravar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(aoTravar).toHaveBeenCalledTimes(1);
    parar();
  });

  it('worker nunca completou um tick: conta a partir do início do vigia', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    const parar = iniciarVigia({ ultimoTickOkEm: () => null, ligado: () => true, aoTravar });
    vi.advanceTimersByTime(2 * 60_000 + 30_000);
    expect(aoTravar).toHaveBeenCalled();
    parar();
  });

  it('worker desligado (não-líder, parado pelo admin) → nunca dispara', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    const parar = iniciarVigia({ ultimoTickOkEm: () => null, ligado: () => false, aoTravar });
    vi.advanceTimersByTime(60 * 60_000);
    expect(aoTravar).not.toHaveBeenCalled();
    parar();
  });

  it('parar() cancela o timer', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    const parar = iniciarVigia({ ultimoTickOkEm: () => null, ligado: () => true, aoTravar });
    parar();
    vi.advanceTimersByTime(60 * 60_000);
    expect(aoTravar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Rodar e ver falhar**

```bash
cd apps/wader && npx vitest run src/lib/vigia.test.ts
```

Expected: FAIL — `Cannot find module './vigia'`.

- [ ] **Step 6: Implementar `vigia.ts`**

```ts
/**
 * Vigia (spec §6): se o ciclo de ingestão não termina um tick há mais de
 * `limiteMs` enquanto o worker está ligado, chama `aoTravar` — que em
 * produção grava pedido.json {motivo:'travado'} e sai com código 3, pro
 * WinSW reiniciar. Cobre o loop preso num write de 07/10. Não cobre
 * congelamento total do processo (fase C vê pelo batimento parado).
 */
export interface VigiaOpts {
  ultimoTickOkEm: () => Date | null;
  ligado: () => boolean;
  aoTravar: () => void;
  limiteMs?: number;
  intervaloMs?: number;
  agora?: () => number;
}

export function iniciarVigia(o: VigiaOpts): () => void {
  const limite = o.limiteMs ?? 2 * 60_000;
  const intervalo = o.intervaloMs ?? 30_000;
  const agora = o.agora ?? Date.now;
  let base = agora();
  const timer = setInterval(() => {
    if (!o.ligado()) {
      base = agora(); // desligado não conta; ao religar, conta do zero
      return;
    }
    const referencia = o.ultimoTickOkEm()?.getTime() ?? base;
    if (agora() - referencia > limite) o.aoTravar();
  }, intervalo);
  return () => clearInterval(timer);
}
```

- [ ] **Step 7: Rodar e ver passar**

```bash
cd apps/wader && npx vitest run src/lib/vigia.test.ts
```

Expected: 5 passed.

- [ ] **Step 8: Ligar no `index.ts`**

Em `apps/wader/src/index.ts`, imports:

```ts
import { iniciarVigia } from './lib/vigia';
```

Logo após `dicomWorker.start();` (linha 121):

```ts
    // Vigia (spec §6): tick parado > 2 min → pedido.json {travado} + saída 3.
    const dicomVigiado = dicomWorker;
    pararVigia = iniciarVigia({
      ultimoTickOkEm: () => dicomVigiado.getUltimoTickOkEm(),
      ligado: () => dicomVigiado.isRunning(),
      aoTravar: () => {
        log.fatal({ ultimoTickOkEm: dicomVigiado.getUltimoTickOkEm() }, 'Ingestão travada — saindo pro serviço reiniciar');
        sairCom(CODIGO.VIGIA, { motivo: 'travado' });
      },
    });
```

Declarar junto dos outros (`let pararBatimento`): `let pararVigia: (() => void) | null = null;`, passar em `registerShutdownHandlers(app, { ..., pararVigia })`, acrescentar `pararVigia: (() => void) | null;` ao tipo do parâmetro e `workers.pararVigia?.();` no `shutdown` logo após `workers.pararBatimento?.();`.

```bash
cd apps/wader && npm run typecheck && npm test
```

Expected: limpo; 130 passed.

- [ ] **Step 9: Commit**

```bash
git add apps/wader/src/lib/vigia.ts apps/wader/src/lib/vigia.test.ts apps/wader/src/workers/dicom-ingest-worker.ts apps/wader/src/workers/dicom-ingest-worker.test.ts apps/wader/src/index.ts
git commit -m "feat(wader): vigia — tick parado > 2 min grava pedido {travado} e sai com 3; ultimoTickOkEm/ultimoOrthancOkEm no worker"
```

---

### Task 4: Cadeado de líder (`adapters/lider.ts`, identidade única, LEO deriva de `lider`)

**Files:**
- Create: `apps/wader/src/adapters/lider.ts`, `apps/wader/src/adapters/lider.test.ts`
- Modify: `apps/wader/src/adapters/heartbeat.ts` (remove leitura prévia + `conflito`; `agentId`)
- Modify: `apps/wader/src/adapters/heartbeat.test.ts` (remove 3 testes de `conflito`, ajusta chamadas)
- Modify: `apps/wader/src/index.ts` (líder decide ligar os workers)
- Modify: `apps/wader/src/ui/server.ts:33-41, 67-68`, `apps/wader/src/ui/api/dicom.ts:76-82`, `apps/wader/src/ui/api/worklist.ts:79-89`
- Modify (LEO): `src/lib/integracoes.ts:19-23`, `src/app/(plataforma)/integracoes/page.tsx:673-684`, `tests/unit/integracoes.test.mjs`

**Interfaces:**
- Consumes: `CODIGO.VIGIA`, `sairCom` (Task 2); `iniciarVigia` (Task 3).
- Produces: documento `workspaces/{ws}/integracoes/wader.lider = { agentId, maquina, ate (ms epoch), geracao }`. `tentarAdquirir(db, wsId, eu, agoraMs)`, `renovar(db, wsId, eu, geracao, agoraMs)`, `iniciarLider(opts): { parar(): void; souLider(): boolean; outraMaquina(): string | null }`. `iniciarBatimento(wsId, versao, repo, client, extras)` com `extras.agentId: string` obrigatório e `extras.campos?: () => Record<string, unknown>` (a Task 5 preenche). `UiServerExtras.souLider?: () => boolean`.

- [ ] **Step 1: Teste do cadeado (Firestore falso com transação)**

`apps/wader/src/adapters/lider.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tentarAdquirir, renovar, iniciarLider, VALIDADE_MS } from './lider';

/** Firestore de mentira: 1 doc, transação serializada (o que importa aqui é a lógica). */
function dbFalso(inicial: Record<string, unknown> = {}) {
  let doc: Record<string, unknown> = { ...inicial };
  let falhar = false;
  const ref = { path: 'workspaces/ws1/integracoes/wader' };
  const db = {
    doc: () => ref,
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      if (falhar) throw new Error('UNAVAILABLE');
      const tx = {
        get: async () => ({ data: () => doc }),
        set: (_r: unknown, data: Record<string, unknown>) => { doc = { ...doc, ...data }; },
      };
      return fn(tx);
    },
  };
  return { db, lider: () => doc.lider as { agentId: string; maquina: string; ate: number; geracao: number } | undefined, setFalhar: (v: boolean) => { falhar = v; } };
}

const EU = { agentId: 'pc-1234', maquina: 'PC' };
const OUTRO = { agentId: 'nb-9999', maquina: 'NOTEBOOK' };
const T0 = 1_000_000;

describe('tentarAdquirir', () => {
  it('sem líder → pega, geracao 1, ate = agora + 90 s', async () => {
    const f = dbFalso();
    expect(await tentarAdquirir(f.db as any, 'ws1', EU, T0)).toEqual({ ok: true, geracao: 1 });
    expect(f.lider()).toEqual({ ...EU, ate: T0 + VALIDADE_MS, geracao: 1 });
  });
  it('líder vivo de outro → não pega e diz a máquina', async () => {
    const f = dbFalso({ lider: { ...OUTRO, ate: T0 + 10_000, geracao: 4 } });
    expect(await tentarAdquirir(f.db as any, 'ws1', EU, T0)).toEqual({ ok: false, maquina: 'NOTEBOOK' });
    expect(f.lider()?.agentId).toBe('nb-9999');
  });
  it('líder expirado → pega e incrementa geracao', async () => {
    const f = dbFalso({ lider: { ...OUTRO, ate: T0 - 1, geracao: 4 } });
    expect(await tentarAdquirir(f.db as any, 'ws1', EU, T0)).toEqual({ ok: true, geracao: 5 });
  });
  it('eu mesmo (reinício rápido) → pega sem esperar expirar', async () => {
    const f = dbFalso({ lider: { ...EU, ate: T0 + 60_000, geracao: 2 } });
    expect(await tentarAdquirir(f.db as any, 'ws1', EU, T0)).toEqual({ ok: true, geracao: 3 });
  });
});

describe('renovar', () => {
  it('meu agentId e minha geracao → renova ate', async () => {
    const f = dbFalso({ lider: { ...EU, ate: T0 + 10, geracao: 2 } });
    expect(await renovar(f.db as any, 'ws1', EU, 2, T0 + 30_000)).toBe(true);
    expect(f.lider()?.ate).toBe(T0 + 30_000 + VALIDADE_MS);
  });
  it('dono trocou (ou geracao diferente) → false e não toca no doc', async () => {
    const f = dbFalso({ lider: { ...OUTRO, ate: T0 + 10, geracao: 7 } });
    expect(await renovar(f.db as any, 'ws1', EU, 2, T0)).toBe(false);
    expect(f.lider()?.agentId).toBe('nb-9999');
    const g = dbFalso({ lider: { ...EU, ate: T0 + 10, geracao: 9 } });
    expect(await renovar(g.db as any, 'ws1', EU, 2, T0)).toBe(false);
  });
});

describe('iniciarLider', () => {
  afterEach(() => vi.useRealTimers());

  it('adquire na subida → aoVirarLider; renova a cada 30 s', async () => {
    vi.useFakeTimers();
    const f = dbFalso();
    const aoVirarLider = vi.fn(); const aoPerder = vi.fn();
    const l = iniciarLider({ db: f.db as any, wsId: 'ws1', eu: EU, aoVirarLider, aoPerder });
    await vi.advanceTimersByTimeAsync(0);
    expect(aoVirarLider).toHaveBeenCalledTimes(1);
    expect(l.souLider()).toBe(true);
    const ate1 = f.lider()!.ate;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.lider()!.ate).toBeGreaterThan(ate1);
    expect(aoPerder).not.toHaveBeenCalled();
    l.parar();
  });

  it('outro líder vivo → não-líder, outraMaquina, tenta de novo a cada 1 min e pega quando expira', async () => {
    vi.useFakeTimers();
    const f = dbFalso({ lider: { ...OUTRO, ate: Date.now() + 100_000, geracao: 1 } });
    const aoVirarLider = vi.fn(); const aoPerder = vi.fn();
    const l = iniciarLider({ db: f.db as any, wsId: 'ws1', eu: EU, aoVirarLider, aoPerder });
    await vi.advanceTimersByTimeAsync(0);
    expect(l.souLider()).toBe(false);
    expect(l.outraMaquina()).toBe('NOTEBOOK');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(aoVirarLider).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000); // agora o outro expirou
    expect(aoVirarLider).toHaveBeenCalledTimes(1);
    expect(l.souLider()).toBe(true);
    l.parar();
  });

  it('renovação descobre outro dono → aoPerder("lider")', async () => {
    vi.useFakeTimers();
    const f = dbFalso();
    const aoPerder = vi.fn();
    const l = iniciarLider({ db: f.db as any, wsId: 'ws1', eu: EU, aoVirarLider: () => {}, aoPerder });
    await vi.advanceTimersByTimeAsync(0);
    // alguém sobrescreveu (não deveria, mas é o caso que a renovação protege)
    await f.db.runTransaction(async (tx: any) => tx.set(null, { lider: { ...OUTRO, ate: Date.now() + 999_999, geracao: 99 } }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(aoPerder).toHaveBeenCalledWith('lider');
    l.parar();
  });

  it('sem rede por 90 s → aoPerder("lider"); falha curta não derruba', async () => {
    vi.useFakeTimers();
    const f = dbFalso();
    const aoPerder = vi.fn();
    const l = iniciarLider({ db: f.db as any, wsId: 'ws1', eu: EU, aoVirarLider: () => {}, aoPerder });
    await vi.advanceTimersByTimeAsync(0);
    f.setFalhar(true);
    await vi.advanceTimersByTimeAsync(60_000); // 2 renovações falhas (30 s, 60 s)
    expect(aoPerder).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000); // 90 s sem renovar
    expect(aoPerder).toHaveBeenCalledWith('lider');
    l.parar();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/wader && npx vitest run src/adapters/lider.test.ts
```

Expected: FAIL — `Cannot find module './lider'`.

- [ ] **Step 3: Implementar `lider.ts`**

```ts
import { createLogger } from '../logger';

const log = createLogger({ module: 'lider' });

/**
 * Cadeado de Wader único (spec §7): `workspaces/{ws}/integracoes/wader.lider`.
 * Quem decide ligar os workers é o index.ts; os workers não sabem disso.
 *   - aquisição na subida (transação): pega se ausente, expirado ou meu;
 *   - renovação a cada 30 s (transação): só se agentId E geracao são meus;
 *   - descobriu outro dono, ou 90 s sem conseguir renovar → aoPerder('lider')
 *     (em produção: pedido.json {lider} + exit 3 — o cursor persistido do
 *     ADR 2026-05-18 torna o reinício seguro).
 * `ate` é ms epoch (número): simples dos dois lados.
 */
export const VALIDADE_MS = 90_000;

export interface Eu { agentId: string; maquina: string }
export interface DocLider { agentId: string; maquina: string; ate: number; geracao: number }

/** Só o que precisamos do Firestore Admin — facilita o fake no teste. */
export interface DbTx {
  doc(path: string): unknown;
  runTransaction<T>(fn: (tx: {
    get(ref: unknown): Promise<{ data(): Record<string, unknown> | undefined }>;
    set(ref: unknown, data: Record<string, unknown>, opts?: { merge: boolean }): void;
  }) => Promise<T>): Promise<T>;
}

const caminho = (wsId: string) => `workspaces/${wsId}/integracoes/wader`;

export async function tentarAdquirir(
  db: DbTx, wsId: string, eu: Eu, agoraMs: number,
): Promise<{ ok: true; geracao: number } | { ok: false; maquina: string }> {
  const ref = db.doc(caminho(wsId));
  return db.runTransaction(async (tx) => {
    const l = (await tx.get(ref)).data()?.lider as DocLider | undefined;
    const livre = !l || l.ate < agoraMs || l.agentId === eu.agentId;
    if (!livre) return { ok: false as const, maquina: l.maquina };
    const geracao = (l?.geracao ?? 0) + 1;
    tx.set(ref, { lider: { agentId: eu.agentId, maquina: eu.maquina, ate: agoraMs + VALIDADE_MS, geracao } }, { merge: true });
    return { ok: true as const, geracao };
  });
}

export async function renovar(db: DbTx, wsId: string, eu: Eu, geracao: number, agoraMs: number): Promise<boolean> {
  const ref = db.doc(caminho(wsId));
  return db.runTransaction(async (tx) => {
    const l = (await tx.get(ref)).data()?.lider as DocLider | undefined;
    if (!l || l.agentId !== eu.agentId || l.geracao !== geracao) return false;
    tx.set(ref, { lider: { ...l, ate: agoraMs + VALIDADE_MS } }, { merge: true });
    return true;
  });
}

export interface LiderOpts {
  db: DbTx;
  wsId: string;
  eu: Eu;
  aoVirarLider: () => void;
  aoPerder: (motivo: 'lider') => void;
  agora?: () => number;
  intervaloAquisicaoMs?: number;
  intervaloRenovacaoMs?: number;
}

export function iniciarLider(o: LiderOpts): { parar(): void; souLider(): boolean; outraMaquina(): string | null } {
  const agora = o.agora ?? Date.now;
  let geracao: number | null = null;
  let outra: string | null = null;
  let ultimaRenovacaoOk = 0;
  let timer: NodeJS.Timeout | null = null;
  let parado = false;

  const perder = () => {
    if (parado) return;
    parado = true;
    if (timer) clearInterval(timer);
    o.aoPerder('lider');
  };

  const renovarAgora = async () => {
    try {
      const ok = await renovar(o.db, o.wsId, o.eu, geracao!, agora());
      if (!ok) { log.warn('Outro Wader tomou a liderança'); perder(); return; }
      ultimaRenovacaoOk = agora();
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'Renovação do cadeado falhou');
      if (agora() - ultimaRenovacaoOk >= VALIDADE_MS) perder();
    }
  };

  const adquirirAgora = async () => {
    try {
      const r = await tentarAdquirir(o.db, o.wsId, o.eu, agora());
      if (!r.ok) {
        outra = r.maquina;
        log.warn({ outra }, 'Outro Wader ativo — só UI; tento de novo em 1 min');
        return;
      }
      geracao = r.geracao;
      outra = null;
      ultimaRenovacaoOk = agora();
      if (timer) clearInterval(timer);
      timer = setInterval(() => void renovarAgora(), o.intervaloRenovacaoMs ?? 30_000);
      log.info({ geracao }, 'Sou o líder deste workspace');
      o.aoVirarLider();
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'Aquisição do cadeado falhou — tento de novo');
    }
  };

  timer = setInterval(() => { if (geracao === null) void adquirirAgora(); }, o.intervaloAquisicaoMs ?? 60_000);
  void adquirirAgora();

  return {
    parar: () => { parado = true; if (timer) clearInterval(timer); },
    souLider: () => geracao !== null && !parado,
    outraMaquina: () => outra,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/wader && npx vitest run src/adapters/lider.test.ts
```

Expected: 10 passed.

- [ ] **Step 5: Batimento — só o líder bate, com `agentId`, sem `conflito`**

`apps/wader/src/adapters/heartbeat.ts` — assinatura e corpo do `bater` ficam:

```ts
export function iniciarBatimento(
  wsId: string,
  versao: string,
  repo: OrthancConnChecker,
  client: OrthancPinger,
  extras: {
    /** Identidade única (spec §7): mesma chave do cadeado. */
    agentId: string;
    ultimoErroIngest?: () => string | null;
    /** Campos extras do batimento (Task 5: versaoDisponivel, aviso, ultimaSaida, versaoRejeitada). NUNCA a chave `lider`. */
    campos?: () => Record<string, unknown>;
  },
): () => void {
  const bater = async () => {
    const ref = getDb().doc(`workspaces/${wsId}/integracoes/wader`);

    // Só o líder bate (spec §7) — um escritor só, o cartão não pisca. A
    // detecção de 2 Waders mudou de lugar: cadeado (lider.ts) + aviso local.
    try {
      const extra = extras.campos?.() ?? {};
      delete extra.lider; // cinto: a chave lider é das transações do cadeado
      await ref.set(
        {
          tipo: 'wader',
          visto: new Date(),
          versao,
          maquina: os.hostname(),
          agentId: extras.agentId,
          ultimoErroIngest: extras.ultimoErroIngest?.() ?? null,
          ...extra,
        },
        { merge: true },
      );
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'Batimento falhou (segue o jogo)');
    }

    try {
      // (bloco do Orthanc inalterado — linhas 75-101 de hoje)
```

Apagar o bloco `let conflito ... } catch (e) { ... }` (linhas 39–57) e o campo `conflito` do `set`.

`apps/wader/src/adapters/heartbeat.test.ts`: apagar os 3 testes `detecta outro Wader ativo…`, `mesma maquina limpa o campo conflito`, `leitura pré-batimento falha…` e as variáveis `docData`/`getShouldThrow` (mock fica só com `set`). Em **todas** as chamadas `iniciarBatimento('ws1', '1.2.3', repo, client)` passar `{ agentId: 'ag-1' }` como 5º argumento (e no teste do `ultimoErroIngest`, `{ agentId: 'ag-1', ultimoErroIngest: () => '...' }`). No 1º teste acrescentar `expect(data.agentId).toBe('ag-1');`. Acrescentar um teste:

```ts
  it('campos extras entram no batimento, mas a chave lider nunca', async () => {
    const repo = { getOrthancConnection: async () => null };
    const client = { system: async () => ({}) };
    const parar = iniciarBatimento('ws1', '1.2.3', repo, client, {
      agentId: 'ag-1',
      campos: () => ({ versaoDisponivel: '1.0.1', aviso: null, lider: { agentId: 'hack' } }),
    });
    await vi.advanceTimersByTimeAsync(0);
    const data = callFor('workspaces/ws1/integracoes/wader')[0].data as Record<string, unknown>;
    expect(data.versaoDisponivel).toBe('1.0.1');
    expect(data).not.toHaveProperty('lider');
    parar();
    vi.useRealTimers();
  });
```

```bash
cd apps/wader && npx vitest run src/adapters/heartbeat.test.ts
```

Expected: 10 passed (12 − 3 + 1).

- [ ] **Step 6: `index.ts` — líder decide ligar os workers**

Reescrever o miolo do `main()` (da linha 81 `const uiOnly` até a 150 `registerShutdownHandlers`) assim:

```ts
  const uiOnly = process.env.WADER_UI_ONLY === '1' || process.env.WADER_UI_ONLY === 'true';

  const workspaceRepo = new WorkspaceRepo(config.wsId);
  const orthancClient = new OrthancClient(workspaceRepo);

  // Construir é inerte (nenhum worker faz I/O no construtor). Quem chama
  // start() é o cadeado (spec §7) — os workers não sabem o que é líder.
  const wlPathValidation = validarWorklistPath(config.orthanc.worklistPath);
  const worklistWorker = wlPathValidation.ok
    ? new WorklistSyncWorker({
        wsId: config.wsId,
        worklistPath: config.orthanc.worklistPath,
        intervalSec: config.polling.worklistSyncSec,
        scheduledStationName: config.orthanc.scheduledStationName,
      })
    : null;
  if (!wlPathValidation.ok) {
    log.warn(
      { path: config.orthanc.worklistPath, error: wlPathValidation.error, hint: wlPathValidation.hint },
      'Pasta worklists inválida — sync de worklist ficará desativado',
    );
  }
  const dicomWorker = new DicomIngestWorker({
    wsId: config.wsId,
    client: orthancClient,
    intervalSec: config.polling.orthancChangesSec,
  });
  const accWorker = new AccRecoveryWorker({
    wsId: config.wsId,
    client: orthancClient,
    intervalSec: config.polling.accRecoverySec ?? 20,
  });

  let pararBatimento: (() => void) | null = null;
  let pararVigia: (() => void) | null = null;
  let lider: ReturnType<typeof iniciarLider> | null = null;

  const subirWorkers = () => {
    worklistWorker?.start();
    dicomWorker.start();
    accWorker.start();
    pararBatimento = iniciarBatimento(config.wsId, lerVersaoPackage(), workspaceRepo, orthancClient, {
      agentId: config.agentId,
      ultimoErroIngest: () => dicomWorker.getUltimoErro(),
    });
    pararVigia = iniciarVigia({
      ultimoTickOkEm: () => dicomWorker.getUltimoTickOkEm(),
      ligado: () => dicomWorker.isRunning(),
      aoTravar: () => {
        log.fatal({ ultimoTickOkEm: dicomWorker.getUltimoTickOkEm() }, 'Ingestão travada — saindo pro serviço reiniciar');
        sairCom(CODIGO.VIGIA, { motivo: 'travado' });
      },
    });
  };

  const app = await startUiServer(config, {
    worklistWorker,
    dicomWorker,
    orthancClient,
    workspaceRepo,
    versao: lerVersaoPackage(),
    lancador,
    souLider: () => (uiOnly ? true : lider?.souLider() ?? false),
  });

  if (uiOnly) {
    log.warn('WADER_UI_ONLY ativo — workers DESLIGADOS (modo dev/console; não processa exames)');
  } else {
    lider = iniciarLider({
      db: getDb(),
      wsId: config.wsId,
      eu: { agentId: config.agentId, maquina: os.hostname() },
      aoVirarLider: subirWorkers,
      aoPerder: () => {
        log.fatal('Perdi a liderança — saindo pro serviço reiniciar');
        sairCom(CODIGO.VIGIA, { motivo: 'lider' });
      },
    });
  }

  registerShutdownHandlers(app, {
    worklistWorker,
    dicomWorker,
    accWorker,
    pararBatimento: () => { pararBatimento?.(); pararVigia?.(); lider?.parar(); },
  });
```

Imports novos no topo: `import os from 'os';`, `import { getDb } from './adapters/firebase';`, `import { iniciarLider } from './adapters/lider';`. Remover o bloco do vigia que a Task 3 pôs dentro do `else` (ele agora vive em `subirWorkers`), e o campo `pararVigia` que a Task 3 acrescentou ao `registerShutdownHandlers` (volta ao tipo original de 4 campos — `pararBatimento` já fecha os três). Apagar o comentário-cabeçalho "Em fases posteriores virá…" (linhas 10–16), que mente desde a S4.

- [ ] **Step 7: Guarda de não-líder nos botões "Iniciar"**

`apps/wader/src/ui/server.ts` — em `UiServerExtras`: `souLider?: () => boolean;`. Passar adiante: `registerWorklistRoutes(app, config, extras.worklistWorker, extras.souLider)` e `registerDicomRoutes(app, config, extras.dicomWorker ?? null, orthancClient, extras.souLider)`.

`apps/wader/src/ui/api/dicom.ts:76-82` (e o mesmo em `worklist.ts:79-89`, com `souLider?: () => boolean` como último parâmetro da função de registro):

```ts
  app.post('/api/dicom/worker/start', async (_req, reply) => {
    if (!worker) return reply.status(400).send({ ok: false, error: 'worker_nao_configurado' });
    // Não-líder não liga worker nem pelo botão (spec §7): seria o 2º escritor.
    if (souLider && !souLider()) return reply.status(409).send({ ok: false, error: 'nao_lider' });
    worker.start();
    return reply.send({ ok: true, ...worker.getStatus() });
  });
```

(manter o resto de cada handler como está hoje.)

```bash
cd apps/wader && npm run typecheck && npm test
```

Expected: limpo; 138 passed (130 − 3 + 1 + 10).

- [ ] **Step 8: LEO — tipo e cartão derivam de `lider` (D1)**

`src/lib/integracoes.ts:19-23` — trocar a linha de `conflito` por:

```ts
  /** Wader: cadeado de líder (apps/wader/src/adapters/lider.ts) — quem está processando. */
  lider?: { agentId: string; maquina: string; ate: number; geracao: number } | null; // wader
  agentId?: string;                  // wader
```

`src/app/(plataforma)/integracoes/page.tsx:676-683` — trocar o bloco `{i.conflito && (...)}` por:

```tsx
                    {/* Um escritor só no doc (spec Wader A §7): o cartão mostra quem é
                        o líder; "2 Waders" agora é aviso local na clínica (fase C traz pra cá). */}
                    {i.lider && i.lider.maquina !== i.maquina && (
                      <p className="text-xs text-amber-600">⚠️ Líder: {i.lider.maquina} (batimento de {i.maquina || '?'})</p>
                    )}
```

`tests/unit/integracoes.test.mjs` — acrescentar:

```js
test('tipo wader aceita lider e nao depende mais de conflito', () => {
  const i = { tipo: 'wader', visto: AGORA - 60_000, lider: { agentId: 'a', maquina: 'PC', ate: AGORA + 90_000, geracao: 1 } };
  assert.match(rotuloEstado(i, AGORA), /no ar/i);
});
```

```bash
npm run typecheck && npm run test:unit 2>&1 | tail -5
```

Expected: typecheck limpo (nenhum outro uso de `conflito` — conferir com `grep -rn conflito src/ tests/`); unit passa.

- [ ] **Step 9: Commit**

```bash
git add apps/wader/src/adapters/lider.ts apps/wader/src/adapters/lider.test.ts apps/wader/src/adapters/heartbeat.ts apps/wader/src/adapters/heartbeat.test.ts apps/wader/src/index.ts apps/wader/src/ui/server.ts apps/wader/src/ui/api/dicom.ts apps/wader/src/ui/api/worklist.ts src/lib/integracoes.ts "src/app/(plataforma)/integracoes/page.tsx" tests/unit/integracoes.test.mjs
git commit -m "feat(wader): cadeado de lider no Firestore — so o lider liga workers e bate; agentId e a identidade; LEO mostra o lider (sem conflito)"
```

---

### Task 5: Atualização com ok — release do GitHub, botões `/admin` com PIN e Origin, `/health` com `schema` e `aviso`

**Files:**
- Create: `apps/wader/src/lib/estado.ts`
- Create: `apps/wader/src/lib/release.ts`, `apps/wader/src/lib/release.test.ts`
- Create: `apps/wader/src/lib/pin.ts`, `apps/wader/src/lib/pin.test.ts`
- Create: `apps/wader/src/lib/aviso.ts`, `apps/wader/src/lib/aviso.test.ts`
- Create: `apps/wader/src/ui/health.ts`, `apps/wader/src/ui/health.test.ts`, `apps/wader/installer/tests/health-exemplo.json`
- Create: `apps/wader/src/ui/api/atualizacao.ts`, `apps/wader/src/ui/api/atualizacao.test.ts`
- Modify: `apps/wader/src/config/types.ts:25-34`, `apps/wader/src/config/load.ts:79-110`, `apps/wader/wader.config.example.json`
- Modify: `apps/wader/src/ui/server.ts` (`/health`, extras, rota admin), `apps/wader/src/ui/pages/admin.html`, `apps/wader/src/index.ts`

**Interfaces:**
- Consumes: `CODIGO.ATUALIZACAO`, `sairCom`, `lerLancador`, `dirUpdates`, `Lancador` (Task 2); `getUltimoOrthancOkEm` (Task 3); `iniciarLider(...).souLider/outraMaquina`, `extras.campos` do batimento (Task 4).
- Produces: `EstadoWader` (abaixo); `versaoNova(tag, atual)`, `checarRelease(atual, fetchFn)`, `baixarRelease(info, dir, fetchFn)`, `iniciarChecagemRelease(atual, aoAchar, intervaloMs?, fetchFn?)`; `GuardaPin`, `origemPermitida`; `calcularAviso(entrada)`; `montarHealth(estado, agora?)` com `schema: 1` — **o contrato que o `wader-aviso.ps1` (Task 6) lê**: campos `versao`, `aviso`; `registerAtualizacaoRoutes(app, config, deps)`.

```ts
// apps/wader/src/lib/estado.ts — o que /health, batimento e aviso leem.
import type { Lancador } from './saida';

export interface ReleaseInfo { versao: string; assets: Record<string, string> }

export interface EstadoWader {
  versao: string;
  iniciadoEm: number;
  versaoDisponivel: ReleaseInfo | null;
  souLider: () => boolean;
  outraMaquina: () => string | null;
  ultimoOrthancOkEm: () => Date | null;
  lancador: Lancador | null;
  prevExiste: () => boolean;
}
```

- [ ] **Step 1: `adminPin` na config**

`apps/wader/src/config/types.ts` — em `WaderConfig`, após `agentId: string;`:

```ts
  /** PIN de 6 dígitos dos botões Atualizar/Voltar do /admin (spec §5). Definido no instalador. */
  adminPin?: string;
```

`apps/wader/src/config/load.ts` — em `validate`, após a checagem de `ui.port`:

```ts
  if (cfg.adminPin !== undefined && !/^\d{6}$/.test(cfg.adminPin)) {
    errors.push('adminPin deve ter exatamente 6 dígitos');
  }
```

`apps/wader/wader.config.example.json`: acrescentar `"adminPin": "123456",` após `"agentId"`.

- [ ] **Step 2: Testes de release, PIN e aviso (puros)**

`apps/wader/src/lib/release.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { versaoNova, checarRelease, baixarRelease, URL_RELEASE } from './release';

describe('versaoNova', () => {
  it('tag wader-v diferente da atual → versão nova', () => expect(versaoNova('wader-v1.0.1', '1.0.0')).toBe('1.0.1'));
  it('tag igual à atual → null', () => expect(versaoNova('wader-v1.0.0', '1.0.0')).toBeNull());
  it('tag de outra linha (v2.3.0, leo-v1) ou ausente → null', () => {
    expect(versaoNova('v2.3.0', '1.0.0')).toBeNull();
    expect(versaoNova('leo-v9', '1.0.0')).toBeNull();
    expect(versaoNova(undefined, '1.0.0')).toBeNull();
  });
});

const fetchFalso = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe('checarRelease', () => {
  it('monta versão + mapa nome→url dos assets e manda User-Agent', async () => {
    let urlChamada = ''; let headers: Record<string, string> = {};
    const f = (async (u: string, init: { headers: Record<string, string> }) => {
      urlChamada = u; headers = init.headers;
      return { ok: true, json: async () => ({ tag_name: 'wader-v1.0.1', assets: [
        { name: 'wader.exe', browser_download_url: 'https://x/wader.exe' },
        { name: 'wader.exe.sha256', browser_download_url: 'https://x/wader.exe.sha256' },
      ] }) };
    }) as unknown as typeof fetch;
    expect(await checarRelease('1.0.0', f)).toEqual({ versao: '1.0.1', assets: { 'wader.exe': 'https://x/wader.exe', 'wader.exe.sha256': 'https://x/wader.exe.sha256' } });
    expect(urlChamada).toBe(URL_RELEASE);
    expect(headers['User-Agent']).toBe('wader');
  });
  it('sem versão nova, HTTP ≠ 2xx ou rede fora → null (silêncio)', async () => {
    expect(await checarRelease('1.0.0', fetchFalso({ tag_name: 'wader-v1.0.0', assets: [] }))).toBeNull();
    expect(await checarRelease('1.0.0', fetchFalso({}, false))).toBeNull();
    expect(await checarRelease('1.0.0', (async () => { throw new Error('ENOTFOUND'); }) as unknown as typeof fetch)).toBeNull();
  });
});

describe('baixarRelease', () => {
  it('grava updates/wader-vX.exe e .sha256 (via .tmp + rename)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wader-rel-'));
    const f = (async (u: string) => ({
      ok: true,
      body: new Blob([u.endsWith('sha256') ? 'abc  wader.exe' : 'EXE']).stream(),
    })) as unknown as typeof fetch;
    await baixarRelease({ versao: '1.0.1', assets: { 'wader.exe': 'https://x/wader.exe', 'wader.exe.sha256': 'https://x/wader.exe.sha256' } }, dir, f);
    expect(fs.readFileSync(path.join(dir, 'wader-v1.0.1.exe'), 'utf-8')).toBe('EXE');
    expect(fs.readFileSync(path.join(dir, 'wader-v1.0.1.exe.sha256'), 'utf-8')).toBe('abc  wader.exe');
    expect(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
  it('release sem os dois assets → lança (nada gravado)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wader-rel-'));
    await expect(baixarRelease({ versao: '1.0.1', assets: {} }, dir, fetch)).rejects.toThrow(/asset/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
```

`apps/wader/src/lib/pin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GuardaPin, origemPermitida } from './pin';

describe('GuardaPin', () => {
  it('pin certo → ok; errado → errado; ausente → errado', () => {
    const g = new GuardaPin('123456');
    expect(g.verificar('123456')).toBe('ok');
    expect(g.verificar('000000')).toBe('errado');
    expect(g.verificar(undefined)).toBe('errado');
    expect(g.verificar('12345')).toBe('errado'); // tamanho diferente não lança
  });
  it('5 erros → bloqueado 15 min, até o pin certo; depois libera', () => {
    let t = 0;
    const g = new GuardaPin('123456', () => t);
    for (let i = 0; i < 4; i++) expect(g.verificar('x')).toBe('errado');
    expect(g.verificar('x')).toBe('bloqueado');
    expect(g.verificar('123456')).toBe('bloqueado');
    t = 15 * 60_000 - 1;
    expect(g.verificar('123456')).toBe('bloqueado');
    t = 15 * 60_000;
    expect(g.verificar('123456')).toBe('ok');
  });
  it('acerto zera a contagem de erros', () => {
    const g = new GuardaPin('123456');
    for (let i = 0; i < 4; i++) g.verificar('x');
    g.verificar('123456');
    for (let i = 0; i < 4; i++) expect(g.verificar('x')).toBe('errado');
  });
});

describe('origemPermitida', () => {
  it('sem Origin (curl, fetch same-origin antigo) → permitido', () => expect(origemPermitida(undefined, 8043)).toBe(true));
  it('127.0.0.1 e localhost na porta certa → permitido', () => {
    expect(origemPermitida('http://127.0.0.1:8043', 8043)).toBe(true);
    expect(origemPermitida('http://localhost:8043', 8043)).toBe(true);
  });
  it('outra origem, outra porta, https, null → recusado', () => {
    expect(origemPermitida('http://evil.test', 8043)).toBe(false);
    expect(origemPermitida('http://localhost:9999', 8043)).toBe(false);
    expect(origemPermitida('null', 8043)).toBe(false);
  });
});
```

`apps/wader/src/lib/aviso.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calcularAviso } from './aviso';

const base = { agoraMs: 10_000_000, ultimoOrthancOkEm: 10_000_000 - 1000, versaoDisponivel: null, souLider: true, outraMaquina: null, versaoRejeitada: null, versaoAtual: '1.0.0' };

describe('calcularAviso (spec §9)', () => {
  it('tudo bem → null', () => expect(calcularAviso(base)).toBeNull());
  it('Orthanc sem resposta há > 5 min → "Wader sem Orthanc" (só líder)', () => {
    expect(calcularAviso({ ...base, ultimoOrthancOkEm: base.agoraMs - 5 * 60_000 - 1 })).toBe('Wader sem Orthanc');
    expect(calcularAviso({ ...base, ultimoOrthancOkEm: base.agoraMs - 5 * 60_000 })).toBeNull();
    expect(calcularAviso({ ...base, souLider: false, outraMaquina: null, ultimoOrthancOkEm: 0 })).toBeNull();
  });
  it('versão disponível', () => expect(calcularAviso({ ...base, versaoDisponivel: '1.0.1' })).toBe('Wader v1.0.1 disponível — abra o painel pra atualizar'));
  it('não-líder → "Outro Wader ativo em X" e ganha de tudo', () => {
    expect(calcularAviso({ ...base, souLider: false, outraMaquina: 'NOTEBOOK', versaoDisponivel: '9', ultimoOrthancOkEm: 0 })).toBe('Outro Wader ativo em NOTEBOOK');
  });
  it('versão rejeitada → "voltou pra vY: a vX caiu 3 vezes", antes de "versão disponível"', () => {
    expect(calcularAviso({ ...base, versaoRejeitada: '1.0.1', versaoDisponivel: '1.0.1' })).toBe('Wader voltou pra v1.0.0: a v1.0.1 caiu 3 vezes');
  });
  it('sem Orthanc ganha de versão', () => {
    expect(calcularAviso({ ...base, ultimoOrthancOkEm: 0, versaoDisponivel: '1.0.1' })).toBe('Wader sem Orthanc');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd apps/wader && npx vitest run src/lib/release.test.ts src/lib/pin.test.ts src/lib/aviso.test.ts
```

Expected: 3 arquivos FAIL — módulos inexistentes.

- [ ] **Step 4: Implementar `release.ts`, `pin.ts`, `aviso.ts`**

`apps/wader/src/lib/release.ts`:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReleaseInfo } from './estado';

/**
 * Atualização com ok (spec §5): releases/latest do repo público (o GitHub já
 * exclui draft e prerelease). Versão nova = tag `wader-v{X}` com X ≠ atual.
 * Sem semver de propósito (corte Ponytail 5): reintroduzir se o repo ganhar
 * outra linha de release. Só baixa — quem confere SHA é o lançador (§4).
 */
export const URL_RELEASE = 'https://api.github.com/repos/SergioAbdon/souleo/releases/latest';
const PREFIXO = 'wader-v';

export function versaoNova(tagName: string | undefined, atual: string): string | null {
  if (!tagName || !tagName.startsWith(PREFIXO)) return null;
  const v = tagName.slice(PREFIXO.length);
  return v === atual ? null : v;
}

export async function checarRelease(atual: string, fetchFn: typeof fetch = fetch): Promise<ReleaseInfo | null> {
  try {
    const r = await fetchFn(URL_RELEASE, { headers: { 'User-Agent': 'wader', Accept: 'application/vnd.github+json' } });
    if (!r.ok) return null;
    const j = (await r.json()) as { tag_name?: string; assets?: { name: string; browser_download_url: string }[] };
    const versao = versaoNova(j.tag_name, atual);
    if (!versao) return null;
    const assets: Record<string, string> = {};
    for (const a of j.assets ?? []) assets[a.name] = a.browser_download_url;
    return { versao, assets };
  } catch {
    return null; // sem rede = silêncio, tenta na próxima hora
  }
}

async function baixarPara(url: string, destino: string, fetchFn: typeof fetch): Promise<void> {
  const r = await fetchFn(url, { headers: { 'User-Agent': 'wader' } });
  if (!r.ok || !r.body) throw new Error(`download falhou (${r.status}): ${url}`);
  await pipeline(Readable.fromWeb(r.body as never), fs.createWriteStream(destino + '.tmp'));
  fs.renameSync(destino + '.tmp', destino);
}

/** Grava `updates/wader-v{X}.exe` e `.sha256`. Lança se a release não tem os dois assets. */
export async function baixarRelease(info: ReleaseInfo, dir: string, fetchFn: typeof fetch = fetch): Promise<void> {
  const exe = info.assets['wader.exe'];
  const sha = info.assets['wader.exe.sha256'];
  if (!exe || !sha) throw new Error('release sem os assets wader.exe / wader.exe.sha256');
  fs.mkdirSync(dir, { recursive: true });
  const alvo = path.join(dir, `wader-v${info.versao}.exe`);
  await baixarPara(sha, alvo + '.sha256', fetchFn);
  await baixarPara(exe, alvo, fetchFn);
}

export function iniciarChecagemRelease(
  atual: string,
  aoAchar: (info: ReleaseInfo | null) => void,
  intervaloMs = 60 * 60_000,
  fetchFn: typeof fetch = fetch,
): () => void {
  const checar = async () => aoAchar(await checarRelease(atual, fetchFn));
  void checar();
  const timer = setInterval(() => void checar(), intervaloMs);
  return () => clearInterval(timer);
}
```

`apps/wader/src/lib/pin.ts`:

```ts
import { timingSafeEqual } from 'node:crypto';

/**
 * Segurança dos botões Atualizar/Voltar (spec §5, achado Codex 1):
 * PIN em tempo constante, 5 erros = 15 min bloqueado; Origin de página
 * aberta no navegador tem que ser o próprio Wader (CSRF).
 */
export class GuardaPin {
  private erros = 0;
  private bloqueadoAte = 0;

  constructor(private readonly pin: string, private readonly agora: () => number = Date.now) {}

  verificar(enviado: string | undefined): 'ok' | 'errado' | 'bloqueado' {
    const t = this.agora();
    if (t < this.bloqueadoAte) return 'bloqueado';
    const a = Buffer.from(String(enviado ?? ''));
    const b = Buffer.from(this.pin);
    const igual = a.length === b.length && timingSafeEqual(a, b);
    if (igual) {
      this.erros = 0;
      return 'ok';
    }
    this.erros += 1;
    if (this.erros >= 5) {
      this.erros = 0;
      this.bloqueadoAte = t + 15 * 60_000;
      return 'bloqueado';
    }
    return 'errado';
  }
}

export function origemPermitida(origin: string | undefined, porta: number): boolean {
  if (origin === undefined) return true; // curl / sem navegador
  return origin === `http://127.0.0.1:${porta}` || origin === `http://localhost:${porta}`;
}
```

`apps/wader/src/lib/aviso.ts`:

```ts
/**
 * A regra do toast mora aqui, no exe (corte Ponytail 2, achado Ruflo 8):
 * o wader-aviso.ps1 só mostra o texto que o /health entrega.
 * Prioridade: não-líder > sem Orthanc > versão rejeitada > versão disponível.
 */
export interface EntradaAviso {
  agoraMs: number;
  ultimoOrthancOkEm: number; // ms; sem resposta desde a subida = iniciadoEm
  versaoDisponivel: string | null;
  souLider: boolean;
  outraMaquina: string | null;
  versaoRejeitada: string | null;
  versaoAtual: string;
}

const SEM_ORTHANC_MS = 5 * 60_000;

export function calcularAviso(e: EntradaAviso): string | null {
  if (!e.souLider && e.outraMaquina) return `Outro Wader ativo em ${e.outraMaquina}`;
  if (e.souLider && e.agoraMs - e.ultimoOrthancOkEm > SEM_ORTHANC_MS) return 'Wader sem Orthanc';
  if (e.versaoRejeitada) return `Wader voltou pra v${e.versaoAtual}: a v${e.versaoRejeitada} caiu 3 vezes`;
  if (e.versaoDisponivel) return `Wader v${e.versaoDisponivel} disponível — abra o painel pra atualizar`;
  return null;
}
```

```bash
cd apps/wader && npx vitest run src/lib/release.test.ts src/lib/pin.test.ts src/lib/aviso.test.ts
```

Expected: 19 passed.

- [ ] **Step 5: Contrato do `/health` (`schema: 1`) + fixture compartilhada com o Pester**

`apps/wader/installer/tests/health-exemplo.json` (exatamente estas chaves — é o contrato):

```json
{
  "schema": 1,
  "status": "ok",
  "service": "wader",
  "timestamp": "2026-10-11T12:00:00.000Z",
  "versao": "1.0.0",
  "versaoDisponivel": "1.0.1",
  "lider": true,
  "outraMaquina": null,
  "aviso": "Wader v1.0.1 disponível — abra o painel pra atualizar",
  "versaoRejeitada": null,
  "erroLancador": null,
  "ultimaSaida": { "motivo": "atualizacao", "em": "2026-10-11T11:00:00.000Z" },
  "prevExiste": true
}
```

`apps/wader/src/ui/health.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { montarHealth, HEALTH_SCHEMA } from './health';
import type { EstadoWader } from '../lib/estado';

const estado: EstadoWader = {
  versao: '1.0.0',
  iniciadoEm: 0,
  versaoDisponivel: { versao: '1.0.1', assets: {} },
  souLider: () => true,
  outraMaquina: () => null,
  ultimoOrthancOkEm: () => new Date(),
  lancador: { quedasSeguidas: 0, ultimaSaida: { motivo: 'atualizacao', em: '2026-10-11T11:00:00.000Z' } },
  prevExiste: () => true,
};

describe('contrato do /health', () => {
  it('schema 1 com exatamente as chaves da fixture que o Pester lê', () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../../installer/tests/health-exemplo.json'), 'utf-8'));
    const h = montarHealth(estado, new Date('2026-10-11T12:00:00.000Z'));
    expect(Object.keys(h).sort()).toEqual(Object.keys(fixture).sort());
    expect(h.schema).toBe(HEALTH_SCHEMA);
    expect(h).toEqual(fixture);
  });
  it('sem lançador e sem versão nova → nulos, não undefined (JSON precisa ter as chaves)', () => {
    const h = montarHealth({ ...estado, versaoDisponivel: null, lancador: null, prevExiste: () => false });
    expect(h.versaoDisponivel).toBeNull();
    expect(h.ultimaSaida).toBeNull();
    expect(h.versaoRejeitada).toBeNull();
    expect(h.erroLancador).toBeNull();
    expect(h.aviso).toBeNull();
    expect(h.prevExiste).toBe(false);
  });
});
```

`apps/wader/src/ui/health.ts`:

```ts
import { calcularAviso } from '../lib/aviso';
import type { EstadoWader } from '../lib/estado';

/** Contrato do /health (spec §9). Mudou campo → sobe HEALTH_SCHEMA e a fixture. */
export const HEALTH_SCHEMA = 1;

export interface Health {
  schema: typeof HEALTH_SCHEMA;
  status: 'ok';
  service: 'wader';
  timestamp: string;
  versao: string;
  versaoDisponivel: string | null;
  lider: boolean;
  outraMaquina: string | null;
  aviso: string | null;
  versaoRejeitada: string | null;
  erroLancador: string | null;
  ultimaSaida: { motivo: string; em: string } | null;
  prevExiste: boolean;
}

export function montarHealth(e: EstadoWader, agora: Date = new Date()): Health {
  const versaoRejeitada = e.lancador?.versaoRejeitada ?? null;
  const versaoDisponivel = e.versaoDisponivel?.versao ?? null;
  return {
    schema: HEALTH_SCHEMA,
    status: 'ok',
    service: 'wader',
    timestamp: agora.toISOString(),
    versao: e.versao,
    versaoDisponivel,
    lider: e.souLider(),
    outraMaquina: e.outraMaquina(),
    aviso: calcularAviso({
      agoraMs: agora.getTime(),
      ultimoOrthancOkEm: e.ultimoOrthancOkEm()?.getTime() ?? e.iniciadoEm,
      versaoDisponivel,
      souLider: e.souLider(),
      outraMaquina: e.outraMaquina(),
      versaoRejeitada,
      versaoAtual: e.versao,
    }),
    versaoRejeitada,
    erroLancador: e.lancador?.erro ?? null,
    ultimaSaida: e.lancador?.ultimaSaida ?? null,
    prevExiste: e.prevExiste(),
  };
}
```

```bash
cd apps/wader && npx vitest run src/ui/health.test.ts
```

Expected: 2 passed.

- [ ] **Step 6: Rotas `/api/admin/atualizar` e `/voltar` (teste com `app.inject`)**

`apps/wader/src/ui/api/atualizacao.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerAtualizacaoRoutes } from './atualizacao';

const config = { ui: { port: 8043 }, adminPin: '123456' } as any;
let sair: ReturnType<typeof vi.fn>;
let baixar: ReturnType<typeof vi.fn>;
let release: { versao: string; assets: Record<string, string> } | null;
let prev: boolean;

function makeApp() {
  const app = Fastify();
  registerAtualizacaoRoutes(app, config, {
    release: () => release,
    baixar,
    sair: sair as any,
    prevExiste: () => prev,
    dirUpdates: () => 'X',
  });
  return app;
}

beforeEach(() => {
  sair = vi.fn(); baixar = vi.fn(async () => {}); prev = true;
  release = { versao: '1.0.1', assets: { 'wader.exe': 'u', 'wader.exe.sha256': 's' } };
});

// sairDepois usa setTimeout(300 ms) real: fake timers + app.inject travam, então espera-se de verdade.
const esperarSaida = () => new Promise((r) => setTimeout(r, 400));

const post = (app: ReturnType<typeof makeApp>, url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url, headers });

describe('POST /api/admin/atualizar', () => {
  it('sem PIN → 401 e nada acontece', async () => {
    const r = await post(makeApp(), '/api/admin/atualizar');
    expect(r.statusCode).toBe(401);
    expect(baixar).not.toHaveBeenCalled();
    expect(sair).not.toHaveBeenCalled();
  });
  it('Origin estranho → 403 mesmo com PIN certo', async () => {
    const r = await post(makeApp(), '/api/admin/atualizar', { 'x-wader-pin': '123456', origin: 'http://evil.test' });
    expect(r.statusCode).toBe(403);
  });
  it('5 PINs errados → 429', async () => {
    const app = makeApp();
    for (let i = 0; i < 4; i++) expect((await post(app, '/api/admin/atualizar', { 'x-wader-pin': '0' })).statusCode).toBe(401);
    expect((await post(app, '/api/admin/atualizar', { 'x-wader-pin': '0' })).statusCode).toBe(429);
    expect((await post(app, '/api/admin/atualizar', { 'x-wader-pin': '123456' })).statusCode).toBe(429);
  });
  it('PIN certo, versão disponível → baixa, responde e sai com 10 + pedido {atualizar}', async () => {
    const r = await post(makeApp(), '/api/admin/atualizar', { 'x-wader-pin': '123456', origin: 'http://127.0.0.1:8043' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, versao: '1.0.1' });
    expect(baixar).toHaveBeenCalledWith(release, 'X');
    await esperarSaida();
    expect(sair).toHaveBeenCalledWith(10, { atualizar: '1.0.1', motivo: 'atualizacao' });
  });
  it('sem versão nova → 409; download falhou → 502 e não sai', async () => {
    release = null;
    expect((await post(makeApp(), '/api/admin/atualizar', { 'x-wader-pin': '123456' })).statusCode).toBe(409);
    release = { versao: '1.0.1', assets: {} };
    baixar = vi.fn(async () => { throw new Error('sem asset'); });
    const r = await post(makeApp(), '/api/admin/atualizar', { 'x-wader-pin': '123456' });
    expect(r.statusCode).toBe(502);
    await esperarSaida();
    expect(sair).not.toHaveBeenCalled();
  });
  it('sem adminPin na config → 503', async () => {
    const app = Fastify();
    registerAtualizacaoRoutes(app, { ui: { port: 8043 } } as any, { release: () => release, baixar, sair: sair as any, prevExiste: () => true, dirUpdates: () => 'X' });
    expect((await post(app, '/api/admin/atualizar', { 'x-wader-pin': '123456' })).statusCode).toBe(503);
  });
});

describe('POST /api/admin/voltar', () => {
  it('com .prev → sai com 10 + pedido {voltar}', async () => {
    const r = await post(makeApp(), '/api/admin/voltar', { 'x-wader-pin': '123456' });
    expect(r.statusCode).toBe(200);
    await esperarSaida();
    expect(sair).toHaveBeenCalledWith(10, { voltar: true, motivo: 'rollback' });
  });
  it('sem .prev → 409', async () => {
    prev = false;
    expect((await post(makeApp(), '/api/admin/voltar', { 'x-wader-pin': '123456' })).statusCode).toBe(409);
    expect(sair).not.toHaveBeenCalled();
  });
});
```

Rodar: `cd apps/wader && npx vitest run src/ui/api/atualizacao.test.ts` → FAIL (módulo inexistente).

`apps/wader/src/ui/api/atualizacao.ts`:

```ts
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '../../logger';
import { WaderConfig } from '../../config/types';
import { GuardaPin, origemPermitida } from '../../lib/pin';
import { CODIGO, type Pedido } from '../../lib/saida';
import type { ReleaseInfo } from '../../lib/estado';

const log = createLogger({ module: 'api-atualizacao' });

export interface AtualizacaoDeps {
  release: () => ReleaseInfo | null;
  baixar: (info: ReleaseInfo, dir: string) => Promise<void>;
  sair: (codigo: number, pedido: Omit<Pedido, 'em'>) => never;
  prevExiste: () => boolean;
  dirUpdates: () => string;
}

/**
 * Botões do /admin (spec §5):
 *   POST /api/admin/atualizar — baixa a release, grava pedido {atualizar}, sai 10
 *   POST /api/admin/voltar    — grava pedido {voltar}, sai 10
 * O lançador faz o resto. Ambos: X-Wader-Pin + Origin (lib/pin.ts).
 */
export function registerAtualizacaoRoutes(app: FastifyInstance, config: WaderConfig, deps: AtualizacaoDeps): void {
  const guarda = config.adminPin ? new GuardaPin(config.adminPin) : null;

  const autorizar = (req: FastifyRequest, reply: FastifyReply): FastifyReply | null => {
    if (!guarda) return reply.status(503).send({ ok: false, error: 'sem_pin', message: 'adminPin não configurado em wader.config.json' });
    if (!origemPermitida(req.headers.origin, config.ui.port)) return reply.status(403).send({ ok: false, error: 'origem' });
    const v = guarda.verificar(req.headers['x-wader-pin'] as string | undefined);
    if (v === 'bloqueado') return reply.status(429).send({ ok: false, error: 'bloqueado', message: '5 erros: tente em 15 min' });
    if (v === 'errado') return reply.status(401).send({ ok: false, error: 'pin' });
    return null;
  };

  // Responde antes de sair: o navegador precisa do 200 pra mostrar "reiniciando".
  const sairDepois = (pedido: Omit<Pedido, 'em'>) => setTimeout(() => deps.sair(CODIGO.ATUALIZACAO, pedido), 300);

  app.post('/api/admin/atualizar', async (req, reply) => {
    const negado = autorizar(req, reply);
    if (negado) return negado;
    const info = deps.release();
    if (!info) return reply.status(409).send({ ok: false, error: 'sem_versao_nova' });
    try {
      await deps.baixar(info, deps.dirUpdates());
    } catch (err) {
      log.error({ err }, 'Download da release falhou');
      return reply.status(502).send({ ok: false, error: 'download', message: (err as Error).message });
    }
    log.warn({ versao: info.versao }, 'Atualização pedida pelo painel — saindo pro lançador aplicar');
    sairDepois({ atualizar: info.versao, motivo: 'atualizacao' });
    return reply.send({ ok: true, versao: info.versao });
  });

  app.post('/api/admin/voltar', async (req, reply) => {
    const negado = autorizar(req, reply);
    if (negado) return negado;
    if (!deps.prevExiste()) return reply.status(409).send({ ok: false, error: 'sem_prev' });
    log.warn('Rollback pedido pelo painel — saindo pro lançador voltar');
    sairDepois({ voltar: true, motivo: 'rollback' });
    return reply.send({ ok: true });
  });
}
```

```bash
cd apps/wader && npx vitest run src/ui/api/atualizacao.test.ts
```

Expected: 8 passed.

- [ ] **Step 7: `server.ts` — `/health` novo e rota admin registrada**

`apps/wader/src/ui/server.ts`:

- Imports: `import { montarHealth } from './health';`, `import { registerAtualizacaoRoutes, AtualizacaoDeps } from './api/atualizacao';`, `import type { EstadoWader } from '../lib/estado';`.
- `UiServerExtras`: trocar `versao?: string;` e o `lancador?` da Task 2 por `estado: EstadoWader;` e acrescentar `atualizacao: AtualizacaoDeps;` (ambos obrigatórios; o default do parâmetro `extras` some — os chamadores são só `index.ts`).
- `registerHealthRoutes(app, extras.estado)`:

```ts
function registerHealthRoutes(app: FastifyInstance, estado: EstadoWader): void {
  // Contrato schema 1 (spec §9): quem lê é o wader-aviso.ps1 e o ensaio.
  app.get('/health', async () => montarHealth(estado));
  app.get('/version', async () => ({ version: estado.versao }));
}
```

- Após `registerReconciliacaoRoutes(...)`: `registerAtualizacaoRoutes(app, config, extras.atualizacao);`.

- [ ] **Step 8: `index.ts` — estado, checagem de release, campos do batimento**

Em `apps/wader/src/index.ts`:

```ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EstadoWader } from './lib/estado';
import { baixarRelease, iniciarChecagemRelease } from './lib/release';
import { dirUpdates } from './lib/saida';
```

Logo após `const lancador = lerLancador();` (Task 2) e **antes** de construir os workers:

```ts
  const versao = lerVersaoPackage();
  const estado: EstadoWader = {
    versao,
    iniciadoEm: Date.now(),
    versaoDisponivel: null,
    souLider: () => (uiOnly ? true : lider?.souLider() ?? false),
    outraMaquina: () => lider?.outraMaquina() ?? null,
    ultimoOrthancOkEm: () => dicomWorker.getUltimoOrthancOkEm(),
    lancador,
    // .prev mora ao lado do exe (Program Files), não na pasta de dados.
    prevExiste: () => fs.existsSync(path.join(path.dirname(process.execPath), 'wader.exe.prev')),
  };
```

(`uiOnly`, `lider` e `dicomWorker` são `let`/`const` declarados antes — mover a declaração de `uiOnly` e `let lider` pra cima do `estado`; `dicomWorker` é `const` e é referenciado dentro de uma função, então a ordem de declaração não importa em runtime, mas pro TS mova a construção dos workers pra antes do `estado`.)

Trocar na chamada de `startUiServer`: `versao: lerVersaoPackage(), lancador,` por (o `souLider` da Task 4 fica como está):

```ts
    estado,
    atualizacao: {
      release: () => estado.versaoDisponivel,
      baixar: baixarRelease,
      sair: sairCom,
      prevExiste: estado.prevExiste,
      dirUpdates,
    },
```

No `subirWorkers`, o batimento ganha os campos novos (spec §8):

```ts
    pararBatimento = iniciarBatimento(config.wsId, versao, workspaceRepo, orthancClient, {
      agentId: config.agentId,
      ultimoErroIngest: () => dicomWorker.getUltimoErro(),
      campos: () => {
        const h = montarHealth(estado);
        return { versaoDisponivel: h.versaoDisponivel, aviso: h.aviso, ultimaSaida: h.ultimaSaida, versaoRejeitada: h.versaoRejeitada };
      },
    });
```

(importar `montarHealth` de `./ui/health`). Após o `if (uiOnly) … else { lider = … }`:

```ts
  // Checagem de release a cada 1 h (spec §5). Sem rede = null = silêncio.
  const pararRelease = iniciarChecagemRelease(versao, (info) => {
    if (info && estado.versaoDisponivel?.versao !== info.versao) log.info({ versao: info.versao }, 'Versão nova disponível');
    estado.versaoDisponivel = info;
  });
```

e no `pararBatimento` do `registerShutdownHandlers` acrescentar `pararRelease();`. Trocar as duas chamadas restantes de `lerVersaoPackage()` por `versao`.

```bash
cd apps/wader && npm run typecheck && npm test
```

Expected: limpo; todos os testes passam (anotar o total).

- [ ] **Step 9: Cartão "Atualização" no `/admin`**

`apps/wader/src/ui/pages/admin.html` — após a `<section class="card">` de "Status do Wader" (linha 92) inserir:

```html
      <!-- Atualização com ok (spec Fase A §5): versão, botão Atualizar, botão Voltar. -->
      <section class="card">
        <h2>Atualização</h2>
        <p class="subtitle">Nada acontece sem clique. O serviço reinicia sozinho em ~10 s depois de confirmar.</p>
        <div id="atualizacao"></div>
        <div class="actions">
          <button id="btn-atualizar" onclick="atualizar()" disabled>⬆ Atualizar</button>
          <button id="btn-voltar" class="secondary" onclick="voltar()" disabled>↩ Voltar pra versão anterior</button>
        </div>
      </section>
```

No `<script>`, em `refreshAll` acrescentar `fetchJson('/health')` ao `Promise.all` (6ª posição, variável `h`) e `renderAtualizacao(h);`. Funções novas:

```js
      function renderAtualizacao(h) {
        $('atualizacao').innerHTML =
          fmtField('Versão instalada', `v${h.versao}`) +
          fmtField('Versão disponível', h.versaoDisponivel ? `<span class="pill green">v${h.versaoDisponivel}</span>` : 'nenhuma') +
          fmtField('Líder', h.lider ? '<span class="pill green">SIM</span>' : `<span class="pill red">NÃO</span> ${h.outraMaquina ? '(' + h.outraMaquina + ')' : ''}`) +
          (h.versaoRejeitada ? fmtField('Versão rejeitada', `v${h.versaoRejeitada} (caiu 3× — voltou)`) : '') +
          (h.erroLancador ? `<pre class="error">Lançador: ${h.erroLancador}</pre>` : '') +
          (h.ultimaSaida ? fmtField('Última saída', `${h.ultimaSaida.motivo} em ${new Date(h.ultimaSaida.em).toLocaleString('pt-BR')}`) : '') +
          (h.aviso ? `<pre class="error">${h.aviso}</pre>` : '');
        $('btn-atualizar').disabled = !h.versaoDisponivel;
        $('btn-atualizar').textContent = h.versaoDisponivel ? `⬆ Atualizar pra v${h.versaoDisponivel}` : '⬆ Atualizar';
        $('btn-voltar').disabled = !h.prevExiste;
      }

      async function comPin(url) {
        const pin = prompt('PIN do painel (6 dígitos):');
        if (!pin) return;
        const r = await fetchJson(url, { method: 'POST', headers: { 'X-Wader-Pin': pin } });
        if (r.ok) alert('Confirmado. O Wader vai reiniciar — esta página volta sozinha em ~10 s.');
        else alert('Recusado: ' + (r.message || r.error || r.httpStatus));
        await refreshAll();
      }
      function atualizar() { return comPin('/api/admin/atualizar'); }
      function voltar() { if (confirm('Voltar pra versão anterior?')) return comPin('/api/admin/voltar'); }
```

Verificação manual: `cd apps/wader && WADER_UI_ONLY=1 npm start` (bash) e abrir `http://127.0.0.1:8043/admin` — cartão aparece, botões desabilitados (sem release nova e sem `.prev`); `curl -s http://127.0.0.1:8043/health` devolve as 13 chaves da fixture com `schema: 1`.

- [ ] **Step 10: Commit**

```bash
git add apps/wader/src/lib/estado.ts apps/wader/src/lib/release.ts apps/wader/src/lib/release.test.ts apps/wader/src/lib/pin.ts apps/wader/src/lib/pin.test.ts apps/wader/src/lib/aviso.ts apps/wader/src/lib/aviso.test.ts apps/wader/src/ui/health.ts apps/wader/src/ui/health.test.ts apps/wader/installer/tests/health-exemplo.json apps/wader/src/ui/api/atualizacao.ts apps/wader/src/ui/api/atualizacao.test.ts apps/wader/src/config/types.ts apps/wader/src/config/load.ts apps/wader/wader.config.example.json apps/wader/src/ui/server.ts apps/wader/src/ui/pages/admin.html apps/wader/src/index.ts
git commit -m "feat(wader): atualizacao com ok — releases/latest, botoes /admin com PIN+Origin, /health schema 1 com aviso calculado no exe"
```

---

### Task 6: `wader-aviso.ps1` (toast) + registro da tarefa agendada

**Files:**
- Create: `apps/wader/installer/wader-aviso.ps1`, `apps/wader/installer/registrar-aviso.ps1`
- Create: `apps/wader/installer/tests/wader-aviso.Tests.ps1`

**Interfaces:**
- Consumes: `GET http://127.0.0.1:8043/health` com `versao` e `aviso` (contrato `schema: 1`, fixture `health-exemplo.json` da Task 5).
- Produces: `wader-aviso.ps1 [-Url] [-IntervaloSeg]` (loop; dot-source expõe `Decidir-Toasts`); `registrar-aviso.ps1 -Instalar <caminho do wader-aviso.ps1>` / `-Remover` (tarefa agendada `Wader-Aviso`, ao logon de qualquer usuário). A Task 7 chama os dois pelo Inno.

- [ ] **Step 1: Teste Pester da decisão do toast**

`apps/wader/installer/tests/wader-aviso.Tests.ps1`:

```powershell
BeforeAll {
  . (Join-Path $PSScriptRoot '..\wader-aviso.ps1')   # dot-source: define funcoes, nao entra no loop
  $script:Fixture = Get-Content (Join-Path $PSScriptRoot 'health-exemplo.json') -Raw | ConvertFrom-Json
  function Novo-Estado { @{ aviso = $null; falhas = 0; parado = $false } }
}

Describe 'Decidir-Toasts' {
  It 'le os campos do contrato (schema 1): versao e aviso existem na fixture' {
    $script:Fixture.schema | Should -Be 1
    $script:Fixture.PSObject.Properties.Name | Should -Contain 'versao'
    $script:Fixture.PSObject.Properties.Name | Should -Contain 'aviso'
  }
  It 'aviso novo -> um toast com o texto; mesmo aviso de novo -> nada' {
    $e = Novo-Estado
    (Decidir-Toasts $script:Fixture $e) | Should -Be @($script:Fixture.aviso)
    @(Decidir-Toasts $script:Fixture $e).Count | Should -Be 0
  }
  It 'aviso volta a null -> nada (nao avisa "tudo bem")' {
    $e = Novo-Estado
    Decidir-Toasts $script:Fixture $e | Out-Null
    $h = $script:Fixture.PSObject.Copy(); $h.aviso = $null
    @(Decidir-Toasts $h $e).Count | Should -Be 0
  }
  It 'duas leituras sem resposta -> "Wader parado" uma vez; voltou -> "Wader de volta (vX)"' {
    $e = Novo-Estado
    @(Decidir-Toasts $null $e).Count | Should -Be 0
    (Decidir-Toasts $null $e) | Should -Be @('Wader parado')
    @(Decidir-Toasts $null $e).Count | Should -Be 0
    $t = Decidir-Toasts $script:Fixture $e
    $t[0] | Should -Be 'Wader de volta (v1.0.0)'
    $t[1] | Should -Be $script:Fixture.aviso
  }
}
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
powershell -NoProfile -Command "Invoke-Pester -Path apps/wader/installer/tests/wader-aviso.Tests.ps1 -Output Detailed"
```

Expected: falha ao dot-source (arquivo não existe).

- [ ] **Step 3: Escrever o aviso**

`apps/wader/installer/wader-aviso.ps1` (ASCII puro):

```powershell
# ====================================================================
# wader-aviso.ps1 -- toast do Windows na sessao do usuario (spec A, secao 9)
# ====================================================================
# Roda como tarefa agendada ao logon (registrar-aviso.ps1). A cada 30 s le
# /health. A REGRA mora no exe (campo `aviso`); aqui so se mostra texto:
#   - texto de `aviso` mudou (e nao e nulo) -> toast com esse texto
#   - duas leituras sem resposta -> "Wader parado"; voltou -> "Wader de volta (vX)"
# ASCII PURO (PowerShell 5.1). Dot-source (". .\wader-aviso.ps1") so define
# as funcoes -- e assim que o Pester testa.
# ====================================================================
param(
  [string]$Url = 'http://127.0.0.1:8043/health',
  [int]$IntervaloSeg = 30
)

$script:AppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'

function Show-Toast([string]$Titulo, [string]$Texto) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    $t = [System.Security.SecurityElement]::Escape($Titulo)
    $x = [System.Security.SecurityElement]::Escape($Texto)
    $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
    $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>$t</text><text>$x</text></binding></visual></toast>")
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($script:AppId).Show($toast)
  } catch {
    Write-Host "toast falhou: $($_.Exception.Message)"
  }
}

function Get-Health([string]$Url) {
  try { Invoke-RestMethod -Uri $Url -TimeoutSec 3 } catch { $null }
}

# Decide o que mostrar e atualiza $Estado (hashtable: aviso, falhas, parado).
# Devolve array de textos (pode ser vazio).
function Decidir-Toasts($Health, $Estado) {
  $out = @()
  if ($null -eq $Health) {
    $Estado.falhas = [int]$Estado.falhas + 1
    if ($Estado.falhas -eq 2) { $out += 'Wader parado'; $Estado.parado = $true }
    return ,$out
  }
  $Estado.falhas = 0
  if ($Estado.parado) { $out += "Wader de volta (v$($Health.versao))"; $Estado.parado = $false }
  $aviso = $Health.aviso
  if ([string]$aviso -ne [string]$Estado.aviso) {
    $Estado.aviso = $aviso
    if ($aviso) { $out += [string]$aviso }
  }
  return ,$out
}

if ($MyInvocation.InvocationName -ne '.') {
  $estado = @{ aviso = $null; falhas = 0; parado = $false }
  while ($true) {
    $h = Get-Health $Url
    foreach ($texto in (Decidir-Toasts $h $estado)) { Show-Toast 'Wader' $texto }
    Start-Sleep -Seconds $IntervaloSeg
  }
}
```

`apps/wader/installer/registrar-aviso.ps1` (ASCII puro):

```powershell
# registrar-aviso.ps1 -- cria/remove a tarefa agendada "Wader-Aviso"
# (ao logon de QUALQUER usuario, sem janela). Chamado pelo instalador Inno.
param(
  [string]$Instalar,   # caminho completo do wader-aviso.ps1
  [switch]$Remover
)
$ErrorActionPreference = 'Stop'
$nome = 'Wader-Aviso'
Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
if ($Remover) { Write-Host "tarefa $nome removida"; exit 0 }
if (-not $Instalar) { throw 'use -Instalar <caminho do wader-aviso.ps1> ou -Remover' }
$acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Instalar`""
$gatilho = New-ScheduledTaskTrigger -AtLogOn
# BUILTIN\Users (S-1-5-32-545) = roda na sessao de quem logar, sem privilegio
$principal = New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Limited
$cfg = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Principal $principal -Settings $cfg | Out-Null
Write-Host "tarefa $nome registrada"
```

- [ ] **Step 4: Rodar Pester (os dois arquivos) e ver passar**

```powershell
powershell -NoProfile -Command "Invoke-Pester -Path apps/wader/installer/tests -Output Detailed"
```

Expected: `Tests Passed: 8, Failed: 0`.

- [ ] **Step 5: Ensaio manual do toast nesta máquina**

Com o Wader rodando (`WADER_UI_ONLY=1 npm start`), em PowerShell 5.1:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps\wader\installer\wader-aviso.ps1 -IntervaloSeg 5
```

Parar o Wader (Ctrl+C) → em ≤ 10 s aparece o toast "Wader parado"; subir de novo → "Wader de volta (v1.0.0)". Ctrl+C no script. (Se o toast não aparecer: Configurações → Sistema → Notificações, "Windows PowerShell" tem que estar permitido.)

- [ ] **Step 6: Commit**

```bash
git add apps/wader/installer/wader-aviso.ps1 apps/wader/installer/registrar-aviso.ps1 apps/wader/installer/tests/wader-aviso.Tests.ps1
git commit -m "feat(wader): wader-aviso.ps1 — toast le o aviso do /health (schema 1); tarefa agendada ao logon (Pester 8/8)"
```

---

### Task 7: WinSW xml + Inno Setup + `migrar-medcardio.ps1` + workflow de release

**Files:**
- Create: `apps/wader/installer/wader-service.xml`, `apps/wader/installer/wader.iss`
- Create: `apps/wader/scripts/migrar-medcardio.ps1`
- Delete: `apps/wader/scripts/update-wader.ps1`
- Create: `.github/workflows/wader-release.yml`
- Modify: `apps/wader/README.md` (seção "Instalação na clínica", 10 linhas)

**Interfaces:**
- Consumes: `build/wader.exe` (Task 1), `wader-launch.ps1` (Task 2), `wader-aviso.ps1` + `registrar-aviso.ps1` (Task 6), Pester em `installer/tests` (Tasks 2 e 6).
- Produces: release do GitHub com `Wader-Setup-vX.Y.Z.exe`, `wader.exe`, `wader.exe.sha256` — o formato que `release.ts` (Task 5) e o lançador (Task 2) esperam. `C:\ProgramData\Wader\wader.config.json` com `wsId`, `agentId`, `adminPin`, `firebase.serviceAccountPath`, `orthanc.worklistPath`.

- [ ] **Step 1: `wader-service.xml` (WinSW 2.12.0 — sintaxe conferida na doc v2.12.0)**

`apps/wader/installer/wader-service.xml`:

```xml
<service>
  <id>Wader</id>
  <name>Wader</name>
  <description>Agente local DICOM do LEO: le o Orthanc e sobe imagens e medidas pra nuvem.</description>

  <!-- O servico roda o LANCADOR; o lancador aplica atualizacao/rollback e so entao sobe o wader.exe (spec A, secao 4). %BASE% = pasta deste exe. -->
  <executable>powershell.exe</executable>
  <arguments>-NoProfile -ExecutionPolicy Bypass -File "%BASE%\wader-launch.ps1"</arguments>
  <workingdirectory>C:\ProgramData\Wader</workingdirectory>
  <startmode>Automatic</startmode>
  <stopparentprocessfirst>true</stopparentprocessfirst>

  <!-- Escada, nao loop: 10 s, 1 min, 10 min; zera apos 1 h de vida (Codex 2). -->
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="1 min"/>
  <onfailure action="restart" delay="10 min"/>
  <resetfailure>1 hour</resetfailure>

  <!-- Conta embutida, sem senha, sem admin, com rede (Codex 1). -->
  <serviceaccount>
    <domain>NT AUTHORITY</domain>
    <user>NetworkService</user>
  </serviceaccount>

  <!-- Sem isto o logger tenta pino-pretty e o exe cai na subida (Ruflo 1). -->
  <env name="NODE_ENV" value="production"/>

  <logpath>C:\ProgramData\Wader\logs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
</service>
```

(Os logs saem como `wader-service.out.log` / `wader-service.err.log` — o WinSW usa o nome do exe renomeado.)

- [ ] **Step 2: Inno Setup `wader.iss`**

`apps/wader/installer/wader.iss`:

```iss
; Wader-Setup — instalador generico (nao sabe nada da MedCardio). Spec Fase A, secao 10.
; Compilar: iscc /Q /DVersao=1.0.0 wader.iss   (OutputDir = ..\build)
#ifndef Versao
  #define Versao "0.0.0"
#endif

[Setup]
AppId={{7D3B2E1A-5C44-4B7F-9A61-0F2E8C1D4A90}
AppName=Wader
AppVersion={#Versao}
AppPublisher=LEO
DefaultDirName={autopf}\Wader
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\build
OutputBaseFilename=Wader-Setup-v{#Versao}
Compression=lzma2
SolidCompression=yes
CloseApplications=no
UninstallDisplayName=Wader

[Files]
Source: "..\build\wader.exe";         DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\wader-service.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "wader-service.xml";          DestDir: "{app}"; Flags: ignoreversion
Source: "wader-launch.ps1";           DestDir: "{app}"; Flags: ignoreversion
Source: "wader-aviso.ps1";            DestDir: "{app}"; Flags: ignoreversion
Source: "registrar-aviso.ps1";        DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Dados sobrevivem a desinstalar/reinstalar. NetworkService precisa escrever aqui.
Name: "{commonappdata}\Wader";         Permissions: admins-full networkservice-modify
Name: "{commonappdata}\Wader\updates"
Name: "{commonappdata}\Wader\logs"

[Run]
; Atualizacao por cima: para o servico antes de trocar arquivos (ignora erro se nao existe).
Filename: "{app}\wader-service.exe"; Parameters: "stop";    Flags: runhidden waituntilterminated; Check: ServicoExiste; BeforeInstall: Nada
Filename: "{app}\wader-service.exe"; Parameters: "install"; Flags: runhidden waituntilterminated; Check: not ServicoExiste
Filename: "{app}\wader-service.exe"; Parameters: "start";   Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\registrar-aviso.ps1"" -Instalar ""{app}\wader-aviso.ps1"""; Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "{app}\wader-service.exe"; Parameters: "stop";      Flags: runhidden waituntilterminated; RunOnceId: "parar"
Filename: "{app}\wader-service.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "desinstalar"
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\registrar-aviso.ps1"" -Remover"; Flags: runhidden waituntilterminated; RunOnceId: "aviso"

[Code]
var
  PgDados: TInputQueryWizardPage;
  PgSa: TInputFileWizardPage;
  Primeira: Boolean;

function ConfigPath: String;
begin
  Result := ExpandConstant('{commonappdata}\Wader\wader.config.json');
end;

function ServicoExiste: Boolean;
var R: Integer;
begin
  // `sc query Wader` devolve 0 se existe, 1060 se nao
  Result := Exec('sc.exe', 'query Wader', '', SW_HIDE, ewWaitUntilTerminated, R) and (R = 0);
end;

procedure Nada; begin end;

procedure InitializeWizard;
begin
  Primeira := not FileExists(ConfigPath);
  PgDados := CreateInputQueryPage(wpSelectDir, 'Dados da clinica', 'Primeira instalacao',
    'Estes dados vao para C:\ProgramData\Wader\wader.config.json. Podem ser editados depois.');
  PgDados.Add('Workspace do LEO (wsId):', False);
  PgDados.Add('Pasta de worklists do Orthanc (ex.: C:\Orthanc\worklists):', False);
  PgDados.Add('PIN do painel de atualizacao (6 digitos):', True);
  PgSa := CreateInputFilePage(PgDados.ID, 'Credencial do Firebase', 'Arquivo sa.json',
    'Escolha o sa.json da clinica. Ele sera copiado para C:\ProgramData\Wader com acesso restrito.');
  PgSa.Add('Arquivo sa.json:', 'JSON|*.json', '.json');
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := (not Primeira) and ((PageID = PgDados.ID) or (PageID = PgSa.ID));
end;

function NextButtonClick(PageID: Integer): Boolean;
begin
  Result := True;
  if PageID = PgDados.ID then
    if (Trim(PgDados.Values[0]) = '') or (Trim(PgDados.Values[1]) = '') or (Length(PgDados.Values[2]) <> 6) then begin
      MsgBox('Preencha wsId, pasta de worklists e um PIN de 6 digitos.', mbError, MB_OK);
      Result := False;
    end;
  if (PageID = PgSa.ID) and (not FileExists(PgSa.Values[0])) then begin
    MsgBox('sa.json nao encontrado.', mbError, MB_OK);
    Result := False;
  end;
end;

function Json(const S: String): String;
begin
  Result := S;
  StringChangeEx(Result, '\', '\\', True);
  StringChangeEx(Result, '"', '\"', True);
end;

procedure EscreverConfig;
var
  SaDest, Wl, Agent, J: String;
  R: Integer;
begin
  SaDest := ExpandConstant('{commonappdata}\Wader\sa.json');
  Wl := Trim(PgDados.Values[1]);
  Agent := Lowercase(GetComputerNameString) + '-' + IntToStr(1000 + Random(9000));
  FileCopy(PgSa.Values[0], SaDest, False);
  // sa.json: so Administrators, SYSTEM e NetworkService (SIDs: Windows pt-BR traduz nomes)
  Exec('icacls.exe', '"' + SaDest + '" /inheritance:r /grant:r *S-1-5-32-544:F *S-1-5-18:F *S-1-5-20:R', '', SW_HIDE, ewWaitUntilTerminated, R);
  // pasta de worklists do Orthanc: NetworkService precisa escrever .wl
  Exec('icacls.exe', '"' + Wl + '" /grant *S-1-5-20:(OI)(CI)M', '', SW_HIDE, ewWaitUntilTerminated, R);
  J := '{' + #13#10 +
    '  "version": "1.0",' + #13#10 +
    '  "wsId": "' + Json(Trim(PgDados.Values[0])) + '",' + #13#10 +
    '  "agentId": "' + Agent + '",' + #13#10 +
    '  "adminPin": "' + PgDados.Values[2] + '",' + #13#10 +
    '  "firebase": { "serviceAccountPath": "' + Json(SaDest) + '", "projectId": "leo-sistema-laudos" },' + #13#10 +
    '  "orthanc": { "worklistPath": "' + Json(Wl) + '" },' + #13#10 +
    '  "ui": { "port": 8043 }' + #13#10 +
    '}' + #13#10;
  SaveStringToFile(ConfigPath, J, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and Primeira then EscreverConfig;
end;
```

Compilar localmente pra validar a sintaxe (Inno 6 instalado? senão `choco install innosetup -y`):

```powershell
cd apps\wader; npm run build; npm run pkg
Invoke-WebRequest https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe -OutFile build\wader-service.exe
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /Q /DVersao=0.0.1 installer\wader.iss
```

Expected: `build\Wader-Setup-v0.0.1.exe` gerado, sem erro de compilação.

- [ ] **Step 3: Ensaio da instalação nesta máquina (spec §13)**

1. Rodar `build\Wader-Setup-v0.0.1.exe` como admin (SmartScreen → "Mais informações → Executar assim mesmo"). Preencher `wader-dev`, a pasta de worklists local, PIN `123456`, o `sa.json` do dev.
2. `Get-Service Wader` → `Running`. `Get-Content C:\ProgramData\Wader\logs\wader-service.out.log -Tail 20` → "Sou o líder", "UI server iniciado". `curl -s http://127.0.0.1:8043/health` → `schema: 1`.
3. **Matar e ver levantar:** `Stop-Process -Name wader -Force` → em ~10 s `Get-Service Wader` volta a `Running`; `lancador.json` tem `quedasSeguidas: 1`.
4. **Vigia:** não há como travar o tick de fora; o teste unitário cobre. (Opcional: apontar `integracoes/orthanc.url` do `wader-dev` pra um IP que não responde e ver `aviso: "Wader sem Orthanc"` no `/health` após 5 min.)
5. **Toast:** fazer logoff/logon (a tarefa dispara ao logon) ou `Start-ScheduledTask Wader-Aviso`; `Stop-Service Wader` → toast "Wader parado"; `Start-Service Wader` → "Wader de volta".
6. **Desinstalar** pelo Painel de Controle → serviço some, tarefa some, `C:\ProgramData\Wader` continua.

Anotar no ADR qualquer desvio (ex.: WinSW recusou NetworkService → `sc config Wader obj= "NT AUTHORITY\NetworkService"` como contorno).

- [ ] **Step 4: `migrar-medcardio.ps1` (visita; dry-run por padrão) e apagar `update-wader.ps1`**

`apps/wader/scripts/migrar-medcardio.ps1` (ASCII puro):

```powershell
# ====================================================================
# migrar-medcardio.ps1 -- visita unica: C:\Wader (npm start) -> ProgramData
# ====================================================================
# Rodar ANTES do Wader-Setup, como admin. Dry-run por padrao; -Commit executa.
#   1. mata o node.exe que roda "tsx src/index" e ESPERA sumir (ate 30 s)
#   2. copia wader.config.json, sa.json, .wader-ingest-state.json -> ProgramData
#      (ignora wader.config.local.json: load.ts da precedencia a ele)
#   3. reescreve firebase.serviceAccountPath; mantem agentId (wader-001);
#      pede adminPin se faltar; da permissao de escrita na pasta de worklists
#   4. C:\Wader fica INTACTO como rollback ate o Sergio apagar
# ASCII PURO (PowerShell 5.1).
# ====================================================================
param(
  [string]$Origem  = 'C:\Wader',
  [string]$Destino = 'C:\ProgramData\Wader',
  [switch]$Commit
)
$ErrorActionPreference = 'Stop'
$modo = if ($Commit) { 'COMMIT' } else { 'DRY-RUN (use -Commit para executar)' }
Write-Host "=== migrar-medcardio [$modo] ===" -ForegroundColor Cyan

foreach ($f in 'wader.config.json', 'sa.json') {
  if (-not (Test-Path (Join-Path $Origem $f))) { throw "Nao achei $Origem\$f" }
}

# 1. mata o Wader antigo
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*tsx*src*index*' }
foreach ($p in $procs) {
  Write-Host "1. matar node PID $($p.ProcessId)"
  if ($Commit) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
}
if ($Commit -and $procs) {
  $t = 0
  while ($t -lt 30 -and (Get-Process -Id ($procs | ForEach-Object ProcessId) -ErrorAction SilentlyContinue)) { Start-Sleep 1; $t++ }
  if ($t -ge 30) { throw 'node.exe do Wader nao morreu em 30 s' }
}

# 2. copia
Write-Host "2. copiar config/sa/cursor -> $Destino"
if ($Commit) { New-Item -ItemType Directory -Force $Destino, "$Destino\updates", "$Destino\logs" | Out-Null }
foreach ($f in 'wader.config.json', 'sa.json', '.wader-ingest-state.json') {
  $src = Join-Path $Origem $f
  if (Test-Path $src) {
    Write-Host "   $f"
    if ($Commit) { Copy-Item -Force $src (Join-Path $Destino $f) }
  }
}

# 3. reescreve config
$cfgPath = Join-Path $Origem 'wader.config.json'
$cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
$cfg.firebase.serviceAccountPath = Join-Path $Destino 'sa.json'
if (-not $cfg.agentId) { $cfg | Add-Member -NotePropertyName agentId -NotePropertyValue 'wader-001' -Force }
if (-not $cfg.adminPin) {
  $pin = Read-Host 'PIN do painel de atualizacao (6 digitos)'
  if ($pin -notmatch '^\d{6}$') { throw 'PIN precisa ter 6 digitos' }
  $cfg | Add-Member -NotePropertyName adminPin -NotePropertyValue $pin -Force
}
Write-Host "3. config: serviceAccountPath=$($cfg.firebase.serviceAccountPath) agentId=$($cfg.agentId) worklistPath=$($cfg.orthanc.worklistPath)"
if ($Commit) {
  $cfg | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $Destino 'wader.config.json') -Encoding UTF8
  icacls (Join-Path $Destino 'sa.json') /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' '*S-1-5-20:R' | Out-Null
  icacls $Destino /grant '*S-1-5-20:(OI)(CI)M' | Out-Null
  icacls $cfg.orthanc.worklistPath /grant '*S-1-5-20:(OI)(CI)M' | Out-Null
}

Write-Host "4. $Origem fica intacto (rollback). Agora rode o Wader-Setup-vX.exe." -ForegroundColor Green
```

```bash
git rm apps/wader/scripts/update-wader.ps1
```

Dry-run de sanidade nesta máquina (não há `C:\Wader`): `powershell -NoProfile -File apps/wader/scripts/migrar-medcardio.ps1 -Origem C:\nao-existe` → Expected: `Nao achei C:\nao-existe\wader.config.json`.

- [ ] **Step 5: Workflow de release (primeiro CI do repo)**

`.github/workflows/wader-release.yml`:

```yaml
name: wader-release

on:
  push:
    tags: ['wader-v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: windows-latest
    defaults:
      run:
        working-directory: apps/wader
        shell: pwsh
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: apps/wader/package-lock.json

      - name: Tag tem que bater com package.json
        run: |
          $tag = $env:GITHUB_REF_NAME -replace '^wader-v', ''
          $pkg = (Get-Content package.json -Raw | ConvertFrom-Json).version
          if ($tag -ne $pkg) { throw "tag wader-v$tag != package.json $pkg" }
          "VERSAO=$tag" | Out-File -Append $env:GITHUB_ENV

      - run: npm ci
      - run: npm test

      - name: Pester (Windows PowerShell 5.1, o da clinica)
        shell: powershell
        run: Invoke-Pester -Path installer/tests -CI

      - run: npm run build
      - run: npm run pkg

      - name: WinSW 2.12.0
        run: Invoke-WebRequest https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe -OutFile build/wader-service.exe

      - name: Inno Setup
        run: |
          choco install innosetup -y --no-progress
          & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /Q "/DVersao=$env:VERSAO" installer\wader.iss

      - name: SHA-256 do wader.exe
        run: |
          $h = (Get-FileHash build/wader.exe -Algorithm SHA256).Hash.ToLower()
          Set-Content -Path build/wader.exe.sha256 -Value "$h  wader.exe" -Encoding ascii -NoNewline

      - uses: softprops/action-gh-release@v2
        with:
          files: |
            apps/wader/build/Wader-Setup-v${{ env.VERSAO }}.exe
            apps/wader/build/wader.exe
            apps/wader/build/wader.exe.sha256
          generate_release_notes: true
```

- [ ] **Step 6: README (seção curta) e commit**

Em `apps/wader/README.md`, trocar o bloco "O que NÃO está pronto" por:

```markdown
## Instalação na clínica (Fase A, 10/2026)

Serviço do Windows + atualização com um clique. Spec: `docs/superpowers/specs/2026-10-11-wader-fase-a-design.md`.

1. Baixar `Wader-Setup-vX.Y.Z.exe` da release `wader-vX.Y.Z` no GitHub.
2. Clínica que já roda o Wader antigo em `C:\Wader`: antes, `scripts\migrar-medcardio.ps1 -Commit` como admin.
3. Rodar o Setup (SmartScreen → "Mais informações → Executar assim mesmo"). Primeira vez pede wsId, pasta de worklists, PIN e `sa.json`.
4. Conferir `http://127.0.0.1:8043/admin` → cartão "Atualização".

Dados em `C:\ProgramData\Wader` (sobrevivem a desinstalar). Logs em `C:\ProgramData\Wader\logs`.
```

```bash
git add apps/wader/installer/wader-service.xml apps/wader/installer/wader.iss apps/wader/scripts/migrar-medcardio.ps1 .github/workflows/wader-release.yml apps/wader/README.md
git commit -m "feat(wader): WinSW xml (NetworkService, escada 10s/1m/10m), Inno Setup generico, migrar-medcardio.ps1 (dry-run), workflow wader-release; update-wader.ps1 morre"
```

---

### Task 8: Scripts da clínica + tríade + ADR + release `wader-v1.0.0`

**Files:**
- Create: `apps/wader/scripts/promover-pendentes.ts`, `add-procmap-faltantes.ts`, `feegow-diag-nome.ts`, `diag-paciente-hoje.ts` (**só se** o Claude da clínica entregou a branch `claude/scripts-clinica` — em 11/10 ela **não existe** no `origin`)
- Modify: `docs/decisoes/2026-10-11-wader-fase-a-decisao.md`, `docs/decisoes/INDEX.md`
- Create (Obsidian): `Leo/Decisões/2026-10-XX Wader Fase A.md`
- Memória local: `project_wader_fase_a.md`

**Interfaces:**
- Consumes: tudo das Tasks 1–7 mergeado numa branch `claude/wader-fase-a`.
- Produces: release `wader-v1.0.0` publicada pelo CI; ADR com status NO AR / pendências da visita.

- [ ] **Step 1: Scripts da clínica (spec §11)**

```bash
git fetch origin && git branch -r | grep scripts-clinica
```

Se existir: `git checkout origin/claude/scripts-clinica -- apps/wader/scripts/promover-pendentes.ts apps/wader/scripts/add-procmap-faltantes.ts apps/wader/scripts/feegow-diag-nome.ts apps/wader/scripts/diag-paciente-hoje.ts`. Conferir em cada um: (a) sem `--commit` nos `process.argv` **nada grava** (só imprime o que faria); (b) usa `loadConfig()` + `initFirebase` como `scripts/reprocessar-legado.ts`; (c) não tem CPF/nome de paciente hard-coded. Adicionar ao `package.json` do Wader um script por arquivo (`"promover-pendentes": "tsx scripts/promover-pendentes.ts"`, etc.). Rodar cada um sem `--commit` contra `wader-dev`: Expected: imprime plano e sai 0.

Se **não** existir: registrar no ADR "scripts da clínica: dependência não entregue (branch `claude/scripts-clinica` ausente em DD/MM); entram num commit à parte quando chegarem" e seguir.

- [ ] **Step 2: Suíte inteira verde**

```bash
cd apps/wader && npm run typecheck && npm test && cd ../.. && npm run typecheck && npm run test:unit 2>&1 | tail -3
powershell -NoProfile -Command "Invoke-Pester -Path apps/wader/installer/tests -CI"
```

Expected: tudo limpo. Anotar os números (vitest N, Pester 8, unit do LEO).

- [ ] **Step 3: Tríade pré-merge (feedback_triade_pre_merge: obrigatória)**

Três revisões independentes sobre `git diff master...claude/wader-fase-a`, cada uma instruída a NÃO repetir as outras:

1. **Codex** (bugs/segurança/edge cases, verificação adversarial — tenta refutar cada correção). MCP do Codex falhou em 11/10: contorno `codex exec` no terminal com o diff num arquivo. Pontos a pedir explicitamente: corrida entre `sairDepois` (300 ms) e um segundo clique; `lancador.json` corrompido; `pedido.json` com `atualizar` de versão que não foi baixada; PIN em `prompt()` do navegador (fica no histórico? não — mas dizer); `Origin: null`; perda de liderança durante upload de imagem.
2. **Ruflo reviewer** (`ruflo-core:reviewer`, arquitetura/fronteiras): donos dos dois JSON respeitados? Só `lider.ts` escreve `lider`? Workers continuam sem saber de líder? `/health` é o único contrato do `.ps1`?
3. **Ponytail** (`ponytail:ponytail-review`, o que deletar): `estado.ts` vale a pena ou cabe em `index.ts`? `registrar-aviso.ps1` separado ou inline no iss? `ServicoExiste` no Inno?

Achados críticos → onda de fix + re-verificação (Step 2 de novo). Cada achado atendido/recusado vai pro ADR com uma linha.

- [ ] **Step 4: ADR, INDEX, Obsidian, memória**

Em `docs/decisoes/2026-10-11-wader-fase-a-decisao.md` acrescentar seção "Implementação (Tasks 1–8)": commit por tarefa, resultado da PoC (já do Task 1), decisão D1 (cartão do LEO mostra o líder), desvios do ensaio (Task 7 Step 3), tríade (achados/fixes), números dos testes, e **pendências da visita**: `migrar-medcardio.ps1 -Commit` → `Wader-Setup`; senha do Orthanc no histórico público (10 min, mesma visita); confirmar commit em `C:\Wader` antes de apagar; `feat/wader-console` segue independente.

`docs/decisoes/INDEX.md`: trocar a linha da Fase A por status "implementada — branch `claude/wader-fase-a`, aguarda aval pra merge + tag".

Obsidian (`C:\Users\sergi\OneDrive\Documentos\Obsidian Vault\Leo\Decisões\`): nota curta espelhando o ADR; atualizar `Leo/Leo - Visão Geral.md` (Wader: de `npm start` pra serviço + atualização com ok). Memória local `project_wader_fase_a.md`: status + pendências.

```bash
git add docs/decisoes/2026-10-11-wader-fase-a-decisao.md docs/decisoes/INDEX.md
git commit -m "docs(ADR): Wader Fase A implementada — triade, D1 lider no cartao, pendencias da visita"
```

- [ ] **Step 5: Merge + release (pede ok do Sergio: push na master e tag)**

Apresentar ao Sergio: branch, resumo em tabela (dor → o que mudou), números dos testes, achados da tríade. Com o ok:

```bash
git checkout master && git merge --no-ff claude/wader-fase-a -m "Merge claude/wader-fase-a — Wader como servico do Windows, atualizacao com ok, cadeado de lider, aviso na tela (triade Codex/Ruflo/Ponytail, aval Sergio DD/MM)"
git push origin master
git tag wader-v1.0.0 && git push origin wader-v1.0.0
```

Acompanhar `gh run watch` (ou a aba Actions): Expected: job verde e release `wader-v1.0.0` com 3 assets. Baixar `Wader-Setup-v1.0.0.exe` nesta máquina, instalar por cima do ensaio da Task 7 (config preservada — wizard pulado), `curl -s http://127.0.0.1:8043/version` → `1.0.0`.

- [ ] **Step 6: Ensaio da atualização de verdade (spec §13)**

Subir `version` pra `1.0.1` no `package.json` (commit `chore(wader): 1.0.1 — ensaio de atualização`), com ok do Sergio `git push origin master && git tag wader-v1.0.1 && git push origin wader-v1.0.1`. Quando a release sair: em ≤ 1 h (ou reiniciar o serviço pra forçar a checagem) o `/admin` mostra "Atualizar pra v1.0.1"; clicar, PIN → serviço reinicia → `/version` = `1.0.1`, `wader.exe.prev` existe → botão "Voltar" → `/version` = `1.0.0`, `/health.versaoRejeitada` = `null` (rollback manual não rejeita). Registrar no ADR com horários. A clínica recebe a `1.0.1` na visita, já com o botão.

---

## Self-review (feito ao escrever o plano)

**Cobertura da spec:** §2 pastas → T7 (iss/xml) · §3 serviço/códigos → T2 + T7 · §4 lançador → T2 · §5 atualização/PIN/Origin/versão → T5 (+ T1 versão) · §6 vigia → T3 · §7 cadeado/identidade/`conflito` → T4 · §8 batimento → T4 + T5 (`campos`) · §9 aviso → T5 (regra) + T6 (toast) · §10 release/build/Inno/migração → T1 + T7 · §11 scripts → T8 (dependência externa marcada) · §12 situações: sem internet (cadeado expira → sai 3 → reinicia e tenta; T4), Orthanc fora (aviso, T5), SHA ≠ (T2), 3 quedas (T2), config inválida (código 2, T2), porta ocupada (código 2, T2) · §13 testes: unit em T2–T5, Pester em T2/T6, PoC T1, ensaio T7/T8 · §14 riscos: plano B em T1.

**Fora do plano, de propósito:** `restarts24h` não existe (corte Codex 9); `iniciadoEm`/`motivoUltimaSaida` soltos não vão pro batimento (corte Ponytail 3) — `iniciadoEm` só vive no `EstadoWader` como base do aviso de Orthanc; migração de `.wader-ingest-state.json` por cópia (ADR 2026-05-18).

**Consistência de nomes entre tarefas:** `CODIGO.{CONFIG,VIGIA,ATUALIZACAO}` e `sairCom` (T2) usados em T3/T4/T5 · `getUltimoTickOkEm`/`getUltimoOrthancOkEm` (T3) usados em T4 (`subirWorkers`) e T5 (`estado`) · `iniciarLider(...).souLider/outraMaquina/parar` (T4) usados em T5 · `extras.agentId`/`extras.campos` do batimento (T4) preenchidos em T5 · `EstadoWader`/`ReleaseInfo` (T5) consumidos por `montarHealth`, `registerAtualizacaoRoutes` e `index.ts` · chaves do `/health` = `health-exemplo.json` = o que `wader-aviso.ps1` lê (`versao`, `aviso`) · `lancador.json.versaoAplicada` gravado pelo lançador (T2) e lido só por ele; `versaoRejeitada`/`erro`/`ultimaSaida` lidos pelo exe via `lerLancador` (T2) → `estado.lancador` (T5) · nome dos assets `wader.exe`/`wader.exe.sha256` igual em `release.ts` (T5), lançador (T2) e workflow (T7).

**Decisões que a tríade/Sergio devem bater o martelo:** D1 (cartão do LEO mostra líder, perde "2 Waders" até a fase C); `agentId` gerado pelo instalador com 4 dígitos decimais em vez de 4 hex (Pascal do Inno sem `%x` confiável — mesma unicidade prática); saída 10 não conta como queda no lançador (não está na spec; evita rollback indevido quando o médico atualiza logo após subir); PIN pedido por `prompt()` do navegador (sem campo persistente na página).
