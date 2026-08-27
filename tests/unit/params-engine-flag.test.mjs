// ══════════════════════════════════════════════════════════════════
// Kill-switch gêmeo `leo:params-engine` (senna93Params) — F3 Task 1.
// Stub de globalThis.window + localStorage (sem window de verdade no
// node:test). Cobre a precedência (idêntica à de senna90Primario:
// off > on > env) E a REGRA extra: senna90Primario() OFF derruba
// senna93Params() incondicionalmente.
// ══════════════════════════════════════════════════════════════════
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  senna90Primario, setSenna90Primario,
  senna93Params, setSenna93Params, limparParamsEngine,
} from '../../src/lib/primary-engine-flag.ts';

const PRIMARY_KEY = 'leo:primary-engine';
const PARAMS_KEY = 'leo:params-engine';

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
}

let originalWindow;
let originalLocalStorage;
let originalPrimaryEnv;
let originalParamsEnv;

beforeEach(() => {
  originalWindow = globalThis.window;
  originalLocalStorage = globalThis.localStorage;
  originalPrimaryEnv = process.env.NEXT_PUBLIC_PRIMARY_ENGINE;
  originalParamsEnv = process.env.NEXT_PUBLIC_PARAMS_ENGINE;

  globalThis.window = {};
  globalThis.localStorage = fakeLocalStorage();
  delete process.env.NEXT_PUBLIC_PRIMARY_ENGINE;
  delete process.env.NEXT_PUBLIC_PARAMS_ENGINE;
});

afterEach(() => {
  globalThis.window = originalWindow;
  globalThis.localStorage = originalLocalStorage;
  if (originalPrimaryEnv === undefined) delete process.env.NEXT_PUBLIC_PRIMARY_ENGINE;
  else process.env.NEXT_PUBLIC_PRIMARY_ENGINE = originalPrimaryEnv;
  if (originalParamsEnv === undefined) delete process.env.NEXT_PUBLIC_PARAMS_ENGINE;
  else process.env.NEXT_PUBLIC_PARAMS_ENGINE = originalParamsEnv;
});

describe('senna93Params — REGRA: depende de senna90Primario() ON', () => {
  test('senna90Primario OFF → false MESMO com device e env ligados', () => {
    // senna90 nunca foi ligado (sem device override, sem env) → OFF.
    assert.equal(senna90Primario(), false);
    localStorage.setItem(PARAMS_KEY, 'senna93');
    process.env.NEXT_PUBLIC_PARAMS_ENGINE = 'senna93';
    assert.equal(senna93Params(), false);
  });
});

describe('senna93Params — precedência (com senna90Primario ligado)', () => {
  test('off por device vence env global', () => {
    setSenna90Primario(true);
    process.env.NEXT_PUBLIC_PARAMS_ENGINE = 'senna93';
    localStorage.setItem(PARAMS_KEY, 'off');
    assert.equal(senna93Params(), false);
  });

  test('on por device liga independente do env', () => {
    setSenna90Primario(true);
    localStorage.setItem(PARAMS_KEY, 'senna93');
    assert.equal(senna93Params(), true);
  });

  test('env global liga quando não há override por device', () => {
    setSenna90Primario(true);
    process.env.NEXT_PUBLIC_PARAMS_ENGINE = 'senna93';
    assert.equal(senna93Params(), true);
  });

  test('sem device e sem env → false', () => {
    setSenna90Primario(true);
    assert.equal(senna93Params(), false);
  });
});

describe('senna93Params — SSR-safe', () => {
  test('sem window → false, mesmo com senna90 ligado por env', () => {
    process.env.NEXT_PUBLIC_PRIMARY_ENGINE = 'senna90';
    delete globalThis.window;
    assert.equal(senna93Params(), false);
  });
});

describe('setSenna93Params / limparParamsEngine', () => {
  test('setSenna93Params(true) grava PARAMS_VAL na chave leo:params-engine', () => {
    setSenna93Params(true);
    assert.equal(localStorage.getItem(PARAMS_KEY), 'senna93');
  });

  test('setSenna93Params(false) grava off (kill-switch)', () => {
    setSenna93Params(false);
    assert.equal(localStorage.getItem(PARAMS_KEY), 'off');
  });

  test('limparParamsEngine remove o override do device', () => {
    setSenna93Params(true);
    assert.equal(localStorage.getItem(PARAMS_KEY), 'senna93');
    limparParamsEngine();
    assert.equal(localStorage.getItem(PARAMS_KEY), null);
  });

  test('setSenna93Params/limparParamsEngine não tocam a chave leo:primary-engine', () => {
    setSenna90Primario(true);
    setSenna93Params(true);
    assert.equal(localStorage.getItem(PRIMARY_KEY), 'senna90');
    limparParamsEngine();
    assert.equal(localStorage.getItem(PRIMARY_KEY), 'senna90');
  });
});
