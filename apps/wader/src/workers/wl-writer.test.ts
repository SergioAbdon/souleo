import { describe, it, expect } from 'vitest';
import { horaHHMMParaDicom, hashCamposWl } from './wl-writer';
import { Exame } from '../types/exame';

function baseExame(overrides: Partial<Exame> = {}): Exame {
  return {
    id: 'ex1',
    pacienteId: 'pac1',
    pacienteNome: 'FULANO DE TAL',
    tipoExame: 'eco_tt',
    dataExame: '2026-08-21',
    horarioChegada: '10:00',
    status: 'aguardando',
    origem: 'MANUAL',
    medicoUid: 'uid1',
    versao: 1,
    ...overrides,
  };
}

describe('horaHHMMParaDicom', () => {
  it('aguenta HH:MM:SS e vazio', () => {
    expect(horaHHMMParaDicom('14:30')).toBe('143000');
    expect(horaHHMMParaDicom('14:30:00')).toBe('143000');
    expect(horaHHMMParaDicom('')).toBe('');
  });
});

describe('hashCamposWl', () => {
  it('é estável e muda quando um campo do dataset muda', () => {
    const exame = baseExame();
    const opts = { scheduledStationName: 'MEDCARDIO', scheduledProcedureStepLocation: 'Clinica X' };

    expect(hashCamposWl(exame, opts)).toBe(hashCamposWl(exame, opts));

    const outroNome = hashCamposWl(baseExame({ pacienteNome: 'CICRANO' }), opts);
    expect(outroNome).not.toBe(hashCamposWl(exame, opts));

    const outraLocation = hashCamposWl(exame, { ...opts, scheduledProcedureStepLocation: 'Clinica Y' });
    expect(outraLocation).not.toBe(hashCamposWl(exame, opts));
  });
});
