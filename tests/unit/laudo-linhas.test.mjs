// Contrato editor → linhas (S5-T2 fix, achado IMPORTANT 5 do revisor).
//
// O merge por linha só preserva o que ele CONSEGUE LER do editor: tudo que
// a extração perder é apagado na próxima regeneração do motor. A toolbar do
// EditorLaudo oferece lista com marcadores e lista numerada — antes deste
// fix nada disso era lido (o walker só via <p>/<li> de primeiro nível).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { linhasAchados, linhasConclusoes } from '../../src/lib/laudo-linhas.ts';

const H3 = '<h3>CONCLUSÃO</h3>';

describe('linhasAchados', () => {
  test('parágrafos simples', () => {
    assert.deepEqual(linhasAchados('<p>Achado um.</p><p>Achado dois.</p>'), ['Achado um.', 'Achado dois.']);
  });

  test('para no <h3> de conclusão', () => {
    assert.deepEqual(linhasAchados(`<p>Achado.</p>${H3}<ol><li>Conclusão.</li></ol>`), ['Achado.']);
  });

  test('lista com marcadores feita na toolbar vira linhas', () => {
    const html = '<p>Achado.</p><ul><li><p>Item A</p></li><li><p>Item B</p></li></ul>';
    assert.deepEqual(linhasAchados(html), ['Achado.', 'Item A', 'Item B']);
  });

  test('lista numerada feita na toolbar vira linhas', () => {
    const html = '<ol><li><p>Primeiro</p></li><li><p>Segundo</p></li></ol>';
    assert.deepEqual(linhasAchados(html), ['Primeiro', 'Segundo']);
  });

  test('negrito/itálico saem como texto (igual textContent)', () => {
    assert.deepEqual(linhasAchados('<p>Wilkins <strong>total</strong>: 6 pontos.</p>'), ['Wilkins total: 6 pontos.']);
  });

  test('entidades voltam decodificadas (round-trip com montarLaudoHtml)', () => {
    assert.deepEqual(linhasAchados('<p>Wilkins &amp; Block: 3 &lt; 5</p>'), ['Wilkins & Block: 3 < 5']);
  });

  test('parágrafo vazio some, HTML vazio devolve []', () => {
    assert.deepEqual(linhasAchados('<p></p><p>Achado.</p><p>  </p>'), ['Achado.']);
    assert.deepEqual(linhasAchados(''), []);
    assert.deepEqual(linhasAchados(null), []);
  });
});

describe('linhasConclusoes', () => {
  test('lê os <li> do <ol> que o motor monta', () => {
    const html = `<p>Achado.</p>${H3}<ol><li>Conclusão um.</li><li>Conclusão dois.</li></ol>`;
    assert.deepEqual(linhasConclusoes(html), ['Conclusão um.', 'Conclusão dois.']);
  });

  test('parágrafo que o médico digita DEPOIS do <ol> entra', () => {
    const html = `${H3}<ol><li>Conclusão um.</li></ol><p>Correlacionar com a clínica.</p>`;
    assert.deepEqual(linhasConclusoes(html), ['Conclusão um.', 'Correlacionar com a clínica.']);
  });

  test('sem <h3> não há conclusões', () => {
    assert.deepEqual(linhasConclusoes('<p>Só achados.</p>'), []);
    assert.deepEqual(linhasConclusoes(''), []);
  });

  test('o próprio título CONCLUSÃO não vira linha', () => {
    assert.deepEqual(linhasConclusoes(`${H3}<ol><li>Uma.</li></ol>`), ['Uma.']);
  });
});
