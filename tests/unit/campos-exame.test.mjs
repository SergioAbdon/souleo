import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAMPOS_EXAME_ADMINISTRATIVOS, soAdministrativos } from '../../src/lib/campos-exame.ts';

/** Extrai a lista de dentro de camposAdministrativos() em firestore.rules. */
function listaDaRegra() {
  const regras = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const corpo = regras.match(/function camposAdministrativos\(\)\s*\{\s*return\s*\[([\s\S]*?)\]/);
  assert.ok(corpo, 'camposAdministrativos() sumiu de firestore.rules — a whitelist mudou de forma');
  return [...corpo[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

test('a whitelist do TS e a da regra sao a MESMA lista', () => {
  const daRegra = listaDaRegra();
  const doTs = [...CAMPOS_EXAME_ADMINISTRATIVOS];
  const soNaRegra = daRegra.filter(c => !doTs.includes(c));
  const soNoTs = doTs.filter(c => !daRegra.includes(c));
  assert.deepEqual(soNaRegra, [], 'campo so na regra — o codigo nunca vai gravar');
  assert.deepEqual(soNoTs, [], 'campo so no TS — a regra NEGA e a recepcao nao consegue salvar');
  assert.equal(doTs.length, new Set(doTs).size, 'campo repetido na lista do TS');
});

test('a regra tem os campos que a Agenda de fato grava', () => {
  // Se algum destes sair da regra, editar/criar exame quebra pra recepcao.
  for (const c of ['pacienteNome', 'pacienteDtnasc', 'cpf', 'tipoExame', 'convenio',
    'solicitante', 'sexo', 'status', 'acc', 'dataExame', 'atualizadoEm']) {
    assert.ok(listaDaRegra().includes(c), `${c} sumiu da regra`);
  }
});

test('soAdministrativos deixa passar payload valido', () => {
  const p = { pacienteNome: 'FULANO', cpf: '11144477735', convenio: 'UNIMED' };
  assert.deepEqual(soAdministrativos(p), p);
});

test('soAdministrativos recusa campo clinico (o que a regra negaria em silencio)', () => {
  assert.throws(() => soAdministrativos({ pacienteNome: 'X', conclusoes: 'texto' }), /conclusoes/);
});

test('a mensagem do erro diz onde consertar', () => {
  assert.throws(() => soAdministrativos({ campoNovo: 1 }), /camposAdministrativos|CAMPOS_EXAME_ADMINISTRATIVOS/);
});
