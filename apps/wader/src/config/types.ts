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
 *   │ wsId, agentId                     │ ortancUrl/User/Pass     │
 *   │ firebase.serviceAccountPath       │ feegowToken/ProcMap     │
 *   │ orthanc.worklistPath (filesystem) │ nomeClinica, logoB64    │
 *   │ backup.path (filesystem)          │ corPrimaria, etc.       │
 *   │ ui.port, polling.intervals        │ — qualquer coisa que    │
 *   │                                    │   admin edita via       │
 *   │                                    │   LocalModal do LEO     │
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
 * URL/User/Pass NÃO ficam aqui — vêm do Firestore (workspace.ortancUrl/User/Pass)
 * via WorkspaceRepo.getOrthancConnection(). Isso permite que admin edite no
 * LocalModal do LEO web e Wader pegue automaticamente.
 *
 * Aqui ficam APENAS paths de filesystem da máquina onde o Orthanc está rodando.
 */
export interface OrthancLocalConfig {
  /** Pasta onde o plugin Worklist do Orthanc lê arquivos `.wl`. Varia por instalação. */
  worklistPath: string;
}

export interface BackupConfig {
  path: string;
  retentionDays: number;
}

export interface PollingConfig {
  worklistSyncSec: number;
  orthancChangesSec: number;
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
    orthancChangesSec: 30,
  },
  ui: {
    port: 8043,
    showTrayIcon: true,
  },
};
