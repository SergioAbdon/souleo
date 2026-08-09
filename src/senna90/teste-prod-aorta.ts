// Teste da spec de aorta pela função de PRODUÇÃO (calcular) + montarLaudoHtml.
// Dev tool (untracked). Roda: npx tsx src/senna90/teste-prod-aorta.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { calcular } from './motor';
import { medidasVazias } from './smoke-test';
import { montarLaudoHtml } from '../lib/senna90-render';

function caso(nome: string, sexo: 'M' | 'F', dtnasc: string,
  raiz: number | null, asc: number | null, arco: number | null, alturaCm: number) {
  const m: any = medidasVazias();
  m.identificacao = { nome: 'T', pacienteDtnasc: dtnasc, dataExame: '2026-05-16', convenio: '', solicitante: '' };
  m.gerais = { sexo, ritmo: '', peso: 75, altura: alturaCm };
  m.camaras.raizAo = raiz;
  m.camaras.aoAscendente = asc;
  m.camaras.arcoAo = arco;
  const r = calcular(m);
  const re = /aort|arco|ectasia|aneurism|dimens|gravidade/i;
  console.log('\n■ ' + nome);
  console.log('  COMENT:', r.achados.filter((a: string) => re.test(a)).join(' | ') || '(nada)');
  console.log('  CONCL :', r.conclusoes.filter((c: string) => re.test(c)).join(' | ') || '(nada)');
  return r;
}

console.log('=== TESTE AORTA — função calcular() de PRODUÇÃO ===');
caso('♂ 30a · raiz 39 (WASE ♂≤38 jovem → ectasia · índice<10)', 'M', '1996-01-01', 39, null, null, 175);
caso('♀ 70a · asc 46 · alt 158 (Chamber ♀≤35 → ectasia · índice≥10 = grave)', 'F', '1955-01-01', null, 46, null, 158);
caso('♂ 55a · raiz 52 (≥50 → ANEURISMA · sem "medindo"/índice)', 'M', '1971-01-01', 52, null, null, 172);
caso('♂ 60a · arco 45 (ACR ♂≥44 → ANEURISMA do arco · com "medindo")', 'M', '1966-01-01', null, null, 45, 170);
caso('♀ 50a · arco 38 (ACR ♀: 32<38<41 → ectasia do arco)', 'F', '1976-01-01', null, null, 38, 160);
caso('♂ 50a · raiz 36 (WASE ♂ médio ≤40 → NORMAL, sem frase)', 'M', '1976-01-01', 36, null, null, 178);

const ex = caso('(p/ HTML) ♂ 30a · raiz 39', 'M', '1996-01-01', 39, null, null, 175);
console.log('\n=== montarLaudoHtml — o que vai pro editor TipTap em produção ===');
console.log(montarLaudoHtml(ex.achados, ex.conclusoes).slice(0, 700));
process.exit(0);
