// ══════════════════════════════════════════════════════════════════
// LEO v7 · Módulo 05 — Autenticação
// Login, cadastro PF/PJ, completar perfil, convites, logout
// ══════════════════════════════════════════════════════════════════

// ── Emails do dono do sistema (superadmin) ──
const EMAILS_DONO = ['sergio_abdon@yahoo.com.br'];

// ══ ONBOARDING PF ════════════════════════════════════════════════

async function onboardingPF(email, senha, nome, crm, especialidade, tipoPerfil='medico', ufCrm=''){
  try{
    const cred = await fbAuth.createUserWithEmailAndPassword(email, senha);
    const uid  = cred.user.uid;
    await cred.user.sendEmailVerification();

    await fsCreateProfile(uid, {
      nome, crm: crm||'', ufCrm: ufCrm||'',
      especialidade: especialidade||'', email,
      tipoPerfil: tipoPerfil
    });

    const wsId = await fsCreateWorkspace({
      ownerUid: uid, tipo: 'PF',
      nomeClinica: nome, corPrimaria: '#1565C0', rodape: ''
    });

    const papel = tipoPerfil === 'assistente' ? 'assistente' : 'medico';
    await fsCreateMembership(uid, wsId, papel, 'ativo');
    await fsCreateSubscription(wsId, 'trial', 100);
    await fsLog('cadastro', { uid, wsId, tipo:'PF' });
    await fbAuth.signOut();

    return { ok:true, uid, wsId };
  }catch(e){
    console.error('onboardingPF:',e);
    return { ok:false, erro: e.code||e.message };
  }
}

// ══ ONBOARDING PJ ════════════════════════════════════════════════

async function onboardingPJ(dadosEmpresa, dadosMaster){
  try{
    const cnpjNorm = dadosEmpresa.cnpj.replace(/\D/g,'');
    const cpfNorm  = dadosMaster.cpf.replace(/\D/g,'');

    const empExist = await fsGetEmpresaByCNPJ(cnpjNorm);
    if(empExist) return { ok:false, erro:'cnpj-duplicado' };

    let prof = await fsGetProfissionalByCPF(cpfNorm);
    let uid;

    if(prof && prof.contaCriada !== false){
      uid = prof.uid;
    } else {
      const cred = await fbAuth.createUserWithEmailAndPassword(dadosMaster.email, dadosMaster.senha);
      uid = cred.user.uid;
      await cred.user.sendEmailVerification();
      await fsCreateProfile(uid, {
        nome: dadosMaster.nome, email: dadosMaster.email, cpf: cpfNorm,
        crm: dadosMaster.crm || '', ufCrm: dadosMaster.ufCrm || '',
        especialidade: dadosMaster.especialidade || '',
      });
    }

    const empId = await fsCreateEmpresa({
      cnpj: cnpjNorm, razaoSocial: dadosEmpresa.razaoSocial,
      nomeFantasia: dadosEmpresa.nomeFantasia, tipo: 'clinica',
      masterUid: uid, telefone: dadosEmpresa.telefone || '',
      endereco: dadosEmpresa.endereco || '',
    });
    if(!empId) return { ok:false, erro:'erro-empresa' };

    const wsId = await fsCreateWorkspace({
      ownerUid: uid, tipo: 'PJ', empresaId: empId,
      nomeClinica: dadosEmpresa.nomeFantasia || dadosEmpresa.razaoSocial,
      corPrimaria: '#1E3A5F', rodape: dadosEmpresa.endereco || '',
    });
    if(!wsId) return { ok:false, erro:'erro-workspace' };

    await fsCreateMembership(uid, wsId, 'master', 'ativo', {
      profissionalId: uid, empresaId: empId,
    });
    await fsCreateSubscription(wsId, 'trial', 100);
    await fsLog('cadastro', { uid, wsId, empId, tipo:'PJ', cnpj:cnpjNorm });

    if(!prof || prof.contaCriada === false) await fbAuth.signOut();

    return { ok:true, uid, wsId, empId };
  }catch(e){
    console.error('onboardingPJ:',e);
    return { ok:false, erro: e.code||e.message };
  }
}

// ══ LOGIN ════════════════════════════════════════════════════════

async function loginFirebase(email, senha){
  try{
    const cred = await fbAuth.signInWithEmailAndPassword(email, senha);
    if(!cred.user.emailVerified){
      await fbAuth.signOut();
      return { ok:false, erro: 'email-nao-verificado' };
    }
    return { ok:true, user: cred.user };
  }catch(e){
    return { ok:false, erro: e.code };
  }
}

