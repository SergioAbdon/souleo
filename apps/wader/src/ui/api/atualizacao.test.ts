import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerAtualizacaoRoutes } from './atualizacao';

const config = { ui: { port: 8043 }, adminPin: '123456' } as any;
let sair: ReturnType<typeof vi.fn>;
let baixar: ReturnType<typeof vi.fn>;
let release: { versao: string; assets: Record<string, string> } | null;
let prev: boolean;

function makeApp() {
  const app = Fastify();
  registerAtualizacaoRoutes(app, config, {
    release: () => release,
    baixar,
    sair: sair as any,
    prevExiste: () => prev,
    dirUpdates: () => 'X',
  });
  return app;
}

beforeEach(() => {
  sair = vi.fn(); baixar = vi.fn(async () => {}); prev = true;
  release = { versao: '1.0.1', assets: { 'wader.exe': 'u', 'wader.exe.sha256': 's' } };
});

// sairDepois usa setTimeout(300 ms) real: fake timers + app.inject travam, então espera-se de verdade.
const esperarSaida = () => new Promise((r) => setTimeout(r, 400));

const post = (app: ReturnType<typeof makeApp>, url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url, headers });

describe('POST /api/admin/atualizar', () => {
  it('sem PIN → 401 e nada acontece', async () => {
    const r = await post(makeApp(), '/api/admin/atualizar');
    expect(r.statusCode).toBe(401);
    expect(baixar).not.toHaveBeenCalled();
    expect(sair).not.toHaveBeenCalled();
  });
  it('Origin estranho → 403 mesmo com PIN certo', async () => {
    const r = await post(makeApp(), '/api/admin/atualizar', { 'x-wader-pin': '123456', origin: 'http://evil.test' });
    expect(r.statusCode).toBe(403);
  });
  it('5 PINs errados → 429', async () => {
    const app = makeApp();
    for (let i = 0; i < 4; i++) expect((await post(app, '/api/admin/atualizar', { 'x-wader-pin': '0' })).statusCode).toBe(401);
    expect((await post(app, '/api/admin/atualizar', { 'x-wader-pin': '0' })).statusCode).toBe(429);
    expect((await post(app, '/api/admin/atualizar', { 'x-wader-pin': '123456' })).statusCode).toBe(429);
  });
  it('PIN certo, versão disponível → baixa, responde e sai com 10 + pedido {atualizar}', async () => {
    const r = await post(makeApp(), '/api/admin/atualizar', { 'x-wader-pin': '123456', origin: 'http://127.0.0.1:8043' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, versao: '1.0.1' });
    expect(baixar).toHaveBeenCalledWith(release, 'X');
    await esperarSaida();
    expect(sair).toHaveBeenCalledWith(10, { atualizar: '1.0.1', motivo: 'atualizacao' });
  });
  it('sem versão nova → 409; download falhou → 502 e não sai', async () => {
    release = null;
    expect((await post(makeApp(), '/api/admin/atualizar', { 'x-wader-pin': '123456' })).statusCode).toBe(409);
    release = { versao: '1.0.1', assets: {} };
    baixar = vi.fn(async () => { throw new Error('sem asset'); });
    const r = await post(makeApp(), '/api/admin/atualizar', { 'x-wader-pin': '123456' });
    expect(r.statusCode).toBe(502);
    await esperarSaida();
    expect(sair).not.toHaveBeenCalled();
  });
  it('dois cliques seguidos: um baixa (200), o outro leva 409 em_andamento', async () => {
    baixar = vi.fn(() => new Promise<void>((r) => setTimeout(r, 200)));
    const app = makeApp();
    const h = { 'x-wader-pin': '123456' };
    const p1 = post(app, '/api/admin/atualizar', h);
    const p2 = post(app, '/api/admin/atualizar', h);
    const rs = await Promise.all([p1, p2]);
    expect(rs.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(rs.find((r) => r.statusCode === 409)!.json()).toEqual({ ok: false, error: 'em_andamento' });
    expect(baixar).toHaveBeenCalledTimes(1);
    await esperarSaida();
  });
  it('sem adminPin na config → 503', async () => {
    const app = Fastify();
    registerAtualizacaoRoutes(app, { ui: { port: 8043 } } as any, { release: () => release, baixar, sair: sair as any, prevExiste: () => true, dirUpdates: () => 'X' });
    expect((await post(app, '/api/admin/atualizar', { 'x-wader-pin': '123456' })).statusCode).toBe(503);
  });
});

describe('POST /api/admin/voltar', () => {
  it('com .prev → sai com 10 + pedido {voltar}', async () => {
    const r = await post(makeApp(), '/api/admin/voltar', { 'x-wader-pin': '123456' });
    expect(r.statusCode).toBe(200);
    await esperarSaida();
    expect(sair).toHaveBeenCalledWith(10, { voltar: true, motivo: 'rollback' });
  });
  it('sem .prev → 409', async () => {
    prev = false;
    expect((await post(makeApp(), '/api/admin/voltar', { 'x-wader-pin': '123456' })).statusCode).toBe(409);
    expect(sair).not.toHaveBeenCalled();
  });
});

describe('saída agendada bloqueia as duas rotas', () => {
  const h = { 'x-wader-pin': '123456' };
  it('/atualizar 200 → /voltar imediato leva 409 saindo; sai uma vez só', async () => {
    const app = makeApp();
    expect((await post(app, '/api/admin/atualizar', h)).statusCode).toBe(200);
    const r = await post(app, '/api/admin/voltar', h);
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ ok: false, error: 'saindo' });
    await esperarSaida();
    expect(sair).toHaveBeenCalledTimes(1);
  });
  it('/voltar 200 → /atualizar leva 409 saindo e não baixa', async () => {
    const app = makeApp();
    expect((await post(app, '/api/admin/voltar', h)).statusCode).toBe(200);
    const r = await post(app, '/api/admin/atualizar', h);
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ ok: false, error: 'saindo' });
    expect(baixar).not.toHaveBeenCalled();
    await esperarSaida();
    expect(sair).toHaveBeenCalledTimes(1);
  });
});
