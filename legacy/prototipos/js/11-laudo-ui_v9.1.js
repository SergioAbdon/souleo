// ══════════════════════════════════════════════════════════════════
// LEO v7 · 11-laudo-ui.js
// Interface do motor de laudo: navegação, save/emit, print, helpers
// Depende de: motorv8mp4.js (calc, calcAll, gerarAchados, etc.)
//             02-utils.js (escH, showToast, hexToRgb, calcIdade, uid)
//             03-firestore.js (fsSalvarExame, fsEmitirExame)
//             04-billing.js (checkEmissao, consumirEmissao)
//             08-laudo.js (TIPOS_EXAME, getMotor)
//             09-config.js (CFG)
// ══════════════════════════════════════════════════════════════════

// Estado do laudo atual
var _laudoExameId = null;    // ID do exame no Firestore (null = novo)
var _laudoItemId = null;     // ID do item na worklist local
var _laudoTipoExame = 'eco_tt'; // Tipo do exame atual

// ══ NAVEGAÇÃO ══════════════════════════════════════════════════════

function abrirTelaLaudo(itemId, tipoExame){
  _laudoItemId = itemId || null;
  _laudoTipoExame = tipoExame || 'eco_tt';
  _laudoExameId = null;

  // Esconder dashboard, mostrar laudo
  var dash = document.getElementById('tela-clinica');
  var laudo = document.getElementById('tela-laudo');
  if(dash) dash.classList.add('oculta');
  if(laudo) laudo.classList.remove('oculta');

  // Popular CFG com dados do workspace/perfil
  popularCFG();

  // Atualizar título do exame
  var tipo = (typeof TIPOS_EXAME !== 'undefined' && TIPOS_EXAME[_laudoTipoExame])
    ? TIPOS_EXAME[_laudoTipoExame].nome.toUpperCase()
    : 'ECOCARDIOGRAMA TRANSTORÁCICO';
  var tituloEl = document.getElementById('laudo-titulo-exame');
  if(tituloEl) tituloEl.textContent = tipo;

  // Atualizar header da sidebar
  var hdrClinica = document.getElementById('hdr-clinica');
  if(hdrClinica) hdrClinica.textContent = CFG.clinica || 'Clínica';
  var hdrSub = document.getElementById('hdr-subtitulo');
  if(hdrSub) hdrSub.textContent = (CFG.medNome||'') + ' · CRM/' + (CFG.medUf||'') + ' ' + (CFG.medCrm||'');

  // Setar data do exame como hoje se vazio
  var dtEx = document.getElementById('dtexame');
  if(dtEx && !dtEx.value) dtEx.value = new Date().toISOString().split('T')[0];

  // Reset modo edição
  var modoEd = document.getElementById('modo-edicao');
  var modoEm = document.getElementById('modo-emitido');
  if(modoEd) modoEd.style.display = 'block';
  if(modoEm) modoEm.style.display = 'none';
  var sb = document.querySelector('#tela-laudo .sidebar');
  if(sb) sb.classList.remove('locked');

  // Reordenar seções (Válvulas após Diastólica)
  var secValv = document.getElementById('sec-valv');
  var secDiast = document.getElementById('sec-diast');
  if(secValv && secDiast) secDiast.after(secValv);

  // Calcular
  if(typeof calc === 'function') calc();
}

function voltarWorklist(){
  // Salvar medidas no item da worklist antes de sair
  if(_laudoItemId){
    salvarSnapshotNoItem(_laudoItemId);
  }

  // Esconder laudo, mostrar dashboard
  var dash = document.getElementById('tela-clinica');
  var laudo = document.getElementById('tela-laudo');
  if(laudo) laudo.classList.add('oculta');
  if(dash) dash.classList.remove('oculta');

  // Limpar estado
  _laudoExameId = null;
  _laudoItemId = null;

  // Atualizar worklist
  if(typeof dashRenderWorklist === 'function') dashRenderWorklist();
  showToast('Voltando ao worklist...');
}

