// ══════════════════════════════════════════════════════════════════
// SOULEO · PDF Utils
// Abrir PDF salvo no Firestore sem depender da página do laudo
// ══════════════════════════════════════════════════════════════════

/**
 * Abre o HTML do PDF salvo numa nova aba do navegador
 */
export function abrirPdfSalvo(pdfHtml: string) {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) {
    win.document.write(pdfHtml);
    win.document.close();
  }
}
