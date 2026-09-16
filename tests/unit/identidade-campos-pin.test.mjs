// Cross-file pin: CAMPOS_IDENTIDADE (src/lib/emitir-admin.ts) é quem o
// SERVIDOR usa pra derivar `identificacaoAlterada` de verdade.
// identificacaoMudou() (src/app/laudo/[id]/page.tsx) é só a PRÉVIA DE UX da
// MESMA regra, mostrada pro médico antes de emitir — se as duas listas de
// campo divergirem, a prévia mente pro médico (avisa/não avisa uma mudança
// que o servidor decide diferente). Molde do carimbo-pin
// (tests/unit/emitir-carimbo-pin.test.mjs): lê os 2 arquivos como texto,
// sem importar (a página é um componente React, não roda em node --test).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const lib = fs.readFileSync(
  path.resolve(import.meta.dirname, '..', '..', 'src', 'lib', 'emitir-admin.ts'), 'utf8');
const page = fs.readFileSync(
  path.resolve(import.meta.dirname, '..', '..', 'src', 'app', 'laudo', '[id]', 'page.tsx'), 'utf8');

describe('CAMPOS_IDENTIDADE (servidor) === campos de identificacaoMudou() (prévia de UX)', () => {
  test('as duas listas de campo batem — nenhum lado ganhou/perdeu campo sozinho', () => {
    const camposServidor = lib.match(/const CAMPOS_IDENTIDADE = \[([^\]]+)\]/);
    assert.ok(camposServidor, 'CAMPOS_IDENTIDADE sumiu ou mudou de forma em emitir-admin.ts');
    const doServidor = [...camposServidor[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    assert.equal(doServidor.length, 4, 'esperava 4 campos em CAMPOS_IDENTIDADE — ajuste este pin se mudou de propósito');

    const corpoFuncao = page.match(/function identificacaoMudou\(\): boolean \{([\s\S]*?)\n  \}/);
    assert.ok(corpoFuncao, 'identificacaoMudou() sumiu ou mudou de forma em laudo/[id]/page.tsx');
    const doCliente = [...corpoFuncao[1].matchAll(/atual\.(\w+) !==/g)].map((m) => m[1]);

    assert.deepEqual(
      [...doCliente].sort(),
      [...doServidor].sort(),
      'CAMPOS_IDENTIDADE (emitir-admin.ts) e identificacaoMudou() (laudo/[id]/page.tsx) divergiram — ' +
      'a prévia de UX do médico e o carimbo que o servidor grava precisam comparar os MESMOS campos',
    );
  });
});
