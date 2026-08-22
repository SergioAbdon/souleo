// Guarda de emissão (S4-T12): o médico emitia laudo com o Wader ainda a
// meio caminho (ou depois de falhar) e o PDF saía sem imagem nenhuma.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { precisaConfirmarEmissao } from '../../src/lib/emissao-guarda.ts';

describe('precisaConfirmarEmissao', () => {
  test('exame sem DICOM nenhum → não confirma', () => {
    assert.equal(precisaConfirmarEmissao({ pacienteNome: 'X' }), null);
  });

  test('null/undefined → não confirma', () => {
    assert.equal(precisaConfirmarEmissao(null), null);
    assert.equal(precisaConfirmarEmissao(undefined), null);
  });

  test('erro do Wader → devolve a mensagem como detalhe', () => {
    assert.equal(
      precisaConfirmarEmissao({ dicomUltimoErro: 'timeout no Orthanc' }),
      'timeout no Orthanc',
    );
  });

  test('erro não-string (legado) → detalhe genérico', () => {
    assert.equal(
      precisaConfirmarEmissao({ dicomUltimoErro: { code: 500 } }),
      'falha no processamento DICOM',
    );
  });

  test('erro string vazia/espaços → ignorado (não é erro de verdade)', () => {
    assert.equal(precisaConfirmarEmissao({ dicomUltimoErro: '   ' }), null);
  });

  test('medidas chegaram e imagens não → confirma', () => {
    assert.equal(
      precisaConfirmarEmissao({ medidasDicomMeta: { parserVersao: 'sr-2026-08-21' } }),
      'medidas chegaram, imagens não',
    );
    assert.equal(
      precisaConfirmarEmissao({ medidasDicomMeta: {}, imagensDicom: [] }),
      'medidas chegaram, imagens não',
    );
  });

  test('medidas + imagens → não confirma', () => {
    assert.equal(
      precisaConfirmarEmissao({ medidasDicomMeta: {}, imagensDicom: ['a.jpg'] }),
      null,
    );
  });

  test('erro tem precedência sobre a falta de imagens', () => {
    assert.equal(
      precisaConfirmarEmissao({ dicomUltimoErro: 'sem SR', medidasDicomMeta: {}, imagensDicom: [] }),
      'sem SR',
    );
  });
});
