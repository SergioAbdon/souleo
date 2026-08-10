// ══════════════════════════════════════════════════════════════════
// LEO v7 · Motor: Ecocardiograma Transtorácico (ECO TT)
//
// PREMISSAS:
//   1. ENTRADA ABSTRATA — recebe objeto de medidas, não sabe a origem
//      (manual, USB, DICOM SR, Google Drive — tanto faz)
//   2. SAÍDA i18n — todos os textos via t() traduzível
//   3. DICOM-READY — campos mapeados aos códigos DICOM SR padrão
//
// INTERFACE:
//   motor.calcular(medidas)      → medidas + derivados calculados
//   motor.gerarAchados(dados)    → [{tipo, txt}]
//   motor.gerarConclusao(dados)  → [{num, txt}]
//   motor.campos                 → definição dos campos
//   motor.grupos                 → agrupamento dos campos
// ══════════════════════════════════════════════════════════════════

// ── SISTEMA DE TRADUÇÃO (i18n) ──────────────────────────────────

const ECO_IDIOMAS = {
  'pt-BR': {
    // Achados — Câmaras
    camaras_normais: 'Cavidades cardíacas com dimensões normais.',
    ae_aumentado: 'Átrio esquerdo aumentado ({valor} mm).',
    ve_dilatado: 'Ventrículo esquerdo dilatado ({valor} mm).',
    vd_dilatado: 'Ventrículo direito dilatado ({valor} mm).',
    ao_dilatada: 'Raiz aórtica dilatada ({valor} mm).',

    // Achados — Função sistólica
    fe_preservada: 'Função sistólica global do VE preservada (FE={fe}%).',
    fe_disf_leve: 'Disfunção sistólica leve do VE (FE={fe}%).',
    fe_disf_moderada: 'Disfunção sistólica moderada do VE (FE={fe}%).',
    fe_disf_grave: 'Disfunção sistólica grave do VE (FE={fe}%).',

    // Achados — Função diastólica
    diast_normal: 'Função diastólica do VE normal.',
    diast_grau1: 'Disfunção diastólica do VE grau I (relaxamento alterado).',
    diast_grau2: 'Disfunção diastólica do VE grau II (pseudonormal).',
    diast_grau3: 'Disfunção diastólica do VE grau III (restritivo).',

    // Achados — Valvas
    valvas_normais: 'Valvas cardíacas com morfologia e mobilidade normais.',
    fluxos_normais: 'Fluxos transvalvares com velocidades e gradientes normais.',
    insuf_mitral: 'Insuficiência mitral {grau}.',
    insuf_aortica: 'Insuficiência aórtica {grau}.',
    insuf_tricuspide: 'Insuficiência tricúspide {grau}.',
    insuf_pulmonar: 'Insuficiência pulmonar {grau}.',
    estenose_mitral: 'Estenose mitral {grau} (gradiente médio {grad} mmHg, área {area} cm²).',
    estenose_aortica: 'Estenose aórtica {grau} (gradiente máximo {grad} mmHg, área {area} cm²).',

    // Achados — Hipertrofia
    hipertrofia_leve: 'Hipertrofia ventricular esquerda leve (IMVE={imve} g/m²).',
    hipertrofia_moderada: 'Hipertrofia ventricular esquerda moderada (IMVE={imve} g/m²).',
    hipertrofia_grave: 'Hipertrofia ventricular esquerda grave (IMVE={imve} g/m²).',

    // Achados — PSAP
    psap_normal: 'Pressão sistólica da artéria pulmonar normal (PSAP={psap} mmHg).',
    psap_hp_leve: 'Hipertensão pulmonar leve (PSAP={psap} mmHg).',
    psap_hp_moderada: 'Hipertensão pulmonar moderada (PSAP={psap} mmHg).',
    psap_hp_grave: 'Hipertensão pulmonar grave (PSAP={psap} mmHg).',

    // Achados — Outros
    ritmo_sinusal: 'Ritmo cardíaco sinusal.',
    ritmo_fa: 'Ritmo de fibrilação atrial.',
    pericardio_normal: 'Pericárdio normal.',
    derrame_pericardico: 'Derrame pericárdico {grau}.',
    tapse_normal: 'Função sistólica do VD preservada (TAPSE={tapse} mm).',
    tapse_reduzido: 'Disfunção sistólica do VD (TAPSE={tapse} mm).',

    // Conclusão
    conc_fe_preservada: 'Função sistólica global do VE preservada (FE={fe}%)',
    conc_fe_disfuncao: 'Disfunção sistólica do VE {grau} (FE={fe}%)',
    conc_normal: 'Ecocardiograma dentro dos limites da normalidade',
    conc_hp: 'Hipertensão pulmonar {grau} (PSAP={psap} mmHg)',
    conc_insuf: 'Insuficiência {valva} {grau}',
    conc_estenose: 'Estenose {valva} {grau}',
    conc_hipertrofia: 'Hipertrofia ventricular esquerda {grau}',

    // Graus
    grau_leve: 'leve',
    grau_moderada: 'moderada',
    grau_grave: 'grave',
    grau_importante: 'importante',
    grau_discreta: 'discreta',
  },

  'en-US': {
    camaras_normais: 'Normal cardiac chamber dimensions.',
    ae_aumentado: 'Enlarged left atrium ({valor} mm).',
    ve_dilatado: 'Dilated left ventricle ({valor} mm).',
    vd_dilatado: 'Dilated right ventricle ({valor} mm).',
    ao_dilatada: 'Dilated aortic root ({valor} mm).',
    fe_preservada: 'Preserved global LV systolic function (EF={fe}%).',
    fe_disf_leve: 'Mild LV systolic dysfunction (EF={fe}%).',
    fe_disf_moderada: 'Moderate LV systolic dysfunction (EF={fe}%).',
    fe_disf_grave: 'Severe LV systolic dysfunction (EF={fe}%).',
    diast_normal: 'Normal LV diastolic function.',
    diast_grau1: 'Grade I diastolic dysfunction (impaired relaxation).',
    diast_grau2: 'Grade II diastolic dysfunction (pseudonormal).',
    diast_grau3: 'Grade III diastolic dysfunction (restrictive).',
    valvas_normais: 'Normal valve morphology and mobility.',
    fluxos_normais: 'Normal transvalvular flow velocities and gradients.',
    insuf_mitral: '{grau} mitral regurgitation.',
    insuf_aortica: '{grau} aortic regurgitation.',
    insuf_tricuspide: '{grau} tricuspid regurgitation.',
    estenose_mitral: '{grau} mitral stenosis (mean gradient {grad} mmHg, area {area} cm²).',
    estenose_aortica: '{grau} aortic stenosis (peak gradient {grad} mmHg, area {area} cm²).',
    psap_normal: 'Normal pulmonary artery systolic pressure (PASP={psap} mmHg).',
    psap_hp_leve: 'Mild pulmonary hypertension (PASP={psap} mmHg).',
    psap_hp_moderada: 'Moderate pulmonary hypertension (PASP={psap} mmHg).',
    psap_hp_grave: 'Severe pulmonary hypertension (PASP={psap} mmHg).',
    ritmo_sinusal: 'Sinus rhythm.',
    ritmo_fa: 'Atrial fibrillation.',
    pericardio_normal: 'Normal pericardium.',
    derrame_pericardico: '{grau} pericardial effusion.',
    tapse_normal: 'Preserved RV systolic function (TAPSE={tapse} mm).',
    tapse_reduzido: 'RV systolic dysfunction (TAPSE={tapse} mm).',
    conc_fe_preservada: 'Preserved global LV systolic function (EF={fe}%)',
    conc_fe_disfuncao: '{grau} LV systolic dysfunction (EF={fe}%)',
    conc_normal: 'Echocardiogram within normal limits',
    conc_hp: '{grau} pulmonary hypertension (PASP={psap} mmHg)',
    conc_insuf: '{grau} {valva} regurgitation',
    conc_estenose: '{grau} {valva} stenosis',
    conc_hipertrofia: '{grau} left ventricular hypertrophy',
    grau_leve: 'mild',
    grau_moderada: 'moderate',
    grau_grave: 'severe',
    grau_importante: 'severe',
    grau_discreta: 'mild',
  },

  'es': {
    camaras_normais: 'Cavidades cardíacas con dimensiones normales.',
    fe_preservada: 'Función sistólica global del VI preservada (FE={fe}%).',
    fe_disf_leve: 'Disfunción sistólica leve del VI (FE={fe}%).',
    fe_disf_moderada: 'Disfunción sistólica moderada del VI (FE={fe}%).',
    fe_disf_grave: 'Disfunción sistólica grave del VI (FE={fe}%).',
    conc_normal: 'Ecocardiograma dentro de los límites de la normalidad',
    ritmo_sinusal: 'Ritmo cardíaco sinusal.',
    pericardio_normal: 'Pericardio normal.',
    // ... expandir conforme necessidade
  },
};

