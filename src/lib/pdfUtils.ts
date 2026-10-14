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

/**
 * Imprime um HTML numa janela nova (PDF sem assinado / "Gerar novamente").
 * Invariante (S4-T15 fix D5): a janela abre ANTES de qualquer await — senão o
 * navegador bloqueia o popup — e escrever num `document` que o usuário já
 * fechou lança, por isso o try/catch. `trocarUrls` troca as canônicas pelas
 * assinadas (imagens DICOM privadas). Uma fonte pras duas telas (tríade 11/10).
 */
export async function imprimirHtmlEmJanela(
  gerarHtml: () => string,
  trocarUrls?: (html: string) => Promise<string>,
): Promise<void> {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  let html = gerarHtml();
  if (trocarUrls) html = await trocarUrls(html);
  try {
    win.document.write(html);
    win.document.close();
  } catch {
    alert('A janela de impressão foi fechada. Clique de novo.');
  }
}
