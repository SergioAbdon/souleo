// ══════════════════════════════════════════════════════════════════
// LEO v7 · MOTOR V8 MP4 — Ecocardiograma Transtorácico
// Evolução do Motor V6 original (laudo_leo_v6.html)
// Motor completo: 50+ inferências (j2-j50), diastologia auto/manual (ASE 2025),
// classificação aórtica por DP, speckle tracking strain (GLS VE, GLS VD, LARS),
// FA com 4 critérios, Wilkins score, DICOM-ready, i18n-prepared.
//
// INTERFACE COM O ORQUESTRADOR:
//   - calc()           → recalcula tudo e renderiza o laudo
//   - calcAll()        → retorna objeto com todos os dados calculados
//   - gerarAchados(d)  → retorna array de achados clínicos
//   - gerarConclusao(d)→ retorna array de conclusões (dedução automática: sem itens = normal)
//   - renderizarLaudo(d) → renderiza no HTML (A4 preview)
//
// DEPENDÊNCIAS DO DOM:
//   - Inputs: b7-b62, peso, altura, sexo, ritmo, wilkins-toggle, gls_ve, gls_vd, lars
//   - Outputs: #achados-body, #conclusao-list, #params-tbody
//   - Helpers: escH() do 02-utils.js
//
// PARA ACOPLAR NO V7:
//   1. Incluir este arquivo via <script src="motores/motorv8mp4.js">
//   2. O HTML da sidebar com os campos de medida deve existir
//   3. Chamar calc() quando qualquer campo mudar
// ══════════════════════════════════════════════════════════════════

// UTILITÁRIOS
// ══════════════════════════════════════════════════════════════════
const v  = id => { const el=document.getElementById(id); return el?el.value:''; };
const n  = id => { const x=parseFloat(v(id)); return isNaN(x)?null:x; };
const T  = (x,d) => Math.trunc(x*Math.pow(10,d))/Math.pow(10,d);
const tog = id => document.getElementById(id).classList.toggle('collapsed');

// Preencher dropdowns de paredes com opções completas
const WALL_OPTS = `<option value="">— Normal —</option>
<option value="HB">HB — Hipocin. basal</option>
<option value="HMB">HMB — Hipocin. médiobasal</option>
<option value="HM">HM — Hipocin. média</option>
<option value="HMA">HMA — Hipocin. médioapical</option>
<option value="HA">HA — Hipocin. apical</option>
<option value="H">H — Hipocinesia difusa</option>
<option value="AB">AB — Acinesia basal</option>
<option value="AMB">AMB — Acinesia médiobasal</option>
<option value="AM">AM — Acinesia média</option>
<option value="AMA">AMA — Acinesia médioapical</option>
<option value="AA">AA — Acinesia apical</option>
<option value="A">A — Acinesia difusa</option>
<option value="DB">DB — Discinesia basal</option>
<option value="DMB">DMB — Discinesia médiobasal</option>
<option value="DM">DM — Discinesia média</option>
<option value="DMA">DMA — Discinesia médioapical</option>
<option value="DA">DA — Discinesia apical</option>
<option value="D">D — Discinesia difusa</option>`;
['b56','b57','b58','b59','b60','b61'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.innerHTML=WALL_OPTS;
});

// ══════════════════════════════════════════════════════════════════
// CÁLCULOS
// ══════════════════════════════════════════════════════════════════
function calcAll(){
  const sexo=v('sexo'), ritmo=v('ritmo'), b27=v('b27'), b32=v('b32');
  const b34=v('b34'), b35=v('b35'), b36=v('b36'), b38=v('b38');
  const b39=v('b39'), b40=v('b40'), b41=v('b41'), b42=v('b42');
  const b55=v('b55'), b56=v('b56'), b57=v('b57'), b58=v('b58');
  const b59=v('b59'), b60=v('b60'), b61=v('b61'), b62=v('b62');
  const peso=n('peso'), alt=n('altura');
  const b7=n('b7'), b8=n('b8'), b9=n('b9'), b10=n('b10'), b11=n('b11');
  const b12=n('b12'), b13=n('b13'), b19=n('b19'), b20=n('b20');
  const b21=n('b21'), b22=n('b22'), b23=n('b23'), b24=n('b24'), b25=n('b25');
  const b28=n('b28'), b29=n('b29'), b33=n('b33'), b37=n('b37');
  const b45=n('b45'), b46=n('b46'), b47=n('b47');
  const b50=n('b50'), b51=n('b51'), b52=n('b52'), b54=n('b54');
  const b34t=v('b34t'), b39p=v('b39p'), b40p=v('b40p');
  const b46t=n('b46t'), b47t=n('b47t'), b50p=n('b50p'), psmap=n('psmap');
  // Strain (speckle tracking) — opcionais, só se preenchidos
  const glsVE=n('gls_ve');   // GLS do VE (valor negativo, ex: -21)
  const glsVD=n('gls_vd');   // GLS do VD (valor negativo, ex: -24)
  const lars=n('lars');       // LA reservoir strain (valor positivo, ex: 22)
  const wilkinsOn=document.getElementById('wilkins-toggle')?.checked||false;
  const wkMob=wilkinsOn?parseInt(v('wk-mob')||0):0;
  const wkEsp=wilkinsOn?parseInt(v('wk-esp')||0):0;
  const wkCal=wilkinsOn?parseInt(v('wk-cal')||0):0;
  const wkSub=wilkinsOn?parseInt(v('wk-sub')||0):0;
  const wilkinsScore=wilkinsOn?(wkMob+wkEsp+wkCal+wkSub):null;

  const imc  = (peso&&alt) ? T(peso/((alt/100)**2),1) : null;
  const asc  = (peso&&alt) ? T(0.0001*71.74*Math.pow(peso,0.425)*Math.pow(alt,0.725),2) : null;
  const aoae = (b7&&b8)    ? T(b7/b8,2) : null;
  const vdf  = b9  ? T(((b9/10)**3*7)/(2.4+b9/10),1)  : null;
  const vsf  = b12 ? T(((b12/10)**3*7)/(2.4+b12/10),1): null;
  const feT  = (b9&&b12) ? (((b9**3)*7/(2.4+b9/10)-(b12**3)*7/(2.4+b12/10))/((b9**3)*7/(2.4+b9/10))) : null;
  const fs   = (b9&&b12) ? (b9-b12)/b9 : null;
  const massa= (b9&&b10&&b11) ? T(((((b9+b10+b11)**3-b9**3)*1.04)*0.8+0.6)/1000,1) : null;
  const imVE = (massa&&asc) ? T(massa/asc,1) : null;
  const er   = (b9&&b10&&b11) ? T((b10+b11)/b9,2) : null;
  const aoIdx= (b52&&asc) ? T(b52/asc,2) : null;

  // Gradiente mitral classificado (para conclusão)
  let estenMitGrau='';
  if(b46!==null){
    if(b46>10) estenMitGrau='importante';
    else if(b46>=5) estenMitGrau='moderada';
    else if(b46>0) estenMitGrau='leve';
  }
  if(!estenMitGrau && b47!==null){
    if(b47<1) estenMitGrau='importante';
    else if(b47<1.5) estenMitGrau='moderada';
    else if(b47<=2) estenMitGrau='leve';
  }

  // Gradiente aórtico classificado
  let estenAoGrau='';
  if(b50!==null){
    if(b50>=64) estenAoGrau='importante';
    else if(b50>=36) estenAoGrau='moderada';
    else if(b50>=27) estenAoGrau='leve';
    else if(b50>=16) estenAoGrau='esclerose';
  }
  if(!estenAoGrau && b51!==null){
    if(b51>40) estenAoGrau='importante';
    else if(b51>=20) estenAoGrau='moderada';
    else if(b51>0) estenAoGrau='leve';
  }
  if(!estenAoGrau && b52!==null){
    if(b52<1) estenAoGrau='importante';
    else if(b52<1.5) estenAoGrau='moderada';
  }

  return {
    sexo,ritmo,b27,b32,b33,b34,b35,b36,b37,b38,b39,b40,b41,b42,
    b55,b56,b57,b58,b59,b60,b61,b62,
    peso,alt,imc,asc,aoae,b7,b8,b9,b10,b11,b12,b13,
    b19,b20,b21,b22,b23,b24,b25,b28,b29,
    b45,b46,b47,b50,b51,b52,b54,
    vdf,vsf,feT,fs,massa,imVE,er,aoIdx,
    estenMitGrau, estenAoGrau,
    b34t, b39p, b40p, b46t, b47t, b50p, psmap,
    wilkinsOn, wilkinsScore, wkMob, wkEsp, wkSub, wkCal,
    estenTricGrau: calcEstenTric(n('b46t'), n('b47t')),
    estenPulmGrau: calcEstenPulm(n('b50p')),
    glsVE, glsVD, lars,
    dtnasc: v('dtnasc'), dtexame: v('dtexame'),
  };
}

// ══════════════════════════════════════════════════════════════════
// FÓRMULAS — TRADUÇÃO FIEL DA PLANILHA
// ══════════════════════════════════════════════════════════════════
function j2(d){ return d.ritmo==='N'?'Ritmo cardíaco irregular.':'Ritmo cardíaco regular.'; }

function j3(d){
  if(d.b24!==null&&d.b24>0) return '';
  if(!d.b8||!d.sexo) return '';
  if(d.sexo==='M'){
    if(d.b8>52) return 'Átrio esquerdo aumentado em grau importante.';
    if(d.b8===52) return 'Átrio esquerdo aumentado em grau moderado a importante.';
    if(d.b8>46) return 'Átrio esquerdo aumentado em grau moderado.';
    if(d.b8===46) return 'Átrio esquerdo aumentado em grau leve a moderado.';
    if(d.b8>40) return 'Átrio esquerdo aumentado em grau leve.';
  } else {
    if(d.b8>46) return 'Átrio esquerdo aumentado em grau importante.';
    if(d.b8===46) return 'Átrio esquerdo aumentado em grau moderado a importante.';
    if(d.b8>42) return 'Átrio esquerdo aumentado em grau moderado.';
    if(d.b8===42) return 'Átrio esquerdo aumentado em grau leve a moderado.';
    if(d.b8>38) return 'Átrio esquerdo aumentado em grau leve.';
  }
  return '';
}

function j4(d){
  if(d.b24===null||d.b24<=0) return '';
  if(d.b24>=48) return `Átrio esquerdo aumentado em grau importante. Volume index de ${d.b24} ml/m².`;
  if(d.b24>=42) return `Átrio esquerdo aumentado em grau moderado. Volume index de ${d.b24} ml/m².`;
  if(d.b24>34)  return `Átrio esquerdo aumentado em grau leve. Volume index de ${d.b24} ml/m².`;
  return '';
}

function j5(d){
  if(d.b25===null||d.b25===0) return '';
  if(d.sexo==='F'){
    if(d.b25<=27) return ''; if(d.b25<=33) return 'Átrio direito aumentado em grau leve.';
    if(d.b25<=39) return 'Átrio direito aumentado em grau moderado.';
    return 'Átrio direito aumentado em grau importante.';
  }
  if(d.b25<=32) return ''; if(d.b25<=38) return 'Átrio direito aumentado em grau leve.';
  if(d.b25<=45) return 'Átrio direito aumentado em grau moderado.';
  return 'Átrio direito aumentado em grau importante.';
}

function j6(d){
  if(!d.b9||!d.sexo) return '';
  if(d.sexo==='M'){
    if(d.b9>68) return 'Ventrículo esquerdo aumentado em grau importante.';
    if(d.b9===68) return 'Ventrículo esquerdo aumentado em grau moderado a importante.';
    if(d.b9>63) return 'Ventrículo esquerdo aumentado em grau moderado.';
    if(d.b9===63) return 'Ventrículo esquerdo aumentado em grau leve a moderado.';
    if(d.b9>58) return 'Ventrículo esquerdo aumentado em grau leve.';
  } else {
    if(d.b9>61) return 'Ventrículo esquerdo aumentado em grau importante.';
    if(d.b9===61) return 'Ventrículo esquerdo aumentado em grau moderado a importante.';
    if(d.b9>56) return 'Ventrículo esquerdo aumentado em grau moderado.';
    if(d.b9===56) return 'Ventrículo esquerdo aumentado em grau leve a moderado.';
    if(d.b9>52) return 'Ventrículo esquerdo aumentado em grau leve.';
  }
  return '';
}