// Coletar todas as medidas do DOM em um objeto
function coletarMedidas(){
  var campos = ['nome','dtnasc','dtexame','convenio','solicitante','sexo','ritmo',
    'peso','altura','b7','b8','b9','b10','b11','b12','b13','b28','b29',
    'b24','b25','b19','b20','b21','b22','b23','b24_diast',
    'b37','b38','b54','b32','b33','gls_ve','gls_vd','lars',
    'b34','b35','b34t','b36','b39','b40','b39p','b40p','psmap',
    'b41','b42','b45','b46','b47','b46t','b47t','b50','b51','b52','b50p',
    'b55','b56','b57','b58','b59','b60','b61','b62',
    'wk-mob','wk-esp','wk-cal','wk-sub'];
  var medidas = {};
  campos.forEach(function(id){
    var el = document.getElementById(id);
    if(el) medidas[id] = el.value || '';
  });
  // Wilkins toggle
  var wt = document.getElementById('wilkins-toggle');
  if(wt) medidas['wilkins-toggle'] = wt.checked;
  return medidas;
}

// Salvar snapshot no item da worklist (localStorage)
function salvarSnapshotNoItem(itemId){
  var wl = typeof getWorklist === 'function' ? getWorklist() : [];
  var item = wl.find(function(w){ return w.id === itemId; });
  if(item){
    item.laudoSnapshot = { medidas: coletarMedidas() };
    item.status = 'andamento';
    if(typeof setWorklist === 'function') setWorklist(wl);
  }
}

function popularCFG(){
  // 1. Dados do local de trabalho ativo
  var local = null;
  if(typeof getClinicas === 'function'){
    var cls = getClinicas();
    var ativa = localStorage.getItem('leo_clinica_ativa_v21');
    if(ativa) local = cls.find(function(c){ return c.id === ativa; });
    if(!local && cls.length) local = cls[0];
  }

  if(local){
    if(local.nome) CFG.clinica = local.nome;
    if(local.slogan) CFG.slogan = local.slogan;
    if(local.logoB64) CFG.logoB64 = local.logoB64;
    if(local.end) CFG.localEnd = local.end;
    if(local.tel) CFG.localTel = local.tel;
    if(local.p1) CFG.p1 = local.p1;
    if(local.p2) CFG.p2 = local.p2;
  } else if(typeof _fbWorkspace !== 'undefined' && _fbWorkspace){
    if(_fbWorkspace.nomeClinica) CFG.clinica = _fbWorkspace.nomeClinica;
    if(_fbWorkspace.slogan) CFG.slogan = _fbWorkspace.slogan;
    if(_fbWorkspace.corPrimaria) CFG.p1 = _fbWorkspace.corPrimaria;
  }

  // 2. Dados do profissional
  if(typeof _fbProfile !== 'undefined' && _fbProfile){
    if(_fbProfile.nome) CFG.medNome = _fbProfile.nome;
    if(_fbProfile.especialidade) CFG.medEsp = _fbProfile.especialidade;
    if(_fbProfile.crm) CFG.medCrm = _fbProfile.crm;
    if(_fbProfile.ufCrm) CFG.medUf = _fbProfile.ufCrm;
    CFG.sigTexto = (_fbProfile.nome||CFG.medNome) + '\n' + (_fbProfile.especialidade||CFG.medEsp) + '\nCRM/' + (_fbProfile.ufCrm||CFG.medUf) + ' ' + (_fbProfile.crm||CFG.medCrm);
  }

  // 3. Garantir defaults se ainda vazio
  if(!CFG.clinica) CFG.clinica = 'Consultório';
  if(!CFG.p1) CFG.p1 = '#8B1A1A';
  if(!CFG.p2) CFG.p2 = '#1E3A5F';
  if(!CFG.sigTexto && CFG.medNome) CFG.sigTexto = CFG.medNome + '\n' + CFG.medEsp + '\nCRM/' + CFG.medUf + ' ' + CFG.medCrm;

  // 4. Aplicar cores APENAS na folha A4 (preview), não na sidebar nem no dashboard
  var previewEl = document.querySelector('#tela-laudo .preview');
  if(previewEl){
    previewEl.style.setProperty('--P1', CFG.p1);
    previewEl.style.setProperty('--P2', CFG.p2);
    previewEl.style.setProperty('--red', CFG.p1);
    previewEl.style.setProperty('--red-mid', CFG.p1);
    previewEl.style.setProperty('--navy', CFG.p2);
  }

  // 5. Aplicar ao DOM do cabeçalho
  var el;
  el = document.getElementById('hdr-clinica-nome');   if(el) el.textContent = CFG.clinica;
  el = document.getElementById('hdr-clinica-slogan'); if(el) el.textContent = CFG.slogan || '';

  // 6. Aplicar ao DOM do rodapé
  el = document.getElementById('ftr-clinica');        if(el) el.textContent = CFG.clinica;
  el = document.getElementById('ftr-end');            if(el) el.textContent = CFG.localEnd || '';
  el = document.getElementById('ftr-tel');            if(el) el.textContent = CFG.localTel || '';
  el = document.getElementById('ftr-sig-texto');      if(el) el.textContent = CFG.sigTexto || '';

  // 7. Logo da clínica
  var logoEl = document.getElementById('laudo-logo-clinica');
  if(logoEl && CFG.logoB64){
    logoEl.src = CFG.logoB64;
  }

  // 8. Header da sidebar — forçar fundo navy
  var sbHdr = document.querySelector('#tela-laudo .sidebar-header');
  if(sbHdr) sbHdr.style.background = CFG.p2;

  // 9. Sidebar header textos
  el = document.getElementById('hdr-clinica');
  if(el) el.textContent = CFG.clinica;
  el = document.getElementById('hdr-subtitulo');
  if(el) el.textContent = (CFG.medNome||'') + ' · CRM/' + (CFG.medUf||'') + ' ' + (CFG.medCrm||'');
}

