// Cross-file pin (E14, S7-triade-2b, item 5): CAMPOS_DADOS_FINAIS
// (src/lib/emitir-admin.ts) e a whitelist que o SERVIDOR aplica em cima do
// `dadosFinais` que os 3 clientes de emissao mandam. Se um cliente passar a
// mandar um campo novo sem a whitelist crescer junto, o campo e descartado
// SILENCIOSAMENTE (comportamento deliberado do E14) — o que é bom contra
// forja, mas MAU se for um campo legitimo esquecido: a tela parece salvar,
// o servidor apaga sem avisar. Este pin le os 3 arquivos de cliente como
// texto (sem importar — sao componentes React) e confere que toda chave do
// literal `dadosFinais` de cada um esta dentro da whitelist.
//
// Parser: um extrator de bloco `{...}` com contagem de profundidade (poupa
// depender de um parser TS de verdade so pra 3 literais pequenos) — separa
// entradas top-level por virgula NA PROFUNDIDADE CERTA, então objetos
// aninhados (`cfgSnapshot: {...}`) contam como UMA entrada só (a chave
// `cfgSnapshot`, não as chaves de dentro). `...identificacao` (spread, só em
// laudo/[id]/page.tsx) é resolvido lendo o `return {...}` de
// `coletarIdentificacao()` no mesmo arquivo — mesmo truque.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const admin = fs.readFileSync(path.join(raiz, 'src', 'lib', 'emitir-admin.ts'), 'utf8');
const laudo = fs.readFileSync(path.join(raiz, 'src', 'app', 'laudo', '[id]', 'page.tsx'), 'utf8');
const laudoTexto = fs.readFileSync(path.join(raiz, 'src', 'app', 'laudo-texto', '[id]', 'page.tsx'), 'utf8');
const anexarPdf = fs.readFileSync(path.join(raiz, 'src', 'components', 'agenda', 'AnexarPdfModal.tsx'), 'utf8');

function extraiBlocoChaves(texto, indiceAbre) {
  // texto[indiceAbre] === '{'
  let profundidade = 0;
  for (let i = indiceAbre; i < texto.length; i++) {
    if (texto[i] === '{') profundidade++;
    else if (texto[i] === '}') {
      profundidade--;
      if (profundidade === 0) return texto.slice(indiceAbre + 1, i);
    }
  }
  throw new Error('bloco { } nao fechou — arquivo mudou de forma, ajuste este pin');
}

function semComentarios(s) {
  return s.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
}

function entradasTopLevel(interior) {
  const entradas = [];
  let profundidade = 0, atual = '';
  for (const ch of interior) {
    if (ch === '{' || ch === '(' || ch === '[') profundidade++;
    if (ch === '}' || ch === ')' || ch === ']') profundidade--;
    if (ch === ',' && profundidade === 0) { entradas.push(atual); atual = ''; }
    else atual += ch;
  }
  if (atual.trim()) entradas.push(atual);
  return entradas.map(e => e.trim()).filter(Boolean);
}

// Devolve { chaves, spreads } de um literal `nome: {` ou `nome = {` dentro do texto.
function chavesDoLiteral(texto, marcador) {
  const idx = texto.indexOf(marcador);
  assert.ok(idx >= 0, `marcador "${marcador}" nao encontrado — arquivo mudou de forma, ajuste este pin`);
  const abre = texto.indexOf('{', idx);
  const interior = semComentarios(extraiBlocoChaves(texto, abre));
  const entradas = entradasTopLevel(interior);
  const chaves = [];
  const spreads = [];
  for (const e of entradas) {
    if (e.startsWith('...')) { spreads.push(e.slice(3).trim()); continue; }
    const m = e.match(/^(\w+)\s*:/) || e.match(/^(\w+)$/);
    if (m) chaves.push(m[1]);
    // shorthand multiplo na mesma entrada nao acontece (virgula ja separa);
    // "medidas, achados, conclusoes" vira 3 entradas top-level distintas.
  }
  return { chaves, spreads };
}

// CAMPOS_DADOS_FINAIS (servidor)
const matchWhitelist = admin.match(/const CAMPOS_DADOS_FINAIS = new Set\(\[([\s\S]*?)\]\)/);
assert.ok(matchWhitelist, 'CAMPOS_DADOS_FINAIS sumiu ou mudou de forma em emitir-admin.ts');
const whitelist = new Set([...matchWhitelist[1].matchAll(/'(\w+)'/g)].map(m => m[1]));

// AnexarPdfModal.tsx — literal simples, sem spread.
const { chaves: chavesAnexo } = chavesDoLiteral(anexarPdf, 'dadosFinais: {');

// laudo-texto/[id]/page.tsx — literal simples, sem spread.
const { chaves: chavesTexto } = chavesDoLiteral(laudoTexto, 'dadosFinais: {');

// laudo/[id]/page.tsx — tem `...identificacao`: resolve via coletarIdentificacao().
const { chaves: chavesLaudoBrutas, spreads: spreadsLaudo } = chavesDoLiteral(laudo, 'const dadosFinais = {');
assert.deepEqual(spreadsLaudo, ['identificacao'],
  'laudo/[id]/page.tsx: spread(s) do dadosFinais mudou — ajuste este pin (so sabe resolver ...identificacao)');
// coletarIdentificacao(): assinatura pode ganhar tipo de retorno — acha a
// funcao primeiro, depois o `return {` dela, em vez de casar 1 string fixa.
const idxFuncao = laudo.indexOf('function coletarIdentificacao(');
assert.ok(idxFuncao >= 0, 'coletarIdentificacao() sumiu de laudo/[id]/page.tsx — ajuste este pin');
const idxReturn = laudo.indexOf('return {', idxFuncao);
assert.ok(idxReturn >= 0, 'coletarIdentificacao() nao tem "return {" — mudou de forma, ajuste este pin');
const { chaves: chavesIdentificacao } = chavesDoLiteral(laudo.slice(idxReturn), 'return {');
const chavesLaudo = [...chavesLaudoBrutas, ...chavesIdentificacao];

describe('CAMPOS_DADOS_FINAIS (servidor) cobre tudo que os 3 clientes de emissao mandam', () => {
  test('AnexarPdfModal.tsx — todas as chaves de dadosFinais estao na whitelist', () => {
    const faltando = chavesAnexo.filter(c => !whitelist.has(c));
    assert.deepEqual(faltando, [], `AnexarPdfModal manda campo(s) fora da whitelist — some(m) silenciosamente do doc: ${faltando.join(', ')}`);
  });
  test('laudo-texto/[id]/page.tsx — todas as chaves de dadosFinais estao na whitelist', () => {
    const faltando = chavesTexto.filter(c => !whitelist.has(c));
    assert.deepEqual(faltando, [], `laudo-texto manda campo(s) fora da whitelist — some(m) silenciosamente do doc: ${faltando.join(', ')}`);
  });
  test('laudo/[id]/page.tsx — todas as chaves de dadosFinais (incl. ...identificacao) estao na whitelist', () => {
    const faltando = chavesLaudo.filter(c => !whitelist.has(c));
    assert.deepEqual(faltando, [], `laudo/[id] manda campo(s) fora da whitelist — some(m) silenciosamente do doc: ${faltando.join(', ')}`);
  });
});
