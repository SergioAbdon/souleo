// ══════════════════════════════════════════════════════════════════
// LEO v7 · Módulo 08 — Orquestrador de Laudos
// Carrega o motor correto baseado no tipo de exame
// ══════════════════════════════════════════════════════════════════

// Registro de motores disponíveis
const MOTORES_LAUDO = {};

// Registrar um motor
function registrarMotor(tipo, motor){
  MOTORES_LAUDO[tipo] = motor;
  console.log('%c🫀 Motor registrado: ' + tipo, 'color:#059669;font-size:11px;');
}

// Obter motor pelo tipo
function getMotor(tipo){
  return MOTORES_LAUDO[tipo] || null;
}

// Tipos de exame suportados
const TIPOS_EXAME = {
  'eco_tt':              { nome: 'Ecocardiograma Transtorácico',  motor: 'eco-tt',     feegowProcId: 9 },
  'doppler_carotidas':   { nome: 'Doppler de Carótidas',          motor: 'carotidas',  feegowProcId: 8 },
  'eco_te':              { nome: 'Ecocardiograma Transesofágico',  motor: 'eco-te',     feegowProcId: null },
  'eco_stress':          { nome: 'Ecocardiograma de Estresse',     motor: 'eco-stress', feegowProcId: null },
};

// Mapear procedimento_id do Feegow para tipoExame do LEO
function feegowProcToTipo(procId){
  for(const [tipo, cfg] of Object.entries(TIPOS_EXAME)){
    if(cfg.feegowProcId === procId) return tipo;
  }
  return null; // procedimento não é do LEO
}

// ══ INTERFACE DO MOTOR ═══════════════════════════════════════════
// Todo motor deve implementar:
//
//   motor.campos       → array de definições de campo [{id, nome, unidade, ref, grupo}]
//   motor.calcular(dados)     → {achados:[], conclusao:[], params:[]}
//   motor.gerarAchados(dados) → [{tipo:'texto', txt:'...'}]
//   motor.gerarConclusao(dados) → [{num:1, txt:'...'}]
//   motor.refVal(campo, sexo) → {min, max, unidade}
//   motor.renderSidebar(container) → preenche o formulário lateral
//   motor.renderPreview(container, dados) → renderiza A4

// ══ FUNÇÕES COMUNS (usadas por todos os motores) ═════════════════

function fmtVal(x, d){ return x === null || x === undefined || x === '' ? '' : Number(x).toFixed(d||0); }

function isAlert(txt){
  return /Disfunção|aumentado|Alteração|Hipertrofia|Insuficiência|Derrame|Estenose|Hipertensão|Miocardiopatia|Ectasia|Probabilidade/i.test(txt);
}

// Renderizar linha de achado
function renderLinha(txt, p1){
  const al = isAlert(txt);
  return `<div class="achado-linha${al?' alerta':''}" style="${al?'color:'+(p1||'var(--P1)')+';font-weight:500;':''}">${escH(txt)}</div>`;
}

// Renderizar conclusão numerada
function renderConcLinha(num, txt){
  return `<div class="conc-linha"><span class="conc-num">${num}.</span> <span class="conclusao-text" contenteditable="true">${escH(txt)}</span></div>`;
}

console.log('%c🫀 LEO v7 — Orquestrador de Laudos carregado','color:#2563EB;font-size:11px;');
