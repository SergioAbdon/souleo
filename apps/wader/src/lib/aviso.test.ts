import { describe, it, expect } from 'vitest';
import { calcularAviso } from './aviso';

const base = { agoraMs: 10_000_000, ultimoOrthancOkEm: 10_000_000 - 1000, versaoDisponivel: null, souLider: true, outraMaquina: null, versaoRejeitada: null, versaoAtual: '1.0.0' };

describe('calcularAviso (spec §9)', () => {
  it('tudo bem → null', () => expect(calcularAviso(base)).toBeNull());
  it('Orthanc sem resposta há > 5 min → "Wader sem Orthanc" (só líder)', () => {
    expect(calcularAviso({ ...base, ultimoOrthancOkEm: base.agoraMs - 5 * 60_000 - 1 })).toBe('Wader sem Orthanc');
    expect(calcularAviso({ ...base, ultimoOrthancOkEm: base.agoraMs - 5 * 60_000 })).toBeNull();
    expect(calcularAviso({ ...base, souLider: false, outraMaquina: null, ultimoOrthancOkEm: 0 })).toBeNull();
  });
  it('versão disponível', () => expect(calcularAviso({ ...base, versaoDisponivel: '1.0.1' })).toBe('Wader v1.0.1 disponível — abra o painel pra atualizar'));
  it('não-líder → "Outro Wader ativo em X" e ganha de tudo', () => {
    expect(calcularAviso({ ...base, souLider: false, outraMaquina: 'NOTEBOOK', versaoDisponivel: '9', ultimoOrthancOkEm: 0 })).toBe('Outro Wader ativo em NOTEBOOK');
  });
  it('versão rejeitada → "voltou pra vY: a vX caiu 3 vezes", antes de "versão disponível"', () => {
    expect(calcularAviso({ ...base, versaoRejeitada: '1.0.1', versaoDisponivel: '1.0.1' })).toBe('Wader voltou pra v1.0.0: a v1.0.1 caiu 3 vezes');
  });
  it('sem Orthanc ganha de versão', () => {
    expect(calcularAviso({ ...base, ultimoOrthancOkEm: 0, versaoDisponivel: '1.0.1' })).toBe('Wader sem Orthanc');
  });
});
