/**
 * Integração com Windows Service.
 *
 * Placeholder da Fase 1. Implementação real virá em fase posterior, usando
 * `node-windows` ou `sc.exe` para registrar/desregistrar o Wader como serviço.
 *
 * Comportamento esperado quando concluído:
 *   - install(): registra como serviço auto-start (`sc create Wader ...`)
 *   - uninstall(): remove o serviço
 *   - start()/stop(): controle manual
 *   - status(): verifica se está rodando
 *
 * Em desenvolvimento (executando via `npm run dev`), nada deste módulo é
 * usado — o processo roda em foreground.
 */

import { createLogger } from '../logger';

const log = createLogger({ module: 'windows-service' });

export interface ServiceController {
  install(): Promise<void>;
  uninstall(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<'running' | 'stopped' | 'not-installed'>;
}

class NotImplementedServiceController implements ServiceController {
  async install(): Promise<void> {
    log.warn('install() não implementado na F1. Use o instalador NSIS quando disponível.');
  }

  async uninstall(): Promise<void> {
    log.warn('uninstall() não implementado na F1.');
  }

  async start(): Promise<void> {
    log.warn('start() não implementado na F1. Em dev, execute `npm run dev`.');
  }

  async stop(): Promise<void> {
    log.warn('stop() não implementado na F1.');
  }

  async status(): Promise<'running' | 'stopped' | 'not-installed'> {
    return 'not-installed';
  }
}

export function getServiceController(): ServiceController {
  return new NotImplementedServiceController();
}
