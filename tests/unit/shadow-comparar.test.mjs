// ══════════════════════════════════════════════════════════════════
// Senna93 F4-T2 · Comparadores da sombra (células + frases)
// ══════════════════════════════════════════════════════════════════
// A pergunta que este teste responde: rodando o paciente-padrão da F0
// nos DOIS motores, sobra alguma divergência que a allowlist não
// explica? Tem que ser ZERO. E se alguém adulterar uma célula, tem
// que aparecer (mutation-test do próprio comparador).
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { montarRowsTabela } from '../../src/senna90/classificacoes/tabela.ts';
import { calcularDerivados } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';
import { simularTabelaLegado } from '../../src/lib/shadow/legado-tabela.ts';
import { compararTabelas, compararFrases } from '../../src/lib/shadow/comparar.ts';

/** Mesma fixture de tests/unit/senna93-tabela-pins.test.mjs (F0-T4). */
function pacientePadrao() {
  const m = medidasVazias();
  m.identificacao.pacienteDtnasc = '1980-05-15';
  m.identificacao.dataExame = '2026-08-27'; // → 46 anos
  m.gerais.sexo = 'M';
  m.gerais.peso = 80;
  m.gerais.altura = 170;
  m.camaras.raizAo = 34;            // b7
  m.camaras.ae = 40;                // b8
  m.camaras.ddve = 50;              // b9
  m.camaras.septoIV = 10;           // b10
  m.camaras.paredePosterior = 10;   // b11
  m.camaras.dsve = 30;              // b12
  m.estenoses.areaAo = 3.0;
  return m;
}

const IDENT = { sexo: 'M', peso: 80, altura: 170 };
const MEDIDAS = { b7: 34, b8: 40, b9: 50, b10: 10, b11: 10, b12: 30, b13: null, b28: null, b29: null };

/** Os dois lados da MESMA fixture: senna93 e legado. */
function doisLados({ ident = {}, mutar = () => {} } = {}) {
  const m = pacientePadrao();
  mutar(m);
  const d = calcularDerivados(m);
  const i = { ...IDENT, ...ident };
  const { rows } = montarRowsTabela(i, MEDIDAS, d, d.idade);
  const legado = simularTabelaLegado({
    sexo: i.sexo, peso: i.peso, altura: i.altura, ...MEDIDAS,
    dtnasc: m.identificacao.pacienteDtnasc, dtexame: m.identificacao.dataExame,
  });
  return { senna93: rows, legado };
}

const descreve = (ds) =>
  ds.map((d) => `(${d.linha},${d.col}) "${d.legado}" → "${d.senna93}" [${d.ref ?? 'INESPERADA'}]`).join('\n');