function preencherPaciente(pac){
  if(!pac) return;
  var el;
  el = document.getElementById('nome');        if(el && pac.nome) el.value = pac.nome;
  el = document.getElementById('dtnasc');      if(el && pac.dataNascimento) el.value = pac.dataNascimento;
  el = document.getElementById('convenio');    if(el && pac.convenio) el.value = pac.convenio;
  el = document.getElementById('solicitante'); if(el && pac.solicitante) el.value = pac.solicitante;
  el = document.getElementById('sexo');        if(el && pac.sexo) el.value = pac.sexo;
}

// ══ SINCRONIZAR LAVI ═══════════════════════════════════════════════

function sincronizarLAVI(origem, destinoId){
  var destino = document.getElementById(destinoId);
  if(destino) destino.value = origem.value;
  calc();
}

// ══ DIASTOLOGIA TOGGLE ═════════════════════════════════════════════

function trocarDiastModo(modo){
  if(typeof setDiastModo === 'function') setDiastModo(modo);
  var btnAuto = document.getElementById('btn-diast-auto');
  var btnMan = document.getElementById('btn-diast-manual');
  var panel = document.getElementById('diast-manual-panel');
  if(btnAuto){
    btnAuto.style.background = modo==='auto' ? 'var(--navy)' : 'transparent';
    btnAuto.style.color = modo==='auto' ? '#fff' : 'var(--navy)';
  }
  if(btnMan){
    btnMan.style.background = modo==='manual' ? 'var(--navy)' : 'transparent';
    btnMan.style.color = modo==='manual' ? '#fff' : 'var(--navy)';
  }
  if(panel) panel.style.display = modo==='manual' ? 'block' : 'none';
  calc();
}

function selDiastManual(idx){
  if(typeof setDiastManual === 'function') setDiastManual(idx);
  try{
    var d = calcAll();
    var div = diastDivergencia(d);
    var avisoEl = document.getElementById('diast-aviso');
    if(div){ avisoEl.innerHTML='<b>⚠️</b> '+div.msg+' (Auto: "'+div.auto+'")'; avisoEl.style.display='block'; }
    else { avisoEl.style.display='none'; }
  }catch(e){}
  calc();
}

