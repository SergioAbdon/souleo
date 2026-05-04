// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Orquestrador de Conclusões
// ══════════════════════════════════════════════════════════════════
// gerarConclusao(d) — produz lista numerada na ordem clínica fixa.
//
// ORDEM PRESERVADA do motor original (linhas 999-1035 motorv8mp4.js):
// 1.  Diastologia (j43 ou diastConclusao)
// 2.  Hipertrofia/Remodelamento (j47)
// 3.  Sistólica unificada VE+VD (concSistolica)
// 4.  Insuf Mitral (b35)
// 5.  Insuf Tricúspide (b36)
// 6.  Insuf Aórtica (b40)
// 7.  Estenose Mitral (concEstenMit)
// 8.  Estenose Tricúspide
// 9.  Estenose Aórtica (concEstenAo)
// 10. Estenose Pulmonar (3 graus)
// 11. Insuf Pulmonar (b40p)
// 12. HP (concHP = j50)
// 13. Pericárdio (b41)
// 14. Aorta (concAorta)
// 15. Placas (b42='s')
// 16. Strain VE (concStrainVE)
// 17. Strain VD (concStrainVD)
// 18. LA Strain (concLARS)
//
// Fallback: "Exame ecodopplercardiográfico transtorácico sem alterações significativas."
// ══════════════════════════════════════════════════════════════════

import type { MedidasEcoTT, CalculosDerivados, GrauRefluxo, GrauEstenose } from '../types';
import { j43, DIAST_SENTENCAS, j21 } from '../achados/diastologia';
import { jProbabilidadeHP } from '../achados/valvas';
import {
  classificarRaizAo,
  classificarAoAscendente,
  classificarArcoAo,
} from '../calculos/aorta';
import { getDiastModo } from '../achados/index';

// Estado manual diastologia (referenciado do mesmo state em achados/index.ts)
let _diastManualSelecaoConcl = -1;
let _diastManualTextoLivreConcl = '';
export function setDiastManualConcl(idx: number) { _diastManualSelecaoConcl = idx; }
export function setDiastTextoLivreConcl(txt: string) { _diastManualTextoLivreConcl = txt; }

// ══ HELPERS ═════════════════════════════════════════════════════

/**
 * j47 — Hipertrofia/Remodelamento (conclusão)
 * Limites IM: M=102, F=88. Limite ER: 0.42.
 */
function j47(d: any): string {
  if (d.er === null || d.imVE === null || !d.sexo) return '';
  const lim = d.sexo === 'M' ? 102 : 88;
  if (d.er > 0.42 && d.imVE <= lim) return 'Remodelamento concêntrico do ventrículo esquerdo.';
  if (d.er <= 0.42 && d.imVE > lim) return 'Hipertrofia excêntrica do ventrículo esquerdo.';
  if (d.er > 0.42 && d.imVE > lim) return 'Hipertrofia concêntrica do ventrículo esquerdo.';
  return '';
}

/**
 * concSistolica — Conclusão unificada VE+VD (10 variantes)
 *
 * Lógica:
 * - Avalia dilatação (VE>lim ou VD>35)
 * - Avalia disfunção VE (FE Simpson ou Teichholz)
 * - Avalia disfunção VD (b32)
 * - Combina em prefixo + texto base
 */
