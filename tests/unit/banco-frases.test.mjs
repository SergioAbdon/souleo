// Banco de frases (F3-T7) — o módulo que tirou o CRUD de dentro do motor.
//
// O que este teste protege: o acervo do médico. As frases vivem em
// localStorage['medcardio_banco'] desde sempre; se a chave, o shape {id,cat,txt}
// ou o texto de fábrica mudar, o médico abre o modal e não acha o que escreveu
// (ou insere no laudo uma frase com typo). Por isso o pin do VERBATIM lê o
// próprio motor legado e compara frase a frase.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATS, CHAVE_BANCO, FRASES_DEFAULT,
  loadBanco, saveBanco, adicionarFrase, editarFrase, apagarFrase, proximoId, filtrarFrases,
} from '../../src/lib/banco-frases.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// localStorage de mentira (o módulo lê o global na hora da chamada).
function stubStorage() {
  const mapa = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => { mapa.set(k, String(v)); },
    removeItem: (k) => { mapa.delete(k); },
    clear: () => mapa.clear(),
  };
  return mapa;
}

let storage;
beforeEach(() => { storage = stubStorage(); });

describe('verbatim do motor legado', () => {
  const motor = fs.readFileSync(path.join(root, 'public', 'motor', 'motorv8mp4.js'), 'utf8');

  test('as 34 frases de fábrica são byte a byte as do motor', () => {
    const bloco = motor.match(/const FRASES_DEFAULT=\[\r?\n([\s\S]*?)\r?\n\];/);
    assert.ok(bloco, 'FRASES_DEFAULT não encontrado no motor');
    const doMotor = bloco[1].split(/\r?\n/).map((l) => {
      const m = l.match(/^\s*\{id:(\d+),cat:'([^']*)',txt:'(.*)'\},$/);
      assert.ok(m, `linha fora do formato no motor: ${l}`);
      return { id: Number(m[1]), cat: m[2], txt: m[3] };
    });
    assert.equal(doMotor.length, 34, 'o motor deixou de ter 34 frases');
    assert.deepEqual(FRASES_DEFAULT, doMotor);
  });

  test('CATS são as mesmas 9 categorias do motor, na mesma ordem', () => {
    const m = motor.match(/const CATS=\[(.*?)\];/);
    assert.ok(m);
    const doMotor = m[1].split(',').map((s) => s.replace(/^'|'$/g, ''));
    assert.deepEqual(CATS, doMotor);
    assert.equal(CATS.length, 9);
  });

  test('toda frase de fábrica cai numa categoria existente', () => {
    for (const f of FRASES_DEFAULT) assert.ok(CATS.includes(f.cat), `categoria órfã: ${f.cat}`);
  });
});

describe('load/save', () => {
  test('storage vazio = as 34 de fábrica (cópia, não a referência)', () => {
    const b = loadBanco();
    assert.deepEqual(b, FRASES_DEFAULT);
    b[0].txt = 'mexi';
    assert.notEqual(FRASES_DEFAULT[0].txt, 'mexi');
  });

  test('JSON corrompido cai nos defaults sem explodir', () => {
    storage.set(CHAVE_BANCO, '{nao é json');
    assert.deepEqual(loadBanco(), FRASES_DEFAULT);
  });

  test('round-trip usa a chave histórica medcardio_banco', () => {
    const b = adicionarFrase(loadBanco(), 'Outros', 'Frase do médico.');
    saveBanco(b);
    assert.ok(storage.has('medcardio_banco'), 'gravou em outra chave');
    assert.deepEqual(loadBanco(), b);
  });

  test('acervo LEGADO no storage é lido INTACTO (sem migração, sem merge dos defaults)', () => {
    // Exatamente o que o motor gravava: array de {id,cat,txt}, com id de Date.now()
    // pras frases que o médico criou e as de fábrica já editadas/apagadas.
    const legado = [
      { id: 1, cat: 'Ritmo', txt: 'Ritmo cardíaco regular.' },
      { id: 9, cat: 'Sistólica VE', txt: 'FE preservada (do jeito que EU escrevo).' },
      { id: 1755000000000, cat: 'Outros', txt: 'Frase minha de 2025.' },
    ];
    storage.set(CHAVE_BANCO, JSON.stringify(legado));
    assert.deepEqual(loadBanco(), legado, 'o acervo do médico foi alterado na leitura');
  });
});

describe('CRUD', () => {
  test('adicionar: id novo = max+1, entra no fim, trim no texto', () => {
    const b = adicionarFrase(FRASES_DEFAULT, 'Outros', '  Nova frase.  ');
    assert.equal(b.length, 35);
    assert.deepEqual(b[34], { id: 35, cat: 'Outros', txt: 'Nova frase.' });
    assert.equal(FRASES_DEFAULT.length, 34, 'mutou o default');
  });

  test('adicionar com id legado gigante não colide', () => {
    const base = [{ id: 1755000000000, cat: 'Outros', txt: 'x' }];
    assert.equal(proximoId(base), 1755000000001);
    assert.equal(adicionarFrase(base, 'Outros', 'y')[1].id, 1755000000001);
  });

  test('adicionar texto vazio/só espaço não entra', () => {
    assert.equal(adicionarFrase(FRASES_DEFAULT, 'Outros', '   ').length, 34);
    assert.equal(adicionarFrase(FRASES_DEFAULT, 'Outros', '').length, 34);
  });

  test('editar troca só a frase do id, com trim; vazio não sobrescreve', () => {
    const b = editarFrase(FRASES_DEFAULT, 9, '  Editada.  ');
    assert.equal(b.find((f) => f.id === 9).txt, 'Editada.');
    assert.equal(b.find((f) => f.id === 10).txt, FRASES_DEFAULT[9].txt);
    assert.equal(editarFrase(FRASES_DEFAULT, 9, '  ').find((f) => f.id === 9).txt, FRASES_DEFAULT[8].txt);
  });

  test('editar id inexistente não muda nada', () => {
    assert.deepEqual(editarFrase(FRASES_DEFAULT, 999, 'nada'), FRASES_DEFAULT);
  });

  test('apagar remove só o id pedido', () => {
    const b = apagarFrase(FRASES_DEFAULT, 1);
    assert.equal(b.length, 33);
    assert.equal(b.find((f) => f.id === 1), undefined);
  });

  test('apagar sobrevive ao round-trip (a frase não volta do default)', () => {
    saveBanco(apagarFrase(loadBanco(), 1));
    assert.equal(loadBanco().find((f) => f.id === 1), undefined);
  });
});

describe('filtro do modal', () => {
  test('"Todos" sem busca = tudo', () => {
    assert.equal(filtrarFrases(FRASES_DEFAULT, 'Todos', '').length, 34);
  });

  test('categoria filtra', () => {
    assert.equal(filtrarFrases(FRASES_DEFAULT, 'Ritmo', '').length, 3);
  });

  test('busca é case-insensitive e olha texto E categoria', () => {
    assert.ok(filtrarFrases(FRASES_DEFAULT, 'Todos', 'PERICÁRDIO').length >= 2);
    assert.equal(filtrarFrases(FRASES_DEFAULT, 'Todos', 'decúbito').length, 1);
  });

  test('categoria + busca combinam (E, não OU)', () => {
    assert.equal(filtrarFrases(FRASES_DEFAULT, 'Ritmo', 'arritmia').length, 1);
    assert.equal(filtrarFrases(FRASES_DEFAULT, 'Válvulas', 'arritmia').length, 0);
  });
});
