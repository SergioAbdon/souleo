import { createLogger } from '../logger';

const log = createLogger({ module: 'lider' });

/**
 * Cadeado de Wader único (spec §7): `workspaces/{ws}/integracoes/wader.lider`.
 * Quem decide ligar os workers é o index.ts; os workers não sabem disso.
 *   - aquisição na subida (transação): pega se ausente, expirado ou meu;
 *   - renovação a cada 30 s (transação): só se agentId E geracao são meus;
 *   - descobriu outro dono, ou 90 s sem conseguir renovar → aoPerder('lider')
 *     (em produção: pedido.json {lider} + exit 3 — o cursor persistido do
 *     ADR 2026-05-18 torna o reinício seguro).
 * `ate` é ms epoch (número): simples dos dois lados.
 */
export const VALIDADE_MS = 90_000;

export interface Eu { agentId: string; maquina: string }
export interface DocLider { agentId: string; maquina: string; ate: number; geracao: number }

/** Só o que precisamos do Firestore Admin — facilita o fake no teste. */
export interface DbTx {
  doc(path: string): unknown;
  runTransaction<T>(fn: (tx: {
    get(ref: unknown): Promise<{ data(): Record<string, unknown> | undefined }>;
    set(ref: unknown, data: Record<string, unknown>, opts?: { merge: boolean }): void;
  }) => Promise<T>): Promise<T>;
}

const caminho = (wsId: string) => `workspaces/${wsId}/integracoes/wader`;

export async function tentarAdquirir(
  db: DbTx, wsId: string, eu: Eu, agoraMs: number,
): Promise<{ ok: true; geracao: number } | { ok: false; maquina: string }> {
  const ref = db.doc(caminho(wsId));
  return db.runTransaction(async (tx) => {
    const l = (await tx.get(ref)).data()?.lider as DocLider | undefined;
    const livre = !l || l.ate < agoraMs || l.agentId === eu.agentId;
    if (!livre) return { ok: false as const, maquina: l.maquina };
    const geracao = (l?.geracao ?? 0) + 1;
    tx.set(ref, { lider: { agentId: eu.agentId, maquina: eu.maquina, ate: agoraMs + VALIDADE_MS, geracao } }, { merge: true });
    return { ok: true as const, geracao };
  });
}

export async function renovar(db: DbTx, wsId: string, eu: Eu, geracao: number, agoraMs: number): Promise<boolean> {
  const ref = db.doc(caminho(wsId));
  return db.runTransaction(async (tx) => {
    const l = (await tx.get(ref)).data()?.lider as DocLider | undefined;
    if (!l || l.agentId !== eu.agentId || l.geracao !== geracao) return false;
    tx.set(ref, { lider: { ...l, ate: agoraMs + VALIDADE_MS } }, { merge: true });
    return true;
  });
}

export interface LiderOpts {
  db: DbTx;
  wsId: string;
  eu: Eu;
  aoVirarLider: () => void;
  aoPerder: (motivo: 'lider') => void;
  agora?: () => number;
  intervaloAquisicaoMs?: number;
  intervaloRenovacaoMs?: number;
}

export function iniciarLider(o: LiderOpts): { parar(): void; souLider(): boolean; outraMaquina(): string | null } {
  const agora = o.agora ?? Date.now;
  let geracao: number | null = null;
  let outra: string | null = null;
  let ultimaRenovacaoOk = 0;
  let timer: NodeJS.Timeout | null = null;
  let parado = false;

  const perder = () => {
    if (parado) return;
    parado = true;
    if (timer) clearInterval(timer);
    o.aoPerder('lider');
  };

  const renovarAgora = async () => {
    // Prazo por relógio: uma transação pendurada (rede morta) nunca rejeita, então
    // o teste tem de rodar a cada tick, antes de tentar — não só quando falha.
    if (agora() - ultimaRenovacaoOk >= VALIDADE_MS) {
      log.warn('90 s sem renovar o cadeado — saindo');
      perder();
      return;
    }
    const t = agora(); // o `ate` gravado nasce de t; é a partir dele que o prazo conta
    try {
      const ok = await renovar(o.db, o.wsId, o.eu, geracao!, t);
      if (!ok) { log.warn('Outro Wader tomou a liderança'); perder(); return; }
      ultimaRenovacaoOk = t;
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'Renovação do cadeado falhou');
    }
  };

  let emVoo = false;
  const adquirirAgora = async () => {
    if (parado || emVoo) return;
    emVoo = true;
    try {
      const t = agora();
      // `l.ate < agoraMs` compara relógios de máquinas diferentes: skew desloca a
      // tomada pelo tamanho do skew (aceito — a janela é 90 s).
      const r = await tentarAdquirir(o.db, o.wsId, o.eu, t);
      if (parado) return;
      if (!r.ok) {
        outra = r.maquina;
        log.warn({ outra }, 'Outro Wader ativo — só UI; tento de novo em 1 min');
        return;
      }
      // Transação que demorou mais que a validade devolve um `ate` já vencido:
      // outro Wader pode ter pegado. Recusa e tenta no próximo ciclo.
      if (agora() - t >= VALIDADE_MS) {
        log.warn('Aquisição concluiu fora da validade — recusada; tento de novo');
        return;
      }
      geracao = r.geracao;
      outra = null;
      ultimaRenovacaoOk = t;
      if (timer) clearInterval(timer);
      timer = setInterval(() => void renovarAgora(), o.intervaloRenovacaoMs ?? 30_000);
      log.info({ geracao }, 'Sou o líder deste workspace');
      try {
        o.aoVirarLider();
      } catch (e) {
        log.fatal({ err: (e as Error).message }, 'Workers não subiram — larga o cadeado');
        perder();
      }
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'Aquisição do cadeado falhou — tento de novo');
    } finally {
      emVoo = false;
    }
  };

  timer = setInterval(() => { if (geracao === null) void adquirirAgora(); }, o.intervaloAquisicaoMs ?? 60_000);
  void adquirirAgora();

  return {
    parar: () => { parado = true; if (timer) clearInterval(timer); },
    souLider: () => geracao !== null && !parado,
    outraMaquina: () => outra,
  };
}
