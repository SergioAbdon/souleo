import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sanearSelecaoImagens } from '../../src/lib/imagens-selecao.ts';

const A = 'ws/ex/dicom/a.jpg', B = 'ws/ex/dicom/b.jpg', C = 'ws/ex/dicom/c.jpg';

describe('sanearSelecaoImagens — servidor só aceita imagens do próprio exame', () => {
  test('mantém a ordem do médico e descarta o que não pertence ao exame', () => {
    assert.deepEqual(sanearSelecaoImagens([C, 'https://outro/exame.jpg', A], [A, B, C]), [C, A]);
  });
  test('remove duplicatas e tipos errados', () => {
    assert.deepEqual(sanearSelecaoImagens([A, A, 7, null, B], [A, B]), [A, B]);
  });
  test('lista vazia é válida (médico desmarcou tudo)', () => {
    assert.deepEqual(sanearSelecaoImagens([], [A]), []);
  });
  test('exame sem imagensDicom → nenhuma seleção sobrevive', () => {
    assert.deepEqual(sanearSelecaoImagens([A], undefined), []);
    assert.deepEqual(sanearSelecaoImagens([A], 'lixo'), []);
  });
  test('seleção que não é lista → null (chamador remove o campo)', () => {
    assert.equal(sanearSelecaoImagens('a.jpg', [A]), null);
    assert.equal(sanearSelecaoImagens(undefined, [A]), null);
  });
});
