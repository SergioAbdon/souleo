// ══════════════════════════════════════════════════════════════════
// Senna93 F3-T5 (A VIRADA DO CABO): pins da pintura dos nós da tela.
// `pintarTabelaSenna93` escreve nos MESMOS nós que `renderizarLaudo()`
// do motor legado escrevia (motorv8mp4.js:1178-1215). Aqui grava-se o
// que sai em cada nó pro paciente-padrão da F0 — se a virada mudar um
// caractere do que o PDF assinado raspa, este teste cai.
//
// Sem jsdom: stub mínimo de `document.getElementById` (mesma técnica de
// tests/unit/motor-ts-adapter.test.mjs) — os campos de ENTRADA devolvem
// `{value}`, os nós de SAÍDA devolvem um objeto que guarda o que foi
// escrito em `textContent`/`innerHTML`.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pintarTabelaSenna93, lerIdentTela, sincronizarCampoPmap } from '../../src/lib/params-render.ts';
import { calcularDerivados } from '../../src/senna90/motor.ts';
import { medidasVazias } from '../../src/senna90/tests/helpers.ts';

const NOS_SAIDA = [
  'out-nome', 'out-idade', 'out-dtnasc', 'out-convenio', 'out-solicitante', 'out-dtexame',
  'calc-imc', 'calc-asc', 'calc-vdf', 'calc-vsf', 'calc-fe', 'calc-fs',
  'calc-massa', 'calc-im', 'calc-er', 'calc-aoae', 'calc-wilkins', 'params-tbody',
];

/** DOM de mentira: entradas (`value`) + nós de saída (textContent/innerHTML). */
function stubDocumento(valores) {
  const saida = Object.fromEntries(
    NOS_SAIDA.map((id) => [id, { textContent: null, innerHTML: null, dataset: {} }]));
  globalThis.document = {
    getElementById(id) {
      if (id in saida) return saida[id];
      if (!(id in valores)) return null;
      const v = valores[id];
      return typeof v === 'boolean' ? { checked: v } : { value: String(v) };
    },
  };
  return saida;
}

/** Mesmo paciente-padrão de senna93-tabela-pins / senna90-derivados-pins (F0). */
const CAMPOS_PADRAO = {
  nome: 'JOSILENE DA SILVA', dtnasc: '1980-05-15', dtexame: '2026-08-27',
  convenio: 'UNIMED', solicitante: 'DR. FULANO',
  sexo: 'M', peso: '80', altura: '170',
  b7: '34', b8: '40', b9: '50', b10: '10', b11: '10', b12: '30',
};

function medidasPadrao() {
  const m = medidasVazias();
  m.identificacao.pacienteDtnasc = '1980-05-15';
  m.identificacao.dataExame = '2026-08-27';
  m.gerais.sexo = 'M';
  m.gerais.peso = 80;
  m.gerais.altura = 170;
  m.camaras.raizAo = 34;
  m.camaras.ae = 40;
  m.camaras.ddve = 50;
  m.camaras.septoIV = 10;
  m.camaras.paredePosterior = 10;
  m.camaras.dsve = 30;
  return m;
}

/** Pinta com o DOM stubado e devolve os nós escritos. */
function pintar({ campos = {}, mutar = () => {} } = {}) {
  const valores = { ...CAMPOS_PADRAO, ...campos };
  for (const [k, v] of Object.entries(valores)) if (v === null) delete valores[k];
  const saida = stubDocumento(valores);
  const m = medidasPadrao();
  mutar(m);
  pintarTabelaSenna93({ derivados: calcularDerivados(m), achados: [], conclusoes: [], alertas: [] }, lerIdentTela);
  return saida;
}

describe('pintarTabelaSenna93 — identificação (#out-*), paciente-padrão F0', () => {
  const n = pintar();

  test('nome/convênio/solicitante saem crus', () => {
    assert.equal(n['out-nome'].textContent, 'JOSILENE DA SILVA');
    assert.equal(n['out-convenio'].textContent, 'UNIMED');
    assert.equal(n['out-solicitante'].textContent, 'DR. FULANO');
  });

  test('idade em "N anos" (plural do legado) e datas em pt-BR', () => {
    assert.equal(n['out-idade'].textContent, '46 anos');
    assert.equal(n['out-dtnasc'].textContent, '15/05/1980');
    assert.equal(n['out-dtexame'].textContent, '27/08/2026');
  });

  test('campo vazio vira travessão — nunca string vazia (o PDF assinado raspa isto)', () => {
    const vazio = pintar({
      campos: { nome: null, convenio: null, solicitante: null, dtnasc: null, dtexame: null },
      mutar: (m) => { m.identificacao.pacienteDtnasc = ''; m.identificacao.dataExame = ''; },
    });
    for (const id of ['out-nome', 'out-convenio', 'out-solicitante', 'out-dtnasc', 'out-dtexame', 'out-idade']) {
      assert.equal(vazio[id].textContent, '—', `${id} deveria ser travessão`);
    }
  });

  test('1 ano fica no singular (a>1 do legado)', () => {
    const bebe = pintar({
      campos: { dtnasc: '2025-08-27' },
      mutar: (m) => { m.identificacao.pacienteDtnasc = '2025-08-27'; },
    });
    assert.equal(bebe['out-idade'].textContent, '1 ano');
  });
});

