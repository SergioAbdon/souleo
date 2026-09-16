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

// Sub-plano 5, Task 7 (item A) — feegowProcMap tinha DOIS donos: a tela nova
// (Task 4) grava em integracoes/feegow.procMap, mas este leitor ainda lia o
// campo antigo workspaces/{wsId}.feegowProcMap (no-op silencioso pra tela nova).
describe('WorkspaceRepo.getProcedimentos', () => {
  const FEEGOW_INTEGRACAO_PATH = `workspaces/${WS}/integracoes/feegow`;
  const WORKSPACE_PATH = `workspaces/${WS}`;

  beforeEach(() => {
    docs = {};
  });

  it('le o mapa do lugar NOVO (integracoes/feegow.procMap)', async () => {
    docs[FEEGOW_INTEGRACAO_PATH] = { exists: true, data: { procMap: { '6': 'eco_tt', '67': 'doppler_carotidas' } } };

    const repo = new WorkspaceRepo(WS);
    const procs = await repo.getProcedimentos();

    expect(procs.map(p => p.tipo).sort()).toEqual(['doppler_carotidas', 'eco_tt']);
  });

  it('campo antigo workspaces/{wsId}.feegowProcMap e IGNORADO (mesmo com dado la)', async () => {
    docs[WORKSPACE_PATH] = { exists: true, data: { feegowProcMap: { '6': 'eco_tt' } } };
    // integracoes/feegow nao existe -> lista vazia (Task 8, achado 15), NAO o campo antigo.

    const repo = new WorkspaceRepo(WS);
    const procs = await repo.getProcedimentos();

    expect(procs).toEqual([]);
  });

  it('integracoes/feegow.procMap vazio -> lista vazia (procMap nao configurado)', async () => {
    docs[FEEGOW_INTEGRACAO_PATH] = { exists: true, data: { procMap: {} } };

    const repo = new WorkspaceRepo(WS);
    const procs = await repo.getProcedimentos();

    expect(procs).toEqual([]);
  });
});
