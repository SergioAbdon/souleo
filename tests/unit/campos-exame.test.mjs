import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAMPOS_EXAME_ADMINISTRATIVOS, CAMPOS_EXAME_CRIACAO, soAdministrativos } from '../../src/lib/campos-exame.ts';

function regras() {
  return readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
}

/** Extrai a lista de dentro de camposAdministrativos() em firestore.rules. */
function listaDaRegra() {
  const corpo = regras().match(/function camposAdministrativos\(\)\s*\{\s*return\s*\[([\s\S]*?)\]/);
  assert.ok(corpo, 'camposAdministrativos() sumiu de firestore.rules — a whitelist mudou de forma');
  return [...corpo[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

test('a whitelist de CRIACAO do TS e a da regra sao a MESMA lista', () => {
  // camposAdministrativos() da regra e a lista do CREATE (cadastro, com sexo).
  const daRegra = listaDaRegra();
  const doTs = [...CAMPOS_EXAME_CRIACAO];
  const soNaRegra = daRegra.filter(c => !doTs.includes(c));
  const soNoTs = doTs.filter(c => !daRegra.includes(c));
  assert.deepEqual(soNaRegra, [], 'campo so na regra — o codigo nunca vai gravar');
  assert.deepEqual(soNoTs, [], 'campo so no TS — a regra NEGA e a recepcao nao consegue salvar');
  assert.equal(doTs.length, new Set(doTs).size, 'campo repetido na lista do TS');
});

test('a lista de ALTERACAO = criacao MENOS sexo, e a regra remove exatamente sexo (nº24)', () => {
  assert.deepEqual(
    [...CAMPOS_EXAME_CRIACAO].filter(c => !CAMPOS_EXAME_ADMINISTRATIVOS.includes(c)),
    ['sexo'],
    'a unica diferenca criacao×alteracao tem que ser o sexo');
  // Pino na regra: o update de nao-medico usa camposAdministrativosUpdate(),
  // que e a lista cheia removeAll(['sexo']). Se alguem "simplificar" isso,
  // ou o sexo reabre pra recepcao, ou o cadastro quebra.
  assert.match(regras(), /camposAdministrativosUpdate\(\)\s*\{\s*return\s*camposAdministrativos\(\)\.removeAll\(\['sexo'\]\)/,
    'camposAdministrativosUpdate() = camposAdministrativos().removeAll([sexo]) sumiu da regra');
  assert.match(regras(), /affectedKeys\(\)\.hasOnly\(camposAdministrativosUpdate\(\)\)/,
    'o update de nao-medico tem que usar a lista SEM sexo');
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

test('sexo: recusado na ALTERACAO (default), aceito na CRIACAO (nº24)', () => {
  assert.throws(() => soAdministrativos({ sexo: 'F' }), /sexo/);
  const cadastro = { pacienteNome: 'FULANO', sexo: 'F', status: 'aguardando' };
  assert.deepEqual(soAdministrativos(cadastro, CAMPOS_EXAME_CRIACAO), cadastro);
});

test('soAdministrativos recusa campo clinico (o que a regra negaria em silencio)', () => {
  assert.throws(() => soAdministrativos({ pacienteNome: 'X', conclusoes: 'texto' }), /conclusoes/);
});

test('a mensagem do erro diz onde consertar', () => {
  assert.throws(() => soAdministrativos({ campoNovo: 1 }), /camposAdministrativos|CAMPOS_EXAME_ADMINISTRATIVOS/);
});
