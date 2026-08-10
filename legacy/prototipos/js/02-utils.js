// ══════════════════════════════════════════════════════════════════
// LEO v7 · Módulo 02 — Utilitários
// Validação, formatação, helpers, localStorage
// ══════════════════════════════════════════════════════════════════

// ── Constantes localStorage ──
const WL_KEY           = 'leo_wl_v25';
const HIST_KEY         = 'leo_hist_v25';
const PAC_KEY          = 'leo_pacientes_v21';
const CLINICAS_KEY     = 'leo_clinicas_v21';
const CLINICA_ATIVA_KEY = 'leo_clinica_ativa_v21';
const LAST_WL_DATE_KEY = 'leo_wl_lastdate';
const SESS_KEY         = 'leo_auth_session_v2';
const SESS_MINS        = 480;

// ── Variáveis globais de estado ──
let WL_CLINICA_ATIVA = null;
let WL_PACIENTE_SEL  = null;
let WL_TAB_ATIVA     = 'hoje';
let WL_EDIT_ID       = null;
let CFG = {};

// ══ VALIDAÇÃO ════════════════════════════════════════════════════

function validarCPF(cpf){
  cpf = cpf.replace(/\D/g,'');
  if(cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let soma = 0, resto;
  for(let i=1; i<=9; i++) soma += parseInt(cpf[i-1]) * (11-i);
  resto = (soma*10) % 11; if(resto===10||resto===11) resto=0;
  if(resto !== parseInt(cpf[9])) return false;
  soma = 0;
  for(let i=1; i<=10; i++) soma += parseInt(cpf[i-1]) * (12-i);
  resto = (soma*10) % 11; if(resto===10||resto===11) resto=0;
  return resto === parseInt(cpf[10]);
}

function validarCNPJ(cnpj){
  cnpj = cnpj.replace(/\D/g,'');
  if(cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const pesos1 = [5,4,3,2,9,8,7,6,5,4,3,2];
  const pesos2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
  let soma = 0;
  for(let i=0; i<12; i++) soma += parseInt(cnpj[i]) * pesos1[i];
  let resto = soma % 11; let dig1 = resto < 2 ? 0 : 11 - resto;
  if(parseInt(cnpj[12]) !== dig1) return false;
  soma = 0;
  for(let i=0; i<13; i++) soma += parseInt(cnpj[i]) * pesos2[i];
  resto = soma % 11; let dig2 = resto < 2 ? 0 : 11 - resto;
  return parseInt(cnpj[13]) === dig2;
}

// ══ FORMATAÇÃO ═══════════════════════════════════════════════════

function formatarCPF(cpf){
  cpf = cpf.replace(/\D/g,'');
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
}

function formatarCNPJ(cnpj){
  cnpj = cnpj.replace(/\D/g,'');
  return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');
}

function mascaraCNPJ(el){
  let v = el.value.replace(/\D/g,'');
  if(v.length>14) v=v.slice(0,14);
  v = v.replace(/^(\d{2})(\d)/,'$1.$2');
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/,'.$1/$2');
  v = v.replace(/\/(\d{4})(\d)/,'/$1-$2');
  el.value = v;
}

function mascaraCEP(el){
  let v = el.value.replace(/\D/g,'');
  if(v.length>8) v=v.slice(0,8);
  if(v.length>5) v = v.replace(/^(\d{5})(\d)/,'$1-$2');
  el.value = v;
}

function mascaraTelefone(el){
  let v = el.value.replace(/\D/g,'');
  if(v.length>11) v=v.slice(0,11);
  if(v.length<=10){
    // Fixo: (00) 0000-0000
    if(v.length>6) v = v.replace(/^(\d{2})(\d{4})(\d)/,'($1) $2-$3');
    else if(v.length>2) v = v.replace(/^(\d{2})(\d)/,'($1) $2');
  } else {
    // Celular: (00) 00000-0000
    v = v.replace(/^(\d{2})(\d{5})(\d)/,'($1) $2-$3');
  }
  el.value = v;
}

function mascaraCPFInput(el){
  let v = el.value.replace(/\D/g,'');
  if(v.length>11) v=v.slice(0,11);
  v = v.replace(/(\d{3})(\d)/,'$1.$2');
  v = v.replace(/(\d{3})(\d)/,'$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/,'$1-$2');
  el.value = v;
}

// ══ HTML/XML ESCAPING ════════════════════════════════════════════

function escH(s){
  const d=document.createElement('div');
  d.textContent=s||'';
  return d.innerHTML;
}

function escXml(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

// ══ ID GENERATION ════════════════════════════════════════════════

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).substr(2,8);
}

// ══ CORES ════════════════════════════════════════════════════════

function hexToRgb(h){
  if(!h) return [30,58,95]; // fallback: azul escuro
  h=h.replace('#','');
  const n=parseInt(h,16);
  return [n>>16,(n>>8)&255,n&255];
}

function hexToLight(h){
  const [r,g,b]=hexToRgb(h);
  return `rgba(${r},${g},${b},0.06)`;
}

function hexToMid(h){
  const [r,g,b]=hexToRgb(h);
  return `rgba(${r},${g},${b},0.25)`;
}

function ajustarCor(hex, fator){
  if(!hex) hex='#1E3A5F';
  const [r,g,b]=hexToRgb(hex);
  const f=fator||0.85;
  return `rgb(${Math.round(r*f)},${Math.round(g*f)},${Math.round(b*f)})`;
}

// ══ DATA / IDADE ═════════════════════════════════════════════════

function calcIdade(dtnasc, dtref){
  if(!dtnasc) return '';
  const nasc = new Date(dtnasc);
  const ref = dtref ? new Date(dtref) : new Date();
  let idade = ref.getFullYear() - nasc.getFullYear();
  const m = ref.getMonth() - nasc.getMonth();
  if(m < 0 || (m === 0 && ref.getDate() < nasc.getDate())) idade--;
  return idade;
}

// ══ TOAST ════════════════════════════════════════════════════════

function showToast(msg, cor){
  const el=document.createElement('div');
  el.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;background:'+(cor||'#1E293B')+';color:#fff;padding:10px 20px;border-radius:9px;font-size:13px;font-weight:600;font-family:"IBM Plex Sans",sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);white-space:nowrap;';
  el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3000);
}