async function resolverContextos(uid){
  const memberships = await fsGetMemberships(uid);
  if(!memberships.length) return [];
  const contextos = await Promise.all(memberships.map(async mem=>{
    const ws  = await fsGetWorkspace(mem.workspaceId);
    const sub = await fsGetSubscription(mem.workspaceId);
    return { membership: mem, workspace: ws, subscription: sub };
  }));
  return contextos.filter(c=>c.workspace);
}

// ══ SELECIONAR CONTEXTO ══════════════════════════════════════════

async function selecionarContexto(ctx){
  _fbWorkspace    = ctx.workspace;
  _fbMembership   = ctx.membership;
  _fbSubscription = ctx.subscription;

  document.getElementById('ctx-overlay').classList.remove('open');

  // Branding (protegido contra erro)
  try{ aplicarBrandingWorkspace(ctx.workspace); }
  catch(e){ console.warn('Branding erro ignorado:',e); }

  // Botão convidar (só master PJ)
  const btnConv = document.getElementById('btn-convidar');
  if(btnConv) btnConv.style.display = (ctx.membership.role === 'master' && ctx.workspace.tipo === 'PJ') ? 'inline-block' : 'none';

  // Worklist listener
  iniciarWorklistFirebase(ctx.workspace.id);

  // Session badge
  const sbNome = document.getElementById('sb-nome');
  if(sbNome) sbNome.textContent = (_fbProfile?.nome || 'Usuário').split(' ')[0];
  const sbBadge = document.getElementById('session-badge');
  if(sbBadge) sbBadge.style.display = 'flex';

  // Iniciar sistema
  appIniciado();

  // Dashboard (com delay para garantir que DOM está pronto)
  setTimeout(()=>{
    try{ initDashboard(); }
    catch(e){ console.error('Erro initDashboard:',e); }
  }, 300);

  await fsLog('login_contexto', { wsId: ctx.workspace.id, role: ctx.membership.role });
}

function aplicarBrandingWorkspace(ws){
  if(!ws) return;
  try{
    const cfg = { ...loadConfigLocal() };
    if(ws.nomeClinica) cfg.clinica = ws.nomeClinica;
    if(ws.corPrimaria) cfg.p1 = ws.corPrimaria;
    if(ws.rodape)      cfg.medEnd = ws.rodape;
    if(ws.logoUrl)     cfg.logoB64 = ws.logoUrl;
    if(!cfg.p1) cfg.p1 = '#1E3A5F';
    if(!cfg.p2) cfg.p2 = '#2563EB';
    applyConfig(cfg);
  }catch(e){ console.warn('aplicarBrandingWorkspace:',e); }
}

function loadConfigLocal(){
  try{ const s=localStorage.getItem('leo_cfg_v1'); return s?JSON.parse(s):{}; }catch(e){ return {}; }
}

function iniciarWorklistFirebase(wsId){
  fsListenWorklist(wsId, (items)=>{
    // Preservar laudoSnapshot local ao receber dados do Firestore
    var wlLocal = getWorklist();
    items.forEach(function(item){
      var local = wlLocal.find(function(l){ return l.id === item.id; });
      if(local && local.laudoSnapshot && !item.laudoSnapshot){
        item.laudoSnapshot = local.laudoSnapshot;
      }
    });
    setWorklist(items);
    if(document.getElementById('tela-worklist')?.classList.contains('ativa')){
      if(typeof wlRenderLista === 'function') wlRenderLista();
    }
    if(!document.getElementById('tela-clinica')?.classList.contains('oculta')){
      if(typeof dashRenderWorklist === 'function') dashRenderWorklist();
    }
  });
}

// ══ SELETOR DE CONTEXTOS ═════════════════════════════════════════

