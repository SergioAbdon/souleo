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
