// F0-T2: o runner nunca comparou resultado.alertas — DC24 ("gera alerta
// visual") não verificava nada (inventário Senna90 §7/#79). Estes 4
// casos pinam os DOIS alertas estruturados do motor.
import type { CasoTeste } from '../runner';
import { medidasVazias } from '../helpers';

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
];
