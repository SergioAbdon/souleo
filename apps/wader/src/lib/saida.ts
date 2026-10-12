import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Saída do processo e a troca de bilhetes com o lançador (spec §3-§4).
 *
 * Dois arquivos, um dono cada:
 *   updates/pedido.json   — SÓ o exe escreve; o lançador lê e apaga.
 *   updates/lancador.json — SÓ o lançador escreve; o exe lê na subida.
 * Toda escrita é .tmp + rename (atômica no NTFS). Nada aqui toca a rede:
 * é o último ato antes de um process.exit.
 */
export const CODIGO = { CONFIG: 2, VIGIA: 3, ATUALIZACAO: 10 } as const;

export type Motivo = 'travado' | 'lider' | 'atualizacao' | 'rollback' | 'config';

export interface Pedido {
  atualizar?: string;
  voltar?: true;
  motivo: Motivo;
  em: string;
}

export interface Lancador {
  quedasSeguidas: number;
  versaoRejeitada?: string;
  versaoAplicada?: string;
  erro?: string;
  ultimaSaida?: { motivo: string; em: string };
}

export function dirUpdates(cwd: string = process.cwd()): string {
  return path.join(cwd, 'updates');
}

export function gravarPedido(pedido: Pedido, dir: string = dirUpdates()): void {
  fs.mkdirSync(dir, { recursive: true });
  const alvo = path.join(dir, 'pedido.json');
  fs.writeFileSync(alvo + '.tmp', JSON.stringify(pedido));
  fs.renameSync(alvo + '.tmp', alvo);
}

export function lerLancador(dir: string = dirUpdates()): Lancador | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'lancador.json'), 'utf-8')) as Lancador;
  } catch {
    return null;
  }
}

/** Grava o pedido (síncrono) e sai. Falha na gravação não impede a saída. */
export function sairCom(codigo: number, pedido: Omit<Pedido, 'em'>, dir?: string): never {
  try {
    gravarPedido({ ...pedido, em: new Date().toISOString() }, dir);
  } catch {
    // disco cheio / sem permissão: sair mesmo assim — o WinSW reinicia.
  }
  process.exit(codigo);
}
