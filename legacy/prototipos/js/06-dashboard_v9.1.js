// ══════════════════════════════════════════════════════════════════
// LEO v7 · Módulo 06 — Dashboard
// Topbar, sidebar perfil, resumo billing, tabs worklist/historico/extrato
// ══════════════════════════════════════════════════════════════════

// ══ INIT DASHBOARD ═══════════════════════════════════════════════

function initDashboard(){
  const ws   = _fbWorkspace;
  const mem  = _fbMembership;
  const prof = _fbProfile;
  const isPJ = ws?.tipo === 'PJ';
  const isMaster = mem?.role === 'master';
  const isSA = _isSuperAdmin || EMAILS_DONO.includes((_fbUser?.email||'').toLowerCase());

  console.log('Dashboard init:', {ws:ws?.id, tipo:ws?.tipo, role:mem?.role, nome:prof?.nome, sa:isSA});

  // ── TOPBAR ──
  const topNome = document.getElementById('dash-topbar-nome');
  const topSub  = document.getElementById('dash-topbar-sub');
  const topLocalNome = document.getElementById('dash-topbar-local-nome');

  if(isPJ){
    if(topNome) topNome.textContent = ws.nomeClinica || 'Clínica';
    if(topSub) topSub.textContent = (mem?.role||'') + ' · ' + (ws.cnpj||'');
    if(topLocalNome) topLocalNome.textContent = prof?.nome || 'Médico';
    const topLocalLabel = document.getElementById('dash-topbar-local-label');
    if(topLocalLabel) topLocalLabel.textContent = 'Profissional';
  } else {
    if(topNome) topNome.textContent = prof?.nome || CFG.medNome || 'Profissional';
    if(topSub){
      if(prof?.tipoPerfil === 'assistente') topSub.textContent = 'Assistente';
      else topSub.textContent = 'CRM/' + (prof?.ufCrm||CFG.medUf||'') + ' ' + (prof?.crm||CFG.medCrm||'');
    }
    if(topLocalNome) topLocalNome.textContent = ws?.nomeClinica || CFG.clinica || 'Consultório';
  }

  // Botões condicionais
  const btnEquipe = document.getElementById('dash-btn-equipe');
  if(btnEquipe) btnEquipe.style.display = (isPJ && isMaster) ? 'inline-block' : 'none';
  const btnAdmin = document.getElementById('dash-btn-admin');
  if(btnAdmin) btnAdmin.style.display = isSA ? 'inline-block' : 'none';

  // ── SIDEBAR ──
  const nome  = prof?.nome || CFG.medNome || '';
  const crm   = prof?.crm || CFG.medCrm || '';
  const ufCrm = prof?.ufCrm || CFG.medUf || '';
  const rqe   = prof?.rqe || '';
  const esp   = prof?.especialidade || CFG.medTitulo || '';
  const cpf   = prof?.cpf || '';
  const email = prof?.email || _fbUser?.email || '';

  const initials = nome.split(' ').filter(p=>p).map(p=>p[0]).join('').substring(0,2).toUpperCase() || 'U';
  const el = (id) => document.getElementById(id);

  if(el('dash-avatar')) el('dash-avatar').textContent = initials;
  if(el('dash-sb-nome')) el('dash-sb-nome').textContent = nome;
  const ehAssist = prof?.tipoPerfil === 'assistente';
  const isMasterRole = mem?.role === 'master';

  // Sidebar: só nome + tipo + email
  const tipoLabel = isMasterRole ? 'Master' : (ehAssist ? 'Assistente' : 'Médico');
  if(el('dash-sb-tipo-badge')) el('dash-sb-tipo-badge').textContent = tipoLabel;
  if(el('dash-sb-email-top')) el('dash-sb-email-top').textContent = email;

  // Assinatura
  if(el('dash-sig-nome')) el('dash-sig-nome').textContent = ehAssist ? '' : nome;
  if(el('dash-sig-crm')) el('dash-sig-crm').textContent = ehAssist ? '' : ('CRM/' + ufCrm + ' ' + crm);

  // Ajuste 2: Locais de trabalho — só nome
  const sbLocais = el('dash-sb-locais');
  if(sbLocais){
    sbLocais.innerHTML = '';
    const cls = typeof getClinicas === 'function' ? getClinicas() : [];
    cls.forEach(cl=>{
      const div = document.createElement('div');
      div.className = 'dash-sb-local';
      div.style.cursor = 'pointer';
      div.onclick = ()=>{ if(typeof abrirLocalModal==='function') abrirLocalModal(cl.id); };
      div.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:12px;font-weight:700;color:#1E293B;">${escH(cl.nome||'Local')}</div>
        <span style="font-size:8px;background:#DBEAFE;color:#1E40AF;padding:2px 6px;border-radius:4px;font-weight:700;">PF</span>
      </div>`;
      sbLocais.appendChild(div);
    });
    if(_fbContextos){
      _fbContextos.forEach(ctx=>{
        const w = ctx.workspace;
        if(!w || w.tipo !== 'PJ') return;
        const div = document.createElement('div');
        div.className = 'dash-sb-local';
        div.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:12px;font-weight:700;color:#1E293B;">${escH(w.nomeClinica||'PJ')}</div>
          <span style="font-size:8px;background:#EDE9FE;color:#5B21B6;padding:2px 6px;border-radius:4px;font-weight:700;">PJ</span>
        </div>`;
        sbLocais.appendChild(div);
      });
    }
  }

  // Seção assistentes: esconder se for assistente
  const secAssist = el('dash-sb-sec-assistentes');
  if(secAssist) secAssist.style.display = ehAssist ? 'none' : 'block';

  // Ajuste 4: Seletor de local na topbar
  const topLocalSel = el('dash-topbar-local-select');
  if(topLocalSel){
    const cls = typeof getClinicas === 'function' ? getClinicas() : [];
    topLocalSel.innerHTML = '';
    cls.forEach((cl,i)=>{
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = cl.nome || 'Local '+(i+1);
      if(WL_CLINICA_ATIVA && WL_CLINICA_ATIVA.id === cl.id) opt.selected = true;
      topLocalSel.appendChild(opt);
    });
  }

  // ── RESUMO BILLING ──
  dashAtualizarResumo();

  // ── WORKLIST ──
  dashRenderWorklist();

  // ── DATAS PADRÃO ──
  const hoje = new Date();
  const primDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  if(el('dash-ext-de')) el('dash-ext-de').value = primDia.toISOString().split('T')[0];
  if(el('dash-ext-ate')) el('dash-ext-ate').value = hoje.toISOString().split('T')[0];
  if(el('dash-hist-de')) el('dash-hist-de').value = new Date(hoje.getTime()-90*864e5).toISOString().split('T')[0];
  if(el('dash-hist-ate')) el('dash-hist-ate').value = hoje.toISOString().split('T')[0];
}

