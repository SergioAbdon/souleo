import { describe, it, expect, vi, beforeEach } from 'vitest';

type Doc = { exists: boolean; data?: Record<string, unknown> };

let docs: Record<string, Doc>;

vi.mock('./firebase', () => ({
  getDb: () => ({
    doc: (path: string) => ({
      get: async () => {
        const doc = docs[path] ?? { exists: false };
        return {
          exists: doc.exists,
          data: () => doc.data,
        };
      },
    }),
  }),
}));

import { WorkspaceRepo } from './workspace-repo';

const WS = 'ws1';
const INTEGRACAO_PATH = `workspaces/${WS}/integracoes/orthanc`;
const PRIVADO_PATH = `workspaces/${WS}/privado/orthanc`;

describe('WorkspaceRepo.getOrthancConnection', () => {
  beforeEach(() => {
    docs = {};
  });

  it('integracoes/orthanc ativo + privado/orthanc ausente -> null (credencial faltando)', async () => {
    docs[INTEGRACAO_PATH] = { exists: true, data: { url: 'http://orthanc:8042', ativo: true } };
    // privado/orthanc não configurado em docs -> exists: false

    const repo = new WorkspaceRepo(WS);
    const conn = await repo.getOrthancConnection();

    expect(conn).toBeNull();
  });

  it('integracoes/orthanc ativo + privado/orthanc com user/pass -> conexão montada', async () => {
    docs[INTEGRACAO_PATH] = { exists: true, data: { url: 'http://orthanc:8042/', ativo: true } };
    docs[PRIVADO_PATH] = { exists: true, data: { user: 'admin', pass: 'segredo' } };

    const repo = new WorkspaceRepo(WS);
    const conn = await repo.getOrthancConnection();

    expect(conn).toEqual({
      url: 'http://orthanc:8042', // barra final removida
      user: 'admin',
      pass: 'segredo',
      ativo: true,
    });
  });

  it('integracoes/orthanc com ativo:false -> null', async () => {
    docs[INTEGRACAO_PATH] = { exists: true, data: { url: 'http://orthanc:8042', ativo: false } };
    docs[PRIVADO_PATH] = { exists: true, data: { user: 'admin', pass: 'segredo' } };

    const repo = new WorkspaceRepo(WS);
    const conn = await repo.getOrthancConnection();

    expect(conn).toBeNull();
  });

  it('integracoes/orthanc inexistente (pré-migração) -> null, sem estourar', async () => {
    // nada em docs -> exists: false para os dois

    const repo = new WorkspaceRepo(WS);
    const conn = await repo.getOrthancConnection();

    expect(conn).toBeNull();
  });

  it('privado/orthanc existe mas user/pass vazios -> null', async () => {
    docs[INTEGRACAO_PATH] = { exists: true, data: { url: 'http://orthanc:8042', ativo: true } };
    docs[PRIVADO_PATH] = { exists: true, data: { user: '', pass: '' } };

    const repo = new WorkspaceRepo(WS);
    const conn = await repo.getOrthancConnection();

    expect(conn).toBeNull();
  });
});