function mostrarToastAdmin(msg, cor){
  const map={verde:'rgba(74,222,128,.15)',vermelho:'rgba(248,113,113,.15)',azul:'rgba(96,165,250,.15)',roxo:'rgba(196,181,253,.2)',cinza:'rgba(203,213,225,.2)'};
  const bmap={verde:'#4ADE80',vermelho:'#F87171',azul:'#60A5FA',roxo:'#C4B5FD',cinza:'#CBD5E1'};
  const el=document.createElement('div');
  el.style.cssText=`position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;background:${map[cor]||map.verde};border:1.5px solid ${bmap[cor]||bmap.verde};color:#fff;padding:10px 20px;border-radius:9px;font-size:13px;font-weight:600;font-family:'IBM Plex Sans',sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);white-space:nowrap;`;
  el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3000);
}

// ══ LOCALSTORAGE ═════════════════════════════════════════════════

function lsGet(k){
  try{ const s=localStorage.getItem(k); return s?JSON.parse(s):null; }catch(e){ return null; }
}
function lsSet(k,v){
  try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){}
}

function getClinicas(){
  try{ const s=localStorage.getItem(CLINICAS_KEY); return s?JSON.parse(s):[]; }catch(e){ return []; }
}
function setClinicas(cls){
  try{ localStorage.setItem(CLINICAS_KEY,JSON.stringify(cls)); }catch(e){}
}
function getPacientes(){
  try{ const s=localStorage.getItem(PAC_KEY); return s?JSON.parse(s):[]; }catch(e){ return []; }
}
function setPacientes(ps){
  try{ localStorage.setItem(PAC_KEY,JSON.stringify(ps)); }catch(e){}
}
function getWorklist(){
  try{ const s=localStorage.getItem(WL_KEY); return s?JSON.parse(s):[]; }catch(e){ return []; }
}
function setWorklist(wl){
  try{ localStorage.setItem(WL_KEY,JSON.stringify(wl)); }catch(e){}
}
function getHistorico(){
  try{ const s=localStorage.getItem(HIST_KEY); return s?JSON.parse(s):[]; }catch(e){ return []; }
}
function setHistorico(h){
  try{ localStorage.setItem(HIST_KEY,JSON.stringify(h)); }catch(e){}
}

// ══ SESSÃO (legado — mantido para compatibilidade) ═══════════════

function criarSessao(user){
  const expires=Date.now()+SESS_MINS*60000;
  const s={email:user.email,nome:user.nome||'',role:user.role||'user',expires};
  sessionStorage.setItem(SESS_KEY,JSON.stringify(s));return s;
}
function getSessao(){
  try{
    const s=JSON.parse(sessionStorage.getItem(SESS_KEY));
    if(!s) return null;
    if(Date.now()>s.expires){sessionStorage.removeItem(SESS_KEY);return null;}
    return s;
  }catch{return null;}
}
function renovarSessao(){
  const s=getSessao();if(!s) return;
  s.expires=Date.now()+SESS_MINS*60000;
  sessionStorage.setItem(SESS_KEY,JSON.stringify(s));
}

console.log('%c🫀 LEO v7 — Utils carregado','color:#2563EB;font-size:11px;');
