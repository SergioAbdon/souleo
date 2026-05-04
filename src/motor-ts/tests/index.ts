// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Suite de Testes Principal
// ══════════════════════════════════════════════════════════════════
// Roda todos os casos e gera relatório.
//
// Uso: npx tsx src/motor-ts/tests/index.ts
// ══════════════════════════════════════════════════════════════════

import { rodarTodos, mostrarDetalhes } from './runner';
import { casosSaudaveis } from './casos/01-saudaveis';
import { casosCardiopatia } from './casos/02-cardiopatia';
import { casosValvopatias } from './casos/03-valvopatias';
import { casosDiastologia } from './casos/04-diastologia';
import { casosStrainHP } from './casos/05-strain-hp';
import { casosBordas } from './casos/06-bordas';

const todosCasos = [
  ...casosSaudaveis,
  ...casosCardiopatia,
  ...casosValvopatias,
  ...casosDiastologia,
  ...casosStrainHP,
  ...casosBordas,
];

console.log(`\n🧪 LEO MOTOR TS — Suite de Testes`);
console.log(`📊 Total de casos: ${todosCasos.length}\n`);

const relatorio = rodarTodos(todosCasos, true);

console.log(`\n📈 RESUMO:\n`);
console.log(`  ✅ Passou:  ${relatorio.passou}/${relatorio.total}`);
console.log(`  ❌ Falhou:  ${relatorio.falhou}/${relatorio.total}`);
console.log(`  📊 Taxa:    ${relatorio.taxa}\n`);

// Mostrar detalhes do primeiro caso falho (pra debug)
const primeiroFalho = relatorio.casos.find(c => !c.passou);
if (primeiroFalho) {
  console.log(`\n🔍 DETALHES do primeiro caso falho (${primeiroFalho.caso}):`);
  const caso = todosCasos.find(c => c.id === primeiroFalho.caso);
  if (caso) mostrarDetalhes(caso);
}

// Exit code: 0 se todos passaram, 1 se algum falhou
process.exit(relatorio.falhou === 0 ? 0 : 1);
