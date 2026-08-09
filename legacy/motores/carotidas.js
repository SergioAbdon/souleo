// ══════════════════════════════════════════════════════════════════
// LEO v7 · Motor: Doppler de Carótidas
// Projeto ISOLADO — funciona sem Firebase, sem dashboard
// ══════════════════════════════════════════════════════════════════

const MotorCarotidas = {

  tipo: 'doppler_carotidas',
  nome: 'Doppler de Carótidas e Vertebrais',

  // ── CAMPOS DO EXAME ──────────────────────────────────────────
  campos: [
    // Carótida Comum Direita
    {id:'ccd_eim', nome:'EIM CCD', unidade:'mm', grupo:'ccd', ref:{min:0,max:1.0}},
    {id:'ccd_vps', nome:'VPS CCD', unidade:'cm/s', grupo:'ccd'},
    {id:'ccd_vdf', nome:'VDF CCD', unidade:'cm/s', grupo:'ccd'},
    {id:'ccd_ir', nome:'IR CCD', unidade:'', grupo:'ccd'},
    {id:'ccd_placa', nome:'Placa CCD', unidade:'', grupo:'ccd'},

    // Carótida Interna Direita
    {id:'cid_vps', nome:'VPS CID', unidade:'cm/s', grupo:'cid'},
    {id:'cid_vdf', nome:'VDF CID', unidade:'cm/s', grupo:'cid'},
    {id:'cid_ir', nome:'IR CID', unidade:'', grupo:'cid'},
    {id:'cid_estenose', nome:'Estenose CID', unidade:'%', grupo:'cid'},
    {id:'cid_placa', nome:'Placa CID', unidade:'', grupo:'cid'},

    // Carótida Externa Direita
    {id:'ced_vps', nome:'VPS CED', unidade:'cm/s', grupo:'ced'},

    // Vertebral Direita
    {id:'vd_vps', nome:'VPS Vert D', unidade:'cm/s', grupo:'vertd'},
    {id:'vd_fluxo', nome:'Fluxo Vert D', unidade:'', grupo:'vertd'},

    // Carótida Comum Esquerda
    {id:'cce_eim', nome:'EIM CCE', unidade:'mm', grupo:'cce', ref:{min:0,max:1.0}},
    {id:'cce_vps', nome:'VPS CCE', unidade:'cm/s', grupo:'cce'},
    {id:'cce_vdf', nome:'VDF CCE', unidade:'cm/s', grupo:'cce'},
    {id:'cce_ir', nome:'IR CCE', unidade:'', grupo:'cce'},
    {id:'cce_placa', nome:'Placa CCE', unidade:'', grupo:'cce'},

    // Carótida Interna Esquerda
    {id:'cie_vps', nome:'VPS CIE', unidade:'cm/s', grupo:'cie'},
    {id:'cie_vdf', nome:'VDF CIE', unidade:'cm/s', grupo:'cie'},
    {id:'cie_ir', nome:'IR CIE', unidade:'', grupo:'cie'},
    {id:'cie_estenose', nome:'Estenose CIE', unidade:'%', grupo:'cie'},
    {id:'cie_placa', nome:'Placa CIE', unidade:'', grupo:'cie'},

    // Carótida Externa Esquerda
    {id:'cee_vps', nome:'VPS CEE', unidade:'cm/s', grupo:'cee'},

    // Vertebral Esquerda
    {id:'ve_vps', nome:'VPS Vert E', unidade:'cm/s', grupo:'verte'},
    {id:'ve_fluxo', nome:'Fluxo Vert E', unidade:'', grupo:'verte'},
  ],

  grupos: [
    {id:'ccd', nome:'Carótida Comum Direita'},
    {id:'cid', nome:'Carótida Interna Direita'},
    {id:'ced', nome:'Carótida Externa Direita'},
    {id:'vertd', nome:'Vertebral Direita'},
    {id:'cce', nome:'Carótida Comum Esquerda'},
    {id:'cie', nome:'Carótida Interna Esquerda'},
    {id:'cee', nome:'Carótida Externa Esquerda'},
    {id:'verte', nome:'Vertebral Esquerda'},
  ],

  // ── CLASSIFICAÇÃO DE ESTENOSE (NASCET/ECST) ─────────────────
  classificarEstenose: function(pct){
    if(!pct || pct === 0) return {grau:'Normal', cor:'green'};
    if(pct < 50) return {grau:'Leve (<50%)', cor:'green'};
    if(pct < 70) return {grau:'Moderada (50-69%)', cor:'orange'};
    if(pct < 99) return {grau:'Grave (70-99%)', cor:'red'};
    return {grau:'Oclusão', cor:'red'};
  },

  // ── GERAR ACHADOS ────────────────────────────────────────────
  gerarAchados: function(d){
    const achados = [];

    // EIM (Espessura Íntima-Média)
    const eimD = d.ccd_eim ? Number(d.ccd_eim) : null;
    const eimE = d.cce_eim ? Number(d.cce_eim) : null;
    if(eimD !== null || eimE !== null){
      const maxEim = Math.max(eimD||0, eimE||0);
      if(maxEim <= 1.0) achados.push({tipo:'texto', txt:'Espessura íntima-média dentro dos limites normais (D:'+T(eimD,1)+' / E:'+T(eimE,1)+' mm).'});
      else achados.push({tipo:'texto', txt:'Espessamento intimal (D:'+T(eimD,1)+' / E:'+T(eimE,1)+' mm).'});
    }

    // Placas
    ['ccd','cid','cce','cie'].forEach(art=>{
      const placa = d[art+'_placa'];
      const nomes = {ccd:'carótida comum direita',cid:'carótida interna direita',cce:'carótida comum esquerda',cie:'carótida interna esquerda'};
      if(placa && placa !== '' && placa !== 'ausente'){
        achados.push({tipo:'texto', txt:'Placa ateromatosa em '+nomes[art]+': '+placa+'.'});
      }
    });

    // Estenoses
    ['cid','cie'].forEach(art=>{
      const est = d[art+'_estenose'] ? Number(d[art+'_estenose']) : 0;
      const nomes = {cid:'carótida interna direita',cie:'carótida interna esquerda'};
      if(est > 0){
        const cls = this.classificarEstenose(est);
        achados.push({tipo:'texto', txt:'Estenose '+cls.grau+' em '+nomes[art]+' ('+est+'%).'});
      }
    });

    // Vertebrais
    ['vd','ve'].forEach(art=>{
      const fluxo = d[art+'_fluxo'];
      const nomes = {vd:'vertebral direita',ve:'vertebral esquerda'};
      if(fluxo && fluxo !== 'anterógrado'){
        achados.push({tipo:'texto', txt:'Fluxo '+fluxo+' em '+nomes[art]+'.'});
      }
    });

    if(!achados.length) achados.push({tipo:'texto', txt:'Estudo Doppler de carótidas e vertebrais sem alterações significativas.'});

    return achados;
  },

  // ── GERAR CONCLUSÃO ──────────────────────────────────────────
  gerarConclusao: function(d){
    const concs = [];
    let n = 1;

    const estD = d.cid_estenose ? Number(d.cid_estenose) : 0;
    const estE = d.cie_estenose ? Number(d.cie_estenose) : 0;
    const maxEst = Math.max(estD, estE);

    if(maxEst === 0){
      concs.push({num:n++, txt:'Doppler de carótidas e vertebrais sem estenoses significativas'});
    } else {
      if(estD > 0) concs.push({num:n++, txt:'Estenose '+this.classificarEstenose(estD).grau+' em carótida interna direita'});
      if(estE > 0) concs.push({num:n++, txt:'Estenose '+this.classificarEstenose(estE).grau+' em carótida interna esquerda'});
    }

    const eimD = d.ccd_eim ? Number(d.ccd_eim) : 0;
    const eimE = d.cce_eim ? Number(d.cce_eim) : 0;
    if(Math.max(eimD,eimE) > 1.0) concs.push({num:n++, txt:'Espessamento intimal'});

    return concs;
  },

  calcular: function(d){ return d; }, // sem cálculos derivados por enquanto
  refVal: function(campoId, sexo){
    const campo = this.campos.find(c=>c.id===campoId);
    return campo?.ref || null;
  },
};

// Registrar
if(typeof registrarMotor === 'function') registrarMotor('doppler_carotidas', MotorCarotidas);

console.log('%c🫀 Motor Carótidas carregado (' + MotorCarotidas.campos.length + ' campos)', 'color:#059669;font-weight:bold;font-size:11px;');
