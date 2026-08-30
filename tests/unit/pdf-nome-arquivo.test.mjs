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
import { sanitizarNomeArq, pathPdf } from '../../src/lib/pdf-path.ts';

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
    // E o pdf-server não monta path por conta própria (uma fonte só).
    const serverSrc = semComentarios(ler('src', 'lib', 'pdf-server.ts'));
    assert.ok(!/`laudos\//.test(serverSrc), 'pdf-server voltou a montar o path do PDF na mão');
  });
});

// Round 3 (Codex Critical, item 1): PATH ÚNICO POR TENTATIVA. Sem isto, 2
// uploads do MESMO paciente/tipo (retry, corrida de reemissão) escreviam o
// MESMO objeto — o perdedor podia sobrescrever os BYTES do vencedor, ou
// ressuscitar a URL já distribuída de um laudo cancelado (cenário reemissão
// → cancel → upload atrasado).
describe('path único por tentativa — sufixo de emissaoKey (round 3, item 1)', () => {
  test('sufixo curto (8 hex) da key sobrevive à sanitização e fica idempotente', () => {
    const key = 'a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6';
    const base = 'ECOTT JOAO SILVA';
    const comSufixo = `${base} ${key.slice(0, 8)}`;
    const sanitizado = sanitizarNomeArq(comSufixo, 'ex1');
    assert.equal(sanitizado, 'ECOTT_JOAO_SILVA_a1b2c3d4');
    // Idempotente: uma correção que releia esse nome da metadata do snapshot
    // e sanitize de novo tem que mirar o MESMO objeto.
    assert.equal(sanitizarNomeArq(sanitizado, 'ex1'), sanitizado, 'idempotente — regeração futura acerta o MESMO objeto');
  });

  test('2 tentativas do MESMO paciente/tipo com keys diferentes nascem em objetos DIFERENTES', () => {
    const base = 'ECOTT JOAO SILVA';
    const keyA = 'aaaaaaaa-1111-4222-8333-444444444444';
    const keyB = 'bbbbbbbb-1111-4222-8333-444444444444';
    const nomeA = sanitizarNomeArq(`${base} ${keyA.slice(0, 8)}`, 'ex1');
    const nomeB = sanitizarNomeArq(`${base} ${keyB.slice(0, 8)}`, 'ex1');
    assert.notEqual(pathPdf('ws1', 'ex1', nomeA), pathPdf('ws1', 'ex1', nomeB),
      'C1/C2/C3/C4-bytes: o perdedor nunca escreve por cima do objeto do vencedor');
  });

  test('/api/emitir monta o sufixo ANTES de sanitizar, só quando há emissaoKey (legado sem key fica sem sufixo)', () => {
    assert.match(emitirSrc, /const nomeArqTentativa = emissaoKey \? `\$\{nomeArq\} \$\{emissaoKey\.slice\(0, 8\)\}` : nomeArq;/);
  });

  test('os 3 call sites que tocam Storage/snapshot usam nomeArqTentativa (suficado), nunca o nomeArq cru', () => {
    assert.match(emitirSrc, /salvarPdfBuffer\(pdfAnexadoBuf, wsId, exameId, nomeArqTentativa\)/);
    assert.match(emitirSrc, /gerarESalvarPdf\(pdfHtml, wsId, exameId, nomeArqTentativa, podePublicar\)/);
    assert.match(emitirSrc, /salvarSnapshotHtml\(pdfHtml, wsId, exameId, nomeArqTentativa\)/);
  });
});
