import * as fs from 'node:fs';
import * as path from 'node:path';
import { WaderConfig, DEFAULT_CONFIG } from './types';

const CONFIG_FILENAMES = ['wader.config.json', 'wader.config.local.json'];

const ENV_OVERRIDES: Record<string, (cfg: WaderConfig, value: string) => void> = {
  WADER_WS_ID: (cfg, v) => { cfg.wsId = v; },
  WADER_UI_PORT: (cfg, v) => { cfg.ui.port = Number(v); },
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Carrega wader.config.json do diretório de execução, aplica defaults,
 * permite overrides por variável de ambiente, valida e retorna.
 *
 * Ordem de busca: ./wader.config.local.json → ./wader.config.json
 */
export function loadConfig(cwd: string = process.cwd()): WaderConfig {
  const configPath = findConfigFile(cwd);

  if (!configPath) {
    throw new ConfigError(
      `Nenhum arquivo de configuração encontrado em ${cwd}. ` +
      `Esperado: ${CONFIG_FILENAMES.join(' ou ')}.`
    );
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  let parsed: Partial<WaderConfig>;

  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`JSON inválido em ${configPath}: ${(err as Error).message}`);
  }

  const merged = mergeWithDefaults(parsed);
  applyEnvOverrides(merged);
  validate(merged, configPath);

  return merged;
}

function findConfigFile(cwd: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const candidate = path.join(cwd, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function mergeWithDefaults(partial: Partial<WaderConfig>): WaderConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    polling: { ...DEFAULT_CONFIG.polling!, ...partial.polling },
    ui: { ...DEFAULT_CONFIG.ui!, ...partial.ui },
  } as WaderConfig;
}

function applyEnvOverrides(cfg: WaderConfig): void {
  for (const [envKey, applyFn] of Object.entries(ENV_OVERRIDES)) {
    const value = process.env[envKey];
    if (value !== undefined) {
      applyFn(cfg, value);
    }
  }
}

function validate(cfg: WaderConfig, source: string): void {
  const errors: string[] = [];

  if (!cfg.wsId) errors.push('wsId é obrigatório');
  if (!cfg.agentId) errors.push('agentId é obrigatório');

  if (!cfg.firebase?.serviceAccountPath) {
    errors.push('firebase.serviceAccountPath é obrigatório');
  }
  if (!cfg.firebase?.projectId) {
    errors.push('firebase.projectId é obrigatório');
  }

  if (!cfg.orthanc?.worklistPath) errors.push('orthanc.worklistPath é obrigatório');

  if (!cfg.backup?.path) errors.push('backup.path é obrigatório');
  if (cfg.backup && cfg.backup.retentionDays < 1) {
    errors.push('backup.retentionDays deve ser >= 1');
  }

  if (cfg.ui.port < 1 || cfg.ui.port > 65535) {
    errors.push('ui.port deve estar entre 1 e 65535');
  }

  if (errors.length > 0) {
    throw new ConfigError(
      `Erros de validação em ${source}:\n  - ${errors.join('\n  - ')}`
    );
  }
}
