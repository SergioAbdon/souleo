// S7-T0.2 (achado P7): o Chromium tem que sobreviver à invocação. Aqui o
// lançador é falso (contador de launches) — nada de Chrome de verdade, o que
// interessa é a DECISÃO de relançar ou reusar.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { obterBrowser, descartarBrowser, ehErroDeConexao } from '../../src/lib/pdf-browser.ts';

function fabrica() {
  const estado = { launches: 0, fechados: 0 };
  const lancar = async () => {
    estado.launches++;
    return {
      connected: true,
      close: async () => { estado.fechados++; },
    };
  };
  return { estado, lancar };
}

describe('obterBrowser — reuso entre invocações', () => {
  beforeEach(() => descartarBrowser());   // estado é de módulo: zera entre casos

  test('2 chamadas sequenciais → 1 launch só', async () => {
    const { estado, lancar } = fabrica();
    const a = await obterBrowser(lancar);
    const b = await obterBrowser(lancar);
    assert.equal(estado.launches, 1);
    assert.equal(a, b);
  });

  test('browser desconectado → relança', async () => {
    const { estado, lancar } = fabrica();
    const a = await obterBrowser(lancar);
    a.connected = false;                  // morreu entre invocações
    const b = await obterBrowser(lancar);
    assert.equal(estado.launches, 2);
    assert.notEqual(a, b);
  });

  test('chamadas concorrentes → 1 launch (trava)', async () => {
    const { estado, lancar } = fabrica();
    const [a, b, c] = await Promise.all([obterBrowser(lancar), obterBrowser(lancar), obterBrowser(lancar)]);
    assert.equal(estado.launches, 1);
    assert.equal(a, b);
    assert.equal(b, c);
  });

  test('launch que falha não deixa a trava presa', async () => {
    let tentativas = 0;
    const lancar = async () => {
      if (++tentativas === 1) throw new Error('Chrome nao encontrado');
      return { connected: true, close: async () => {} };
    };
    await assert.rejects(() => obterBrowser(lancar), /Chrome nao encontrado/);
    const b = await obterBrowser(lancar);   // a próxima invocação tem que conseguir
    assert.equal(tentativas, 2);
    assert.ok(b.connected);
  });

  test('descartarBrowser fecha o antigo e força relançar', async () => {
    const { estado, lancar } = fabrica();
    await obterBrowser(lancar);
    descartarBrowser();
    await obterBrowser(lancar);
    assert.equal(estado.launches, 2);
    assert.equal(estado.fechados, 1);
  });
});

describe('ehErroDeConexao — só browser morto autoriza o retry', () => {
  // Ponytail R2: só frases que o puppeteer-core REALMENTE lança — "target
  // detached", "session detached" e "browser has disconnected" saíram da
  // regex (nunca vêm dele) e saem daqui também.
  for (const msg of [
    'Connection closed.',
    'Protocol error (X): Session closed.',
    'Target closed',
    'Navigating frame was detached',
  ]) {
    test(`retry em: ${msg}`, () => assert.equal(ehErroDeConexao(new Error(msg)), true));
  }
  for (const msg of [
    'imagem não assinada — emissão abortada',
    'Navigation timeout of 30000 ms exceeded',
    'Chrome nao encontrado',
    // M5: erro do DOM do laudo, não do browser. Com `protocol error`/`detached`
    // soltos na regex isto relançava o Chromium e pagava outro render inteiro.
    'Protocol error (DOM.describeNode): Node is detached from document',
  ]) {
    test(`NÃO repete: ${msg}`, () => assert.equal(ehErroDeConexao(new Error(msg)), false));
  }
});