function concSistolica(d: any): string {
  if (!d.sexo) return '';

  const lvLim = d.sexo === 'M' ? 58 : 52;
  const feLim = d.sexo === 'M' ? 0.52 : 0.54;
  const feLimS = d.sexo === 'M' ? 52 : 54;

  // Dilatação
  const veAum = d.b9 !== null && d.b9 > lvLim;
  const vdAum = d.b13 !== null && d.b13 > 35;

  // FE VE reduzida
  let feReduz = false;
  if (d.b54 !== null) feReduz = d.b54 < feLimS;
  else if (d.feT !== null) feReduz = d.feT < feLim;
  const feDisp = d.b54 !== null || d.feT !== null;

  const disfVD = !!d.b32;
  const disfVE = feDisp && feReduz;
  const dilatado = veAum || vdAum;
  const prefix = dilatado ? 'Miocardiopatia Dilatada com ' : '';

  if (!disfVE && !disfVD) {
    if (dilatado) return 'Miocardiopatia Dilatada com função sistólica preservada.';
    return '';
  }

  if (disfVE && disfVD) {
    return prefix + 'Disfunção sistólica biventricular.';
  }
  if (disfVE && !disfVD) {
    // Caso especial: Simpson preservado mas paredes alteradas
    if (d.b54 !== null && d.b54 >= feLimS) {
      return dilatado
        ? 'Miocardiopatia Dilatada com função sistólica do ventrículo esquerdo preservada, apesar da alteração contrátil segmentar.'
        : 'Alteração contrátil segmentar do ventrículo esquerdo.';
    }
    return prefix + 'Disfunção sistólica do ventrículo esquerdo.';
  }
  if (!disfVE && disfVD) {
    return prefix + 'Disfunção sistólica do ventrículo direito.';
  }
  return '';
}

/** concEstenMit */
function concEstenMit(estenMitGrau: GrauEstenose): string {
  if (!estenMitGrau) return '';
  if (estenMitGrau === 'importante') return 'Estenose Mitral Importante.';
  if (estenMitGrau === 'moderada') return 'Estenose Mitral Moderada.';
  if (estenMitGrau === 'leve') return 'Estenose Mitral Leve.';
  return '';
}

/** concEstenAo (esclerose silencia — decisão preservada) */
function concEstenAo(estenAoGrau: GrauEstenose): string {
  if (!estenAoGrau || estenAoGrau === 'esclerose') return '';
  if (estenAoGrau === 'importante') return 'Estenose Aórtica Importante.';
  if (estenAoGrau === 'moderada') return 'Estenose Aórtica Moderada.';
  if (estenAoGrau === 'leve') return 'Estenose Aórtica Leve.';
  return '';
}

/** concHP = j50 */
function concHP(b23: number | null, b38: '' | 'S'): string {
  return jProbabilidadeHP(b23, b38);
}

/**
 * concAorta — combina segmentos alterados
 * 1 segmento: "Ectasia X da Y."
 * 2-3 segmentos: "Ectasia da aorta (X, Y e Z)."
 */
function concAorta(d: any): string {
  if (!d.sexo) return '';
  const raiz = d.b7 ? classificarRaizAo(d.b7, d.sexo, d.asc, d.idade) : null;
  const asc = d.b28 ? classificarAoAscendente(d.b28, d.sexo, d.asc) : null;
  const arco = d.b29 ? classificarArcoAo(d.b29, d.sexo, d.asc) : null;

  const alterados: { seg: string; grau: string }[] = [];
  if (raiz && raiz.grau !== 'normal') alterados.push({ seg: 'raiz aórtica', grau: raiz.grau });
  if (asc && asc.grau !== 'normal') alterados.push({ seg: 'aorta ascendente', grau: asc.grau });
  if (arco && arco.grau !== 'normal') alterados.push({ seg: 'arco aórtico', grau: arco.grau });

  if (!alterados.length) return '';
  if (alterados.length === 1) {
    return `Ectasia ${alterados[0].grau} da ${alterados[0].seg}.`;
  }
  // 2-3 segmentos
  const segs = alterados.map(a => a.seg);
  const segsTexto = segs.length === 2
    ? `${segs[0]} e ${segs[1]}`
    : `${segs.slice(0, -1).join(', ')} e ${segs[segs.length - 1]}`;
  return `Ectasia da aorta (${segsTexto}).`;
}

