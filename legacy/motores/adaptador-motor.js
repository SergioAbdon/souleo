// ══════════════════════════════════════════════════════════════════
// LEO · ADAPTADOR DO MOTOR V7
//
// Camada de tradução entre o mundo externo e o Motor V8 MP4.
// O Motor V8 MP4 (motorv8mp4.js) NÃO é modificado.
// Este arquivo apenas:
//   1. Traduz dados DICOM → campos do DOM (b7, b8, b9...)
//   2. Traduz dados USB/Drive → campos do DOM
//   3. Mantém mapa de nomes descritivos ↔ IDs do DOM ↔ DICOM
//   4. Prepara saída para tradução futura (i18n)
//   5. Prepara prompt para Claude API
//
// REGRA DE OURO: Este arquivo NUNCA altera a lógica do motor.
//                Ele só preenche campos e chama calc().
// ══════════════════════════════════════════════════════════════════

'use strict';

const AdaptadorMotor = (function(){

  // ══ MAPA MESTRE ══════════════════════════════════════════════
  // nome_descritivo ↔ id_dom (campo HTML) ↔ codigo_dicom
  // Este é o ÚNICO lugar onde a tradução existe.

  const MAPA = [
    // Medidas Gerais
    {nome:'peso',                        dom:'peso',    dicom:null,       unidade:'kg',    extenso:'Peso'},
    {nome:'altura',                      dom:'altura',  dicom:null,       unidade:'cm',    extenso:'Altura'},

    // Câmaras
    {nome:'raiz_aortica',                dom:'b7',      dicom:'18008-3',  unidade:'mm',    extenso:'Raiz aórtica'},
    {nome:'atrio_esquerdo',              dom:'b8',      dicom:'18010-9',  unidade:'mm',    extenso:'Átrio esquerdo'},
    {nome:'diametro_diastolico_ve',      dom:'b9',      dicom:'18083-6',  unidade:'mm',    extenso:'Diâmetro diastólico do ventrículo esquerdo'},
    {nome:'septo_interventricular',      dom:'b10',     dicom:'18157-8',  unidade:'mm',    extenso:'Septo interventricular'},
    {nome:'parede_posterior',            dom:'b11',     dicom:'18159-4',  unidade:'mm',    extenso:'Parede posterior do ventrículo esquerdo'},
    {nome:'diametro_sistolico_ve',       dom:'b12',     dicom:'18085-1',  unidade:'mm',    extenso:'Diâmetro sistólico do ventrículo esquerdo'},
    {nome:'ventriculo_direito',          dom:'b13',     dicom:'18148-7',  unidade:'mm',    extenso:'Ventrículo direito'},
    {nome:'aorta_ascendente',            dom:'b28',     dicom:null,       unidade:'mm',    extenso:'Aorta ascendente'},
    {nome:'arco_aortico',                dom:'b29',     dicom:null,       unidade:'mm',    extenso:'Arco aórtico'},
    {nome:'volume_ae_indexado',          dom:'b24',     dicom:null,       unidade:'ml/m²', extenso:'Volume atrial esquerdo indexado'},
    {nome:'volume_ad_indexado',          dom:'b25',     dicom:null,       unidade:'ml/m²', extenso:'Volume atrial direito indexado'},

    // Função Sistólica
    {nome:'fracao_ejecao_simpson',       dom:'b54',     dicom:'18043-0',  unidade:'%',     extenso:'Fração de ejeção (Simpson)'},
    {nome:'disfuncao_vd',                dom:'b32',     dicom:null,       unidade:'grau',  extenso:'Disfunção do ventrículo direito'},
    {nome:'tapse',                       dom:'b33',     dicom:'18036-4',  unidade:'mm',    extenso:'TAPSE'},

    // Função Diastólica
    {nome:'onda_e_mitral',               dom:'b19',     dicom:'18060-4',  unidade:'cm/s',  extenso:'Onda E mitral'},
    {nome:'onda_a_mitral',               dom:'b20',     dicom:'18061-2',  unidade:'cm/s',  extenso:'Onda A mitral'},
    {nome:'tempo_desaceleracao',         dom:'b21',     dicom:null,       unidade:'ms',    extenso:'Tempo de desaceleração'},
    {nome:'e_linha_septal',              dom:'b22',     dicom:null,       unidade:'cm/s',  extenso:"E' septal"},
    {nome:'relacao_e_elinha',            dom:'b23',     dicom:null,       unidade:'',      extenso:"Relação E/E'"},

    // Valva Mitral
    {nome:'morfologia_mitral',           dom:'b34',     dicom:null,       unidade:'',      extenso:'Morfologia mitral'},
    {nome:'insuficiencia_mitral',        dom:'b35',     dicom:null,       unidade:'grau',  extenso:'Insuficiência mitral'},
    {nome:'gradiente_maximo_mitral',     dom:'b45',     dicom:null,       unidade:'mmHg',  extenso:'Gradiente máximo mitral'},
    {nome:'gradiente_medio_mitral',      dom:'b46',     dicom:null,       unidade:'mmHg',  extenso:'Gradiente médio mitral'},
    {nome:'area_valvar_mitral',          dom:'b47',     dicom:null,       unidade:'cm²',   extenso:'Área valvar mitral'},

    // Valva Tricúspide
    {nome:'insuficiencia_tricuspide',    dom:'b36',     dicom:null,       unidade:'grau',  extenso:'Insuficiência tricúspide'},
    {nome:'velocidade_it',               dom:'b37',     dicom:null,       unidade:'m/s',   extenso:'Velocidade da insuficiência tricúspide'},
    {nome:'morfologia_tricuspide',       dom:'b34t',    dicom:null,       unidade:'',      extenso:'Morfologia tricúspide'},
    {nome:'gradiente_medio_tricuspide',  dom:'b46t',    dicom:null,       unidade:'mmHg',  extenso:'Gradiente médio tricúspide'},
    {nome:'area_valvar_tricuspide',      dom:'b47t',    dicom:null,       unidade:'cm²',   extenso:'Área valvar tricúspide'},

    // Valva Aórtica
    {nome:'insuficiencia_aortica',       dom:'b39',     dicom:null,       unidade:'grau',  extenso:'Insuficiência aórtica'},
    {nome:'morfologia_aortica',          dom:'b40',     dicom:null,       unidade:'',      extenso:'Morfologia aórtica'},
    {nome:'gradiente_maximo_aortico',    dom:'b50',     dicom:'18045-5',  unidade:'mmHg',  extenso:'Gradiente máximo aórtico'},
    {nome:'gradiente_medio_aortico',     dom:'b51',     dicom:'18046-3',  unidade:'mmHg',  extenso:'Gradiente médio aórtico'},
    {nome:'area_valvar_aortica',         dom:'b52',     dicom:'18047-1',  unidade:'cm²',   extenso:'Área valvar aórtica'},

    // Valva Pulmonar
    {nome:'hipertensao_pulmonar',        dom:'b38',     dicom:null,       unidade:'',      extenso:'Hipertensão pulmonar'},
    {nome:'morfologia_pulmonar',         dom:'b39p',    dicom:null,       unidade:'',      extenso:'Morfologia pulmonar'},
    {nome:'insuficiencia_pulmonar',      dom:'b40p',    dicom:null,       unidade:'grau',  extenso:'Insuficiência pulmonar'},
    {nome:'gradiente_maximo_pulmonar',   dom:'b50p',    dicom:null,       unidade:'mmHg',  extenso:'Gradiente máximo pulmonar'},

    // Pericárdio e Outros
    {nome:'pericardio',                  dom:'b41',     dicom:null,       unidade:'',      extenso:'Pericárdio'},
    {nome:'trombo_massa',                dom:'b42',     dicom:null,       unidade:'',      extenso:'Trombo ou massa'},
    {nome:'psap',                        dom:'psmap',   dicom:'18029-9',  unidade:'mmHg',  extenso:'Pressão sistólica da artéria pulmonar'},
    {nome:'exame_normal',                dom:'b27',     dicom:null,       unidade:'',      extenso:'Exame normal'},

    // Contratilidade Segmentar
    {nome:'apex',                        dom:'b55',     dicom:null,       unidade:'',      extenso:'Apex'},
    {nome:'parede_anterior',             dom:'b56',     dicom:null,       unidade:'',      extenso:'Parede anterior'},
    {nome:'parede_inferior',             dom:'b57',     dicom:null,       unidade:'',      extenso:'Parede inferior'},
    {nome:'parede_lateral',              dom:'b58',     dicom:null,       unidade:'',      extenso:'Parede lateral'},
    {nome:'parede_septal',               dom:'b59',     dicom:null,       unidade:'',      extenso:'Parede septal'},
    {nome:'parede_posterior_seg',        dom:'b60',     dicom:null,       unidade:'',      extenso:'Parede posterior'},
    {nome:'vd_segmentar',                dom:'b61',     dicom:null,       unidade:'',      extenso:'Ventrículo direito segmentar'},
    {nome:'observacao_segmentar',        dom:'b62',     dicom:null,       unidade:'',      extenso:'Observação segmentar'},

    // Identificação
    {nome:'nome_paciente',               dom:'nome',    dicom:null,       unidade:'',      extenso:'Nome do paciente'},
    {nome:'data_nascimento',             dom:'dtnasc',  dicom:null,       unidade:'',      extenso:'Data de nascimento'},
    {nome:'data_exame',                  dom:'dtexame', dicom:null,       unidade:'',      extenso:'Data do exame'},
    {nome:'convenio',                    dom:'convenio',dicom:null,       unidade:'',      extenso:'Convênio'},
    {nome:'medico_solicitante',          dom:'solicitante',dicom:null,    unidade:'',      extenso:'Médico solicitante'},
    {nome:'sexo',                        dom:'sexo',    dicom:null,       unidade:'',      extenso:'Sexo'},
    {nome:'ritmo',                       dom:'ritmo',   dicom:null,       unidade:'',      extenso:'Ritmo'},
  ];

  // ══ BUSCAS RÁPIDAS ══════════════════════════════════════════

  function porNome(nome){ return MAPA.find(m => m.nome === nome); }
  function porDom(dom){ return MAPA.find(m => m.dom === dom); }
  function porDicom(codigo){ return MAPA.find(m => m.dicom === codigo); }

  // ══ IMPORTAR DICOM SR ════════════════════════════════════════
  // Recebe dados do Vivid T8 → preenche campos do DOM → chama calc()

  function importarDICOM(dicomData){
    if(!dicomData || !dicomData.measurements) return {ok:false, msg:'Sem medidas', count:0};
    let count = 0;

    Object.entries(dicomData.measurements).forEach(([codigo, valor]) => {
      const campo = porDicom(codigo);
      if(campo){
        const el = document.getElementById(campo.dom);
        if(el){ el.value = valor; count++; }
      }
    });

    // Dados do paciente
    if(dicomData.patientName){
      const el = document.getElementById('nome');
      if(el) el.value = dicomData.patientName;
    }
    if(dicomData.studyDate){
      const el = document.getElementById('dtexame');
      if(el){
        const d = dicomData.studyDate;
        el.value = d.length === 8 ? d.substring(0,4)+'-'+d.substring(4,6)+'-'+d.substring(6,8) : d;
      }
    }

    // Chamar o motor (que lê do DOM como sempre)
    if(typeof calc === 'function') calc();

    return {ok:true, count, msg:count+' medidas importadas do DICOM SR'};
  }

  // ══ IMPORTAR DE ARQUIVO (USB / GOOGLE DRIVE) ════════════════
  // Recebe objeto com nomes descritivos → traduz para DOM → chama calc()

  function importarDeArquivo(dados){
    if(!dados) return {ok:false, msg:'Sem dados', count:0};
    let count = 0;

    Object.entries(dados).forEach(([nome, valor]) => {
      const campo = porNome(nome);
      if(campo){
        const el = document.getElementById(campo.dom);
        if(el){ el.value = valor; count++; }
      }
    });

    if(typeof calc === 'function') calc();
    return {ok:true, count, msg:count+' campos preenchidos'};
  }

  // ══ EXPORTAR MEDIDAS ════════════════════════════════════════
  // Lê do DOM e retorna objeto com nomes descritivos

  function exportarMedidas(){
    const resultado = {};
    MAPA.forEach(m => {
      const el = document.getElementById(m.dom);
      if(el && el.value && el.value !== '' && el.value !== '—'){
        resultado[m.nome] = el.value;
      }
    });
    return resultado;
  }

  // ══ PREPARAR PROMPT CLAUDE API ══════════════════════════════
  // Coleta medidas e achados atuais e monta prompt para enriquecimento

  function montarPromptClaude(){
    const medidas = exportarMedidas();

    // Coletar achados do DOM (já gerados pelo motor)
    const achados = [];
    document.querySelectorAll('#achados-body .achado-editable, #achados-body .linha-wrapper textarea').forEach(el => {
      const txt = (el.value || el.innerText || '').trim();
      if(txt) achados.push(txt);
    });

    // Coletar conclusão do DOM
    const conclusoes = [];
    document.querySelectorAll('#conclusao-list .conclusao-text').forEach(el => {
      const txt = (el.innerText || '').trim();
      if(txt) conclusoes.push(txt);
    });

    // Montar texto das medidas por extenso
    const medidasTexto = Object.entries(medidas)
      .filter(([nome]) => {
        const m = porNome(nome);
        return m && m.unidade && m.unidade !== '' && m.unidade !== 'grau';
      })
      .map(([nome, valor]) => {
        const m = porNome(nome);
        return m.extenso + ': ' + valor + ' ' + m.unidade;
      })
      .join('\n');

    return {
      role: 'user',
      content: `Você é um cardiologista especialista em ecocardiografia.
Analise os achados e conclusões abaixo de um ecocardiograma transtorácico.
Enriqueça a conclusão com correlações clínicas e fisiopatologia quando relevante.
Mantenha o formato numerado. Responda em português.

MEDIDAS:
${medidasTexto}

ACHADOS:
${achados.map(a => '- ' + a).join('\n')}

CONCLUSÃO ATUAL:
${conclusoes.map((c,i) => (i+1) + '. ' + c).join('\n')}

Enriqueça a conclusão correlacionando os achados. Sugira recomendações se apropriado.`
    };
  }

  // ══ INFORMAÇÕES DO MAPA ════════════════════════════════════

  function listarCamposDICOM(){
    return MAPA.filter(m => m.dicom).map(m => ({
      nome: m.nome,
      extenso: m.extenso,
      dom: m.dom,
      dicom: m.dicom,
      unidade: m.unidade
    }));
  }

  function listarTodosCampos(){
    return MAPA.map(m => ({
      nome: m.nome,
      extenso: m.extenso,
      dom: m.dom,
      dicom: m.dicom,
      unidade: m.unidade
    }));
  }

  // ══ INTERFACE PÚBLICA ══════════════════════════════════════

  return {
    versao: '7.0',
    MAPA: MAPA,

    // Buscas
    porNome,
    porDom,
    porDicom,

    // Importação (entrada)
    importarDICOM,
    importarDeArquivo,

    // Exportação (saída)
    exportarMedidas,

    // Claude API
    montarPromptClaude,

    // Informações
    listarCamposDICOM,
    listarTodosCampos,
  };

})();

console.log('%c🫀 Adaptador Motor V7 carregado — '+AdaptadorMotor.MAPA.length+' campos mapeados · '+AdaptadorMotor.listarCamposDICOM().length+' DICOM · Claude API ready','color:#2563EB;font-weight:bold;font-size:11px;');
