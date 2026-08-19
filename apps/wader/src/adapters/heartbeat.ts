import os from 'os';
import { getDb } from './firebase';
import { createLogger } from '../logger';

const log = createLogger({ module: 'heartbeat' });

const INTERVALO_MS = 5 * 60 * 1000;

/**
 * Batimento do Wader (Sub-plano 5, D4): diz "estou aqui" para o cartão da tela
 * de Integrações distinguir "parado" de "sem exame hoje".
 * Falha em silêncio de propósito: batimento NUNCA pode derrubar a ingestão.
 */
export function iniciarBatimento(wsId: string, versao: string): () => void {
  const bater = async () => {
    try {
      await getDb().doc(`workspaces/${wsId}/integracoes/wader`).set(
        {
          tipo: 'wader',
          visto: new Date(),
          versao,
          maquina: os.hostname(),
        },
        { merge: true },
      );
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'Batimento falhou (segue o jogo)');
    }
  };
  void bater();
  const timer = setInterval(() => void bater(), INTERVALO_MS);
  return () => clearInterval(timer);
}
