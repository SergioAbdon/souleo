// Round 4 (Codex Critical, item 3): até o round 3, `gerarESalvarPdf` gravava
// o snapshot incondicionalmente, LOGO após subir o PDF — SEM esperar a
// transação de publicação (que só roda DEPOIS, no caller). Uma tentativa
// PERDEDORA podia terminar de subir e gravar o snapshot DEPOIS da vencedora
// — uma correção futura regeneraria o corpo clínico ANTIGO por cima do laudo
// assinado novo. Fix: `salvarSnapshotHtml` saiu de dentro de
// `gerarESalvarPdf`; cada rota chama explicitamente DEPOIS que a transação
// de publicação devolve `true`.
//
// Round 5 (Codex Critical): isso sozinho não bastava — o snapshot era
// CANÔNICO POR EXAME (`laudos-html/{ws}/{exameId}.html`, um objeto só pra
// TODAS as tentativas). Mesmo salvo só pós-publicação, um snapshot ATRASADO
// de uma tentativa A (que publicou, mas cujo `salvarSnapshotHtml` demorou a
// rodar) ainda sobrescrevia o snapshot de uma tentativa B que reemitiu,
// publicou e snapshotou DEPOIS de A — inclusive pelo catch. Fix: o snapshot
// virou por TENTATIVA também (path sufixado pela `emissaoKey`, igual ao PDF
// desde o round 3); `lerSnapshotHtml` resolve sozinho qual vale lendo a
// GAVETA (só a emissão vencedora tem a key lá), com fallback pro canônico
// (exames pré-onda-0, e exames emitidos entre a onda-0 e este deploy — a
// gaveta já tem key, mas o snapshot daquela emissão ainda está no canônico).
//
// Storage não é emulado nesta bateria (mesma limitação de todo o resto do
// pipeline de PDF, documentada em tests/api/emitir-pdf-erro.test.mjs e
// tests/api/corrigir-laudo.test.mjs) — sem DI/spy no cliente do Storage, o
// caminho viável é source-pin: trava o WIRING (quem chama o quê, com qual
// path, em que branch) e a lógica PURA de resolução de path
// (`pathSnapshotHtml`, exportada pra isso). O cenário do item 5 (gaveta com
// key + só o canônico existe → lê o canônico) é pinado pela combinação dos
// testes "candidatos tenta sufixado ANTES do canônico" + "sufixado vs
// canônico" abaixo — não dá pra provar com um download real sem Storage
// emulado.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathSnapshotHtml } from '../../src/lib/pdf-server.ts';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');
const semComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

describe('pathSnapshotHtml — path por tentativa, fallback pro canônico (round 5)', () => {
  test('com emissaoKey: path sufixado', () => {
    assert.equal(
      pathSnapshotHtml('ws1', 'ex1', 'a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6'),
      'laudos-html/ws1/ex1-a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6.html',
    );
  });

  test('sem emissaoKey (undefined ou null): path canônico — exame pré-onda-0', () => {
    assert.equal(pathSnapshotHtml('ws1', 'ex1'), 'laudos-html/ws1/ex1.html');
    assert.equal(pathSnapshotHtml('ws1', 'ex1', null), 'laudos-html/ws1/ex1.html');
  });

  test('2 tentativas do MESMO exame com keys diferentes nascem em objetos DIFERENTES', () => {
    const a = pathSnapshotHtml('ws1', 'ex1', 'aaaaaaaa-1111-4222-8333-444444444444');
    const b = pathSnapshotHtml('ws1', 'ex1', 'bbbbbbbb-1111-4222-8333-444444444444');
    assert.notEqual(a, b, 'C1/C2 do round 5: snapshot atrasado de A nao pode pisar no de B');
  });
});

