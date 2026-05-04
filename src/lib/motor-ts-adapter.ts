// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Adapter DOM → MedidasEcoTT
// ══════════════════════════════════════════════════════════════════
// Lê os campos do DOM (mesmos IDs que o motor antigo usa) e
// constrói um objeto MedidasEcoTT tipado pra alimentar o motor TS.
//
// Usado pelo shadow-runner pra rodar os 2 motores em paralelo.
// ══════════════════════════════════════════════════════════════════

import type {
  MedidasEcoTT, Sexo, Ritmo, GrauRefluxo, MorfologiaValvar,
  CodigoSegmento, CodigoDemaisParedes,
} from '@/senna90/types';

/** Lê string de campo DOM, vazio se inexistente */
function readStr(id: string): string {
  if (typeof document === 'undefined') return '';
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return el?.value?.trim() || '';
}

/** Lê string e parseia como float, null se vazio/inválido */
function readNum(id: string): number | null {
  const s = readStr(id);
  if (s === '') return null;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

/** Lê inteiro 0-4 para Wilkins */
function readWk(id: string): number {
  const n = readNum(id);
  if (n === null) return 0;
  return Math.max(0, Math.min(4, Math.trunc(n)));
}

/** Lê checkbox (Wilkins toggle) */
function readChecked(id: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById(id) as HTMLInputElement | null;
  return !!el?.checked;
}

/**
 * Constrói MedidasEcoTT a partir do DOM atual.
 *
 * IMPORTANTE: o motor antigo tem b24 e b25 em Câmaras (no DOM),
 * mas o motor TS coloca em MedidasDiastolicas (decisão #3).
 * Este adapter faz a tradução.
 */
export function lerMedidasDoDOM(): MedidasEcoTT {
  // Verificar se DOM existe (SSR safety)
  if (typeof document === 'undefined') {
    throw new Error('lerMedidasDoDOM só pode ser chamado no browser');
  }

  return {
    identificacao: {
      nome: readStr('nome'),
      pacienteDtnasc: readStr('dtnasc'),
      dataExame: readStr('dtexame'),
      convenio: readStr('convenio'),
      solicitante: readStr('solicitante'),
    },
    gerais: {
      sexo: readStr('sexo') as Sexo,
      ritmo: readStr('ritmo') as Ritmo,
      peso: readNum('peso'),
      altura: readNum('altura'),
    },
    camaras: {
      raizAo: readNum('b7'),
      ae: readNum('b8'),
      ddve: readNum('b9'),
      septoIV: readNum('b10'),
      paredePosterior: readNum('b11'),
      dsve: readNum('b12'),
      vd: readNum('b13'),
      aoAscendente: readNum('b28'),
      arcoAo: readNum('b29'),
    },
    diastolica: {
      ondaE: readNum('b19'),
      relacaoEA: readNum('b20'),
      eSeptal: readNum('b21'),
      relacaoEEseptal: readNum('b22'),
      velocidadeIT: readNum('b23'),
      psap: readNum('b37'),
      // b24/b25 estão no DOM em Câmaras, mas no motor TS ficam aqui
      volAEindex: readNum('b24'),
      volADindex: readNum('b25'),
      laStrain: readNum('lars'),
      sinaisHP: readStr('b38') === 'S' ? 'S' : '',
      // Modo manual será controlado via API do motor TS
      modoManual: 'auto',
      selecaoManual: -1,
      textoLivre: '',
    },
    sistolica: {
      feSimpson: readNum('b54'),
      disfuncaoVD: readStr('b32') as GrauRefluxo,
      tapse: readNum('b33'),
      glsVE: readNum('gls_ve'),
      glsVD: readNum('gls_vd'),
    },
    valvas: {
      morfMitral: readStr('b34') as MorfologiaValvar,
      refluxoMitral: readStr('b35') as GrauRefluxo,
      morfTricuspide: readStr('b34t') as MorfologiaValvar,
      refluxoTricuspide: readStr('b36') as GrauRefluxo,
      morfAortica: readStr('b39') as MorfologiaValvar,
      refluxoAortico: readStr('b40') as GrauRefluxo,
      morfPulmonar: readStr('b39p') as MorfologiaValvar,
      refluxoPulmonar: readStr('b40p') as GrauRefluxo,
      pmap: readNum('psmap'),
      derramePericard: readStr('b41') as GrauRefluxo,
      placasArco: (readStr('b42') || '') as '' | 's' | 'nv',
    },
    estenoses: {
      gradMaxMitral: readNum('b45'),
      gradMedMitral: readNum('b46'),
      areaMitral: readNum('b47'),
      gradMaxAo: readNum('b50'),
      gradMedAo: readNum('b51'),
      areaAo: readNum('b52'),
      gradMedTric: readNum('b46t'),
      areaTric: readNum('b47t'),
      gradMaxPulm: readNum('b50p'),
    },
    wilkins: {
      ativo: readChecked('wilkins-toggle'),
      mobilidade: readWk('wk-mob'),
      espessura: readWk('wk-esp'),
      calcificacao: readWk('wk-cal'),
      subvalvar: readWk('wk-sub'),
    },
    segmentar: {
      apex: (readStr('b55') || '') as '' | 'H' | 'A' | 'D',
      anterior: readStr('b56') as CodigoSegmento,
      septalAnterior: readStr('b57') as CodigoSegmento,
      septalInferior: readStr('b58') as CodigoSegmento,
      // b59-b61 mantêm IDs do DOM antigo, mas no motor TS estão na ordem AHA correta
      // No motor antigo: b59=lateral, b60=inferior, b61=inferolateral
      // No motor TS: b59=inferior, b60=inferolateral, b61=lateral
      // ATENCAO: a comparação shadow precisará tratar isso!
      inferior: readStr('b59') as CodigoSegmento,
      inferolateral: readStr('b60') as CodigoSegmento,
      lateral: readStr('b61') as CodigoSegmento,
      demaisParedes: (readStr('b62') || 'NL') as CodigoDemaisParedes,
    },
  };
}
