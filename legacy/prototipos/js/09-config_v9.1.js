// ══════════════════════════════════════════════════════════════════
// LEO v7 · Módulo 09 — Configuração
// Branding, logo, assinatura, paletas de cores
// ══════════════════════════════════════════════════════════════════

const CFG_KEY = 'medcardio_cfg_v20';
const CFG_DEF = {
  clinica:'Consultório', slogan:'Cardiologia e Ecocardiografia',
  logoB64:'', logoType:'',
  medNome:'', medEsp:'Cardiologia e Ecocardiografia',
  medCrm:'', medUf:'', medTitulo:'Cardiologia e Ecocardiografia',
  medEnd:'', medTel:'', medEmail:'',
  localEnd:'', localTel:'',
  p1:'#1E3A5F', p2:'#2563EB',
  sigB64:'', sigTipo:'',
  sigTexto:'',
};

const PALETTES = [
  {name:'Azul LEO',     p1:'#1E3A5F', p2:'#2563EB'},
  {name:'Clássico',     p1:'#8B1A1A', p2:'#1E3A5F'},
  {name:'Verde Med',    p1:'#065F46', p2:'#059669'},
  {name:'Roxo',         p1:'#5B21B6', p2:'#7C3AED'},
  {name:'Cinza Pro',    p1:'#374151', p2:'#6B7280'},
  {name:'Teal',         p1:'#134E4A', p2:'#14B8A6'},
];

let cfgAtiva = 'id';

// ── Carregar e aplicar ──

function loadConfig(){
  try{ const s=localStorage.getItem(CFG_KEY); CFG=s?{...CFG_DEF,...JSON.parse(s)}:{...CFG_DEF}; }
  catch{ CFG={...CFG_DEF}; }
}

function applyConfig(cfgOverride){
  const c = cfgOverride || CFG;
  if(!c.p1) c.p1 = '#1E3A5F';
  if(!c.p2) c.p2 = '#2563EB';

  const r=document.documentElement.style;
  r.setProperty('--P1', c.p1);
  r.setProperty('--P1m', ajustarCor(c.p1, 0.8));
  r.setProperty('--P1l', hexToLight(c.p1));
  r.setProperty('--P1b', hexToMid(c.p1));
  r.setProperty('--P2', c.p2);
  r.setProperty('--P2l', hexToLight(c.p2));
  r.setProperty('--red', c.p1);
  r.setProperty('--red-mid', ajustarCor(c.p1, 0.8));
  r.setProperty('--red-light', hexToLight(c.p1));
  r.setProperty('--red-border', hexToMid(c.p1));
  r.setProperty('--navy', c.p2);
  r.setProperty('--navy-light', hexToLight(c.p2));

  // Cabeçalho laudo
  const elClinica=document.querySelector('.laudo-clinica');
  if(elClinica){ elClinica.innerHTML=`${escH(c.clinica||'')}<span>${escH(c.slogan||'')}</span>`; elClinica.style.color=c.p1; }

  const elDr=document.querySelector('.laudo-dr');
  if(elDr){ elDr.innerHTML=`<strong style="color:${c.p1}">${escH(c.medNome||'')}</strong>${escH(c.medTitulo||'')}<br/>CRM/${c.medUf||''} ${c.medCrm||''}`; }

  aplicarLogoLaudo();
  aplicarRodapeLaudo();

  const hc=document.getElementById('hdr-clinica'); if(hc) hc.textContent=c.clinica||'';
  const hs=document.getElementById('hdr-subtitulo'); if(hs) hs.textContent=`${c.medNome||''} · CRM/${c.medUf||''} ${c.medCrm||''} · Leo v7`;

  if(cfgOverride) CFG = {...CFG, ...cfgOverride};
}

