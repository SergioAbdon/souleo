import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerDicomRoutes } from './dicom';

describe('POST /api/dicom/worker/reset-cursor', () => {
  it('reseta o cursor (cadeado é da guarda central — guarda-lider.test.ts)', async () => {
    const worker = { resetCursor: vi.fn(), getStatus: () => ({}) };
    const app = Fastify();
    registerDicomRoutes(app, {} as any, worker as any, {} as any);
    const r = await app.inject({ method: 'POST', url: '/api/dicom/worker/reset-cursor' });
    expect(r.statusCode).toBe(200);
    expect(worker.resetCursor).toHaveBeenCalledTimes(1);
  });
});
