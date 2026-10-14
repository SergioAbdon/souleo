// Retry curto (src/lib/retry.ts) — origem: 500 único a frio na rota de
// assinatura da galeria, clínica 14/10/2026.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./ts-relative-resolve-hook.mjs', import.meta.url);

const { tentar, ErroHttp, retentavel } = await import('../../src/lib/retry.ts');

const semDormir = async () => {};

describe('tentar', () => {
  test('sucesso de primeira não repete', async () => {
    let n = 0;
    const r = await tentar(async () => { n++; return 'ok'; }, { dormir: semDormir });
    assert.equal(r, 'ok');
    assert.equal(n, 1);
  });

  test('falha a frio e sucesso na 2ª — o caso da clínica', async () => {
    let n = 0;
    const pausas = [];
    const r = await tentar(async () => {
      n++;
      if (n === 1) throw new ErroHttp(500);
      return 'ok';
    }, { dormir: async (ms) => { pausas.push(ms); } });
    assert.equal(r, 'ok');
    assert.equal(n, 2);
    assert.deepEqual(pausas, [800]);
  });

  test('esgota as tentativas e propaga o último erro', async () => {
    let n = 0;
    await assert.rejects(
      tentar(async () => { n++; throw new ErroHttp(503); }, { tentativas: 3, dormir: semDormir }),
      (e) => e instanceof ErroHttp && e.status === 503,
    );
    assert.equal(n, 3);
  });

  test('4xx não repete (retentar=retentavel)', async () => {
    let n = 0;
    await assert.rejects(
      tentar(async () => { n++; throw new ErroHttp(403); }, { retentar: retentavel, dormir: semDormir }),
      (e) => e.status === 403,
    );
    assert.equal(n, 1);
  });

  test('falha de rede (sem status) repete', async () => {
    let n = 0;
    const r = await tentar(async () => {
      n++;
      if (n < 3) throw new TypeError('Failed to fetch');
      return n;
    }, { retentar: retentavel, dormir: semDormir });
    assert.equal(r, 3);
  });

  test('tentativas=1 equivale a sem retry', async () => {
    let n = 0;
    await assert.rejects(tentar(async () => { n++; throw new Error('x'); }, { tentativas: 1, dormir: semDormir }));
    assert.equal(n, 1);
  });
});

describe('retentavel', () => {
  test('5xx sim, 4xx não, erro genérico sim', () => {
    assert.equal(retentavel(new ErroHttp(500)), true);
    assert.equal(retentavel(new ErroHttp(502)), true);
    assert.equal(retentavel(new ErroHttp(401)), false);
    assert.equal(retentavel(new ErroHttp(404)), false);
    assert.equal(retentavel(new Error('rede')), true);
  });
});
