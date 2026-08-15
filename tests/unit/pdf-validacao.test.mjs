// Validacao do PDF anexado (modalidade 'pdf', Task 5): roda ANTES da
// transacao de billing em /api/emitir — precisa recusar upload invalido
// sem debitar franquia. Arquivo puro, sem imports pesados (puppeteer etc).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validarPdfBase64 } from '../../src/lib/pdf-validacao.ts';

const PDF_MINIMO = Buffer.from('%PDF-1.4\n%%EOF').toString('base64');
const NAO_PDF = Buffer.from('nao sou um pdf').toString('base64');
const PDF_GRANDE = Buffer.alloc(11 * 1024 * 1024, 'A').toString('base64'); // >10MB

describe('validarPdfBase64', () => {
  test('PDF minimo valido → ok com buffer decodificado', () => {
    const r = validarPdfBase64(PDF_MINIMO);
    assert.equal(r.ok, true);
    assert.ok(r.ok && r.buf.subarray(0, 5).toString() === '%PDF-');
  });
  test('sem magic bytes %PDF- → nao_e_pdf 400', () => {
    const r = validarPdfBase64(NAO_PDF);
    assert.deepEqual(r, { ok: false, motivo: 'nao_e_pdf', status: 400 });
  });
  test('acima de 10MB → pdf_grande 413 (checado ANTES do magic byte)', () => {
    const r = validarPdfBase64(PDF_GRANDE);
    assert.deepEqual(r, { ok: false, motivo: 'pdf_grande', status: 413 });
  });
  test('base64 vazio → nao_e_pdf (buffer vazio, nao bate magic bytes)', () => {
    const r = validarPdfBase64('');
    assert.deepEqual(r, { ok: false, motivo: 'nao_e_pdf', status: 400 });
  });
});