function j7(d){
  if(d.b13===null) return '';
  if(d.b13>50) return 'Ventrículo direito aumentado em grau importante.';
  if(d.b13===50) return 'Ventrículo direito aumentado em grau moderado a importante.';
  if(d.b13>42) return 'Ventrículo direito aumentado em grau moderado.';
  if(d.b13===42) return 'Ventrículo direito aumentado em grau leve a moderado.';
  if(d.b13>35) return 'Ventrículo direito aumentado em grau leve.';
  return '';
}

function j8(d){
  // Cada câmara: alterada se medida e fora do normal, normal se medida e ok OU se não medida (assume normal)
  const aeA=(d.b24!==null&&d.b24>0)?d.b24>34:(d.b8?(d.sexo==='M'?d.b8>40:d.b8>38):false);
  const veA=d.b9?(d.sexo==='M'?d.b9>58:d.b9>52):false;
  const vdA=d.b13?d.b13>35:false;   // VD não preenchido = normal
  const adA=d.b25?(d.sexo==='F'?d.b25>27:d.b25>32):false; // AD não preenchido = normal

  const alteradas = [aeA, veA, vdA, adA];
  const totalAlteradas = alteradas.filter(Boolean).length;

  // Nenhuma alterada → todas normais
  if(totalAlteradas === 0) return 'Câmaras cardíacas com dimensões normais.';

  // Montar lista das normais (incluindo não preenchidas como normais)
  const nomes = [];
  if(!aeA) nomes.push('Átrio esquerdo');
  if(!adA) nomes.push('Átrio direito');
  if(!veA) nomes.push('Ventrículo esquerdo');
  if(!vdA) nomes.push('Ventrículo direito');

  if(nomes.length === 0) return '';
  if(nomes.length === 1) return nomes[0]+' com dimensões normais.';
  return 'Demais câmaras cardíacas com dimensões normais.';
}

// j9 — Massa do VE (absoluta, em g)
// CORREÇÃO 07/05/2026 — Dr. Sérgio: input = massa, texto agora fala "Massa"
// (antes falava "Espessura miocárdica", inconsistente com o input).
function j9(d){
  if(!d.massa||!d.sexo) return '';
  const m=d.massa;
  if(d.sexo==='M'){
    if(m>254) return 'Massa do ventrículo esquerdo aumentada em grau importante.';
    if(m===254) return 'Massa do ventrículo esquerdo em grau moderado a importante.';
    if(m>227) return 'Massa do ventrículo esquerdo aumentada em grau moderado.';
    if(m===227) return 'Massa do ventrículo esquerdo aumentada em grau leve a moderado.';
    if(m>200) return 'Massa do ventrículo esquerdo aumentada em grau leve.';
    return 'Massa do ventrículo esquerdo preservada.';
  }
  if(m>193) return 'Massa do ventrículo esquerdo aumentada em grau importante.';
  if(m===193) return 'Massa do ventrículo esquerdo aumentada em grau moderado a importante.';
  if(m>171) return 'Massa do ventrículo esquerdo aumentada em grau moderado.';
  if(m===171) return 'Massa do ventrículo esquerdo aumentada em grau leve a moderado.';
  if(m>150) return 'Massa do ventrículo esquerdo aumentada em grau leve.';
  return 'Massa do ventrículo esquerdo preservada.';
}

function j10(d){
  if(d.er===null||d.imVE===null||!d.sexo) return '';
  const lim=d.sexo==='M'?102:88;
  if(d.er>0.42&&d.imVE<=lim) return 'Índice de massa preservado e espessura relativa aumentada compatível com remodelamento concêntrico do ventrículo esquerdo.';
  if(d.er<=0.42&&d.imVE>lim) return 'Hipertrofia excêntrica do ventrículo esquerdo.';
  if(d.er<=0.42&&d.imVE<=lim) return 'Índice de massa e espessura relativa do ventrículo esquerdo preservados.';
  if(d.er>0.42&&d.imVE>lim) return 'Hipertrofia concêntrica do ventrículo esquerdo.';
  return '';
}

function j11(d){
  if(!d.sexo||d.feT===null) return '';
  const fe=d.feT;
  if(d.sexo==='M'){
    if(fe>0.52) return 'Função sistólica do ventrículo esquerdo preservada e sem alteração contrátil segmentar.';
    if(fe===0.52) return 'Função sistólica do ventrículo esquerdo preservada, porém no limite inferior da normalidade.';
    if(fe<0.30) return 'Disfunção sistólica do ventrículo esquerdo em grau importante.';
    if(fe===0.30) return 'Disfunção sistólica do ventrículo esquerdo em grau moderado a importante.';
    if(fe<0.40) return 'Disfunção sistólica do ventrículo esquerdo em grau moderado.';
    if(fe===0.40) return 'Disfunção sistólica do ventrículo esquerdo em grau leve a moderado.';
    if(fe<0.52) return 'Disfunção sistólica do ventrículo esquerdo em grau leve.';
  } else {
    if(fe>0.54) return 'Função sistólica do ventrículo esquerdo preservada e sem alteração contrátil segmentar.';
    if(fe===0.54) return 'Função sistólica do ventrículo esquerdo preservada, porém no limite inferior da normalidade.';
    if(fe<0.30) return 'Disfunção sistólica do ventrículo esquerdo em grau importante.';
    if(fe===0.30) return 'Disfunção sistólica do ventrículo esquerdo em grau moderado a importante.';
    if(fe<0.40) return 'Disfunção sistólica do ventrículo esquerdo em grau moderado.';
    if(fe===0.40) return 'Disfunção sistólica do ventrículo esquerdo em grau leve a moderado.';
    if(fe<0.54) return 'Disfunção sistólica do ventrículo esquerdo em grau leve.';
  }
  return '';
}

function j12(d){
  if(!d.sexo||d.b54===null) return '';
  const fe=d.b54, lim=d.sexo==='M'?52:54;
  if(fe>=lim) return `Função sistólica do ventrículo esquerdo preservada, apesar da alteração contrátil segmentar. Fração de ejeção de ${fe}% (Simpson).`;
  if(fe<30) return `Disfunção sistólica do ventrículo esquerdo em grau importante. Fração de ejeção de ${fe}% (Simpson).`;
  if(fe===30) return `Disfunção sistólica do ventrículo esquerdo em grau moderado a importante. Fração de ejeção de ${fe}% (Simpson).`;
  if(fe<40) return `Disfunção sistólica do ventrículo esquerdo em grau moderado. Fração de ejeção de ${fe}% (Simpson).`;
  if(fe===40) return `Disfunção sistólica do ventrículo esquerdo em grau leve a moderado. Fração de ejeção de ${fe}% (Simpson).`;
  return `Disfunção sistólica do ventrículo esquerdo em grau leve. Fração de ejeção de ${fe}% (Simpson).`;
}

function wallText(val, parede){
  if(!val) return '';
  const m={
    HB:`Alteração contrátil por hipocinesia da porção basal da ${parede}`,
    HMB:`Alteração contrátil por hipocinesia da porção médiobasal da ${parede}`,
    HM:`Alteração contrátil por hipocinesia da porção média da ${parede}`,
    HMA:`Alteração contrátil por hipocinesia da porção médioapical da ${parede}`,
    HA:`Alteração contrátil por hipocinesia da porção apical da ${parede}`,
    AB:`Alteração contrátil por acinesia da porção basal da ${parede}`,
    AMB:`Alteração contrátil por acinesia da porção médiobasal da ${parede}`,
    AM:`Alteração contrátil por acinesia da porção média da ${parede}`,
    AMA:`Alteração contrátil por acinesia da porção médioapical da ${parede}`,
    AA:`Alteração contrátil por acinesia da porção apical da ${parede}`,
    DB:`Alteração contrátil por discinesia da porção basal da ${parede}`,
    DMB:`Alteração contrátil por discinesia da porção médiobasal da ${parede}`,
    DM:`Alteração contrátil por discinesia da porção média da ${parede}`,
    DMA:`Alteração contrátil por discinesia da porção médioapical da ${parede}`,
    DA:`Alteração contrátil por discinesia da porção apical da ${parede}`,
    H:`Alteração contrátil por hipocinesia da ${parede}`,
    A:`Alteração contrátil por acinesia da ${parede}`,
    D:`Alteração contrátil por discinesia da ${parede}`,
  };
  return m[val]||'';
}

function j13(d){ const m={H:'Alteração contrátil por hipocinesia da região apical do ventrículo esquerdo',A:'Alteração contrátil por acinesia da região apical do ventrículo esquerdo',D:'Alteração contrátil por discinesia da região apical do ventrículo esquerdo'}; return d.b55?m[d.b55]||'':''; }
function j14(d){ return wallText(d.b56,'parede anterior'); }
function j15(d){ return wallText(d.b57,'parede septalanterior'); }
function j16(d){ return wallText(d.b58,'parede septalinferior'); }
function j17(d){ return wallText(d.b59,'parede lateral'); }
function j18(d){ return wallText(d.b60,'parede inferior'); }
function j19(d){ return wallText(d.b61,'parede inferolateral'); }
function j20(d){ const m={NL:'Contratilidade preservada nas demais paredes',HD:'Alteração contratil por hipocinesia difusa do ventrículo esquerdo',HR:'Alteração contratil por hipocinesia das demais paredes',AD:'Alteração contratil por acinesia das demais paredes',DD:'Alteração contratil por hipocinesia das demais paredes'}; return d.b62?m[d.b62]||'':''; }

function j21(d){
  // ── LÓGICA FA (ASE 2025) ──
  // Ritmo irregular + E/A vazia = provável FA → algoritmo específico
  if(d.ritmo==='N' && (d.b20===null || d.b20===0)){
    // FA: usar E/e', velocidade IT, LAVI e LARS para estimar pressão de enchimento
    const temDados = d.b22!==null || d.b23!==null || d.b24!==null || d.lars!==null;
    if(!temDados) return 'FA_SEM_DADOS';
    let elevado = 0;
    let avaliados = 0;
    if(d.b22!==null){ avaliados++; if(d.b22>14) elevado++; }  // E/e' > 14
    if(d.b23!==null){ avaliados++; if(d.b23>2.8) elevado++; } // TR velocity > 2.8
    if(d.b24!==null){ avaliados++; if(d.b24>34) elevado++; }  // LAVI > 34
    if(d.lars!==null){ avaliados++; if(d.lars<18) elevado++; } // LARS < 18 (strain reduzido)
    if(avaliados < 2) return 'FA_INDETERMINADA';
    if(elevado >= 2) return 'FA_PRESSAO_ELEVADA';
    return 'FA_PRESSAO_NORMAL';
  }
  // ── LÓGICA USUAL (ritmo sinusal ou irregular com onda A) ──
  if(!d.b19&&!d.b20&&!d.b21&&!d.b22&&!d.b23&&!d.b24) return '';
  const fe=d.feT, feVide=(fe===null&&d.b12===null);
  const feBaixa=fe!==null&&(fe<=1?fe<0.5:fe<50);
  const massaAlta=d.sexo==='F'?(d.imVE!==null&&d.imVE>95):(d.imVE!==null&&d.imVE>115);
  const classify=()=>{
    if(d.b20!==null&&d.b20>=2) return 'Disfunção Diastólica do ventrículo esquerdo de Grau III (Padrão Restritivo)';
    if(d.b20!==null&&d.b19!==null&&d.b20<=0.8&&d.b19<=50) return 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';
    const p=((d.b22!==null&&d.b22>15)?1:0)+((d.b23!==null&&d.b23>2.8)?1:0)+((d.b24!==null&&d.b24>34)?1:0);
    if(p>=2) return 'Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal)';
    return 'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento)';
  };
  if(feVide||feBaixa||massaAlta) return classify();
  const c=((d.b21!==null&&d.b21<7)?1:0)+((d.b22!==null&&d.b22>15)?1:0)+((d.b23!==null&&d.b23>2.8)?1:0)+((d.b24!==null&&d.b24>34)?1:0);
  if(c<=1) return 'Índices diastólicos do ventrículo esquerdo preservados';
  if(c>=3) return classify();
  return 'Função Diastólica do ventrículo esquerdo Indeterminada';
}

