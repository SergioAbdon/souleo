// Task 6 (P4+E4): quando o PDF falha DEPOIS da franquia cobrada, a rota tem
// que persistir a marca (`pdfErro`) e congelar o snapshot — sem isso a
// correcao administrativa deste exame (unica via de recuperacao sem 2a
// franquia) morre pra sempre e ninguem no doc sabe que o laudo ficou sem PDF.
//
// A rota real depende de Puppeteer + Storage (nenhum dos dois emulado nesta
// bateria — so firestore+auth, ver package.json test:api) e nao tem seam de
// injecao de dependencia: nao da pra chamar o handler HTTP fim-a-fim com um
// `gerarESalvarPdf` fake. Mesma limitacao que corrigir-laudo.test.mjs ja
// documenta ali (`describe('alvo do PDF corrigido nao vem do doc do exame')`)
// — a saida de la e a daqui e a mesma: travar o CONTRATO da rota por leitura
// de fonte (o wiring do catch/sucesso), e testar de verdade tudo que E puro
// (aqui: `salvarSnapshotHtml` exportada e o texto do fail-loud).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { salvarSnapshotHtml } from '../../src/lib/pdf-server.ts';

describe('salvarSnapshotHtml exportada (Step 1)', () => {
  test('e uma funcao — o catch da rota consegue importar e chamar', () => {
    assert.equal(typeof salvarSnapshotHtml, 'function');
  });
});

describe('fail-loud do pdf-server nao mente mais (Step 1)', () => {
  test('mensagem vira "PDF abortado" (a franquia ja foi cobrada neste ponto)', async () => {
    const src = await readFile(new URL('../../src/lib/pdf-server.ts', import.meta.url), 'utf8');
    assert.ok(src.includes("'imagem não assinada — PDF abortado'"));
    assert.ok(!src.includes('emissão abortada'), 'texto antigo (mentiroso pos-cobranca) ainda no arquivo');
  });
});

describe('/api/emitir — wiring do catch de PDF (Step 2)', () => {
  test('rota le o contrato certo', async () => {
    const bruto = await readFile(new URL('../../src/app/api/emitir/route.ts', import.meta.url), 'utf8');
    const src = bruto.replace(/^\s*\/\/.*$/gm, '');   // comentarios citam os proprios trechos

    // Sucesso (os DOIS bracos) limpa pdfErro — sem isto um exame que falhou
    // uma vez e teve sucesso na correcao ficava com a marca velha pra sempre.
    const limpasSucesso = src.match(/\{ pdfUrl, pdfErro: FieldValue\.delete\(\) \}/g) || [];
    assert.equal(limpasSucesso.length, 2, 'os 2 bracos (anexo + puppeteer) tem que limpar pdfErro no sucesso');

    // Os DOIS catches marcam pdfErro no doc (mascarado — P10: nunca e.message).
    const marcasNoDoc = src.match(/\.update\(\{ pdfErro: 'erro_pdf' \}\)/g) || [];
    assert.equal(marcasNoDoc.length, 2, 'os 2 catches tem que gravar pdfErro no doc');
    assert.ok(!/pdfErro = e instanceof Error \? e\.message/.test(src),
      'detalhe do erro nao pode vazar pra resposta/doc — so pro log');

    // So o braco pdfHtml tem HTML pra congelar; o de anexo nao.
    assert.ok(/await salvarSnapshotHtml\(pdfHtml, wsId, exameId, sanitizarNomeArq\(nomeArq, exameId\)\)\.catch/.test(src),
      'catch do braco pdfHtml tem que congelar o snapshot (unica via de recuperacao sem 2a franquia)');
    const chamadasSnapshot = src.match(/salvarSnapshotHtml\(/g) || [];
    assert.equal(chamadasSnapshot.length, 1, 'braco de anexo nao tem HTML — nao pode chamar snapshot');

    assert.ok(src.includes("import { gerarESalvarPdf, salvarPdfBuffer, salvarSnapshotHtml } from '@/lib/pdf-server';"));
    assert.ok(src.includes("import { sanitizarNomeArq } from '@/lib/pdf-path';"));
  });
});