// ══ POPUP SALVAR / EMITIR ══════════════════════════════════════════

function abrirSalvarEmitir(){
  document.getElementById('popup-salvar-emitir').classList.add('open');
}
function fecharSalvarEmitir(e){
  if(e && e.target !== e.currentTarget) return;
  document.getElementById('popup-salvar-emitir').classList.remove('open');
}

function salvarRascunho(){
  fecharSalvarEmitir();
  // Futuro: coletarDadosExame() + fsSalvarExame()
  showToast('Rascunho salvo com sucesso');
}

function emitirLaudo(){
  fecharSalvarEmitir();
  // Travar sidebar
  var sb = document.querySelector('#tela-laudo .sidebar');
  if(sb) sb.classList.add('locked');
  // Alternar botões
  document.getElementById('modo-edicao').style.display='none';
  document.getElementById('modo-emitido').style.display='block';
  showToast('Laudo emitido e assinado');
  // Futuro: checkEmissao + fsEmitirExame + consumirEmissao
  // Gerar PDF automaticamente
  setTimeout(function(){ gerarPDFEmitido(); }, 500);
}

function desbloquearEdicao(){
  var sb = document.querySelector('#tela-laudo .sidebar');
  if(sb) sb.classList.remove('locked');
  document.getElementById('modo-emitido').style.display='none';
  document.getElementById('modo-edicao').style.display='block';
  showToast('Laudo desbloqueado para edição');
}

function finalizarAtendimento(){
  voltarWorklist();
  showToast('Atendimento finalizado');
}

// ══ EXPORTAR / TOGGLE ══════════════════════════════════════════════

function toggleExport(e){
  e&&e.stopPropagation();
  var menu=document.getElementById('export-menu');
  var isOpen=menu.style.display==='block';
  menu.style.display=isOpen?'none':'block';
  if(!isOpen){
    setTimeout(function(){document.addEventListener('click',fecharExportClick,{once:true});},10);
  }
}
function fecharExportClick(){document.getElementById('export-menu').style.display='none';}
function fecharExport(){document.getElementById('export-menu').style.display='none';}

// ══ LIMPAR FORMULÁRIO ══════════════════════════════════════════════

function limpar(){
  if(!confirm('Limpar todos os campos do formulário?')) return;
  document.querySelectorAll('#tela-laudo .sidebar input[type=number], #tela-laudo .sidebar input[type=text]').forEach(function(el){
    el.value = '';
  });
  document.querySelectorAll('#tela-laudo .sidebar select').forEach(function(el){
    el.selectedIndex = 0;
  });
  var dtEx = document.getElementById('dtexame');
  if(dtEx) dtEx.value = new Date().toISOString().split('T')[0];
  calc();
  showToast('Formulário limpo');
}

// ══ IMPRESSÃO / PDF ════════════════════════════════════════════════

function _getNomePaciente(){
  var nome = (document.getElementById('nome') || {}).value || 'PACIENTE';
  return nome.trim().toUpperCase().replace(/\s+/g, ' ');
}
function _getNomeArquivo(){
  return 'ECOTT ' + _getNomePaciente();
}