// ══ RESUMO BILLING ═══════════════════════════════════════════════

async function dashAtualizarResumo(){
  let sub = _fbSubscription;
  if(!sub && _fbWorkspace?.id){
    sub = await fsGetSubscription(_fbWorkspace.id);
    if(sub) _fbSubscription = sub;
  }

  const el = (id) => document.getElementById(id);

  if(!sub){
    if(el('dash-plano-tipo')) el('dash-plano-tipo').textContent = 'Sem plano';
    if(el('dash-plano-renova')) el('dash-plano-renova').textContent = '—';
    if(el('dash-franquia-valor')) el('dash-franquia-valor').textContent = '0';
    return;
  }

  const tipo = sub.tipo === 'trial' ? 'Trial' : 'Pro';
  const fim = sub.cicloFim?.toDate ? sub.cicloFim.toDate() : (sub.cicloFim ? new Date(sub.cicloFim) : null);
  const renovaTxt = fim ? fim.toLocaleDateString('pt-BR') : '—';
  const franqTotal = sub.franquiaMensal || 0;
  const franqUsada = sub.franquiaUsada || 0;
  const restam = Math.max(0, franqTotal - franqUsada);
  const pct = franqTotal > 0 ? Math.round((franqUsada/franqTotal)*100) : 0;

  if(el('dash-plano-tipo')) el('dash-plano-tipo').textContent = tipo;
  if(el('dash-plano-renova')) el('dash-plano-renova').textContent = 'Renova em ' + renovaTxt;
  if(el('dash-franquia-valor')) el('dash-franquia-valor').innerHTML = franqUsada + ' <span style="font-size:13px;color:#94A3B8;font-weight:500;">/ ' + franqTotal + '</span>';
  if(el('dash-franquia-sub')) el('dash-franquia-sub').textContent = 'Restam ' + restam + ' laudos';
  if(el('dash-franquia-barra')) el('dash-franquia-barra').style.width = pct + '%';
  if(el('dash-creditos')) el('dash-creditos').textContent = sub.creditosExtras || 0;
}

