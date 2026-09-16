// ══════════════════════════════════════════════════════════════════
// LEO · Guarda de emissão — imagens DICOM ausentes/falhadas (S4-T12)
//
// O laudo pode ser emitido antes de o Wader terminar (ou depois de ele
// falhar): o PDF sai sem as imagens e ninguém percebe. Esta função é a
// DECISÃO pura (testável); o `confirm()` fica na tela.
// ══════════════════════════════════════════════════════════════════

/**
 * Prefixo do detalhe do caso "seleção vazia" (S4-T15 fix X5). Exportado
 * porque esse caso NÃO é "as imagens não chegaram" — elas chegaram, ninguém
 * marcou. A tela usa isto pra escolher a frase certa do `confirm()` sem
 * reimplementar a condição da guarda.
 */
export const SEM_SELECAO_PREFIXO = 'Nenhuma imagem selecionada para o PDF';

/**
 * Devolve o DETALHE do problema quando a emissão merece confirmação, ou
 * `null` quando está tudo certo (ou quando o exame nem tem DICOM).
 *
 *  - `dicomUltimoErro` presente → o Wader falhou nesse estudo.
 *  - `medidasDicomMeta` presente sem nenhuma imagem → o SR chegou mas as
 *    imagens não (ingestão em andamento ou parcial).
 *  - imagens EXISTEM mas nenhuma foi selecionada pro PDF (S4-T15 fix X5) →
 *    o laudo sai sem imagem nenhuma tendo N disponíveis. A seleção começa
 *    vazia e o médico pode simplesmente não ter reparado na galeria.
 *
 * `imagensSelecionadas` é a seleção VIVA da tela (não o campo gravado): a
 * decisão tem que refletir o que vai pro PDF neste clique.
 */
export function precisaConfirmarEmissao(
  exame: Record<string, unknown> | null | undefined,
  imagensSelecionadas?: readonly unknown[] | null,
): string | null {
  if (!exame) return null;
  const erro = exame.dicomUltimoErro;
  if (typeof erro === 'string') {
    // String vazia/só espaços = campo zumbi, não é falha de verdade.
    const msg = erro.trim();
    if (msg) return msg;
  } else if (erro) {
    return 'falha no processamento DICOM';
  }
  const imagens = exame.imagensDicom;
  const nImagens = Array.isArray(imagens) ? imagens.length : 0;
  if (exame.medidasDicomMeta && nImagens === 0) return 'medidas chegaram, imagens não';
  if (nImagens > 0 && (imagensSelecionadas?.length ?? 0) === 0) {
    return `${SEM_SELECAO_PREFIXO} (${nImagens} disponíveis)`;
  }
  return null;
}
