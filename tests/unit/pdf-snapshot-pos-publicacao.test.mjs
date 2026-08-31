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
// publicou e snapshotou DEPOIS de A. Fix: o snapshot virou por TENTATIVA
// também (path sufixado pela `emissaoKey`); `lerSnapshotHtml` resolve
// sozinho lendo a GAVETA, com fallback pro canônico.
//
// Round 6 (Codex Critical): o fallback pro canônico do round 5 era CEGO —
// se o save do sufixado falhasse em silêncio (`salvarSnapshotHtml` nunca
// lança), `lerSnapshotHtml` caía no canônico, que podia ser o corpo clínico
// de uma emissão ANTERIOR (uma correção regeneraria conteúdo desatualizado
// no exame ATUAL). Fix: a gaveta agora DECLARA `snapshotSufixado:true` no
// MESMO commit que confirma a emissão (publicarPdfSeAindaDono /
// marcarPdfErroSeAindaDono), ANTES da rota tentar o save — com a flag, SÓ o
// sufixado vale (sem fallback: sufixado ausente → null, correção honesta
// avisa `pdfDesatualizado` em vez de regenerar corpo velho). Sem a flag,
// comportamento do round 5 (cobre os 2 regimes antigos: pré-onda-0 sem key
// nenhuma, e a transição onda-0→round-6 com key mas sem a flag ainda).
//
// Storage não é emulado nesta bateria (mesma limitação de todo o resto do
// pipeline de PDF, documentada em tests/api/emitir-pdf-erro.test.mjs e
// tests/api/corrigir-laudo.test.mjs) — sem DI/spy no cliente do Storage. Pra
// dar pra testar de verdade sem Storage, `candidatosSnapshotHtml` (a decisão
// de QUAIS paths tentar e em que ordem — o cerne do bug e do fix dos rounds
// 5/6) foi extraída pura e é testada com asserts reais abaixo; o resto
// (wiring de quem chama o quê, com qual gaveta/path) é source-pin.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathSnapshotHtml, candidatosSnapshotHtml, ehSnapshotDoExame } from '../../src/lib/pdf-path.ts';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), 'utf8');
const semComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const CHAVE = 'a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6';

