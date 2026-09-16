// Tradutor DICOM SR → motor LEO. Zero testes até S4-T10 — a falha real (E
// 0,63 m/s virando 630 mm/s, um erro de 10×) veio de um ramo "schema antigo"
// que inferia grupo por sufixo sem nunca saber a unidade. Ver
// docs/decisoes/2026-05-13-bug-acc-duplicado-remap-e-wader-sr.md
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  converter,
  isSchemaNovo,
  isSchemaAntigo,
  normalizarParaImport,
  SR_TO_MOTOR,
} from '../../src/lib/dicom-sr-mapping.ts';

describe('converter — tabela de unidades', () => {
  test('cm → mm: ×10', () => {
    assert.equal(converter(5.3, 'cm', 'mm'), 53);
  });
  test('m → mm: ×1000', () => {
    assert.equal(converter(0.053, 'm', 'mm'), 53);
  });
  test('mm → mm: passa direto', () => {
    assert.equal(converter(53, 'mm', 'mm'), 53);
  });
  test('m/s → cm/s: ×100', () => {
    assert.equal(converter(0.63, 'm/s', 'cm/s'), 63);
  });
  test('mm/s → cm/s: ÷10', () => {
    assert.equal(converter(630, 'mm/s', 'cm/s'), 63);
  });
  test('cm/s → cm/s: passa direto', () => {
    assert.equal(converter(63, 'cm/s', 'cm/s'), 63);
  });
  test('razão (alvo vazio): nunca converte, seja qual for a unidade', () => {
    assert.equal(converter(26.8, 'm/s', ''), 26.8);
    assert.equal(converter(26.8, '', ''), 26.8);
  });
  test('unidade vazia devolve o valor cru (sem conversão)', () => {
    assert.equal(converter(53, '', 'mm'), 53);
    assert.equal(converter(63, '', 'cm/s'), 63);
  });
});

describe('isSchemaNovo / isSchemaAntigo', () => {
  test('objeto MedidaSr → schema novo', () => {
    const medidas = { LA_M_02550: { value: 53, unit: 'mm', meaning: 'Diameter', grupo: 'LA' } };
    assert.equal(isSchemaNovo(medidas), true);
    assert.equal(isSchemaAntigo(medidas), false);
  });
  test('número puro → schema antigo', () => {
    const medidas = { 'M-02550': 5.3 };
    assert.equal(isSchemaAntigo(medidas), true);
    assert.equal(isSchemaNovo(medidas), false);
  });
  test('undefined → nem novo nem antigo', () => {
    assert.equal(isSchemaNovo(undefined), false);
    assert.equal(isSchemaAntigo(undefined), false);
  });
  test('objeto vazio → nem novo nem antigo', () => {
    assert.equal(isSchemaNovo({}), false);
    assert.equal(isSchemaAntigo({}), false);
  });
});

describe('normalizarParaImport — contrato central', () => {
  test('schema ANTIGO sempre devolve [] (fim do ramo legado que causava erro 10×)', () => {
    const medidas = { 'M-02550': 5.3, '18037-2': 0.63 };
    assert.deepEqual(normalizarParaImport(medidas), []);
  });

  test('undefined devolve []', () => {
    assert.deepEqual(normalizarParaImport(undefined), []);
  });

  test('schema novo com unit vazia e alvo != "" fica FORA da lista (achado 17)', () => {
    const medidas = {
      'AO_18015-8': { value: 30, unit: '', meaning: 'Aortic Root Diameter', grupo: 'AO' },
    };
    assert.deepEqual(normalizarParaImport(medidas), []);
  });

  test('schema novo com unit vazia mas alvo "" (razão) NÃO é barrado', () => {
    const medidas = {
      'MV_18038-0': { value: 1.2, unit: '', meaning: 'E/A', grupo: 'MV' },
    };
    const r = normalizarParaImport(medidas);
    assert.equal(r.length, 1);
    assert.equal(r[0].valor, 1.2);
  });

  test('caminho feliz: converte e arredonda como hoje (E 0,63 m/s → 63 cm/s)', () => {
    const medidas = {
      'MV_18037-2': { value: 0.63, unit: 'm/s', meaning: 'E-Wave', grupo: 'MV' },
    };
    const r = normalizarParaImport(medidas);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0], {
      key: 'MV_18037-2',
      campo: 'b19',
      nomePt: 'Vel. Onda E (Mitral)',
      valor: 63,
      unit: 'cm/s',
    });
  });

  test('caso real Manoel: DDVE 5,3cm → 53mm', () => {
    const medidas = {
      'LV_29436-3': { value: 5.3, unit: 'cm', meaning: 'LV End Diastolic Dim', grupo: 'LV' },
    };
    const r = normalizarParaImport(medidas);
    assert.equal(r[0].valor, 53);
    assert.equal(r[0].unit, 'mm');
  });

  test('caso real Manoel: E/e\' 26,8 (razão) passa direto, sem conversão', () => {
    const medidas = {
      'MV_59111-5': { value: 26.8, unit: '', meaning: "E/e'", grupo: 'MV' },
    };
    const r = normalizarParaImport(medidas);
    assert.equal(r[0].valor, 26.8);
  });

  test('código fora da whitelist é ignorado silenciosamente', () => {
    const medidas = {
      'XX_00000-0': { value: 99, unit: 'mm', meaning: 'desconhecido', grupo: 'general' },
    };
    assert.deepEqual(normalizarParaImport(medidas), []);
  });

  test('mapa custom (2º parâmetro) é respeitado em vez de SR_TO_MOTOR', () => {
    const mapaCustom = {
      'FOO_1': { campo: 'z1', nomePt: 'Foo', casas: 0, alvo: 'mm' },
    };
    // Chave só existe no mapa custom, não em SR_TO_MOTOR — com o default
    // (SR_TO_MOTOR) o resultado seria [].
    const medidas = {
      'FOO_1': { value: 1, unit: 'cm', meaning: 'foo', grupo: 'general' },
    };
    assert.deepEqual(normalizarParaImport(medidas), []); // default SR_TO_MOTOR não conhece FOO_1
    const r = normalizarParaImport(medidas, mapaCustom);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0], { key: 'FOO_1', campo: 'z1', nomePt: 'Foo', valor: 10, unit: 'mm' });
  });

  test('default (sem 2º parâmetro) usa SR_TO_MOTOR — smoke test com todas as 12 chaves', () => {
    assert.equal(Object.keys(SR_TO_MOTOR).length, 12);
  });
});
