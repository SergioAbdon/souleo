// ══════════════════════════════════════════════════════════════════
// LEO v7 · Módulo 07 — Worklist
// Fila do dia, pacientes, timer de espera, histórico
// VERSÃO ÚNICA — sem duplicatas
// ══════════════════════════════════════════════════════════════════

let _wlTimerInterval = null;

// ══ NAVEGAÇÃO ════════════════════════════════════════════════════

function entrarWorklist(){
  if(!WL_CLINICA_ATIVA){
    const cls = getClinicas();
    WL_CLINICA_ATIVA = cls.find(c=>c.padrao) || cls[0];
    if(!WL_CLINICA_ATIVA) return;
  }
  lsSet(CLINICA_ATIVA_KEY, WL_CLINICA_ATIVA);
  aplicarCoresClinica(WL_CLINICA_ATIVA);
  document.getElementById('tela-clinica').classList.add('oculta');
  const tw = document.getElementById('tela-worklist');
  if(tw) tw.classList.add('ativa');
  atualizarHeaderWorklist();
  preencherSeletorClinica();
  wlRenderLista();
  iniciarTimerWL();
}

function voltarWorklist(){
  const itemId = lsGet('leo_item_ativo');
  if(itemId){
    let wl = getWorklist();
    const item = wl.find(i=>i.id===itemId);
    if(item){
      const concs = [];
      document.querySelectorAll('#conclusao-list .conc-wrapper').forEach(li=>{
        const t = li.querySelector('.conclusao-text')?.innerText?.trim();
        if(t) concs.push(t);
      });
      item.laudoConc = concs;
      item.clinicaNome = WL_CLINICA_ATIVA?.nome || '';
      item.convenio = item.convenio || document.getElementById('convenio')?.value || '';
      if(typeof coletarSnapshotLaudo === 'function') item.laudoSnapshot = coletarSnapshotLaudo();

      if(concs.length){
        item.status = 'concluido';
        item.concluidoEm = new Date().toISOString();
        wl = wl.filter(i=>i.id!==itemId);
        setWorklist(wl);
        const hist = getHistorico();
        hist.unshift(item);
        setHistorico(hist);
      } else {
        item.status = 'andamento';
        setWorklist(wl);
      }
    }
  }

  // Voltar para dashboard
  document.getElementById('tela-clinica').classList.remove('oculta');
  if(typeof dashRenderWorklist === 'function') dashRenderWorklist();

  // Worklist antigo (compatibilidade)
  const tw = document.getElementById('tela-worklist');
  if(tw) tw.classList.add('ativa');
  wlRenderLista();

  if(WL_PACIENTE_SEL){
    const wl = getWorklist();
    const hist = getHistorico();
    const pacs = getPacientes();
    let item = wl.find(i=>i.id===WL_PACIENTE_SEL);
    if(!item) item = hist.find(i=>i.id===WL_PACIENTE_SEL);
    if(item){
      const pac = pacs.find(p=>p.id===item.pacId);
      if(pac) renderPainelPaciente(pac, item);
    }
  }
}

// ══ TABS ═════════════════════════════════════════════════════════

function wlTab(tab){
  WL_TAB_ATIVA = tab;
  const tabHoje = document.getElementById('tab-hoje');
  const tabHist = document.getElementById('tab-hist');
  if(tabHoje) tabHoje.classList.toggle('act', tab==='hoje');
  if(tabHist) tabHist.classList.toggle('act', tab==='historico');
  WL_PACIENTE_SEL = null;
  const det = document.getElementById('wl-detalhe-col');
  if(det) det.innerHTML = '<div class="wl-detalhe-vazio"><span class="dv-icon">👈</span><h3>Selecione um paciente</h3><p>Clique em um paciente da lista para ver os detalhes.</p></div>';
  wlRenderLista();
}

function wlBuscar(q){ wlRenderLista(q); }

// ══ RENDER LISTA ═════════════════════════════════════════════════