let _ecoIdioma = 'pt-BR';

function ecoSetIdioma(lang){ _ecoIdioma = lang; }

function t(chave, params){
  const idioma = ECO_IDIOMAS[_ecoIdioma] || ECO_IDIOMAS['pt-BR'];
  let txt = idioma[chave] || ECO_IDIOMAS['pt-BR'][chave] || chave;
  if(params){
    Object.entries(params).forEach(([k,v])=>{
      txt = txt.replace(new RegExp('\\{'+k+'\\}','g'), v||'');
    });
  }
  return txt;
}

// ── MAPEAMENTO DICOM SR → CAMPOS LEO ────────────────────────────
// Códigos DICOM CID para eco adulto (TID 5200)

const DICOM_MAP = {
  // Código DICOM SR          →  Campo LEO
  '18083-6':  'dved',     // LVEDD (Left Ventricular End Diastolic Dimension)
  '18085-1':  'dves',     // LVESD
  '18157-8':  'sivd',     // IVSd (Interventricular Septum Diastole)
  '18159-4':  'ppved',    // LVPWd
  '18043-0':  'fe',       // LVEF
  '18010-9':  'ae',       // LA (Left Atrium)
  '18008-3':  'ao',       // Aortic Root
  '18148-7':  'vd',       // RVEDD
  '18036-4':  'tapse',    // TAPSE
  '18044-8':  'vmax_ao',  // Aortic Peak Velocity
  '18045-5':  'grad_max_ao', // Aortic Peak Gradient
  '18046-3':  'grad_med_ao', // Aortic Mean Gradient
  '18047-1':  'area_ao',  // Aortic Valve Area
  '18060-4':  'onda_e',   // Mitral E Velocity
  '18061-2':  'onda_a',   // Mitral A Velocity
  '18029-9':  'psap',     // PASP (Pulmonary Artery Systolic Pressure)
};

