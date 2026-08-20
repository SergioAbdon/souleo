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
 * Estratégia (alinhada com LEO web, canônico pós Sub-plano 5):
 *   1. LEO web tem `workspaces/{wsId}/integracoes/feegow.procMap` =
 *      `Record<procedimento_id_feegow, tipo_leo>`
 *      Ex: `{ 6: "eco_tt", 67: "doppler_carotidas" }`
 *   2. O Wader extrai os VALORES únicos desse mapa pra montar a lista
 *      de procedimentos oferecidos pela clínica.
 *   3. Se o workspace não tiver `integracoes/feegow.procMap` configurado
 *      (ou vazio), Wader devolve lista vazia (Task 8, achado 15 — alinhado
 *      com o erro explícito `feegow_sem_procmap` do lado LEO web).
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

    const integracaoSnap = await getDb()
      .doc(`workspaces/${this.wsId}/integracoes/orthanc`)
      .get();

    const integracaoData = integracaoSnap.data() ?? {};
    if (!integracaoSnap.exists || !integracaoData.ativo || !integracaoData.url) {
      log.info({ wsId: this.wsId }, 'Orthanc não ativo neste workspace');
      this.orthancCache = null;
      this.orthancCacheExpireAt = Date.now() + this.CACHE_TTL_MS;
      return null;
    }

    const privadoSnap = await getDb()
      .doc(`workspaces/${this.wsId}/privado/orthanc`)
      .get();
    const privadoData = privadoSnap.data() ?? {};
    const user = String(privadoData.user ?? '');
    const pass = String(privadoData.pass ?? '');

    // Orthanc ativo mas sem credencial cadastrada (ex: migração em andamento
    // gravou integracoes/orthanc antes de privado/orthanc): trata como
    // "não ativo" em vez de devolver conexão com Basic Auth vazio, que geraria
    // 401 repetido nos workers pelos próximos 5 min de cache. NUNCA logar `pass`.
    if (!privadoSnap.exists || !user || !pass) {
      log.warn({ wsId: this.wsId }, 'Orthanc ativo mas credencial (privado/orthanc) não cadastrada');
      this.orthancCache = null;
      this.orthancCacheExpireAt = Date.now() + this.CACHE_TTL_MS;
      return null;
    }

    const conn: OrthancConnection = {
      url: String(integracaoData.url).replace(/\/+$/, ''),
      user,
      pass,
      ativo: true,
    };

    this.orthancCache = conn;
    this.orthancCacheExpireAt = Date.now() + this.CACHE_TTL_MS;
    log.info({ wsId: this.wsId, url: conn.url, user: conn.user }, 'Orthanc connection carregada');
    return conn;
  }

  /**
   * Lista os procedimentos oferecidos pelo workspace.
   * Lê de `integracoes/feegow.procMap` (Sub-plano 5) — SEM fallback pro campo
   * antigo `workspace.feegowProcMap`: a tela nova (Task 4) grava só no lugar
   * novo, e este leitor lendo o antigo era o resto do dual-owner (Task 7,
   * item A) — editar o mapa na tela virava no-op silencioso pra este reader.
   *
   * Task 8 (achado 15): procMap ausente/vazio NÃO cai mais em "todos os
   * tipos" — o lado LEO já virou erro explícito (`feegow_sem_procmap`) pra
   * esse mesmo caso. Devolve lista vazia (dropdown vazio na UI é honesto —
   * a clínica configura em Integrações > Feegow antes de agendar por aqui).
   */
  async getProcedimentos(): Promise<ProcedimentoOferecido[]> {
    if (this.procedimentosCache && Date.now() < this.procedimentosCacheExpireAt) {
      return this.procedimentosCache;
    }

    const snap = await getDb().doc(`workspaces/${this.wsId}/integracoes/feegow`).get();
    const procMap = (snap.exists ? snap.data()?.procMap as Record<string, string> | undefined : undefined) ?? {};
    const tiposUnicos = new Set(Object.values(procMap).filter(isTipoExame));

    if (tiposUnicos.size === 0) {
      log.warn({ wsId: this.wsId }, 'procMap não configurado — configure em Integrações > Feegow');
      return this.cacheAndReturn([]);
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
