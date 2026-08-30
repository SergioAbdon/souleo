// Cross-file pin (E11-D follow-up, achado do reviewer): o predicado de
// elegibilidade do giro do ciclo mora em 2 lugares — o SERVIDOR
// (emitir-admin.ts, dentro da transacao, quem de fato gira e cobra) e a
// PREVIA do cliente (billing.ts checkEmissao, quem decide se o editor abre
// ANTES de chamar a rota). Se os dois predicados divergirem, o pre-voo mente
// pro medico de novo (foi assim que a versao anterior deste fix ficou
// incompleta: o servidor girava mas checkEmissao continuava dizendo
// 'expirado' e o editor nem abria). Molde do pin de identidade
// (tests/unit/identidade-campos-pin.test.mjs): le os 2 arquivos como texto,
// sem importar (billing.ts usa o SDK client-side do Firebase, que exige app
// inicializado — nao roda fora do browser/emulador).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const admin = fs.readFileSync(
  path.resolve(import.meta.dirname, '..', '..', 'src', 'lib', 'emitir-admin.ts'), 'utf8');
const previa = fs.readFileSync(
  path.resolve(import.meta.dirname, '..', '..', 'src', 'lib', 'billing.ts'), 'utf8');

// Extrai so o miolo do predicado (sem o guard de nulo `cicloFim &&`, que os
// dois arquivos escrevem de formas equivalentes mas nao identicas —
// emitir-admin.ts guarda contra `cicloFim: Date | null`, billing.ts nunca
// tem cicloFim null porque coerce pra Invalid Date antes).
const PREDICADO = /agora > cicloFim && franquiaMensal > 0 && sub\.tipo !== 'trial'/;

describe('predicado de elegibilidade do giro (E11-D): servidor === previa do cliente', () => {
  test('emitir-admin.ts (servidor, gira de verdade) tem o predicado', () => {
    assert.match(admin, PREDICADO,
      'o predicado do giro em emitir-admin.ts mudou de forma — ajuste este pin OU billing.ts junto');
  });

  test('billing.ts checkEmissao (previa do cliente) tem o MESMO predicado', () => {
    assert.match(previa, PREDICADO,
      'checkEmissao (billing.ts) nao espelha mais o predicado do giro — o pre-voo vai voltar a ' +
      'dizer "expirado" numa conta que o servidor renovaria, travando o editor antes da rota que gira');
  });
});
