// Matriz de permissoes da UI (espelha §4 do ADR) + modo de entrada por local.
// Puro, sem emulador: node --test tests/unit/*.test.mjs
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ehMedico, podeEditarLaudo, podeVerFinanceiro, podeEditarLocal,
  podeGerenciarMembros, podeRemoverDaFila, modoEntrada, podeCancelarLaudo,
} from '../../src/lib/permissoes.ts';

describe('ehMedico', () => {
  test('perfil medico', () => assert.equal(ehMedico({ tipoPerfil: 'medico' }), true));
  test('assistente NAO e medico', () => assert.equal(ehMedico({ tipoPerfil: 'assistente' }), false));
  test('tipoPerfil ausente conta como medico (perfis antigos)', () => {
    assert.equal(ehMedico({}), true);
    assert.equal(ehMedico(null), true);
  });
});

describe('podeEditarLaudo (perfil medico + autoria)', () => {
  const medico = { tipoPerfil: 'medico' };
  const assist = { tipoPerfil: 'assistente' };
  test('medico autor edita', () => assert.equal(podeEditarLaudo(medico, { medicoUid: 'u1' }, 'u1'), true));
  test('medico NAO autor nao edita', () => assert.equal(podeEditarLaudo(medico, { medicoUid: 'u2' }, 'u1'), false));
  test('medico assume exame sem autor', () => assert.equal(podeEditarLaudo(medico, {}, 'u1'), true));
  test('assistente nunca edita, mesmo autor', () => assert.equal(podeEditarLaudo(assist, { medicoUid: 'u1' }, 'u1'), false));
  test('dono-medico (autor) edita', () => assert.equal(podeEditarLaudo({ tipoPerfil: 'medico' }, { medicoUid: 'dono1' }, 'dono1'), true));
});

describe('gates por papel', () => {
  test('financeiro: dono e medico sim, recepcao nao', () => {
    assert.equal(podeVerFinanceiro('dono'), true);
    assert.equal(podeVerFinanceiro('medico'), true);
    assert.equal(podeVerFinanceiro('recepcao'), false);
    assert.equal(podeVerFinanceiro(null), false);
  });
  test('editar local: so dono', () => {
    assert.equal(podeEditarLocal('dono'), true);
    assert.equal(podeEditarLocal('medico'), false);
    assert.equal(podeEditarLocal('recepcao'), false);
  });
  test('gerenciar membros: so dono', () => {
    assert.equal(podeGerenciarMembros('dono'), true);
    assert.equal(podeGerenciarMembros('medico'), false);
  });
  test('remover da fila: dono/medico sim, recepcao nao (P4)', () => {
    assert.equal(podeRemoverDaFila('dono'), true);
    assert.equal(podeRemoverDaFila('medico'), true);
    assert.equal(podeRemoverDaFila('recepcao'), false);
  });
});

describe('podeCancelarLaudo', () => {
  const medico = { tipoPerfil: 'medico' };
  const assist = { tipoPerfil: 'assistente' };
  test('dono cancela qualquer laudo', () => {
    assert.equal(podeCancelarLaudo(assist, { medicoUid: 'outro' }, 'donoUid', 'dono'), true);
  });
  test('medico autor cancela o seu', () => {
    assert.equal(podeCancelarLaudo(medico, { medicoUid: 'u1' }, 'u1', 'medico'), true);
  });
  test('medico NAO autor nao cancela', () => {
    assert.equal(podeCancelarLaudo(medico, { medicoUid: 'u2' }, 'u1', 'medico'), false);
  });
  test('recepcao nao cancela', () => {
    assert.equal(podeCancelarLaudo(medico, { medicoUid: 'u1' }, 'u1', 'recepcao'), false);
  });
});

describe('modoEntrada', () => {
  test('0 locais → sem-local', () => assert.equal(modoEntrada(0), 'sem-local'));
  test('1 local → entrar', () => assert.equal(modoEntrada(1), 'entrar'));
  test('2+ locais → escolher', () => {
    assert.equal(modoEntrada(2), 'escolher');
    assert.equal(modoEntrada(5), 'escolher');
  });
});