// Wrapper para achados: converte retornos de FA em texto
function j21FA_achado(d){
  const x = j21(d);
  if(x==='FA_PRESSAO_ELEVADA' || x==='FA_PRESSAO_NORMAL' || x==='FA_INDETERMINADA' || x==='FA_SEM_DADOS'){
    return 'Avaliação da função diastólica limitada devido arritmia cardíaca.';
  }
  return x;
}

// Wrapper para detalhamento: na FA, mostra parâmetros usados
function j22FA(d){
  const x = j21(d);
  if(x && x.startsWith('FA_')){
    // Na FA, mostrar os parâmetros disponíveis
    const partes = [];
    if(d.b19) partes.push('Velocidade da Onda E= '+d.b19+' cm/s');
    if(d.b22) partes.push("Relação E/e'= "+d.b22);
    if(d.b23) partes.push('Velocidade do Refluxo Tricuspídeo= '+d.b23+' m/s');
    if(d.b24) partes.push('Volume index do átrio esquerdo= '+d.b24+' ml/m²');
    if(d.b21) partes.push("Velocidade e' septal= "+d.b21+' cm/s');
    return partes.length ? partes.join('; ')+'.' : '';
  }
  return j22(d);
}

function j22(d){
  if(!d.b19&&!d.b20&&!d.b21&&!d.b22&&!d.b24) return '';
  const E=d.b19??'',EA=d.b20??'',ep=d.b21??'',Eei=d.b22??'',vi=d.b24??'';
  const base=`Velocidade da Onda E= ${E} cm/s; Relação E/A= ${EA}; Velocidade e' septal= ${ep} cm/s; Relação E/e'= ${Eei}; volume index do átrio esquerdo = ${vi} ml/m²`;
  return d.b23?base+`; Velocidade do Refluxo Tricuspídeo= ${d.b23} m/s.`:base+'.';
}

// J50 — HP por Velocidade IT (fiel à planilha)
function j50(d){
  if(!d.b23||d.b23===0) return '';
  const presente=(d.b38==='S'||d.b38==='Sim'||d.b38==='Presente');
  if(d.b23>3.4) return 'Alta Probabilidade de Hipertensão Pulmonar.';
  if(d.b23>=2.9) return presente?'Alta Probabilidade de Hipertensão Pulmonar.':'Probabilidade Intermediária de Hipertensão Pulmonar.';
  return presente?'Probabilidade Intermediária de Hipertensão Pulmonar.':'Baixa Probabilidade de Hipertensão Pulmonar.';
}

function j23(d){
  const t=d.b33!==null?` TAPSE= ${d.b33} mm (VR ≥ 20 mm).`:'.';
  if(d.b32==='L') return `Disfunção sistólica de grau leve do ventrículo direito${t}`;
  if(d.b32==='LM') return `Disfunção sistólica de grau leve a moderado do ventrículo direito${t}`;
  if(d.b32==='M') return `Disfunção sistólica de grau moderado do ventrículo direito${t}`;
  if(d.b32==='MI') return `Disfunção sistólica de grau moderado a importante do ventrículo direito${t}`;
  if(d.b32==='I') return `Disfunção sistólica de grau importante do ventrículo direito${t}`;
  if(!d.b32&&d.b33>0) return `Função sistólica do ventrículo direito preservada. TAPSE= ${d.b33} mm (VR ≥ 20 mm).`;
  return 'Função sistólica do ventrículo direito preservada.';
}

function j24(d){
  if(!d.b34) return !d.b36?'Válvulas atrioventriculares com a morfologia preservada.':'Válvula mitral com morfologia preservada.';
  const m={EL:'Válvula mitral espessada em grau leve.',ELM:'Válvula mitral espessada em grau leve a moderado.',EM:'Válvula mitral espessada em grau moderado, gerando restrição da sua abertura.',EMI:'Válvula mitral espessada em grau moderado a importante, gerando restrição da sua abertura.',EI:'Válvula mitral espessada em grau importante, gerando restrição da sua abertura.',FL:'Válvula mitral fibrocalcificada em grau leve.',FLM:'Válvula mitral fibrocalcificada em grau leve a moderado.',FM:'Válvula mitral fibrocalcificada em grau moderado, gerando restrição da sua abertura.',FMI:'Válvula mitral fibrocalcificada em grau moderado a importante, gerando restrição da sua abertura.',FI:'Válvula mitral fibrocalcificada em grau importante, gerando restrição da sua abertura.',EFL:'Válvula mitral espessada e fibrocalcificada em grau leve.',EFLM:'Válvula mitral espessada e fibrocalcificada em grau leve a moderado.',EFM:'Válvula mitral espessada e fibrocalcificada em grau moderado, gerando restrição da sua abertura.',EFMI:'Válvula mitral espessada e fibrocalcificada em grau moderado a importante, gerando restrição da sua abertura.',EFI:'Válvula mitral espessada e fibrocalcificada em grau importante, gerando restrição da sua abertura.'};
  return m[d.b34]||'';
}
function j25(d){ return (d.b45!==null&&d.b45>=1)?`Gradiente transvalvar mitral máximo de ${d.b45} mmHg.`:''; }
function j26(d){ return (d.b46!==null&&d.b46>=1)?`Gradiente transvalvar mitral médio de ${d.b46} mmHg.`:''; }
function j27(d){ return (d.b47!==null&&d.b47>0)?`Área mitral estimada em ${d.b47} cm² (PHT).`:''; }
function j28(d){
  const m={L:'Insuficiência Mitral leve.',LM:'Insuficiência Mitral leve a moderada.',M:'Insuficiência Mitral moderada.',MI:'Insuficiência Mitral moderada a importante.',I:'Insuficiência Mitral importante.'};
  if(d.b35) return m[d.b35]||'';
  // Fluxo AV preservado SOMENTE se: sem refluxo mitral, sem refluxo tricúspide, sem gradientes mitrais
  const temAlteracaoAV = d.b36 || (d.b45&&d.b45>0) || (d.b46&&d.b46>0) || (d.b47&&d.b47>0) || d.b34t || d.estenTricGrau;
  if(!temAlteracaoAV) return 'Fluxo pelas válvulas atrioventriculares preservado.';
  return '';
}
function j29(d){ const m={L:'Insuficiência Tricúspide leve.',LM:'Insuficiência Tricúspide leve a moderada.',M:'Insuficiência Tricúspide moderada.',MI:'Insuficiência Tricúspide moderada a importante.',I:'Insuficiência Tricúspide importante.'}; return d.b36?m[d.b36]||'':''; }
function j30(d){
  // Só gera "ausência" se IT também vazia — fiel à lógica clínica e à planilha
  if(d.b37!==null&&d.b37>0) return `Pressão sistólica da artéria pulmonar de ${d.b37} mmHg. VR < 36 mmHg.`;
  if(!d.b23||d.b23===0) return 'Ausência de sinais indiretos de hipertensão pulmonar.';
  return ''; // IT preenchida cobre o diagnóstico de HP — j50 gera a frase
}
function j31(d){
  if(!d.b39) return 'Válvulas semilunares com morfologia preservada.';
  const m={EL:'Válvula aórtica espessada em grau leve.',ELM:'Válvula aórtica espessada em grau leve a moderado.',EM:'Válvula aórtica espessada em grau moderado.',EMI:'Válvula aórtica espessada em grau moderado a importante.',EI:'Válvula aórtica espessada em grau importante.',FL:'Válvula aórtica fibrocalcificada em grau leve.',FLM:'Válvula aórtica fibrocalcificada em grau leve a moderado.',FM:'Válvula aórtica fibrocalcificada em grau moderado.',FMI:'Válvula aórtica fibrocalcificada em grau moderado a importante.',FI:'Válvula aórtica fibrocalcificada em grau importante.',EFL:'Válvula aórtica espessada e fibrocalcificada em grau leve.',EFLM:'Válvula aórtica espessada e fibrocalcificada em grau leve a moderado.',EFM:'Válvula aórtica espessada e fibrocalcificada em grau moderado.',EFMI:'Válvula aórtica espessada e fibrocalcificada em grau moderado a importante.',EFI:'Válvula aórtica espessada e fibrocalcificada em grau importante.'};
  return m[d.b39]||'';
}
function j32(d){ return (d.b50!==null&&d.b50>=1)?`Gradiente transvalvar aórtico máximo de ${d.b50} mmHg.`:''; }
function j33(d){ return (d.b51!==null&&d.b51>=1)?`Gradiente transvalvar aórtico médio de ${d.b51} mmHg.`:''; }
function j34(d){ if(!d.b52||d.b52<=0) return ''; let t=`Área aórtica estimada em ${d.b52} cm² (Equação de continuidade).`; if(d.aoIdx) t+=` Área aórtica indexada = ${d.aoIdx} cm²/m².`; return t; }
function j35(d){
  const m={L:'Insuficiência Aórtica leve.',LM:'Insuficiência Aórtica leve a moderada.',M:'Insuficiência Aórtica moderada.',MI:'Insuficiência Aórtica moderada a importante.',I:'Insuficiência Aórtica importante.'};
  if(d.b40) return m[d.b40]||'';
  // Fluxo SL preservado SOMENTE se: sem refluxo aórtico, sem refluxo pulmonar, sem gradientes aórticos/pulmonares
  const temAlteracaoSL = d.b40p || (d.b50&&d.b50>0) || (d.b51&&d.b51>0) || (d.b52&&d.b52>0) || d.b39p || d.estenPulmGrau;
  if(!temAlteracaoSL) return 'Fluxo pelas válvulas semilunares preservado.';
  return '';
}
function j36(d){ const m={L:'Derrame pericárdico leve.',LM:'Derrame pericárdico leve a moderado.',M:'Derrame pericárdico moderado.',MI:'Derrame pericárdico moderado a importante.',I:'Derrame pericárdico importante.'}; return d.b41?m[d.b41]||'':'Pericárdio sem alterações.'; }

// ── AORTA: Classificação por DP (desvio padrão) baseada em ASC ──
// Fórmulas: Previsto(cm) = a + b × ASC | SD fixo por segmento
// Se sem ASC: usa valores fixos como fallback
function _aortaClassificar(medidaMM, previstoCM, sd, nomeSegmento){
  if(!medidaMM) return null; // em branco = normal
  const medidaCM = medidaMM / 10;
  const dp = sd > 0 ? (medidaCM - previstoCM) / sd : 0;
  const previstoMM = Math.round(previstoCM * 10);
  const sdMM = Math.round(sd * 10);
  if(dp <= 2) return {grau:'normal', dp: dp.toFixed(1), txt:''};
  const grau = dp <= 3 ? 'leve' : dp <= 4 ? 'moderada' : 'importante';
  return {grau, dp: dp.toFixed(1), txt:`Ectasia ${grau} ${nomeSegmento}, medindo ${medidaMM} mm (previsto ${previstoMM} ± ${sdMM} mm).`};
}

function _aortaFallback(medidaMM, limM, limF, sexo, nomeSegmento){
  if(!medidaMM) return null; // em branco = normal
  const lim = sexo==='F' ? limF : limM;
  if(medidaMM <= lim[0]) return {grau:'normal', txt:''};
  if(medidaMM <= lim[1]) return {grau:'leve', txt:`Ectasia leve ${nomeSegmento}, medindo ${medidaMM} mm.`};
  if(medidaMM <= lim[2]) return {grau:'moderada', txt:`Ectasia moderada ${nomeSegmento}, medindo ${medidaMM} mm.`};
  return {grau:'importante', txt:`Ectasia importante ${nomeSegmento}, medindo ${medidaMM} mm.`};
}

