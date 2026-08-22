// ══════════════════════════════════════════════════════════════════
// LEO · Guarda de emissão — imagens DICOM ausentes/falhadas (S4-T12)
//
// O laudo pode ser emitido antes de o Wader terminar (ou depois de ele
// falhar): o PDF sai sem as imagens e ninguém percebe. Esta função é a
// DECISÃO pura (testável); o `confirm()` fica na tela.
// ══════════════════════════════════════════════════════════════════

/**
 * Devolve o DETALHE do problema quando a emissão merece confirmação, ou
 * `null` quando está tudo certo (ou quando o exame nem tem DICOM).
 *
 *  - `dicomUltimoErro` presente → o Wader falhou nesse estudo.
 *  - `medidasDicomMeta` presente sem nenhuma imagem → o SR chegou mas as
 *    imagens não (ingestão em andamento ou parcial).
 */
export function precisaConfirmarEmissao(
  exame: Record<string, unknown> | null | undefined,
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
  const semImagens = !Array.isArray(imagens) || imagens.length === 0;
  if (exame.medidasDicomMeta && semImagens) return 'medidas chegaram, imagens não';
  return null;
}
