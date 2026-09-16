import { describe, it, expect } from 'vitest';
import { hojeClinica } from './clinica-tempo';

describe('hojeClinica', () => {
  it('23h30 em Belém (ainda dentro do dia local, UTC também no mesmo dia)', () => {
    expect(hojeClinica(new Date('2026-08-19T23:30:00-03:00'))).toBe('2026-08-19');
  });

  it('21h30 em Belém quando UTC já virou o dia (o bug das 21h)', () => {
    expect(hojeClinica(new Date('2026-08-20T00:30:00Z'))).toBe('2026-08-19');
  });

  it('sem argumento usa Date.now()', () => {
    expect(hojeClinica()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