function _montarHTMLImpressao(){
  var headerEl = document.querySelector('.print-header-fixed');
  var headerHTML = headerEl ? headerEl.innerHTML : '';

  var footerEl = document.querySelector('.print-footer-fixed');
  var footerHTML = footerEl ? footerEl.innerHTML : '';

  var paramsEl = document.querySelector('.params-table');
  var paramsHTML = paramsEl ? paramsEl.outerHTML : '';

  var achadosHTML = '';
  document.querySelectorAll('#achados-body .linha-wrapper').forEach(function(w){
    var ta = w.querySelector('.achado-editable');
    if(ta && ta.value.trim()){
      achadosHTML += '<li style="margin-bottom:2px;font-size:8.5pt;line-height:1.6;">' + ta.value.trim().replace(/</g,'&lt;') + '</li>';
    }
  });

  var concHTML = '';
  var idx = 0;
  document.querySelectorAll('#conclusao-list li').forEach(function(li){
    var ta = li.querySelector('.conclusao-text');
    if(ta){
      idx++;
      var txt = (ta.innerText||ta.textContent||'').trim();
      if(txt) concHTML += '<li style="margin-bottom:2px;font-size:8.5pt;line-height:1.6;"><strong style="color:#8B1A1A;margin-right:4px;">' + idx + '</strong> ' + txt.replace(/</g,'&lt;') + '</li>';
    }
  });

  var nomeArq = _getNomeArquivo();
  var P1 = (typeof CFG!=='undefined' && CFG.p1) ? CFG.p1 : '#8B1A1A';
  var P2 = (typeof CFG!=='undefined' && CFG.p2) ? CFG.p2 : '#1E3A5F';

  var clinicaNome = document.getElementById('hdr-clinica-nome') ? document.getElementById('hdr-clinica-nome').textContent : 'Clínica';
  var clinicaSlogan = document.getElementById('hdr-clinica-slogan') ? document.getElementById('hdr-clinica-slogan').textContent : '';
  var tituloExame = document.getElementById('laudo-titulo-exame') ? document.getElementById('laudo-titulo-exame').textContent : 'EXAME';
  var logoSrc = document.getElementById('laudo-logo-clinica') ? document.getElementById('laudo-logo-clinica').src : '';
  var logoVisible = logoSrc && !logoSrc.includes('data:image/svg+xml');

  var ftrClinica = document.getElementById('ftr-clinica') ? document.getElementById('ftr-clinica').textContent : '';
  var ftrEnd = document.getElementById('ftr-end') ? document.getElementById('ftr-end').textContent : '';
  var ftrTel = document.getElementById('ftr-tel') ? document.getElementById('ftr-tel').textContent : '';
  var ftrSig = document.getElementById('ftr-sig-texto') ? document.getElementById('ftr-sig-texto').textContent : '';

  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>'
    + '<title>' + nomeArq + '</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0;}'
    + 'body{font-family:"IBM Plex Sans",sans-serif;font-size:8.5pt;color:#1a1a1a;}'
    + '@page{size:A4;margin:0;}'
    + 'table.page-layout{width:100%;border-collapse:collapse;table-layout:fixed;}'
    + 'thead{display:table-header-group;}'
    + 'tfoot{display:table-footer-group;}'
    + 'thead td{padding:8mm 14mm 3mm;}'
    + 'tfoot td{padding:3mm 14mm 6mm;}'
    + 'tbody td{padding:0 14mm 4mm;}'
    + '.laudo-header{padding-bottom:2mm;border-bottom:2.5px solid '+P1+';margin-bottom:2mm;}'
    + '.hdr-linha1{display:flex;align-items:center;gap:10px;margin-bottom:-2px;}'
    + '.hdr-clinica-logo{width:42px;height:42px;border-radius:5px;object-fit:contain;}'
    + '.hdr-clinica-info{display:flex;flex-direction:column;}'
    + '.hdr-clinica-text{font-size:14pt;font-weight:700;color:'+P1+';white-space:nowrap;line-height:1.1;}'
    + '.hdr-clinica-slogan{font-size:7.5pt;font-weight:400;color:#888;margin-top:1px;}'
    + '.laudo-title{font-size:10.5pt;font-weight:700;color:'+P1+';text-align:center;white-space:nowrap;letter-spacing:.3px;}'
    + '.id-grid{border:1px solid '+P1+';border-radius:3px;padding:3px 6px;margin-bottom:2mm;}'
    + '.id-row{display:flex;gap:8px;margin-bottom:2px;}'
    + '.id-item{flex:1;}'
    + '.id-item .lbl{display:block;font-size:5.5pt;font-weight:600;color:'+P1+';text-transform:uppercase;}'
    + '.id-item .val{display:block;font-size:8.5pt;font-weight:500;}'
    + '.sec-title{background:'+P1+';color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + '.sec-body{border:1px solid #ddd;border-top:none;padding:4px 8px;margin-bottom:3mm;}'
    + '.params-table{border-collapse:collapse;width:100%;font-size:7.5pt;}'
    + '.params-table th{background:'+P1+';color:#fff;padding:2px 5px;font-weight:600;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    + '.params-table td{border:0.5px solid #ccc;padding:2px 5px;}'
    + '.params-divider{border-left:2px solid '+P1+'!important;}'
    + '.laudo-footer{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;border-top:1.5px solid '+P1+';padding-top:2mm;}'
    + '.ftr-local{font-size:7pt;color:#444;line-height:1.6;}'
    + '.ftr-local strong{color:'+P1+';font-size:8pt;}'
    + '.footer-assinatura{text-align:center;font-size:7pt;}'
    + '.footer-assinatura .linha{width:150px;border-top:1px solid #333;margin:0 auto 2px;}'
    + '.ftr-leo{text-align:center;width:100%;margin-top:2mm;padding-top:1mm;border-top:0.5px solid #e0e0e0;font-size:6pt;color:#aaa;}'
    + 'ul{list-style:none;padding:0;margin:0;}'
    + '</style></head><body>'
    + '<table class="page-layout">'
    + '<thead><tr><td>'
    + '<div class="laudo-header">'
    + '<div class="hdr-linha1">'
    + (logoVisible ? '<img class="hdr-clinica-logo" src="'+logoSrc+'" alt="Logo"/>' : '')
    + '<div class="hdr-clinica-info">'
    + '<span class="hdr-clinica-text">' + clinicaNome + '</span>'
    + (clinicaSlogan ? '<span class="hdr-clinica-slogan">' + clinicaSlogan + '</span>' : '')
    + '</div></div>'
    + '<div class="laudo-title">' + tituloExame + '</div>'
    + '</div>'
    + (headerHTML.match(/<div class="id-grid">[\s\S]*?<\/div><!-- \/id-grid -->/)||[''])[0]
    + '</td></tr></thead>'
    + '<tfoot><tr><td>'
    + '<div class="laudo-footer">'
    + '<div class="ftr-local"><strong>' + ftrClinica + '</strong><br/>' + ftrEnd + '<br/>\u260E ' + ftrTel + '</div>'
    + '<div class="footer-assinatura"><div class="linha"></div><div style="font-size:7pt;white-space:pre-line;">' + ftrSig + '</div></div>'
    + '</div>'
    + '<div class="ftr-leo">Laudo emitido com ajuda do <strong>LEO</strong> \u00B7 www.souleo.com.br</div>'
    + '</td></tr></tfoot>'
    + '<tbody><tr><td>'
    + '<div class="sec-title">MEDIDAS E PAR\u00c2METROS</div>'
    + '<div class="sec-body" style="padding:0;">' + paramsHTML + '</div>'
    + '<div class="sec-title">COMENT\u00c1RIOS</div>'
    + '<div class="sec-body"><ul>' + achadosHTML + '</ul></div>'
    + '<div class="sec-title">CONCLUS\u00c3O</div>'
    + '<div class="sec-body"><ul>' + concHTML + '</ul></div>'
    + '</td></tr></tbody>'
    + '</table></body></html>';
}

function imprimirLaudo(){
  var html = _montarHTMLImpressao();
  var win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(html);
  win.document.close();
  win.onload = function(){
    setTimeout(function(){ win.focus(); win.print(); }, 600);
  };
}

function gerarPDFEmitido(){
  imprimirLaudo();
}

function copiarFormatado(){
  var sheet = document.getElementById('laudo-sheet');
  if(!sheet){ showToast('Laudo não encontrado'); return; }
  var range = document.createRange();
  range.selectNodeContents(sheet);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('copy');
  sel.removeAllRanges();
  showToast('Laudo copiado (formatado)');
  fecharExport();
}

function copiarTextoSimples(){
  var sheet = document.getElementById('laudo-sheet');
  if(!sheet){ showToast('Laudo não encontrado'); return; }
  var texto = sheet.innerText;
  navigator.clipboard.writeText(texto).then(function(){
    showToast('Laudo copiado (texto simples)');
  }).catch(function(){
    var ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    showToast('Laudo copiado (texto simples)');
  });
  fecharExport();
}

function baixarDocx(){
  var sheet = document.getElementById('laudo-sheet');
  if(!sheet){ showToast('Laudo não encontrado'); return; }
  var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;font-size:11pt;}table{border-collapse:collapse;width:100%;}td,th{border:1px solid #ccc;padding:4px 6px;font-size:10pt;}</style></head><body>' + sheet.innerHTML + '</body></html>';
  var blob = new Blob(['\ufeff', html], {type:'application/msword'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = _getNomeArquivo() + '.doc';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Arquivo .doc baixado');
  fecharExport();
}

// ══ ENTER → TAB ════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function(){
  // Enter funciona como Tab na sidebar do laudo
  document.querySelectorAll('#tela-laudo .sidebar input, #tela-laudo .sidebar select').forEach(function(el){
    el.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){
        e.preventDefault();
        var campos = Array.from(document.querySelectorAll('#tela-laudo .sidebar input:not([type=hidden]):not([readonly]), #tela-laudo .sidebar select'));
        var idx = campos.indexOf(el);
        if(idx >= 0 && idx < campos.length - 1){
          campos[idx + 1].focus();
        }
      }
    });
  });
});

