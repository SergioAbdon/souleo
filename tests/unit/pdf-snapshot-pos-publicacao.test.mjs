// Round 4 (Codex Critical, item 3): o SNAPSHOT (laudos-html/{wsId}/{exameId}.html)
// é canônico POR EXAME — ao contrário do PDF em si (round 3, path único por
// tentativa), não há como sufixar o snapshot por tentativa sem quebrar o
// contrato "a correção sempre relê o snapshot mais recente pelo mesmo path".
// Até o round 3, `gerarESalvarPdf` gravava o snapshot incondicionalmente,
// LOGO após subir o PDF — SEM esperar a transação de publicação (que só roda
// DEPOIS, no caller). Uma tentativa PERDEDORA podia terminar de subir e
// gravar o snapshot DEPOIS da vencedora — uma correção futura regeneraria o
// corpo clínico ANTIGO por cima do laudo assinado novo.
//
// Fix: `salvarSnapshotHtml` saiu de dentro de `gerarESalvarPdf`. Cada rota
// chama explicitamente, DEPOIS que a transação de publicação
// (publicarPdfSeAindaDono/publicarCorrecaoSeAindaEmitido) devolve `true`.
//
// Storage não é emulado nesta bateria (mesma limitação de todo o resto do
// pipeline de PDF, documentada em tests/api/emitir-pdf-erro.test.mjs e
// tests/api/corrigir-laudo.test.mjs) — sem DI/spy no cliente do Storage, o
// caminho viável é source-pin: trava o WIRING (quem chama o quê, e em que
// branch), não o efeito no bucket.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');
const semComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

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
});

describe('/api/emitir só congela o snapshot DEPOIS da publicação confirmada', () => {
  const src = semComentarios(ler('src', 'app', 'api', 'emitir', 'route.ts'));

  test('braço de sucesso: salvarSnapshotHtml vem DEPOIS de publicarPdfSeAindaDono devolver true (mesmo bloco `if`)', () => {
    assert.match(
      src,
      /else if \(await publicarPdfSeAindaDono\(dbAdmin, \{ wsId, exameId, pdfUrl: url, emissaoKey \}\)\) \{\s*pdfUrl = url;\s*await salvarSnapshotHtml\(pdfHtml, wsId, exameId, nomeArqTentativa\);\s*\}/,
      'snapshot tem que estar DENTRO do braço que confirma a publicação, logo após pdfUrl = url',
    );
  });

  test('catch de falha: salvarSnapshotHtml só roda dentro do `if (await marcarPdfErroSeAindaDono(...))`', () => {
    assert.match(
      src,
      /if \(await marcarPdfErroSeAindaDono\(dbAdmin, \{ wsId, exameId, emissaoKey \}\)\) \{\s*await salvarSnapshotHtml\(pdfHtml, wsId, exameId, nomeArqTentativa\);\s*\}/,
      'o snapshot de recuperação só pode ser gravado se AINDA formos donos — perdedor nunca toca o snapshot',
    );
  });

  test('nenhuma chamada de salvarSnapshotHtml fica FORA dos 2 gates acima (só 2 chamadas no arquivo)', () => {
    const chamadas = src.match(/salvarSnapshotHtml\(/g) || [];
    assert.equal(chamadas.length, 2, 'uma 3a chamada solta reabriria o bug — só as 2 guardadas valem');
  });
});

describe('/api/corrigir-laudo só congela o snapshot DEPOIS da publicação confirmada', () => {
  const src = semComentarios(ler('src', 'app', 'api', 'corrigir-laudo', 'route.ts'));

  test('salvarSnapshotHtml vem DEPOIS de publicarCorrecaoSeAindaEmitido devolver true (mesmo bloco, antes do `else`)', () => {
    assert.match(
      src,
      /\}\)\) \{\s*pdfUrl = pdfCandidato;\s*await salvarSnapshotHtml\(htmlCorrigido, wsId, exameId, snapshot\.nomeArq\);\s*\} else \{/,
      'snapshot tem que estar DENTRO do braço que confirma a publicação, logo após pdfUrl = pdfCandidato',
    );
  });

  test('só 1 chamada de salvarSnapshotHtml no arquivo (nenhuma solta no catch)', () => {
    const chamadas = src.match(/salvarSnapshotHtml\(/g) || [];
    assert.equal(chamadas.length, 1, 'corrigir-laudo não regrava snapshot no catch — só no sucesso confirmado');
  });
});
