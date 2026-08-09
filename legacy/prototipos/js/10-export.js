// ══════════════════════════════════════════════════════════════════
// LEO v7 · Módulo 10 — Export
// Impressão, DOCX, copiar formatado, copiar texto, snapshot
// ══════════════════════════════════════════════════════════════════

// ── Coletar dados do laudo ──

function coletarLaudo(){
  const g=(id)=>document.getElementById(id)?.textContent||'—';
  const nome=g('out-nome'), idade=g('out-idade'), dtnasc=g('out-dtnasc');
  const convenio=g('out-convenio'), solicitante=g('out-solicitante'), dtexame=g('out-dtexame');

  const achados=[];
  document.querySelectorAll('#achados-body .linha-wrapper').forEach(w=>{
    const ta=w.querySelector('.achado-editable');
    const wk=w.querySelector('.wilkins-titulo');
    if(wk) achados.push({tipo:'wilkins',html:w.querySelector('div[style*="flex:1"]')?.innerText||''});
    else if(ta){ const t=ta.value.trim(); if(t) achados.push({tipo:'texto',txt:t}); }
  });

  const conclusoes=[];
  document.querySelectorAll('#conclusao-list .conc-wrapper').forEach(li=>{
    const t=li.querySelector('.conclusao-text')?.innerText?.trim();
    if(t) conclusoes.push(t);
  });

  const paramsTbody=document.getElementById('params-tbody')?.innerHTML||'';
  return {nome,idade,dtnasc,convenio,solicitante,dtexame,achados,conclusoes,paramsTbody};
}

// ── Snapshot completo (para salvar no worklist/histórico) ──

function coletarSnapshotLaudo(){
  const ids=['nome','dtnasc','dtexame','convenio','solicitante','sexo','ritmo','peso','altura',
    'b7','b8','b9','b10','b11','b12','b13','b28','b29','b24','b25','b54','b32','b33',
    'b55','b56','b57','b58','b59','b60','b61','b62','b19','b20','b21','b22','b23',
    'b37','b38','b34','b35','b34t','b36','b39','b40','b39p','b40p','b41','b42',
    'b45','b46','b47','b46t','b47t','b50','b51','b52','b50p','b27','psmap'];
  const campos={};
  ids.forEach(id=>{ const el=document.getElementById(id); if(el) campos[id]=el.value; });

  const achados=[];
  document.querySelectorAll('#achados-body .linha-wrapper').forEach(w=>{
    const ta=w.querySelector('.achado-editable');
    const wk=w.querySelector('.wilkins-titulo');
    if(wk) achados.push({tipo:'wilkins',html:w.querySelector('div[style*="flex:1"]')?.innerHTML||''});
    else if(ta){ const t=ta.value.trim(); if(t) achados.push({tipo:'texto',txt:t}); }
  });

  const conclusoes=[];
  document.querySelectorAll('#conclusao-list .conc-wrapper').forEach(li=>{
    const t=li.querySelector('.conclusao-text')?.innerText?.trim();
    if(t) conclusoes.push(t);
  });

  return {campos,achados,conclusoes,paramsTbody:document.getElementById('params-tbody')?.innerHTML||'',clinica:WL_CLINICA_ATIVA,salvoEm:new Date().toISOString()};
}

// ── Copiar formatado (HTML) ──