describe('compararTabelas — paciente-padrão F0 (♂ 46a, 80/170)', () => {
  const { senna93, legado } = doisLados();
  const divs = compararTabelas(senna93, legado);

  test('ZERO divergências inesperadas — toda diferença real é explicada', () => {
    const inesperadas = divs.filter((d) => !d.esperada);
    assert.deepEqual(inesperadas, [], `inesperadas:\n${descreve(inesperadas)}`);
  });

  test('as diferenças reais aparecem (o comparador não está cego)', () => {
    assert.ok(divs.length > 0, 'legado e senna93 divergem no padrão — tem que sobrar algo');
    // separador/casas: IMC 27.6 → 27,6 · massa 181.3 → 181,9 (B24)
    const massa = divs.find((d) => d.linha === 6 && d.col === 5);
    assert.deepEqual(
      [massa.legado, massa.senna93, massa.ref],
      ['181.3', '181,9', 'F3-T5 Tabela · valores']
    );
    // VRs corrigidas na V13
    const vrFE = divs.find((d) => d.linha === 4 && d.col === 7);
    assert.deepEqual(
      [vrFE.legado, vrFE.senna93, vrFE.ref],
      ['>51%', '≥ 52%', 'F3-T5 Tabela · referências']
    );
  });

  test('linhas 10-11 do Senna93 (aorta asc/arco) NÃO viram divergência (B14)', () => {
    assert.equal(senna93.length, 12);
    assert.equal(legado.length, 10);
    assert.ok(divs.every((d) => d.linha < 10));
  });

  test('medidas fracionárias (mm 1 casa vs 0 casas) não viram INESPERADA (Fix 1)', () => {
    // Mesma fixture pattern de doisLados(), mas com MEDIDAS fracionárias
    // nos dois motores (linha 3..9 do legado é a coluna 1 truncada).
    const MEDIDAS_FRAC = { ...MEDIDAS, b7: 34.5, b8: 40.7, b9: 50.6, b10: 10.5, b11: 10.2, b12: 30.4 };
    const m = pacientePadrao();
    m.camaras.raizAo = MEDIDAS_FRAC.b7;
    m.camaras.ae = MEDIDAS_FRAC.b8;
    m.camaras.ddve = MEDIDAS_FRAC.b9;
    m.camaras.septoIV = MEDIDAS_FRAC.b10;
    m.camaras.paredePosterior = MEDIDAS_FRAC.b11;
    m.camaras.dsve = MEDIDAS_FRAC.b12;
    const d = calcularDerivados(m);
    const { rows } = montarRowsTabela(IDENT, MEDIDAS_FRAC, d, d.idade);
    const legadoFrac = simularTabelaLegado({
      sexo: IDENT.sexo, peso: IDENT.peso, altura: IDENT.altura, ...MEDIDAS_FRAC,
      dtnasc: m.identificacao.pacienteDtnasc, dtexame: m.identificacao.dataExame,
    });
    const divs = compararTabelas(rows, legadoFrac);
    const inesperadas = divs.filter((d) => !d.esperada);
    assert.deepEqual(inesperadas, [], `inesperadas:\n${descreve(inesperadas)}`);
    // as células mm (linhas 3..9, col 1) divergem por truncamento e são esperadas
    const mmCols = divs.filter((d) => d.col === 1 && d.linha >= 3 && d.linha <= 9);
    assert.ok(mmCols.length > 0, 'esperava divergências nas células mm truncadas');
    assert.ok(mmCols.every((d) => d.esperada && d.ref === 'F3-T5 Tabela · valores'), descreve(mmCols));
  });

  test('MUTATION: célula adulterada no legado sai INESPERADA', () => {
    const adulterado = legado.map((l) => [...l]);
    adulterado[6][5] = '999.9';                       // massa fora de qualquer tolerância
    const inesperadas = compararTabelas(senna93, adulterado).filter((d) => !d.esperada);
    assert.equal(inesperadas.length, 1, descreve(inesperadas));
    assert.deepEqual(
      [inesperadas[0].linha, inesperadas[0].col, inesperadas[0].ref],
      [6, 5, null]
    );
  });

  test('MUTATION: rótulo trocado (estrutura) sai INESPERADA', () => {
    const adulterado = legado.map((l) => [...l]);
    adulterado[3][0] = 'Raiz da Aorta';
    const ines = compararTabelas(senna93, adulterado).filter((d) => !d.esperada);
    assert.equal(ines.length, 1);
    assert.equal(ines[0].col, 0);
  });
});

describe('compararTabelas — casos de VR', () => {
  test("sexo '' → exatamente as 3 VRs incondicionais do legado, todas C8", () => {
    const { senna93, legado } = doisLados({
      ident: { sexo: '' },
      mutar: (m) => { m.gerais.sexo = ''; },
    });
    const divs = compararTabelas(senna93, legado);
    assert.deepEqual(divs.filter((d) => !d.esperada), [], descreve(divs.filter((d) => !d.esperada)));
    // Só as colunas de VR — as de valor divergem por separador/truncamento em qualquer caso.
    const vrs = divs.filter((d) => d.col === 3 || d.col === 7);
    assert.deepEqual(vrs.map((d) => `${d.linha},${d.col}`), ['0,7', '5,7', '8,7'], descreve(vrs));
    assert.ok(vrs.every((d) => d.ref === 'F3-T5 Tabela · sexo vazio'));
    assert.deepEqual(vrs.map((d) => d.legado), ['<25 kg/m²', '30–40%', '<0,43']);
  });

  test('♀ 70a → VR da raiz 37 → 38 (WASE, F1-T1) e nada inesperado', () => {
    const { senna93, legado } = doisLados({
      ident: { sexo: 'F' },
      mutar: (m) => { m.gerais.sexo = 'F'; m.identificacao.pacienteDtnasc = '1956-05-15'; },
    });
    const divs = compararTabelas(senna93, legado);
    assert.deepEqual(divs.filter((d) => !d.esperada), [], descreve(divs.filter((d) => !d.esperada)));
    const b7 = divs.find((d) => d.linha === 3 && d.col === 3);
    assert.deepEqual([b7.legado, b7.senna93, b7.ref], ['≤ 37 mm', '≤ 38 mm', 'F1-T1 Aorta']);
  });

  test('VR inventada (par que não existe) sai INESPERADA', () => {
    const { senna93, legado } = doisLados();
    const adulterado = legado.map((l) => [...l]);
    adulterado[4][3] = '30–41 mm';
    const ines = compararTabelas(senna93, adulterado).filter((d) => !d.esperada);
    assert.equal(ines.length, 1);
    assert.deepEqual([ines[0].linha, ines[0].col], [4, 3]);
  });
});

