/**
 * Vigia (spec §6): se o ciclo de ingestão não termina um tick há mais de
 * `limiteMs` enquanto o worker está ligado, chama `aoTravar` — que em
 * produção grava pedido.json {motivo:'travado'} e sai com código 3, pro
 * WinSW reiniciar. Cobre o loop preso num write de 07/10. Não cobre
 * congelamento total do processo (fase C vê pelo batimento parado).
 */
export interface VigiaOpts {
  ultimoTickOkEm: () => Date | null;
  ligado: () => boolean;
  aoTravar: () => void;
  limiteMs?: number;
  intervaloMs?: number;
  agora?: () => number;
}

export function iniciarVigia(o: VigiaOpts): () => void {
  const limite = o.limiteMs ?? 2 * 60_000;
  const intervalo = o.intervaloMs ?? 30_000;
  const agora = o.agora ?? Date.now;
  let base = agora();
  let disparou = false;
  const timer = setInterval(() => {
    if (!o.ligado()) {
      base = agora(); // desligado não conta; ao religar, conta do zero
      return;
    }
    // Nunca mais velho que o reset de base: carimbo antigo de antes do worker
    // ser desligado não pode disparar o vigia no instante em que religa.
    const referencia = Math.max(o.ultimoTickOkEm()?.getTime() ?? 0, base);
    if (agora() - referencia > limite && !disparou) {
      disparou = true; // one-shot: aoTravar sai do processo; não re-dispara
      clearInterval(timer);
      o.aoTravar();
    }
  }, intervalo);
  return () => clearInterval(timer);
}