// ══ TABS ═════════════════════════════════════════════════════════

function dashTab(tab, btnEl){
  document.querySelectorAll('.dash-tab').forEach(t=>t.classList.remove('ativa'));
  document.querySelectorAll('.dash-section').forEach(s=>s.classList.remove('ativa'));
  if(btnEl) btnEl.classList.add('ativa');
  const sec = document.getElementById('dash-sec-'+tab);
  if(sec) sec.classList.add('ativa');
}

// ══ WORKLIST NO DASHBOARD ════════════════════════════════════════

function dashRenderWorklist(busca){
  const wl = getWorklist();
  const lista = document.getElementById('dash-wl-lista');
  if(!lista) return;

  const pacs = getPacientes();
  const filtro = (busca||'').toLowerCase();
  const items = filtro ? wl.filter(it=>{
    const pac = pacs.find(p=>p.id===it.pacId);
    const n = pac?.nome || it.nome || '';
    const c = pac?.cpf || it.cpf || '';
    return n.toLowerCase().includes(filtro) || c.replace(/\D/g,'').includes(filtro.replace(/\D/g,''));
  }) : wl;

  // Badge
  const badge = document.getElementById('dash-wl-badge');
  if(badge) badge.textContent = wl.filter(it=>it.status!=='emitido'&&it.status!=='concluido').length;

  if(!items.length){
    lista.innerHTML = '<div style="text-align:center;padding:40px;color:#94A3B8;font-size:13px;"><span style="font-size:32px;display:block;margin-bottom:8px;">📋</span>Nenhum paciente na fila hoje</div>';
    return;
  }

  let html = `<div class="dash-lista-hdr">
    <span style="width:55px;">Hora</span>
    <span style="flex:1;">Paciente</span>
    <span style="width:100px;">Convênio</span>
    <span style="width:220px;text-align:right;">Ações</span>
  </div>`;

  items.forEach(it=>{
    const pac = pacs.find(p=>p.id===it.pacId);
    const hora = it.horarioChegada || it.hora || '—';
    const nome = pac?.nome || it.nome || 'Paciente';
    const idade = pac?.dtnasc ? calcIdade(pac.dtnasc) : (it.dtnasc ? calcIdade(it.dtnasc) : '');
    const cpfMask = (pac?.cpf||it.cpf) ? '***'+(pac?.cpf||it.cpf).substring(3,6)+'**' : '';
    const conv = it.convenio || pac?.convenio || '—';
    const tipoExMap = {'eco_tt':'ECO TT','doppler_carotidas':'Carótidas','eco_te':'ECO TE','eco_stress':'Stress'};
    const tipoEx = tipoExMap[it.tipoExame] || it.tipoExame || '';
    const status = it.status || 'aguardando';
    const stMap = {
      aguardando:{cls:'dash-st-aguardando',txt:'Aguardando'},
      rascunho:{cls:'dash-st-rascunho',txt:'Rascunho'},
      andamento:{cls:'dash-st-andamento',txt:'Em andamento'},
      emitido:{cls:'dash-st-emitido',txt:'Emitido'},
      concluido:{cls:'dash-st-emitido',txt:'Concluído'},
    };
    const st = stMap[status] || stMap.aguardando;

    const podeLaudar = _fbProfile?.tipoPerfil !== 'assistente';
    let acoes = '';
    if(status==='aguardando'||status==='rascunho'){
      if(podeLaudar) acoes += `<button class="dash-btn dash-btn-primary" onclick="dashAbrirLaudo('${it.id}')">📋 Laudar</button>`;
      acoes += `<button class="dash-btn" onclick="dashEditarPaciente('${it.id}')">👤 Editar</button>`;
      acoes += `<button class="dash-btn" style="color:#EF4444;" onclick="removerDaFila('${it.id}')">🗑</button>`;
    } else if(status==='andamento'){
      if(podeLaudar) acoes += `<button class="dash-btn dash-btn-primary" onclick="dashAbrirLaudo('${it.id}')">▶ Continuar</button>`;
      acoes += `<button class="dash-btn" onclick="dashEditarPaciente('${it.id}')">👤 Editar</button>`;
    } else {
      acoes += `<button class="dash-btn" onclick="dashVerLaudo('${it.id}')">👁 Ver</button>`;
      acoes += `<button class="dash-btn dash-btn-success" onclick="dashImprimirLaudo('${it.id}')">🖨 Imprimir</button>`;
      if(podeLaudar) acoes += `<button class="dash-btn dash-btn-warn" onclick="dashAbrirLaudo('${it.id}')">✏ Editar</button>`;
      acoes += `<button class="dash-btn" onclick="dashEnviarLaudo('${it.id}')">📧</button>`;
    }

    // Origem: manual ou Feegow
    const origem = it.feegowAppointId
      ? '<span style="font-size:8px;background:#DBEAFE;color:#1E40AF;padding:1px 5px;border-radius:3px;font-weight:600;margin-left:4px;">FEEGOW</span>'
      : '<span style="font-size:8px;background:#F3F4F6;color:#6B7280;padding:1px 5px;border-radius:3px;font-weight:600;margin-left:4px;">MANUAL</span>';

    html += `<div class="dash-lista-row">
      <span style="width:55px;font-weight:600;color:#64748B;">${escH(hora)}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;color:#1E293B;">${escH(nome)} <span class="dash-status ${st.cls}">${st.txt}</span></div>
        <div style="font-size:11px;color:#94A3B8;">${tipoEx?'<span style="color:#2563EB;font-weight:600;">'+tipoEx+'</span> · ':''}${idade?idade+' anos':''}${cpfMask?' · CPF '+cpfMask:''} · ${origem}</div>
      </div>
      <span style="width:100px;font-size:12px;color:#64748B;">${escH(conv)}</span>
      <div style="width:220px;display:flex;gap:4px;flex-wrap:nowrap;justify-content:flex-end;">${acoes}</div>
    </div>`;
  });

  lista.innerHTML = html;
}

