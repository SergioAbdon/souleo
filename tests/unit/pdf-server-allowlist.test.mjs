// P1: o pdfHtml que vira PDF vem do CLIENTE — o Chrome do servidor não pode
// ser o proxy dele. `urlPermitidaNoRender` é o filtro que a interceptação de
// rede em `renderizar` usa: só data: (logo/assinatura/fontes, embutidas via
// `injetarFontes`, P8 follow-up + tríade onda-3) e o próprio bucket (signed
// URLs das imagens DICOM) passam. Qualquer outro host — SSRF, beacon,
// metadata endpoint de cloud, file://, e agora fonts.googleapis.com/
// fonts.gstatic.com (nada no pipeline busca mais fonte por rede, nem um
// snapshot congelado com o <link> antigo — a allowlist bloqueia e a injeção
// no servidor cobre) — é abortado.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { urlPermitidaNoRender, temImagemNaoAssinada } from '../../src/lib/pdf-server.ts';

describe('urlPermitidaNoRender', () => {
  test('allowlist do render: so data: e bucket — fontes saem (P8 follow-up, embutidas)', () => {
    const b = 'meu-bucket';
    assert.ok(urlPermitidaNoRender('data:image/png;base64,AAA', b));
    assert.ok(urlPermitidaNoRender('https://storage.googleapis.com/meu-bucket/dicom/x.png', b));
    assert.ok(!urlPermitidaNoRender('https://fonts.googleapis.com/css2?family=IBM+Plex', b));
    assert.ok(!urlPermitidaNoRender('https://fonts.gstatic.com/s/x.woff2', b));
    assert.ok(!urlPermitidaNoRender('https://storage.googleapis.com/OUTRO-bucket/x', b));
    assert.ok(!urlPermitidaNoRender('https://evil.tld/beacon', b));
    assert.ok(!urlPermitidaNoRender('http://169.254.169.254/latest/meta-data/', b));
    assert.ok(!urlPermitidaNoRender('file:///etc/passwd', b));
  });

  test('prefixo com barra no bucket: nome parecido nao passa (meu-bucketX)', () => {
    assert.ok(!urlPermitidaNoRender('https://storage.googleapis.com/meu-bucketX/x.png', 'meu-bucket'));
  });
});

// Pin de ordem (fonte-lendo, mesma técnica de pdf-nome-arquivo.test.mjs): a
// interceptação SÓ filtra requisições feitas depois de anexada — se alguém
// mover setRequestInterception pra depois do setContent, o parse inicial do
// HTML (imagens, fontes) passa sem allowlist nenhuma.
describe('renderizar: interceptação vem antes do setContent', () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, '..', '..', 'src', 'lib', 'pdf-server.ts'), 'utf8');

  test('setRequestInterception é chamado antes de setContent', () => {
    // '(' pra pegar a CHAMADA, não o nome citado em comentário (ex.: "Precisa
    // vir ANTES do setContent:" logo acima do bloco, no próprio código-fonte).
    assert.ok(src.indexOf('setRequestInterception(') < src.indexOf('.setContent('),
      'setRequestInterception precisa vir ANTES do setContent — senão o parse inicial do HTML escapa da allowlist');
  });

  test('JS da página desligado', () => {
    assert.ok(src.includes('setJavaScriptEnabled(false)'));
  });
});

// Achado 11/10 (carótidas fg-69204): a URL assinada começa com o MESMO prefixo
// da canônica — o guard por `includes(prefixo)` abortava todo PDF com imagem.
describe('temImagemNaoAssinada — só a canônica NUA conta como não assinada', () => {
  const b = 'meu-bucket';
  const canon = 'https://storage.googleapis.com/meu-bucket/dicom/ws/ex/1.jpg';
  const assinada = canon + '?GoogleAccessId=sa%40p.iam.gserviceaccount.com&Expires=1&Signature=abc%3D';
  test('HTML só com URLs assinadas → false (PDF segue)', () => {
    assert.equal(temImagemNaoAssinada(`<img src="${assinada}" /><img src='${assinada}'/>`, b), false);
  });
  test('uma canônica nua sobrando → true (aborta)', () => {
    assert.equal(temImagemNaoAssinada(`<img src="${assinada}" /><img src="${canon}" />`, b), true);
  });
  test('sem imagem do bucket → false; outro bucket não conta', () => {
    assert.equal(temImagemNaoAssinada('<p>sem imagem</p>', b), false);
    assert.equal(temImagemNaoAssinada('<img src="https://storage.googleapis.com/outro/dicom/x.jpg">', b), false);
  });
  test('Codex: assinatura VAZIA ou incompleta não conta (v2 exige GoogleAccessId+Expires+Signature; v4 exige X-Goog-Signature)', () => {
    assert.equal(temImagemNaoAssinada(`<img src="${canon}?GoogleAccessId=x">`, b), true);
    assert.equal(temImagemNaoAssinada(`<img src="${canon}?GoogleAccessId=x&Expires=1&Signature=">`, b), true);
    assert.equal(temImagemNaoAssinada(`<img src="${canon}?X-Goog-Signature=">`, b), true);
  });
  test('Codex: query SEM assinatura (?alt=media) e host em caixa alta NÃO são assinadas → aborta', () => {
    assert.equal(temImagemNaoAssinada(`<img src="${canon}?alt=media">`, b), true);
    assert.equal(temImagemNaoAssinada(`<img src="${canon.replace('https://storage', 'HTTPS://STORAGE')}">`, b), true);
  });
  test('assinatura v4 (?X-Goog-…) também é assinada', () => {
    assert.equal(temImagemNaoAssinada(`<img src="${canon}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=a">`, b), false);
  });
});
