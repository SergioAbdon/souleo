// ══════════════════════════════════════════════════════════════════
// LEO · PDF da modalidade TEXTO (Sub-plano 3, Task 6)
// Cabeçalho do local + identificação + corpo (HTML do TipTap) +
// assinatura do médico. Mesmo visual/paginação do motor.
// ponytail: shell duplicado do motor (intocavel nesta fase) — unificar na Fase 2
// ══════════════════════════════════════════════════════════════════

export type ArgsPdfTexto = {
  p1: string;
  clinicaNome: string;
  clinicaSlogan?: string;
  clinicaEnd?: string;
  clinicaTel?: string;
  logoB64?: string;
  tituloExame: string;
  identificacao: {
    nome: string;
    nasc?: string;
    convenio?: string;
    solicitante?: string;
    dataExame?: string;
  };
  htmlCorpo: string;
  assinatura: {
    nome: string;
    especialidade?: string;
    crm?: string;
    ufCrm?: string;
    sigB64?: string;
  };
};

// Duplicados do motor (funções privadas de src/app/laudo/[id]/page.tsx —
// intocável nesta fase, não dá pra importar).
function fmtTel(t: string): string {
  const d = t.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}
function fmtCep(end: string): string {
  return end.replace(/(\d{5})(\d{3})/, '$1-$2');
}
// AAAA-MM-DD → DD/MM/AAAA (datas do Firestore são strings ISO locais).
function fmtData(d?: string): string {
  if (!d) return '—';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

export function gerarPdfHtmlTexto(args: ArgsPdfTexto): string {
  const {
    p1, clinicaNome, tituloExame, identificacao: id, htmlCorpo, assinatura,
  } = args;
  const clinicaSlogan = args.clinicaSlogan || '';
  const clinicaEnd = fmtCep(args.clinicaEnd || '');
  const telCompleto = args.clinicaTel ? fmtTel(args.clinicaTel) : '';
  const logoB64 = args.logoB64 || '';
  const sigB64 = assinatura.sigB64 || '';
  const especialidade = (assinatura.especialidade || '').replace(/\\/g, ' e ').replace(/\//g, ' e ');
  const sigTexto = `${assinatura.nome || ''}\n${especialidade}\nCRM/${assinatura.ufCrm || ''} ${assinatura.crm || ''}`;

  // ── Shell @page/thead/tfoot copiado verbatim do motor (linhas ~863-918)
  // ponytail: shell duplicado do motor (intocavel nesta fase) — unificar na Fase 2
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${tituloExame}</title>
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
.corpo{font-size:8.5pt;line-height:1.6;}
.corpo p{margin-bottom:2px;}
.corpo h2{font-size:10.5pt;color:${p1};margin:2mm 0 1.5mm;}
.corpo h3{font-size:9.5pt;color:${p1};margin:2.5mm 0 1mm;}
.corpo ul{list-style:disc;padding-left:5mm;margin-bottom:2px;}
.corpo ol{list-style:decimal;padding-left:5mm;margin-bottom:2px;}
</style></head><body>
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
    <div style="font-size:10.5pt;font-weight:700;color:${p1};text-align:center;white-space:nowrap;letter-spacing:0.3px;">${tituloExame}</div>
  </div>
  <div style="border:1px solid ${p1};border-radius:3px;padding:3px 6px;margin-bottom:2mm;">
    <div style="display:flex;gap:8px;margin-bottom:2px;">
      <div style="flex:2"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">NOME</span><span style="display:block;font-size:8.5pt;font-weight:500;">${id.nome || '—'}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">DATA DE NASCIMENTO</span><span style="display:block;font-size:8.5pt;font-weight:500;">${fmtData(id.nasc)}</span></div>
    </div>
    <div style="display:flex;gap:8px;">
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">CONVÊNIO</span><span style="display:block;font-size:8.5pt;font-weight:500;">${id.convenio || '—'}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">MÉDICO SOLICITANTE</span><span style="display:block;font-size:8.5pt;font-weight:500;">${id.solicitante || '—'}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">DATA DO EXAME</span><span style="display:block;font-size:8.5pt;font-weight:500;">${fmtData(id.dataExame)}</span></div>
    </div>
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
  <div class="corpo">${htmlCorpo}</div>
</td></tr></tbody>
</table>
</body></html>`;
}
