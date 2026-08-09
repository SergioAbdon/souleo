// ══════════════════════════════════════════════════════════════════
// LEO v7 · Módulo 03 — Firestore Helpers
// CRUD para profissionais, empresas, workspaces, vínculos, pacientes, exames
// ══════════════════════════════════════════════════════════════════

// ── Helpers base ──
const fsCol  = (path) => fbDb.collection(path);
const fsDoc  = (path) => fbDb.doc(path);
const fsNow  = ()     => firebase.firestore.FieldValue.serverTimestamp();
const fsUID  = ()     => fbDb.collection('_').doc().id;

// ══ PROFISSIONAIS ════════════════════════════════════════════════

async function fsGetProfile(uid){
  try{
    let snap = await fsDoc('profissionais/'+uid).get();
    if(snap.exists) return snap.data();
    // fallback: coleção antiga profiles/
    snap = await fsDoc('profiles/'+uid).get();
    if(snap.exists){
      const dados = snap.data();
      await fsDoc('profissionais/'+uid).set({ ...dados, atualizadoEm: fsNow() });
      return dados;
    }
    return null;
  }catch(e){ console.error('fsGetProfile:',e); return null; }
}

async function fsCreateProfile(uid, dados){
  try{
    await fsDoc('profissionais/'+uid).set({
      uid, ...dados,
      cpf: dados.cpf || '',
      ufCrm: dados.ufCrm || '',
      rqe: dados.rqe || '',
      tipoPerfil: dados.tipoPerfil || 'medico',
      superadmin: false,
      criadoEm: fsNow(),
      atualizadoEm: fsNow()
    });
    return true;
  }catch(e){ console.error('fsCreateProfile:',e); return false; }
}

async function fsUpdateProfile(uid, dados){
  try{
    await fsDoc('profissionais/'+uid).update({ ...dados, atualizadoEm: fsNow() });
    return true;
  }catch(e){ console.error('fsUpdateProfile:',e); return false; }
}

