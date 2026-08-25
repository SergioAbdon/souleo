// ══════════════════════════════════════════════════════════════════
// Moldura A4 do PDF (S5-T10 / D6) — a folha única das duas superfícies.
//
// O teste que importa é o de IGUALDADE BYTE-A-BYTE: `legadoMotor()` e
// `legadoTexto()` abaixo são cópias VERBATIM dos dois templates que
// existiam antes da extração (`gerarPdfHtml` em src/app/laudo/[id]/page.tsx
// linhas 1403-1469 e `gerarPdfHtmlTexto` em src/lib/pdf-texto.ts). Se a
// moldura deixar de reproduzi-los, o laudo assinado mudou de forma — e o
// snapshot congelado da correção administrativa (S5-T5) mudou junto.
// NÃO "consertar" o legado pra fazer o teste passar: ele é o padrão-ouro.
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { montarPdfMoldura } from '../../src/lib/pdf-moldura.ts';
import { substituirCamposAdministrativos } from '../../src/lib/correcao-admin.ts';
import { gerarPdfHtmlTexto } from '../../src/lib/pdf-texto.ts';

// ── Padrão-ouro 1: template do MOTOR, copiado verbatim (pré-T10) ──
function legadoMotor(v) {
  const {
    nomeArq, p1, logoB64, clinicaNome, clinicaSlogan, clinicaEnd, telCompleto,
    sigB64, sigTexto, outNome, outIdade, outDtnasc, outConv, outSolic, outDtex,
    paramsHTML, achadosHTML, concHTML, imagensPdfHtml,
  } = v;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${nomeArq}</title>
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
    <div style="font-size:10.5pt;font-weight:700;color:${p1};text-align:center;white-space:nowrap;letter-spacing:0.3px;">ECOCARDIOGRAMA TRANSTORÁCICO</div>
  </div>
  <div style="border:1px solid ${p1};border-radius:3px;padding:3px 6px;margin-bottom:2mm;">
    <div style="display:flex;gap:8px;margin-bottom:2px;">
      <div style="flex:2"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">NOME</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outNome}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">IDADE</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outIdade}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">DATA DE NASCIMENTO</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outDtnasc}</span></div>
    </div>
    <div style="display:flex;gap:8px;">
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">CONVÊNIO</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outConv}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">MÉDICO SOLICITANTE</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outSolic}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">DATA DO EXAME</span><span style="display:block;font-size:8.5pt;font-weight:500;">${outDtex}</span></div>
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
  <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">MEDIDAS E PARÂMETROS</div>
  <div style="border:1px solid #ddd;border-top:none;padding:0;">${paramsHTML}</div>
  <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;">COMENTÁRIOS</div>
  <div style="border:1px solid #ddd;border-top:none;padding:4px 8px;"><ul>${achadosHTML}</ul></div>
  <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;">CONCLUSÃO</div>
  <div style="border:1px solid #ddd;border-top:none;padding:4px 8px;"><ul>${concHTML}</ul></div>
