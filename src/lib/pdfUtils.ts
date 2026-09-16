// ══════════════════════════════════════════════════════════════════
// SOULEO · PDF Utils (client)
//
// Geracao de PDF virou 100% server-side via /api/emitir (Puppeteer no
// motor de HTML, ou anexo direto na modalidade 'pdf' — Sub-plano 3 Task 5).
// As rotas legadas /api/gerar-pdf e /api/upload-pdf (sem auth, geravam PDF
// fora da transacao de billing) morreram junto com o fallback html2pdf.js.
// ══════════════════════════════════════════════════════════════════

/** Abre um PDF salvo numa nova aba — dono único de `window.open` de PDF
 * assinado (tríade onda-4, Ruflo item 4): `noopener,noreferrer` aqui
 * conserta pra todo chamador de uma vez (a aba nova não ganha `window.opener`
 * nem manda `Referer` pro Storage). */
export function abrirPdfUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
