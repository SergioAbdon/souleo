// Interface plugavel de verificacao de CRM. Provedor no-op por ora (B4 do spec):
// require+store agora; Consultar.IO/CFM depois, sem mexer em cadastro nem regra.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { verificarCrmNoOp } from '../../src/lib/verificar-crm.ts';

describe('verificarCrmNoOp', () => {
  test('retorna nao_verificado, sem consultar nada externo', async () => {
    const r = await verificarCrmNoOp('123456', 'PA');
    assert.equal(r.status, 'nao_verificado');
    assert.equal(r.fonte, 'nenhum');
    assert.equal(r.checadoEm, null);
  });
  test('contrato estavel: as 3 chaves sempre presentes', async () => {
    const r = await verificarCrmNoOp('', '');
    assert.deepEqual(Object.keys(r).sort(), ['checadoEm', 'fonte', 'status']);
  });
});
