// ══════════════════════════════════════════════════════════════════
// LEO Senna93 F4 · Simulador da tabela do LEGADO (motorv8mp4.js)
// ══════════════════════════════════════════════════════════════════
// "O que o legado pintaria em #params-tbody" — porte VERBATIM de:
//   derivados  motorv8mp4.js:86-98   (T(), imc, asc 71,74, …, massa B24)
//   fmt        motorv8mp4.js:1120    (toFixed, ponto)
//   refVal     motorv8mp4.js:1075    (inclui waseRaizUpper LEGADO: ♀>65=37)
//   idadeAnos  motorv8mp4.js:1081    (Date-based)
//   rows       motorv8mp4.js:1196-1215 (10 linhas, VRs inline)
// Bugs do legado são REPRODUZIDOS de propósito (B24 +0,6mg dentro da
// divisão por 1000; truthiness de 0 — `(peso&&alt)`, `b9 ?`, logo 0 se
// comporta como null). SÓ rows — o realce (oor) do legado é deslocado
// 3 linhas e já está adjudicado na allowlist; comparar valores basta.
// ponytail: morre na F5b junto com o legado — não generalizar.
// ══════════════════════════════════════════════════════════════════

export interface EntradaLegado {
  sexo: '' | 'M' | 'F';
  peso: number | null; altura: number | null;
  b7: number | null; b8: number | null; b9: number | null; b10: number | null;
  b11: number | null; b12: number | null; b13: number | null;
  dtnasc: string; dtexame: string;   // ISO 'AAAA-MM-DD' — p/ idadeAnos (Date-based, verbatim)
}

// motorv8mp4.js:29 — truncador
const T = (x: number, d: number) => Math.trunc(x * Math.pow(10, d)) / Math.pow(10, d);

// motorv8mp4.js:1120
function fmt(x: number | string | null, d = 1): string {
  return x !== null && x !== undefined ? (typeof x === 'number' ? x.toFixed(d) : x) : '—';
}

// motorv8mp4.js:1068 — versão do LEGADO (♀>65 = 37; o Senna93 dá 38)
function waseRaizUpper(sexo: string, idade: number | null): number {
  const m = sexo === 'M';
  if (idade == null) return m ? 40 : 36;
  if (idade <= 40) return m ? 38 : 35;
  if (idade <= 65) return m ? 40 : 36;
  return m ? 41 : 37;
}

// motorv8mp4.js:1075
function refVal(campo: string, sexo: string, idade?: number | null): string {
  if (campo === 'b7' && sexo) return '≤ ' + waseRaizUpper(sexo, idade ?? null) + ' mm';
  const R: Record<string, { M: string; F: string }> = {
    b8: { M: '30–40', F: '27–38' }, b9: { M: '42–58', F: '38–52' },
    b10: { M: '6–10', F: '6–9' }, b11: { M: '6–10', F: '6–9' },
    b12: { M: '25–40', F: '21–35' }, b13: { M: '21–35', F: '21–35' },
    b28: { M: '30–37', F: '27–34' }, b29: { M: '22–36', F: '22–36' },
  };
  return R[campo] && sexo ? ((R[campo] as Record<string, string>)[sexo] || R[campo].M) + ' mm' : '';
}

// motorv8mp4.js:1081
function idadeAnos(dn: string, de: string): number | null {
  if (!dn || !de) return null;
  const n = new Date(dn), e = new Date(de);
  let a = e.getFullYear() - n.getFullYear();
  if (e.getMonth() < n.getMonth() || (e.getMonth() === n.getMonth() && e.getDate() < n.getDate())) a--;
  return a;
}

export function simularTabelaLegado(e: EntradaLegado): string[][] {
  const { sexo, b7, b8, b9, b10, b11, b12, b13 } = e;
  const peso = e.peso, alt = e.altura;

  // motorv8mp4.js:86-98 — derivados (truthiness verbatim: 0 age como null)
  const imc = (peso && alt) ? T(peso / ((alt / 100) ** 2), 1) : null;
  const asc = (peso && alt) ? T(0.0001 * 71.74 * Math.pow(peso, 0.425) * Math.pow(alt, 0.725), 2) : null;
  const aoae = (b7 && b8) ? T(b7 / b8, 2) : null;
  const vdf = b9 ? T(((b9 / 10) ** 3 * 7) / (2.4 + b9 / 10), 1) : null;
  const vsf = b12 ? T(((b12 / 10) ** 3 * 7) / (2.4 + b12 / 10), 1) : null;
  const feT = (b9 && b12) ? (((b9 ** 3) * 7 / (2.4 + b9 / 10) - (b12 ** 3) * 7 / (2.4 + b12 / 10)) / ((b9 ** 3) * 7 / (2.4 + b9 / 10))) : null;
  const fs = (b9 && b12) ? (b9 - b12) / b9 : null;
  const massa = (b9 && b10 && b11) ? T(((((b9 + b10 + b11) ** 3 - b9 ** 3) * 1.04) * 0.8 + 0.6) / 1000, 1) : null;
  const imVE = (massa && asc) ? T(massa / asc, 1) : null;
  const er = (b9 && b10 && b11) ? T((b10 + b11) / b9, 2) : null;

  const idade = idadeAnos(e.dtnasc, e.dtexame);

  // motorv8mp4.js:1196-1215
  return [
    ['Sexo', sexo || '—', '', '', 'Índice de Massa Corporal', fmt(imc), 'kg/m²', '<25 kg/m²'],
    ['Peso', fmt(peso), 'Kg', '', 'Relação Ao/AE', fmt(aoae, 2), '', ''],
    ['Altura', fmt(alt), 'cm', '', 'Vol. Diast. final VE', fmt(vdf), 'ml', sexo ? `${sexo === 'M' ? '62–150' : '46–106'} ml` : ''],
    ['Raiz Aórtica', fmt(b7), 'mm', refVal('b7', sexo, idade), 'Vol. Sist. final VE', fmt(vsf), 'ml', sexo ? `${sexo === 'M' ? '21–61' : '14–42'} ml` : ''],
    ['Átrio Esquerdo', fmt(b8), 'mm', refVal('b8', sexo), 'Fração de Ejeção (Teichholz)', feT !== null ? (feT * 100).toFixed(0) + '%' : (b12 === null ? 'VIDE' : '—'), '', sexo ? `>${sexo === 'M' ? 51 : 53}%` : ''],
    ['DDVE', fmt(b9), 'mm', refVal('b9', sexo), 'Fração de Encurtamento', fs !== null ? (fs * 100).toFixed(0) + '%' : (b12 === null ? 'VIDE' : '—'), '', '30–40%'],
    ['Septo Interventricular', fmt(b10), 'mm', refVal('b10', sexo), 'Massa do VE', fmt(massa), 'g', sexo ? `<${sexo === 'M' ? 201 : 151} g` : ''],
    ['Parede Posterior', fmt(b11), 'mm', refVal('b11', sexo), 'Índice de Massa VE', fmt(imVE), 'g/m²', sexo ? `<${sexo === 'M' ? 103 : 89} g/m²` : ''],
    ['DSVE', fmt(b12), 'mm', refVal('b12', sexo), 'Espessura Relativa', fmt(er, 2), '', '<0,43'],
    ['Ventrículo Direito', fmt(b13), 'mm', refVal('b13', sexo), 'Área Sup. Corpórea', fmt(asc, 2), 'm²', ''],
  ];
}