</td></tr></tbody>
</table>
${imagensPdfHtml}
</body></html>`;
}

// Mesma composição que a página do motor faz hoje via montarPdfMoldura().
function viaMoldura(v) {
  return montarPdfMoldura({
    titulo: 'ECOCARDIOGRAMA TRANSTORÁCICO',
    tituloDoc: v.nomeArq,
    identificacao: [
      [
        { label: 'NOME', valor: v.outNome, flex: 2 },
        { label: 'IDADE', valor: v.outIdade },
        { label: 'DATA DE NASCIMENTO', valor: v.outDtnasc },
      ],
      [
        { label: 'CONVÊNIO', valor: v.outConv },
        { label: 'MÉDICO SOLICITANTE', valor: v.outSolic },
        { label: 'DATA DO EXAME', valor: v.outDtex },
      ],
    ],
    corpoHtml: [
      `<div style="background:${v.p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">MEDIDAS E PARÂMETROS</div>`,
      `<div style="border:1px solid #ddd;border-top:none;padding:0;">${v.paramsHTML}</div>`,
      `<div style="background:${v.p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;">COMENTÁRIOS</div>`,
      `<div style="border:1px solid #ddd;border-top:none;padding:4px 8px;"><ul>${v.achadosHTML}</ul></div>`,
      `<div style="background:${v.p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;">CONCLUSÃO</div>`,
      `<div style="border:1px solid #ddd;border-top:none;padding:4px 8px;"><ul>${v.concHTML}</ul></div>`,
    ].join('\n  '),
    htmlPosTabela: v.imagensPdfHtml,
    cfg: {
      p1: v.p1,
      clinicaNome: v.clinicaNome,
      clinicaSlogan: v.clinicaSlogan,
      clinicaEnd: v.clinicaEnd,
      clinicaTel: v.telCompleto,
      logoB64: v.logoB64,
      sigB64: v.sigB64,
      sigTexto: v.sigTexto,
    },
  });
}

const CHEIO = {
  nomeArq: 'ECOTT JOSILENE DA SILVA',
  p1: '#0B5FA5',
  logoB64: 'data:image/png;base64,AAA',
  clinicaNome: 'MedCardio',
  clinicaSlogan: 'Cuidando do seu coração',
  clinicaEnd: 'Av. Nazaré, 100 — Belém/PA — 66023-700',
  telCompleto: '(91) 3085-4000 / (91) 98888-7777',
  sigB64: 'data:image/png;base64,BBB',
  sigTexto: 'Dr. Sérgio Abdon\nCardiologia\nCRM/PA 1234',
  outNome: 'JOSILENE DA SILVA',
  outIdade: '62 anos',
  outDtnasc: '12/03/1964',
  outConv: 'Unimed',
  outSolic: 'Dra. Marina',
  outDtex: '20/08/2026',
  paramsHTML: '<table><tr><td>FEVE</td><td>68</td></tr></table>',
  achadosHTML: '<li>Ventrículo esquerdo de dimensões normais.</li>',
  concHTML: '<li><strong>1</strong> Exame normal.</li>',
  imagensPdfHtml: '<style>.dicom-pg{}</style><div class="dicom-pg">img</div>',
};

// Mesmo exame sem nada opcional: logo, slogan, telefone, assinatura e
// imagens vazios — os 5 ramos ternários da moldura no outro lado.
const VAZIO = {
  ...CHEIO,
  logoB64: '', clinicaSlogan: '', telCompleto: '', sigB64: '', imagensPdfHtml: '',
  // Campos de identificação VAZIOS de verdade (review M3): a moldura interpola
  // cru, igual ao legado. Se alguém puser um `|| '—'` lá dentro, estes 2 campos
  // divergem e o teste quebra — que é o ponto.
  outConv: '', outSolic: '',
};

describe('montarPdfMoldura — igualdade byte-a-byte com o template legado', () => {
  test('motor, exame completo (logo + slogan + telefone + assinatura + imagens)', () => {
    assert.equal(viaMoldura(CHEIO), legadoMotor(CHEIO));
  });

  test('motor, exame pelado (todos os opcionais vazios)', () => {
    assert.equal(viaMoldura(VAZIO), legadoMotor(VAZIO));
  });

  test('motor, cor primária e clínica trocadas (cfg variando)', () => {
    const v = { ...CHEIO, p1: '#8B1A1A', clinicaNome: 'Consultório', sigTexto: '' };
    assert.equal(viaMoldura(v), legadoMotor(v));
  });
});

// ── Padrão-ouro 2: template do TEXTO LIVRE, copiado verbatim (pré-T10) ──
// Diferenças reais em relação ao motor (a deriva que a T10 elimina fica
// registrada no relatório): identificação com 2 campos na 1ª linha (sem
// IDADE), CSS extra `.corpo`, título do documento = título do exame.
function legadoTexto(v) {
  const { p1, clinicaNome, clinicaSlogan, clinicaEnd, telCompleto, logoB64, sigB64, sigTexto, tituloExame, id, htmlCorpo } = v;
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
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">DATA DE NASCIMENTO</span><span style="display:block;font-size:8.5pt;font-weight:500;">${id.nasc}</span></div>
    </div>
    <div style="display:flex;gap:8px;">
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">CONVÊNIO</span><span style="display:block;font-size:8.5pt;font-weight:500;">${id.convenio || '—'}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">MÉDICO SOLICITANTE</span><span style="display:block;font-size:8.5pt;font-weight:500;">${id.solicitante || '—'}</span></div>
      <div style="flex:1"><span style="display:block;font-size:5.5pt;font-weight:600;color:${p1};text-transform:uppercase;">DATA DO EXAME</span><span style="display:block;font-size:8.5pt;font-weight:500;">${id.dataExame}</span></div>
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

const TEXTO = {
  p1: '#0B5FA5',
  clinicaNome: 'MedCardio',
  clinicaSlogan: 'Cuidando do seu coração',
  clinicaEnd: 'Av. Nazaré, 100',
  telCompleto: '(91) 3085-4000',
  logoB64: 'data:image/png;base64,AAA',
  sigB64: 'data:image/png;base64,BBB',
  sigTexto: 'Dr. Sérgio Abdon\nCardiologia\nCRM/PA 1234',
  tituloExame: 'DOPPLER DE CARÓTIDAS',
  id: { nome: 'JOSILENE DA SILVA', nasc: '12/03/1964', convenio: 'Unimed', solicitante: 'Dra. Marina', dataExame: '20/08/2026' },
  htmlCorpo: '<h2>DOPPLER</h2><p>Normal.</p>',
};

const CSS_CORPO_TEXTO = [
  '.corpo{font-size:8.5pt;line-height:1.6;}',
  '.corpo p{margin-bottom:2px;}',
  `.corpo h2{font-size:10.5pt;color:${TEXTO.p1};margin:2mm 0 1.5mm;}`,
  `.corpo h3{font-size:9.5pt;color:${TEXTO.p1};margin:2.5mm 0 1mm;}`,
  '.corpo ul{list-style:disc;padding-left:5mm;margin-bottom:2px;}',
  '.corpo ol{list-style:decimal;padding-left:5mm;margin-bottom:2px;}',
].join('\n');

describe('montarPdfMoldura — texto livre', () => {
  test('reproduz o template do laudo-texto (a menos da linha vazia do fim)', () => {
    const viaMold = montarPdfMoldura({
      titulo: TEXTO.tituloExame,
      identificacao: [
        [
          { label: 'NOME', valor: TEXTO.id.nome, flex: 2 },
          { label: 'DATA DE NASCIMENTO', valor: TEXTO.id.nasc },
        ],
        [
          { label: 'CONVÊNIO', valor: TEXTO.id.convenio },
          { label: 'MÉDICO SOLICITANTE', valor: TEXTO.id.solicitante },
          { label: 'DATA DO EXAME', valor: TEXTO.id.dataExame },
        ],
      ],
      cssExtra: CSS_CORPO_TEXTO,
      corpoHtml: `<div class="corpo">${TEXTO.htmlCorpo}</div>`,
      cfg: {
        p1: TEXTO.p1, clinicaNome: TEXTO.clinicaNome, clinicaSlogan: TEXTO.clinicaSlogan,
        clinicaEnd: TEXTO.clinicaEnd, clinicaTel: TEXTO.telCompleto,
        logoB64: TEXTO.logoB64, sigB64: TEXTO.sigB64, sigTexto: TEXTO.sigTexto,
      },
    });
    // Única diferença tolerada: a moldura sempre reserva a linha do bloco
    // pós-tabela (imagens DICOM), que no laudo-texto sai vazia.
    assert.equal(viaMold.replace('</table>\n\n</body>', '</table>\n</body>'), legadoTexto(TEXTO));
  });

  test('sem tituloDoc, o <title> do documento é o título do exame', () => {
    const html = montarPdfMoldura({
      titulo: 'DOPPLER DE CARÓTIDAS', identificacao: [], corpoHtml: '', cfg: { p1: '#000', clinicaNome: 'X', sigTexto: '' },
    });
    assert.match(html, /<title>DOPPLER DE CARÓTIDAS<\/title>/);
  });

  test('tituloDoc separa o nome do arquivo do título impresso', () => {
    const html = montarPdfMoldura({
      titulo: 'ECO TRANSESOFÁGICO', tituloDoc: 'ECOTE MARIA', identificacao: [], corpoHtml: '', cfg: { p1: '#000', clinicaNome: 'X', sigTexto: '' },
    });
    assert.match(html, /<title>ECOTE MARIA<\/title>/);
    assert.ok(html.includes('letter-spacing:0.3px;">ECO TRANSESOFÁGICO</div>'));
  });
});

describe('montarPdfMoldura — campos e âncoras', () => {
  test('valor entra CRU — o travessão é responsabilidade do chamador (M3)', () => {
    const html = montarPdfMoldura({
      titulo: 'T',
      identificacao: [[{ label: 'CONVÊNIO', valor: '' }]],
      corpoHtml: '', cfg: { p1: '#000', clinicaNome: 'X', sigTexto: '' },
    });
    assert.ok(html.includes('>CONVÊNIO</span><span style="display:block;font-size:8.5pt;font-weight:500;"></span>'));
  });

  test('quem defaulta é o chamador: o PDF de texto ainda imprime — no campo vazio', () => {
    const html = gerarPdfHtmlTexto({
      p1: '#000', clinicaNome: 'X', tituloExame: 'T',
      identificacao: { nome: '', convenio: '', solicitante: '' },
      htmlCorpo: '<p>x</p>', assinatura: { nome: 'Dr. Y' },
    });
    for (const rotulo of ['NOME', 'IDADE', 'CONVÊNIO', 'MÉDICO SOLICITANTE', 'DATA DE NASCIMENTO', 'DATA DO EXAME']) {
      assert.ok(
        html.includes(`>${rotulo}</span><span style="display:block;font-size:8.5pt;font-weight:500;">—</span>`),
        `campo ${rotulo} deveria cair no travessão`,
      );
    }
  });

  test('IDADE do PDF de texto é a da DATA DO EXAME, não a de hoje (I1)', () => {
    const args = {
      p1: '#000', clinicaNome: 'X', tituloExame: 'T',
      identificacao: { nome: 'A', nasc: '1964-03-12', dataExame: '2026-01-10' },
      htmlCorpo: '', assinatura: { nome: 'Dr. Y' },
    };
    assert.ok(gerarPdfHtmlTexto(args).includes('>IDADE</span><span style="display:block;font-size:8.5pt;font-weight:500;">61 anos</span>'));
    // Mesmo paciente, exame do ano seguinte (já passou do aniversário): 62.
    const depois = { ...args, identificacao: { ...args.identificacao, dataExame: '2026-08-25' } };
    assert.ok(gerarPdfHtmlTexto(depois).includes('>IDADE</span><span style="display:block;font-size:8.5pt;font-weight:500;">62 anos</span>'));
  });

  test('a correção administrativa ainda acha as âncoras no HTML da moldura', () => {
    const html = montarPdfMoldura({
      titulo: 'ECOCARDIOGRAMA TRANSTORÁCICO',
      identificacao: [
        [{ label: 'NOME', valor: 'JOSILENE', flex: 2 }],
        [{ label: 'CONVÊNIO', valor: 'Unimed' }, { label: 'MÉDICO SOLICITANTE', valor: 'Dra. Marina' }],
      ],
      corpoHtml: '<div>corpo clínico</div>',
      cfg: { p1: '#0B5FA5', clinicaNome: 'MedCardio', sigTexto: 'Dr. X' },
    });
    const corrigido = substituirCamposAdministrativos(html, { convenio: 'Hapvida', solicitante: 'Dr. João' });
    assert.notEqual(corrigido, null);
    assert.ok(corrigido.includes('>Hapvida<'));
    assert.ok(corrigido.includes('>Dr. João<'));
    // Fora dos 2 campos, byte-a-byte igual.
    assert.equal(
      corrigido.replace('>Hapvida<', '>Unimed<').replace('>Dr. João<', '>Dra. Marina<'),
      html,
    );
  });

  test('linha única de identificação não leva margin-bottom', () => {
    const html = montarPdfMoldura({
      titulo: 'T', identificacao: [[{ label: 'NOME', valor: 'A' }]], corpoHtml: '',
      cfg: { p1: '#000', clinicaNome: 'X', sigTexto: '' },
    });
    assert.ok(html.includes('<div style="display:flex;gap:8px;">'));
    assert.ok(!html.includes('margin-bottom:2px;">\n      <div style="flex:1"'));
  });
});
