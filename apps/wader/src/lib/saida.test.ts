import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { gravarPedido, lerLancador, CODIGO } from './saida';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wader-saida-'));
}

describe('saida', () => {
  it('gravarPedido escreve pedido.json sem deixar .tmp e cria a pasta', () => {
    const dir = path.join(tmp(), 'updates');
    gravarPedido({ atualizar: '1.2.0', motivo: 'atualizacao', em: '2026-10-11T00:00:00.000Z' }, dir);
    expect(fs.readdirSync(dir)).toEqual(['pedido.json']);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'pedido.json'), 'utf-8'))).toEqual({
      atualizar: '1.2.0', motivo: 'atualizacao', em: '2026-10-11T00:00:00.000Z',
    });
  });

  it('lerLancador devolve null sem arquivo ou com JSON quebrado', () => {
    const dir = tmp();
    expect(lerLancador(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'lancador.json'), '{nope');
    expect(lerLancador(dir)).toBeNull();
  });

  it('lerLancador lê o que o lançador gravou', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'lancador.json'), JSON.stringify({ quedasSeguidas: 2, erro: 'sha' }));
    expect(lerLancador(dir)).toEqual({ quedasSeguidas: 2, erro: 'sha' });
  });

  it('códigos de saída da spec §3', () => {
    expect(CODIGO).toEqual({ CONFIG: 2, VIGIA: 3, ATUALIZACAO: 10 });
  });
});
