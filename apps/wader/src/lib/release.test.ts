import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { versaoNova, checarRelease, baixarRelease, URL_RELEASE } from './release';

describe('versaoNova', () => {
  it('tag wader-v diferente da atual → versão nova', () => expect(versaoNova('wader-v1.0.1', '1.0.0')).toBe('1.0.1'));
  it('tag igual à atual → null', () => expect(versaoNova('wader-v1.0.0', '1.0.0')).toBeNull());
  it('tag de outra linha (v2.3.0, leo-v1) ou ausente → null', () => {
    expect(versaoNova('v2.3.0', '1.0.0')).toBeNull();
    expect(versaoNova('leo-v9', '1.0.0')).toBeNull();
    expect(versaoNova(undefined, '1.0.0')).toBeNull();
  });
});

const fetchFalso = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

describe('checarRelease', () => {
  it('monta versão + mapa nome→url dos assets e manda User-Agent', async () => {
    let urlChamada = ''; let headers: Record<string, string> = {};
    const f = (async (u: string, init: { headers: Record<string, string> }) => {
      urlChamada = u; headers = init.headers;
      return { ok: true, json: async () => ({ tag_name: 'wader-v1.0.1', assets: [
        { name: 'wader.exe', browser_download_url: 'https://x/wader.exe' },
        { name: 'wader.exe.sha256', browser_download_url: 'https://x/wader.exe.sha256' },
      ] }) };
    }) as unknown as typeof fetch;
    expect(await checarRelease('1.0.0', f)).toEqual({ versao: '1.0.1', assets: { 'wader.exe': 'https://x/wader.exe', 'wader.exe.sha256': 'https://x/wader.exe.sha256' } });
    expect(urlChamada).toBe(URL_RELEASE);
    expect(headers['User-Agent']).toBe('wader');
  });
  it('sem versão nova, HTTP ≠ 2xx ou rede fora → null (silêncio)', async () => {
    expect(await checarRelease('1.0.0', fetchFalso({ tag_name: 'wader-v1.0.0', assets: [] }))).toBeNull();
    expect(await checarRelease('1.0.0', fetchFalso({}, false))).toBeNull();
    expect(await checarRelease('1.0.0', (async () => { throw new Error('ENOTFOUND'); }) as unknown as typeof fetch)).toBeNull();
  });
});

describe('baixarRelease', () => {
  it('grava updates/wader-vX.exe e .sha256 (via .tmp + rename)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wader-rel-'));
    const f = (async (u: string) => ({
      ok: true,
      body: new Blob([u.endsWith('sha256') ? 'abc  wader.exe' : 'EXE']).stream(),
    })) as unknown as typeof fetch;
    await baixarRelease({ versao: '1.0.1', assets: { 'wader.exe': 'https://x/wader.exe', 'wader.exe.sha256': 'https://x/wader.exe.sha256' } }, dir, f);
    expect(fs.readFileSync(path.join(dir, 'wader-v1.0.1.exe'), 'utf-8')).toBe('EXE');
    expect(fs.readFileSync(path.join(dir, 'wader-v1.0.1.exe.sha256'), 'utf-8')).toBe('abc  wader.exe');
    expect(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
  it('release sem os dois assets → lança (nada gravado)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wader-rel-'));
    await expect(baixarRelease({ versao: '1.0.1', assets: {} }, dir, fetch)).rejects.toThrow(/asset/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
