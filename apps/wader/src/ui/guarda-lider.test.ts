import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registrarGuardaLider } from './guarda-lider';

function montar(lider: boolean) {
  const app = Fastify();
  registrarGuardaLider(app, () => lider);
  const ok = async () => ({ ok: true });
  app.post('/api/x', ok);
  app.get('/api/x', ok);
  app.post('/api/admin/y', ok);
  app.post('/api/dicom/worker/stop', ok);
  return app;
}

describe('guarda central de não-líder', () => {
  it('POST /api/* → 409 nao_lider quando não-líder; 200 quando líder', async () => {
    const r = await montar(false).inject({ method: 'POST', url: '/api/x' });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ ok: false, error: 'nao_lider' });
    expect((await montar(true).inject({ method: 'POST', url: '/api/x' })).statusCode).toBe(200);
  });
  it('URL com escape (/%61pi/x) não escapa do cadeado: casa a rota /api/x → 409', async () => {
    expect((await montar(false).inject({ method: 'POST', url: '/%61pi/x' })).statusCode).toBe(409);
  });
  it('GET passa; /api/admin/* passa; */worker/stop passa', async () => {
    const app = montar(false);
    expect((await app.inject({ method: 'GET', url: '/api/x' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/admin/y' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/dicom/worker/stop' })).statusCode).toBe(200);
  });
});