describe('compararFrases', () => {
  const vazio = { achados: [], conclusoes: [] };

  test('Ectasia → Dilatação sai esperada (F1-T2 Aorta), nos dois lados do par', () => {
    const divs = compararFrases(
      { ...vazio, conclusoes: ['Ectasia leve da raiz aórtica.'] },
      { ...vazio, conclusoes: ['Dilatação da Raiz aórtica.'] }
    );
    assert.equal(divs.length, 2, JSON.stringify(divs));
    assert.ok(divs.every((d) => d.esperada && d.ref === 'F1-T2 Aorta'), JSON.stringify(divs));
    assert.ok(divs.every((d) => d.categoria === 'conclusao'));
  });

  test('frase inventada sai INESPERADA', () => {
    const divs = compararFrases(
      { ...vazio, achados: ['Frase que não existe.'] },
      vazio
    );
    assert.equal(divs.length, 1);
    assert.equal(divs[0].esperada, false);
    assert.equal(divs[0].ref, null);
    assert.equal(divs[0].velho, 'Frase que não existe.');
  });

  test('frase idêntica (só pontuação/numeração) não é divergência', () => {
    const divs = compararFrases(
      { ...vazio, achados: ['1. Ritmo cardíaco regular.'] },
      { ...vazio, achados: ['Ritmo cardíaco regular'] }
    );
    assert.deepEqual(divs, []);
  });

  test('TAPSE VR ≥20 → >17 sai esperada (F1-T4 VD)', () => {
    const divs = compararFrases(
      { ...vazio, achados: ['Função sistólica do ventrículo direito preservada. TAPSE= 22 mm (VR ≥ 20 mm).'] },
      { ...vazio, achados: ['Função sistólica do ventrículo direito preservada. TAPSE= 22 mm (VR > 17 mm).'] }
    );
    assert.equal(divs.length, 2);
    assert.ok(divs.every((d) => d.esperada && d.ref === 'F1-T4 VD'));
  });

  test('"Aorta ascendente"/"Arco aórtico" maiúsculos casam F1-T1 (Fix 2)', () => {
    const divs = compararFrases(
      { ...vazio, achados: ['Raiz aórtica, aorta ascendente e arco aórtico com dimensões normais.'] },
      { ...vazio, achados: ['Aorta ascendente com dimensões normais.', 'Arco aórtico com dimensões normais.'] }
    );
    assert.ok(divs.length > 0, JSON.stringify(divs));
    assert.ok(divs.every((d) => d.esperada && d.ref === 'F1-T1 Aorta'), JSON.stringify(divs));
  });

  test('flip de ramo A12/B12: aparição de "Indeterminada" sai esperada (F1-T6 Diastólica)', () => {
    const divs = compararFrases(
      vazio,
      { ...vazio, achados: ['Função diastólica do ventrículo esquerdo Indeterminada.'] }
    );
    assert.equal(divs.length, 1);
    assert.equal(divs[0].esperada, true);
    assert.equal(divs[0].ref, 'F1-T6 Diastólica');
  });

  test('flip de ramo A12/B12: SUMIÇO da mesma frase (reverso) sai INESPERADA (direcional)', () => {
    const divs = compararFrases(
      { ...vazio, achados: ['Função diastólica do ventrículo esquerdo Indeterminada.'] },
      vazio
    );
    assert.equal(divs.length, 1);
    assert.equal(divs[0].esperada, false);
    assert.equal(divs[0].ref, null);
  });

  test('sentinela __WILKINS__ continua fora da comparação', () => {
    const divs = compararFrases(
      { ...vazio, achados: ['__WILKINS__{"sc":8}'] },
      vazio
    );
    assert.deepEqual(divs, []);
  });
});