async function mostrarSeletorContextos(profile, contextos){
  _fbContextos = contextos;
  const elNome = document.getElementById('ctx-nome-medico');
  if(elNome) elNome.textContent = profile.nome;

  const cards = document.getElementById('ctx-cards');
  cards.innerHTML = '';

  // Convites pendentes
  const convites = await fsGetConvitesPendentes(_fbUser.uid);
  if(convites.length){
    const hdr = document.createElement('div');
    hdr.style.cssText = 'width:100%;font-size:12px;font-weight:700;color:#F59E0B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;padding:0 4px;';
    hdr.textContent = '📩 Convites pendentes ('+convites.length+')';
    cards.appendChild(hdr);

    for(const conv of convites){
      const ws = await fsGetWorkspace(conv.workspaceId);
      const emp = conv.empresaId ? await fsGetEmpresa(conv.empresaId) : null;
      const cCard = document.createElement('div');
      cCard.className = 'ctx-card pj-card';
      cCard.style.cssText = 'border:2px dashed #F59E0B;background:#FFFBEB;cursor:default;';
      cCard.innerHTML = `
        <span class="ctx-card-icon">📩</span>
        <div class="ctx-card-nome">${escH(ws?.nomeClinica || 'Clínica')}</div>
        <div class="ctx-card-tipo">${escH(emp?.nomeFantasia || emp?.razaoSocial || '')} — ${escH(conv.role||conv.papel||'médico')}</div>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button onclick="aceitarConviteUI('${conv.id}')" style="flex:1;padding:8px;background:#22C55E;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">Aceitar</button>
          <button onclick="recusarConviteUI('${conv.id}')" style="flex:1;padding:8px;background:#EF4444;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">Recusar</button>
        </div>`;
      cards.appendChild(cCard);
    }
  }

  if(!contextos.length && !convites.length){
    document.getElementById('ctx-overlay').classList.remove('open');
    const semCtx = document.getElementById('sem-ctx');
    if(semCtx) semCtx.classList.add('show');
    return;
  }

  if(contextos.length === 1 && !convites.length){
    selecionarContexto(contextos[0]);
    return;
  }

  if(contextos.length){
    const hdr = document.createElement('div');
    hdr.style.cssText = 'width:100%;font-size:12px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.5px;margin:12px 0 8px;padding:0 4px;';
    hdr.textContent = 'Seus ambientes';
    cards.appendChild(hdr);
  }

  contextos.forEach(ctx=>{
    const ws=ctx.workspace, sub=ctx.subscription, mem=ctx.membership;
    const agora=new Date();
    const fim=sub?.cicloFim?.toDate?sub.cicloFim.toDate():null;
    const ok=fim&&agora<=fim;
    const stCls=ok?'st-ativo':'st-expirou';
    const stTxt=ok?(sub.tipo==='trial'?'⏱ Trial ativo':'✓ Plano ativo'):'⚠ Expirado';
    const icon=mem.role==='master'?'👑':ws.tipo==='PF'?'🩺':'🏥';
    const tipo=mem.role==='master'?'Administrador':ws.tipo==='PF'?'Consultório próprio':'Clínica — '+mem.role;

    const card=document.createElement('div');
    card.className='ctx-card '+(ws.tipo==='PF'?'pf-card':'pj-card');
    card.innerHTML=`
      <span class="ctx-card-icon">${icon}</span>
      <div class="ctx-card-nome">${escH(ws.nomeClinica||ws.tipo)}</div>
      <div class="ctx-card-tipo">${tipo}</div>
      <span class="ctx-card-status ${stCls}">${stTxt}</span>`;
    card.onclick=()=>selecionarContexto(ctx);
    cards.appendChild(card);
  });

  document.getElementById('ctx-loading').style.display='none';
  document.getElementById('ctx-conteudo').style.display='block';
}

async function carregarContextosComConvites(uid){
  const contextos = await resolverContextos(uid);
  if(!contextos.length){
    const wsId = await fsCreateWorkspace({
      ownerUid: uid, tipo:'PF', nomeClinica: _fbProfile.nome,
      corPrimaria:'#1565C0', rodape:''
    });
    await fsCreateMembership(uid, wsId, 'medico', 'ativo');
    await fsCreateSubscription(wsId, 'trial', 100);
    const novos = await resolverContextos(uid);
    mostrarSeletorContextos(_fbProfile, novos);
  } else {
    mostrarSeletorContextos(_fbProfile, contextos);
  }
}

// ══ COMPLETAR PERFIL ═════════════════════════════════════════════

