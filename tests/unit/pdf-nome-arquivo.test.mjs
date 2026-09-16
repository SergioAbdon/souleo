// Quem NOMEIA o objeto do laudo assinado no Storage (tríade final S5, I3 +
// ARQ-I2). Até aqui o `/api/emitir` recebia `nomeArq` do navegador — o
// cliente escolhia a chave do documento legal — enquanto a rota irmã
// (`/api/corrigir-laudo`, T5) já era dona do próprio alvo. Dois modelos de
// confiança no mesmo bucket. Agora o servidor deriva o nome do que ele mesmo
// gravou, e o path leva o `exameId` (pdf-path.ts), então nome repetido
// (mesmo paciente em duas datas, homônimos) não sobrescreve laudo assinado.
//
// Teste fonte-lendo (mesma técnica de contrato-ponte-ids/laudo-trava-emitido):
// as rotas importam firebase-admin/puppeteer e não sobem no `node --test`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizarNomeArq, pathPdf, nomeArquivoLaudo } from '../../src/lib/pdf-path.ts';

const root = path.resolve(import.meta.dirname, '..', '..');
const ler = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
// Comentários citam `nomeArq` de propósito (explicam o que saiu) — fora.
const semComentarios = (s) => s.replace(/^\s*\/\/.*$/gm, '');

const emitirSrc = semComentarios(ler('src', 'app', 'api', 'emitir', 'route.ts'));
const clientes = {
  'laudo (motor)': ler('src', 'app', 'laudo', '[id]', 'page.tsx'),
  'laudo-texto': ler('src', 'app', 'laudo-texto', '[id]', 'page.tsx'),
  'AnexarPdfModal': ler('src', 'components', 'agenda', 'AnexarPdfModal.tsx'),
};