function aplicarLogoLaudo(){
  let logoEl=document.getElementById('laudo-logo');
  if(CFG.logoB64){
    if(!logoEl){
      logoEl=document.createElement('img');
      logoEl.id='laudo-logo';
      logoEl.style.cssText='max-height:42px;max-width:120px;object-fit:contain;';
      const hdr=document.querySelector('.laudo-clinica');
      if(hdr&&hdr.parentNode) hdr.parentNode.insertBefore(logoEl,hdr);
    }
    logoEl.src=CFG.logoB64;
    logoEl.style.display='block';
  } else if(logoEl) logoEl.style.display='none';
}

function aplicarRodapeLaudo(){
  const fi=document.querySelector('.footer-info');
  if(fi){
    let html=`<strong style="color:${CFG.p1}">${escH(CFG.medNome||'')}</strong><br/>${escH(CFG.medTitulo||'')} · CRM/${CFG.medUf||''} ${CFG.medCrm||''}<br/>${escH(CFG.medEnd||'')}<br/>☎ ${escH(CFG.medTel||'')}`;
    if(CFG.medEmail) html+=`<br/>✉ ${escH(CFG.medEmail)}`;
    fi.innerHTML=html;
  }
  const fa=document.querySelector('.footer-assinatura');
  if(fa){
    if(CFG.sigB64){
      fa.innerHTML=`<img src="${CFG.sigB64}" style="max-height:50px;max-width:140px;display:block;margin:0 auto 3px;object-fit:contain;"/><div style="font-size:6.8pt;color:#6B7280;white-space:pre-line;">${escH(CFG.sigTexto||'')}</div>`;
    } else {
      fa.innerHTML=`<div class="linha"></div><div style="font-size:7pt;white-space:pre-line;">${escH(CFG.sigTexto||'')}</div>`;
    }
  }
}

// ── Helpers ──

function setV(id,v){ const e=document.getElementById(id); if(e) e.value=v||''; }
function gV(id){ const e=document.getElementById(id); return e?e.value.trim():''; }

// ── Modal config ──

function abrirConfig(){
  loadConfig();
  setV('cfg-clinica',CFG.clinica); setV('cfg-slogan',CFG.slogan);
  setV('cfg-med-nome',CFG.medNome); setV('cfg-med-esp',CFG.medEsp);
  setV('cfg-med-crm',CFG.medCrm); setV('cfg-med-uf',CFG.medUf);
  setV('cfg-med-titulo',CFG.medTitulo); setV('cfg-med-end',CFG.medEnd);
  setV('cfg-med-tel',CFG.medTel); setV('cfg-med-email',CFG.medEmail);
  setV('cfg-sig-texto',CFG.sigTexto);

  const cp1=document.getElementById('clr-p1'); if(cp1) cp1.value=CFG.p1;
  const ch1=document.getElementById('clr-p1-hex'); if(ch1) ch1.value=CFG.p1;
  const cp2=document.getElementById('clr-p2'); if(cp2) cp2.value=CFG.p2;
  const ch2=document.getElementById('clr-p2-hex'); if(ch2) ch2.value=CFG.p2;

  renderPalettes();
  const ov=document.getElementById('cfg-ov');
  if(ov) ov.classList.add('open');
}

function fecharConfig(){ const ov=document.getElementById('cfg-ov'); if(ov) ov.classList.remove('open'); }

function cfgTab(id, el){
  cfgAtiva=id;
  document.querySelectorAll('.cfg-pane').forEach(p=>p.classList.remove('act'));
  document.querySelectorAll('.cfg-tab').forEach(t=>t.classList.remove('act'));
  const pane=document.getElementById('cfgp-'+id); if(pane) pane.classList.add('act');
  if(el) el.classList.add('act');
}

function salvarConfig(){
  CFG.clinica=gV('cfg-clinica'); CFG.slogan=gV('cfg-slogan');
  CFG.medNome=gV('cfg-med-nome'); CFG.medEsp=gV('cfg-med-esp');
  CFG.medCrm=gV('cfg-med-crm'); CFG.medUf=gV('cfg-med-uf');
  CFG.medTitulo=gV('cfg-med-titulo'); CFG.medEnd=gV('cfg-med-end');
  CFG.medTel=gV('cfg-med-tel'); CFG.medEmail=gV('cfg-med-email');
  CFG.sigTexto=gV('cfg-sig-texto');
  const cp1=document.getElementById('clr-p1'); if(cp1) CFG.p1=cp1.value;
  const cp2=document.getElementById('clr-p2'); if(cp2) CFG.p2=cp2.value;
  try{ localStorage.setItem(CFG_KEY,JSON.stringify(CFG)); }catch(e){}
  applyConfig();
  showToast('✅ Configurações salvas!');
  setTimeout(fecharConfig, 800);
}