describe('pathSnapshotHtml — path por tentativa (round 5)', () => {
  test('com emissaoKey: path sufixado', () => {
    assert.equal(pathSnapshotHtml('ws1', 'ex1', CHAVE), `laudos-html/ws1/ex1-${CHAVE}.html`);
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

// Os 3 casos pedidos pelo round 6 (item 3), provados com asserts reais (não
// regex) — a função pura decide exatamente isso, sem precisar de Storage.
describe('candidatosSnapshotHtml — flag declara dono, sem fallback cego (round 6)', () => {
  test('(a) pós-round-6: gaveta com key E snapshotSufixado:true → SÓ o sufixado (sem canônico na lista)', () => {
    const candidatos = candidatosSnapshotHtml('ws1', 'ex1', { emissaoKey: CHAVE, snapshotSufixado: true });
    assert.deepEqual(candidatos, [pathSnapshotHtml('ws1', 'ex1', CHAVE)]);
    assert.ok(!candidatos.includes(pathSnapshotHtml('ws1', 'ex1')),
      'com a flag, o canonico NAO pode ser candidato — pode ser de uma emissao ANTERIOR (regressao achada pelo Codex)');
  });

  test('(b) transição: gaveta com key, SEM a flag → sufixado primeiro, canônico como fallback (round 5 intacto)', () => {
    const candidatos = candidatosSnapshotHtml('ws1', 'ex1', { emissaoKey: CHAVE });
    assert.deepEqual(candidatos, [pathSnapshotHtml('ws1', 'ex1', CHAVE), pathSnapshotHtml('ws1', 'ex1')]);
  });

  test('(c) normal: com a flag, o único candidato É o path sufixado certo (onde o save realmente escreveu)', () => {
    const candidatos = candidatosSnapshotHtml('ws1', 'ex1', { emissaoKey: CHAVE, snapshotSufixado: true });
    assert.equal(candidatos[0], `laudos-html/ws1/ex1-${CHAVE}.html`);
  });

  test('pré-onda-0: sem gaveta nenhuma (undefined/null) → só o canônico', () => {
    assert.deepEqual(candidatosSnapshotHtml('ws1', 'ex1', undefined), [pathSnapshotHtml('ws1', 'ex1')]);
    assert.deepEqual(candidatosSnapshotHtml('ws1', 'ex1', null), [pathSnapshotHtml('ws1', 'ex1')]);
  });

  test('flag true mas sem key (defensivo — nao deveria acontecer, a flag so e gravada junto de uma key confirmada): cai no canônico, nunca quebra', () => {
    assert.deepEqual(candidatosSnapshotHtml('ws1', 'ex1', { snapshotSufixado: true }), [pathSnapshotHtml('ws1', 'ex1')]);
  });
});

// Tríade onda-3 (Codex-1 Important): apagarSnapshotsExame (pdf-storage.ts)
// lista por PREFIXO largo e usa este matcher pra decidir objeto a objeto —
// o bug que ele fecha era apagar por prefixo cru ('exameId-'), que bate
// tanto no canônico quanto nos sufixados de um exame DIFERENTE cujo id
// começa com o mesmo texto + hífen (exameId 'abc' apagaria 'abc-2.html').
describe('ehSnapshotDoExame — matcher exato (fecha a colisão de prefixo do Codex-1)', () => {
  const UUID = 'a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6';

  test('casa o canônico do próprio exame', () => {
    assert.ok(ehSnapshotDoExame('laudos-html/ws1/abc.html', 'abc'));
    assert.ok(ehSnapshotDoExame('abc.html', 'abc'), 'funciona mesmo sem prefixo de pasta (basename cru)');
  });

  test('casa o sufixado-UUID do próprio exame', () => {
    assert.ok(ehSnapshotDoExame(`laudos-html/ws1/abc-${UUID}.html`, 'abc'));
  });

  test('NAO casa objetos de um exame DIFERENTE cujo id começa com o mesmo texto (o bug do Codex-1)', () => {
    assert.ok(!ehSnapshotDoExame('laudos-html/ws1/abc-2.html', 'abc'),
      "exameId 'abc' apagando o canonico do exame 'abc-2' — a colisao de prefixo original");
    assert.ok(!ehSnapshotDoExame(`laudos-html/ws1/abc-2-${UUID}.html`, 'abc'),
      "exameId 'abc' apagando um sufixado do exame 'abc-2'");
  });

  test('NAO casa prefixo parcial nem sufixo solto (so as 2 formas exatas)', () => {
    assert.ok(!ehSnapshotDoExame('laudos-html/ws1/abcdef.html', 'abc'));
    assert.ok(!ehSnapshotDoExame('laudos-html/ws1/xabc.html', 'abc'));
    assert.ok(!ehSnapshotDoExame(`laudos-html/ws1/abc-${UUID.slice(0, 20)}.html`, 'abc'), 'UUID truncado nao e UUID');
  });

  test('exameId com caractere de regex nao escapa o matcher pra outro exame', () => {
    assert.ok(ehSnapshotDoExame('laudos-html/ws1/a.c.html', 'a.c'), 'o "." do proprio id casa literal');
    assert.ok(!ehSnapshotDoExame('laudos-html/ws1/aXc.html', 'a.c'), 'sem escape, "." viraria wildcard e casaria "aXc"');
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

  test('lerSnapshotHtml resolve a gaveta inteira (nao so a key) e delega a candidatosSnapshotHtml', () => {
    const src = semComentarios(ler('src', 'lib', 'pdf-storage.ts'));
    const inicioFuncao = src.indexOf('export async function lerSnapshotHtml');
    assert.ok(inicioFuncao >= 0, 'lerSnapshotHtml sumiu de pdf-storage.ts (onda-3: saiu de pdf-server.ts, sem Puppeteer)');
    const corpo = src.slice(inicioFuncao);
    assert.match(corpo, /const gaveta = await lerGavetaEmissao\(getFirestore\(\), wsId, exameId\);/,
      'a gaveta e a verdade do servidor (round 6: precisa do doc inteiro, nao so a key, pra ler snapshotSufixado — tríade onda-3: via lerGavetaEmissao tipada, nao mais .data() cru)');
    assert.match(corpo, /const candidatos = candidatosSnapshotHtml\(wsId, exameId, gaveta\);/,
      'a decisao de candidatos tem que vir da funcao pura (testavel), nao reimplementada aqui');
  });

  // Tríade onda-3 (Ruflo-A2): pathSnapshotHtml/candidatosSnapshotHtml
  // moveram de pdf-storage.ts pra pdf-path.ts (dono declarado do formato de
  // path, puro, ZERO imports — nem `@/`, nem relativo). pdf-storage.ts
  // importa `lerGavetaEmissao` de emitir-admin.ts (não mais
  // `refEmissaoPrivada`/`emissaoKeyValida` crus) — o risco de ciclo continua
  // o mesmo de antes: emitir-admin.ts não pode importar de volta.
  test('pdf-path.ts nao importa nada (nem @/, nem relativo) — dono puro do formato', () => {
    const src = ler('src', 'lib', 'pdf-path.ts');
    assert.ok(!/^import /m.test(src), 'pdf-path.ts ganhou um import — deixou de ser puro, o script retroativo.mjs para de conseguir importar direto');
  });

  test('sem ciclo de import: pdf-storage importa lerGavetaEmissao de emitir-admin (relativo)', () => {
    const src = ler('src', 'lib', 'pdf-storage.ts');
    assert.match(src, /import \{ lerGavetaEmissao \} from '\.\/emitir-admin';/);
    assert.match(src, /from '\.\/pdf-path';/, 'pathSnapshotHtml/candidatosSnapshotHtml/ehSnapshotDoExame vem de pdf-path.ts');
    const emitirAdminSrc = ler('src', 'lib', 'emitir-admin.ts');
    assert.ok(!/from ['"]\.\/pdf-storage['"]/.test(emitirAdminSrc), 'emitir-admin.ts nao pode importar pdf-storage.ts de volta — ciclo');
    assert.ok(!/from ['"]\.\/pdf-server['"]/.test(emitirAdminSrc), 'emitir-admin.ts nao pode importar pdf-server.ts de volta — ciclo (herdado)');
  });
});

describe('/api/emitir só congela o snapshot DEPOIS da publicação confirmada, no path da PRÓPRIA tentativa', () => {
  const src = semComentarios(ler('src', 'app', 'api', 'emitir', 'route.ts'));

  test('braço de sucesso: salvarSnapshotHtml vem DEPOIS de publicarPdfSeAindaDono devolver true, com { emissaoKey }', () => {
    assert.match(
      src,
      /else if \(await publicarPdfSeAindaDono\(dbAdmin, \{ wsId, exameId, pdfUrl: url, emissaoKey, declaraSnapshotSufixado: true \}\)\) \{\s*pdfUrl = url;\s*await salvarSnapshotHtml\(pdfHtml, wsId, exameId, nomeArqTentativa, \{ emissaoKey \}\);\s*\}/,
      'snapshot tem que estar DENTRO do braço que confirma a publicação, logo após pdfUrl = url, sufixado pela propria key',
    );
  });

  test('catch de falha: salvarSnapshotHtml só roda dentro do `if (await marcarPdfErroSeAindaDono(..., declaraSnapshotSufixado: true))`', () => {
    assert.match(
      src,
      /if \(await marcarPdfErroSeAindaDono\(dbAdmin, \{ wsId, exameId, emissaoKey, declaraSnapshotSufixado: true \}\)\) \{\s*await salvarSnapshotHtml\(pdfHtml, wsId, exameId, nomeArqTentativa, \{ emissaoKey \}\);\s*\}/,
      'o snapshot de recuperação só pode ser gravado se AINDA formos donos, E precisa declarar a flag (round 6) no mesmo commit',
    );
  });

  test('o catch do braço de ANEXO (sem HTML) NÃO declara snapshotSufixado — nunca tem snapshot pra congelar', () => {
    assert.match(src, /await marcarPdfErroSeAindaDono\(dbAdmin, \{ wsId, exameId, emissaoKey \}\)\s*\n\s*\.catch/,
      'o catch do anexo chama marcarPdfErroSeAindaDono SEM declaraSnapshotSufixado — declarar a flag ali mentiria (nenhum snapshot e gravado)');
  });

  // Round 7 (Ponytail item 6): copia CANONICA do pin salvarSnapshotHtml==2 —
  // as duplicatas em emitir-pdf-erro.test.mjs e pdf-nome-arquivo.test.mjs
  // saíram.
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

  test('o catch de corrigir-laudo NÃO declara snapshotSufixado (round 6) — nunca regrava snapshot ali', () => {
    assert.match(src, /await marcarPdfErroSeAindaDono\(dbAdmin, \{ wsId, exameId, emissaoKey: keyNoGuard \}\)\s*\n\s*\.catch/,
      'declarar a flag no catch de corrigir-laudo mentiria pra lerSnapshotHtml num exame de transicao que nunca ganhou snapshot novo');
  });

  test('só 1 chamada de salvarSnapshotHtml no arquivo (nenhuma solta no catch)', () => {
    const chamadas = src.match(/salvarSnapshotHtml\(/g) || [];
    assert.equal(chamadas.length, 1, 'corrigir-laudo não regrava snapshot no catch — só no sucesso confirmado');
  });
});
