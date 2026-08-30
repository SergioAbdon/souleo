// Contrato editor → linhas (S5-T2 fix, achado IMPORTANT 5 do revisor).
//
// O merge por linha só preserva o que ele CONSEGUE LER do editor: tudo que
// a extração perder é apagado na próxima regeneração do motor. A toolbar do
// EditorLaudo oferece lista com marcadores e lista numerada — antes deste
// fix nada disso era lido (o walker só via <p>/<li> de primeiro nível).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { linhasAchados, linhasConclusoes, cortarAchadosConclusoes } from '../../src/lib/laudo-linhas.ts';

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

  test('<h3> que o médico digita NÃO corta os achados', () => {
    // StarterKit tem input rule de heading ("### " + espaço): só o <h3> da
    // CONCLUSÃO separa os blocos, qualquer outro é linha de achado.
    const html = `<p>a</p><h3>Comentário</h3><p>b</p>${H3}<ol><li>c</li></ol>`;
    assert.deepEqual(linhasAchados(html), ['a', 'Comentário', 'b']);
    assert.deepEqual(linhasConclusoes(html), ['c']);
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

describe('cortarAchadosConclusoes', () => {
  test('h3 digitado no meio dos achados NAO corta', () => {
    const html = '<p>a</p><h3>Titulo do medico</h3><p>b</p><h3>CONCLUSÃO</h3><ol><li>c</li></ol>';
    const { achadosHtml, conclusoesHtml } = cortarAchadosConclusoes(html);
    assert.ok(achadosHtml.includes('Titulo do medico'));
    assert.ok(achadosHtml.includes('<p>b</p>'));
    assert.ok(!achadosHtml.includes('CONCLUS'));
    assert.ok(conclusoesHtml.includes('<li>c</li>'));
  });

  test('sem titulo CONCLUS devolve tudo como achados', () => {
    const r = cortarAchadosConclusoes('<p>a</p><h3>IMPRESSAO</h3><p>b</p>');
    assert.ok(r.achadosHtml.includes('IMPRESSAO'));
    assert.equal(r.conclusoesHtml, '');
  });
});