function dashFiltrarWorklist(){
  dashRenderWorklist(document.getElementById('dash-wl-busca')?.value||'');
}

// ══ AÇÕES DO WORKLIST ════════════════════════════════════════════

// dashAbrirLaudo, dashVerLaudo, dashImprimirLaudo → definidos em 11-laudo-ui.js
function dashEnviarLaudo(itemId){
  showToast('📧 Enviar — será implementado na próxima fase');
}
function dashEditarPaciente(itemId){
  if(typeof editarPaciente === 'function') editarPaciente(itemId);
  else showToast('⚠ Função não disponível');
}

// ══ EXTRATO ══════════════════════════════════════════════════════

function dashGerarExtrato(){
  const de  = document.getElementById('dash-ext-de')?.value;
  const ate = document.getElementById('dash-ext-ate')?.value;
  const el  = document.getElementById('dash-ext-resultado');
  if(!el) return;
  el.innerHTML = `<div style="text-align:center;padding:40px;color:#94A3B8;font-size:13px;">
    <span style="font-size:32px;display:block;margin-bottom:8px;">🔧</span>
    Extrato será implementado na Etapa 5 (Billing).<br>Período: ${escH(de)} a ${escH(ate)}
  </div>`;
}

console.log('%c🫀 LEO v7 — Dashboard carregado','color:#2563EB;font-size:11px;');
