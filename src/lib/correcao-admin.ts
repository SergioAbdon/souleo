// ══════════════════════════════════════════════════════════════════
// LEO · Correção administrativa sobre o laudo CONGELADO (S5-T5 / D4)
// Até 25/08 a /api/corrigir-laudo regerava o PDF a partir de um HTML
// mandado pelo CLIENTE: sob o pretexto de trocar o convênio, qualquer
// autor autenticado reescrevia o laudo assinado inteiro. Agora o
// servidor carrega o SNAPSHOT do HTML emitido e troca SÓ os 2 valores
// administrativos — cabeçalho, medidas, conclusão e assinatura ficam
// byte-a-byte como saíram na emissão.
// Puro, sem import @/ — testado direto por node --test.
// ══════════════════════════════════════════════════════════════════

function escaparHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Bloco dos dois templates de emissão (gerarPdfHtml no /laudo/[id] e
// gerarPdfHtmlTexto em pdf-texto.ts — idênticos):
//   <span ...>RÓTULO</span><span ...>VALOR</span>
// `[^<]*` no valor é de propósito: snapshot com tag dentro do campo não
// casa e a função devolve null (falha segura) em vez de picotar o HTML.
function trocar(html: string, rotulo: string, valor: string): string | null {
  const re = new RegExp(`(>${rotulo}</span><span[^>]*>)([^<]*)(</span>)`);
  if (!re.test(html)) return null;
  // Replacer em função: valor com `$&`/`$1` entra literal (nome de convênio
  // não é padrão de substituição).
  // `|| '—'` é a mesma convenção dos dois templates de emissão para campo vazio.
  return html.replace(re, (_m, abre: string, _antigo: string, fecha: string) =>
    abre + (escaparHtml(valor.trim()) || '—') + fecha);
}

// Devolve o HTML com convênio/solicitante trocados, ou `null` se o snapshot
// não tem os dois blocos-âncora (emitido por template antigo/desconhecido).
// null = a rota grava os campos no doc e NÃO regera o PDF.
export function substituirCamposAdministrativos(
  html: string,
  campos: { convenio?: string; solicitante?: string },
): string | null {
  const comConvenio = trocar(html, 'CONVÊNIO', campos.convenio ?? '');
  if (comConvenio === null) return null;
  return trocar(comConvenio, 'MÉDICO SOLICITANTE', campos.solicitante ?? '');
}

// O PDF corrigido tem que REGRAVAR o mesmo objeto do Storage — o link já foi
// para o paciente/convênio. O nome do arquivo sai da própria pdfUrl emitida
// (`laudos/{wsId}/{nomeArq}.pdf`), não do cliente. Vazio → salvarPdfBuffer
// cai no default `laudo_{exameId}`.
export function nomeArqDoPdfUrl(pdfUrl: unknown): string {
  if (typeof pdfUrl !== 'string' || !pdfUrl.includes('/laudos/')) return '';
  const arquivo = pdfUrl.split('/laudos/')[1]?.split('/')[1]?.split('?')[0] ?? '';
  if (!arquivo.toLowerCase().endsWith('.pdf')) return '';
  try {
    return decodeURIComponent(arquivo.slice(0, -4));
  } catch {
    return '';
  }
}
