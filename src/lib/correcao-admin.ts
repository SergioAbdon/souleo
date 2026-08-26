// ══════════════════════════════════════════════════════════════════
// LEO · Correção administrativa sobre o laudo CONGELADO (S5-T5 / D4)
// Até 25/08 a /api/corrigir-laudo regerava o PDF a partir de um HTML
// mandado pelo CLIENTE: sob o pretexto de trocar o convênio, qualquer
// autor autenticado reescrevia o laudo assinado inteiro. Agora o
// servidor carrega o SNAPSHOT do HTML emitido e troca SÓ os 2 valores
// administrativos — cabeçalho, medidas, conclusão e assinatura ficam
// byte-a-byte como saíram na emissão.
// Puro (só um import relativo de outro módulo puro) — node --test importa
// direto, sem bundler.
// ══════════════════════════════════════════════════════════════════

// Fonte única do escape com a EMISSÃO (S5-T14, fix I4): a moldura escapa os
// mesmos valores ao montar o HTML assinado. Se os dois divergissem, corrigir
// o convênio reescreveria o campo num formato diferente do resto do PDF.
import { escaparHtml } from './pdf-moldura';

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

// Reemissão durante a correção (I4): o Puppeteer leva segundos; se o médico
// reemitir nesse meio-tempo, a escrita da correção chega DEPOIS e devolve o
// corpo clínico antigo com o convênio novo — PDF assinado ≠ banco. Compara o
// selo de emissão lido no início com o do momento de publicar.
function marcaEmissao(v: unknown): string {
  const ts = v as { toMillis?: () => number } | null | undefined;
  if (ts && typeof ts.toMillis === 'function') return String(ts.toMillis());
  return v === null || v === undefined ? '' : JSON.stringify(v);
}
export function emissaoMudou(antes: unknown, agora: unknown): boolean {
  return marcaEmissao(antes) !== marcaEmissao(agora);
}

// O PDF corrigido REGRAVA o mesmo objeto do Storage — o link já foi para o
// paciente/convênio. O nome do arquivo vem da metadata do snapshot, gravada
// pelo próprio servidor na emissão (ver `salvarSnapshotHtml`, pdf-server.ts);
// nunca do doc do exame (editável pelo médico-autor) nem do cliente. Até a
// tríade final da S5 este arquivo fazia o parse da URL do PDF pra redescobrir
// esse nome — conhecimento do formato do path, que agora mora inteiro em
// `pdf-path.ts` (a feature não sabe mais montar/ler caminho de Storage).
