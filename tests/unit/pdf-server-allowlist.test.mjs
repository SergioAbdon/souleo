// P1: o pdfHtml que vira PDF vem do CLIENTE — o Chrome do servidor não pode
// ser o proxy dele. `urlPermitidaNoRender` é o filtro que a interceptação de
// rede em `renderizar` usa: só data: (logo/assinatura/fontes, embutidas, P8
// follow-up) e o próprio bucket (signed URLs das imagens DICOM) passam.
// Qualquer outro host — SSRF, beacon, metadata endpoint de cloud, file://,
// e agora fonts.googleapis.com/fonts.gstatic.com (a moldura não busca mais
// fonte por rede) — é abortado.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { urlPermitidaNoRender } from '../../src/lib/pdf-server.ts';

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