// ══ INTEGRAÇÃO COM DASHBOARD ═══════════════════════════════════════
// Estas funções são chamadas pelo 06-dashboard.js

function dashAbrirLaudo(itemId){
  // Buscar item na worklist
  var wl = typeof getWorklist === 'function' ? getWorklist() : [];
  var item = wl.find(function(w){ return w.id === itemId; });

  if(item){
    // Atualizar status para andamento
    item.status = 'andamento';
    if(typeof setWorklist === 'function') setWorklist(wl);

    // Buscar dados completos do paciente
    var pacs = typeof getPacientes === 'function' ? getPacientes() : [];
    var pac = pacs.find(function(p){ return p.id === item.pacId; });

    abrirTelaLaudo(itemId, item.tipoExame || 'eco_tt');

    // Preencher dados do paciente (da lista de pacientes + item da worklist)
    if(pac){
      preencherPaciente({
        nome: pac.nome,
        dataNascimento: pac.dtnasc,
        convenio: item.convenio || pac.convenio || '',
        solicitante: item.solicitante || '',
        sexo: pac.sexo || ''
      });
    }

    // Se tem snapshot salvo, restaurar medidas
    if(item.laudoSnapshot && item.laudoSnapshot.medidas){
      restaurarMedidas(item.laudoSnapshot.medidas);
    }

    calc();
  } else {
    abrirTelaLaudo(null, 'eco_tt');
  }
}

function restaurarMedidas(medidas){
  if(!medidas) return;
  Object.keys(medidas).forEach(function(id){
    var el = document.getElementById(id);
    if(el && medidas[id] !== null && medidas[id] !== undefined && medidas[id] !== ''){
      el.value = medidas[id];
    }
  });
}

function dashVerLaudo(itemId){
  dashAbrirLaudo(itemId);
  // Travar como read-only
  var sb = document.querySelector('#tela-laudo .sidebar');
  if(sb) sb.classList.add('locked');
  document.getElementById('modo-edicao').style.display='none';
  document.getElementById('modo-emitido').style.display='block';
}

function dashImprimirLaudo(itemId){
  // Abrir laudo e imprimir direto
  dashAbrirLaudo(itemId);
  setTimeout(function(){ imprimirLaudo(); }, 800);
}

console.log('%c📋 11-laudo-ui.js carregado — navegação, save/emit, print','color:#059669;font-weight:bold;font-size:11px;');
