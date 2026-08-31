// ══════════════════════════════════════════════════════════════════
// LEO · Validacao pura do PDF anexado (modalidade 'pdf', Sub-plano 3 Task 5)
//
// Arquivo SEM imports de proposito: pdf-server.ts importa puppeteer no topo
// (pesado, quebra em ambiente sem Chrome). Essa funcao roda ANTES da
// transacao de billing em /api/emitir e precisa ser testavel isolada em
// `node --test` sem puxar puppeteer junto.
// ══════════════════════════════════════════════════════════════════

// P18 (onda-3): a faixa 3-4,5MB morria no 413 opaco da Vercel antes de
// chegar aqui — o limite de verdade já era bem menor que os 10MB
// anunciados. 3MB é o que o modal do cliente já avisa; o servidor agora
// concorda com o que promete.
const LIMITE_BYTES = 3 * 1024 * 1024; // 3MB

export type ValidacaoPdf =
  | { ok: true; buf: Buffer }
  | { ok: false; motivo: 'pdf_grande'; status: 413 }
  | { ok: false; motivo: 'nao_e_pdf'; status: 400 };

/** Decodifica base64 e valida tamanho (<=3MB) + magic bytes (%PDF-). */
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