function mostrarCompletarPerfil(){
  document.getElementById('ctx-loading').style.display='none';
  document.getElementById('ctx-conteudo').style.display='none';

  let cp = document.getElementById('completar-perfil-box');
  if(!cp){
    cp = document.createElement('div');
    cp.id = 'completar-perfil-box';
    cp.style.cssText = 'max-width:440px;margin:30px auto;background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.18);overflow:hidden;font-family:"IBM Plex Sans",sans-serif;';
    const n=_fbProfile?.nome||'', c=_fbProfile?.crm||'', u=_fbProfile?.ufCrm||'', r=_fbProfile?.rqe||'', e=_fbProfile?.especialidade||'';
    cp.innerHTML = `
      <div style="background:linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%);padding:20px 24px;text-align:center;">
        <span style="font-size:32px;">📋</span>
        <h2 style="margin:6px 0 2px;font-size:17px;color:#fff;font-weight:700;">Complete seu perfil</h2>
        <p style="font-size:11px;color:rgba(255,255,255,.7);margin:0;">Precisamos dos seus dados para identificá-lo no sistema.</p>
      </div>
      <div style="padding:20px 24px;">
        <div class="auth-msg erro" id="cp-error" style="display:none;"><span>⚠️</span><span id="cp-error-msg"></span></div>
        <div style="margin-bottom:10px;"><label style="font-size:12px;font-weight:600;color:#374151;">Nome completo <span style="color:#EF4444;">*</span></label><input type="text" id="cp-nome" placeholder="Dr. Nome Sobrenome" value="${escH(n)}" spellcheck="false" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;color:#111827;background:#F9FAFB;outline:none;margin-top:4px;"/></div>
        <div style="margin-bottom:10px;"><label style="font-size:12px;font-weight:600;color:#374151;">CPF <span style="color:#EF4444;">*</span></label><input type="text" id="cp-cpf" placeholder="000.000.000-00" maxlength="14" oninput="mascaraCPFInput(this)" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;color:#111827;background:#F9FAFB;outline:none;margin-top:4px;"/></div>
        <div style="display:flex;gap:10px;margin-bottom:10px;"><div style="flex:1;"><label style="font-size:12px;font-weight:600;color:#374151;">CRM <span style="color:#EF4444;">*</span></label><input type="text" id="cp-crm" placeholder="0000" value="${escH(c)}" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;color:#111827;background:#F9FAFB;outline:none;margin-top:4px;"/></div><div style="flex:0 0 80px;"><label style="font-size:12px;font-weight:600;color:#374151;">UF <span style="color:#EF4444;">*</span></label><input type="text" id="cp-uf" placeholder="PA" maxlength="2" value="${escH(u)}" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;color:#111827;background:#F9FAFB;outline:none;margin-top:4px;text-transform:uppercase;"/></div></div>
        <div style="display:flex;gap:10px;margin-bottom:10px;"><div style="flex:1;"><label style="font-size:12px;font-weight:600;color:#374151;">Especialidade</label><input type="text" id="cp-esp" placeholder="Ex: Cardiologia" value="${escH(e)}" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;color:#111827;background:#F9FAFB;outline:none;margin-top:4px;"/></div><div style="flex:1;"><label style="font-size:12px;font-weight:600;color:#374151;">RQE <span style="color:#9CA3AF;font-weight:400;">(opcional)</span></label><input type="text" id="cp-rqe" placeholder="0000" value="${escH(r)}" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #D1D5DB;border-radius:8px;font-size:14px;font-family:inherit;color:#111827;background:#F9FAFB;outline:none;margin-top:4px;"/></div></div>
        <button id="btn-completar-perfil" onclick="salvarCompletarPerfil()" style="width:100%;padding:13px;background:linear-gradient(135deg,#2563EB,#1D4ED8);color:#fff;border:none;border-radius:9px;font-size:14px;font-weight:700;cursor:pointer;margin-top:6px;box-shadow:0 4px 14px rgba(37,99,235,.3);">Salvar e continuar</button>
      </div>`;
    document.getElementById('ctx-overlay').appendChild(cp);
  }
  cp.style.display = 'block';
}

async function salvarCompletarPerfil(){
  const nome=document.getElementById('cp-nome').value.trim();
  const cpf=document.getElementById('cp-cpf').value.trim();
  const crm=document.getElementById('cp-crm')?.value?.trim()||'';
  const uf=document.getElementById('cp-uf').value.trim().toUpperCase();
  const esp=document.getElementById('cp-esp')?.value?.trim()||'';
  const rqe=document.getElementById('cp-rqe').value.trim();
  const errEl=document.getElementById('cp-error');
  const errMsg=document.getElementById('cp-error-msg');
  const btn=document.getElementById('btn-completar-perfil');

  errEl.style.display='none';
  if(!nome){ errMsg.textContent='Preencha o nome completo.'; errEl.style.display='flex'; return; }
  if(!cpf||!validarCPF(cpf)){ errMsg.textContent='CPF inválido.'; errEl.style.display='flex'; return; }
  if(!crm||!uf){ errMsg.textContent='CRM e UF são obrigatórios.'; errEl.style.display='flex'; return; }

  const cpfNorm=cpf.replace(/\D/g,'');
  const profExist=await fsGetProfissionalByCPF(cpfNorm);
  if(profExist && profExist.uid !== _fbUser.uid){
    errMsg.textContent='Este CPF já está vinculado a outra conta.';
    errEl.style.display='flex'; return;
  }

  btn.disabled=true; btn.textContent='Salvando...';
  await fsUpdateProfile(_fbUser.uid,{nome,cpf:cpfNorm,crm,ufCrm:uf,especialidade:esp,rqe});
  _fbProfile = await fsGetProfile(_fbUser.uid);

  const cp=document.getElementById('completar-perfil-box');
  if(cp) cp.style.display='none';
  btn.disabled=false; btn.textContent='Salvar e continuar';

  await carregarContextosComConvites(_fbUser.uid);
}

