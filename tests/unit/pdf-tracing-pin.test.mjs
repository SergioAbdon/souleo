// I2 (revisão onda-0 da Seção 7): o binário do Chromium só entra no bundle da
// função serverless que está listada em `outputFileTracingIncludes`. Faltar a
// chave não quebra build nem teste — quebra em PRODUÇÃO, na hora de gerar o
// PDF (foi exatamente o achado P2: a /api/corrigir-laudo rodava
// `gerarESalvarPdf` sem a chave e TODA correção administrativa falhava).
// Este pin fecha o buraco nos dois sentidos: rota nova que importa o
// pdf-server sem chave, e chave apontando pra rota que não existe mais.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const config = fs.readFileSync(path.join(raiz, 'next.config.ts'), 'utf8');

// Rotas que importam o pdf-server DIRETO. Import transitivo (ex.: o shadow, que
// só usa `lerSnapshotHtml`) fica de fora de propósito: quem precisa do binário é
// quem chama `gerarESalvarPdf`, e essa chamada é sempre direta.
function rotasComPdfServer(dir, achadas = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) rotasComPdfServer(p, achadas);
    else if (e.name === 'route.ts' && fs.readFileSync(p, 'utf8').includes("@/lib/pdf-server")) {
      // src/app/api/emitir/route.ts → /api/emitir
      achadas.push('/' + path.relative(path.join(raiz, 'src', 'app'), path.dirname(p)).split(path.sep).join('/'));
    }
  }
  return achadas;
}

const rotas = rotasComPdfServer(path.join(raiz, 'src', 'app', 'api'));
const chaves = [...config.matchAll(/'(\/api\/[^']+)':\s*\[/g)].map((m) => m[1]);

describe('outputFileTracingIncludes cobre quem gera PDF (I2)', () => {
  test('achou as rotas de PDF (o scanner não pode voltar vazio)', () => {
    assert.ok(rotas.length >= 2, `esperava emitir + corrigir-laudo, achei: ${rotas.join(', ')}`);
  });

  for (const rota of rotas) {
    test(`${rota} está no next.config.ts`, () => {
      assert.ok(chaves.includes(rota),
        `${rota} importa @/lib/pdf-server e não tem chave em outputFileTracingIncludes — ` +
        'o Chromium não vai pro lambda e o PDF falha SÓ em produção');
    });
  }

  test('nenhuma chave aponta pra rota que não existe', () => {
    for (const chave of chaves) {
      const arquivo = path.join(raiz, 'src', 'app', chave.slice(1), 'route.ts');
      assert.ok(fs.existsSync(arquivo), `chave morta em next.config.ts: ${chave}`);
    }
  });
});
