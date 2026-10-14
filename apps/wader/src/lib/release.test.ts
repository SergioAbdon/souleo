import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { versaoNova, checarRelease, baixarRelease, iniciarChecagemRelease, URL_RELEASE } from './release';

describe('versaoNova', () => {
  it('tag wader-v diferente da atual → versão nova', () => expect(versaoNova('wader-v1.0.1', '1.0.0')).toBe('1.0.1'));
  it('tag igual à atual → null', () => expect(versaoNova('wader-v1.0.0', '1.0.0')).toBeNull());
  it('tag de outra linha (v2.3.0, leo-v1) ou ausente → null', () => {
    expect(versaoNova('v2.3.0', '1.0.0')).toBeNull();
    expect(versaoNova('leo-v9', '1.0.0')).toBeNull();
    expect(versaoNova(undefined, '1.0.0')).toBeNull();
  });
  it('depois do prefixo só aceita X.Y.Z (nada de path/lixo)', () => {
    expect(versaoNova('wader-vfoo/../x', '1.0.0')).toBeNull();
    expect(versaoNova('wader-v1.0', '1.0.0')).toBeNull();
    expect(versaoNova('wader-v1.0.1-beta', '1.0.0')).toBeNull();
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
  it('tag igual → null (chegou no GitHub, não há versão nova)', async () => {
    expect(await checarRelease('1.0.0', fetchFalso({ tag_name: 'wader-v1.0.0', assets: [] }))).toBeNull();
  });
  it('HTTP ≠ 2xx, rede fora ou JSON ruim → undefined (falhou, não sabe)', async () => {
    expect(await checarRelease('1.0.0', fetchFalso({}, false))).toBeUndefined();
    expect(await checarRelease('1.0.0', (async () => { throw new Error('ENOTFOUND'); }) as unknown as typeof fetch)).toBeUndefined();
    expect(await checarRelease('1.0.0', (async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })) as unknown as typeof fetch)).toBeUndefined();
  });
});

describe('iniciarChecagemRelease', () => {
  it('repassa info / undefined (falha) / null (sem versão nova) pro chamador decidir', async () => {
    vi.useFakeTimers();
    try {
      const respostas: (() => unknown)[] = [
        () => ({ ok: true, json: async () => ({ tag_name: 'wader-v1.0.1', assets: [] }) }),
        () => { throw new Error('ENOTFOUND'); },
        () => ({ ok: true, json: async () => ({ tag_name: 'wader-v1.0.0', assets: [] }) }),
      ];
      let i = 0;
      const f = (async () => respostas[i++]()) as unknown as typeof fetch;
      const recebidos: unknown[] = [];
      const parar = iniciarChecagemRelease('1.0.0', (info) => recebidos.push(info), 1000, f);
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      parar();
      expect(recebidos).toEqual([{ versao: '1.0.1', assets: {} }, undefined, null]);
    } finally {
      vi.useRealTimers();
    }
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
  it('fetch recebe signal de timeout; se aborta → rejeita e não deixa o exe final', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wader-rel-'));
    const f = (async (_u: string, init?: { signal?: AbortSignal }) => {
      if (init?.signal) throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
      return { ok: true, body: new Blob(['EXE']).stream() };
    }) as unknown as typeof fetch;
    const info = { versao: '1.0.1', assets: { 'wader.exe': 'https://x/wader.exe', 'wader.exe.sha256': 'https://x/s' } };
    await expect(baixarRelease(info, dir, f, 50)).rejects.toThrow(/abort/i);
    expect(fs.existsSync(path.join(dir, 'wader-v1.0.1.exe'))).toBe(false);
  });
  it('release sem os dois assets → lança (nada gravado)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wader-rel-'));
    await expect(baixarRelease({ versao: '1.0.1', assets: {} }, dir, fetch)).rejects.toThrow(/asset/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