describe('gerarESalvarPdf NÃO congela mais o snapshot internamente (pdf-server.ts)', () => {
  test('o corpo de gerarESalvarPdf não chama salvarSnapshotHtml', () => {
    const src = semComentarios(ler('src', 'lib', 'pdf-server.ts'));
    const inicioFuncao = src.indexOf('export async function gerarESalvarPdf');
    assert.ok(inicioFuncao >= 0, 'gerarESalvarPdf sumiu de pdf-server.ts');
    const corpo = src.slice(inicioFuncao);
    assert.ok(!/salvarSnapshotHtml\(/.test(corpo),
      'gerarESalvarPdf voltou a gravar o snapshot sem esperar a transação de publicação — reabre o round 4 item 3');
  });

  test('salvarSnapshotHtml continua exportada (as 2 rotas chamam de fora agora)', () => {
    const src = ler('src', 'lib', 'pdf-server.ts');
    assert.match(src, /export async function salvarSnapshotHtml\(/);
  });

  test('lerSnapshotHtml resolve a key pela GAVETA (refEmissaoPrivada) e tenta o sufixado ANTES do canônico', () => {
    const src = semComentarios(ler('src', 'lib', 'pdf-server.ts'));
    const inicioFuncao = src.indexOf('export async function lerSnapshotHtml');
    assert.ok(inicioFuncao >= 0, 'lerSnapshotHtml sumiu de pdf-server.ts');
    const corpo = src.slice(inicioFuncao, src.indexOf('export async function gerarESalvarPdf'));
    assert.match(corpo, /refEmissaoPrivada\(getFirestore\(\), wsId, exameId\)\.get\(\)\)\.data\(\)\?\.emissaoKey \?\? null/,
      'a gaveta e a verdade do servidor — so a emissao vencedora tem a key la');
    assert.match(corpo, /const candidatos = key\s*\n\s*\? \[pathSnapshotHtml\(wsId, exameId, key\), pathSnapshotHtml\(wsId, exameId\)\]\s*\n\s*: \[pathSnapshotHtml\(wsId, exameId\)\];/,
      'com key, o candidato sufixado tem que vir ANTES do canonico (fallback e o 2o, nao o 1o)');
  });

  test('item 5 (transição): exame emitido entre a onda-0 e o round 5 — gaveta JÁ tem key, mas o snapshot daquela emissão só existe no canônico → o 2º candidato (fallback) tem que ser exatamente esse canônico', () => {
    // Não dá pra provar com download real (Storage não emulado — o try/catch
    // por candidato de lerSnapshotHtml despacharia pro próximo mesmo sem essa
    // garantia). O que FECHA o caso: o candidato sufixado usa a MESMA key que
    // a gaveta tem HOJE (não uma key antiga/inexistente) e o canônico
    // (pathSnapshotHtml sem key) é sempre o último candidato tentado — então,
    // se o objeto sufixado não existir (não existia antes do round 5), o loop
    // cai exatamente no path que a emissão pré-round-5 realmente usou.
    const chave = 'a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6';
    const candidatosComKey = [pathSnapshotHtml('wsX', 'exY', chave), pathSnapshotHtml('wsX', 'exY')];
    assert.equal(candidatosComKey[candidatosComKey.length - 1], pathSnapshotHtml('wsX', 'exY'),
      'o ultimo candidato (fallback) tem que ser o canonico — onde a emissao pre-round-5 realmente gravou');
    assert.equal(candidatosComKey[candidatosComKey.length - 1], 'laudos-html/wsX/exY.html');
  });

  test('sem ciclo de import: pdf-server importa refEmissaoPrivada de emitir-admin (relativo)', () => {
    const src = ler('src', 'lib', 'pdf-server.ts');
    assert.match(src, /import \{ refEmissaoPrivada \} from '\.\/emitir-admin';/);
    const emitirAdminSrc = ler('src', 'lib', 'emitir-admin.ts');
    assert.ok(!/from ['"]\.\/pdf-server['"]/.test(emitirAdminSrc), 'emitir-admin.ts nao pode importar pdf-server.ts de volta — ciclo');
  });
});

describe('/api/emitir só congela o snapshot DEPOIS da publicação confirmada, no path da PRÓPRIA tentativa', () => {
  const src = semComentarios(ler('src', 'app', 'api', 'emitir', 'route.ts'));

  test('braço de sucesso: salvarSnapshotHtml vem DEPOIS de publicarPdfSeAindaDono devolver true, com { emissaoKey }', () => {
    assert.match(
      src,
      /else if \(await publicarPdfSeAindaDono\(dbAdmin, \{ wsId, exameId, pdfUrl: url, emissaoKey \}\)\) \{\s*pdfUrl = url;\s*await salvarSnapshotHtml\(pdfHtml, wsId, exameId, nomeArqTentativa, \{ emissaoKey \}\);\s*\}/,
      'snapshot tem que estar DENTRO do braço que confirma a publicação, logo após pdfUrl = url, sufixado pela propria key',
    );
  });

  test('catch de falha: salvarSnapshotHtml só roda dentro do `if (await marcarPdfErroSeAindaDono(...))`, com { emissaoKey }', () => {
    assert.match(
      src,
      /if \(await marcarPdfErroSeAindaDono\(dbAdmin, \{ wsId, exameId, emissaoKey \}\)\) \{\s*await salvarSnapshotHtml\(pdfHtml, wsId, exameId, nomeArqTentativa, \{ emissaoKey \}\);\s*\}/,
      'o snapshot de recuperação só pode ser gravado se AINDA formos donos — perdedor nunca toca o snapshot (de ninguem)',
    );
  });

  test('nenhuma chamada de salvarSnapshotHtml fica FORA dos 2 gates acima (só 2 chamadas no arquivo)', () => {
    const chamadas = src.match(/salvarSnapshotHtml\(/g) || [];
    assert.equal(chamadas.length, 2, 'uma 3a chamada solta reabriria o bug — só as 2 guardadas valem');
  });
});

describe('/api/corrigir-laudo só congela o snapshot DEPOIS da publicação confirmada, no MESMO path que leu', () => {
  const src = semComentarios(ler('src', 'app', 'api', 'corrigir-laudo', 'route.ts'));

  test('salvarSnapshotHtml vem DEPOIS de publicarCorrecaoSeAindaEmitido devolver true, com { path: snapshot.path }', () => {
    assert.match(
      src,
      /\}\)\) \{\s*pdfUrl = pdfCandidato;\s*await salvarSnapshotHtml\(htmlCorrigido, wsId, exameId, snapshot\.nomeArq, \{ path: snapshot\.path \}\);\s*\} else \{/,
      'snapshot tem que estar DENTRO do braço que confirma a publicação, logo após pdfUrl = pdfCandidato, no MESMO path lido',
    );
  });

  test('não deriva o path de novo pela key atual da gaveta (usa o path resolvido na leitura, nao {emissaoKey})', () => {
    assert.ok(!/salvarSnapshotHtml\(htmlCorrigido, wsId, exameId, snapshot\.nomeArq, \{ emissaoKey/.test(src),
      'rederivar pela key atual migraria silenciosamente o snapshot de um exame pre-round-5 pro path sufixado');
  });

  test('só 1 chamada de salvarSnapshotHtml no arquivo (nenhuma solta no catch)', () => {
    const chamadas = src.match(/salvarSnapshotHtml\(/g) || [];
    assert.equal(chamadas.length, 1, 'corrigir-laudo não regrava snapshot no catch — só no sucesso confirmado');
  });
});