function _classificarAorta(d, medida, segmento, nomeTexto){
  // Calcular idade
  let idade = 50; // fallback
  if(d.dtnasc && d.dtexame){
    const nasc = new Date(d.dtnasc||''), exam = new Date(d.dtexame||'');
    if(!isNaN(nasc) && !isNaN(exam)) idade = Math.floor((exam - nasc) / 31557600000);
  }
  // Se tem ASC → usar fórmula por DP
  if(d.asc && d.asc > 0){
    let previsto, sd;
    if(segmento === 'raiz'){
      previsto = idade < 40 ? (1.50 + 0.95 * d.asc) : (1.92 + 0.74 * d.asc);
      sd = 0.19;
    } else if(segmento === 'ascendente'){
      previsto = 1.47 + 0.91 * d.asc;
      sd = 0.22;
    } else { // arco
      previsto = 1.26 + 0.61 * d.asc;
      sd = 0.20;
    }
    return _aortaClassificar(medida, previsto, sd, nomeTexto);
  }
  // Sem ASC → fallback ASE 2015 Chamber Quantification (Lang et al.)
  // Cutoffs atualizados em 07/05/2026 — superestimação corrigida
  if(segmento === 'raiz') return _aortaFallback(medida, [40,45,55], [36,41,51], d.sexo, nomeTexto);
  if(segmento === 'ascendente') return _aortaFallback(medida, [37,42,50], [34,39,47], d.sexo, nomeTexto);
  return _aortaFallback(medida, [36,38,42], [36,38,42], d.sexo, nomeTexto); // arco — sem distinção sexo (ASE 2015)
}

function j37(d){
  if(!d.sexo) return '';
  const raiz = _classificarAorta(d, d.b7, 'raiz', 'da raiz da aorta');
  const asc = _classificarAorta(d, d.b28, 'ascendente', 'da aorta ascendente');
  const arco = _classificarAorta(d, d.b29, 'arco', 'do arco aórtico');

  // Se raiz alterada, retorna o texto da raiz (j38 e j39 cuidam dos outros)
  if(raiz && raiz.grau !== 'normal') return raiz.txt;

  // Raiz normal (ou não medida) — montar frase combinada dos normais
  const normais = [];
  if(!raiz || raiz.grau === 'normal') normais.push('Raiz aórtica');
  if(!asc || asc.grau === 'normal') normais.push('aorta ascendente');
  if(!arco || arco.grau === 'normal') normais.push('arco aórtico');

  if(normais.length === 3) return 'Raiz aórtica, aorta ascendente e arco aórtico com dimensões normais.';
  if(normais.length === 2) return normais[0].charAt(0).toUpperCase()+normais[0].slice(1)+' e '+normais[1]+' com dimensões normais.';
  if(normais.length === 1) return normais[0].charAt(0).toUpperCase()+normais[0].slice(1)+' com dimensões normais.';
  return '';
}

function j38(d){
  if(!d.sexo || !d.b28) return ''; // em branco = normal
  const r = _classificarAorta(d, d.b28, 'ascendente', 'da aorta ascendente');
  return (r && r.grau !== 'normal') ? r.txt : '';
}

function j39(d){
  if(!d.sexo || !d.b29) return ''; // em branco = normal
  const r = _classificarAorta(d, d.b29, 'arco', 'do arco aórtico');
  return (r && r.grau !== 'normal') ? r.txt : '';
}

// Quando raiz alterada, j37 só emite a raiz. Esta função emite os
// segmentos NORMAIS restantes (asc/arco) que sumiriam do laudo.
// Bug corrigido em 07/05/2026 — Dr. Sérgio.
function jAortaNormaisComplementar(d){
  if(!d.sexo) return '';
  const raiz = _classificarAorta(d, d.b7, 'raiz', 'da raiz da aorta');
  // Só atua quando raiz alterada (caso raiz normal, j37 já cobriu)
  if(!raiz || raiz.grau === 'normal') return '';

  const asc = _classificarAorta(d, d.b28, 'ascendente', 'da aorta ascendente');
  const arco = _classificarAorta(d, d.b29, 'arco', 'do arco aórtico');

  const normais = [];
  if(!asc || asc.grau === 'normal') normais.push('aorta ascendente');
  if(!arco || arco.grau === 'normal') normais.push('arco aórtico');

  if(normais.length === 2) return 'Aorta ascendente e arco aórtico com dimensões normais.';
  if(normais.length === 1) return normais[0].charAt(0).toUpperCase() + normais[0].slice(1) + ' com dimensões normais.';
  return ''; // ambos asc/arco alterados — j38/j39 cobrem
}
function j40(d){ if(d.b42==='s')return'Placas de ateroma calcificadas e não complicadas no arco aórtico.';if(d.b42==='nv')return'Arco aórtico não visualizado adequadamente.';return ''; }

function j43(d){
  const x=j21(d);
  if(!x) return '';
  // ── FA: conclusão de pressão de enchimento ──
  if(x==='FA_PRESSAO_ELEVADA') return 'Parâmetros sugestivos de pressão de enchimento elevada.';
  if(x==='FA_PRESSAO_NORMAL') return 'Parâmetros sugestivos de pressão de enchimento normal.';
  if(x==='FA_INDETERMINADA') return 'Pressão de enchimento indeterminada (dados insuficientes para avaliação em arritmia cardíaca).';
  if(x==='FA_SEM_DADOS') return '';
  // ── Ritmo sinusal: conclusão usual ──
  if(x==='Índices diastólicos do ventrículo esquerdo preservados') return '';
  if(x==='Função Diastólica do ventrículo esquerdo Indeterminada') return 'Função diastólica do ventrículo esquerdo Indeterminada.';
  if(x.includes('Grau III')) return 'Disfunção diastólica de grau III do ventrículo esquerdo (padrão restritivo).';
  if(x.includes('Grau II')) return 'Disfunção diastólica de grau II do ventrículo esquerdo (padrão pseudo-normal).';
  if(x.includes('Grau I')) return 'Disfunção diastólica de grau I do ventrículo esquerdo (alteração de relaxamento).';
  return '';
}
function j47(d){
  if(d.er===null||d.imVE===null||!d.sexo) return '';
  const lim=d.sexo==='M'?102:88;
  if(d.er>0.42&&d.imVE<=lim) return 'Remodelamento concêntrico do ventrículo esquerdo.';
  if(d.er<=0.42&&d.imVE>lim) return 'Hipertrofia excêntrica do ventrículo esquerdo.';
  if(d.er>0.42&&d.imVE>lim) return 'Hipertrofia concêntrica do ventrículo esquerdo.';
  return '';
}
function j48(d){ return ''; } // substituído por concSistolica
function j49(d){ return ''; } // substituído por concSistolica

// ── Lógica unificada: dilatação + disfunção VE + VD ──────────────
function concSistolica(d){
  if(!d.sexo) return '';

  const lvLim = d.sexo==='M'?58:52;
  const feLim = d.sexo==='M'?0.52:0.54;
  const feLimS = d.sexo==='M'?52:54;

  // Dilatação
  const veAum = d.b9!==null && d.b9>lvLim;
  const vdAum = d.b13!==null && d.b13>35;

  // FE VE reduzida
  let feReduz = false;
  if(d.b54!==null) feReduz = d.b54 < feLimS;
  else if(d.feT!==null) feReduz = d.feT < feLim;
  const feDisp = d.b54!==null || d.feT!==null;

  // Disfunção VD
  const disfVD = !!d.b32;

  // Dilatação (sem especificar lado)
  const dilatado = veAum || vdAum;

  // Prefixo
  const prefix = dilatado ? 'Miocardiopatia Dilatada com ' : '';

  // Casos de disfunção
  const disfVE = feDisp && feReduz;

  if(!disfVE && !disfVD){
    // Sem disfunção
    if(dilatado) return 'Miocardiopatia Dilatada com função sistólica preservada.';
    return '';
  }

  if(disfVE && disfVD){
    return prefix + 'Disfunção sistólica biventricular.';
  }
  if(disfVE && !disfVD){
    // Verificar alteração segmentar (Simpson preservado com paredes alteradas)
    if(d.b54!==null && d.b54>=feLimS){
      return dilatado
        ? 'Miocardiopatia Dilatada com função sistólica do ventrículo esquerdo preservada, apesar da alteração contrátil segmentar.'
        : 'Alteração contrátil segmentar do ventrículo esquerdo.';
    }
    return prefix + 'Disfunção sistólica do ventrículo esquerdo.';
  }
  if(!disfVE && disfVD){
    return prefix + 'Disfunção sistólica do ventrículo direito.';
  }
  return '';
}

// Estenose Mitral conclusão — por gradiente/área
function concEstenMit(d){
  if(!d.estenMitGrau) return '';
  const g=d.estenMitGrau;
  if(g==='importante') return 'Estenose Mitral Importante.';
  if(g==='moderada') return 'Estenose Mitral Moderada.';
  if(g==='leve') return 'Estenose Mitral Leve.';
  return '';
}
// Estenose Aórtica conclusão
function concEstenAo(d){
  if(!d.estenAoGrau||d.estenAoGrau==='esclerose') return '';
  const g=d.estenAoGrau;
  if(g==='importante') return 'Estenose Aórtica Importante.';
  if(g==='moderada') return 'Estenose Aórtica Moderada.';
  if(g==='leve') return 'Estenose Aórtica Leve.';
  return '';
}
// HP conclusão — por IT (J50)
function concHP(d){ return j50(d); }

// ── Strain na conclusão ──────────────────────────────────────────
// GLS VE: só aparece na conclusão se preenchido
// GLS VD: só aparece na conclusão se preenchido
// LARS: só aparece na conclusão se preenchido
function concStrainVE(d){
  if(d.glsVE===null) return '';
  const abs = Math.abs(d.glsVE);
  // Determinar se FE está preservada
  const feLimS = d.sexo==='M' ? 52 : 54;
  let fePreservada = true;
  if(d.b54!==null) fePreservada = d.b54 >= feLimS;
  else if(d.feT!==null) fePreservada = (d.feT>=1 ? d.feT>=feLimS : d.feT>=feLimS/100);

  if(fePreservada && abs >= 18){
    return `Função sistólica global do ventrículo esquerdo preservada, confirmada pelo strain longitudinal (${d.glsVE}%).`;
  }
  if(fePreservada && abs < 18){
    return `Função sistólica preservada com strain longitudinal reduzido (${d.glsVE}%), sugestivo de disfunção subclínica.`;
  }
  // FE reduzida + GLS
  return `Disfunção sistólica do ventrículo esquerdo, com strain longitudinal de ${d.glsVE}%.`;
}

function concStrainVD(d){
  if(d.glsVD===null) return '';
  const abs = Math.abs(d.glsVD);
  const vdNormal = !d.b32; // sem disfunção VD convencional
  if(vdNormal && abs >= 20){
    return `Função sistólica do ventrículo direito preservada, confirmada pelo strain longitudinal (${d.glsVD}%).`;
  }
  if(vdNormal && abs < 20){
    return `Strain longitudinal do ventrículo direito reduzido (${d.glsVD}%), sugestivo de disfunção subclínica do ventrículo direito.`;
  }
  return ''; // VD já alterado, conclusão já existe via concSistolica
}

function concLARS(d){
  if(d.lars===null) return '';
  // Verificar se diastologia convencional está normal
  const diastResult = j21(d);
  const diastNormal = diastResult === 'Índices diastólicos do ventrículo esquerdo preservados' || diastResult === '';
  if(diastNormal && d.lars >= 18){
    return `Strain atrial esquerdo preservado (${d.lars}%).`;
  }
  if(diastNormal && d.lars < 18){
    return `Strain atrial esquerdo reduzido (${d.lars}%), sugestivo de elevação das pressões de enchimento.`;
  }
  // Diastologia já alterada — LARS confirma, não gera conclusão extra
  return '';
}

// ── Helpers válvulas novas ──────────────────────────────────────

function toggleWilkins(){
  const on=document.getElementById('wilkins-toggle').checked;
  document.getElementById('wilkins-fields').style.display=on?'grid':'none';
  calc();
}