describe('pintarTabelaSenna93 — caixas #calc-* da sidebar', () => {
  const n = pintar();

  test('derivados com as casas da sidebar e vírgula decimal', () => {
    assert.equal(n['calc-imc'].textContent, '27,6');
    assert.equal(n['calc-asc'].textContent, '1,91');
    assert.equal(n['calc-vdf'].textContent, '118,2');
    assert.equal(n['calc-vsf'].textContent, '35,0');
    assert.equal(n['calc-massa'].textContent, '181,9');
    assert.equal(n['calc-im'].textContent, '95,2');
    assert.equal(n['calc-er'].textContent, '0,40');
    assert.equal(n['calc-aoae'].textContent, '0,85');
  });

  test('FE/FS: 1 casa + "%" NA CAIXA (a tabela usa 0 casas — divergem de propósito)', () => {
    assert.equal(n['calc-fe'].textContent, '70,3%');
    assert.equal(n['calc-fs'].textContent, '40,0%');
  });

  test('sem DSVE (b12) FE/FS viram VIDE, sem "%"', () => {
    const semDsve = pintar({ campos: { b12: null }, mutar: (m) => { m.camaras.dsve = null; } });
    assert.equal(semDsve['calc-fe'].textContent, 'VIDE');
    assert.equal(semDsve['calc-fs'].textContent, 'VIDE');
  });

  test('calc-wilkins: "N pts" com escore e VAZIO sem escore (o legado nunca limpava)', () => {
    assert.equal(n['calc-wilkins'].textContent, '');
    const wk = pintar({
      mutar: (m) => {
        m.wilkins.ativo = true;
        m.wilkins.mobilidade = 2; m.wilkins.espessura = 2;
        m.wilkins.calcificacao = 2; m.wilkins.subvalvar = 2;
      },
    });
    assert.equal(wk['calc-wilkins'].textContent, '8 pts');
  });
});

describe('pintarTabelaSenna93 — #params-tbody', () => {
  const n = pintar();
  const html = n['params-tbody'].innerHTML;

  test('12 linhas de 8 células, com as classes do legado', () => {
    assert.equal((html.match(/<tr>/g) || []).length, 12);
    assert.equal((html.match(/<td/g) || []).length, 96);
    assert.match(html, /<td class="params-divider">/);
    assert.match(html, /<td class="ref">/);
  });

  test('a pintura ASSINA o tbody com data-engine="senna93" (escopo do realce, 27/08)', () => {
    assert.equal(n['params-tbody'].dataset.engine, 'senna93');
  });

  test('realce OOR sai na coluna de valor — e agora também na DIREITA (B13)', () => {
    // Paciente-padrão: única célula acesa é o IMC 27,6 (≥25), coluna 5.
    assert.equal((html.match(/class="val alert"/g) || []).length, 1);
    assert.match(html, /<td class="val alert">27,6<\/td>/);
  });

  test('células escapadas — VR com "<" não vira markup', () => {
    assert.match(html, /&lt;25 kg\/m²/);
    assert.doesNotMatch(html, /<25 kg/);
  });

  test('as 2 linhas novas da aorta existem (B14) e mm saem sem casa decimal', () => {
    assert.match(html, /<td>Aorta Ascendente<\/td>/);
    assert.match(html, /<td>Arco Aórtico<\/td>/);
    assert.match(html, /<td class="val">34<\/td>/); // raiz aórtica: '34', não '34.0'
  });
});

describe('sincronizarCampoPmap (sem consumidor até a T6)', () => {
  test('revela o #field-psmap quando há refluxo pulmonar e esconde quando não há', () => {
    const campo = { style: { display: 'none' } };
    globalThis.document = { getElementById: (id) => (id === 'b40p' ? { value: 'M' } : id === 'field-psmap' ? campo : null) };
    sincronizarCampoPmap();
    assert.equal(campo.style.display, 'block');
    globalThis.document = { getElementById: (id) => (id === 'b40p' ? { value: '' } : id === 'field-psmap' ? campo : null) };
    sincronizarCampoPmap();
    assert.equal(campo.style.display, 'none');
  });
});
