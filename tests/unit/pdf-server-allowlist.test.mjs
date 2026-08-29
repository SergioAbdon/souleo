// P1: o pdfHtml que vira PDF vem do CLIENTE — o Chrome do servidor não pode
// ser o proxy dele. `urlPermitidaNoRender` é o filtro que a interceptação de
// rede em `renderizar` usa: só data: (logo/assinatura), o próprio bucket
// (signed URLs das imagens DICOM) e as fontes da moldura passam. Qualquer
// outro host — SSRF, beacon, metadata endpoint de cloud, file:// — é abortado.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { urlPermitidaNoRender } from '../../src/lib/pdf-server.ts';

describe('urlPermitidaNoRender', () => {
  test('allowlist do render: so data:, bucket e fontes', () => {
    const b = 'meu-bucket';
    assert.ok(urlPermitidaNoRender('data:image/png;base64,AAA', b));
    assert.ok(urlPermitidaNoRender('https://storage.googleapis.com/meu-bucket/dicom/x.png', b));
    assert.ok(urlPermitidaNoRender('https://fonts.googleapis.com/css2?family=IBM+Plex', b));
    assert.ok(urlPermitidaNoRender('https://fonts.gstatic.com/s/x.woff2', b));
    assert.ok(!urlPermitidaNoRender('https://storage.googleapis.com/OUTRO-bucket/x', b));
    assert.ok(!urlPermitidaNoRender('https://evil.tld/beacon', b));
    assert.ok(!urlPermitidaNoRender('http://169.254.169.254/latest/meta-data/', b));
    assert.ok(!urlPermitidaNoRender('file:///etc/passwd', b));
  });

  test('prefixo com barra no bucket: nome parecido nao passa (meu-bucketX)', () => {
    assert.ok(!urlPermitidaNoRender('https://storage.googleapis.com/meu-bucketX/x.png', 'meu-bucket'));
  });
});
