// ══════════════════════════════════════════════════════════════════
// LEO · Moldura A4 do PDF (S5-T10 / D6)
// UMA folha só para as duas superfícies de laudo: o motor (/laudo/[id])
// e o texto livre (/laudo-texto/[id]). Cabeçalho do local + faixa do
// título + caixa de identificação + rodapé (endereço, assinatura, selo).
// O corpo clínico entra pronto — a moldura não sabe o que é laudo.
//
// Antes disto o shell existia DUAS vezes: o template dentro de
// `gerarPdfHtml()` (page.tsx) e a cópia verbatim em `pdf-texto.ts` —
// que já tinha derivado (identificação sem IDADE). Extração byte-a-byte:
// `tests/unit/pdf-moldura.test.mjs` guarda o template legado do motor e
// exige igualdade exata.
//
// ⚠️ A caixa de identificação é ÂNCORA da correção administrativa
// (`substituirCamposAdministrativos`, correcao-admin.ts): a forma
// `>RÓTULO</span><span ...>VALOR</span>` não pode mudar sem mudar lá.
// Puro, sem import @/ — testado direto por node --test.
// ══════════════════════════════════════════════════════════════════

export type CampoId = { label: string; valor: string; flex?: number };

export type CfgMoldura = {
  p1: string;
  clinicaNome: string;
  clinicaSlogan?: string;
  clinicaEnd?: string;   // já formatado (CEP) pelo chamador
  clinicaTel?: string;   // já formatado; pode ser "tel / tel2"
  logoB64?: string;
  sigB64?: string;
  sigTexto: string;
};

export type ArgsMoldura = {
  titulo: string;              // faixa central do cabeçalho
  tituloDoc?: string;          // <title> do documento (default: `titulo`)
  identificacao: CampoId[][];  // linhas de campos da caixa
  corpoHtml: string;           // conteúdo da célula do corpo
  cssExtra?: string;           // regras extras dentro do <style> (sem \n final)
  htmlPosTabela?: string;      // páginas soltas depois da folha (imagens DICOM)
  cfg: CfgMoldura;
};

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

// P17: logo/assinatura vêm do upload do dono do workspace e viram `<img
// src=…>` renderizado pelo Chrome do servidor a cada emissão/correção. Uma
// URL `https://` ali é um beacon de rede pro servidor buscar toda vez que
// monta o PDF. Vocabulário fechado: só `data:` entra; qualquer outra coisa
// some do laudo (sem busca de rede), como um workspace sem logo cadastrado.
function soDataUri(v: string | undefined): string {
  return v && v.startsWith('data:') ? escaparHtml(v) : '';
}

// Valor entra sem `|| '—'`, como nos dois templates legados: o travessão de
// campo vazio é do chamador (o motor lê os `#out-*` já com `|| '—'`, o
// pdf-texto defaulta na hora de montar). Um `|| '—'` aqui divergiria do
// legado — invisível hoje e mentiroso no dia em que um chamador parasse de
// defaultar.
function campo(c: CampoId, p1: string): string {
  return `<div style="flex:${c.flex ?? 1}"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">${c.label}</span><span style="display:block;font-size:8.5pt;font-weight:500;">${escaparHtml(c.valor)}</span></div>`;
}

