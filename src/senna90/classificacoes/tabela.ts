// ══════════════════════════════════════════════════════════════════
// LEO Senna93 — builder PURO da tabela de parâmetros do laudo
// ══════════════════════════════════════════════════════════════════
// Substitui as rows que o motor legado monta por innerHTML
// (motorv8mp4.js:1196-1215). Rótulos e unidades são VERBATIM do
// legado — é texto de laudo assinado.
//
// Mudanças declaradas em relação ao legado:
// • B13 — a metade DIREITA passa a acender (isOOR cobre os derivados);
//   o realce sai nas colunas 1 e 5, as duas colunas de valor.
// • B14 — 2 linhas novas (Aorta Ascendente / Arco Aórtico): 10 → 12 rows.
// • B25 — valorTabela trunca e usa vírgula (o legado arredondava com
//   toFixed e ponto); mm passam a 0 casas.
// • C8 — sexo vazio zera TODAS as colunas VR (inclusive IMC, que no
//   legado imprimia '<25 kg/m²' incondicionalmente).
// ══════════════════════════════════════════════════════════════════
import type { Sexo, CalculosDerivados } from '../types';
import { isOOR, type CampoTabela } from './isOOR';
import { valorTabela } from './formatar';
import { refVal } from './refValues';

export interface TabelaParams {
  /** 12 linhas × 8 colunas: [rótulo, valor, unidade, VR] ×2 (esquerda | direita). */
  rows: string[][];
  /** 12 × 8 — true SÓ nas colunas de valor (1 e 5). */
  oor: boolean[][];
}

/** Campo de cada coluna de valor, por linha. null = linha sem realce (Sexo/Peso/Altura). */
const CAMPOS: readonly (readonly [CampoTabela | null, CampoTabela | null])[] = [
  [null, 'imc'], [null, 'aoae'], [null, 'vdf'], ['b7', 'vsf'], ['b8', 'feT'],
  ['b9', 'fs'], ['b10', 'massa'], ['b11', 'imVE'], ['b12', 'er'], ['b13', 'asc'],
  ['b28', null], ['b29', null],
];

/** Peso/Altura saem crus (não são CampoTabela): 1 casa, como o fmt() do legado. */
function crua(x: number | null): string {
  if (x === null) return '—';
  return (Math.trunc(x * 10) / 10).toFixed(1).replace('.', ',');
}

export function montarRowsTabela(
  ident: { sexo: Sexo; peso: number | null; altura: number | null },
  medidas: {
    b7: number | null; b8: number | null; b9: number | null; b10: number | null;
    b11: number | null; b12: number | null; b13: number | null;
    b28: number | null; b29: number | null;
  },
  derivados: CalculosDerivados,
  idade: number | null
): TabelaParams {
  // Fonte única dos 19 valores — o Record trava a exaustividade no tsc.
  const v: Record<CampoTabela, number | null> = {
    b7: medidas.b7, b8: medidas.b8, b9: medidas.b9, b10: medidas.b10,
    b11: medidas.b11, b12: medidas.b12, b13: medidas.b13,
    b28: medidas.b28, b29: medidas.b29,
    imc: derivados.imc, aoae: derivados.aoae, asc: derivados.asc,
    vdf: derivados.vdf, vsf: derivados.vsf, feT: derivados.feT, fs: derivados.fs,
    massa: derivados.massa, imVE: derivados.imVE, er: derivados.er,
  };
  const dsveAusente = medidas.b12 === null;
  const t = (campo: CampoTabela) => valorTabela(campo, v[campo], { dsveAusente });
  // feT/fs carregam o '%' no VALOR (unidade vazia), igual ao legado; 'VIDE'/'—' não.
  const pct = (campo: 'feT' | 'fs') => (v[campo] === null ? t(campo) : t(campo) + '%');
  const r = (campo: CampoTabela) => refVal(campo, ident.sexo, idade);

  const rows: string[][] = [
    ['Sexo', ident.sexo || '—', '', '', 'Índice de Massa Corporal', t('imc'), 'kg/m²', r('imc')],
    ['Peso', crua(ident.peso), 'Kg', '', 'Relação Ao/AE', t('aoae'), '', r('aoae')],
    ['Altura', crua(ident.altura), 'cm', '', 'Vol. Diast. final VE', t('vdf'), 'ml', r('vdf')],
    ['Raiz Aórtica', t('b7'), 'mm', r('b7'), 'Vol. Sist. final VE', t('vsf'), 'ml', r('vsf')],
    ['Átrio Esquerdo', t('b8'), 'mm', r('b8'), 'Fração de Ejeção (Teichholz)', pct('feT'), '', r('feT')],
    ['DDVE', t('b9'), 'mm', r('b9'), 'Fração de Encurtamento', pct('fs'), '', r('fs')],
    ['Septo Interventricular', t('b10'), 'mm', r('b10'), 'Massa do VE', t('massa'), 'g', r('massa')],
    ['Parede Posterior', t('b11'), 'mm', r('b11'), 'Índice de Massa VE', t('imVE'), 'g/m²', r('imVE')],
    ['DSVE', t('b12'), 'mm', r('b12'), 'Espessura Relativa', t('er'), '', r('er')],
    ['Ventrículo Direito', t('b13'), 'mm', r('b13'), 'Área Sup. Corpórea', t('asc'), 'm²', r('asc')],
    ['Aorta Ascendente', t('b28'), 'mm', r('b28'), '', '', '', ''],
    ['Arco Aórtico', t('b29'), 'mm', r('b29'), '', '', '', ''],
  ];

  const oor = CAMPOS.map(([esq, dir]) => {
    const linha = [false, false, false, false, false, false, false, false];
    if (esq) linha[1] = isOOR(esq, v[esq], ident.sexo, idade);
    if (dir) linha[5] = isOOR(dir, v[dir], ident.sexo, idade);
    return linha;
  });

  return { rows, oor };
}
