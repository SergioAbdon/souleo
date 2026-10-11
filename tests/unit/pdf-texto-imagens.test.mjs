import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gerarPdfHtmlTexto } from '../../src/lib/pdf-texto.ts';
import { renderPaginasPdf } from '../../src/lib/pdf-imagens.ts';

const base = {
  p1: '#8B1A1A',
  clinicaNome: 'Clínica demonstração',
  tituloExame: 'DOPPLER DE CARÓTIDAS',
  identificacao: { nome: 'PACIENTE', nasc: '1970-01-01', dataExame: '2026-10-08' },
  htmlCorpo: '<p>Exame normal.</p>',
  assinatura: { nome: 'Dr. Demo', crm: '1', ufCrm: 'PA' },
};

describe('laudo de texto — páginas de imagem no PDF (spec 2026-10-11-imagens-e-sr)', () => {
  test('sem htmlPosTabela o PDF é o de sempre (byte a byte)', () => {
    assert.equal(gerarPdfHtmlTexto({ ...base, htmlPosTabela: '' }), gerarPdfHtmlTexto(base));
  });
  test('com htmlPosTabela as páginas entram DEPOIS da folha', () => {
    const paginas = renderPaginasPdf(['ws/ex/a.jpg', 'ws/ex/b.jpg'], 'PACIENTE', 'Doppler', '#8B1A1A');
    const html = gerarPdfHtmlTexto({ ...base, htmlPosTabela: paginas });
    assert.ok(html.includes('class="pagina"'), 'página de imagens presente');
    assert.ok(html.indexOf('Exame normal.') < html.indexOf('class="pagina"'), 'corpo do laudo vem antes das imagens');
    assert.ok(html.includes('ws/ex/a.jpg') && html.includes('ws/ex/b.jpg'));
  });
  test('renderPaginasPdf: 9 imagens = 2 páginas com 8 slots cada; 0 imagens = vazio', () => {
    const nove = renderPaginasPdf(Array.from({ length: 9 }, (_, i) => `ws/ex/${i}.jpg`), 'P', 'T', '#8B1A1A');
    assert.equal((nove.match(/class="pagina"/g) || []).length, 2);
    assert.equal((nove.match(/class="slot slot-vazio"/g) || []).length, 7);
    assert.equal(renderPaginasPdf([], 'P', 'T', '#8B1A1A'), '');
  });
  test('renderPaginasPdf: cor fora do padrão não entra no CSS (corSegura)', () => {
    const html = renderPaginasPdf(['ws/ex/a.jpg'], 'P', 'T', 'red;}</style><script>x</script>');
    assert.ok(!html.includes('<script>'));
  });
});