function refluxoPulmonar(){
  const val=v('b40p');
  document.getElementById('field-psmap').style.display=val?'block':'none';
}

function calcEstenTric(gradMed, area){
  // Classificação pelo JASE: gradiente médio + área
  if(!gradMed&&!area) return '';
  let grGrad='', grArea='';
  if(gradMed){ if(gradMed>7) grGrad='importante'; else if(gradMed>=5) grGrad='moderada'; }
  if(area){ if(area<1) grArea='importante'; else if(area<=1.5) grArea='moderada'; }
  // Pior grau entre os dois
  const ordem=['','moderada','importante'];
  const idx=Math.max(ordem.indexOf(grGrad), ordem.indexOf(grArea));
  return idx>0?ordem[idx]:'';
}

function calcEstenPulm(gradMax){
  if(!gradMax) return '';
  if(gradMax>=80) return 'importante';
  if(gradMax>=50) return 'moderada';
  if(gradMax>=25) return 'leve';
  return '';
}

// ── Morfologia tricúspide (silêncio quando normal) ───────────────
function jTricMorf(d){
  if(!d.b34t) return '';
  const m={EL:'Válvula tricúspide espessada em grau leve.',ELM:'Válvula tricúspide espessada em grau leve a moderado.',EM:'Válvula tricúspide espessada em grau moderado, gerando restrição da sua abertura.',EMI:'Válvula tricúspide espessada em grau moderado a importante, gerando restrição da sua abertura.',EI:'Válvula tricúspide espessada em grau importante, gerando restrição da sua abertura.',FL:'Válvula tricúspide fibrocalcificada em grau leve.',FLM:'Válvula tricúspide fibrocalcificada em grau leve a moderado.',FM:'Válvula tricúspide fibrocalcificada em grau moderado.',FMI:'Válvula tricúspide fibrocalcificada em grau moderado a importante.',FI:'Válvula tricúspide fibrocalcificada em grau importante.',EFL:'Válvula tricúspide espessada e fibrocalcificada em grau leve.',EFLM:'Válvula tricúspide espessada e fibrocalcificada em grau leve a moderado.',EFM:'Válvula tricúspide espessada e fibrocalcificada em grau moderado.',EFMI:'Válvula tricúspide espessada e fibrocalcificada em grau moderado a importante.',EFI:'Válvula tricúspide espessada e fibrocalcificada em grau importante.'};
  return m[d.b34t]||'';
}

// ── Estenose tricúspide gradientes ───────────────────────────────
function jEstenTric(d){
  if(!d.estenTricGrau) return [];
  const linhas=[];
  if(d.b46t&&d.b46t>=5) linhas.push(`Gradiente transvalvar tricúspide médio de ${d.b46t} mmHg.`);
  if(d.b47t&&d.b47t>0) linhas.push(`Área tricúspide estimada em ${d.b47t} cm² (PHT).`);
  const g=d.estenTricGrau;
  if(g==='importante') linhas.push('Estenose Tricúspide Importante.');
  else if(g==='moderada') linhas.push('Estenose Tricúspide Moderada.');
  return linhas;
}

// ── Morfologia pulmonar (silêncio quando normal) ──────────────────
function jPulmMorf(d){
  if(!d.b39p) return '';
  const m={EL:'Válvula pulmonar espessada em grau leve.',ELM:'Válvula pulmonar espessada em grau leve a moderado.',EM:'Válvula pulmonar espessada em grau moderado.',EMI:'Válvula pulmonar espessada em grau moderado a importante.',EI:'Válvula pulmonar espessada em grau importante.',FL:'Válvula pulmonar fibrocalcificada em grau leve.',FLM:'Válvula pulmonar fibrocalcificada em grau leve a moderado.',FM:'Válvula pulmonar fibrocalcificada em grau moderado.',FMI:'Válvula pulmonar fibrocalcificada em grau moderado a importante.',FI:'Válvula pulmonar fibrocalcificada em grau importante.',EFL:'Válvula pulmonar espessada e fibrocalcificada em grau leve.',EFLM:'Válvula pulmonar espessada e fibrocalcificada em grau leve a moderado.',EFM:'Válvula pulmonar espessada e fibrocalcificada em grau moderado.',EFMI:'Válvula pulmonar espessada e fibrocalcificada em grau moderado a importante.',EFI:'Válvula pulmonar espessada e fibrocalcificada em grau importante.'};
  return m[d.b39p]||'';
}

// ── Estenose pulmonar ─────────────────────────────────────────────
function jEstenPulm(d){
  if(!d.estenPulmGrau) return [];
  const linhas=[];
  if(d.b50p) linhas.push(`Gradiente transvalvar pulmonar máximo de ${d.b50p} mmHg.`);
  const g=d.estenPulmGrau;
  if(g==='importante') linhas.push('Estenose Pulmonar Importante.');
  else if(g==='moderada') linhas.push('Estenose Pulmonar Moderada.');
  else if(g==='leve') linhas.push('Estenose Pulmonar Leve.');
  return linhas;
}

// ── Refluxo pulmonar + PsmAP ──────────────────────────────────────
function jRefluxoPulm(d){
  if(!d.b40p) return [];
  const linhas=[];
  const m={L:'Insuficiência Pulmonar leve.',LM:'Insuficiência Pulmonar leve a moderada.',M:'Insuficiência Pulmonar moderada.',MI:'Insuficiência Pulmonar moderada a importante.',I:'Insuficiência Pulmonar importante.'};
  if(m[d.b40p]) linhas.push(m[d.b40p]);
  if(d.psmap&&d.psmap>0) linhas.push(`Pressão sistólica média da artéria pulmonar de ${d.psmap} mmHg.`);
  return linhas;
}

// ── Wilkins nos comentários — bloco recuado ──────────────────────
const WK_DESC = {
  mob: ['Normal','Boa mobilidade da valva, com restrição apenas na ponta do folheto','Redução da mobilidade na porção média e na base dos folhetos','Mobilidade somente na base dos folhetos','Nenhum ou mínimo movimento dos folhetos'],
  esp: ['Normal','Espessura valvar próxima do normal (4–5 mm)','Grande espessamento nas margens do folheto','Espessamento de todo o folheto (5–8 mm)','Grande espessamento de todo o folheto (>8–10 mm)'],
  sub: ['Normal','Espessamento mínimo da corda tendínea logo abaixo da valva','Espessamento da corda até terço proximal','Espessamento da corda até terço distal','Extenso espessamento e encurtamento de toda corda até músculo papilar'],
  cal: ['Sem calcificação','Uma única área de calcificação','Calcificações nas margens dos folhetos','Calcificações extensivas à porção média do folheto','Extensa calcificação em todo o folheto'],
};

function jWilkins(d){
  if(!d.wilkinsOn||d.wilkinsScore===null) return '';
  const sc=d.wilkinsScore;
  const el=document.getElementById('calc-wilkins');
  if(el) el.textContent=sc+' pts';

  const mob=d.wkMob, esp=d.wkEsp, sub=d.wkSub, cal=d.wkCal;
  const concFrase = sc>=9
    ? 'Pacientes com escore de Wilkins maior ou igual a 9 NÃO são candidatos a valvuloplastia mitral percutânea.'
    : sc>=8
    ? `Escore de Wilkins & Block de ${sc} pontos. Paciente no limite para valvuloplastia mitral percutânea.`
    : `Escore de Wilkins & Block de ${sc} pontos. Paciente favorável para valvuloplastia mitral percutânea (escore ≤ 8).`;

  // Retorna HTML com recuo
  return `__WILKINS__${JSON.stringify({mob,esp,sub,cal,sc,concFrase})}`;
}

// ══ STRAIN (Speckle Tracking) — Achados ════════════════════════
// Só aparecem se preenchidos. Em branco = não realizado = ignora.

function jGLSve(d){
  if(d.glsVE===null) return '';
  const abs = Math.abs(d.glsVE);
  if(abs >= 18) return `Strain global longitudinal do ventrículo esquerdo pelo speckle tracking de ${d.glsVE}% (VR ≥ -18%).`;
  return `Strain global longitudinal do ventrículo esquerdo reduzido pelo speckle tracking de ${d.glsVE}% (VR ≥ -18%).`;
}

function jGLSvd(d){
  if(d.glsVD===null) return '';
  const abs = Math.abs(d.glsVD);
  if(abs >= 20) return `Strain global longitudinal do ventrículo direito pelo speckle tracking de ${d.glsVD}% (VR ≥ -20%).`;
  return `Strain global longitudinal do ventrículo direito reduzido pelo speckle tracking de ${d.glsVD}% (VR ≥ -20%).`;
}

function jLARS(d){
  if(d.lars===null) return '';
  if(d.lars >= 18) return `Strain longitudinal do átrio esquerdo (reservoir) de ${d.lars}% (VR ≥ 18%).`;
  return `Strain longitudinal do átrio esquerdo (reservoir) reduzido de ${d.lars}% (VR ≥ 18%).`;
}

// ══ TOGGLE DIASTOLOGIA: AUTOMÁTICO / MANUAL ════════════════════
// Padrão: automático. O médico pode trocar para manual na interface.
// No modo manual, a seleção do médico prevalece sobre o cálculo.
let _diastModo = 'auto'; // 'auto' ou 'manual'
let _diastManualSelecao = -1; // índice da sentença manual selecionada
let _diastManualTextoLivre = ''; // texto livre digitado pelo médico

const DIAST_SENTENCAS = [
  {achado:'Índices diastólicos do ventrículo esquerdo preservados.', conclusao:'', alerta:false},
  {achado:'Disfunção diastólica do ventrículo esquerdo de grau I (alteração de relaxamento).', conclusao:'Disfunção diastólica de grau I do ventrículo esquerdo (alteração de relaxamento).', alerta:true},
  {achado:'Disfunção diastólica do ventrículo esquerdo de grau II (padrão pseudonormal).', conclusao:'Disfunção diastólica de grau II do ventrículo esquerdo (padrão pseudo-normal).', alerta:true},
  {achado:'Disfunção diastólica do ventrículo esquerdo de grau III (padrão restritivo).', conclusao:'Disfunção diastólica de grau III do ventrículo esquerdo (padrão restritivo).', alerta:true},
  {achado:'Função diastólica do ventrículo esquerdo indeterminada.', conclusao:'Função diastólica do ventrículo esquerdo indeterminada.', alerta:false},
  {achado:'Avaliação da função diastólica limitada devido arritmia cardíaca.', conclusao:'', alerta:false},
  {achado:'', conclusao:'', alerta:false}, // não avaliar
];

function setDiastModo(modo){ _diastModo = modo; }
function setDiastManual(idx){ _diastManualSelecao = idx; }
function setDiastTextoLivre(txt){ _diastManualTextoLivre = txt; }
function getDiastModo(){ return _diastModo; }

// Retorna o achado diastólico baseado no modo (auto ou manual)
function diastAchado(d){
  if(_diastModo === 'manual'){
    if(_diastManualTextoLivre) return _diastManualTextoLivre;
    if(_diastManualSelecao >= 0 && _diastManualSelecao < DIAST_SENTENCAS.length){
      return DIAST_SENTENCAS[_diastManualSelecao].achado;
    }
    return '';
  }
  // Modo automático
  return j21FA_achado(d);
}

// Retorna a conclusão diastólica baseada no modo
function diastConclusao(d){
  if(_diastModo === 'manual'){
    if(_diastManualTextoLivre) return _diastManualTextoLivre;
    if(_diastManualSelecao >= 0 && _diastManualSelecao < DIAST_SENTENCAS.length){
      // Se é FA (índice 5), calcular pressão de enchimento
      if(_diastManualSelecao === 5) return j43(d);
      return DIAST_SENTENCAS[_diastManualSelecao].conclusao;
    }
    return '';
  }
  // Modo automático
  return j43(d);
}