function copiarFormatado(){
  const d=coletarLaudo();
  const p1=CFG.p1||'#1E3A5F';

  let achadosHtml='';
  d.achados.forEach(a=>{
    if(a.tipo==='wilkins') achadosHtml+=`<p style="margin:2px 0 2px 16px;font-size:9pt;">${(a.html||'').replace(/\n/g,'<br/>')}</p>`;
    else{
      const al=/Disfunção|aumentado|Alteração|Hipertrofia|Insuficiência|Derrame|Estenose|Hipertensão|Miocardiopatia/.test(a.txt);
      achadosHtml+=`<p style="margin:2px 0;font-size:9pt;${al?'color:'+p1+';font-weight:500;':''}">${escH(a.txt)}</p>`;
    }
  });

  let concHtml='<ol style="margin:0;padding-left:18px;">';
  d.conclusoes.forEach(c=>concHtml+=`<li style="font-size:9pt;font-weight:500;margin:2px 0;">${escH(c)}</li>`);
  concHtml+='</ol>';

  const html=`<div style="font-family:Calibri,sans-serif;font-size:10pt;max-width:700px;">
    <div style="border-bottom:2px solid ${p1};padding-bottom:6px;margin-bottom:8px;">
      <strong style="color:${p1};font-size:13pt;">${escH(CFG.clinica||'')}</strong> · ECOCARDIOGRAMA TT · <strong style="color:${p1};">${escH(CFG.medNome||'')}</strong>
    </div>
    <div style="font-size:8.5pt;margin-bottom:10px;"><strong>Nome:</strong> ${escH(d.nome)} | <strong>Idade:</strong> ${escH(d.idade)} | <strong>Data:</strong> ${escH(d.dtexame)}</div>
    <div style="background:${p1};color:#fff;padding:3px 10px;font-size:8pt;font-weight:700;">COMENTÁRIOS</div>
    <div style="border:1px solid #ddd;border-top:none;padding:6px 8px;">${achadosHtml}</div>
    <div style="background:${p1};color:#fff;padding:3px 10px;font-size:8pt;font-weight:700;margin-top:6px;">CONCLUSÃO</div>
    <div style="border:1px solid #ddd;border-top:none;padding:6px 8px;">${concHtml}</div>
  </div>`;

  try{
    const blob=new Blob([html],{type:'text/html'});
    const plain=d.achados.map(a=>a.txt||a.html||'').join('\n')+'\n\nCONCLUSÃO\n'+d.conclusoes.map((c,i)=>`${i+1}. ${c}`).join('\n');
    navigator.clipboard.write([new ClipboardItem({'text/html':blob,'text/plain':new Blob([plain],{type:'text/plain'})})]);
    showToast('✅ Laudo formatado copiado!');
  }catch(e){
    showToast('⚠ Erro ao copiar. Tente novamente.');
  }
}

// ── Copiar texto simples ──

function copiarTextoSimples(){
  const d=coletarLaudo();
  const sep='═'.repeat(44);
  let txt=`${sep}\n   ECOCARDIOGRAMA TRANSTORÁCICO\n   ${CFG.medNome||''} · CRM/${CFG.medUf||''} ${CFG.medCrm||''}\n${sep}\n`;
  txt+=`Paciente: ${d.nome} · ${d.idade}\nConvênio: ${d.convenio} · Data: ${d.dtexame}\n`;
  txt+=`${'─'.repeat(44)}\nCOMENTÁRIOS\n${'─'.repeat(44)}\n`;
  d.achados.forEach(a=>txt+=(a.txt||a.html||'')+'\n');
  txt+=`${'─'.repeat(44)}\nCONCLUSÃO\n${'─'.repeat(44)}\n`;
  d.conclusoes.forEach((c,i)=>txt+=`${i+1}. ${c}\n`);
  txt+=sep+'\n'+`${CFG.medNome||''} · CRM/${CFG.medUf||''} ${CFG.medCrm||''}\n`;

  try{ navigator.clipboard.writeText(txt); showToast('✅ Texto copiado!'); }
  catch(e){ showToast('⚠ Erro ao copiar.'); }
}

// ── Impressão ──

