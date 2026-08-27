// ══════════════════════════════════════════════════════════════════
// alertasVisiveis() — filtro puro entre a ponte e a sidebar (F3 Task 2)
// Pins: dedupe por tipo, ordem fixa, tolerância à entrada da rede.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alertasVisiveis } from '../../src/lib/alertas-motor.ts';

const A = (tipo, campo = 'x', mensagem = tipo) => ({ tipo, campo, mensagem });

const TODOS = [
  'IT_SEM_PSAP',
  'REFLUXO_PULM_SEM_PMAP',
  'AORTA_SEM_IDADE',
  'WILKINS_INCOMPLETO',
  'SEXO_AUSENTE',
];

describe('alertasVisiveis', () => {
  test('lista vazia / entrada inválida → []', () => {
    assert.deepEqual(alertasVisiveis([]), []);
    assert.deepEqual(alertasVisiveis(null), []);
    assert.deepEqual(alertasVisiveis(undefined), []);
    assert.deepEqual(alertasVisiveis('nao é array'), []);
  });

  test('ordem fixa — entrada embaralhada sai na ordem canônica', () => {
    const embaralhado = [...TODOS].reverse().map((t) => A(t));
    assert.deepEqual(alertasVisiveis(embaralhado).map((a) => a.tipo), TODOS);
  });

  test('os 5 tipos do motor passam (nenhum é descartado)', () => {
    assert.equal(alertasVisiveis(TODOS.map((t) => A(t))).length, 5);
  });

  test('dedupe por tipo — o primeiro do array vence', () => {
    const r = alertasVisiveis([
      A('SEXO_AUSENTE', 'sexo', 'primeira'),
      A('IT_SEM_PSAP', 'b37', 'IT'),
      A('SEXO_AUSENTE', 'sexo', 'segunda'),
    ]);
    assert.deepEqual(r.map((a) => a.tipo), ['IT_SEM_PSAP', 'SEXO_AUSENTE']);
    assert.equal(r[1].mensagem, 'primeira');
  });

  test('preserva o objeto do motor (campo + mensagem intactos)', () => {
    const orig = A('AORTA_SEM_IDADE', 'dtnasc', 'Raiz aórtica medida sem data de nascimento');
    assert.deepEqual(alertasVisiveis([orig]), [orig]);
  });

  test('item nulo ou de tipo desconhecido é descartado sem quebrar', () => {
    const r = alertasVisiveis([null, A('TIPO_QUE_NAO_EXISTE'), undefined, A('IT_SEM_PSAP')]);
    assert.deepEqual(r.map((a) => a.tipo), ['IT_SEM_PSAP']);
  });
});

// Pins de fonte (mesma técnica do contrato-ponte-ids): a propriedade que
// segura a fase é "flag OFF = tela de hoje". Ela mora em dois `&&` no JSX —
// um teste que os lê é mais barato que um regression manual.
describe('fiação na sidebar — flag OFF não muda nada', () => {
  const SIDEBAR = readFileSync(new URL('../../src/components/laudo/SidebarLaudo.tsx', import.meta.url), 'utf8');

  test('o #alerta-psap legado fica de plantão até a lista do motor chegar (I2 da revisão F3-T2)', () => {
    // OFF: !paramsOn=true → nó presente (tela de hoje). ON + lista vazia (exame
    // restaurado): nó presente. ON + lista chegou: nó sai (sem duplicar o aviso).
    assert.match(SIDEBAR, /\{\(!paramsOn \|\| !alertasMotor\?\.length\) && \(\s*\n\s*<div id="alerta-psap"/);
  });

  test('o bloco novo só existe com paramsOn E com alerta na lista', () => {
    assert.match(SIDEBAR, /\{paramsOn && !!alertasMotor\?\.length && \(/);
  });
});
