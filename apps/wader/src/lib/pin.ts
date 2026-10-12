import { timingSafeEqual } from 'node:crypto';

/**
 * Segurança dos botões Atualizar/Voltar (spec §5, achado Codex 1):
 * PIN em tempo constante, 5 erros = 15 min bloqueado; Origin de página
 * aberta no navegador tem que ser o próprio Wader (CSRF).
 */
export class GuardaPin {
  private erros = 0;
  private bloqueadoAte = 0;

  constructor(private readonly pin: string, private readonly agora: () => number = Date.now) {}

  verificar(enviado: string | undefined): 'ok' | 'errado' | 'bloqueado' {
    const t = this.agora();
    if (t < this.bloqueadoAte) return 'bloqueado';
    const a = Buffer.from(String(enviado ?? ''));
    const b = Buffer.from(this.pin);
    const igual = a.length === b.length && timingSafeEqual(a, b);
    if (igual) {
      this.erros = 0;
      return 'ok';
    }
    this.erros += 1;
    if (this.erros >= 5) {
      this.erros = 0;
      this.bloqueadoAte = t + 15 * 60_000;
      return 'bloqueado';
    }
    return 'errado';
  }
}

export function origemPermitida(origin: string | undefined, porta: number): boolean {
  if (origin === undefined) return true; // curl / sem navegador
  return origin === `http://127.0.0.1:${porta}` || origin === `http://localhost:${porta}`;
}
