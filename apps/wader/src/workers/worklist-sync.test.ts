import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ── Mock hojeClinica (fonte de "hoje" — não UTC) ───────────────────────
let hojeClinicaMock: string;
vi.mock('../lib/clinica-tempo', () => ({
  hojeClinica: () => hojeClinicaMock,
}));

// ── Mock wl-writer: salvarWl/deletarWl/listarWlExistentes não devem gerar
//    DICOM de verdade (dcmjs é pesado); hashCamposWl fica real.
const salvarWlMock = vi.fn();
const deletarWlMock = vi.fn(() => true);
const listarWlExistentesMock = vi.fn(() => [] as string[]);
vi.mock('./wl-writer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./wl-writer')>();
  return {
    ...actual,
    salvarWl: (...args: unknown[]) => salvarWlMock(...args),
    deletarWl: (...args: unknown[]) => deletarWlMock(...args),
    listarWlExistentes: (...args: unknown[]) => listarWlExistentesMock(...args),
  };
});

// ── Mock ExamesRepo/WorkspaceRepo ───────────────────────────────────────
let examesDoDia: Array<Record<string, unknown>>;
let marcarMwlCalls: Array<[string, string, string | undefined]>;
let limparMwlCalls: string[];
vi.mock('../adapters/exames-repo', () => ({
  ExamesRepo: class {
    async listarDoDia() {
      return examesDoDia;
    }
    async marcarMwl(id: string, status: string, wlHash?: string) {
      marcarMwlCalls.push([id, status, wlHash]);
    }
    async limparMwl(id: string) {
      limparMwlCalls.push(id);
    }
  },
}));

vi.mock('../adapters/workspace-repo', () => ({
  WorkspaceRepo: class {
    async getNomeClinica() {
      return 'Clinica Teste';
    }
  },
}));

import { syncWorklists } from './worklist-sync';
import { hashCamposWl } from './wl-writer';

const WS = 'ws1';
const HOJE = '2026-08-21';

function exame(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ex1',
    pacienteId: 'pac1',
    pacienteNome: 'FULANO',
    tipoExame: 'eco_tt',
    dataExame: HOJE,
    horarioChegada: '10:00',
    status: 'aguardando',
    origem: 'MANUAL',
    medicoUid: 'uid1',
    versao: 1,
    ...overrides,
  };
}

let worklistPath: string;

beforeEach(() => {
  hojeClinicaMock = HOJE;
  examesDoDia = [];
  marcarMwlCalls = [];
  limparMwlCalls = [];
  salvarWlMock.mockReset();
  deletarWlMock.mockReset().mockReturnValue(true);
  listarWlExistentesMock.mockReset().mockReturnValue([]);
  worklistPath = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-sync-'));
});

afterEach(() => {
  fs.rmSync(worklistPath, { recursive: true, force: true });
});

describe('syncWorklists', () => {
  it('regrava .wl quando wlHash do exame diverge do atual', async () => {
    examesDoDia = [exame({ wlHash: 'hash-velho', mwlStatus: 'ok' })];
    listarWlExistentesMock.mockReturnValue(['ex1.wl']);

    const result = await syncWorklists({ wsId: WS, worklistPath, data: HOJE });

    const hashReal = hashCamposWl(exame() as any, { scheduledProcedureStepLocation: 'Clinica Teste' });
    expect(salvarWlMock).toHaveBeenCalledTimes(1);
    expect(result.wlsCriados).toBe(1);
    expect(marcarMwlCalls).toEqual([['ex1', 'ok', hashReal]]);
  });

  it('marca mwlStatus ok no ramo intactos quando estava diferente', async () => {
    const hashReal = hashCamposWl(exame() as any, { scheduledProcedureStepLocation: 'Clinica Teste' });
    examesDoDia = [exame({ wlHash: hashReal, mwlStatus: 'falhou' })];
    listarWlExistentesMock.mockReturnValue(['ex1.wl']);

    const result = await syncWorklists({ wsId: WS, worklistPath, data: HOJE });

    expect(salvarWlMock).not.toHaveBeenCalled();
    expect(result.wlsIntactos).toBe(1);
    expect(marcarMwlCalls).toEqual([['ex1', 'ok', hashReal]]);
  });

  it('limpa mwlStatus quando o .wl é removido', async () => {
    examesDoDia = []; // nenhum exame elegível hoje — .wl da pasta ficou órfão
    listarWlExistentesMock.mockReturnValue(['orfao.wl']);

    const result = await syncWorklists({ wsId: WS, worklistPath, data: HOJE });

    expect(deletarWlMock).toHaveBeenCalledWith(worklistPath, 'orfao');
    expect(result.wlsRemovidos).toBe(1);
    expect(limparMwlCalls).toEqual(['orfao']);
  });

  it('NÃO remove .wl quando dataAlvo != hojeClinica (consulta de outro dia é só leitura)', async () => {
    hojeClinicaMock = HOJE;
    examesDoDia = [];
    listarWlExistentesMock.mockReturnValue(['orfao.wl']);

    const result = await syncWorklists({ wsId: WS, worklistPath, data: '2020-01-01' });

    expect(deletarWlMock).not.toHaveBeenCalled();
    expect(limparMwlCalls).toEqual([]);
    expect(result.wlsRemovidos).toBe(0);
  });
});
