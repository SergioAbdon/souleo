import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadConfig } from './load';

describe('loadConfig', () => {
  it('tolera BOM UTF-8 no início do arquivo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wader-cfg-'));
    const cfg = {
      wsId: 'ws-bom',
      agentId: 'agente-bom',
      firebase: { serviceAccountPath: 'sa.json', projectId: 'proj' },
      orthanc: { worklistPath: 'wl' },
    };
    fs.writeFileSync(path.join(dir, 'wader.config.json'), '\uFEFF' + JSON.stringify(cfg), 'utf-8');
    try {
      expect(loadConfig(dir).wsId).toBe('ws-bom');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
