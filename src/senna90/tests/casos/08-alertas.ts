// F0-T2: o runner nunca comparou resultado.alertas — DC24 ("gera alerta
// visual") não verificava nada (inventário Senna90 §7/#79). Estes 4
// casos pinam os DOIS alertas estruturados do motor.
import type { CasoTeste } from '../runner';
import { medidasVazias, pacienteSaudavelM } from '../helpers';

function comIT(psap: number | null): CasoTeste['inputs'] {
  const m = medidasVazias();
  m.diastolica.velocidadeIT = 3.1;   // b23 > 0
  m.diastolica.psap = psap;          // b37
  return m;
}
function comRefluxoPulm(pmap: number | null): CasoTeste['inputs'] {
  const m = medidasVazias();
  m.valvas.refluxoPulmonar = 'M';    // b40p preenchido
  m.valvas.pmap = pmap;              // psmap
  return m;
}

export const casosAlertas: CasoTeste[] = [
  {
    id: 'AL01',
    descricao: 'IT preenchida sem PSAP → alerta IT_SEM_PSAP',
    inputs: comIT(null),
    esperado: { alertas: ['IT_SEM_PSAP'] },
  },
  {
    id: 'AL02',
    descricao: 'IT preenchida COM PSAP → sem alerta',
    inputs: comIT(40),
    esperado: { alertasNaoPresentes: ['IT_SEM_PSAP'] },
  },
  {
    id: 'AL03',
    descricao: 'Refluxo pulmonar sem PMAP → alerta REFLUXO_PULM_SEM_PMAP',
    inputs: comRefluxoPulm(null),
    esperado: { alertas: ['REFLUXO_PULM_SEM_PMAP'] },
  },
  {
    id: 'AL04',
    descricao: 'Refluxo pulmonar COM PMAP → sem alerta',
    inputs: comRefluxoPulm(22),
    esperado: { alertasNaoPresentes: ['REFLUXO_PULM_SEM_PMAP'] },
  },
  {
    id: 'AL05',
    descricao: 'Raiz aórtica sem data de nascimento → alerta AORTA_SEM_IDADE',
    inputs: (() => {
      const m = medidasVazias();   // sem dtnasc/dataExame → idade null
      m.camaras.raizAo = 34;
      return m;
    })(),
    // M1 da revisão F2-T4: raiz medida sem idade E sem sexo = 2 faltas
    // independentes — o pin declara os DOIS (antes só passava por whitelist).
    esperado: { alertas: ['AORTA_SEM_IDADE', 'SEXO_AUSENTE'] },
  },
  {
    id: 'AL06',
    descricao: 'Raiz aórtica COM idade calculável → sem alerta',
    inputs: (() => {
      const m = pacienteSaudavelM(); // dtnasc + dataExame preenchidos
      m.camaras.raizAo = 34;
      return m;
    })(),
    esperado: { alertasNaoPresentes: ['AORTA_SEM_IDADE'] },
  },
  {
    id: 'AL07',
    descricao: 'Wilkins ativo com calcificação não avaliada (0) → alerta e SEM bloco',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.wilkins.ativo = true;
      m.wilkins.mobilidade = 2;
      m.wilkins.espessura = 2;
      m.wilkins.subvalvar = 2;
      m.wilkins.calcificacao = 0;   // não avaliada
      return m;
    })(),
    esperado: {
      alertas: ['WILKINS_INCOMPLETO'],
      achadosNaoPresentes: ['__WILKINS__'],
    },
  },
  {
    id: 'AL08',
    descricao: 'Wilkins ativo 2/2/2/2 → sem alerta, bloco presente com score 8',
    inputs: (() => {
      const m = pacienteSaudavelM();
      m.wilkins.ativo = true;
      m.wilkins.mobilidade = 2;
      m.wilkins.espessura = 2;
      m.wilkins.subvalvar = 2;
      m.wilkins.calcificacao = 2;
      return m;
    })(),
    esperado: {
      alertasNaoPresentes: ['WILKINS_INCOMPLETO'],
      achados: ['__WILKINS__', '"sc":8'],
    },
  },
  {
    id: 'AL09',
    descricao: 'DDVE preenchido sem sexo → alerta SEXO_AUSENTE (C8)',
    inputs: (() => {
      const m = medidasVazias();
      m.camaras.ddve = 50; // medida clínica presente, sexo ''
      return m;
    })(),
    esperado: { alertas: ['SEXO_AUSENTE'] },
  },
  {
    id: 'AL10',
    descricao: 'DDVE preenchido COM sexo → sem alerta SEXO_AUSENTE',
    inputs: (() => {
      const m = medidasVazias();
      m.camaras.ddve = 50;
      m.gerais.sexo = 'M';
      return m;
    })(),
    esperado: { alertasNaoPresentes: ['SEXO_AUSENTE'] },
  },
  {
    id: 'AL11',
    descricao: 'Exame totalmente em branco (medidas + sexo vazios) → SEM SEXO_AUSENTE (não grita à toa)',
    inputs: medidasVazias(),
    esperado: { alertasNaoPresentes: ['SEXO_AUSENTE'] },
  },
];