/** concStrainVE — 3 cenários (FE pres+normal, FE pres+reduzido, FE reduz) */
function concStrainVE(d: any): string {
  if (d.glsVE === null) return '';
  const abs = Math.abs(d.glsVE);
  const feLimS = d.sexo === 'M' ? 52 : 54;
  let fePreservada = true;
  if (d.b54 !== null) fePreservada = d.b54 >= feLimS;
  else if (d.feT !== null) fePreservada = d.feT >= 1 ? d.feT >= feLimS : d.feT >= feLimS / 100;

  if (fePreservada && abs >= 18) {
    return `Função sistólica global do ventrículo esquerdo preservada, confirmada pelo strain longitudinal (${d.glsVE}%).`;
  }
  if (fePreservada && abs < 18) {
    return `Função sistólica preservada com strain longitudinal reduzido (${d.glsVE}%), sugestivo de disfunção subclínica.`;
  }
  return `Disfunção sistólica do ventrículo esquerdo, com strain longitudinal de ${d.glsVE}%.`;
}

/** concStrainVD — silencia se VD já alterado */
function concStrainVD(d: any): string {
  if (d.glsVD === null) return '';
  const abs = Math.abs(d.glsVD);
  const vdNormal = !d.b32;
  if (vdNormal && abs >= 20) {
    return `Função sistólica do ventrículo direito preservada, confirmada pelo strain longitudinal (${d.glsVD}%).`;
  }
  if (vdNormal && abs < 20) {
    return `Strain longitudinal do ventrículo direito reduzido (${d.glsVD}%), sugestivo de disfunção subclínica do ventrículo direito.`;
  }
  return '';
}

/** concLARS — silencia se diastologia já alterada */
function concLARS(d: any): string {
  if (d.lars === null) return '';
  const diastResult = j21(d);
  const diastNormal = diastResult === 'Índices diastólicos do ventrículo esquerdo preservados' || diastResult === '';
  if (diastNormal && d.lars >= 18) {
    return `Strain atrial esquerdo preservado (${d.lars}%).`;
  }
  if (diastNormal && d.lars < 18) {
    return `Strain atrial esquerdo reduzido (${d.lars}%), sugestivo de elevação das pressões de enchimento.`;
  }
  return '';
}

/** diastConclusao — Wrapper auto/manual */
function diastConclusao(d: any): string {
  const modo = getDiastModo();
  if (modo === 'manual') {
    if (_diastManualTextoLivreConcl) return _diastManualTextoLivreConcl;
    if (_diastManualSelecaoConcl >= 0 && _diastManualSelecaoConcl < DIAST_SENTENCAS.length) {
      // Se é FA (índice 5), calcular pressão de enchimento via j43
      if (_diastManualSelecaoConcl === 5) return j43(d);
      return DIAST_SENTENCAS[_diastManualSelecaoConcl].conclusao;
    }
    return '';
  }
  return j43(d);
}

// ══ ADAPTER ═════════════════════════════════════════════════════

function montarD(m: MedidasEcoTT, calc: CalculosDerivados): any {
  return {
    sexo: m.gerais.sexo,
    ritmo: m.gerais.ritmo,
    b7: m.camaras.raizAo,
    b8: m.camaras.ae,
    b9: m.camaras.ddve,
    b13: m.camaras.vd,
    b28: m.camaras.aoAscendente,
    b29: m.camaras.arcoAo,
    b19: m.diastolica.ondaE,
    b20: m.diastolica.relacaoEA,
    b21: m.diastolica.eSeptal,
    b22: m.diastolica.relacaoEEseptal,
    b23: m.diastolica.velocidadeIT,
    b24: m.diastolica.volAEindex,
    b38: m.diastolica.sinaisHP,
    lars: m.diastolica.laStrain,
    b54: m.sistolica.feSimpson,
    b32: m.sistolica.disfuncaoVD,
    glsVE: m.sistolica.glsVE,
    glsVD: m.sistolica.glsVD,
    b35: m.valvas.refluxoMitral,
    b36: m.valvas.refluxoTricuspide,
    b40: m.valvas.refluxoAortico,
    b40p: m.valvas.refluxoPulmonar,
    b41: m.valvas.derramePericard,
    b42: m.valvas.placasArco,
    asc: calc.asc,
    feT: calc.feT,
    imVE: calc.imVE,
    er: calc.er,
    idade: calc.idade,
    estenMitGrau: calc.estenMitGrau,
    estenAoGrau: calc.estenAoGrau,
    estenTricGrau: calc.estenTricGrau,
    estenPulmGrau: calc.estenPulmGrau,
  };
}

