// rotaDoLaudo (X20): ponto único de despacho por modalidade — antes da
// promoção, Worklist e Histórico tinham fallback de rota que ignorava a
// modalidade do tipo e caía sempre no motor de eco (/laudo/{id}).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { rotaDoLaudo, modalidadeDe } from '../../src/lib/tipos-laudo.ts';

describe('rotaDoLaudo', () => {
  test('modalidade decide a tela', () => {
    const tipos = {
      eco: { id: 'eco', nome: 'Ecocardiograma', icone: '🫀', ativo: true, ordem: 1, modalidade: 'motor' },
      dop: { id: 'dop', nome: 'Doppler', icone: '🩺', ativo: true, ordem: 2, modalidade: 'texto' },
    };
    assert.equal(rotaDoLaudo('e1', 'eco', tipos), '/laudo/e1');
    assert.equal(rotaDoLaudo('e2', 'dop', tipos), '/laudo-texto/e2');
    // tipo desconhecido/tiposMap ainda nao carregado -> default de modalidadeDe (compat)
    assert.equal(rotaDoLaudo('e3', undefined, tipos), '/laudo/e3');
  });

  test('modalidade pdf tambem vai pra tela de texto (sem editor proprio)', () => {
    const tipos = { ecg: { id: 'ecg', nome: 'ECG', icone: '📈', ativo: true, ordem: 1, modalidade: 'pdf' } };
    assert.equal(rotaDoLaudo('e4', 'ecg', tipos), '/laudo-texto/e4');
  });

  test('tipo sem doc no catalogo (seed parcial) segue o mesmo default de modalidadeDe', () => {
    // doppler_carotidas sem `modalidade` gravada -> modalidadeDe cai em 'texto'
    assert.equal(rotaDoLaudo('e5', 'doppler_carotidas', {}), '/laudo-texto/e5');
    // qualquer outro tipo desconhecido -> default 'motor'
    assert.equal(rotaDoLaudo('e6', 'tipo_nao_catalogado', {}), '/laudo/e6');
  });
});