describe('nome do PDF é do SERVIDOR (I3 / ARQ-I2)', () => {
  test('/api/emitir não lê nomeArq do corpo da requisição', () => {
    const destructuring = emitirSrc.match(/const \{[^}]*\} = body as/);
    assert.ok(destructuring, 'destructuring do body não encontrado em /api/emitir');
    assert.ok(!/nomeArq/.test(destructuring[0]),
      'nomeArq voltou a vir do cliente — ele escolhe a chave do objeto do laudo assinado');
  });

  test('/api/emitir deriva nomeArq de tipoExame + pacienteNome (dadosFinais)', () => {
    assert.match(emitirSrc, /const nomeArq = .*prefixoArquivoPorTipo\(/);
    assert.match(emitirSrc, /dadosFinais\?\.pacienteNome/);
  });

  for (const [nome, src] of Object.entries(clientes)) {
    test(`${nome} não manda nomeArq no corpo do /api/emitir`, () => {
      assert.ok(!/^\s*nomeArq[,:]/m.test(semComentarios(src)),
        `${nome} ainda envia nomeArq — o servidor ignoraria, mas a expectativa errada volta a virar código`);
    });
  }

  test('o path do PDF carrega o exameId (dois exames do mesmo paciente não colidem)', () => {
    assert.match(ler('src', 'lib', 'pdf-path.ts'), /laudos\/\$\{wsId\}\/\$\{exameId\}\/\$\{nomeArquivo\}\.pdf/);
    // Onda-3 P9 moveu quem TOCA Storage (salvarPdfBuffer/pathPdf) de
    // pdf-server.ts pra pdf-storage.ts — o pin repontou pro arquivo certo
    // (tríade onda-3, Ruflo-A4): checar pdf-server.ts aqui checava um
    // arquivo que já não monta path nenhum há duas ondas.
    const storageSrc = semComentarios(ler('src', 'lib', 'pdf-storage.ts'));
    assert.ok(!/`laudos\//.test(storageSrc), 'pdf-storage voltou a montar o path do PDF na mão — uma fonte só, pathPdf() em pdf-path.ts');
  });
});

// Tríade onda-4 (Ruflo item 5): PREFIXO + NOME era composto às cegas em 3
// lugares (route.ts acima, gerarPdfHtml em laudo/[id]/page.tsx, exportDocx.ts)
// — mesma fórmula, 3 cópias que podiam divergir. `nomeArquivoLaudo` (pdf-
// path.ts) é o dono único agora; o PREFIXO entra já resolvido (pdf-path.ts
// continua zero-import de propósito, ver cabeçalho do arquivo — não importa
// dicom-sr-mapping.ts, mesmo esse sendo puro, pra não abrir uma exceção na
// regra "zero import" por conveniência).
describe('nomeArquivoLaudo — dono único da composição prefixo+nome (Ruflo item 5)', () => {
  test('mesma fórmula do servidor: prefixo + espaço + nome.trim().toUpperCase(), trim() no final', () => {
    assert.equal(nomeArquivoLaudo('ECOTT', '  joão silva  '), 'ECOTT JOÃO SILVA');
    assert.equal(nomeArquivoLaudo('', 'joão'), 'JOÃO'); // trim() final come o espaço do prefixo vazio
  });

  test('os 3 call sites usam nomeArquivoLaudo(), não reimplementam a composição', () => {
    assert.match(emitirSrc, /nomeArquivoLaudo\(/, '/api/emitir precisa compor via nomeArquivoLaudo');
    assert.match(clientes['laudo (motor)'], /nomeArquivoLaudo\(/, 'gerarPdfHtml (laudo/[id]) precisa compor via nomeArquivoLaudo');
    assert.match(ler('src', 'lib', 'exportDocx.ts'), /nomeArquivoLaudo\(/, 'exportDocx precisa compor via nomeArquivoLaudo');
  });

  test('exportDocx passa o exameId REAL pro sanitizarNomeArq, não um literal', () => {
    const docxSrc = semComentarios(ler('src', 'lib', 'exportDocx.ts'));
    assert.match(docxSrc, /sanitizarNomeArq\(nomeArquivoLaudo\([^)]*\), exameId\)/,
      'sanitizarNomeArq precisa receber a variável exameId (fallback honesto se o nome vier vazio), não uma string fixa');
  });

  test('pdf-path.ts continua zero-import (contrato do cabeçalho do arquivo)', () => {
    const src = ler('src', 'lib', 'pdf-path.ts');
    assert.ok(!/^import /m.test(src), 'pdf-path.ts ganhou um import — quebra a testabilidade direta/scripts .mjs fora do Next (ver cabeçalho)');
  });
});

// Round 3 (Codex Critical, item 1) + round 4 (item 2): PATH ÚNICO POR
// TENTATIVA. Sem isto, 2 uploads do MESMO paciente/tipo (retry, corrida de
// reemissão) escreviam o MESMO objeto — o perdedor podia sobrescrever os
// BYTES do vencedor, ou ressuscitar a URL já distribuída de um laudo
// cancelado (cenário reemissão → cancel → upload atrasado). Round 4: o
// sufixo virou a emissaoKey INTEIRA (8 chars era colidível de propósito — a
// key vem do cliente) e emissaoKey virou obrigatória (sem ramo "legado sem
// sufixo" pra reabrir a janela).
describe('path único por tentativa — sufixo de emissaoKey (rounds 3+4)', () => {
  test('a key INTEIRA (com hifens) sobrevive à sanitização e fica idempotente', () => {
    const key = 'a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6';
    const base = 'ECOTT JOAO SILVA';
    const comSufixo = `${base} ${key}`;
    const sanitizado = sanitizarNomeArq(comSufixo, 'ex1');
    assert.equal(sanitizado, `ECOTT_JOAO_SILVA_${key}`, 'hifens sobrevivem — sanitizarNomeArq so filtra fora de [A-Za-z0-9À-ÿ _-]');
    // Idempotente: uma correção que releia esse nome da metadata do snapshot
    // e sanitize de novo tem que mirar o MESMO objeto.
    assert.equal(sanitizarNomeArq(sanitizado, 'ex1'), sanitizado, 'idempotente — regeração futura acerta o MESMO objeto');
  });

  test('2 tentativas do MESMO paciente/tipo com keys diferentes nascem em objetos DIFERENTES', () => {
    const base = 'ECOTT JOAO SILVA';
    const keyA = 'aaaaaaaa-1111-4222-8333-444444444444';
    const keyB = 'bbbbbbbb-1111-4222-8333-444444444444';
    const nomeA = sanitizarNomeArq(`${base} ${keyA}`, 'ex1');
    const nomeB = sanitizarNomeArq(`${base} ${keyB}`, 'ex1');
    assert.notEqual(pathPdf('ws1', 'ex1', nomeA), pathPdf('ws1', 'ex1', nomeB),
      'C1/C2/C3/C4-bytes: o perdedor nunca escreve por cima do objeto do vencedor');
  });

  test('/api/emitir monta o sufixo ANTES de sanitizar com a key INTEIRA, sem ramo condicional (round 4: obrigatoria)', () => {
    assert.match(emitirSrc, /const nomeArqTentativa = `\$\{nomeArq\} \$\{emissaoKey\}`;/);
  });

  test('os 3 call sites que tocam Storage usam nomeArqTentativa (suficado), nunca o nomeArq cru', () => {
    assert.match(emitirSrc, /salvarPdfBuffer\(pdfAnexadoBuf, wsId, exameId, nomeArqTentativa\)/);
    assert.match(emitirSrc, /gerarESalvarPdf\(pdfHtml, wsId, exameId, nomeArqTentativa, podePublicar\)/);
    // Round 4 (item 3): salvarSnapshotHtml saiu de dentro de gerarESalvarPdf
    // — agora são 2 chamadas explícitas na rota (sucesso + catch), as 2 com
    // nomeArqTentativa e sufixando o OBJETO pela própria key (round 5).
    // Contagem canônica das 2 chamadas: tests/unit/
    // pdf-snapshot-pos-publicacao.test.mjs (round 7, Ponytail item 6 —
    // duplicata daqui saiu).
  });

  test('a rota recusa 400 sem emissaoKey valida (round 4, item 1) — sem ramo "legado sem key"', () => {
    assert.match(emitirSrc, /if \(!emissaoKeyValida\(emissaoKey\)\) \{/);
    assert.ok(emitirSrc.includes("error: 'emissaoKey obrigatoria — recarregue a pagina'"));
    assert.ok(!/emissaoKey !== undefined/.test(emitirSrc), 'ramo "opcional" (undefined passa) nao pode voltar');
  });
});
