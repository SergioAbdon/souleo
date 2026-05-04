// ══════════════════════════════════════════════════════════════════
// LEO Motor TS — Shadow Mode (Comparação com motor antigo)
// ══════════════════════════════════════════════════════════════════
// Sistema que roda os 2 motores em paralelo durante a transição.
// O motor antigo continua sendo usado pra mostrar resultados pro médico.
// O motor novo roda em silêncio e qualquer divergência é logada.
//
// Uso:
// 1. Quando o motor antigo termina seu calc(), chamar runShadowComparison()
// 2. Diferenças são enviadas pro Sentry como warnings
// 3. Painel /admin/motor-comparison mostra histórico
// ══════════════════════════════════════════════════════════════════

import type { MedidasEcoTT, ResultadoLaudo } from './types';
import { calcular } from './motor';

/**
 * Resultado de uma comparação shadow mode.
 */
export interface ShadowResult {
  matched: boolean;
  divergencias: Divergencia[];
  motorTSResult: ResultadoLaudo;
  timestamp: string;
}

export interface Divergencia {
  categoria: 'derivado' | 'achado' | 'conclusao' | 'alerta';
  campo: string;
  velho: unknown;
  novo: unknown;
  detalhe: string;
}

/**
 * Compara um resultado do motor antigo (objeto "d" ou similar) com o motor TS.
 *
 * @param medidas Inputs do laudo
 * @param resultadoAntigo Resultado do motor antigo (formato livre — vai ser comparado por chave)
 */
export function runShadowComparison(
  medidas: MedidasEcoTT,
  resultadoAntigo: {
    derivados?: Record<string, unknown>;
    achados?: string[];
    conclusoes?: string[];
  }
): ShadowResult {
  const motorTSResult = calcular(medidas);
  const divergencias: Divergencia[] = [];

  // Comparar derivados numéricos
  if (resultadoAntigo.derivados) {
    const novoDerivados = motorTSResult.derivados as unknown as Record<string, unknown>;
    for (const key of Object.keys(novoDerivados)) {
      const velho = resultadoAntigo.derivados[key];
      const novo = novoDerivados[key];
      if (velho !== novo && JSON.stringify(velho) !== JSON.stringify(novo)) {
        divergencias.push({
          categoria: 'derivado',
          campo: key,
          velho,
          novo,
          detalhe: `Derivado ${key}: motor antigo=${velho}, novo=${novo}`,
        });
      }
    }
  }

  // Comparar achados (por linha)
  if (resultadoAntigo.achados) {
    const len = Math.max(resultadoAntigo.achados.length, motorTSResult.achados.length);
    for (let i = 0; i < len; i++) {
      const velho = resultadoAntigo.achados[i] || '';
      const novo = motorTSResult.achados[i] || '';
      if (velho !== novo) {
        divergencias.push({
          categoria: 'achado',
          campo: `linha_${i}`,
          velho,
          novo,
          detalhe: `Achado #${i + 1} divergente`,
        });
      }
    }
  }

  // Comparar conclusões (por linha)
  if (resultadoAntigo.conclusoes) {
    const len = Math.max(resultadoAntigo.conclusoes.length, motorTSResult.conclusoes.length);
    for (let i = 0; i < len; i++) {
      const velho = resultadoAntigo.conclusoes[i] || '';
      const novo = motorTSResult.conclusoes[i] || '';
      if (velho !== novo) {
        divergencias.push({
          categoria: 'conclusao',
          campo: `linha_${i}`,
          velho,
          novo,
          detalhe: `Conclusão #${i + 1} divergente`,
        });
      }
    }
  }

  return {
    matched: divergencias.length === 0,
    divergencias,
    motorTSResult,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Lista de campos que SÃO esperados divergir devido às 13 alterações aprovadas.
 * Útil pra filtrar divergências "boas" das "ruins".
 */
export const DIVERGENCIAS_ESPERADAS = [
  // GLS VE -18% → -20% (texto difere)
  /Strain global longitudinal do ventrículo esquerdo.*VR ≥ -1[8|9]/,
  // Cutoff E/e' septal >14 → >15 em FA (raro)
  // RAVI sexo-específico → unificado
  // Estenose Pulmonar 25/50/80 → 36/64
  // ASC 71,74 → 71,84 (precisão 0,14%)
] as const;

/**
 * Verifica se uma divergência é "esperada" (uma das 13 alterações).
 */
export function isDivergenciaEsperada(div: Divergencia): boolean {
  if (typeof div.novo === 'string') {
    return DIVERGENCIAS_ESPERADAS.some(re => re.test(div.novo as string));
  }
  if (typeof div.velho === 'string') {
    return DIVERGENCIAS_ESPERADAS.some(re => re.test(div.velho as string));
  }
  return false;
}

/**
 * Reporta divergências pro Sentry (se disponível) ou console.
 */
export function reportarDivergencias(result: ShadowResult): void {
  if (result.matched) return;

  const inesperadas = result.divergencias.filter(d => !isDivergenciaEsperada(d));
  if (inesperadas.length === 0) {
    // Apenas divergências esperadas — log info
    console.info('[ShadowMode] Divergências esperadas:', result.divergencias.length);
    return;
  }

  // Divergências inesperadas — alertar
  console.warn('[ShadowMode] DIVERGÊNCIAS INESPERADAS:', inesperadas);

  // Enviar pro Sentry se disponível
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Sentry) {
    const Sentry = (window as unknown as Record<string, unknown>).Sentry as {
      captureMessage: (msg: string, opts?: unknown) => void;
    };
    Sentry.captureMessage('Motor TS divergence detected', {
      level: 'warning',
      extra: { divergencias: inesperadas, total: result.divergencias.length },
    });
  }
}
