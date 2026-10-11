// Área de transferência — uma fonte pras duas telas de laudo (ECO e texto),
// tríade 11/10 (Ruflo): o miolo range/selection/execCommand estava copiado.

/** Copia HTML formatado (Word/Tasy/MV). `estilo` é o CSS inline do invólucro. */
export function copiarHtml(html: string, estilo = ''): boolean {
  const temp = document.createElement('div');
  temp.style.cssText = estilo;
  temp.innerHTML = html;
  document.body.appendChild(temp);
  const range = document.createRange();
  range.selectNodeContents(temp);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  let copiou = false;
  try { copiou = document.execCommand('copy'); } finally { sel?.removeAllRanges(); temp.remove(); }
  return copiou;
}

/** Copia texto simples (prontuário); cai no textarea+execCommand se a Clipboard API negar. */
export async function copiarTextoSimples(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
