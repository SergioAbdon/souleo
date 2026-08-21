/**
 * Tipos da configuração do Wader (wader.config.json).
 *
 * Este arquivo é a única fonte da verdade do schema de configuração.
 * Toda mudança aqui deve ser refletida no wader.config.example.json.
 *
 * REGRA DE OURO sobre o que mora aqui (config local) vs Firestore:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Por MÁQUINA (este arquivo)        │ Por CLÍNICA (Firestore) │
 *   ├───────────────────────────────────┼─────────────────────────┤
 *   │ wsId, agentId                     │ integracoes/orthanc.url │
 *   │ firebase.serviceAccountPath       │ privado/orthanc.user/   │
 *   │ orthanc.worklistPath (filesystem) │ pass; integracoes/      │
 *   │ backup.path (filesystem)          │ feegow.procMap          │
 *   │ ui.port, polling.intervals        │ nomeClinica, logoB64,   │
 *   │                                    │ corPrimaria — qualquer  │
 *   │                                    │ coisa que admin edita   │
 *   │                                    │ via LocalModal do LEO   │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Wader usa WorkspaceRepo pra ler config por-clínica do Firestore.
 */

export interface WaderConfig {
  version: string;
  wsId: string;
  agentId: string;
  activatedAt?: string;

  firebase: FirebaseConfig;
  orthanc: OrthancLocalConfig;
  backup: BackupConfig;
  polling: PollingConfig;
  ui: UiConfig;
  telemetry?: TelemetryConfig;
}

export interface FirebaseConfig {
  serviceAccountPath: string;
  projectId: string;
}

/**
 * Config local do Orthanc (apenas o que depende da máquina).
 *
 * URL/User/Pass NÃO ficam aqui — vêm do Firestore (integracoes/orthanc.url +
 * privado/orthanc.user/pass)
 * via WorkspaceRepo.getOrthancConnection(). Isso permite que admin edite no
 * LocalModal do LEO web e Wader pegue automaticamente.
 *
 * Aqui ficam APENAS paths de filesystem da máquina onde o Orthanc está rodando.
 */
export interface OrthancLocalConfig {
  /** Pasta onde o plugin Worklist do Orthanc lê arquivos `.wl`. Varia por instalação. */
  worklistPath: string;
  /**
   * Nome do aparelho de US conectado a essa máquina (tag DICOM 0040,0010).
   * Default: "VIVIDT8". Pra clínica com 2+ aparelhos, cada Wader tem nome único
   * (ex: "VIVIDT8-SALA1", "VIVIDT8-SALA2").
   */
  scheduledStationName?: string;
}

export interface BackupConfig {
  path: string;
  retentionDays: number;
}

export interface PollingConfig {
  /** Intervalo do worker de sync de worklists. Default 60s. */
  worklistSyncSec: number;
  /**
   * Intervalo do worker de DICOM ingest (Orthanc /changes). Default 5s
   * (pacote de latência, Task 6 — antes 30s): a chamada é local e barata
   * (Orthanc na mesma rede da clínica), e um tick mais curto é a diferença
   * entre o médico ver a medida em ~5s ou esperar até 30s parado na tela.
   */
  orthancChangesSec: number;
  /**
   * Intervalo do worker de recuperação por ACC. Default 20s (ADR 2026-06-22,
   * Fix C — antes herdava worklistSyncSec=60s). Mais curto = exame casa mais
   * rápido quando a recepção cadastra/reenvia. Query barata (single-field).
   */
  accRecoverySec?: number;
}

export interface UiConfig {
  port: number;
  showTrayIcon: boolean;
}

export interface TelemetryConfig {
  sentryDsn?: string;
  sampleRate: number;
}

/**
 * Defaults aplicados quando wader.config.json omite campos opcionais.
 */
export const DEFAULT_CONFIG: Partial<WaderConfig> = {
  version: '1.0',
  polling: {
    worklistSyncSec: 60,
    orthancChangesSec: 5,
    accRecoverySec: 20,
  } as PollingConfig,
  ui: {
    port: 8043,
    showTrayIcon: true,
  },
};