// Verifica divergência entre manual e automático
function diastDivergencia(d){
  if(_diastModo !== 'manual' || _diastManualSelecao < 0 || _diastManualSelecao === 6) return null;
  const autoResult = j21(d);
  if(!autoResult) return null;

  const MAPA_IDX_AUTO = {
    0: 'preservados',
    1: 'Grau I',
    2: 'Grau II',
    3: 'Grau III',
    4: 'Indeterminada',
    5: 'FA_',
  };
  const chave = MAPA_IDX_AUTO[_diastManualSelecao];
  if(!chave) return null;

  const corresponde = autoResult.includes(chave);
  if(!corresponde){
    return {
      manual: DIAST_SENTENCAS[_diastManualSelecao].achado.split('.')[0],
      auto: autoResult,
      msg: 'Seleção manual diverge do cálculo automático. O laudo seguirá sua escolha.'
    };
  }
  return null;
}

// ══ ACHADOS ══
// ORDEM ORIGINAL DO V6 — não modificar
function gerarAchados(d){
  const L=(...xs)=>xs.filter(Boolean);

  const mitMorf = j24(d);
  const tricMorf = jTricMorf(d);
  const fluxoAV = j28(d);
  const aoMorf = j31(d);
  const pulmMorf = jPulmMorf(d);

  return [
    // Ritmo e câmaras
    ...L(j2(d)),
    ...L(j4(d)||j3(d)),
    ...L(j5(d)),
    ...L(j6(d)),
    ...L(j7(d)),
    ...L(j8(d)),
    // VE estrutura
    ...L(j9(d)),
    ...L(j10(d)),
    // Sistólica VE
    ...L(d.b54!==null?j12(d):j11(d)),
    // GLS VE (só se preenchido, após sistólica VE)
    ...L(jGLSve(d)),
    // Contratilidade
    ...L(j13(d),j14(d),j15(d),j16(d),j17(d),j18(d),j19(d),j20(d)),
    // Diastólica (toggle auto/manual)
    ...L(diastAchado(d)),
    ...L(_diastModo==='manual' ? '' : j22FA(d)),
    // LA strain (só se preenchido, após diastólica)
    ...L(jLARS(d)),
    // HP por IT
    ...L(j50(d)),
    // VD sistólica
    ...L(j23(d)),
    // GLS VD (só se preenchido, após VD sistólica)
    ...L(jGLSvd(d)),
    // ── ATRIOVENTRICULARES ──
    ...L(mitMorf),
    ...L(j25(d),j26(d),j27(d)),
    ...L(fluxoAV),
    ...L(j29(d)),
    ...L(tricMorf),
    ...jEstenTric(d),
    ...L(jWilkins(d)),
    ...L(j30(d)),
    // ── SEMILUNARES ──
    ...L(aoMorf),
    ...L(j32(d),j33(d),j34(d)),
    ...L(j35(d)),
    ...L(pulmMorf),
    ...jEstenPulm(d),
    ...jRefluxoPulm(d),
    // ── PERICÁRDIO E AORTA ──
    ...L(j36(d)),
    ...L(j37(d),j38(d),j39(d),jAortaNormaisComplementar(d),j40(d)),
  ].filter(Boolean);
}

// Conclusão aorta — usa mesma classificação por DP
function concAorta(d){
  if(!d.sexo) return '';
  const raiz = _classificarAorta(d, d.b7, 'raiz', 'da raiz da aorta');
  const asc = _classificarAorta(d, d.b28, 'ascendente', 'da aorta ascendente');
  const arco = _classificarAorta(d, d.b29, 'arco', 'do arco aórtico');

  const alterados = [];
  if(raiz && raiz.grau !== 'normal') alterados.push({seg:'raiz aórtica', grau:raiz.grau});
  if(asc && asc.grau !== 'normal') alterados.push({seg:'aorta ascendente', grau:asc.grau});
  if(arco && arco.grau !== 'normal') alterados.push({seg:'arco aórtico', grau:arco.grau});

  if(!alterados.length) return '';
  if(alterados.length === 1) return 'Ectasia '+alterados[0].grau+' da '+alterados[0].seg+'.';
  // Múltiplos segmentos — com "e" antes do último
  const segs = alterados.map(a=>a.seg);
  const segsTexto = segs.length === 2
    ? segs[0]+' e '+segs[1]
    : segs.slice(0,-1).join(', ')+' e '+segs[segs.length-1];
  return 'Ectasia da aorta ('+segsTexto+').';
}

// ══ CONCLUSÃO ══
function gerarConclusao(d){
  const add=(arr,txt)=>{ if(txt) arr.push(txt); };
  const c=[];
  add(c,diastConclusao(d));
  add(c,j47(d));
  // Sistólica unificada (dilatação + disfunção VE/VD)
  add(c,concSistolica(d));
  const rm={L:'Insuficiência Mitral leve.',LM:'Insuficiência Mitral leve a moderada.',M:'Insuficiência Mitral moderada.',MI:'Insuficiência Mitral moderada a importante.',I:'Insuficiência Mitral importante.'};
  if(d.b35) add(c,rm[d.b35]);
  const rt={L:'Insuficiência Tricúspide leve.',LM:'Insuficiência Tricúspide leve a moderada.',M:'Insuficiência Tricúspide moderada.',MI:'Insuficiência Tricúspide moderada a importante.',I:'Insuficiência Tricúspide importante.'};
  if(d.b36) add(c,rt[d.b36]);
  const ra={L:'Insuficiência Aórtica leve.',LM:'Insuficiência Aórtica leve a moderada.',M:'Insuficiência Aórtica moderada.',MI:'Insuficiência Aórtica moderada a importante.',I:'Insuficiência Aórtica importante.'};
  if(d.b40) add(c,ra[d.b40]);
  // VD disfunção já contemplado em concSistolica acima
  add(c,concEstenMit(d));
  // Estenose Tricúspide
  if(d.estenTricGrau==='importante') add(c,'Estenose Tricúspide Importante.');
  else if(d.estenTricGrau==='moderada') add(c,'Estenose Tricúspide Moderada.');
  add(c,concEstenAo(d));
  // Estenose Pulmonar — todos os graus
  if(d.estenPulmGrau==='importante') add(c,'Estenose Pulmonar Importante.');
  else if(d.estenPulmGrau==='moderada') add(c,'Estenose Pulmonar Moderada.');
  else if(d.estenPulmGrau==='leve') add(c,'Estenose Pulmonar Leve.');
  // Refluxo Pulmonar — todos os graus
  if(d.b40p){ const m={L:'Insuficiência Pulmonar leve.',LM:'Insuficiência Pulmonar leve a moderada.',M:'Insuficiência Pulmonar moderada.',MI:'Insuficiência Pulmonar moderada a importante.',I:'Insuficiência Pulmonar importante.'}; add(c,m[d.b40p]); }
  add(c,concHP(d));
  if(d.b41){ const g={L:'leve',LM:'leve a moderado',M:'moderado',MI:'moderado a importante',I:'importante'}; add(c,`Derrame pericárdico ${g[d.b41]}.`); }
  // Ectasia da aorta — J52 da planilha
  add(c,concAorta(d));
  if(d.b42==='s') add(c,'Placas de ateroma calcificadas e não complicadas no arco aórtico.');
  // Strain na conclusão (só se preenchido)
  add(c,concStrainVE(d));
  add(c,concStrainVD(d));
  add(c,concLARS(d));
  if(!c.length) add(c,'Exame ecodopplercardiográfico transtorácico sem alterações significativas.');
  return c;
}

// ══════════════════════════════════════════════════════════════════
// REFERÊNCIAS E ALERTAS
// ══════════════════════════════════════════════════════════════════
// WASE 2022 — limite superior do normal da Raiz (seio de Valsalva), mm,
// por SEXO e IDADE (média+1,96·DP). Sem idade → faixa média 41–65.
// docs/decisoes/2026-05-16-spec-aorta.md
function waseRaizUpper(sexo,idade){
  const m=sexo==='M';
  if(idade==null) return m?40:36;
  if(idade<=40) return m?38:35;
  if(idade<=65) return m?40:36;
  return m?41:37;
}
function refVal(campo,sexo,idade){
  if(campo==='b7'&&sexo) return '≤ '+waseRaizUpper(sexo,idade)+' mm';
  // Demais câmaras: ASE/EACVI 2015 Chamber Quantification — atualiz. 07/05/2026
  const R={b8:{M:'30–40',F:'27–38'},b9:{M:'42–58',F:'38–52'},b10:{M:'6–10',F:'6–9'},b11:{M:'6–10',F:'6–9'},b12:{M:'25–40',F:'21–35'},b13:{M:'21–35',F:'21–35'},b28:{M:'30–37',F:'27–34'},b29:{M:'22–36',F:'22–36'}};
  return R[campo]&&sexo?(R[campo][sexo]||R[campo].M)+' mm':'';
}
function idadeAnos(dn,de){
  if(!dn||!de) return null;
  const n=new Date(dn), e=new Date(de);
  let a=e.getFullYear()-n.getFullYear();
  if(e.getMonth()<n.getMonth()||(e.getMonth()===n.getMonth()&&e.getDate()<n.getDate())) a--;
  return a;
}
function isOOR(campo,val,sexo,idade){
  if(val===null) return false;
  // Raiz: alerta segue WASE sexo+idade (só dilatação — sem corte inferior).
  if(campo==='b7') return sexo?val>waseRaizUpper(sexo,idade):false;
  // Demais câmaras: ASE 2015 Chamber Quantification — atualizados 07/05/2026
  const L={b8:{M:[30,40],F:[27,38]},b9:{M:[42,58],F:[38,52]},b10:{M:[6,10],F:[6,9]},b11:{M:[6,10],F:[6,9]},b12:{M:[25,40],F:[21,35]},b13:{M:[21,35],F:[21,35]},b28:{M:[30,37],F:[27,34]},b29:{M:[22,36],F:[22,36]}};
  if(!L[campo]||!sexo) return false;
  const [lo,hi]=L[campo][sexo]||L[campo].M;
  return val<lo||val>hi;
}

function alertaIT(){
  const it=n('b23'), psap=n('b37');
  const el=document.getElementById('b37');
  const msg=document.getElementById('alerta-psap');
  // Alerta só se IT preenchida E PSAP vazia
  const alertar=it&&it>0&&(psap===null||psap===0);
  el.classList.toggle('alerta-it', !!alertar);
  msg.classList.toggle('show', !!alertar);
}

function calcIdade(dn,de){
  if(!dn||!de) return '';
  const n=new Date(dn), e=new Date(de);
  let a=e.getFullYear()-n.getFullYear();
  if(e.getMonth()<n.getMonth()||(e.getMonth()===n.getMonth()&&e.getDate()<n.getDate())) a--;
  return a>1?`${a} anos`:`${a} ano`;
}

// ══════════════════════════════════════════════════════════════════
// RENDERIZAR LAUDO
// ══════════════════════════════════════════════════════════════════
function fmt(x,d=1){ return x!==null&&x!==undefined?typeof x==='number'?x.toFixed(d):x:'—'; }
function isAlert(txt){ return /Disfunção|aumentado|Alteração contrátil|Hipertrofia|Ectasia|Insuficiência|Derrame|Estenose|Hipertensão|Probabilidade|Miocardiopatia/.test(txt); }

function renderWilkinsBloco(data){
  const d=typeof data==='string'?JSON.parse(data):data;
  const cats=[
    {key:'mob',label:'#Mobilidade do folheto',val:d.mob},
    {key:'esp',label:'#Espessamento valvar',val:d.esp},
    {key:'sub',label:'#Espessamento subvalvar',val:d.sub},
    {key:'cal',label:'#Calcificação valvar',val:d.cal},
  ];
  let inner='';
  cats.forEach(c=>{
    if(c.val===0||c.val===undefined) return;
    inner+=`<div class="wilkins-cat">${c.label}</div>`;
    inner+=`<div class="wilkins-linha"><span class="wilkins-pts">${c.val} pts</span><span class="wilkins-desc">${WK_DESC[c.key][c.val]}</span></div>`;
  });
  inner+=`<div class="wilkins-total"><span class="wilkins-total-label">TOTAL</span><span class="wilkins-total-val">${d.sc} pts</span></div>`;
  inner+=`<div class="wilkins-conclusao">${d.concFrase}</div>`;
  return `<div class="linha-wrapper" draggable="true"
    ondragstart="dragStart(event)" ondragover="dragOver(event)"
    ondrop="dragDrop(event)" ondragleave="dragLeave(event)" ondragend="dragEnd(event)">
    <span class="drag-handle" title="Arrastar">⠿</span>
    <button class="btn-rm" onclick="remLinha(this)" title="Remover">×</button>
    <div style="flex:1;">
      <div class="wilkins-titulo">Escore Ecocardiográfico de Wilkins &amp; Block:</div>
      <div class="wilkins-bloco">${inner}</div>
    </div>
    <button class="btn-plus-inline" onclick="addLinhaBaixo(this)" title="Adicionar linha abaixo">+</button>
  </div>`;
}

