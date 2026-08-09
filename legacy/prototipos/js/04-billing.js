// ══════════════════════════════════════════════════════════════════
// LEO v7 · Módulo 04 — Billing
// Plano, franquia, créditos, verificação de emissão, consumo
// ══════════════════════════════════════════════════════════════════

// ── Criar subscription trial ──
async function fsCreateSubscription(wsId, tipo='trial', franquia=100){
  const agora   = new Date();
  const fimTrial = new Date(agora.getTime() + 30*864e5);
  try{
    const ref = fsCol('subscriptions').doc();
    await ref.set({
      id: ref.id, workspaceId: wsId, tipo,
      franquiaMensal: franquia, franquiaUsada: 0,
      creditosExtras: 0,
      cicloInicio: firebase.firestore.Timestamp.fromDate(agora),
      cicloFim:    firebase.firestore.Timestamp.fromDate(fimTrial),
      criadoEm: fsNow()
    });
    return ref.id;
  }catch(e){ console.error('fsCreateSubscription:',e); return null; }
}

// ── Buscar subscription de um workspace ──
async function fsGetSubscription(wsId){
  try{
    const snap = await fsCol('subscriptions').where('workspaceId','==',wsId).limit(1).get();
    if(snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
  }catch(e){ console.error('fsGetSubscription:',e); return null; }
}

// ── Verificar se pode emitir laudo ──
async function checkEmissao(wsId){
  try{
    const sub = await fsGetSubscription(wsId);
    if(!sub) return { pode:false, motivo:'sem_plano' };

    const agora = new Date();
    const cicloFim = sub.cicloFim?.toDate ? sub.cicloFim.toDate() : new Date(sub.cicloFim);

    // Trial ou plano expirado
    if(agora > cicloFim && sub.creditosExtras <= 0){
      return { pode:false, motivo:'expirado', sub };
    }

    // Franquia disponível
    if(sub.franquiaUsada < sub.franquiaMensal && agora <= cicloFim){
      return { pode:true, tipo:'franquia', sub };
    }

    // Créditos extras
    if(sub.creditosExtras > 0){
      return { pode:true, tipo:'creditos', sub };
    }

    return { pode:false, motivo:'sem_saldo', sub };
  }catch(e){ console.error('checkEmissao:',e); return { pode:false, motivo:'erro' }; }
}

// ── Consumir 1 emissão ──
async function consumirEmissao(wsId, tipo){
  try{
    const sub = await fsGetSubscription(wsId);
    if(!sub) return false;
    if(tipo==='franquia'){
      await fsDoc('subscriptions/'+sub.id).update({
        franquiaUsada: firebase.firestore.FieldValue.increment(1)
      });
    } else if(tipo==='creditos'){
      await fsDoc('subscriptions/'+sub.id).update({
        creditosExtras: firebase.firestore.FieldValue.increment(-1)
      });
    }
    return true;
  }catch(e){ console.error('consumirEmissao:',e); return false; }
}

// ── UI: Mostrar bloqueio de assinatura ──
function mostrarBloqueioAssinatura(check){
  const desc = {
    expirado:  'Seu período de acesso chegou ao fim.',
    sem_saldo: 'Você utilizou todos os laudos disponíveis este mês.',
    sem_plano: 'Nenhum plano ativo encontrado.',
    erro:      'Erro ao verificar seu plano. Tente novamente.'
  };
  const el = document.getElementById('assexp-desc');
  if(el) el.textContent = desc[check.motivo] || desc.erro;
  const ov = document.getElementById('assinatura-expirada');
  if(ov) ov.classList.add('show');
}

function fecharBloqueioAssinatura(){
  const ov = document.getElementById('assinatura-expirada');
  if(ov) ov.classList.remove('show');
}

function abrirPagamento(tipo){
  mostrarToastAdmin(
    tipo==='plano'
      ? '💳 Entre em contato para renovar seu plano.'
      : '💳 Entre em contato para comprar créditos.',
    'azul'
  );
  fecharBloqueioAssinatura();
}

console.log('%c🫀 LEO v7 — Billing carregado','color:#2563EB;font-size:11px;');
