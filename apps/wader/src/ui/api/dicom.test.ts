import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerDicomRoutes } from './dicom';

function montar(souLider: () => boolean) {
  const worker = { resetCursor: vi.fn(), getStatus: () => ({}) };
  const app = Fastify();
  registerDicomRoutes(app, {} as any, worker as any, {} as any, souLider);
  return { app, worker };
}

describe('POST /api/dicom/worker/reset-cursor', () => {
  it('não-líder → 409 nao_lider e não mexe no cursor', async () => {
    const { app, worker } = montar(() => false);
    const r = await app.inject({ method: 'POST', url: '/api/dicom/worker/reset-cursor' });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ ok: false, error: 'nao_lider' });
    expect(worker.resetCursor).not.toHaveBeenCalled();
  });
  it('líder → reseta', async () => {
    const { app, worker } = montar(() => true);
    const r = await app.inject({ method: 'POST', url: '/api/dicom/worker/reset-cursor' });
    expect(r.statusCode).toBe(200);
    expect(worker.resetCursor).toHaveBeenCalledTimes(1);
  });
});
