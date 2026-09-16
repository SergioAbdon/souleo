// ══════════════════════════════════════════════════════════════════
// LEO · Escape de HTML compartilhado (tríade onda-3, Ruflo-A5)
// Nasceu dentro de pdf-moldura.ts (S5-T10) e virou dependência de 6+
// arquivos que não têm nada a ver com a MOLDURA em si (correcao-admin,
// params-render, pdf-params, DicomGallery, Extrato, as duas páginas de
// laudo) — só precisavam da FUNÇÃO de escape/validação de cor, e
// importavam o módulo errado (a moldura) só porque foi lá que ela nasceu.
// Agora mora sozinha, puro, ZERO imports — pdf-moldura.ts também importa
// daqui. Corta a cadeia tela → moldura → fontes que existia antes (qualquer
// import de escaparHtml arrastava o resto de pdf-moldura.ts no bundle).
// Puro, sem import nenhum — testado direto por node --test.
// ══════════════════════════════════════════════════════════════════

// Escape dos valores de TEXTO interpolados (S5-T14, fix I4). Antes eles
// entravam crus "por paridade byte-a-byte com o legado", e este HTML é
// renderizado pelo CHROME DO SERVIDOR (`page.setContent`, pdf-server.ts) —
// numa página que carrega as signed URLs das imagens DICOM do paciente. A
// recepção grava `pacienteNome` pelo caminho administrativo (whitelist,
// exame não-emitido): um `<img src=x onerror=…>` ali virava execução de
// script no renderizador da emissão, congelada no snapshot e re-executada a
// cada correção. É a MESMA função que a correção administrativa aplica
// (`correcao-admin.ts` importa daqui) — os dois caminhos produzem byte a
// byte o mesmo valor, então a âncora `>RÓTULO</span><span …>VALOR</span>`
// continua casando depois de corrigir. Valores limpos (o caso real) saem
// idênticos ao legado — `tests/unit/pdf-moldura.test.mjs` continua exigindo
// igualdade exata com o template antigo.
export function escaparHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// X10: a cor vem do doc do workspace (o dono escreve pelo navegador e a regra
// não valida formato) e entra em atributo style sem escape. Cor é vocabulário
// fechado: valida em vez de escapar. Fallback = o default das telas do laudo.
export function corSegura(cor: unknown, fallback = '#8B1A1A'): string {
  return typeof cor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(cor) ? cor : fallback;
}