// Converter DICOM SR para objeto de medidas LEO
function dicomSRToMedidas(dicomData){
  const medidas = {};
  if(dicomData && dicomData.measurements){
    Object.entries(dicomData.measurements).forEach(([code, value])=>{
      const campo = DICOM_MAP[code];
      if(campo) medidas[campo] = value;
    });
  }
  // Dados do paciente
  if(dicomData.patientName) medidas._pacienteNome = dicomData.patientName;
  if(dicomData.patientID) medidas._pacienteID = dicomData.patientID;
  if(dicomData.studyDate) medidas._dataExame = dicomData.studyDate;
  return medidas;
}

// ── CAMPOS DO EXAME ─────────────────────────────────────────────

const MotorEcoTT = {

  tipo: 'eco_tt',
  nome: 'Ecocardiograma Transtorácico',
  versao: '2.0',

  campos: [
    // Medidas Gerais
    {id:'peso', nome:'Peso', unidade:'kg', grupo:'geral'},
    {id:'altura', nome:'Altura', unidade:'cm', grupo:'geral'},
    {id:'asc', nome:'ASC', unidade:'m²', grupo:'geral', calc:true},
    {id:'imc', nome:'IMC', unidade:'kg/m²', grupo:'geral', calc:true},

    // Aorta e Átrio Esquerdo
    {id:'ao', nome:'Aorta', unidade:'mm', grupo:'raiz', ref:{M:{min:20,max:37},F:{min:20,max:37}}, dicom:'18008-3'},
    {id:'ae', nome:'Átrio Esquerdo', unidade:'mm', grupo:'raiz', ref:{M:{min:27,max:38},F:{min:27,max:38}}, dicom:'18010-9'},

    // Ventrículo Esquerdo
    {id:'dved', nome:'VE diástole', unidade:'mm', grupo:'ve', ref:{M:{min:42,max:58},F:{min:38,max:52}}, dicom:'18083-6'},
    {id:'dves', nome:'VE sístole', unidade:'mm', grupo:'ve', ref:{M:{min:25,max:40},F:{min:22,max:35}}, dicom:'18085-1'},
    {id:'sivd', nome:'Septo IV diástole', unidade:'mm', grupo:'ve', ref:{M:{min:6,max:10},F:{min:6,max:9}}, dicom:'18157-8'},
    {id:'ppved', nome:'Parede post. diástole', unidade:'mm', grupo:'ve', ref:{M:{min:6,max:10},F:{min:6,max:9}}, dicom:'18159-4'},

    // Função Sistólica
    {id:'fe', nome:'Fração de Ejeção', unidade:'%', grupo:'funcao', ref:{M:{min:52,max:72},F:{min:54,max:74}}, dicom:'18043-0'},
    {id:'fs', nome:'Fração encurtamento', unidade:'%', grupo:'funcao', calc:true},

    // Função Diastólica
    {id:'onda_e', nome:'Onda E mitral', unidade:'cm/s', grupo:'diast', dicom:'18060-4'},
    {id:'onda_a', nome:'Onda A mitral', unidade:'cm/s', grupo:'diast', dicom:'18061-2'},
    {id:'rel_ea', nome:'Relação E/A', unidade:'', grupo:'diast', calc:true},
    {id:'td', nome:'Tempo desaceleração', unidade:'ms', grupo:'diast'},
    {id:'e_linha', nome:"E' septal", unidade:'cm/s', grupo:'diast'},
    {id:'rel_e_elinha', nome:"E/E'", unidade:'', grupo:'diast', calc:true},

    // Ventrículo Direito
    {id:'vd', nome:'VD basal', unidade:'mm', grupo:'vd', ref:{M:{min:20,max:35},F:{min:20,max:35}}, dicom:'18148-7'},
    {id:'tapse', nome:'TAPSE', unidade:'mm', grupo:'vd', ref:{M:{min:17,max:99},F:{min:17,max:99}}, dicom:'18036-4'},

    // Valva Aórtica
    {id:'vmax_ao', nome:'Vel máx aórtica', unidade:'m/s', grupo:'valva_ao', dicom:'18044-8'},
    {id:'grad_max_ao', nome:'Grad máx aórtico', unidade:'mmHg', grupo:'valva_ao', dicom:'18045-5'},
    {id:'grad_med_ao', nome:'Grad méd aórtico', unidade:'mmHg', grupo:'valva_ao', dicom:'18046-3'},
    {id:'area_ao', nome:'Área valvar aórtica', unidade:'cm²', grupo:'valva_ao', dicom:'18047-1'},
    {id:'insuf_ao', nome:'Insuficiência aórtica', unidade:'grau', grupo:'valva_ao'},

    // Valva Mitral
    {id:'grad_max_mi', nome:'Grad máx mitral', unidade:'mmHg', grupo:'valva_mi'},
    {id:'grad_med_mi', nome:'Grad méd mitral', unidade:'mmHg', grupo:'valva_mi'},
    {id:'area_mi', nome:'Área valvar mitral', unidade:'cm²', grupo:'valva_mi'},
    {id:'insuf_mi', nome:'Insuficiência mitral', unidade:'grau', grupo:'valva_mi'},

    // Valva Tricúspide
    {id:'insuf_tri', nome:'Insuficiência tricúspide', unidade:'grau', grupo:'valva_tri'},
    {id:'vel_it', nome:'Vel insuf tricúspide', unidade:'m/s', grupo:'valva_tri'},
    {id:'psap', nome:'PSAP', unidade:'mmHg', grupo:'valva_tri', dicom:'18029-9'},

    // Valva Pulmonar
    {id:'insuf_pulm', nome:'Insuficiência pulmonar', unidade:'grau', grupo:'valva_pulm'},

    // Pericárdio
    {id:'derrame_peri', nome:'Derrame pericárdico', unidade:'', grupo:'pericardio'},

    // Derivados
    {id:'massa_ve', nome:'Massa VE', unidade:'g', grupo:'ve', calc:true},
    {id:'imve', nome:'Índice massa VE', unidade:'g/m²', grupo:'ve', calc:true},
  ],

  grupos: [
    {id:'geral', nome:'Medidas Gerais'},
    {id:'raiz', nome:'Aorta e Átrio Esquerdo'},
    {id:'ve', nome:'Ventrículo Esquerdo'},
    {id:'funcao', nome:'Função Sistólica'},
    {id:'diast', nome:'Função Diastólica'},
    {id:'vd', nome:'Ventrículo Direito'},
    {id:'valva_ao', nome:'Valva Aórtica'},
    {id:'valva_mi', nome:'Valva Mitral'},
    {id:'valva_tri', nome:'Valva Tricúspide'},
    {id:'valva_pulm', nome:'Valva Pulmonar'},
    {id:'pericardio', nome:'Pericárdio'},
  ],

  // ── CÁLCULOS DERIVADOS ────────────────────────────────────────

  calcular: function(d){
    const r = {...d};
    // ASC (Dubois)
    if(d.peso && d.altura){
      const h = d.altura > 3 ? d.altura/100 : d.altura;
      r.asc = (0.007184 * Math.pow(d.peso, 0.425) * Math.pow(h*100, 0.725)).toFixed(2);
      r.imc = (d.peso / (h*h)).toFixed(1);
    }
    // Fração encurtamento
    if(d.dved && d.dves) r.fs = (((d.dved-d.dves)/d.dved)*100).toFixed(0);
    // Relação E/A
    if(d.onda_e && d.onda_a && d.onda_a>0) r.rel_ea = (d.onda_e/d.onda_a).toFixed(1);
    // E/E'
    if(d.onda_e && d.e_linha && d.e_linha>0) r.rel_e_elinha = (d.onda_e/d.e_linha).toFixed(1);
    // Massa VE (Devereux)
    if(d.dved && d.sivd && d.ppved){
      r.massa_ve = (0.8*(1.04*(Math.pow(Number(d.dved)/10+Number(d.sivd)/10+Number(d.ppved)/10,3)-Math.pow(Number(d.dved)/10,3)))+0.6).toFixed(0);
      if(r.asc>0) r.imve = (r.massa_ve / r.asc).toFixed(0);
    }
    return r;
  },

  // ── REFERÊNCIA POR SEXO ───────────────────────────────────────

  refVal: function(campoId, sexo){
    const campo = this.campos.find(c=>c.id===campoId);
    if(!campo || !campo.ref) return null;
    return campo.ref[sexo==='F'?'F':'M'] || campo.ref.M;
  },

  dentroRef: function(campoId, valor, sexo){
    const ref = this.refVal(campoId, sexo);
    if(!ref) return true;
    return Number(valor) >= ref.min && Number(valor) <= ref.max;
  },

  // ── GERAR ACHADOS (i18n) ──────────────────────────────────────

  gerarAchados: function(d){
    const achados = [];
    const s = d.sexo === 'F' ? 'F' : 'M';
    const fe = Number(d.fe) || 0;

    // Ritmo
    if(d.ritmo === 'FA') achados.push({tipo:'texto', txt: t('ritmo_fa')});
    else achados.push({tipo:'texto', txt: t('ritmo_sinusal')});

    // Câmaras
    const aeOk = !d.ae || this.dentroRef('ae',d.ae,s);
    const veOk = !d.dved || this.dentroRef('dved',d.dved,s);
    const vdOk = !d.vd || this.dentroRef('vd',d.vd,s);
    const aoOk = !d.ao || this.dentroRef('ao',d.ao,s);

    if(aeOk && veOk && vdOk && aoOk){
      achados.push({tipo:'texto', txt: t('camaras_normais')});
    } else {
      if(!aeOk) achados.push({tipo:'texto', txt: t('ae_aumentado',{valor:d.ae}), alerta:true});
      if(!veOk) achados.push({tipo:'texto', txt: t('ve_dilatado',{valor:d.dved}), alerta:true});
      if(!vdOk) achados.push({tipo:'texto', txt: t('vd_dilatado',{valor:d.vd}), alerta:true});
      if(!aoOk) achados.push({tipo:'texto', txt: t('ao_dilatada',{valor:d.ao}), alerta:true});
    }

    // Função sistólica
    if(fe > 0){
      if(fe >= 52) achados.push({tipo:'texto', txt: t('fe_preservada',{fe})});
      else if(fe >= 41) achados.push({tipo:'texto', txt: t('fe_disf_leve',{fe}), alerta:true});
      else if(fe >= 30) achados.push({tipo:'texto', txt: t('fe_disf_moderada',{fe}), alerta:true});
      else achados.push({tipo:'texto', txt: t('fe_disf_grave',{fe}), alerta:true});
    }

    // Função diastólica
    const ea = Number(d.rel_ea) || 0;
    const eelinha = Number(d.rel_e_elinha) || 0;
    if(ea > 0){
      if(ea >= 0.8 && ea <= 2.0 && eelinha < 14) achados.push({tipo:'texto', txt: t('diast_normal')});
      else if(ea < 0.8) achados.push({tipo:'texto', txt: t('diast_grau1')});
      else if(eelinha >= 14) achados.push({tipo:'texto', txt: t('diast_grau2'), alerta:true});
    }

    // Valvas
    const temInsuf = d.insuf_mi || d.insuf_ao || d.insuf_tri || d.insuf_pulm;
    const temEstenose = d.grad_max_ao > 20 || d.grad_med_mi > 4;
    if(!temInsuf && !temEstenose){
      achados.push({tipo:'texto', txt: t('valvas_normais')});
      achados.push({tipo:'texto', txt: t('fluxos_normais')});
    } else {
      if(d.insuf_mi && d.insuf_mi !== 'ausente') achados.push({tipo:'texto', txt: t('insuf_mitral',{grau:d.insuf_mi}), alerta:true});
      if(d.insuf_ao && d.insuf_ao !== 'ausente') achados.push({tipo:'texto', txt: t('insuf_aortica',{grau:d.insuf_ao}), alerta:true});
      if(d.insuf_tri && d.insuf_tri !== 'ausente') achados.push({tipo:'texto', txt: t('insuf_tricuspide',{grau:d.insuf_tri})});
    }

    // Hipertrofia
    const imve = Number(d.imve) || 0;
    if(imve > 0){
      const limM = s==='F' ? 95 : 115;
      if(imve > limM * 1.4) achados.push({tipo:'texto', txt: t('hipertrofia_grave',{imve}), alerta:true});
      else if(imve > limM * 1.2) achados.push({tipo:'texto', txt: t('hipertrofia_moderada',{imve}), alerta:true});
      else if(imve > limM) achados.push({tipo:'texto', txt: t('hipertrofia_leve',{imve}), alerta:true});
    }

    // TAPSE
    const tapse = Number(d.tapse) || 0;
    if(tapse > 0){
      if(tapse >= 17) achados.push({tipo:'texto', txt: t('tapse_normal',{tapse})});
      else achados.push({tipo:'texto', txt: t('tapse_reduzido',{tapse}), alerta:true});
    }

    // PSAP
    const psap = Number(d.psap) || 0;
    if(psap > 0){
      if(psap <= 35) achados.push({tipo:'texto', txt: t('psap_normal',{psap})});
      else if(psap <= 50) achados.push({tipo:'texto', txt: t('psap_hp_leve',{psap}), alerta:true});
      else if(psap <= 65) achados.push({tipo:'texto', txt: t('psap_hp_moderada',{psap}), alerta:true});
      else achados.push({tipo:'texto', txt: t('psap_hp_grave',{psap}), alerta:true});
    }

    // Pericárdio
    if(d.derrame_peri && d.derrame_peri !== '' && d.derrame_peri !== 'ausente'){
      achados.push({tipo:'texto', txt: t('derrame_pericardico',{grau:d.derrame_peri}), alerta:true});
    } else {
      achados.push({tipo:'texto', txt: t('pericardio_normal')});
    }

    return achados;
  },

  // ── GERAR CONCLUSÃO (i18n) ────────────────────────────────────

  gerarConclusao: function(d){
    const concs = [];
    let n = 1;
    const fe = Number(d.fe) || 0;
    const psap = Number(d.psap) || 0;
    const imve = Number(d.imve) || 0;
    const s = d.sexo === 'F' ? 'F' : 'M';

    // FE
    if(fe > 0){
      if(fe >= 52) concs.push({num:n++, txt: t('conc_fe_preservada',{fe})});
      else{
        const grau = fe >= 41 ? t('grau_leve') : fe >= 30 ? t('grau_moderada') : t('grau_grave');
        concs.push({num:n++, txt: t('conc_fe_disfuncao',{grau,fe})});
      }
    }

    // PSAP
    if(psap > 35){
      const grau = psap <= 50 ? t('grau_leve') : psap <= 65 ? t('grau_moderada') : t('grau_grave');
      concs.push({num:n++, txt: t('conc_hp',{grau,psap})});
    }

    // Insuficiências
    if(d.insuf_mi && d.insuf_mi !== 'ausente') concs.push({num:n++, txt: t('conc_insuf',{valva:'mitral',grau:d.insuf_mi})});
    if(d.insuf_ao && d.insuf_ao !== 'ausente') concs.push({num:n++, txt: t('conc_insuf',{valva:'aórtica',grau:d.insuf_ao})});

    // Hipertrofia
    const limM = s==='F' ? 95 : 115;
    if(imve > limM){
      const grau = imve > limM*1.4 ? t('grau_grave') : imve > limM*1.2 ? t('grau_moderada') : t('grau_leve');
      concs.push({num:n++, txt: t('conc_hipertrofia',{grau})});
    }

    // Normal
    if(!concs.length) concs.push({num:1, txt: t('conc_normal')});

    return concs;
  },

  // ── IMPORTAR DE DICOM SR ──────────────────────────────────────

  importarDICOM: dicomSRToMedidas,

  // ── IDIOMA ────────────────────────────────────────────────────

  setIdioma: ecoSetIdioma,
  getIdiomasDisponiveis: ()=> Object.keys(ECO_IDIOMAS),
};

// Registrar no orquestrador
if(typeof registrarMotor === 'function') registrarMotor('eco_tt', MotorEcoTT);

console.log('%c🫀 Motor ECO TT v2.0 carregado — i18n (' + Object.keys(ECO_IDIOMAS).join(', ') + ') · DICOM-ready (' + Object.keys(DICOM_MAP).length + ' campos mapeados) · ' + MotorEcoTT.campos.length + ' parâmetros', 'color:#059669;font-weight:bold;font-size:11px;');
