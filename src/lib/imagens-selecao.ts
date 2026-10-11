// Seleção de imagens DICOM pro PDF — saneamento do lado do servidor
// (spec 2026-10-11-imagens-e-sr-em-todo-laudo, achado do Codex): o cliente
// manda `imagensSelecionadasPdf` em `dadosFinais` e o servidor só aceita o
// que pertence ao próprio exame. URL fora de `imagensDicom`, duplicata ou
// tipo errado é descartado em silêncio — a ordem (= ordem no PDF) é a do
// médico. Puro, sem Firebase, pra ter teste unitário direto.

/**
 * @returns a lista limpa, ou `null` quando `selecao` não é uma lista
 *   (chamador remove o campo em vez de gravar lixo).
 */
export function sanearSelecaoImagens(selecao: unknown, imagensDicom: unknown): string[] | null {
  if (!Array.isArray(selecao)) return null;
  const canonicas = new Set(Array.isArray(imagensDicom) ? imagensDicom.filter((u): u is string => typeof u === 'string') : []);
  const vistas = new Set<string>();
  const limpa: string[] = [];
  for (const u of selecao) {
    if (typeof u !== 'string' || !canonicas.has(u) || vistas.has(u)) continue;
    vistas.add(u);
    limpa.push(u);
  }
  return limpa;
}