function renderLinha(txt){
  if(txt&&txt.startsWith('__WILKINS__')){
    try{ return renderWilkinsBloco(txt.replace('__WILKINS__','')); }catch(e){}
  }
  const al=isAlert(txt)?' alert-line':'';
  return `<div class="linha-wrapper" draggable="true"
    ondragstart="dragStart(event)" ondragover="dragOver(event)"
    ondrop="dragDrop(event)" ondragleave="dragLeave(event)" ondragend="dragEnd(event)">
    <span class="drag-handle" title="Arrastar para reordenar">⠿</span>
    <button class="btn-rm" onclick="remLinha(this)" title="Remover">×</button>
    <textarea class="achado-editable${al}" rows="1" oninput="ar(this)">${txt}</textarea>
    <button class="btn-plus-inline" onclick="addLinhaBaixo(this)" title="Adicionar linha abaixo">+</button>
  </div>`;
}

function renderConcLinha(txt,num){
  return `<li class="conc-wrapper" draggable="true"
    ondragstart="dragStart(event)" ondragover="dragOver(event)"
    ondrop="dragDrop(event)" ondragleave="dragLeave(event)" ondragend="dragEnd(event)">
    <span class="drag-handle" title="Arrastar para reordenar">⠿</span>
    <span class="conclusao-num">${num}</span>
    <span class="conclusao-text" contenteditable="true">${txt}</span>
    <button class="btn-rm" onclick="remConc(this)" title="Remover">×</button>
  </li>`;
}

function renderizarLaudo(d){
  // Identificação
  document.getElementById('out-nome').textContent=v('nome')||'—';
  document.getElementById('out-idade').textContent=calcIdade(v('dtnasc'),v('dtexame'))||'—';
  document.getElementById('out-dtnasc').textContent=v('dtnasc')?new Date(v('dtnasc')+'T12:00').toLocaleDateString('pt-BR'):'—';
  document.getElementById('out-convenio').textContent=v('convenio')||'—';
  document.getElementById('out-solicitante').textContent=v('solicitante')||'—';
  document.getElementById('out-dtexame').textContent=v('dtexame')?new Date(v('dtexame')+'T12:00').toLocaleDateString('pt-BR'):'—';

  // Sidebar calculados
  const sc=(id,x,d=1)=>{const el=document.getElementById(id);if(el)el.textContent=x!==null?(typeof x==='number'?x.toFixed(d):x):'—';};
  sc('calc-imc',d.imc); sc('calc-asc',d.asc,2); sc('calc-vdf',d.vdf); sc('calc-vsf',d.vsf);
  sc('calc-fe',d.feT!==null?(d.feT*100).toFixed(1)+'%':d.b12===null?'VIDE':'—',0);
  sc('calc-fs',d.fs!==null?(d.fs*100).toFixed(1)+'%':d.b12===null?'VIDE':'—',0);
  sc('calc-massa',d.massa); sc('calc-im',d.imVE); sc('calc-er',d.er,2); sc('calc-aoae',d.aoae,2);

  // Tabela parâmetros
  const sexo=d.sexo;
  const rows=[
    ['Sexo',d.sexo||'—','','','Índice de Massa Corporal',fmt(d.imc),'kg/m²','<25 kg/m²'],
    ['Peso',fmt(d.peso),'Kg','','Relação Ao/AE',fmt(d.aoae,2),'',''],
    ['Altura',fmt(d.alt),'cm','','Vol. Diast. final VE',fmt(d.vdf),'ml',sexo?`${sexo==='M'?'62–150':'46–106'} ml`:''],
    ['Raiz Aórtica',fmt(d.b7),'mm',refVal('b7',sexo,idadeAnos(v('dtnasc'),v('dtexame'))),'Vol. Sist. final VE',fmt(d.vsf),'ml',sexo?`${sexo==='M'?'21–61':'14–42'} ml`:''],
    ['Átrio Esquerdo',fmt(d.b8),'mm',refVal('b8',sexo),'Fração de Ejeção (Teichholz)',d.feT!==null?(d.feT*100).toFixed(0)+'%':(d.b12===null?'VIDE':'—'),'',sexo?`>${sexo==='M'?51:53}%`:''],
    ['DDVE',fmt(d.b9),'mm',refVal('b9',sexo),'Fração de Encurtamento',d.fs!==null?(d.fs*100).toFixed(0)+'%':(d.b12===null?'VIDE':'—'),'','30–40%'],
    ['Septo Interventricular',fmt(d.b10),'mm',refVal('b10',sexo),'Massa do VE',fmt(d.massa),'g',sexo?`<${sexo==='M'?201:151} g`:''],
    ['Parede Posterior',fmt(d.b11),'mm',refVal('b11',sexo),'Índice de Massa VE',fmt(d.imVE),'g/m²',sexo?`<${sexo==='M'?103:89} g/m²`:''],
    ['DSVE',fmt(d.b12),'mm',refVal('b12',sexo),'Espessura Relativa',fmt(d.er,2),'','<0,43'],
    ['Ventrículo Direito',fmt(d.b13),'mm',refVal('b13',sexo),'Área Sup. Corpórea',fmt(d.asc,2),'m²',''],
  ];
  const campos=['b7','b8','b9','b10','b11','b12','b13',null,null,null];
  let html='';
  const idadeRef=idadeAnos(v('dtnasc'),v('dtexame'));
  rows.forEach((r,i)=>{
    const al=campos[i]?isOOR(campos[i],d[campos[i]],sexo,idadeRef):false;
    html+=`<tr><td>${r[0]}</td><td class="val${al?' alert':''}">${r[1]}</td><td class="ref">${r[2]}</td><td class="ref">${r[3]}</td><td class="params-divider">${r[4]}</td><td class="val">${r[5]}</td><td class="ref">${r[6]}</td><td class="ref">${r[7]}</td></tr>`;
  });
  document.getElementById('params-tbody').innerHTML=html;

  // Achados
  const linhas=gerarAchados(d);
  let ah=`<button class="btn-add-top" onclick="abrirBanco(null,'top')">＋ Adicionar item</button>`;
  linhas.forEach(l=>{ ah+=renderLinha(l); });
  document.getElementById('achados-body').innerHTML=ah;
  document.querySelectorAll('.achado-editable').forEach(ar);

  // Conclusão
  const concs=gerarConclusao(d);
  let ch='';
  concs.forEach((c,i)=>{ ch+=renderConcLinha(c,i+1); });
  ch+=`<li style="padding:3px 0;"><button class="btn-add-top" style="margin:0;" onclick="addConclusao()">＋ Adicionar item</button></li>`;
  document.getElementById('conclusao-list').innerHTML=ch;
}

// ══════════════════════════════════════════════════════════════════
// MANIPULAÇÃO DE LINHAS
// ══════════════════════════════════════════════════════════════════
function ar(el){ el.style.height='auto'; el.style.height=el.scrollHeight+'px'; }

function remLinha(btn){ btn.closest('.linha-wrapper').remove(); }

function addLinhaBaixo(btn){
  const wrapper=btn.closest('.linha-wrapper');
  const nova=document.createElement('div');
  nova.innerHTML=renderLinha('');
  wrapper.parentNode.insertBefore(nova.firstElementChild,wrapper.nextSibling);
  nova.querySelector?.('.achado-editable')?.focus();
  // foca no textarea recém-criado
  const novoWrapper=wrapper.nextSibling;
  if(novoWrapper){const ta=novoWrapper.querySelector('.achado-editable');if(ta){ar(ta);ta.focus();}}
}

function remConc(btn){ btn.closest('.conc-wrapper').remove(); renum(); }
function renum(){ document.querySelectorAll('#conclusao-list .conc-wrapper').forEach((li,i)=>{ const n=li.querySelector('.conclusao-num');if(n)n.textContent=i+1; }); }

// ── Drag & Drop ───────────────────────────────────────────────────
let dragSrc=null;
function dragStart(e){
  dragSrc=e.currentTarget;
  dragSrc.classList.add('dragging');
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain','');
}
function dragOver(e){
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  const target=e.currentTarget;
  if(target!==dragSrc) target.classList.add('drag-over');
}
function dragLeave(e){ e.currentTarget.classList.remove('drag-over'); }
function dragEnd(e){
  document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));
  dragSrc=null;
}
function dragDrop(e){
  e.preventDefault();
  const target=e.currentTarget;
  target.classList.remove('drag-over');
  if(!dragSrc||dragSrc===target) return;
  const parent=target.parentNode;
  const allItems=[...parent.children];
  const srcIdx=allItems.indexOf(dragSrc);
  const tgtIdx=allItems.indexOf(target);
  if(srcIdx<tgtIdx) parent.insertBefore(dragSrc,target.nextSibling);
  else parent.insertBefore(dragSrc,target);
  // renumerar se for conclusão
  if(parent.id==='conclusao-list') renum();
  // resize textareas
  parent.querySelectorAll('.achado-editable').forEach(ar);
}
function addConclusao(){
  const list=document.getElementById('conclusao-list');
  const addBtn=list.querySelector('li:last-child');
  const li=document.createElement('li');
  li.className='conc-wrapper';
  li.innerHTML=`<span class="conclusao-num">?</span><span class="conclusao-text" contenteditable="true"></span><button class="btn-rm" onclick="remConc(this)">×</button>`;
  list.insertBefore(li,addBtn);
  renum();
  li.querySelector('.conclusao-text').focus();
}

// ══════════════════════════════════════════════════════════════════
// BANCO DE FRASES
// ══════════════════════════════════════════════════════════════════
const CATS=['Ritmo','Câmaras','Sistólica VE','Contratilidade','Diastólica','Ventrículo Direito','Válvulas','Pericárdio/Aorta','Outros'];

