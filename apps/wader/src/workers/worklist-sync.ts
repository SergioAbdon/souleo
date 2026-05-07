import * as fs from 'node:fs';
import { ExamesRepo } from '../adapters/exames-repo';
import { StatusExame } from '../types/exame';
import { salvarWl, deletarWl, listarWlExistentes } from './wl-writer';
import { createLogger } from '../logger';

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
  data?: string; // YYYY-MM-DD; default = hoje
}): Promise<SyncResult> {
  const dataAlvo = opts.data ?? new Date().toISOString().slice(0, 10);
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
  const todosExames = await repo.listarDoDia(dataAlvo);
  const elegiveis = todosExames.filter((e) => STATUS_ELEGIVEIS_WL.includes(e.status));
  result.examesElegiveis = elegiveis.length;

  const wlsExistentes = listarWlExistentes(opts.worklistPath);
  result.wlsAntes = wlsExistentes.length;

  const idsElegiveis = new Set(elegiveis.map((e) => e.id));
  const idsExistentesNaPasta = new Set(
    wlsExistentes.map((f) => f.replace(/\.wl$/, '')),
  );

  // 1) Cria .wl que falta
  for (const exame of elegiveis) {
    if (idsExistentesNaPasta.has(exame.id)) {
      result.wlsIntactos++;
      continue;
    }
    try {
      salvarWl(opts.worklistPath, exame);
      result.wlsCriados++;
    } catch (err) {
      const msg = `Falha ao gerar .wl pra exame ${exame.id}: ${(err as Error).message}`;
      log.error({ err, exameId: exame.id }, msg);
      result.errors.push(msg);
    }
  }

  // 2) Remove .wl obsoletos (sem exame correspondente ou exame não-elegível)
  for (const filename of wlsExistentes) {
    const exameId = filename.replace(/\.wl$/, '');
    if (idsElegiveis.has(exameId)) continue;
    try {
      const removed = deletarWl(opts.worklistPath, exameId);
      if (removed) result.wlsRemovidos++;
    } catch (err) {
      const msg = `Falha ao remover .wl ${filename}: ${(err as Error).message}`;
      log.error({ err, exameId }, msg);
      result.errors.push(msg);
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
