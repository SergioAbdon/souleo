// Tríade onda-4 (Ruflo item 4): `abrirPdfUrl` (src/lib/pdfUtils.ts) é o dono
// único de `window.open` pro PDF assinado — ganhou 'noopener,noreferrer' ali
// e SÓ ali. Duas chamadas cruas em laudo/[id]/page.tsx (pós-emissão e
// pós-correção) foram trocadas por `abrirPdfUrl(...)`; este pin garante que
// nenhuma nova chamada crua reapareça em `src/` (fora do próprio pdfUtils.ts)
// referenciando uma URL de PDF — `window.open('', ...)` (janela de impressão
// em branco, depois preenchida por `document.write`) não é o que este pin
// vigia, só `window.open(algumaCoisaComPdfUrl, ...)`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..');
const dono = path.join('src', 'lib', 'pdfUtils.ts');

function arquivosTs(dir, achados = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivosTs(p, achados);
    else if (/\.(ts|tsx)$/.test(e.name)) achados.push(p);
  }
  return achados;
}

describe('window.open com pdfUrl só existe em pdfUtils.ts (Ruflo item 4)', () => {
  const arquivos = arquivosTs(path.join(raiz, 'src')).filter(
    (p) => path.relative(raiz, p) !== dono,
  );

  test('achou arquivos .ts/.tsx pra varrer (o scanner não pode voltar vazio)', () => {
    assert.ok(arquivos.length > 50, `esperava dezenas de arquivos, achei ${arquivos.length}`);
  });

  for (const arquivo of arquivos) {
    const src = fs.readFileSync(arquivo, 'utf8');
    if (/window\.open\([^)]*[Pp]df/.test(src)) {
      test(`${path.relative(raiz, arquivo)}: sem window.open cru com pdfUrl`, () => {
        assert.fail(
          `${path.relative(raiz, arquivo)} chama window.open direto com algo que parece ` +
          'pdfUrl — use abrirPdfUrl() de @/lib/pdfUtils (dono único do noopener,noreferrer)',
        );
      });
    }
  }

  test('pdfUtils.ts continua sendo o único dono (window.open com noopener,noreferrer)', () => {
    const src = fs.readFileSync(path.join(raiz, dono), 'utf8');
    assert.match(src, /window\.open\(url, '_blank', 'noopener,noreferrer'\)/,
      'abrirPdfUrl mudou de forma — ajuste este pin');
  });
});