// ══ UI: SELETOR, LOGIN, CADASTRO ═════════════════════════════════

function selecionarPerfil(tipo){
  document.getElementById('tela-seletor').style.display='none';
  if(tipo==='usuario'){
    document.getElementById('card-usuario').style.display='block';
    setTimeout(()=>document.getElementById('login-email')?.focus(),100);
  } else if(tipo==='empresa'){
    document.getElementById('card-empresa').style.display='block';
    setTimeout(()=>document.getElementById('pj-cnpj')?.focus(),100);
  }
}

function voltarSeletor(){
  document.getElementById('card-usuario').style.display='none';
  const ce=document.getElementById('card-empresa'); if(ce) ce.style.display='none';
  document.getElementById('tela-seletor').style.display='flex';
  ['login-email','login-pass','pj-cnpj','pj-razao','pj-fantasia','pj-tel','pj-end','pj-cpf','pj-nome','pj-crm','pj-uf','pj-email','pj-pass','pj-pass2'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  ocultarMsgLogin();
}

function mostrarMsgLogin(tipo,txt){
  const el=document.getElementById('login-error');
  const msg=document.getElementById('login-error-msg');
  if(msg) msg.textContent=txt;
  if(el) el.className='auth-msg '+tipo+' show';
}
function ocultarMsgLogin(){
  const el=document.getElementById('login-error');
  if(el) el.classList.remove('show');
}

async function tentarLogin(){
  const email=document.getElementById('login-email').value.trim().toLowerCase();
  const pass=document.getElementById('login-pass').value;
  const btn=document.getElementById('btn-login');
  ocultarMsgLogin();
  if(!email||!pass){ mostrarMsgLogin('erro','Preencha email e senha.'); return; }
  btn.disabled=true; btn.textContent='Verificando…';
  const res = await loginFirebase(email, pass);
  btn.disabled=false; btn.textContent='Entrar no sistema';
  if(!res.ok){
    const msgs={
      'auth/user-not-found':'Email não encontrado.',
      'auth/wrong-password':'Senha incorreta.',
      'auth/invalid-credential':'Email ou senha incorretos.',
      'auth/too-many-requests':'Muitas tentativas. Aguarde.',
      'auth/user-disabled':'Conta desativada.',
      'email-nao-verificado':'Confirme seu email antes de entrar.'
    };
    mostrarMsgLogin('erro',msgs[res.erro]||'Erro ao fazer login.');
  }
}

function cadTipoChanged(){
  const tipo=document.querySelector('input[name="cad-tipo"]:checked')?.value||'medico';
  const cm=document.getElementById('cad-campos-medico');
  const lm=document.getElementById('cad-tipo-medico-label');
  const la=document.getElementById('cad-tipo-assist-label');
  if(cm) cm.style.display=tipo==='medico'?'block':'none';
  if(lm){ lm.style.borderColor=tipo==='medico'?'#2563EB':'#E5E7EB'; lm.style.background=tipo==='medico'?'#EFF6FF':'#F9FAFB'; lm.style.color=tipo==='medico'?'#1E40AF':'#6B7280'; }
  if(la){ la.style.borderColor=tipo==='assistente'?'#2563EB':'#E5E7EB'; la.style.background=tipo==='assistente'?'#EFF6FF':'#F9FAFB'; la.style.color=tipo==='assistente'?'#1E40AF':'#6B7280'; }
}

async function realizarCadastro(){
  const tipoPerfil=document.querySelector('input[name="cad-tipo"]:checked')?.value||'medico';
  const nome=document.getElementById('cad-nome').value.trim();
  const email=document.getElementById('cad-email').value.trim().toLowerCase();
  const pass=document.getElementById('cad-pass').value;
  const pass2=document.getElementById('cad-pass2').value;
  const btn=document.getElementById('btn-cadastro');
  document.getElementById('cad-error').classList.remove('show');

  if(!nome||!email||!pass||!pass2){ document.getElementById('cad-error-msg').textContent='Preencha todos os campos.'; document.getElementById('cad-error').className='auth-msg erro show'; return; }
  if(pass.length<8){ document.getElementById('cad-error-msg').textContent='Senha mínima: 8 caracteres.'; document.getElementById('cad-error').className='auth-msg erro show'; return; }
  if(pass!==pass2){ document.getElementById('cad-error-msg').textContent='As senhas não coincidem.'; document.getElementById('cad-error').className='auth-msg erro show'; return; }

  const crm=document.getElementById('cad-crm')?.value?.trim()||'';
  const uf=document.getElementById('cad-uf')?.value?.trim()?.toUpperCase()||'';
  const esp=document.getElementById('cad-especialidade')?.value?.trim()||'';
  if(tipoPerfil==='medico'&&(!crm||!uf)){ document.getElementById('cad-error-msg').textContent='CRM e UF são obrigatórios para médicos.'; document.getElementById('cad-error').className='auth-msg erro show'; return; }

  btn.disabled=true; btn.textContent='Criando conta…';
  const res = await onboardingPF(email,pass,nome,crm,esp,tipoPerfil,uf);
  btn.disabled=false; btn.textContent='Criar minha conta';

  if(!res.ok){
    const msgs={'auth/email-already-in-use':'Este email já está cadastrado.','auth/weak-password':'Senha muito fraca.','auth/invalid-email':'Email inválido.'};
    document.getElementById('cad-error-msg').textContent=msgs[res.erro]||'Erro ao criar conta.';
    document.getElementById('cad-error').className='auth-msg erro show'; return;
  }

  document.getElementById('confirm-email-dest').textContent=email;
  document.querySelectorAll('.auth-panel').forEach(p=>p.classList.remove('ativo'));
  document.getElementById('confirm-panel').classList.add('ativo');
}

// ── Busca CPF no cadastro PJ ──
let _buscaCpfTimer=null;
function buscarCpfPJ(){
  clearTimeout(_buscaCpfTimer);
  const el=document.getElementById('pj-cpf'), st=document.getElementById('pj-cpf-status');
  const cpf=el.value.replace(/\D/g,'');
  if(cpf.length<11){ st.textContent=''; return; }
  if(!validarCPF(cpf)){ st.innerHTML='<span style="color:#EF4444;">CPF inválido</span>'; return; }
  st.innerHTML='<span style="color:#6B7280;">Buscando...</span>';
  _buscaCpfTimer=setTimeout(async()=>{
    const prof=await fsGetProfissionalByCPF(cpf);
    if(prof){
      st.innerHTML='<span style="color:#22C55E;">Encontrado: '+escH(prof.nome)+'</span>';
      document.getElementById('pj-nome').value=prof.nome||'';
      document.getElementById('pj-crm').value=prof.crm||'';
      document.getElementById('pj-uf').value=prof.ufCrm||'';
      document.getElementById('pj-email').value=prof.email||'';
      if(prof.contaCriada!==false){
        document.getElementById('pj-pass').value='********';
        document.getElementById('pj-pass2').value='********';
        document.getElementById('pj-pass').disabled=true;
        document.getElementById('pj-pass2').disabled=true;
      }
    } else {
      st.innerHTML='<span style="color:#F59E0B;">Profissional novo</span>';
      document.getElementById('pj-pass').disabled=false;
      document.getElementById('pj-pass2').disabled=false;
    }
  },500);
}

async function realizarCadastroPJ(){
  const cnpj=document.getElementById('pj-cnpj').value.trim();
  const razao=document.getElementById('pj-razao').value.trim();
  const fantasia=document.getElementById('pj-fantasia').value.trim();
  const tel=document.getElementById('pj-tel').value.trim();
  const end=document.getElementById('pj-end').value.trim();
  const cpf=document.getElementById('pj-cpf').value.trim();
  const nome=document.getElementById('pj-nome').value.trim();
  const crm=document.getElementById('pj-crm').value.trim();
  const uf=document.getElementById('pj-uf').value.trim().toUpperCase();
  const email=document.getElementById('pj-email').value.trim().toLowerCase();
  const pass=document.getElementById('pj-pass').value;
  const pass2=document.getElementById('pj-pass2').value;
  const btn=document.getElementById('btn-cadastro-pj');
  const errEl=document.getElementById('pj-error'), errMsg=document.getElementById('pj-error-msg');
  errEl.classList.remove('show');

  if(!cnpj||!razao||!cpf||!nome||!email){ errMsg.textContent='Preencha todos os campos obrigatórios.'; errEl.className='auth-msg erro show'; return; }
  if(!validarCNPJ(cnpj)){ errMsg.textContent='CNPJ inválido.'; errEl.className='auth-msg erro show'; return; }
  if(!validarCPF(cpf)){ errMsg.textContent='CPF do responsável inválido.'; errEl.className='auth-msg erro show'; return; }
  const passDisabled=document.getElementById('pj-pass').disabled;
  if(!passDisabled){
    if(!pass||pass.length<8){ errMsg.textContent='Senha mínima: 8 caracteres.'; errEl.className='auth-msg erro show'; return; }
    if(pass!==pass2){ errMsg.textContent='As senhas não coincidem.'; errEl.className='auth-msg erro show'; return; }
  }

  btn.disabled=true; btn.textContent='Cadastrando empresa...';
  const res=await onboardingPJ({cnpj,razaoSocial:razao,nomeFantasia:fantasia,telefone:tel,endereco:end},{cpf,nome,crm,ufCrm:uf,email,senha:pass,especialidade:''});
  btn.disabled=false; btn.textContent='Cadastrar empresa';

  if(!res.ok){
    const msgs={'cnpj-duplicado':'Este CNPJ já está cadastrado.','auth/email-already-in-use':'Este email já possui uma conta.'};
    errMsg.textContent=msgs[res.erro]||'Erro: '+(res.erro||'tente novamente');
    errEl.className='auth-msg erro show'; return;
  }

  document.getElementById('confirm-email-dest').textContent=email;
  document.getElementById('card-empresa').style.display='none';
  document.getElementById('card-usuario').style.display='block';
  document.querySelectorAll('.auth-panel').forEach(p=>p.classList.remove('ativo'));
  document.getElementById('confirm-panel').classList.add('ativo');
}

// ══ CONVITES UI ══════════════════════════════════════════════════

async function aceitarConviteUI(vincId){
  if(await fsAceitarConvite(vincId)){
    await fsLog('aceite_convite',{vincId});
    await carregarContextosComConvites(_fbUser.uid);
  }
}
async function recusarConviteUI(vincId){
  if(!confirm('Tem certeza que deseja recusar?')) return;
  if(await fsRecusarConvite(vincId)){
    await fsLog('recusa_convite',{vincId});
    await carregarContextosComConvites(_fbUser.uid);
  }
}

function abrirConviteModal(){
  const ehMaster = _fbMembership?.role==='master';
  const ehMedico = _fbMembership?.role==='medico';
  const podeConvidar = ehMaster || ehMedico || _isSuperAdmin;
  if(!_fbWorkspace||!podeConvidar){ return; }
  ['conv-cpf','conv-nome','conv-crm','conv-uf','conv-email'].forEach(id=>{ const el=document.getElementById(id); if(el){el.value='';el.disabled=false;} });
  const e1=document.getElementById('convite-error'); if(e1)e1.style.display='none';
  const e2=document.getElementById('convite-ok'); if(e2)e2.style.display='none';
  document.getElementById('conv-cpf-status').textContent='';
  document.getElementById('convite-ws-nome').textContent=_fbWorkspace.nomeClinica||'';

  // Médico PF: só pode convidar assistente (esconde opção médico)
  const radioMedico = document.querySelector('input[name="conv-papel"][value="medico"]');
  const radioAssist = document.querySelector('input[name="conv-papel"][value="assistente"]');
  if(radioMedico && radioAssist){
    if(ehMaster){
      // Master pode convidar médico ou assistente
      radioMedico.parentElement.style.display='';
      radioMedico.checked=true;
    } else {
      // Médico PF: só assistente
      radioMedico.parentElement.style.display='none';
      radioAssist.checked=true;
    }
  }

  document.getElementById('convite-ov').style.display='flex';
}
function fecharConviteModal(){ document.getElementById('convite-ov').style.display='none'; }

let _buscaCpfConvTimer=null;
function buscarCpfConvite(){
  clearTimeout(_buscaCpfConvTimer);
  const el=document.getElementById('conv-cpf'), st=document.getElementById('conv-cpf-status');
  const cpf=el.value.replace(/\D/g,'');
  if(cpf.length<11){st.textContent='';return;}
  if(!validarCPF(cpf)){st.innerHTML='<span style="color:#EF4444;">CPF inválido</span>';return;}
  st.innerHTML='<span style="color:#6B7280;">Buscando...</span>';
  _buscaCpfConvTimer=setTimeout(async()=>{
    const prof=await fsGetProfissionalByCPF(cpf);
    if(prof){
      st.innerHTML='<span style="color:#22C55E;">Encontrado: '+escH(prof.nome)+'</span>';
      document.getElementById('conv-nome').value=prof.nome||'';
      document.getElementById('conv-crm').value=prof.crm||'';
      document.getElementById('conv-uf').value=prof.ufCrm||'';
      document.getElementById('conv-email').value=prof.email||'';
    } else {
      st.innerHTML='<span style="color:#F59E0B;">Profissional novo</span>';
      ['conv-nome','conv-crm','conv-uf','conv-email'].forEach(id=>document.getElementById(id).value='');
    }
  },500);
}

async function enviarConviteUI(){
  const cpf=document.getElementById('conv-cpf').value.trim();
  const nome=document.getElementById('conv-nome').value.trim();
  const crm=document.getElementById('conv-crm').value.trim();
  const uf=document.getElementById('conv-uf').value.trim().toUpperCase();
  const email=document.getElementById('conv-email').value.trim().toLowerCase();
  const papel=document.querySelector('input[name="conv-papel"]:checked')?.value||'medico';
  const btn=document.getElementById('btn-enviar-convite');
  const errEl=document.getElementById('convite-error'),errMsg=document.getElementById('convite-error-msg');
  const okEl=document.getElementById('convite-ok'),okMsg=document.getElementById('convite-ok-msg');
  errEl.style.display='none';okEl.style.display='none';

  if(!cpf||!nome){errMsg.textContent='CPF e Nome obrigatórios.';errEl.style.display='flex';return;}
  if(!validarCPF(cpf)){errMsg.textContent='CPF inválido.';errEl.style.display='flex';return;}

  btn.disabled=true;btn.textContent='Enviando...';
  const res=await fsConvidarProfissional(cpf,nome,crm,uf,email,papel,_fbWorkspace.id,_fbWorkspace.empresaId||null);
  btn.disabled=false;btn.textContent='Enviar convite';

  if(!res.ok){errMsg.textContent=res.msg||'Erro ao enviar convite.';errEl.style.display='flex';return;}
  okMsg.textContent='Convite enviado para '+nome+'!';
  okEl.style.display='flex';
  ['conv-cpf','conv-nome','conv-crm','conv-uf','conv-email'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('conv-cpf-status').textContent='';
}

// ══ LOGOUT ═══════════════════════════════════════════════════════

function fazerLogout(){
  fsLimparListeners();
  fbAuth.signOut().catch(e=>console.error('signOut:',e));
  sessionStorage.removeItem(SESS_KEY);
  const sb=document.getElementById('session-badge'); if(sb) sb.style.display='none';
  document.getElementById('login-overlay').classList.remove('hidden');
  voltarSeletor();
}

// ══ INIT AUTH ════════════════════════════════════════════════════

async function initAuthV7(){
  fbAuth.onAuthStateChanged(async user=>{
    if(user){
      _fbUser = user;
      document.getElementById('login-overlay').classList.add('hidden');
      document.getElementById('ctx-overlay').classList.add('open');
      document.getElementById('ctx-loading').style.display='flex';
      document.getElementById('ctx-conteudo').style.display='none';

      // Carregar perfil
      _fbProfile = await fsGetProfile(user.uid);
      if(!_fbProfile){
        await fsCreateProfile(user.uid,{nome:user.displayName||'',email:user.email,crm:'',especialidade:''});
        _fbProfile = await fsGetProfile(user.uid);
      }
      if(!_fbProfile){
        _fbProfile={uid:user.uid,nome:'',email:user.email,cpf:'',crm:'',ufCrm:'',rqe:'',superadmin:false};
      }
      if(_fbProfile.email !== user.email){
        await fsUpdateProfile(user.uid,{email:user.email});
        _fbProfile.email=user.email;
      }

      // Superadmin
      if(!_fbProfile.superadmin){
        try{
          const tots=await fsCol('profissionais').limit(2).get();
          if(tots.size<=1 || EMAILS_DONO.includes((user.email||'').toLowerCase())){
            await fsUpdateProfile(user.uid,{superadmin:true});
            _fbProfile.superadmin=true;
          }
        }catch(e){}
      }
      _isSuperAdmin=_fbProfile.superadmin===true || EMAILS_DONO.includes((user.email||'').toLowerCase());

      // Completar perfil se CPF vazio
      if(!_fbProfile.cpf || _fbProfile.cpf===''){
        document.getElementById('ctx-overlay').classList.add('open');
        document.getElementById('ctx-loading').style.display='none';
        document.getElementById('ctx-conteudo').style.display='none';
        mostrarCompletarPerfil();
        return;
      }

      await carregarContextosComConvites(user.uid);

    } else {
      _fbUser=_fbProfile=_fbWorkspace=_fbMembership=_fbSubscription=null;
      _fbContextos=[]; _isSuperAdmin=false;
      fsLimparListeners();
      document.getElementById('login-overlay').classList.remove('hidden');
      document.getElementById('ctx-overlay').classList.remove('open');
    }
  });
}

// ══ BOOT ═════════════════════════════════════════════════════════

window.addEventListener('load', async()=>{
  await initAuthV7();
});

console.log('%c🫀 LEO v7 — Auth carregado','color:#2563EB;font-size:11px;');
