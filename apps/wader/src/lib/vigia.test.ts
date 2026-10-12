import { describe, it, expect, vi, afterEach } from 'vitest';
import { iniciarVigia } from './vigia';

describe('iniciarVigia', () => {
  afterEach(() => vi.useRealTimers());

  it('tick recente → não dispara', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    let ultimo = new Date();
    const parar = iniciarVigia({ ultimoTickOkEm: () => ultimo, ligado: () => true, aoTravar });
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(30_000);
      ultimo = new Date(); // tick acontecendo normalmente
    }
    expect(aoTravar).not.toHaveBeenCalled();
    parar();
  });

  it('tick parado há mais de 2 min → dispara uma vez por checagem', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    const ultimo = new Date();
    const parar = iniciarVigia({ ultimoTickOkEm: () => ultimo, ligado: () => true, aoTravar });
    vi.advanceTimersByTime(2 * 60_000);       // exatamente 2 min: ainda não (> e não ≥)
    expect(aoTravar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(aoTravar).toHaveBeenCalledTimes(1);
    parar();
  });

  it('worker nunca completou um tick: conta a partir do início do vigia', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    const parar = iniciarVigia({ ultimoTickOkEm: () => null, ligado: () => true, aoTravar });
    vi.advanceTimersByTime(2 * 60_000 + 30_000);
    expect(aoTravar).toHaveBeenCalled();
    parar();
  });

  it('worker desligado (não-líder, parado pelo admin) → nunca dispara', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    const parar = iniciarVigia({ ultimoTickOkEm: () => null, ligado: () => false, aoTravar });
    vi.advanceTimersByTime(60 * 60_000);
    expect(aoTravar).not.toHaveBeenCalled();
    parar();
  });

  it('parar() cancela o timer', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    const parar = iniciarVigia({ ultimoTickOkEm: () => null, ligado: () => true, aoTravar });
    parar();
    vi.advanceTimersByTime(60 * 60_000);
    expect(aoTravar).not.toHaveBeenCalled();
  });
});
