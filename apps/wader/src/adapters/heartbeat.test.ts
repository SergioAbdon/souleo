import { describe, it, expect, vi, beforeEach } from 'vitest';

let setCalls: Array<{ path: string; data: unknown; opts: unknown }>;
let shouldThrowWader: boolean;

vi.mock('./firebase', () => ({
  getDb: () => ({
    doc: (path: string) => ({
      set: async (data: unknown, opts: unknown) => {
        if (shouldThrowWader && path.endsWith('/integracoes/wader')) {
          throw new Error('firestore indisponível');
        }
        setCalls.push({ path, data, opts });
      },
    }),
  }),
}));

import { iniciarBatimento } from './heartbeat';

function callFor(path: string) {
  return setCalls.filter((c) => c.path === path);
}

const CONN_OK = { url: 'http://orthanc:8042', user: 'admin', pass: 'segredo123', ativo: true };

describe('iniciarBatimento', () => {
  beforeEach(() => {
    setCalls = [];
    shouldThrowWader = false;
    vi.useFakeTimers();
  });

  it('escreve tipo/visto/versao/maquina em integracoes/wader na primeira batida', async () => {
    const repo = { getOrthancConnection: async () => null };
    const client = { system: async () => ({}) };
    const parar = iniciarBatimento('ws1', '1.2.3', repo, client);
    await vi.advanceTimersByTimeAsync(0); // deixa a batida imediata (não-gated por timer) resolver

    const waderCalls = callFor('workspaces/ws1/integracoes/wader');
    expect(waderCalls).toHaveLength(1);
    expect(waderCalls[0].opts).toEqual({ merge: true });
    const data = waderCalls[0].data as Record<string, unknown>;
    expect(data.tipo).toBe('wader');
    expect(data.versao).toBe('1.2.3');
    expect(data.visto).toBeInstanceOf(Date);
    expect(typeof data.maquina).toBe('string');

    parar();
    vi.useRealTimers();
  });

  it('nunca lança quando a escrita do batimento falha (falha em silêncio)', async () => {
    shouldThrowWader = true;
    const repo = { getOrthancConnection: async () => null };
    const client = { system: async () => ({}) };
    expect(() => iniciarBatimento('ws1', '1.2.3', repo, client)).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(callFor('workspaces/ws1/integracoes/wader')).toHaveLength(0);

    vi.useRealTimers();
  });

  it('parar() cancela o timer periódico', async () => {
    const repo = { getOrthancConnection: async () => null };
    const client = { system: async () => ({}) };
    const parar = iniciarBatimento('ws1', '1.2.3', repo, client);
    await vi.advanceTimersByTimeAsync(0);
    expect(callFor('workspaces/ws1/integracoes/wader')).toHaveLength(1);

    parar();
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
    expect(callFor('workspaces/ws1/integracoes/wader')).toHaveLength(1);

    vi.useRealTimers();
  });

  it('orthanc respondendo -> integracoes/orthanc recebe status ok', async () => {
    const repo = { getOrthancConnection: async () => CONN_OK };
    const client = { system: async () => ({ Version: '1.0' }) };
    const parar = iniciarBatimento('ws1', '1.2.3', repo, client);
    await vi.advanceTimersByTimeAsync(0);

    const orthancCalls = callFor('workspaces/ws1/integracoes/orthanc');
    expect(orthancCalls).toHaveLength(1);
    expect(orthancCalls[0].opts).toEqual({ merge: true });
    const data = orthancCalls[0].data as Record<string, unknown>;
    expect(data.status).toBe('ok');
    expect(data.ultimoErro).toBeNull();
    expect(data.ultimoTeste).toBeInstanceOf(Date);

    parar();
    vi.useRealTimers();
  });

  it('orthanc caído -> status erro, ultimoErro sem user/pass dentro', async () => {
    const repo = { getOrthancConnection: async () => CONN_OK };
    const client = { system: async () => { throw new Error('fetch failed'); } };
    const parar = iniciarBatimento('ws1', '1.2.3', repo, client);
    await vi.advanceTimersByTimeAsync(0);

    const orthancCalls = callFor('workspaces/ws1/integracoes/orthanc');
    expect(orthancCalls).toHaveLength(1);
    const data = orthancCalls[0].data as Record<string, unknown>;
    expect(data.status).toBe('erro');
    expect(String(data.ultimoErro)).not.toContain(CONN_OK.user);
    expect(String(data.ultimoErro)).not.toContain(CONN_OK.pass);
    expect(String(data.ultimoErro)).toContain('fetch failed');

    parar();
    vi.useRealTimers();
  });

  it('F2: mensagem de erro que CONTÉM user e pass (URL com credencial) -> ultimoErro gravado não os contém', async () => {
    const repo = { getOrthancConnection: async () => CONN_OK };
    const client = {
      system: async () => {
        throw new Error(`Timeout (10000ms) chamando http://${CONN_OK.user}:${CONN_OK.pass}@orthanc:8042/system`);
      },
    };
    const parar = iniciarBatimento('ws1', '1.2.3', repo, client);
    await vi.advanceTimersByTimeAsync(0);

    const orthancCalls = callFor('workspaces/ws1/integracoes/orthanc');
    expect(orthancCalls).toHaveLength(1);
    const data = orthancCalls[0].data as Record<string, unknown>;
    expect(data.status).toBe('erro');
    expect(String(data.ultimoErro)).not.toContain(CONN_OK.user);
    expect(String(data.ultimoErro)).not.toContain(CONN_OK.pass);
    expect(String(data.ultimoErro)).toContain('***');

    parar();
    vi.useRealTimers();
  });

  it('F3: sem conexão resolvida (desligado/não-configurado/sem credencial) -> NADA é gravado em integracoes/orthanc', async () => {
    const repo = { getOrthancConnection: async () => null };
    const client = { system: async () => ({}) };
    const parar = iniciarBatimento('ws1', '1.2.3', repo, client);
    await vi.advanceTimersByTimeAsync(0);

    expect(callFor('workspaces/ws1/integracoes/orthanc')).toHaveLength(0);

    parar();
    vi.useRealTimers();
  });

  it('falha na checagem do orthanc NAO derruba o batimento do wader (visto continua sendo gravado)', async () => {
    const repo = { getOrthancConnection: async () => { throw new Error('firestore indisponível na leitura da conexão'); } };
    const client = { system: async () => ({}) };
    const parar = iniciarBatimento('ws1', '1.2.3', repo, client);
    await vi.advanceTimersByTimeAsync(0);

    expect(callFor('workspaces/ws1/integracoes/wader')).toHaveLength(1);
    expect(callFor('workspaces/ws1/integracoes/orthanc')).toHaveLength(0);

    parar();
    vi.useRealTimers();
  });
});
