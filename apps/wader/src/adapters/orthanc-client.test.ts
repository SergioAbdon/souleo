import { describe, it, expect, vi, afterEach } from 'vitest';
import { OrthancClient } from './orthanc-client';
import type { WorkspaceRepo, OrthancConnection } from './workspace-repo';

const CONN: OrthancConnection = { url: 'http://orthanc.local', user: '', pass: '', ativo: true };

function makeClient(conn: OrthancConnection | null = CONN) {
  const workspaceRepo = {
    getOrthancConnection: vi.fn(async () => conn),
  } as unknown as WorkspaceRepo;
  return new OrthancClient(workspaceRepo);
}

describe('OrthancClient.deleteStudy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('404 é tratado como sucesso — idempotente (já apagado ou nunca existiu)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
    const client = makeClient();
    await expect(client.deleteStudy('study1')).resolves.toBeUndefined();
  });

  it('erro real do Orthanc (não-404) lança OrthancError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 500, statusText: 'Internal Server Error' })),
    );
    const client = makeClient();
    await expect(client.deleteStudy('study1')).rejects.toThrow(/500/);
  });
});
