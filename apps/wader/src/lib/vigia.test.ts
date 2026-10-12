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

  it('tick parado há mais de 2 min → dispara uma vez e para', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    const ultimo = new Date();
    const parar = iniciarVigia({ ultimoTickOkEm: () => ultimo, ligado: () => true, aoTravar });
    vi.advanceTimersByTime(2 * 60_000);       // exatamente 2 min: ainda não (> e não ≥)
    expect(aoTravar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(aoTravar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(aoTravar).toHaveBeenCalledTimes(1);
    parar();
  });

  it('worker nunca completou um tick: conta a partir do início do vigia', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    const parar = iniciarVigia({ ultimoTickOkEm: () => null, ligado: () => true, aoTravar });
    vi.advanceTimersByTime(2 * 60_000);
    expect(aoTravar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(aoTravar).toHaveBeenCalledTimes(1);
    parar();
  });

  it('religar o worker depois de 1 h desligado: carimbo velho não dispara; conta do zero', () => {
    vi.useFakeTimers();
    const aoTravar = vi.fn();
    let ligado = false;
    const ultimo = new Date(); // t=0, nunca mais atualizado
    const parar = iniciarVigia({ ultimoTickOkEm: () => ultimo, ligado: () => ligado, aoTravar });
    vi.advanceTimersByTime(60 * 60_000);
    ligado = true;
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(30_000); // +30, +60, +90, +120 s
      expect(aoTravar).not.toHaveBeenCalled();
    }
    vi.advanceTimersByTime(30_000); // +150 s
    expect(aoTravar).toHaveBeenCalledTimes(1);
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
