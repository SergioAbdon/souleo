import os from 'os';
import { getDb } from './firebase';
import { createLogger } from '../logger';

const log = createLogger({ module: 'heartbeat' });

const INTERVALO_MS = 5 * 60 * 1000;

/** Só o que o batimento precisa do WorkspaceRepo — facilita mockar em teste. */
export interface OrthancConnChecker {
  getOrthancConnection(): Promise<{ url: string; user: string; pass: string; ativo: boolean } | null>;
}

/** Só o que o batimento precisa do OrthancClient. */
export interface OrthancPinger {
  system(): Promise<unknown>;
}

/**
 * Batimento do Wader (Sub-plano 5, D4): diz "estou aqui" para o cartão da tela
 * de Integrações distinguir "parado" de "sem exame hoje".
 * Falha em silêncio de propósito: batimento NUNCA pode derrubar a ingestão.
 *
 * D1 (correção Seção 3): a nuvem não alcança mais o Orthanc — quem verifica
 * agora é o Wader, daqui de dentro da rede da clínica, e reporta pro cartão
 * de Integrações. A checagem vive num try PRÓPRIO: sua falha nunca derruba
 * a gravação de `visto` do batimento do wader.
 */
export function iniciarBatimento(
  wsId: string,
  versao: string,
  repo: OrthancConnChecker,
  client: OrthancPinger,
  extras?: { ultimoErroIngest?: () => string | null },
): () => void {
  const bater = async () => {
    const ref = getDb().doc(`workspaces/${wsId}/integracoes/wader`);
    const eu = os.hostname();

    // Detecção de 2 Waders ativos no mesmo workspace (achado 11): lê o doc
    // ANTES de sobrescrever. Máquina diferente + visto há < 10min = a outra
    // instância ainda está batendo — vira conflito visível no cartão de
    // Integrações. Vive num try PRÓPRIO: falha na leitura nunca derruba a
    // gravação de `visto` do batimento (só segue sem detectar conflito).
    let conflito: string | null = null;
    try {
      const atual = (await ref.get()).data() as
        | { maquina?: string; visto?: { toDate?: () => Date } }
        | undefined;
      const vistoDate = atual?.visto?.toDate?.();
      if (atual?.maquina && atual.maquina !== eu && vistoDate && Date.now() - vistoDate.getTime() < 10 * 60 * 1000) {
        conflito = atual.maquina;
        log.warn({ outro: conflito }, '⚠️ DOIS Waders ativos no mesmo workspace');
      }
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'Leitura pré-batimento falhou (segue sem detectar conflito)');
    }

    try {
      await ref.set(
        {
          tipo: 'wader',
          visto: new Date(),
          versao,
          maquina: eu,
          conflito,
          ultimoErroIngest: extras?.ultimoErroIngest?.() ?? null,
        },
        { merge: true },
      );
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'Batimento falhou (segue o jogo)');
    }

    try {
      const conn = await repo.getOrthancConnection();
      // D1/F3: sem conexão resolvida (desligado, não-configurado ou sem credencial),
      // o batimento não escreve nada — não vira cartão vermelho permanente para
      // integração que o dono desligou, nem cria integracoes/orthanc do nada.
      if (!conn) return;

      let status: 'ok' | 'erro' = 'erro';
      let ultimoErro: string | null = null;
      try {
        await client.system();
        status = 'ok';
      } catch (e) {
        // F2: a msg de erro pode carregar a URL (ex.: Timeout chamando ${url}),
        // que pode carregar user:pass se o operador digitou credencial na URL.
        ultimoErro = `Orthanc inacessível: ${(e as Error).message}`
          .replaceAll(conn.user, '***')
          .replaceAll(conn.pass, '***')
          .slice(0, 200);
      }
      await getDb().doc(`workspaces/${wsId}/integracoes/orthanc`).set(
        { status, ultimoTeste: new Date(), ultimoErro },
        { merge: true }, // preserva url/ativo que a tela de Integrações grava
      );
    } catch (e) {
      log.warn({ err: (e as Error).message }, 'Checagem do Orthanc falhou (segue o jogo)');
    }
  };
  void bater();
  const timer = setInterval(() => void bater(), INTERVALO_MS);
  return () => clearInterval(timer);
}
