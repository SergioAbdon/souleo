import { WorkspaceRepo, OrthancConnection } from './workspace-repo';
import { createLogger } from '../logger';

const log = createLogger({ module: 'orthanc-client' });

const DEFAULT_TIMEOUT_MS = 10_000;

export interface OrthancSystemInfo {
  Version: string;
  Name: string;
  DicomAet?: string;
  DicomPort?: number;
  PluginsEnabled?: string[];
}

export interface OrthancChange {
  ChangeType: string; // 'NewStudy', 'StableStudy', 'NewInstance', etc.
  Date: string;
  ID: string; // ID do recurso (Study, Instance, etc.)
  ResourceType: 'Study' | 'Series' | 'Instance' | 'Patient';
  Seq: number;
}

export interface OrthancChangesResponse {
  Changes: OrthancChange[];
  Done: boolean;
  Last: number;
}

export interface OrthancStudy {
  ID: string;
  ParentPatient: string;
  PatientMainDicomTags: {
    PatientID?: string;
    PatientName?: string;
    PatientBirthDate?: string;
    PatientSex?: string;
  };
  MainDicomTags: {
    AccessionNumber?: string;
    StudyInstanceUID?: string;
    StudyDate?: string;
    StudyTime?: string;
    StudyDescription?: string;
    Modality?: string;
  };
  Series: string[];
  IsStable: boolean;
}

export interface OrthancInstance {
  ID: string;
  ParentSeries: string;
  IndexInSeries?: number;
  MainDicomTags: {
    InstanceNumber?: string;
    SOPInstanceUID?: string;
    SOPClassUID?: string;
  };
}

export class OrthancError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly url?: string,
  ) {
    super(message);
    this.name = 'OrthancError';
  }
}

/**
 * Cliente HTTP REST pro Orthanc.
 *
 * Resolve URL/auth dinamicamente do Firestore (workspace.ortancUrl/User/Pass)
 * via WorkspaceRepo. Cache 5 min por workspace.
 *
 * Se workspace não tem Orthanc ativo, qualquer chamada lança OrthancError.
 */
export class OrthancClient {
  constructor(private readonly workspaceRepo: WorkspaceRepo) {}

  async system(): Promise<OrthancSystemInfo> {
    return this.get<OrthancSystemInfo>('/system');
  }

  async testConnection(): Promise<{ ok: boolean; system?: OrthancSystemInfo; error?: string }> {
    try {
      const system = await this.system();
      return { ok: true, system };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Lista mudanças desde `since` (cursor sequencial).
   * Pra polling: chama com `since=0` na primeira vez, salva `Last`, e usa
   * esse valor como `since` na próxima chamada.
   */
  async changes(since: number = 0, limit: number = 100): Promise<OrthancChangesResponse> {
    return this.get<OrthancChangesResponse>(`/changes?since=${since}&limit=${limit}`);
  }

  async getStudy(studyId: string): Promise<OrthancStudy> {
    return this.get<OrthancStudy>(`/studies/${encodeURIComponent(studyId)}`);
  }

  /**
   * Lista IDs de instâncias de um estudo.
   * Útil pra iterar e baixar todas as imagens.
   */
  async getStudyInstances(studyId: string): Promise<string[]> {
    const series = await this.get<{ Instances: string[] }[]>(
      `/studies/${encodeURIComponent(studyId)}/series`,
    );
    return series.flatMap((s) => s.Instances ?? []);
  }

  async getInstance(instanceId: string): Promise<OrthancInstance> {
    return this.get<OrthancInstance>(`/instances/${encodeURIComponent(instanceId)}`);
  }

  /**
   * Baixa preview JPG de uma instância (imagem pré-renderizada pelo Orthanc).
   * Retorna o Buffer da imagem.
   */
  async getInstancePreview(instanceId: string): Promise<Buffer> {
    return this.getBinary(`/instances/${encodeURIComponent(instanceId)}/preview`);
  }

  /**
   * Baixa o arquivo DICOM cru (.dcm) de uma instância.
   */
  async getInstanceFile(instanceId: string): Promise<Buffer> {
    return this.getBinary(`/instances/${encodeURIComponent(instanceId)}/file`);
  }

  // ─── Helpers internos ──────────────────────────────────────────────

  private async resolveConn(): Promise<OrthancConnection> {
    const conn = await this.workspaceRepo.getOrthancConnection();
    if (!conn) {
      throw new OrthancError('Workspace não tem Orthanc configurado/ativo. Configure via LocalModal do LEO web.');
    }
    return conn;
  }

  private async get<T>(path: string): Promise<T> {
    const conn = await this.resolveConn();
    const url = conn.url + path;
    const headers = this.buildHeaders(conn);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) {
        throw new OrthancError(`Orthanc ${res.status}: ${res.statusText}`, res.status, url);
      }
      return (await res.json()) as T;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new OrthancError(`Timeout (${DEFAULT_TIMEOUT_MS}ms) chamando ${url}`);
      }
      if (err instanceof OrthancError) throw err;
      throw new OrthancError(`Falha de rede: ${(err as Error).message}`, undefined, url);
    } finally {
      clearTimeout(t);
    }
  }

  private async getBinary(path: string): Promise<Buffer> {
    const conn = await this.resolveConn();
    const url = conn.url + path;
    const headers = this.buildHeaders(conn);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) {
        throw new OrthancError(`Orthanc ${res.status}: ${res.statusText}`, res.status, url);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      log.debug({ url, bytes: buf.length }, 'Binário baixado do Orthanc');
      return buf;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new OrthancError(`Timeout (${DEFAULT_TIMEOUT_MS}ms) baixando ${url}`);
      }
      if (err instanceof OrthancError) throw err;
      throw new OrthancError(`Falha de rede: ${(err as Error).message}`, undefined, url);
    } finally {
      clearTimeout(t);
    }
  }

  private buildHeaders(conn: OrthancConnection): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (conn.user && conn.pass) {
      const b64 = Buffer.from(`${conn.user}:${conn.pass}`).toString('base64');
      headers['Authorization'] = `Basic ${b64}`;
    }
    return headers;
  }
}
