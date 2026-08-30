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

// E3 (revisão, achado Important): reemissao/identificacaoAlterada eram lidos
// de `dadosFinais` (corpo cru do cliente) no bloco de audit log — a
// semântica de "quem derivou o quê" ganhou bateria em
// tests/api/emitir-idempotencia.test.mjs, mas o FIO da rota (qual variável o
// log lê) não tem seam nenhum ali (é `emitirComCobranca` sendo testada, não
// a rota). Pin de fonte, mesmo padrão dos pins acima.
describe('audit log usa o carimbo DERIVADO, nao o cru do cliente (E3)', () => {
  test('log de emissao le resultado.reemissao/resultado.identificacaoAlterada', () => {
    assert.match(src, /reemissao:\s*resultado\.reemissao/,
      'o log voltou a ler reemissao de dadosFinais (corpo do cliente)');
    assert.match(src, /identificacaoAlterada:\s*resultado\.identificacaoAlterada/,
      'o log voltou a ler identificacaoAlterada de dadosFinais (corpo do cliente)');
  });
  test('log de emissao NUNCA le dadosFinais.reemissao nem dadosFinais.identificacaoAlterada', () => {
    assert.ok(!/dadosFinais\.reemissao/.test(src),
      'dadosFinais.reemissao reapareceu na rota — cliente adulterado volta a mandar o carimbo');
    assert.ok(!/dadosFinais\.identificacaoAlterada/.test(src),
      'dadosFinais.identificacaoAlterada reapareceu na rota — cliente adulterado volta a mandar o carimbo');
  });
});

// Task 8 (E15+E16): mascara de erro interno + HTTP honesto na recusa de
// billing. A rota nao e importavel em node --test (mesma limitacao dos pins
// acima) — trava por leitura de fonte, igual emitir-pdf-erro.test.mjs.
describe('E16 — recusa de billing sai com status HTTP honesto (nao mais 200)', () => {
  test('mapa de status inclui sem_plano/sem_saldo/expirado como 402', () => {
    assert.match(src, /sem_plano:\s*402,\s*sem_saldo:\s*402,\s*expirado:\s*402/,
      'as 3 recusas de billing pararam de virar 402 no mapa de status');
    // Os 3 motivos pre-existentes nao podem ter sido perdidos na troca.
    assert.match(src, /nao_encontrado:\s*404/);
    assert.match(src, /exame_de_outro_medico:\s*403/);
    assert.match(src, /cancelado:\s*409/);
  });
});

describe('E15 — catch-all da rota nao vaza detalhe do erro pro corpo da resposta', () => {
  test('resposta do catch-all usa motivo fixo erro_interno, nao a mensagem crua da excecao', () => {
    const semComentarios = src.replace(/^\s*\/\/.*$/gm, '');   // comentarios citam os proprios trechos
    assert.match(semComentarios, /error:\s*'erro_interno'/,
      'o catch-all parou de mascarar o erro — espelho de corrigir-laudo (error: "erro_interno")');
    assert.ok(!/error:\s*msg\b/.test(semComentarios),
      'a mensagem crua de (e as Error).message voltou a ir pro corpo da resposta');
  });
});
