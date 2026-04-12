// ══════════════════════════════════════════════════════════════════
// SOULEO · PDF Utils
// Gerar PDF real via html2pdf.js + upload via API Route (sem CORS)
// ══════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Garante que html2pdf.js está carregado (via script tag) */
function loadHtml2Pdf(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).html2pdf) {
      resolve((window as any).html2pdf);
      return;
    }
    const script = document.createElement('script');
    script.src = '/lib/html2pdf.min.js';
    script.onload = () => {
      if ((window as any).html2pdf) resolve((window as any).html2pdf);
      else reject(new Error('html2pdf não carregou'));
    };
    script.onerror = () => reject(new Error('Erro ao carregar html2pdf'));
    document.head.appendChild(script);
  });
}

/**
 * Gera um PDF real a partir do HTML completo usando iframe invisível.
 * Retorna o blob do PDF.
 */
async function gerarPdfBlob(pdfHtml: string, nomeArq: string): Promise<Blob> {
  const html2pdf = await loadHtml2Pdf();

  // Criar iframe invisível com o HTML completo (mantém estilos e fontes)
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:none;';
  document.body.appendChild(iframe);

  // Escrever HTML completo no iframe
  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) throw new Error('Erro ao criar iframe');
  iframeDoc.open();
  iframeDoc.write(pdfHtml);
  iframeDoc.close();

  // Aguardar fontes e imagens carregarem
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Gerar PDF a partir do body do iframe
  const blob: Blob = await html2pdf()
    .set({
      margin: 0,
      filename: `${nomeArq}.pdf`,
      image: { type: 'png', quality: 1 },
      html2canvas: { scale: 6, useCORS: true, letterRendering: true, logging: false, dpi: 300, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: false },
    })
    .from(iframeDoc.body)
    .outputPdf('blob');

  // Limpar iframe
  document.body.removeChild(iframe);

  return blob;
}

/**
 * Gera um PDF real a partir do HTML e faz upload via API Route.
 * Retorna a URL pública do PDF.
 */
export async function gerarESalvarPdf(
  pdfHtml: string,
  wsId: string,
  exameId: string,
  nomeArq: string
): Promise<string> {
  const blob = await gerarPdfBlob(pdfHtml, nomeArq);

  // Converter blob para base64
  const base64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });

  // Upload via API Route (server-side, sem CORS)
  const res = await fetch('/api/upload-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfBase64: base64, wsId, exameId, nomeArq }),
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Erro ao salvar PDF');

  return data.pdfUrl;
}

/**
 * Abre um PDF salvo numa nova aba
 */
export function abrirPdfUrl(url: string) {
  window.open(url, '_blank');
}