export function montarPdfMoldura(a: ArgsMoldura): string {
  const p1 = corSegura(a.cfg.p1);
  // Dados do local/médico também são texto (vêm do cadastro do workspace e do
  // perfil) — mesmo tratamento dos campos de identificação. `titulo`,
  // `corpoHtml`, `cssExtra` e `htmlPosTabela` são HTML de propósito e ficam
  // fora.
  const clinicaNome = escaparHtml(a.cfg.clinicaNome || '');
  const sigTexto = escaparHtml(a.cfg.sigTexto || '');
  const clinicaSlogan = escaparHtml(a.cfg.clinicaSlogan || '');
  const clinicaEnd = escaparHtml(a.cfg.clinicaEnd || '');
  const telCompleto = escaparHtml(a.cfg.clinicaTel || '');
  // Atributo src: só data: entra (P17, soDataUri); escapar fecha o ultimo
  // par de valores crus do arquivo. base64/data-uri legitimos nao contem
  // &<>" — saida byte-identica pro caso real (data: já cadastrado).
  const logoB64 = soDataUri(a.cfg.logoB64);
  const sigB64 = soDataUri(a.cfg.sigB64);

  // Todas as linhas menos a última levam `margin-bottom:2px` — era assim nos
  // dois templates originais (1ª linha com, 2ª sem).
  const idHtml = a.identificacao.map((linha, i) => {
    const mb = i < a.identificacao.length - 1 ? 'margin-bottom:2px;' : '';
    return `    <div style="display:flex;gap:8px;${mb}">
${linha.map((c) => '      ' + campo(c, p1)).join('\n')}
    </div>`;
  }).join('\n');

  // Título também é texto do cliente (fix2 do I4): `tituloDoc` vem do nome do
  // paciente (`#nome` → nomeArq) e `titulo` do catálogo de tipos / do
  // `tipoExame` do exame — os dois graváveis por quem NÃO assina laudo
  // (recepção/dono não-médico). `</title><iframe …>` fecha o elemento; e sem
  // JS nenhum, um `<div style="position:fixed…">` desfigura o PDF assinado.
  const tituloEsc = escaparHtml(a.titulo);
  const tituloDocEsc = escaparHtml(a.tituloDoc ?? a.titulo);

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${tituloDocEsc}</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:"IBM Plex Sans",sans-serif;font-size:8.5pt;color:#1a1a1a;}
@page{size:A4;margin:0;}
table.pl{width:100%;border-collapse:collapse;table-layout:fixed;}
thead{display:table-header-group;}
tfoot{display:table-footer-group;}
thead td{padding:8mm 14mm 3mm;}
tfoot td{padding:3mm 14mm 6mm;}
tbody td.body-cell{padding:0 14mm 4mm;}
ul{list-style:none;padding:0;margin:0;}
${a.cssExtra ? a.cssExtra + '\n' : ''}</style></head><body>
<table class="pl">
<thead><tr><td>
  <div style="padding-bottom:2mm;border-bottom:2.5px solid ${p1};margin-bottom:2mm;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:-2px;">
      ${logoB64 ? `<img src="${logoB64}" style="width:42px;height:42px;border-radius:5px;object-fit:contain;" alt="Logo"/>` : ''}
      <div>
        <div style="font-size:14pt;font-weight:700;color:${p1};white-space:nowrap;line-height:1.1;">${clinicaNome}</div>
        ${clinicaSlogan ? `<div style="font-size:7.5pt;color:#888;margin-top:1px;">${clinicaSlogan}</div>` : ''}
      </div>
    </div>
    <div style="font-size:10.5pt;font-weight:700;color:${p1};text-align:center;white-space:nowrap;letter-spacing:0.3px;">${tituloEsc}</div>
  </div>
  <div style="border:1px solid ${p1};border-radius:3px;padding:3px 6px;margin-bottom:2mm;">
${idHtml}
  </div>
</td></tr></thead>
<tfoot><tr><td>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px;border-top:1.5px solid ${p1};padding-top:3mm;">
    <div style="font-size:7pt;color:#444;line-height:1.6;">
      <strong style="color:${p1};font-size:8pt;">${clinicaNome}</strong><br/>
      ${clinicaEnd}<br/>
      ${telCompleto ? '&#9742; ' + telCompleto : ''}
    </div>
    <div style="text-align:center;font-size:7pt;color:#444;">
      ${sigB64 ? `<img src="${sigB64}" style="max-height:50px;max-width:180px;display:block;margin:10px auto 2px;object-fit:contain;" alt="Assinatura"/>` : ''}
      <div style="width:180px;border-top:1px solid #333;margin:${sigB64 ? '2px' : '24px'} auto 3px;"></div>
      <div style="font-size:7pt;white-space:pre-line;line-height:1.4;">${sigTexto}</div>
    </div>
  </div>
  <div style="text-align:center;width:100%;margin-top:2mm;padding-top:1mm;border-top:0.5px solid #e0e0e0;font-size:6pt;color:#aaa;">
    Laudo emitido com ajuda do <strong>LEO</strong> &middot; www.souleo.com.br
  </div>
</td></tr></tfoot>
<tbody><tr><td class="body-cell">
  ${a.corpoHtml}
</td></tr></tbody>
</table>
${a.htmlPosTabela ?? ''}
</body></html>`;
}
