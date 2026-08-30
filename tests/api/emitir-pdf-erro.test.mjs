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
// Ponytail-2: sem import de salvarSnapshotHtml so pra um typeof — o proprio
// `import { gerarESalvarPdf, ... } from '@/lib/pdf-server'` do route.ts (e a
// bateria de emitir-carimbo-pin.test.mjs) ja pinam a existencia do export;
// um ESM import que falhasse ja quebraria a suite inteira antes do 1o teste.

describe('fail-loud do pdf-server nao mente mais (Step 1)', () => {
  test('mensagem vira "PDF abortado" (a franquia ja foi cobrada neste ponto)', async () => {
    const src = await readFile(new URL('../../src/lib/pdf-server.ts', import.meta.url), 'utf8');
    assert.ok(src.includes("'imagem não assinada — PDF abortado'"));
    // Ponytail-1: o assert do texto antigo ("emissão abortada") saiu — pin
    // fragil, quebrava em qualquer reescrita do comentario ao redor.
  });
});

describe('/api/emitir — wiring do catch de PDF (Step 2)', () => {
  test('rota le o contrato certo', async () => {
    const bruto = await readFile(new URL('../../src/app/api/emitir/route.ts', import.meta.url), 'utf8');
    const src = bruto.replace(/^\s*\/\/.*$/gm, '');   // comentarios citam os proprios trechos

    // Round 2 (Codex, check-then-write/C4): o ponteiro (pdfUrl) e a bandeira
    // (pdfPendente) so viram de fato dentro de publicarPdfSeAindaDono
    // (emitir-admin.ts), atomicos — a rota nao escreve mais `{ pdfUrl,
    // pdfErro: FieldValue.delete() }` direto no doc nos DOIS bracos de sucesso.
    const chamadasPublicar = src.match(/publicarPdfSeAindaDono\(dbAdmin, \{ wsId, exameId, pdfUrl: url, emissaoKey \}\)/g) || [];
    assert.equal(chamadasPublicar.length, 2, 'os 2 bracos (anexo + puppeteer) tem que publicar pelo mesmo caminho atomico');
    assert.ok(!/\.update\(\{ pdfUrl,/.test(src),
      'a rota nao pode mais escrever pdfUrl direto no doc — quem publica e publicarPdfSeAindaDono');

    // Round 3 (Codex Important, item 3): os DOIS catches marcam pdfErro
    // dentro de transacao condicional (marcarPdfErroSeAindaDono) — nao mais
    // check-then-update fora de transacao (o catch da tentativa A podia
    // carimbar pdfErro no exame que B acabou de reemitir com sucesso).
    // Round 6 (item 1): so o catch do braco pdfHtml declara
    // `declaraSnapshotSufixado: true` (e o unico que tenta salvar um
    // snapshot sufixado logo depois — o anexo nunca tem HTML pra congelar).
    const chamadasMarcarErro = (src.match(/marcarPdfErroSeAindaDono\(dbAdmin, \{ wsId, exameId, emissaoKey \}\)/g) || [])
      .concat(src.match(/marcarPdfErroSeAindaDono\(dbAdmin, \{ wsId, exameId, emissaoKey, declaraSnapshotSufixado: true \}\)/g) || []);
    assert.equal(chamadasMarcarErro.length, 2, 'os 2 catches tem que marcar pdfErro pelo mesmo caminho atomico (anexo sem a flag, pdfHtml com ela)');
    assert.ok(!/\.update\(\{ pdfErro: 'erro_pdf' \}\)/.test(src),
      'a rota nao pode mais escrever pdfErro direto no doc — quem marca e marcarPdfErroSeAindaDono');
    assert.ok(!/pdfErro = e instanceof Error \? e\.message/.test(src),
      'detalhe do erro nao pode vazar pra resposta/doc — so pro log');
    // Follow-up (reviewer): a falha dessa escrita nao-critica nao pode ser
    // engolida em silencio — loga, mesmo sem poder fazer mais nada. Round 4
    // (item 3): o braco pdfHtml passou a envolver marcarPdfErroSeAindaDono +
    // salvarSnapshotHtml num try/catch (precisa do valor de retorno pra
    // decidir o snapshot) — o log e o mesmo texto, so a forma mudou de
    // `.catch(e2 => ...)` pra `catch (e2) { ... }`.
    const catchesLogados = (src.match(/\.catch\(\(e2\) => console\.error\('marcar pdfErro \(nao-critico\):', e2\)\)/g) || [])
      .concat(src.match(/catch \(e2\) \{\s*console\.error\('marcar pdfErro \(nao-critico\):', e2\);\s*\}/g) || []);
    assert.equal(catchesLogados.length, 2, 'os 2 catches (anexo + pdfHtml) tem que logar falha da marca, nao engolir em silencio');

    // So o braco pdfHtml tem HTML pra congelar; o de anexo nao. Nome CRU e JA
    // SUFICADO (Ruflo-5/Ponytail-11 + round 3/4): a sanitizacao mora dentro
    // de salvarSnapshotHtml, e o nome tem que ser o MESMO que esta tentativa
    // usaria pro PDF (nomeArqTentativa) — senao uma regeneracao futura via
    // corrigir-laudo mirava o objeto errado. Round 4 (item 3): agora sao 2
    // chamadas (sucesso confirmado + catch condicional a ainda-ser-dono).
    // Round 5: cada chamada TAMBEM sufixa o OBJETO do snapshot pela propria
    // key (`{ emissaoKey }`) — wiring exato de QUANDO/COM QUE PATH cada uma
    // roda em tests/unit/pdf-snapshot-pos-publicacao.test.mjs.
    const chamadasSnapshot = src.match(/salvarSnapshotHtml\(pdfHtml, wsId, exameId, nomeArqTentativa, \{ emissaoKey \}\);/g) || [];
    assert.equal(chamadasSnapshot.length, 2, 'braco de anexo nao tem HTML — so pdfHtml (sucesso + catch) chama snapshot');
    // Ponytail-3: os 2 asserts que pinavam a linha exata de import saíram —
    // quebravam so por reordenar/reformatar imports, sem checar comportamento.
  });

  test('perdeu a corrida no publicar (round 2/3): pdfErro=conflito_pos_emissao + orfao APAGADO (nao so logado), sem marcarPdfPronto solto', async () => {
    const bruto = await readFile(new URL('../../src/app/api/emitir/route.ts', import.meta.url), 'utf8');
    const src = bruto.replace(/^\s*\/\/.*$/gm, '');
    const conflitos = src.match(/pdfErro = 'conflito_pos_emissao';/g) || [];
    assert.equal(conflitos.length, 4, 'cerca pre-upload (anexo+puppeteer) + os 2 braços apos publicarPdfSeAindaDono devolver false');
    assert.equal((src.match(/console\.warn\(`emitir: PDF/g) || []).length, 2,
      'os 2 bracos que fazem upload tem que logar quando perdem a corrida');
    // Round 3 (Codex Critical, item 2): auto-limpeza — a tentativa perdedora
    // apaga o objeto que ELA MESMA subiu, seguro por construcao (path unico).
    const chamadasApagar = src.match(/await apagarPdfObjeto\(wsId, exameId, nomeArqTentativa\);/g) || [];
    assert.equal(chamadasApagar.length, 2, 'os 2 bracos que fazem upload tem que apagar o proprio orfao ao perder a corrida');
    assert.ok(!/marcarPdfPronto/.test(src), 'marcarPdfPronto foi substituida — nao pode sobrar chamada solta');
  });
});
