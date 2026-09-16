import * as fs from 'node:fs';
import { ExamesRepo } from '../adapters/exames-repo';
import { WorkspaceRepo } from '../adapters/workspace-repo';
import { StatusExame } from '../types/exame';
import { salvarWl, deletarWl, listarWlExistentes, hashCamposWl } from './wl-writer';
import { createLogger } from '../logger';
import { hojeClinica } from '../lib/clinica-tempo';

const log = createLogger({ module: 'worklist-sync' });

/**
 * Status de exame que devem ter `.wl` no Orthanc (Vivid precisa ver).
 * Status finais (`emitido`) não devem ter — exame já foi feito.
 */
const STATUS_ELEGIVEIS_WL: StatusExame[] = ['aguardando', 'andamento', 'rascunho'];

export interface SyncResult {
  data: string;
  examesElegiveis: number;
  wlsAntes: number;
  wlsCriados: number;
  wlsRemovidos: number;
  wlsIntactos: number;
  wlsDepois: number;
  errors: string[];
}

/**
 * Sincroniza arquivos `.wl` da pasta com os exames elegíveis do dia no Firestore.
 *
 * Estratégia:
 *   1. Lê exames do dia do Firestore (`listarDoDia`)
 *   2. Filtra os elegíveis (status em STATUS_ELEGIVEIS_WL)
 *   3. Lista `.wl` que já existem na pasta
 *   4. Cria os faltantes (elegíveis sem .wl)
 *   5. Remove os obsoletos (.wl sem exame correspondente OU exame não-elegível)
 *
 * Idempotente — pode rodar várias vezes sem efeito colateral.
 */
export async function syncWorklists(opts: {
  wsId: string;
  worklistPath: string;
  /** Nome do aparelho (DICOM 0040,0010). Vem do `wader.config.json`. */
  scheduledStationName?: string;
  data?: string; // YYYY-MM-DD; default = hoje
}): Promise<SyncResult> {
  const dataAlvo = opts.data ?? hojeClinica();
  const result: SyncResult = {
    data: dataAlvo,
    examesElegiveis: 0,
    wlsAntes: 0,
    wlsCriados: 0,
    wlsRemovidos: 0,
    wlsIntactos: 0,
    wlsDepois: 0,
    errors: [],
  };

  if (!fs.existsSync(opts.worklistPath)) {
    const msg = `worklistPath não existe: ${opts.worklistPath}`;
    log.error(msg);
    result.errors.push(msg);
    return result;
  }

  const repo = new ExamesRepo(opts.wsId);
  const wsRepo = new WorkspaceRepo(opts.wsId);

  // Busca uma vez o nome da clínica (cache reuso entre exames do tick).
  // ABORTA o sync se falhar (achado da tríade): `nomeClinica` entra no
  // `hashCamposWl`. Seguir com '' faria o hash divergir do gravado, regravando
  // TODOS os `.wl` da pasta — e no tick seguinte, com o Firestore de volta,
  // regravaria tudo de novo. Oscilação eterna. Melhor pular o tick.
  let nomeClinica = '';
  try {
    nomeClinica = await wsRepo.getNomeClinica();
  } catch (err) {
    const msg = `Não consegui buscar nomeClinica do workspace — sync abortado: ${(err as Error).message}`;
    log.error({ err }, msg);
    result.errors.push(msg);
    return result;
  }

  const todosExames = await repo.listarDoDia(dataAlvo);
  const elegiveis = todosExames.filter((e) => STATUS_ELEGIVEIS_WL.includes(e.status));
  result.examesElegiveis = elegiveis.length;

  const wlsExistentes = listarWlExistentes(opts.worklistPath);
  result.wlsAntes = wlsExistentes.length;

  const idsElegiveis = new Set(elegiveis.map((e) => e.id));
  const idsExistentesNaPasta = new Set(
    wlsExistentes.map((f) => f.replace(/\.wl$/, '')),
  );

  const optsWl = {
    scheduledStationName: opts.scheduledStationName,
    scheduledProcedureStepLocation: nomeClinica,
  };

  // 1) Cria .wl que falta OU regrava quando o exame mudou (hash diverge)
  //    OU reafirma o selo mwlStatus (ex: Wader reiniciou e perdeu o carimbo).
  for (const exame of elegiveis) {
    const hashAtual = hashCamposWl(exame, optsWl);

    if (idsExistentesNaPasta.has(exame.id)) {
      if (exame.wlHash === hashAtual && exame.mwlStatus === 'ok') {
        result.wlsIntactos++;
        continue;
      }
      try {
        if (exame.wlHash !== hashAtual) {
          salvarWl(opts.worklistPath, exame, optsWl);
          result.wlsCriados++;
        } else {
          result.wlsIntactos++;
        }
        await repo.marcarMwl(exame.id, 'ok', hashAtual);
      } catch (err) {
        const msg = `Falha ao regravar .wl pra exame ${exame.id}: ${(err as Error).message}`;
        log.error({ err, exameId: exame.id }, msg);
        result.errors.push(msg);
        await repo.marcarMwl(exame.id, 'falhou');
      }
      continue;
    }

    try {
      salvarWl(opts.worklistPath, exame, optsWl);
      result.wlsCriados++;
      await repo.marcarMwl(exame.id, 'ok', hashAtual);
    } catch (err) {
      const msg = `Falha ao gerar .wl pra exame ${exame.id}: ${(err as Error).message}`;
      log.error({ err, exameId: exame.id }, msg);
      result.errors.push(msg);
      await repo.marcarMwl(exame.id, 'falhou');
    }
  }

  // 2) Remove .wl obsoletos (sem exame correspondente ou exame não-elegível).
  //    Só roda pro dia de hoje: uma consulta a um dia passado/futuro
  //    (`opts.data`) é só leitura — não pode apagar a worklist de hoje no aparelho.
  if (dataAlvo === hojeClinica()) {
    for (const filename of wlsExistentes) {
      const exameId = filename.replace(/\.wl$/, '');
      if (idsElegiveis.has(exameId)) continue;
      try {
        const removed = deletarWl(opts.worklistPath, exameId);
        if (removed) {
          result.wlsRemovidos++;
          await repo.limparMwl(exameId);
        }
      } catch (err) {
        const msg = `Falha ao remover .wl ${filename}: ${(err as Error).message}`;
        log.error({ err, exameId }, msg);
        result.errors.push(msg);
      }
    }
  }

  result.wlsDepois = listarWlExistentes(opts.worklistPath).length;

  log.info(
    {
      data: dataAlvo,
      criados: result.wlsCriados,
      removidos: result.wlsRemovidos,
      intactos: result.wlsIntactos,
      total: result.wlsDepois,
    },
    'syncWorklists concluído',
  );
  return result;
}

/**
 * Detalhes de um único exame (apoio pra debug/admin).
 */
export function detalhesPasta(worklistPath: string): Array<{ exameId: string; arquivo: string; tamanhoBytes: number; modificadoEm: string }> {
  if (!fs.existsSync(worklistPath)) return [];
  return listarWlExistentes(worklistPath).map((filename) => {
    const fullPath = `${worklistPath.replace(/\\$/, '')}\\${filename}`;
    const stat = fs.statSync(fullPath);
    return {
      exameId: filename.replace(/\.wl$/, ''),
      arquivo: filename,
      tamanhoBytes: stat.size,
      modificadoEm: stat.mtime.toISOString(),
    };
  });
}