function wlRenderLista(busca){
  const lista = document.getElementById('wl-lista');
  if(!lista) return;
  const wl = getWorklist();
  const pacs = getPacientes();
  const hoje = new Date().toISOString().split('T')[0];
  const q = (busca || document.getElementById('wl-search-inp')?.value || '').toLowerCase().trim();
  const clinicaId = WL_CLINICA_ATIVA?.id;

  let itens = wl.filter(item=>{
    if(clinicaId && item.clinicaId !== clinicaId) return false;
    if(WL_TAB_ATIVA === 'hoje') return item.dtexame === hoje;
    return true;
  });

  if(q){
    itens = itens.filter(item=>{
      const pac = pacs.find(p=>p.id===item.pacId);
      if(!pac) return false;
      return pac.nome.toLowerCase().includes(q) || (pac.cpf||'').replace(/\D/g,'').includes(q.replace(/\D/g,''));
    });
  }

  itens.sort((a,b)=>{
    const ta = a.chegadaTs || a.criadoEm || '';
    const tb = b.chegadaTs || b.criadoEm || '';
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  if(!itens.length){
    lista.innerHTML = `<div class="wl-lista-vazia"><span class="wl-vazia-icon">${WL_TAB_ATIVA==='hoje'?'📋':'📂'}</span><p>${WL_TAB_ATIVA==='hoje'?'Nenhum paciente no Worklist de hoje.':'Nenhum registro encontrado.'}</p></div>`;
    return;
  }

  let html = '';
  itens.forEach(item=>{
    const pac = pacs.find(p=>p.id===item.pacId);
    if(!pac) return;
    const iniciais = pac.nome.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase();
    const statusMap = {
      'aguardando':'<span class="status-badge status-aguardando">⏳ Aguardando</span>',
      'andamento':'<span class="status-badge status-andamento">✏️ Em andamento</span>',
      'concluido':'<span class="status-badge status-concluido">✅ Concluído</span>',
    };
    const statusBadge = statusMap[item.status] || '';
    const mins = calcTempoEspera(item);
    const esperaHtml = (item.status==='aguardando' && mins!==null)
      ? `<span class="espera-timer${mins>=30?' alerta':''}" id="timer-${item.id}">⏱ ${formatarEspera(mins)}</span>`
      : '';

    const idade = pac.dtnasc ? calcIdade(pac.dtnasc) : '';
    const conv = item.convenio || pac.convenio || '';
    const selClass = WL_PACIENTE_SEL===item.id ? ' selecionado' : '';
    const critClass = (item.status==='aguardando' && mins!==null && mins>=30) ? ' espera-critica' : '';

    let botoesHtml = item.status==='concluido'
      ? `<button class="btn-ver-laudo" onclick="event.stopPropagation();abrirVerLaudo('${item.id}')">👁 Ver</button>`
      : `<button class="wl-card-btn" onclick="event.stopPropagation();abrirLaudoPaciente('${item.id}')">📋 Laudo</button>`;
    botoesHtml += `<button class="wl-card-btn danger" onclick="event.stopPropagation();removerDaFila('${item.id}')">🗑️</button>`;

    html += `<div class="wl-card${selClass}${critClass}" id="card-${item.id}" onclick="selecionarPacWL('${item.id}')">
      <div class="wl-card-top">
        <div class="wl-card-avatar">${iniciais}</div>
        <div class="wl-card-info">
          <div class="wl-card-nome">${escH(pac.nome)}</div>
          <div class="wl-card-meta">${idade?idade+' anos':''}${idade&&pac.cpf?' · ':''}${pac.cpf?'CPF '+escH(pac.cpf):''}${conv?' · '+escH(conv):''}</div>
        </div>
        <div class="wl-card-status">${statusBadge}</div>
      </div>
      <div class="wl-card-bottom">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="wl-card-hora">🕐 ${item.hora||'—'}</span>
          ${esperaHtml}
        </div>
        <div class="wl-card-actions">${botoesHtml}</div>
      </div>
    </div>`;
  });

  lista.innerHTML = html;
}

// ══ SELEÇÃO DE PACIENTE ══════════════════════════════════════════

function selecionarPacWL(itemId){
  WL_PACIENTE_SEL = itemId;
  wlRenderLista();
  const wl = getWorklist();
  const hist = getHistorico();
  const pacs = getPacientes();
  let item = wl.find(i=>i.id===itemId);
  if(!item) item = hist.find(i=>i.id===itemId);
  if(!item) return;
  const pac = pacs.find(p=>p.id===item.pacId);
  if(pac) renderPainelPaciente(pac, item);
}

function renderPainelPaciente(pac, item){
  const det = document.getElementById('wl-detalhe-col');
  if(!det) return;
  const iniciais = pac.nome.split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase();
  const idade = pac.dtnasc ? calcIdade(pac.dtnasc) : '—';
  const dtEx = item.dtexame ? new Date(item.dtexame+'T12:00').toLocaleDateString('pt-BR') : '—';

  const btnPrincipal = item.status==='concluido'
    ? `<button class="btn-iniciar-laudo" style="background:var(--P2);" onclick="abrirVerLaudo('${item.id}')">👁 Ver laudo</button>`
    : `<button class="btn-iniciar-laudo" onclick="abrirLaudoPaciente('${item.id}')">${item.status==='andamento'?'▶ Continuar laudo':'📋 Iniciar laudo'}</button>`;

  det.innerHTML = `<div class="wl-pac-painel">
    <div class="wl-pac-hdr">
      <div class="wl-pac-avatar-lg">${iniciais}</div>
      <div>
        <div class="wl-pac-nome-lg">${escH(pac.nome)}</div>
        <div class="wl-pac-meta-lg">${idade!=='—'?idade+' · ':''}${pac.cpf?'CPF '+escH(pac.cpf):'Sem CPF'}</div>
      </div>
    </div>
    <div class="wl-pac-body">
      <div style="padding:12px 16px;">
        <div class="wl-pac-row"><label>Data</label><span>${dtEx}${item.hora?' · '+item.hora:''}</span></div>
        <div class="wl-pac-row"><label>Convênio</label><span>${escH(item.convenio||pac.convenio||'—')}</span></div>
        <div class="wl-pac-row"><label>Solicitante</label><span>${escH(item.solicitante||'—')}</span></div>
        <div class="wl-pac-row"><label>Sexo</label><span>${pac.sexo==='M'?'Masculino':pac.sexo==='F'?'Feminino':'—'}</span></div>
      </div>
    </div>
    <div class="wl-pac-acoes">
      <button class="btn-editar-pac" onclick="editarPaciente('${item.id}')">✏️ Editar</button>
      ${btnPrincipal}
    </div>
  </div>`;
}

// ══ ABRIR LAUDO ══════════════════════════════════════════════════

function abrirLaudoPaciente(itemId){
  const wl = getWorklist();
  const pacs = getPacientes();
  const item = wl.find(i=>i.id===itemId);
  if(!item) return;
  const pac = pacs.find(p=>p.id===item.pacId);
  if(!pac) return;

  item.status = 'andamento';
  setWorklist(wl);
  lsSet('leo_item_ativo', itemId);

  document.getElementById('tela-clinica').classList.add('oculta');
  const tw = document.getElementById('tela-worklist');
  if(tw) tw.classList.remove('ativa');

  preencherFormularioComPaciente(pac, item);
  aplicarCoresClinica(WL_CLINICA_ATIVA);
  if(typeof applyConfig === 'function') applyConfig();
  if(typeof calc === 'function') calc();
}

function abrirLaudoVazio(){
  lsSet('leo_item_ativo', null);
  document.getElementById('tela-clinica').classList.add('oculta');
  const tw = document.getElementById('tela-worklist');
  if(tw) tw.classList.remove('ativa');
  document.querySelectorAll('#sec-id input, #sec-id select').forEach(el=>el.value='');
  const hoje = new Date().toISOString().split('T')[0];
  const dtEx = document.getElementById('dtexame'); if(dtEx) dtEx.value=hoje;
  aplicarCoresClinica(WL_CLINICA_ATIVA);
  if(typeof applyConfig === 'function') applyConfig();
  if(typeof calc === 'function') calc();
}

function abrirVerLaudo(itemId){
  showToast('👁 Visualizar laudo — será implementado na Fase E');
}

function preencherFormularioComPaciente(pac, item){
  const set = (id,v)=>{ const e=document.getElementById(id); if(e) e.value=v||''; };
  set('nome', pac.nome);
  set('dtnasc', pac.dtnasc||'');
  set('dtexame', item.dtexame||new Date().toISOString().split('T')[0]);
  set('convenio', item.convenio||pac.convenio||'');
  set('solicitante', item.solicitante||'');
  set('indicacao', item.indicacao||'');
  if(pac.sexo){ const el=document.getElementById('sexo'); if(el) el.value=pac.sexo; }
}

// ══ PACIENTES (CRUD) ═════════════════════════════════════════════

function abrirNovoPaciente(){
  WL_EDIT_ID = null;
  const titulo = document.getElementById('pac-modal-titulo');
  if(titulo) titulo.textContent = '➕ Novo Paciente';
  ['pac-nome','pac-cpf','pac-tel','pac-convenio','pac-solicitante','pac-hora'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const hoje = new Date().toISOString().split('T')[0];
  const dtEx = document.getElementById('pac-dtexame'); if(dtEx) dtEx.value=hoje;
  const sexo = document.getElementById('pac-sexo'); if(sexo) sexo.value='';
  const dtN = document.getElementById('pac-dtnasc'); if(dtN) dtN.value='';
  const ov = document.getElementById('pac-ov');
  if(ov) ov.classList.add('open');
  setTimeout(()=>document.getElementById('pac-nome')?.focus(), 100);
}

function editarPaciente(itemId){
  const wl = getWorklist();
  const pacs = getPacientes();
  const item = wl.find(i=>i.id===itemId);
  if(!item) return;
  const pac = pacs.find(p=>p.id===item.pacId);
  if(!pac) return;
  WL_EDIT_ID = itemId;
  const titulo = document.getElementById('pac-modal-titulo');
  if(titulo) titulo.textContent = '✏️ Editar Paciente';
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.value=v||''; };
  set('pac-nome', pac.nome);
  set('pac-cpf', pac.cpf);
  set('pac-tel', pac.tel);
  set('pac-dtnasc', pac.dtnasc);
  const sexo=document.getElementById('pac-sexo'); if(sexo) sexo.value=pac.sexo||'';
  set('pac-dtexame', item.dtexame);
  set('pac-hora', item.hora);
  set('pac-convenio', item.convenio||pac.convenio);
  set('pac-solicitante', item.solicitante);
  const ov = document.getElementById('pac-ov');
  if(ov) ov.classList.add('open');
}

function salvarPaciente(){
  const nome = document.getElementById('pac-nome')?.value?.trim();
  if(!nome){ alert('Nome obrigatório.'); return; }
  const cpf=document.getElementById('pac-cpf')?.value?.trim()||'';
  const dtnasc=document.getElementById('pac-dtnasc')?.value||'';
  const sexo=document.getElementById('pac-sexo')?.value||'';
  const tel=document.getElementById('pac-tel')?.value?.trim()||'';
  const dtexame=document.getElementById('pac-dtexame')?.value||new Date().toISOString().split('T')[0];
  const convenio=document.getElementById('pac-convenio')?.value?.trim()||'';
  const solicitante=document.getElementById('pac-solicitante')?.value?.trim()||'';
  let hora=document.getElementById('pac-hora')?.value||'';
  const chegadaTs=new Date().toISOString();
  if(!hora){const n=new Date();hora=n.getHours().toString().padStart(2,'0')+':'+n.getMinutes().toString().padStart(2,'0');}

  const pacs=getPacientes();
  const wl=getWorklist();

  if(WL_EDIT_ID){
    const item=wl.find(i=>i.id===WL_EDIT_ID);
    if(item){
      const pac=pacs.find(p=>p.id===item.pacId);
      if(pac){pac.nome=nome;pac.cpf=cpf;pac.dtnasc=dtnasc;pac.sexo=sexo;pac.tel=tel;}
      item.dtexame=dtexame;item.hora=hora;item.convenio=convenio;item.solicitante=solicitante;
    }
    setPacientes(pacs);setWorklist(wl);
    showToast('✅ Paciente atualizado!');
  } else {
    let pac=cpf?pacs.find(p=>p.cpf&&p.cpf.replace(/\D/g,'')===cpf.replace(/\D/g,'')):null;
    if(!pac){pac={id:uid(),nome,cpf,dtnasc,sexo,tel};pacs.push(pac);}
    setPacientes(pacs);
    const tipoExame = document.getElementById('pac-tipo-exame')?.value || 'eco_tt';
    const item={id:uid(),pacId:pac.id,clinicaId:WL_CLINICA_ATIVA?.id||'',clinicaNome:WL_CLINICA_ATIVA?.nome||'',dtexame,hora,chegadaTs,convenio,solicitante,tipoExame,status:'aguardando',laudoConc:[],laudoSnapshot:null,criadoEm:chegadaTs};
    wl.push(item);setWorklist(wl);
    showToast('✅ Paciente adicionado!');
  }
  fecharPacModal();
  wlRenderLista();
  if(typeof dashRenderWorklist==='function') dashRenderWorklist();
}

function fecharPacModal(){
  const ov=document.getElementById('pac-ov');
  if(ov) ov.classList.remove('open');
  WL_EDIT_ID=null;
}

function removerDaFila(itemId){
  if(!confirm('Remover paciente da fila?')) return;
  let wl=getWorklist();
  wl=wl.filter(i=>i.id!==itemId);
  setWorklist(wl);
  WL_PACIENTE_SEL=null;
  wlRenderLista();
  if(typeof dashRenderWorklist==='function') dashRenderWorklist();
  showToast('🗑️ Removido da fila');
}

// ══ HEADER E SELETOR DE CLÍNICA ═════════════════════════════════

function atualizarHeaderWorklist(){
  const cl=WL_CLINICA_ATIVA;
  if(!cl) return;
  const logo=document.getElementById('wl-logo-hdr');
  const nome=document.getElementById('wl-nome-hdr');
  const sub=document.getElementById('wl-sub-hdr');
  if(logo) logo.innerHTML=cl.logoB64?`<img src="${cl.logoB64}"/>`:'🏥';
  if(nome) nome.textContent=cl.nome;
  if(sub) sub.textContent=cl.slogan||'Worklist do dia';
}

function preencherSeletorClinica(){
  const sel=document.getElementById('wl-clinica-select');
  if(!sel) return;
  const cls=getClinicas();
  sel.innerHTML=cls.map((cl,i)=>`<option value="${i}" ${WL_CLINICA_ATIVA&&WL_CLINICA_ATIVA.id===cl.id?'selected':''}>${cl.nome}</option>`).join('');
}

function trocarClinicaSelect(idx){
  const cls=getClinicas();
  const cl=cls[parseInt(idx)];
  if(!cl) return;
  WL_CLINICA_ATIVA=cl;
  lsSet(CLINICA_ATIVA_KEY,cl);
  aplicarCoresClinica(cl);
  if(typeof applyConfig==='function') applyConfig();
  atualizarHeaderWorklist();
  WL_PACIENTE_SEL=null;
  wlRenderLista();
  showToast('📍 '+cl.nome);
}

function aplicarCoresClinica(cl){
  if(!cl) return;
  const r=document.documentElement.style;
  r.setProperty('--P1',cl.p1||'#1E3A5F');
  r.setProperty('--P2',cl.p2||'#2563EB');
  r.setProperty('--P1l',hexToLight(cl.p1||'#1E3A5F'));
  r.setProperty('--P2l',hexToLight(cl.p2||'#2563EB'));
  CFG.clinica=cl.nome;
  CFG.slogan=cl.slogan||'';
  CFG.logoB64=cl.logoB64||'';
  CFG.p1=cl.p1||'#1E3A5F';
  CFG.p2=cl.p2||'#2563EB';
}

// ══ TIMER DE ESPERA ══════════════════════════════════════════════

function iniciarTimerWL(){
  if(_wlTimerInterval) clearInterval(_wlTimerInterval);
  _wlTimerInterval=setInterval(atualizarTimersWL, 30000);
}

function atualizarTimersWL(){
  const wl=getWorklist();
  wl.forEach(item=>{
    if(item.status!=='aguardando') return;
    const mins=calcTempoEspera(item);
    const timerEl=document.getElementById('timer-'+item.id);
    if(timerEl){
      timerEl.textContent='⏱ '+formatarEspera(mins);
      timerEl.className='espera-timer'+(mins>=30?' alerta':'');
    }
    const card=document.getElementById('card-'+item.id);
    if(card) card.classList.toggle('espera-critica',mins>=30);
  });
}

function calcTempoEspera(item){
  if(!item.chegadaTs||item.status!=='aguardando') return null;
  return Math.floor((new Date()-new Date(item.chegadaTs))/60000);
}

function formatarEspera(mins){
  if(mins===null) return '';
  if(mins<1) return '< 1 min';
  if(mins<60) return mins+' min';
  const h=Math.floor(mins/60);
  const m=mins%60;
  return h+'h'+(m>0?m+'min':'');
}

// ══ MIGRAÇÃO E VALIDAÇÃO DIÁRIA ══════════════════════════════════

function verificarValidadeDiaria(){
  const hoje=new Date().toISOString().split('T')[0];
  const ultimaData=localStorage.getItem(LAST_WL_DATE_KEY);
  if(ultimaData===hoje) return;
  const wlAntigo=lsGet(WL_KEY)||[];
  if(wlAntigo.length>0){
    const hist=getHistorico();
    wlAntigo.forEach(item=>{
      if(item.status!=='concluido'){item.status='nao_realizado';item.arquivadoEm=new Date().toISOString();}
      hist.push(item);
    });
    setHistorico(hist);
    lsSet(WL_KEY,[]);
  }
  localStorage.setItem(LAST_WL_DATE_KEY,hoje);
}

function migrarDadosV25(){
  const oldWl=lsGet('leo_wl_v21');
  const newWl=lsGet(WL_KEY);
  const newHist=lsGet(HIST_KEY);
  if((newWl&&newWl.length>0)||(newHist&&newHist.length>0)) return;
  if(!oldWl||oldWl.length===0) return;
  const hoje=new Date().toISOString().split('T')[0];
  const wlNovo=[],histNovo=[];
  oldWl.forEach(item=>{
    if(item.status==='concluido'||(item.laudoConc&&item.laudoConc.length>0)){item.status='concluido';histNovo.push(item);}
    else if(item.dtexame===hoje){wlNovo.push(item);}
    else{item.status='nao_realizado';item.arquivadoEm=new Date().toISOString();histNovo.push(item);}
  });
  setWorklist(wlNovo);setHistorico(histNovo);
  setPacientes(lsGet('leo_pacientes_v21')||[]);
}

// ══ INIT ═════════════════════════════════════════════════════════

function initTelaClinica(){
  // V7: dashboard já cuida de tudo, apenas manter clínica padrão no localStorage
  const cls=getClinicas();
  if(!cls.length){
    const cl0={id:uid(),nome:CFG.clinica||'Consultório',end:CFG.medEnd||'',tel:CFG.medTel||'',slogan:CFG.slogan||'',logoB64:CFG.logoB64||'',p1:CFG.p1||'#1E3A5F',p2:CFG.p2||'#2563EB',valor:0,padrao:true};
    setClinicas([cl0]);
  }
  const clss=getClinicas();
  const padrao=clss.find(c=>c.padrao)||clss[0];
  if(padrao){WL_CLINICA_ATIVA=padrao;lsSet(CLINICA_ATIVA_KEY,padrao);}
  verificarValidadeDiaria();
  migrarDadosV25();
}

function appIniciado(){
  if(typeof loadConfig==='function') loadConfig();
  initTelaClinica();
  document.getElementById('tela-clinica').classList.remove('oculta');
  const hoje=new Date().toISOString().split('T')[0];
  const dtEx=document.getElementById('dtexame');
  if(dtEx&&!dtEx.value) dtEx.value=hoje;
  if(typeof calc==='function') calc();
}

console.log('%c🫀 LEO v7 — Worklist carregado','color:#2563EB;font-size:11px;');