async function fsGetProfissionalByCPF(cpf){
  try{
    const normalizado = cpf.replace(/\D/g,'');
    const snap = await fsCol('profissionais')
      .where('cpf','==',normalizado).limit(1).get();
    if(snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }catch(e){ console.error('fsGetProfissionalByCPF:',e); return null; }
}

async function fsCpfJaExiste(cpf){
  return !!(await fsGetProfissionalByCPF(cpf));
}

async function isSuperAdmin(uid){
  try{
    const snap = await fsDoc('profissionais/'+(uid||_fbUser?.uid)).get();
    return snap.exists && snap.data().superadmin === true;
  }catch(e){ return false; }
}

// ══ EMPRESAS ═════════════════════════════════════════════════════

async function fsCreateEmpresa(dados){
  try{
    const ref = fsCol('empresas').doc();
    const cnpjNorm = (dados.cnpj||'').replace(/\D/g,'');
    await ref.set({
      id: ref.id, cnpj: cnpjNorm,
      razaoSocial: dados.razaoSocial || '',
      nomeFantasia: dados.nomeFantasia || '',
      tipo: dados.tipo || 'clinica',
      masterUid: dados.masterUid || '',
      telefone: dados.telefone || '',
      endereco: dados.endereco || '',
      status: 'ativa',
      criadoEm: fsNow(), atualizadoEm: fsNow()
    });
    return ref.id;
  }catch(e){ console.error('fsCreateEmpresa:',e); return null; }
}

async function fsGetEmpresa(empId){
  try{
    const snap = await fsDoc('empresas/'+empId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }catch(e){ console.error('fsGetEmpresa:',e); return null; }
}

async function fsGetEmpresaByCNPJ(cnpj){
  try{
    const normalizado = cnpj.replace(/\D/g,'');
    const snap = await fsCol('empresas')
      .where('cnpj','==',normalizado).limit(1).get();
    if(snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }catch(e){ console.error('fsGetEmpresaByCNPJ:',e); return null; }
}

async function fsUpdateEmpresa(empId, dados){
  try{
    await fsDoc('empresas/'+empId).update({ ...dados, atualizadoEm: fsNow() });
    return true;
  }catch(e){ console.error('fsUpdateEmpresa:',e); return false; }
}

// ══ WORKSPACES ═══════════════════════════════════════════════════

async function fsCreateWorkspace(dados){
  try{
    const ref = fsCol('workspaces').doc();
    await ref.set({ id: ref.id, ...dados, criadoEm: fsNow() });
    return ref.id;
  }catch(e){ console.error('fsCreateWorkspace:',e); return null; }
}

async function fsGetWorkspace(wsId){
  try{
    const snap = await fsDoc('workspaces/'+wsId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }catch(e){ console.error('fsGetWorkspace:',e); return null; }
}

async function fsUpdateWorkspace(wsId, dados){
  try{
    await fsDoc('workspaces/'+wsId).update({ ...dados, atualizadoEm: fsNow() });
    return true;
  }catch(e){ console.error('fsUpdateWorkspace:',e); return false; }
}

// ══ VÍNCULOS (memberships) ═══════════════════════════════════════

async function fsCreateMembership(uid, wsId, role, status='ativo', extras={}){
  try{
    const ref = fsCol('vinculos').doc();
    await ref.set({
      id: ref.id,
      medicoUid: uid,
      profissionalId: extras.profissionalId || uid,
      workspaceId: wsId,
      empresaId: extras.empresaId || null,
      role,
      status,
      convitePor: extras.convitePor || null,
      entrou: status === 'ativo' ? fsNow() : null,
      saiu: null,
      criadoEm: fsNow()
    });
    return ref.id;
  }catch(e){ console.error('fsCreateMembership:',e); return null; }
}

async function fsGetMemberships(uid){
  try{
    let snap = await fsCol('vinculos')
      .where('medicoUid','==',uid)
      .where('status','==','ativo')
      .get();
    if(snap.empty){
      snap = await fsCol('memberships')
        .where('medicoUid','==',uid)
        .where('status','==','ativo')
        .get();
    }
    return snap.docs.map(d=>({ id:d.id, ...d.data() }));
  }catch(e){ console.error('fsGetMemberships:',e); return []; }
}

async function fsDesativarMembership(memId){
  try{
    const snapV = await fsDoc('vinculos/'+memId).get();
    if(snapV.exists){
      await fsDoc('vinculos/'+memId).update({ status:'inativo', saiu: fsNow() });
    } else {
      await fsDoc('memberships/'+memId).update({ status:'inativo', saiu: fsNow() });
    }
    return true;
  }catch(e){ console.error('fsDesativarMembership:',e); return false; }
}

// ══ CONVITES ═════════════════════════════════════════════════════

async function fsGetConvitesPendentes(uid){
  try{
    const snap = await fsCol('vinculos')
      .where('medicoUid','==',uid)
      .where('status','==','pendente')
      .get();
    return snap.docs.map(d=>({ id:d.id, ...d.data() }));
  }catch(e){ console.error('fsGetConvitesPendentes:',e); return []; }
}

async function fsAceitarConvite(vincId){
  try{
    await fsDoc('vinculos/'+vincId).update({ status: 'ativo', entrou: fsNow() });
    return true;
  }catch(e){ console.error('fsAceitarConvite:',e); return false; }
}

async function fsRecusarConvite(vincId){
  try{
    await fsDoc('vinculos/'+vincId).update({ status: 'recusado' });
    return true;
  }catch(e){ console.error('fsRecusarConvite:',e); return false; }
}

async function fsConvidarProfissional(cpf, nome, crm, ufCrm, email, papel, wsId, empresaId){
  try{
    let prof = await fsGetProfissionalByCPF(cpf);
    let uid = prof?.uid || null;

    if(!prof){
      const profRef = fsCol('profissionais').doc();
      await profRef.set({
        uid: profRef.id, nome, crm, ufCrm: ufCrm || '',
        cpf: cpf.replace(/\D/g,''), email: email || '',
        rqe: '', especialidade: '', superadmin: false,
        contaCriada: false,
        criadoEm: fsNow(), atualizadoEm: fsNow()
      });
      uid = profRef.id;
    }

    const snapExist = await fsCol('vinculos')
      .where('medicoUid','==',uid)
      .where('workspaceId','==',wsId)
      .where('status','in',['ativo','pendente'])
      .limit(1).get();
    if(!snapExist.empty){
      return { ok: false, erro: 'ja_vinculado', msg: 'Profissional já vinculado ou com convite pendente.' };
    }

    const vincId = await fsCreateMembership(uid, wsId, papel, 'pendente', {
      profissionalId: uid, empresaId, convitePor: _fbUser?.uid
    });

    await fsLog('convite', { wsId, empresaId, convidadoCpf: cpf.replace(/\D/g,''), convidadoNome: nome, papel, vincId });

    return { ok: true, vincId, profExistente: !!prof };
  }catch(e){
    console.error('fsConvidarProfissional:',e);
    return { ok: false, erro: 'erro', msg: e.message };
  }
}

// ══ PACIENTES ════════════════════════════════════════════════════

async function fsGetPacientes(wsId){
  try{
    const snap = await fsCol('workspaces/'+wsId+'/pacientes').orderBy('nome').get();
    return snap.docs.map(d=>({ id:d.id, ...d.data() }));
  }catch(e){ console.error('fsGetPacientes:',e); return []; }
}

async function fsSalvarPaciente(wsId, dados){
  try{
    if(dados.id){
      await fsDoc('workspaces/'+wsId+'/pacientes/'+dados.id).update({ ...dados, atualizadoEm: fsNow() });
      return dados.id;
    } else {
      const ref = fsCol('workspaces/'+wsId+'/pacientes').doc();
      await ref.set({ id: ref.id, ...dados, criadoEm: fsNow() });
      return ref.id;
    }
  }catch(e){ console.error('fsSalvarPaciente:',e); return null; }
}

// ══ EXAMES ═══════════════════════════════════════════════════════

async function fsGetExames(wsId, pacienteId=null){
  try{
    let q = fsCol('workspaces/'+wsId+'/exames');
    if(pacienteId) q = q.where('pacienteId','==',pacienteId);
    q = q.orderBy('dataExame','desc');
    const snap = await q.get();
    return snap.docs.map(d=>({ id:d.id, ...d.data() }));
  }catch(e){ console.error('fsGetExames:',e); return []; }
}

async function fsSalvarExame(wsId, dados){
  try{
    if(dados.id){
      await fsDoc('workspaces/'+wsId+'/exames/'+dados.id).update({ ...dados, atualizadoEm: fsNow() });
      return dados.id;
    } else {
      const ref = fsCol('workspaces/'+wsId+'/exames').doc();
      await ref.set({ id: ref.id, ...dados, status:'rascunho', versao:1, medicoUid: _fbUser?.uid, criadoEm: fsNow() });
      return ref.id;
    }
  }catch(e){ console.error('fsSalvarExame:',e); return null; }
}

async function fsEmitirExame(wsId, exameId, dadosFinais){
  try{
    const check = await checkEmissao(wsId);
    if(!check.pode){ mostrarBloqueioAssinatura(check); return false; }
    await fsDoc('workspaces/'+wsId+'/exames/'+exameId).update({
      ...dadosFinais, status:'emitido', emitidoEm: fsNow(), medicoUid: _fbUser?.uid, atualizadoEm: fsNow()
    });
    await consumirEmissao(wsId, check.tipo);
    await fsLog('emissao', { exameId, wsId, medicoUid: _fbUser?.uid, tipo: check.tipo });
    return true;
  }catch(e){ console.error('fsEmitirExame:',e); return false; }
}

// ══ WORKLIST LISTENER ════════════════════════════════════════════

function fsListenWorklist(wsId, callback){
  const hoje = new Date().toISOString().split('T')[0];
  const unsub = fsCol('workspaces/'+wsId+'/exames')
    .where('status','in',['rascunho','aguardando','andamento'])
    .where('dataExame','==',hoje)
    .orderBy('horarioChegada','asc')
    .onSnapshot(snap=>{
      const items = snap.docs.map(d=>({ id:d.id, ...d.data() }));
      callback(items);
    }, err=>console.error('fsListenWorklist:',err));
  _unsubListeners.push(unsub);
  return unsub;
}

function fsLimparListeners(){
  _unsubListeners.forEach(fn=>{ try{ fn(); }catch(e){} });
  _unsubListeners = [];
}

// ══ LOG DE AUDITORIA ═════════════════════════════════════════════

async function fsLog(tipo, dados){
  try{
    await fsCol('logs').add({
      tipo, ...dados,
      ts: fsNow(),
      medicoUid: _fbUser?.uid || 'sistema'
    });
  }catch(e){ /* log não pode quebrar o sistema */ }
}

console.log('%c🫀 LEO v7 — Firestore helpers carregado','color:#2563EB;font-size:11px;');
