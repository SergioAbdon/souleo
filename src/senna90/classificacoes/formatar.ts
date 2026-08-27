// F2-T3 (spec §2.7): formatação da tabela SEM re-arredondar (B25 — os
// derivados já chegam truncados; aqui só fixamos casas e vírgula).
// Regra VIDE (C4/V10): feT/fs sem DSVE imprimem 'VIDE' (paridade legado);
// null por outro motivo imprime '—'.
import type { CampoTabela } from './isOOR';

const CASAS: Record<CampoTabela, number> = {
  b7: 0, b8: 0, b9: 0, b10: 0, b11: 0, b12: 0, b13: 0, b28: 0, b29: 0,
  imc: 1, aoae: 2, asc: 2, vdf: 1, vsf: 1, feT: 0, fs: 0, massa: 1, imVE: 1, er: 2,
};
// feT/fs viajam como decimal 0-1; a tabela exibe % (paridade legado: 0 casas).
const EM_PORCENTO: CampoTabela[] = ['feT', 'fs'];

function truncarExibicao(x: number, casas: number): string {
  const f = Math.pow(10, casas);
  const t = Math.trunc(x * f) / f;
  return t.toFixed(casas).replace('.', ',');
}

export function valorTabela(
  campo: CampoTabela,
  valor: number | null,
  opts: { dsveAusente?: boolean; casas?: number } = {}
): string {
  if (valor === null) {
    if ((campo === 'feT' || campo === 'fs') && opts.dsveAusente) return 'VIDE';
    return '—';
  }
  const casas = opts.casas ?? CASAS[campo];
  const v = EM_PORCENTO.includes(campo) ? valor * 100 : valor;
  return truncarExibicao(v, casas);
}
