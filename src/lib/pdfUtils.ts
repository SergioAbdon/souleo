// ══════════════════════════════════════════════════════════════════
// SOULEO · PDF Utils
// Gera PDF profissional via Puppeteer no servidor (Vercel)
// Fallback: html2pdf.js no navegador (caso Puppeteer falhe)
// ══════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Garante que html2pdf.js está carregado (fallback de emergência) */
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
 * FALLBACK: Gera PDF no navegador via html2pdf.js (qualidade inferior).
 * Usado apenas se a API Puppeteer falhar.
 */
async function gerarPdfBlobLocal(pdfHtml: string, nomeArq: string): Promise<Blob> {
  const html2pdf = await loadHtml2Pdf();

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;border:none;';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) throw new Error('Erro ao criar iframe');
  iframeDoc.open();
  iframeDoc.write(pdfHtml);
  iframeDoc.close();

  await new Promise(resolve => setTimeout(resolve, 2000));

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

  document.body.removeChild(iframe);
  return blob;
}

/**
 * FALLBACK: upload do PDF gerado localmente via API legacy
 */
async function uploadPdfLegacy(blob: Blob, wsId: string, exameId: string, nomeArq: string): Promise<string> {
  const base64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });

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
 * PRIMARY: Gera PDF via Puppeteer no servidor (Vercel) e salva no Storage.
 * Retorna a URL pública do PDF.
 *
 * Vantagens vs html2pdf.js:
 * - Texto vetorial real (Ctrl+F funciona, qualidade nítida)
 * - Tamanho 10x menor (~300KB vs ~3MB)
 * - Geração no servidor (não trava o navegador)
 *
 * Em caso de falha (timeout, erro), faz fallback automático pra html2pdf.js local.
 */
export async function gerarESalvarPdf(
  pdfHtml: string,
  wsId: string,
  exameId: string,
  nomeArq: string
): Promise<string> {
  // ── Tentativa 1: Puppeteer no servidor (Vercel) ──
  try {
    const res = await fetch('/api/gerar-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfHtml, wsId, exameId, nomeArq }),
    });

    const data = await res.json();
    if (data.ok && data.pdfUrl) {
      console.log(`PDF gerado via Puppeteer (${data.tamanhoKB}KB)`);
      return data.pdfUrl;
    }
    throw new Error(data.error || 'Resposta invalida do servidor');
  } catch (e) {
    console.warn('Puppeteer falhou, usando fallback html2pdf.js:', e);
  }

  // ── Tentativa 2 (fallback): html2pdf.js no navegador ──
  const blob = await gerarPdfBlobLocal(pdfHtml, nomeArq);
  return uploadPdfLegacy(blob, wsId, exameId, nomeArq);
}

/**
 * Abre um PDF salvo numa nova aba
 */
export function abrirPdfUrl(url: string) {
  window.open(url, '_blank');
}