const FRASES_DEFAULT=[
  {id:1,cat:'Ritmo',txt:'Ritmo cardíaco regular.'},
  {id:2,cat:'Ritmo',txt:'Ritmo cardíaco irregular.'},
  {id:3,cat:'Ritmo',txt:'Exame realizado em vigência de arritmia.'},
  {id:4,cat:'Câmaras',txt:'Câmaras cardíacas com dimensões normais.'},
  {id:5,cat:'Câmaras',txt:'Janela acústica limitada.'},
  {id:6,cat:'Câmaras',txt:'Exame realizado a beira do leito e sob ventilação mecânica.'},
  {id:7,cat:'Câmaras',txt:'Septo interventricular com movimento atípico.'},
  {id:8,cat:'Câmaras',txt:'Septo interventricular retificado.'},
  {id:9,cat:'Sistólica VE',txt:'Função sistólica do ventrículo esquerdo preservada.'},
  {id:10,cat:'Sistólica VE',txt:'Disfunção sistólica do ventrículo esquerdo em grau leve.'},
  {id:11,cat:'Sistólica VE',txt:'Disfunção sistólica do ventrículo esquerdo em grau moderado.'},
  {id:12,cat:'Sistólica VE',txt:'Disfunção sistólica do ventrículo esquerdo em grau importante.'},
  {id:13,cat:'Contratilidade',txt:'Contratilidade preservada nas demais paredes.'},
  {id:14,cat:'Contratilidade',txt:'Alteração contrátil por hipocinesia difusa do ventrículo esquerdo.'},
  {id:15,cat:'Diastólica',txt:'Índices diastólicos do ventrículo esquerdo preservados.'},
  {id:16,cat:'Diastólica',txt:'Disfunção Diastólica do ventrículo esquerdo de Grau I (Alteração de Relaxamento).'},
  {id:17,cat:'Diastólica',txt:'Disfunção Diastólica do ventrículo esquerdo de Grau II (Pseudonormal).'},
  {id:18,cat:'Diastólica',txt:'Disfunção Diastólica do ventrículo esquerdo de Grau III (Padrão Restritivo).'},
  {id:19,cat:'Diastólica',txt:'Função Diastólica do ventrículo esquerdo Indeterminada.'},
  {id:20,cat:'Ventrículo Direito',txt:'Função sistólica do ventrículo direito preservada.'},
  {id:21,cat:'Ventrículo Direito',txt:'Disfunção sistólica do ventrículo direito. TAPSE (VR ≥ 20 mm).'},
  {id:22,cat:'Válvulas',txt:'Válvulas atrioventriculares com a morfologia preservada.'},
  {id:23,cat:'Válvulas',txt:'Fluxo pelas válvulas atrioventriculares preservado.'},
  {id:24,cat:'Válvulas',txt:'Ausência de sinais indiretos de hipertensão pulmonar.'},
  {id:25,cat:'Válvulas',txt:'Válvulas semilunares com morfologia preservada.'},
  {id:26,cat:'Válvulas',txt:'Fluxo pelas válvulas semilunares preservado.'},
  {id:27,cat:'Pericárdio/Aorta',txt:'Pericárdio sem alterações.'},
  {id:28,cat:'Pericárdio/Aorta',txt:'Raiz aórtica, aorta ascendente e arco aórtico com dimensões normais.'},
  {id:29,cat:'Pericárdio/Aorta',txt:'Placas de ateroma calcificadas e não complicadas no arco aórtico.'},
  {id:30,cat:'Outros',txt:'Não visualizado trombos intracavitários.'},
  {id:31,cat:'Outros',txt:'Não visualizado imagem sugestiva de endocardite infecciosa.'},
  {id:32,cat:'Outros',txt:'Cabo de marcapasso presente em câmaras direitas.'},
  {id:33,cat:'Outros',txt:'Strain Global longitudinal do ventrículo esquerdo pelo "speckle tracking" de - %. VR ≥ -18%.'},
  {id:34,cat:'Outros',txt:'Exame realizado com paciente em decúbito dorsal.'},
];

function loadBanco(){
  try{ const s=localStorage.getItem('medcardio_banco'); return s?JSON.parse(s):JSON.parse(JSON.stringify(FRASES_DEFAULT)); }
  catch{ return JSON.parse(JSON.stringify(FRASES_DEFAULT)); }
}
function saveBanco(frases){ try{localStorage.setItem('medcardio_banco',JSON.stringify(frases));}catch{} }

let banco=loadBanco();
let catAtiva='Todos';
let fraseSelecionada=null;
let insertTarget=null; // 'top' ou elemento wrapper

function abrirBanco(target, pos){
  insertTarget={target,pos};
  fraseSelecionada=null;
  document.getElementById('btn-inserir-frase').disabled=true;
  document.getElementById('banco-busca').value='';
  catAtiva='Todos';
  renderCats();
  renderBanco();
  // popular select de categorias no footer
  const sel=document.getElementById('nova-frase-cat');
  sel.innerHTML=CATS.map(c=>`<option value="${c}">${c}</option>`).join('');
  document.getElementById('modal-banco').classList.add('open');
}

function fecharBanco(){ document.getElementById('modal-banco').classList.remove('open'); }

function renderCats(){
  const div=document.getElementById('banco-cats');
  const todas=['Todos',...CATS];
  div.innerHTML=todas.map(c=>`<button class="cat-btn${c===catAtiva?' active':''}" onclick="setCat('${c}')">${c}</button>`).join('');
}

function setCat(c){ catAtiva=c; renderCats(); renderBanco(); }

function renderBanco(){
  const busca=document.getElementById('banco-busca').value.toLowerCase();
  const lista=document.getElementById('banco-lista');
  const filtradas=banco.filter(f=>{
    const catOk=catAtiva==='Todos'||f.cat===catAtiva;
    const busOk=!busca||f.txt.toLowerCase().includes(busca)||f.cat.toLowerCase().includes(busca);
    return catOk&&busOk;
  });
  if(!filtradas.length){ lista.innerHTML='<div style="color:var(--gray-mid);padding:20px;text-align:center;font-size:12px;">Nenhuma frase encontrada.</div>'; return; }
  lista.innerHTML=filtradas.map(f=>`
    <div class="frase-item${fraseSelecionada===f.id?' selected':''}" onclick="selFrase(${f.id})">
      <span class="frase-cat">${f.cat}</span>
      <span class="frase-text">${f.txt}</span>
      <div class="frase-btns">
        <button class="frase-btn-edit" onclick="editFrase(event,${f.id})">✏️</button>
        <button class="frase-btn-del" onclick="delFrase(event,${f.id})">🗑️</button>
      </div>
    </div>`).join('');
}

function selFrase(id){
  fraseSelecionada=id;
  document.getElementById('btn-inserir-frase').disabled=false;
  renderBanco();
}

function editFrase(e,id){
  e.stopPropagation();
  const f=banco.find(x=>x.id===id);
  if(!f) return;
  const novo=prompt('Editar frase:',f.txt);
  if(novo!==null&&novo.trim()){ f.txt=novo.trim(); saveBanco(banco); renderBanco(); }
}

function delFrase(e,id){
  e.stopPropagation();
  if(!confirm('Excluir esta frase do banco?')) return;
  banco=banco.filter(x=>x.id!==id);
  saveBanco(banco);
  if(fraseSelecionada===id){ fraseSelecionada=null; document.getElementById('btn-inserir-frase').disabled=true; }
  renderBanco();
}

function adicionarFraseBanco(){
  const txt=document.getElementById('nova-frase-txt').value.trim();
  const cat=document.getElementById('nova-frase-cat').value;
  if(!txt) return;
  const id=Date.now();
  banco.push({id,cat,txt});
  saveBanco(banco);
  document.getElementById('nova-frase-txt').value='';
  renderBanco();
}

function inserirFraseSelecionada(){
  if(!fraseSelecionada) return;
  const f=banco.find(x=>x.id===fraseSelecionada);
  if(!f) return;
  const body=document.getElementById('achados-body');
  const novaDiv=document.createElement('div');
  novaDiv.innerHTML=renderLinha(f.txt);
  const nova=novaDiv.firstElementChild;

  if(insertTarget&&insertTarget.pos==='top'){
    // inserir logo após o botão "Adicionar item" no topo
    const addBtn=body.querySelector('.btn-add-top');
    body.insertBefore(nova,addBtn?addBtn.nextSibling:body.firstChild);
  } else if(insertTarget&&insertTarget.target){
    insertTarget.target.parentNode.insertBefore(nova,insertTarget.target.nextSibling);
  } else {
    body.appendChild(nova);
  }
  ar(nova.querySelector('.achado-editable'));
  fecharBanco();
}

// ══════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════
function calc(){
  const d=calcAll();
  renderizarLaudo(d);
  alertaIT();
}

// ══════════════════════════════════════════════════════════════════
// PREMISSA 2: INTEGRAÇÃO DICOM SR
// Recebe dados do Vivid T8 (ou qualquer aparelho) e preenche os
// campos do DOM. O motor continua lendo do DOM como sempre.
// ══════════════════════════════════════════════════════════════════

// Mapeamento: Código DICOM SR (TID 5200) → Campo do DOM (id)
const DICOM_TO_DOM = {
  '18083-6': 'b9',    // LVEDD → VE diástole
  '18085-1': 'b12',   // LVESD → VE sístole
  '18157-8': 'b10',   // IVSd → Septo IV
  '18159-4': 'b11',   // LVPWd → Parede posterior
  '18043-0': 'b25',   // LVEF → Fração de ejeção
  '18010-9': 'b8',    // LA → Átrio esquerdo
  '18008-3': 'b7',    // AoRoot → Aorta
  '18148-7': 'b13',   // RVEDD → VD basal
  '18036-4': 'tapse',  // TAPSE
  '18044-8': 'b50',   // Aortic Peak Velocity
  '18045-5': 'b50p',  // Aortic Peak Gradient
  '18046-3': 'b51',   // Aortic Mean Gradient
  '18047-1': 'b52',   // Aortic Valve Area
  '18060-4': 'b21',   // Mitral E Velocity
  '18061-2': 'b22',   // Mitral A Velocity
  '18029-9': 'psmap', // PASP
};

// Importar medidas de DICOM SR → preenche DOM → recalcula
function importarDICOM(dicomData){
  if(!dicomData || !dicomData.measurements) return {ok:false, msg:'Sem medidas no DICOM'};
  let count = 0;
  Object.entries(dicomData.measurements).forEach(([code, valor])=>{
    const campoId = DICOM_TO_DOM[code];
    if(campoId){
      const el = document.getElementById(campoId);
      if(el){ el.value = valor; count++; }
    }
  });
  // Preencher dados do paciente se disponíveis
  if(dicomData.patientName){
    const el = document.getElementById('nome');
    if(el) el.value = dicomData.patientName;
  }
  if(dicomData.studyDate){
    const el = document.getElementById('dtexame');
    if(el){
      // DICOM usa YYYYMMDD, converter para YYYY-MM-DD
      const d = dicomData.studyDate;
      if(d.length===8) el.value = d.substring(0,4)+'-'+d.substring(4,6)+'-'+d.substring(6,8);
      else el.value = d;
    }
  }
  // Recalcular tudo
  calc();
  return {ok:true, count, msg:count+' medidas importadas do DICOM SR'};
}

// Importar de arquivo USB/pasta (recebe conteúdo já parseado)
function importarDeArquivo(medidasObj){
  if(!medidasObj) return {ok:false, msg:'Sem dados'};
  let count = 0;
  Object.entries(medidasObj).forEach(([campoId, valor])=>{
    const el = document.getElementById(campoId);
    if(el){ el.value = valor; count++; }
  });
  calc();
  return {ok:true, count, msg:count+' campos preenchidos'};
}

// ══════════════════════════════════════════════════════════════════
// PREMISSA 3: PREPARAÇÃO i18n
// O motor funciona em português. Quando precisar traduzir:
//   1. Substituir strings por chamadas t('chave')
//   2. Criar arquivo de idioma com as traduções
//   3. O motor continua idêntico, só a saída muda
//
// Para facilitar a futura migração, cada string traduzível
// está marcada com o comentário // i18n: chave_sugerida
// Basta buscar "// i18n:" no código para encontrar todas.
//
// Exemplo de migração futura (NÃO alterar agora):
//   ANTES:  return 'Cavidades cardíacas com dimensões normais.'; // i18n: camaras_normais
//   DEPOIS: return t('camaras_normais');
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// REGISTRO NO ORQUESTRADOR
// ══════════════════════════════════════════════════════════════════
if(typeof registrarMotor === 'function'){
  registrarMotor('eco_tt', {
    tipo: 'eco_tt',
    nome: 'Ecocardiograma Transtorácico (Motor V8 MP4)',
    calcular: calcAll,
    gerarAchados: gerarAchados,
    gerarConclusao: gerarConclusao,
    renderizar: renderizarLaudo,
    calc: calc,
    importarDICOM: importarDICOM,
    importarDeArquivo: importarDeArquivo,
    DICOM_TO_DOM: DICOM_TO_DOM,
    // Diastologia toggle
    setDiastModo: setDiastModo,
    setDiastManual: setDiastManual,
    setDiastTextoLivre: setDiastTextoLivre,
    getDiastModo: getDiastModo,
    diastDivergencia: diastDivergencia,
    DIAST_SENTENCAS: DIAST_SENTENCAS,
  });
}

console.log('%c🫀 Motor V8 MP4 (ECO TT) carregado — DICOM-ready ('+Object.keys(DICOM_TO_DOM).length+' campos) · Strain · i18n-prepared','color:#059669;font-weight:bold;font-size:11px;');
