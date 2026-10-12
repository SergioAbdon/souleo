import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { montarHealth, HEALTH_SCHEMA } from './health';
import type { EstadoWader } from '../lib/estado';

const estado: EstadoWader = {
  versao: '1.0.0',
  iniciadoEm: 0,
  versaoDisponivel: { versao: '1.0.1', assets: {} },
  souLider: () => true,
  outraMaquina: () => null,
  ultimoOrthancOkEm: () => new Date(),
  lancador: { quedasSeguidas: 0, ultimaSaida: { motivo: 'atualizacao', em: '2026-10-11T11:00:00.000Z' } },
  prevExiste: () => true,
};

describe('contrato do /health', () => {
  it('schema 1 com exatamente as chaves da fixture que o Pester lê', () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../../installer/tests/health-exemplo.json'), 'utf-8'));
    const h = montarHealth(estado, new Date('2026-10-11T12:00:00.000Z'));
    expect(Object.keys(h).sort()).toEqual(Object.keys(fixture).sort());
    expect(h.schema).toBe(HEALTH_SCHEMA);
    expect(h).toEqual(fixture);
  });
  it('sem lançador e sem versão nova → nulos, não undefined (JSON precisa ter as chaves)', () => {
    const h = montarHealth({ ...estado, versaoDisponivel: null, lancador: null, prevExiste: () => false });
    expect(h.versaoDisponivel).toBeNull();
    expect(h.ultimaSaida).toBeNull();
    expect(h.versaoRejeitada).toBeNull();
    expect(h.erroLancador).toBeNull();
    expect(h.aviso).toBeNull();
    expect(h.prevExiste).toBe(false);
  });
});
