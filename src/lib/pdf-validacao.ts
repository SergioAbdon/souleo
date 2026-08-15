// ══════════════════════════════════════════════════════════════════
// LEO · Validacao pura do PDF anexado (modalidade 'pdf', Sub-plano 3 Task 5)
//
// Arquivo SEM imports de proposito: pdf-server.ts importa puppeteer no topo
// (pesado, quebra em ambiente sem Chrome). Essa funcao roda ANTES da
// transacao de billing em /api/emitir e precisa ser testavel isolada em
// `node --test` sem puxar puppeteer junto.
// ══════════════════════════════════════════════════════════════════

const LIMITE_BYTES = 10 * 1024 * 1024; // 10MB

export type ValidacaoPdf =
  | { ok: true; buf: Buffer }
  | { ok: false; motivo: 'pdf_grande'; status: 413 }
  | { ok: false; motivo: 'nao_e_pdf'; status: 400 };

/** Decodifica base64 e valida tamanho (<=10MB) + magic bytes (%PDF-). */
export function validarPdfBase64(pdfBase64: string): ValidacaoPdf {
  const buf = Buffer.from(pdfBase64, 'base64');
  if (buf.length > LIMITE_BYTES) {
    return { ok: false, motivo: 'pdf_grande', status: 413 };
  }
  if (buf.subarray(0, 5).toString() !== '%PDF-') {
    return { ok: false, motivo: 'nao_e_pdf', status: 400 };
  }
  return { ok: true, buf };
}