function gerarImpressao(){
  const sheet=document.querySelector('.sheet');
  if(!sheet){ showToast('⚠ Nenhum laudo para imprimir.'); return; }
  const win=window.open('','_blank');
  if(!win){ showToast('⚠ Popup bloqueado. Permita popups.'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Laudo ECO</title>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'IBM Plex Sans',sans-serif;}
    @media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}}</style>
    </head><body>${sheet.outerHTML}</body></html>`);
  win.document.close();
  setTimeout(()=>win.print(),500);
}

// ── Export DOCX ──

function baixarDocx(){
  const d=coletarLaudo();
  const p1hex=(CFG.p1||'#1E3A5F').replace('#','');
  const xmlParts=[];

  const addPar=(txt,opts={})=>{
    const sz=opts.sz||20, bold=opts.bold?'<w:b/>':'', color=opts.color?`<w:color w:val="${opts.color.replace('#','')}"/>`:'';
    const align=opts.align?`<w:jc w:val="${opts.align}"/>`:'';
    xmlParts.push(`<w:p><w:pPr>${align}<w:rPr>${bold}${color}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:pPr><w:r><w:rPr>${bold}${color}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${escXml(txt)}</w:t></w:r></w:p>`);
  };

  const addSection=(txt)=>{
    xmlParts.push(`<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${p1hex}"/><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="15"/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="15"/></w:rPr><w:t xml:space="preserve"> ${escXml(txt)} </w:t></w:r></w:p>`);
  };

  addPar(`${CFG.clinica||''} · ECOCARDIOGRAMA TT · ${CFG.medNome||''}`,{bold:true,sz:22,color:CFG.p1,align:'center'});
  addPar(`CRM/${CFG.medUf||''} ${CFG.medCrm||''}`,{sz:17,color:'#6B7280',align:'center'});
  addPar('',{sz:14});
  addPar(`Paciente: ${d.nome}  Idade: ${d.idade}  Data: ${d.dtexame}`,{sz:18,bold:true});
  addPar(`Convênio: ${d.convenio}  Solicitante: ${d.solicitante}`,{sz:17});
  addPar('',{sz:14});
  addSection('COMENTÁRIOS');
  d.achados.forEach(a=>addPar(a.txt||a.html||'',{sz:17}));
  addPar('',{sz:14});
  addSection('CONCLUSÃO');
  d.conclusoes.forEach((c,i)=>addPar(`${i+1}. ${c}`,{sz:17,bold:true}));
  addPar('',{sz:14});
  addPar(`${CFG.medNome||''} · CRM/${CFG.medUf||''} ${CFG.medCrm||''}`,{sz:15,color:CFG.p1,bold:true});

  const docXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${xmlParts.join('\n')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  const relsXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
  const ctXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const s=document.getElementById('jszip-script');
  if(!s){
    const el=document.createElement('script');
    el.id='jszip-script';
    el.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    el.onload=()=>_gerarDocx(docXml,relsXml,stylesXml,ctXml,rootRels,d.nome);
    document.head.appendChild(el);
  } else _gerarDocx(docXml,relsXml,stylesXml,ctXml,rootRels,d.nome);
}

function _gerarDocx(docXml,relsXml,stylesXml,ctXml,rootRels,nome){
  if(typeof JSZip==='undefined'){showToast('⚠ Erro JSZip.');return;}
  const zip=new JSZip();
  zip.file('[Content_Types].xml',ctXml);
  zip.file('_rels/.rels',rootRels);
  zip.file('word/document.xml',docXml);
  zip.file('word/styles.xml',stylesXml);
  zip.file('word/_rels/document.xml.rels',relsXml);
  zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}).then(blob=>{
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`laudo_eco_${(nome||'paciente').replace(/\s+/g,'_')}.docx`;
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast('✅ .docx gerado!');
  });
}

// ── Toggle menu export ──

function toggleExport(e){
  if(e) e.stopPropagation();
  const m=document.getElementById('export-menu');
  if(m) m.classList.toggle('open');
}
function fecharExport(){
  const m=document.getElementById('export-menu');
  if(m) m.classList.remove('open');
}

console.log('%c🫀 LEO v7 — Export carregado','color:#2563EB;font-size:11px;');
