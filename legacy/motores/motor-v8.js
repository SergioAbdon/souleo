// ══════════════════════════════════════════════════════════════════
// LEO · MOTOR V8 — Ecocardiograma Transtorácico
//
// ARQUITETURA:
//   - Motor PURO (sem DOM) — recebe objeto, retorna objeto
//   - Nomes de campos descritivos (sem abreviações b7, b8...)
//   - Referências centralizadas por guideline
//   - Inferências como regras declarativas
//   - Laudo sem abreviações (tudo por extenso)
//   - Preparado para i18n e DICOM
//   - Preparado para enriquecimento via Claude API
//
// PREMISSAS:
//   1. Entrada abstrata (manual, DICOM, USB — tanto faz)
//   2. Saída i18n-ready (português agora, traduzível depois)
//   3. Claude API como camada opcional de enriquecimento
// ══════════════════════════════════════════════════════════════════

'use strict';

const MotorV8 = (function(){

  // ══ REFERÊNCIAS (ASE 2015 + ESC 2021) ════════════════════════
  // Centralizado — muda aqui, muda em todo o sistema

  const REFS = {
    raiz_aortica:           { M:{min:20,max:37}, F:{min:20,max:34}, unidade:'mm', extenso:'Raiz aórtica', dicom:'18008-3' },
    atrio_esquerdo:         { M:{min:27,max:38}, F:{min:27,max:38}, unidade:'mm', extenso:'Átrio esquerdo', dicom:'18010-9' },
    diametro_diastolico_ve: { M:{min:42,max:58}, F:{min:38,max:52}, unidade:'mm', extenso:'Diâmetro diastólico do ventrículo esquerdo', dicom:'18083-6' },
    diametro_sistolico_ve:  { M:{min:25,max:40}, F:{min:22,max:35}, unidade:'mm', extenso:'Diâmetro sistólico do ventrículo esquerdo', dicom:'18085-1' },
    septo_interventricular:  { M:{min:6,max:10},  F:{min:6,max:9},  unidade:'mm', extenso:'Septo interventricular', dicom:'18157-8' },
    parede_posterior:       { M:{min:6,max:10},  F:{min:6,max:9},  unidade:'mm', extenso:'Parede posterior do ventrículo esquerdo', dicom:'18159-4' },
    ventriculo_direito:     { M:{min:20,max:35}, F:{min:20,max:35}, unidade:'mm', extenso:'Ventrículo direito', dicom:'18148-7' },
    fracao_ejecao:          { M:{min:52,max:72}, F:{min:54,max:74}, unidade:'%',  extenso:'Fração de ejeção', dicom:'18043-0' },
    tapse:                  { M:{min:17,max:99}, F:{min:17,max:99}, unidade:'mm', extenso:'TAPSE', dicom:'18036-4' },
    psap:                   { M:{min:0,max:35},  F:{min:0,max:35},  unidade:'mmHg', extenso:'Pressão sistólica da artéria pulmonar' },
    indice_massa_ve:        { M:{min:0,max:115}, F:{min:0,max:95},  unidade:'g/m²', extenso:'Índice de massa do ventrículo esquerdo' },
    aorta_ascendente:       { M:{min:20,max:37}, F:{min:20,max:34}, unidade:'mm', extenso:'Aorta ascendente' },
    volume_ae_indexado:     { M:{min:16,max:34}, F:{min:16,max:34}, unidade:'ml/m²', extenso:'Volume atrial esquerdo indexado' },
  };

  // ══ MAPEAMENTO DICOM SR → CAMPOS MOTOR ═══════════════════════

  const DICOM_MAP = {
    '18008-3': 'raiz_aortica',
    '18010-9': 'atrio_esquerdo',
    '18083-6': 'diametro_diastolico_ve',
    '18085-1': 'diametro_sistolico_ve',
    '18157-8': 'septo_interventricular',
    '18159-4': 'parede_posterior',
    '18148-7': 'ventriculo_direito',
    '18043-0': 'fracao_ejecao',
    '18036-4': 'tapse',
    '18044-8': 'velocidade_maxima_aortica',
    '18045-5': 'gradiente_maximo_aortico',
    '18046-3': 'gradiente_medio_aortico',
    '18047-1': 'area_valvar_aortica',
    '18060-4': 'onda_e_mitral',
    '18061-2': 'onda_a_mitral',
    '18029-9': 'psap',
  };

  // ══ CÁLCULOS DERIVADOS ═══════════════════════════════════════

  function calcular(d){
    const r = {...d};
    const peso = Number(d.peso) || 0;
    const altura = Number(d.altura) || 0;
    const dved = Number(d.diametro_diastolico_ve) || 0;
    const dves = Number(d.diametro_sistolico_ve) || 0;
    const sivd = Number(d.septo_interventricular) || 0;
    const ppve = Number(d.parede_posterior) || 0;

    // ASC (Dubois)
    if(peso > 0 && altura > 0){
      const h = altura > 3 ? altura/100 : altura;
      r.asc = +(0.007184 * Math.pow(peso, 0.425) * Math.pow(h*100, 0.725)).toFixed(2);
      r.imc = +(peso / (h*h)).toFixed(1);
    }

    // Fração de encurtamento
    if(dved > 0 && dves > 0){
      r.fracao_encurtamento = +((( dved - dves) / dved) * 100).toFixed(0);
    }

    // FE Teichholz (se não informada manualmente)
    if(!d.fracao_ejecao && dved > 0 && dves > 0){
      const vdf = ((dved/10)**3 * 7) / (2.4 + dved/10);
      const vsf = ((dves/10)**3 * 7) / (2.4 + dves/10);
      if(vdf > 0){
        r.fracao_ejecao = +((vdf - vsf) / vdf * 100).toFixed(0);
        r.vdf = +vdf.toFixed(1);
        r.vsf = +vsf.toFixed(1);
      }
    }

    // Relação E/A
    const ondaE = Number(d.onda_e_mitral) || 0;
    const ondaA = Number(d.onda_a_mitral) || 0;
    if(ondaE > 0 && ondaA > 0) r.relacao_ea = +(ondaE / ondaA).toFixed(1);

    // E/E'
    const eLinha = Number(d.e_linha_septal) || 0;
    if(ondaE > 0 && eLinha > 0) r.relacao_e_elinha = +(ondaE / eLinha).toFixed(1);

    // Massa VE (Devereux)
    if(dved > 0 && sivd > 0 && ppve > 0){
      r.massa_ve = +(0.8 * (1.04 * (Math.pow(dved/10 + sivd/10 + ppve/10, 3) - Math.pow(dved/10, 3))) + 0.6).toFixed(0);
      if(r.asc > 0) r.indice_massa_ve = +(r.massa_ve / r.asc).toFixed(0);
    }

    // Espessura relativa
    if(dved > 0 && sivd > 0 && ppve > 0){
      r.espessura_relativa = +((sivd + ppve) / dved).toFixed(2);
    }

    // Relação Ao/AE
    const ao = Number(d.raiz_aortica) || 0;
    const ae = Number(d.atrio_esquerdo) || 0;
    if(ao > 0 && ae > 0) r.relacao_ao_ae = +(ao / ae).toFixed(2);

    // Índice aórtico
    if(d.area_valvar_aortica && r.asc > 0){
      r.indice_aortico = +(Number(d.area_valvar_aortica) / r.asc).toFixed(2);
    }

    return r;
  }

  // ══ FUNÇÕES AUXILIARES ═══════════════════════════════════════

  function dentroRef(campo, valor, sexo){
    const ref = REFS[campo];
    if(!ref) return true;
    const faixa = ref[sexo === 'F' ? 'F' : 'M'] || ref.M;
    return Number(valor) >= faixa.min && Number(valor) <= faixa.max;
  }

  function nomeExtenso(campo){
    return REFS[campo]?.extenso || campo;
  }

  function unidade(campo){
    return REFS[campo]?.unidade || '';
  }

  function classificarFE(fe){
    if(fe >= 52) return {grau:'preservada', alerta:false};
    if(fe >= 41) return {grau:'leve', alerta:true};
    if(fe >= 30) return {grau:'moderada', alerta:true};
    return {grau:'grave', alerta:true};
  }

  function classificarPSAP(psap){
    if(psap <= 35) return {grau:'normal', alerta:false};
    if(psap <= 50) return {grau:'leve', alerta:true};
    if(psap <= 65) return {grau:'moderada', alerta:true};
    return {grau:'grave', alerta:true};
  }

  function classificarEstenose(tipo, gradMax, gradMed, area){
    if(tipo === 'mitral'){
      if(gradMed > 10 || area < 1) return 'importante';
      if(gradMed >= 5 || area < 1.5) return 'moderada';
      if(gradMed > 0 || (area && area <= 2)) return 'leve';
    }
    if(tipo === 'aortica'){
      if(gradMax >= 64 || (area && area < 1)) return 'importante';
      if(gradMax >= 36 || (area && area < 1.5)) return 'moderada';
      if(gradMax >= 16) return 'leve';
    }
    return null;
  }

  // ══ REGRAS DE INFERÊNCIA (DECLARATIVAS) ═══════════════════════
  // Cada regra: {id, grupo, condicao(d), achado(d), conclusao(d), alerta}

  const REGRAS = [

    // ── RITMO ──
    {
      id: 'ritmo_sinusal',
      grupo: 'ritmo',
      condicao: (d) => !d.ritmo || d.ritmo === 'S' || d.ritmo === 'sinusal',
      achado: () => 'Ritmo cardíaco sinusal.',
    },
    {
      id: 'ritmo_irregular',
      grupo: 'ritmo',
      condicao: (d) => d.ritmo === 'N' || d.ritmo === 'irregular' || d.ritmo === 'FA',
      achado: () => 'Ritmo cardíaco irregular, sugestivo de fibrilação atrial.',
      alerta: true,
    },

    // ── CÂMARAS ──
    {
      id: 'camaras_normais',
      grupo: 'camaras',
      condicao: (d) => {
        const s = d.sexo === 'F' ? 'F' : 'M';
        return (!d.atrio_esquerdo || dentroRef('atrio_esquerdo',d.atrio_esquerdo,s))
            && (!d.diametro_diastolico_ve || dentroRef('diametro_diastolico_ve',d.diametro_diastolico_ve,s))
            && (!d.ventriculo_direito || dentroRef('ventriculo_direito',d.ventriculo_direito,s))
            && (!d.raiz_aortica || dentroRef('raiz_aortica',d.raiz_aortica,s));
      },
      achado: () => 'Cavidades cardíacas com dimensões normais.',
    },
    {
      id: 'atrio_esquerdo_aumentado',
      grupo: 'camaras',
      condicao: (d) => d.atrio_esquerdo && !dentroRef('atrio_esquerdo',d.atrio_esquerdo,d.sexo),
      achado: (d) => 'Átrio esquerdo aumentado ('+d.atrio_esquerdo+' mm).',
      conclusao: (d) => 'Aumento do átrio esquerdo ('+d.atrio_esquerdo+' mm)',
      alerta: true,
    },
    {
      id: 've_dilatado',
      grupo: 'camaras',
      condicao: (d) => d.diametro_diastolico_ve && !dentroRef('diametro_diastolico_ve',d.diametro_diastolico_ve,d.sexo),
      achado: (d) => 'Ventrículo esquerdo dilatado ('+d.diametro_diastolico_ve+' mm).',
      conclusao: (d) => 'Dilatação do ventrículo esquerdo ('+d.diametro_diastolico_ve+' mm)',
      alerta: true,
    },
    {
      id: 'vd_dilatado',
      grupo: 'camaras',
      condicao: (d) => d.ventriculo_direito && !dentroRef('ventriculo_direito',d.ventriculo_direito,d.sexo),
      achado: (d) => 'Ventrículo direito dilatado ('+d.ventriculo_direito+' mm).',
      alerta: true,
    },
    {
      id: 'aorta_dilatada',
      grupo: 'camaras',
      condicao: (d) => d.raiz_aortica && !dentroRef('raiz_aortica',d.raiz_aortica,d.sexo),
      achado: (d) => 'Raiz aórtica dilatada ('+d.raiz_aortica+' mm).',
      alerta: true,
    },

    // ── FUNÇÃO SISTÓLICA ──
    {
      id: 'fe_preservada',
      grupo: 'sistolica',
      condicao: (d) => d.fracao_ejecao && Number(d.fracao_ejecao) >= 52,
      achado: (d) => 'Função sistólica global do ventrículo esquerdo preservada (fração de ejeção = '+d.fracao_ejecao+'%).',
      conclusao: (d) => 'Função sistólica global do ventrículo esquerdo preservada (fração de ejeção = '+d.fracao_ejecao+'%)',
    },
    {
      id: 'fe_disfuncao_leve',
      grupo: 'sistolica',
      condicao: (d) => d.fracao_ejecao && Number(d.fracao_ejecao) >= 41 && Number(d.fracao_ejecao) < 52,
      achado: (d) => 'Disfunção sistólica leve do ventrículo esquerdo (fração de ejeção = '+d.fracao_ejecao+'%).',
      conclusao: (d) => 'Disfunção sistólica leve do ventrículo esquerdo (fração de ejeção = '+d.fracao_ejecao+'%)',
      alerta: true,
    },
    {
      id: 'fe_disfuncao_moderada',
      grupo: 'sistolica',
      condicao: (d) => d.fracao_ejecao && Number(d.fracao_ejecao) >= 30 && Number(d.fracao_ejecao) < 41,
      achado: (d) => 'Disfunção sistólica moderada do ventrículo esquerdo (fração de ejeção = '+d.fracao_ejecao+'%).',
      conclusao: (d) => 'Disfunção sistólica moderada do ventrículo esquerdo (fração de ejeção = '+d.fracao_ejecao+'%)',
      alerta: true,
    },
    {
      id: 'fe_disfuncao_grave',
      grupo: 'sistolica',
      condicao: (d) => d.fracao_ejecao && Number(d.fracao_ejecao) < 30,
      achado: (d) => 'Disfunção sistólica grave do ventrículo esquerdo (fração de ejeção = '+d.fracao_ejecao+'%).',
      conclusao: (d) => 'Disfunção sistólica grave do ventrículo esquerdo (fração de ejeção = '+d.fracao_ejecao+'%)',
      alerta: true,
    },

    // ── FUNÇÃO DIASTÓLICA ──
    {
      id: 'diastolica_normal',
      grupo: 'diastolica',
      condicao: (d) => d.relacao_ea && d.relacao_ea >= 0.8 && d.relacao_ea <= 2.0 && (!d.relacao_e_elinha || d.relacao_e_elinha < 14),
      achado: () => 'Função diastólica do ventrículo esquerdo normal.',
    },
    {
      id: 'diastolica_grau1',
      grupo: 'diastolica',
      condicao: (d) => d.relacao_ea && d.relacao_ea < 0.8,
      achado: () => 'Disfunção diastólica do ventrículo esquerdo grau I (déficit de relaxamento).',
      conclusao: () => 'Disfunção diastólica do ventrículo esquerdo grau I',
      alerta: true,
    },
    {
      id: 'diastolica_grau2',
      grupo: 'diastolica',
      condicao: (d) => d.relacao_ea && d.relacao_ea >= 0.8 && d.relacao_ea <= 2.0 && d.relacao_e_elinha && d.relacao_e_elinha >= 14,
      achado: () => 'Disfunção diastólica do ventrículo esquerdo grau II (padrão pseudonormal).',
      conclusao: () => 'Disfunção diastólica do ventrículo esquerdo grau II',
      alerta: true,
    },

    // ── VALVAS (normalidade) ──
    {
      id: 'valvas_normais',
      grupo: 'valvas',
      condicao: (d) => !d.insuficiencia_mitral && !d.insuficiencia_aortica && !d.insuficiencia_tricuspide
                    && !d.gradiente_maximo_aortico && !d.gradiente_medio_mitral,
      achado: () => 'Valvas cardíacas com morfologia e mobilidade normais.\nFluxos transvalvares com velocidades e gradientes dentro da normalidade.',
    },

    // ── INSUFICIÊNCIAS ──
    {
      id: 'insuf_mitral',
      grupo: 'valvas',
      condicao: (d) => d.insuficiencia_mitral && d.insuficiencia_mitral !== 'ausente',
      achado: (d) => 'Insuficiência mitral '+d.insuficiencia_mitral+'.',
      conclusao: (d) => 'Insuficiência mitral '+d.insuficiencia_mitral,
      alerta: true,
    },
    {
      id: 'insuf_aortica',
      grupo: 'valvas',
      condicao: (d) => d.insuficiencia_aortica && d.insuficiencia_aortica !== 'ausente',
      achado: (d) => 'Insuficiência aórtica '+d.insuficiencia_aortica+'.',
      conclusao: (d) => 'Insuficiência aórtica '+d.insuficiencia_aortica,
      alerta: true,
    },
    {
      id: 'insuf_tricuspide',
      grupo: 'valvas',
      condicao: (d) => d.insuficiencia_tricuspide && d.insuficiencia_tricuspide !== 'ausente',
      achado: (d) => 'Insuficiência tricúspide '+d.insuficiencia_tricuspide+'.',
    },

    // ── HIPERTROFIA ──
    {
      id: 'hipertrofia_ve',
      grupo: 'hipertrofia',
      condicao: (d) => {
        if(!d.indice_massa_ve) return false;
        const lim = d.sexo === 'F' ? 95 : 115;
        return d.indice_massa_ve > lim;
      },
      achado: (d) => {
        const lim = d.sexo === 'F' ? 95 : 115;
        const grau = d.indice_massa_ve > lim*1.4 ? 'importante' : d.indice_massa_ve > lim*1.2 ? 'moderada' : 'leve';
        return 'Hipertrofia ventricular esquerda '+grau+' (índice de massa = '+d.indice_massa_ve+' g/m²).';
      },
      conclusao: (d) => {
        const lim = d.sexo === 'F' ? 95 : 115;
        const grau = d.indice_massa_ve > lim*1.4 ? 'importante' : d.indice_massa_ve > lim*1.2 ? 'moderada' : 'leve';
        return 'Hipertrofia ventricular esquerda '+grau;
      },
      alerta: true,
    },

    // ── TAPSE / VD ──
    {
      id: 'tapse_normal',
      grupo: 'vd',
      condicao: (d) => d.tapse && Number(d.tapse) >= 17,
      achado: (d) => 'Função sistólica do ventrículo direito preservada (TAPSE = '+d.tapse+' mm).',
    },
    {
      id: 'tapse_reduzido',
      grupo: 'vd',
      condicao: (d) => d.tapse && Number(d.tapse) < 17,
      achado: (d) => 'Disfunção sistólica do ventrículo direito (TAPSE = '+d.tapse+' mm).',
      conclusao: (d) => 'Disfunção sistólica do ventrículo direito (TAPSE = '+d.tapse+' mm)',
      alerta: true,
    },

    // ── PSAP ──
    {
      id: 'psap_normal',
      grupo: 'psap',
      condicao: (d) => d.psap && Number(d.psap) <= 35,
      achado: (d) => 'Pressão sistólica da artéria pulmonar normal ('+d.psap+' mmHg).',
    },
    {
      id: 'psap_hp_leve',
      grupo: 'psap',
      condicao: (d) => d.psap && Number(d.psap) > 35 && Number(d.psap) <= 50,
      achado: (d) => 'Hipertensão pulmonar leve (pressão sistólica da artéria pulmonar = '+d.psap+' mmHg).',
      conclusao: (d) => 'Hipertensão pulmonar leve (pressão sistólica da artéria pulmonar = '+d.psap+' mmHg)',
      alerta: true,
    },
    {
      id: 'psap_hp_moderada',
      grupo: 'psap',
      condicao: (d) => d.psap && Number(d.psap) > 50 && Number(d.psap) <= 65,
      achado: (d) => 'Hipertensão pulmonar moderada (pressão sistólica da artéria pulmonar = '+d.psap+' mmHg).',
      conclusao: (d) => 'Hipertensão pulmonar moderada (pressão sistólica da artéria pulmonar = '+d.psap+' mmHg)',
      alerta: true,
    },
    {
      id: 'psap_hp_grave',
      grupo: 'psap',
      condicao: (d) => d.psap && Number(d.psap) > 65,
      achado: (d) => 'Hipertensão pulmonar grave (pressão sistólica da artéria pulmonar = '+d.psap+' mmHg).',
      conclusao: (d) => 'Hipertensão pulmonar grave (pressão sistólica da artéria pulmonar = '+d.psap+' mmHg)',
      alerta: true,
    },

    // ── PERICÁRDIO ──
    {
      id: 'pericardio_normal',
      grupo: 'pericardio',
      condicao: (d) => !d.derrame_pericardico || d.derrame_pericardico === 'ausente' || d.derrame_pericardico === '',
      achado: () => 'Pericárdio normal.',
    },
    {
      id: 'derrame_pericardico',
      grupo: 'pericardio',
      condicao: (d) => d.derrame_pericardico && d.derrame_pericardico !== 'ausente' && d.derrame_pericardico !== '',
      achado: (d) => 'Derrame pericárdico '+d.derrame_pericardico+'.',
      conclusao: (d) => 'Derrame pericárdico '+d.derrame_pericardico,
      alerta: true,
    },
  ];

  // ══ GERAR ACHADOS ════════════════════════════════════════════

  function gerarAchados(dados){
    const d = calcular(dados);
    const achados = [];
    const gruposUsados = new Set();

    REGRAS.forEach(regra => {
      try{
        if(regra.condicao(d)){
          // Só usa 1 regra por grupo (a primeira que bater)
          if(gruposUsados.has(regra.grupo)) return;
          gruposUsados.add(regra.grupo);

          const txt = typeof regra.achado === 'function' ? regra.achado(d) : regra.achado;
          if(txt){
            // Pode ter múltiplas linhas (separadas por \n)
            txt.split('\n').forEach(linha => {
              achados.push({
                id: regra.id,
                tipo: 'texto',
                txt: linha.trim(),
                alerta: !!regra.alerta,
                grupo: regra.grupo,
              });
            });
          }
        }
      }catch(e){ /* regra individual não quebra o sistema */ }
    });

    return achados;
  }

  // ══ GERAR CONCLUSÃO ══════════════════════════════════════════

  function gerarConclusao(dados){
    const d = calcular(dados);
    const conclusoes = [];
    let num = 1;

    REGRAS.forEach(regra => {
      try{
        if(regra.conclusao && regra.condicao(d)){
          const txt = typeof regra.conclusao === 'function' ? regra.conclusao(d) : regra.conclusao;
          if(txt) conclusoes.push({num: num++, txt, alerta: !!regra.alerta, id: regra.id});
        }
      }catch(e){}
    });

    // Se não tem nenhuma conclusão, é normal
    if(!conclusoes.length){
      conclusoes.push({num:1, txt:'Ecocardiograma dentro dos limites da normalidade', alerta:false, id:'normal'});
    }

    return conclusoes;
  }

  // ══ IMPORTAR DICOM SR ════════════════════════════════════════

  function importarDICOM(dicomData){
    const medidas = {};
    if(dicomData && dicomData.measurements){
      Object.entries(dicomData.measurements).forEach(([code, valor]) => {
        const campo = DICOM_MAP[code];
        if(campo) medidas[campo] = valor;
      });
    }
    if(dicomData.patientName) medidas._paciente_nome = dicomData.patientName;
    if(dicomData.patientID) medidas._paciente_id = dicomData.patientID;
    if(dicomData.studyDate) medidas._data_exame = dicomData.studyDate;
    return medidas;
  }

  // ══ PREPARAÇÃO PARA CLAUDE API ═══════════════════════════════
  // Monta o prompt para enriquecimento via IA

  function montarPromptClaude(dados, achados, conclusoes){
    const d = calcular(dados);
    return {
      role: 'user',
      content: `Você é um cardiologista especialista em ecocardiografia.
Analise os seguintes achados e conclusões de um ecocardiograma transtorácico e enriqueça a conclusão com correlações clínicas.

MEDIDAS:
- Fração de ejeção: ${d.fracao_ejecao || 'não informada'}%
- Diâmetro diastólico do VE: ${d.diametro_diastolico_ve || 'não informado'} mm
- Átrio esquerdo: ${d.atrio_esquerdo || 'não informado'} mm
- PSAP: ${d.psap || 'não informada'} mmHg
- TAPSE: ${d.tapse || 'não informado'} mm
- Índice de massa VE: ${d.indice_massa_ve || 'não informado'} g/m²
- Sexo: ${d.sexo === 'F' ? 'Feminino' : 'Masculino'}

ACHADOS GERADOS:
${achados.map(a => '- ' + a.txt).join('\n')}

CONCLUSÃO GERADA:
${conclusoes.map(c => c.num + '. ' + c.txt).join('\n')}

Enriqueça a conclusão correlacionando os achados entre si. Explique a fisiopatologia quando relevante. Sugira recomendações se apropriado. Mantenha o formato numerado. Responda em português.`
    };
  }

  // ══ INTERFACE PÚBLICA ════════════════════════════════════════

  return {
    tipo: 'eco_tt',
    nome: 'Ecocardiograma Transtorácico',
    versao: '8.0',

    // Dados
    REFS,
    REGRAS,
    DICOM_MAP,

    // Funções principais
    calcular,
    gerarAchados,
    gerarConclusao,

    // Integração
    importarDICOM,
    montarPromptClaude,

    // Helpers
    dentroRef,
    nomeExtenso,
    unidade,
    classificarFE,
    classificarPSAP,
    classificarEstenose,
  };

})();

// Registrar no orquestrador
if(typeof registrarMotor === 'function') registrarMotor('eco_tt_v8', MotorV8);

console.log('%c🫀 Motor V8 (ECO TT) — '+MotorV8.REGRAS.length+' regras · '+Object.keys(MotorV8.REFS).length+' referências · '+Object.keys(MotorV8.DICOM_MAP).length+' campos DICOM · Claude API ready','color:#059669;font-weight:bold;font-size:12px;');