function resetConfig(){
  if(!confirm('Restaurar todas as configurações padrão?')) return;
  CFG={...CFG_DEF};
  try{ localStorage.removeItem(CFG_KEY); }catch(e){}
  applyConfig();
  abrirConfig();
}

// ── Upload logo e assinatura ──

function uploadLogo(inp){
  const f=inp.files[0]; if(!f) return;
  if(f.size>2*1024*1024){ alert('Máx 2 MB.'); return; }
  const rd=new FileReader();
  rd.onload=e=>{
    CFG.logoB64=e.target.result; CFG.logoType=f.type;
    const pv=document.getElementById('pv-logo');
    if(pv){ pv.src=CFG.logoB64; pv.style.display='block'; }
  };
  rd.readAsDataURL(f);
}

function uploadSig(inp){
  const f=inp.files[0]; if(!f) return;
  if(f.size>1*1024*1024){ alert('Máx 1 MB.'); return; }
  const rd=new FileReader();
  rd.onload=e=>{
    CFG.sigB64=e.target.result;
    const pv=document.getElementById('pv-sig-img');
    if(pv){ pv.src=CFG.sigB64; pv.style.display='block'; }
  };
  rd.readAsDataURL(f);
}

// ── Paletas ──

function renderPalettes(){
  const grid=document.getElementById('palettes-grid');
  if(!grid) return;
  grid.innerHTML=PALETTES.map((p,i)=>`
    <div class="pal-item ${CFG.p1===p.p1&&CFG.p2===p.p2?'sel':''}" onclick="aplicarPaleta(${i})" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:2px solid ${CFG.p1===p.p1&&CFG.p2===p.p2?'#2563EB':'#E5E7EB'};border-radius:8px;cursor:pointer;font-size:11px;margin:3px;">
      <span style="width:16px;height:16px;border-radius:50%;background:${p.p1};display:inline-block;"></span>
      <span style="width:16px;height:16px;border-radius:50%;background:${p.p2};display:inline-block;"></span>
      ${p.name}
    </div>`).join('');
}

function aplicarPaleta(i){
  const p=PALETTES[i];
  CFG.p1=p.p1; CFG.p2=p.p2;
  const cp1=document.getElementById('clr-p1'); if(cp1) cp1.value=p.p1;
  const ch1=document.getElementById('clr-p1-hex'); if(ch1) ch1.value=p.p1;
  const cp2=document.getElementById('clr-p2'); if(cp2) cp2.value=p.p2;
  const ch2=document.getElementById('clr-p2-hex'); if(ch2) ch2.value=p.p2;
  document.documentElement.style.setProperty('--P1',p.p1);
  document.documentElement.style.setProperty('--P2',p.p2);
  renderPalettes();
}

function syncClr(which){
  const val=document.getElementById('clr-'+which)?.value;
  if(!val) return;
  const hex=document.getElementById('clr-'+which+'-hex'); if(hex) hex.value=val;
  CFG[which]=val;
  document.documentElement.style.setProperty(which==='p1'?'--P1':'--P2',val);
}

function syncClrHex(which){
  let val=document.getElementById('clr-'+which+'-hex')?.value?.trim();
  if(!val||!/^#[0-9a-fA-F]{6}$/.test(val)) return;
  const clr=document.getElementById('clr-'+which); if(clr) clr.value=val;
  CFG[which]=val;
  document.documentElement.style.setProperty(which==='p1'?'--P1':'--P2',val);
}

console.log('%c🫀 LEO v7 — Config carregado','color:#2563EB;font-size:11px;');
