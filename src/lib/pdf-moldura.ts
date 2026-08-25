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

function campo(c: CampoId, p1: string): string {
  return `<div style="flex:${c.flex ?? 1}"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">${c.label}</span><span style="display:block;font-size:8.5pt;font-weight:500;">${c.valor || '—'}</span></div>`;
}

export function montarPdfMoldura(a: ArgsMoldura): string {
  const { p1, clinicaNome, sigTexto } = a.cfg;
  const clinicaSlogan = a.cfg.clinicaSlogan || '';
  const clinicaEnd = a.cfg.clinicaEnd || '';
  const telCompleto = a.cfg.clinicaTel || '';
  const logoB64 = a.cfg.logoB64 || '';
  const sigB64 = a.cfg.sigB64 || '';

  // Todas as linhas menos a última levam `margin-bottom:2px` — era assim nos
  // dois templates originais (1ª linha com, 2ª sem).
  const idHtml = a.identificacao.map((linha, i) => {
    const mb = i < a.identificacao.length - 1 ? 'margin-bottom:2px;' : '';
    return `    <div style="display:flex;gap:8px;${mb}">
${linha.map((c) => '      ' + campo(c, p1)).join('\n')}
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${a.tituloDoc ?? a.titulo}</title>
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
    <div style="font-size:10.5pt;font-weight:700;color:${p1};text-align:center;white-space:nowrap;letter-spacing:0.3px;">${a.titulo}</div>
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
