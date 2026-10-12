/**
 * Wader — Entry point.
 *
 * Orquestra o ciclo de vida completo do agente:
 *   1. Carrega configuração
 *   2. Inicia logger
 *   3. Sobe servidor web local (UI)
 *   4. Registra graceful shutdown (SIGINT/SIGTERM)
 */

import os from 'os';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadConfig, ConfigError } from './config/load';
import { logger, createLogger } from './logger';
import { CODIGO, sairCom, lerLancador, dirUpdates } from './lib/saida';
import { iniciarVigia } from './lib/vigia';
import type { EstadoWader } from './lib/estado';
import { baixarRelease, iniciarChecagemRelease } from './lib/release';
import { startUiServer } from './ui/server';
import { montarHealth } from './ui/health';
import { initFirebase, getDb } from './adapters/firebase';
import { iniciarLider } from './adapters/lider';
import { OrthancClient } from './adapters/orthanc-client';
import { WorkspaceRepo } from './adapters/workspace-repo';
import { iniciarBatimento } from './adapters/heartbeat';
import { validarWorklistPath } from './workers/worklist-path-validator';
import { WorklistSyncWorker } from './workers/worklist-sync-worker';
import { DicomIngestWorker } from './workers/dicom-ingest-worker';
import { AccRecoveryWorker } from './workers/acc-recovery-worker';
import type { FastifyInstance } from 'fastify';

const log = createLogger({ module: 'main' });

/**
 * Lê a versão real do código empacotado (apps/wader/package.json), não um
 * campo de config por-máquina que ninguém mantém (WaderConfig.version).
 *
 * package.json.json fica um nível acima de __dirname tanto rodando via
 * `tsx src/index.ts` (__dirname = src/) quanto compilado (__dirname =
 * dist/index.js, rootDir src → outDir dist espelham a mesma estrutura).
 * Sem "type": "module" no package.json do Wader (CommonJS), __dirname é
 * nativo — não precisa de import.meta.url.
 *
 * Não importamos o JSON direto (resolveJsonModule) porque package.json está
 * fora de rootDir ("./src") e isso quebra o build com TS6059.
 */
function lerVersaoPackage(): string {
  try {
    const pkgPath = join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch (err) {
    log.warn({ err }, 'Não foi possível ler versão do package.json, usando fallback');
    return '0.0.0';
  }
}

async function main(): Promise<void> {
  log.info('Wader iniciando…');

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

  // Modo UI-only (WADER_UI_ONLY=1): sobe servidor + console SEM os workers.
  // Permite rodar uma instância de DEV noutra porta sem dois Waders
  // processarem os mesmos exames (escrita dupla). Ver ADR 2026-06-26.
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

  const versao = lerVersaoPackage();
  const estado: EstadoWader = {
    versao,
    iniciadoEm: Date.now(),
    versaoDisponivel: null,
    souLider: () => lider?.souLider() ?? false,
    outraMaquina: () => lider?.outraMaquina() ?? null,
    ultimoOrthancOkEm: () => dicomWorker.getUltimoOrthancOkEm(),
    lancador,
    // .prev mora ao lado do exe (Program Files) e acompanha o nome real do binário, como o lançador.
    prevExiste: () => existsSync(process.execPath + '.prev'),
  };

  const subirWorkers = () => {
    estado.iniciadoEm = Date.now(); // base do aviso "sem Orthanc": quando virei líder, não o boot
    worklistWorker?.start();
    dicomWorker.start();
    accWorker.start();
    pararBatimento = iniciarBatimento(config.wsId, versao, workspaceRepo, orthancClient, {
      agentId: config.agentId,
      ultimoErroIngest: () => dicomWorker.getUltimoErro(),
      campos: () => {
        const h = montarHealth(estado);
        return { versaoDisponivel: h.versaoDisponivel, aviso: h.aviso, ultimaSaida: h.ultimaSaida, versaoRejeitada: h.versaoRejeitada };
      },
    });
    pararVigia = iniciarVigia({
      ultimoTickOkEm: () => dicomWorker.getUltimoTickOkEm(),
      ligado: () => dicomWorker.isRunning(),
      limiteMs: (config.polling.vigiaSeg ?? 300) * 1000,
      aoTravar: () => {
        log.fatal({ ultimoTickOkEm: dicomWorker.getUltimoTickOkEm() }, 'Ingestão travada — saindo pro serviço reiniciar');
        sairCom(CODIGO.VIGIA, { motivo: 'travado' });
      },
    });
  };

  const app = await startUiServer(config, {
    // UI-only nunca é dono dos workers: null restaura as guardas 409 worker_nao_configurado.
    worklistWorker: uiOnly ? null : worklistWorker,
    dicomWorker: uiOnly ? null : dicomWorker,
    orthancClient,
    workspaceRepo,
    estado,
    atualizacao: {
      release: () => estado.versaoDisponivel,
      baixar: baixarRelease,
      sair: sairCom,
      prevExiste: estado.prevExiste,
      dirUpdates,
    },
    souLider: () => lider?.souLider() ?? false,
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

  // Checagem de release a cada 1 h (spec §5). Sem rede (undefined) = silêncio: não apaga versão já achada.
  const pararRelease = iniciarChecagemRelease(versao, (info) => {
    if (info === undefined) return;
    if (info && estado.versaoDisponivel?.versao !== info.versao) log.info({ versao: info.versao }, 'Versão nova disponível');
    estado.versaoDisponivel = info;
  });

  registerShutdownHandlers(app, {
    worklistWorker,
    dicomWorker,
    accWorker,
    pararBatimento: () => { pararBatimento?.(); pararVigia?.(); lider?.parar(); pararRelease(); },
  });

  log.info('Wader rodando. Acesse http://localhost:%d', config.ui.port);
}

function registerShutdownHandlers(
  app: FastifyInstance,
  workers: {
    worklistWorker: WorklistSyncWorker | null;
    dicomWorker: DicomIngestWorker | null;
    accWorker: AccRecoveryWorker | null;
    pararBatimento: (() => void) | null;
  } = {
    worklistWorker: null,
    dicomWorker: null,
    accWorker: null,
    pararBatimento: null,
  },
): void {
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Sinal recebido, encerrando…');
    try {
      workers.worklistWorker?.stop();
      workers.dicomWorker?.stop();
      workers.accWorker?.stop();
      workers.pararBatimento?.();
      await app.close();
      log.info('Servidor encerrado com sucesso.');
      process.exit(0);
    } catch (err) {
      log.error({ err }, 'Erro durante shutdown.');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('uncaughtException', (err) => {
    log.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    log.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });
}

main().catch((err) => {
  // Porta ocupada = outro Wader nesta máquina (spec §12): código 2, mensagem clara.
  if ((err as NodeJS.ErrnoException)?.code === 'EADDRINUSE') {
    logger.fatal({ err }, 'Porta ocupada — já existe um Wader rodando nesta máquina?');
    sairCom(CODIGO.CONFIG, { motivo: 'config' });
  }
  logger.fatal({ err }, 'Erro fatal no startup do Wader');
  process.exit(1);
});
