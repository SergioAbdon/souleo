// ══════════════════════════════════════════════════════════════════
// LEO Senna90 — Test Runner
// ══════════════════════════════════════════════════════════════════
// Roda casos de teste, compara saída esperada × atual, gera relatório.
// Sem dependências externas — usa apenas Node + tsx.
// ══════════════════════════════════════════════════════════════════

import type { MedidasEcoTT, ResultadoLaudo } from '../types';
import { calcular } from '../motor';

export interface CasoTeste {
  id: string;
  descricao: string;
  inputs: MedidasEcoTT;
  esperado: {
    derivados?: Partial<{
      imc: number | null; asc: number | null; aoae: number | null;
      vdf: number | null; vsf: number | null; feT: number | null; fs: number | null;
      massa: number | null; imVE: number | null; er: number | null;
      idade: number | null;
      estenMitGrau: string; estenAoGrau: string;
      estenTricGrau: string; estenPulmGrau: string;
    }>;
    achados?: string[];          // Lista de strings que DEVEM aparecer
    achadosNaoPresentes?: string[]; // Strings que NÃO devem aparecer
    conclusoes?: string[];        // Lista que DEVE aparecer
    conclusoesNaoPresentes?: string[];
    numAchados?: { min?: number; max?: number; igual?: number };
    numConclusoes?: { min?: number; max?: number; igual?: number };
  };
}

export interface ResultadoTeste {
  caso: string;
  descricao: string;
  passou: boolean;
  falhas: string[];
  resultado: ResultadoLaudo;
}

export function rodarCaso(caso: CasoTeste): ResultadoTeste {
  const resultado = calcular(caso.inputs);
  const falhas: string[] = [];

  // Validar derivados
  if (caso.esperado.derivados) {
    for (const [chave, valor] of Object.entries(caso.esperado.derivados)) {
      const atual = (resultado.derivados as Record<string, unknown>)[chave];
      if (atual !== valor) {
        falhas.push(`derivado.${chave}: esperado=${valor}, atual=${atual}`);
      }
    }
  }

  // Validar achados presentes
  if (caso.esperado.achados) {
    for (const esperado of caso.esperado.achados) {
      const presente = resultado.achados.some(a => a === esperado || a.includes(esperado));
      if (!presente) {
        falhas.push(`achado AUSENTE: "${esperado}"`);
      }
    }
  }

  // Validar achados NÃO presentes
  if (caso.esperado.achadosNaoPresentes) {
    for (const indesejado of caso.esperado.achadosNaoPresentes) {
      const presente = resultado.achados.some(a => a === indesejado || a.includes(indesejado));
      if (presente) {
        falhas.push(`achado INDESEJADO presente: "${indesejado}"`);
      }
    }
  }

  // Validar conclusões presentes
  if (caso.esperado.conclusoes) {
    for (const esperado of caso.esperado.conclusoes) {
      const presente = resultado.conclusoes.some(c => c === esperado || c.includes(esperado));
      if (!presente) {
        falhas.push(`conclusão AUSENTE: "${esperado}"`);
      }
    }
  }

  // Validar conclusões NÃO presentes
  if (caso.esperado.conclusoesNaoPresentes) {
    for (const indesejado of caso.esperado.conclusoesNaoPresentes) {
      const presente = resultado.conclusoes.some(c => c === indesejado || c.includes(indesejado));
      if (presente) {
        falhas.push(`conclusão INDESEJADA presente: "${indesejado}"`);
      }
    }
  }

  // Validar contagens
  if (caso.esperado.numAchados) {
    const n = resultado.achados.length;
    const { min, max, igual } = caso.esperado.numAchados;
    if (igual !== undefined && n !== igual) falhas.push(`numAchados: esperado=${igual}, atual=${n}`);
    if (min !== undefined && n < min) falhas.push(`numAchados: min=${min}, atual=${n}`);
    if (max !== undefined && n > max) falhas.push(`numAchados: max=${max}, atual=${n}`);
  }
  if (caso.esperado.numConclusoes) {
    const n = resultado.conclusoes.length;
    const { min, max, igual } = caso.esperado.numConclusoes;
    if (igual !== undefined && n !== igual) falhas.push(`numConclusoes: esperado=${igual}, atual=${n}`);
    if (min !== undefined && n < min) falhas.push(`numConclusoes: min=${min}, atual=${n}`);
    if (max !== undefined && n > max) falhas.push(`numConclusoes: max=${max}, atual=${n}`);
  }

  return {
    caso: caso.id,
    descricao: caso.descricao,
    passou: falhas.length === 0,
    falhas,
    resultado,
  };
}

export interface RelatorioTestes {
  total: number;
  passou: number;
  falhou: number;
  taxa: string;
  casos: ResultadoTeste[];
}

export function rodarTodos(casos: CasoTeste[], verbose = false): RelatorioTestes {
  const resultados = casos.map(rodarCaso);
  const passou = resultados.filter(r => r.passou).length;
  const falhou = resultados.length - passou;
  const taxa = ((passou / resultados.length) * 100).toFixed(1) + '%';

  if (verbose) {
    console.log('\n═══ RELATÓRIO DE TESTES ═══\n');
    for (const r of resultados) {
      const status = r.passou ? '✅' : '❌';
      console.log(`${status} ${r.caso} — ${r.descricao}`);
      if (!r.passou) {
        for (const f of r.falhas) {
          console.log(`   ↳ ${f}`);
        }
      }
    }
    console.log(`\n═══ TOTAL: ${passou}/${resultados.length} (${taxa}) ═══`);
  }

  return { total: resultados.length, passou, falhou, taxa, casos: resultados };
}

/**
 * Mostra detalhes do output de um caso específico.
 */
export function mostrarDetalhes(caso: CasoTeste): void {
  const r = calcular(caso.inputs);
  console.log(`\n══ ${caso.id} — ${caso.descricao} ══\n`);
  console.log('Derivados:', r.derivados);
  console.log('\nAchados:');
  r.achados.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
  console.log('\nConclusões:');
  r.conclusoes.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
  if (r.alertas.length) {
    console.log('\nAlertas:');
    r.alertas.forEach(a => console.log(`  ⚠️ ${a.mensagem}`));
  }
}