// ══ ORQUESTRADOR ═══════════════════════════════════════════════

/**
 * gerarConclusao — Lista numerada de conclusões
 * Fallback: "Exame ecodopplercardiográfico transtorácico sem alterações significativas."
 */
export function gerarConclusao(m: MedidasEcoTT, calc: CalculosDerivados): string[] {
  const d = montarD(m, calc);
  const c: string[] = [];
  const add = (txt: string) => { if (txt) c.push(txt); };

  // 1. Diastologia
  add(diastConclusao(d));
  // 2. Hipertrofia/Remodelamento
  add(j47(d));
  // 3. Sistólica unificada
  add(concSistolica(d));
  // 4. Insuf Mitral
  const rm: Record<string, string> = {
    L: 'Insuficiência Mitral leve.',
    LM: 'Insuficiência Mitral leve a moderada.',
    M: 'Insuficiência Mitral moderada.',
    MI: 'Insuficiência Mitral moderada a importante.',
    I: 'Insuficiência Mitral importante.',
  };
  if (d.b35) add(rm[d.b35]);
  // 5. Insuf Tricúspide
  const rt: Record<string, string> = {
    L: 'Insuficiência Tricúspide leve.',
    LM: 'Insuficiência Tricúspide leve a moderada.',
    M: 'Insuficiência Tricúspide moderada.',
    MI: 'Insuficiência Tricúspide moderada a importante.',
    I: 'Insuficiência Tricúspide importante.',
  };
  if (d.b36) add(rt[d.b36]);
  // 6. Insuf Aórtica
  const ra: Record<string, string> = {
    L: 'Insuficiência Aórtica leve.',
    LM: 'Insuficiência Aórtica leve a moderada.',
    M: 'Insuficiência Aórtica moderada.',
    MI: 'Insuficiência Aórtica moderada a importante.',
    I: 'Insuficiência Aórtica importante.',
  };
  if (d.b40) add(ra[d.b40]);
  // 7. Estenose Mitral
  add(concEstenMit(d.estenMitGrau));
  // 8. Estenose Tricúspide (sem leve)
  if (d.estenTricGrau === 'importante') add('Estenose Tricúspide Importante.');
  else if (d.estenTricGrau === 'moderada') add('Estenose Tricúspide Moderada.');
  // 9. Estenose Aórtica
  add(concEstenAo(d.estenAoGrau));
  // 10. Estenose Pulmonar (3 graus)
  if (d.estenPulmGrau === 'importante') add('Estenose Pulmonar Importante.');
  else if (d.estenPulmGrau === 'moderada') add('Estenose Pulmonar Moderada.');
  else if (d.estenPulmGrau === 'leve') add('Estenose Pulmonar Leve.');
  // 11. Insuf Pulmonar
  if (d.b40p) {
    const m2: Record<string, string> = {
      L: 'Insuficiência Pulmonar leve.',
      LM: 'Insuficiência Pulmonar leve a moderada.',
      M: 'Insuficiência Pulmonar moderada.',
      MI: 'Insuficiência Pulmonar moderada a importante.',
      I: 'Insuficiência Pulmonar importante.',
    };
    add(m2[d.b40p]);
  }
  // 12. HP
  add(concHP(d.b23, d.b38));
  // 13. Pericárdio
  if (d.b41) {
    const g: Record<string, string> = {
      L: 'leve',
      LM: 'leve a moderado',
      M: 'moderado',
      MI: 'moderado a importante',
      I: 'importante',
    };
    add(`Derrame pericárdico ${g[d.b41]}.`);
  }
  // 14. Aorta
  add(concAorta(d));
  // 15. Placas
  if (d.b42 === 's') add('Placas de ateroma calcificadas e não complicadas no arco aórtico.');
  // 16-18. Strain
  add(concStrainVE(d));
  add(concStrainVD(d));
  add(concLARS(d));

  // Fallback
  if (!c.length) {
    c.push('Exame ecodopplercardiográfico transtorácico sem alterações significativas.');
  }

  return c;
}
