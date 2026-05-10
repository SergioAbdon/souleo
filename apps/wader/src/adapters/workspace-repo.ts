import { getDb } from './firebase';
import { TipoExame, TIPOS_EXAME_LABEL } from '../types/exame';
import { createLogger } from '../logger';

const log = createLogger({ module: 'workspace-repo' });

/**
 * Configuração do Orthanc por workspace.
 * Vem do Firestore (LocalModal do LEO web salva lá).
 */
export interface OrthancConnection {
  url: string;
  user: string;
  pass: string;
  ativo: boolean;
}

/**
 * Configuração de procedimentos disponíveis no workspace.
 *
 * Estratégia (alinhada com LEO web):
 *   1. LEO web tem `workspaces/{wsId}.feegowProcMap` = `Record<procedimento_id_feegow, tipo_leo>`
 *      Ex: `{ 6: "eco_tt", 67: "doppler_carotidas" }`
 *   2. O Wader extrai os VALORES únicos desse mapa pra montar a lista
 *      de procedimentos oferecidos pela clínica.
 *   3. Se o workspace não tiver feegowProcMap (cliente sem Feegow),
 *      Wader usa todos os tipos suportados como default.
 *
 * Cache em memória pra evitar leitura constante do Firestore.
 */
export interface ProcedimentoOferecido {
  tipo: TipoExame;
  label: string;
}

export class WorkspaceRepo {
  private procedimentosCache: ProcedimentoOferecido[] | null = null;
  private procedimentosCacheExpireAt = 0;
  private orthancCache: OrthancConnection | null = null;
  private orthancCacheExpireAt = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

  constructor(private readonly wsId: string) {}

  /**
   * Lê config do Orthanc do workspace no Firestore.
   *
   * Por que ler do Firestore (não do wader.config.json local)?
   *   - URL/User/Pass podem mudar (admin edita via LocalModal do LEO web)
   *   - Multi-tenancy: cada clínica tem o seu sem precisar mexer no PC
   *   - Single source of truth: mesmo lugar que o LEO web já consulta
   *
   * Cache 5 min pra evitar hit no Firestore a cada operação.
   *
   * Retorna null se workspace não tiver Orthanc configurado ou ativo.
   */
  async getOrthancConnection(): Promise<OrthancConnection | null> {
    if (this.orthancCache && Date.now() < this.orthancCacheExpireAt) {
      return this.orthancCache;
    }

    const snap = await getDb().collection('workspaces').doc(this.wsId).get();
    if (!snap.exists) {
      log.warn({ wsId: this.wsId }, 'Workspace não existe — sem Orthanc config');
      return null;
    }

    const data = snap.data() ?? {};
    if (!data.ortancAtivo || !data.ortancUrl) {
      log.info({ wsId: this.wsId }, 'Orthanc não ativo neste workspace');
      this.orthancCache = null;
      this.orthancCacheExpireAt = Date.now() + this.CACHE_TTL_MS;
      return null;
    }

    const conn: OrthancConnection = {
      url: String(data.ortancUrl).replace(/\/+$/, ''),
      user: String(data.ortancUser ?? ''),
      pass: String(data.ortancPass ?? ''),
      ativo: true,
    };

    this.orthancCache = conn;
    this.orthancCacheExpireAt = Date.now() + this.CACHE_TTL_MS;
    log.info({ wsId: this.wsId, url: conn.url, user: conn.user }, 'Orthanc connection carregada');
    return conn;
  }

  /**
   * Lista os procedimentos oferecidos pelo workspace.
   * Lê de `workspace.feegowProcMap`, cai pra default se não houver.
   */
  async getProcedimentos(): Promise<ProcedimentoOferecido[]> {
    if (this.procedimentosCache && Date.now() < this.procedimentosCacheExpireAt) {
      return this.procedimentosCache;
    }

    const snap = await getDb().collection('workspaces').doc(this.wsId).get();

    if (!snap.exists) {
      log.warn({ wsId: this.wsId }, 'Workspace não encontrado, usando defaults');
      return this.cacheAndReturn(getAllAsDefault());
    }

    const data = snap.data() ?? {};
    const procMap = (data.feegowProcMap as Record<string, string> | undefined) ?? {};
    const tiposUnicos = new Set(Object.values(procMap).filter(isTipoExame));

    if (tiposUnicos.size === 0) {
      log.info({ wsId: this.wsId }, 'workspace.feegowProcMap vazio, usando todos os tipos como default');
      return this.cacheAndReturn(getAllAsDefault());
    }

    const procedimentos: ProcedimentoOferecido[] = Array.from(tiposUnicos).map((tipo) => ({
      tipo,
      label: TIPOS_EXAME_LABEL[tipo],
    }));

    log.info({ wsId: this.wsId, total: procedimentos.length }, 'Procedimentos carregados do workspace');
    return this.cacheAndReturn(procedimentos);
  }

  /**
   * Retorna o nome da clínica do workspace.
   * Usado em (0040,0011) ScheduledProcedureStepLocation no .wl.
   * Se não houver, retorna string vazia.
   */
  async getNomeClinica(): Promise<string> {
    const snap = await getDb().collection('workspaces').doc(this.wsId).get();
    if (!snap.exists) return '';
    return String(snap.data()?.nomeClinica ?? '');
  }

  /**
   * Invalida todos os caches (forçar reload na próxima leitura).
   */
  invalidate(): void {
    this.procedimentosCache = null;
    this.procedimentosCacheExpireAt = 0;
    this.orthancCache = null;
    this.orthancCacheExpireAt = 0;
  }

  private cacheAndReturn(value: ProcedimentoOferecido[]): ProcedimentoOferecido[] {
    this.procedimentosCache = value;
    this.procedimentosCacheExpireAt = Date.now() + this.CACHE_TTL_MS;
    return value;
  }
}

function isTipoExame(value: string): value is TipoExame {
  return value in TIPOS_EXAME_LABEL;
}

function getAllAsDefault(): ProcedimentoOferecido[] {
  return Object.entries(TIPOS_EXAME_LABEL).map(([tipo, label]) => ({
    tipo: tipo as TipoExame,
    label,
  }));
}
