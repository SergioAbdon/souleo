import { describe, it, expect } from 'vitest';
import { GuardaPin, origemPermitida } from './pin';

describe('GuardaPin', () => {
  it('pin certo → ok; errado → errado; ausente → errado', () => {
    const g = new GuardaPin('123456');
    expect(g.verificar('123456')).toBe('ok');
    expect(g.verificar('000000')).toBe('errado');
    expect(g.verificar(undefined)).toBe('errado');
    expect(g.verificar('12345')).toBe('errado'); // tamanho diferente não lança
  });
  it('5 erros → bloqueado 15 min, até o pin certo; depois libera', () => {
    let t = 0;
    const g = new GuardaPin('123456', () => t);
    for (let i = 0; i < 4; i++) expect(g.verificar('x')).toBe('errado');
    expect(g.verificar('x')).toBe('bloqueado');
    expect(g.verificar('123456')).toBe('bloqueado');
    t = 15 * 60_000 - 1;
    expect(g.verificar('123456')).toBe('bloqueado');
    t = 15 * 60_000;
    expect(g.verificar('123456')).toBe('ok');
  });
  it('acerto zera a contagem de erros', () => {
    const g = new GuardaPin('123456');
    for (let i = 0; i < 4; i++) g.verificar('x');
    g.verificar('123456');
    for (let i = 0; i < 4; i++) expect(g.verificar('x')).toBe('errado');
  });
});

describe('origemPermitida', () => {
  it('sem Origin (curl, fetch same-origin antigo) → permitido', () => expect(origemPermitida(undefined, 8043)).toBe(true));
  it('127.0.0.1 e localhost na porta certa → permitido', () => {
    expect(origemPermitida('http://127.0.0.1:8043', 8043)).toBe(true);
    expect(origemPermitida('http://localhost:8043', 8043)).toBe(true);
  });
  it('outra origem, outra porta, https, null → recusado', () => {
    expect(origemPermitida('http://evil.test', 8043)).toBe(false);
    expect(origemPermitida('http://localhost:9999', 8043)).toBe(false);
    expect(origemPermitida('null', 8043)).toBe(false);
  });
});
