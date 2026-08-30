// M1 da revisão pré-merge F3: motorNumeros não tem teste executável (padrão do
// repo — rotas não são importáveis no node --test). Pin de FONTE: o carimbo
// vive na TRANSAÇÃO (sobrevive à falha do PDF) e o update pós-PDF só grava a
// URL. Se alguém devolver o carimbo pro update do PDF, este teste acusa.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.resolve(import.meta.dirname, '..', '..', 'src', 'app', 'api', 'emitir', 'route.ts'), 'utf8');
// S7-T0.3: a transação saiu da rota para src/lib/emitir-admin.ts (ganhou
// bateria em tests/api/emitir-idempotencia.test.mjs). O carimbo viaja como
// `extras` — o pin passa a olhar os dois lados.
const lib = fs.readFileSync(
  path.resolve(import.meta.dirname, '..', '..', 'src', 'lib', 'emitir-admin.ts'), 'utf8');

describe('carimbo de proveniência do motor (F3, achado do teste ao vivo)', () => {
  test('motorNumeros entra na TRANSAÇÃO (adjacente ao status emitido)', () => {
    // Adjacência no MESMO transaction.update — não uma janela por indexOf
    // (a 1ª ocorrência de "status: 'emitido'" no arquivo é um comentário).
    assert.match(src, /extras: carimboMotor/,
      'a rota parou de passar o carimbo para a transação');
    assert.match(lib, /\.\.\.\(p\.extras \|\| \{\}\),\s*\n\s*status: 'emitido'/,
      'o carimbo saiu da transação — voltaria a morrer com o PDF');
  });
  test('carimbo nunca reaparece no update pos-PDF — a marca so mora na transacao', () => {
    // Ponytail-4: o assert antigo contava `update({ pdfUrl, pdfErro: ... })`
    // == 2 — literal DUPLICADO do mesmo pin em emitir-pdf-erro.test.mjs
    // (tests/api). O que ESTE arquivo existe pra travar e outra coisa:
    // motorNumeros/carimboMotor nao pode ter vazado pro update pos-PDF —
    // devolveria ao caminho que morre com o Puppeteer (o achado original).
    assert.ok(!/update\(\{[^}]*carimbo/i.test(src),
      'carimboMotor/motorNumeros vazou pro update pos-PDF');
  });
});

// S7 onda-0 (revisão R1): a decisão de replay da rota carrega o achado C1 —
// `if (resultado.replay)` sem o `!pdfPendente` devolvia "sucesso" com o PDF
// assinado inexistente. Este pin trava a linha; a semântica está batida em
// tests/api/emitir-idempotencia.test.mjs (casos f-j).
describe('replay idempotente (S7 onda-0, C1)', () => {
  test('a rota só curto-circuita replay quando o PDF já existe (!pdfPendente)', () => {
    assert.match(src, /resultado\.replay && !resultado\.pdfPendente/,
      'a decisão de replay perdeu o guard do pdfPendente — C1 voltaria com a bateria verde');
  });
});
