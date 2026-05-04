// ══════════════════════════════════════════════════════════════════
// LEO — Shadow Runner (proteção via servidor)
// ══════════════════════════════════════════════════════════════════
// O motor Senna90 roda NO SERVIDOR (/api/laudo/calcular).
// Este runner apenas envia os dados e recebe o resultado.
//
// O código do motor NUNCA é exposto ao navegador do usuário.
// Compara com a saída do motor antigo no DOM e reporta divergências.
// ══════════════════════════════════════════════════════════════════

import { lerMedidasDoDOM } from './motor-ts-adapter';
import type { ResultadoLaudo } from '@/senna90/types';
import * as Sentry from '@sentry/nextjs';
import { auth } from './firebase';

interface ShadowResult {
  matched: boolean;
  divergencias: Divergencia[];
  motorTSResult: ResultadoLaudo | null;
  timestamp: string;
  exameId?: string;
}

interface Divergencia {
  categoria: 'derivado' | 'achado' | 'conclusao';
  campo: string;
  velho: unknown;
  novo: unknown;
  esperado: boolean; // Divergência esperada (uma das 13 alterações aprovadas)
}

/**
 * Padrões de divergências esperadas (decisões clínicas aprovadas).
 * Filtramos essas pra não poluir o Sentry.
 */
const DIVERGENCIAS_ESPERADAS: RegExp[] = [
  /VR ≥ -1[89]%/,     // GLS VE: motor antigo "VR ≥ -18%", novo "VR ≥ -20%"
  /Estenose Pulmonar/, // Cutoffs diferentes
  /Átrio direito aumentado/, // RAVI sexo-específico → unificado
];

function isDivergenciaEsperada(div: Divergencia): boolean {
  const novoStr = typeof div.novo === 'string' ? div.novo : '';
  const velhoStr = typeof div.velho === 'string' ? div.velho : '';
  return DIVERGENCIAS_ESPERADAS.some(re => re.test(novoStr) || re.test(velhoStr));
}

/**
 * Lê os achados/conclusões renderizados pelo motor antigo no DOM.
 */
function lerSaidaMotorAntigo(): { achados: string[]; conclusoes: string[] } {
  const achados: string[] = [];
  const conclusoes: string[] = [];

  if (typeof document === 'undefined') return { achados, conclusoes };

  const achadosBody = document.getElementById('achados-body');
  if (achadosBody) {
    const lis = achadosBody.querySelectorAll('li, p');
    lis.forEach(li => {
      const txt = (li.textContent || '').trim();
      if (txt) achados.push(txt);
    });
  }

  const conclusaoList = document.getElementById('conclusao-list');
  if (conclusaoList) {
    const itens = conclusaoList.querySelectorAll('.conclusao-text, li');
    itens.forEach(item => {
      const txt = (item.textContent || '').trim();
      if (txt) conclusoes.push(txt);
    });
  }

  return { achados, conclusoes };
}

/**
 * Chama o motor Senna90 NO SERVIDOR via API.
 * Cliente NÃO tem acesso ao código fonte do motor.
 */
async function calcularServerSide(): Promise<ResultadoLaudo | null> {
  try {
    const medidas = lerMedidasDoDOM();
    const token = await auth.currentUser?.getIdToken();
    if (!token) return null; // Sem auth = sem call (silencioso)

    const res = await fetch('/api/laudo/calcular', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(medidas),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok) return null;
    return {
      derivados: data.derivados,
      achados: data.achados,
      conclusoes: data.conclusoes,
      alertas: data.alertas,
    };
  } catch (e) {
    console.warn('[ShadowMode] erro ao chamar /api/laudo/calcular:', e);
    return null;
  }
}

/**
 * Executa o motor TS (no servidor) com os dados atuais e compara com o motor antigo.
 */
export async function rodarShadowMode(exameId?: string): Promise<ShadowResult> {
  const timestamp = new Date().toISOString();

  try {
    // 1. Chamar motor TS server-side (NÃO expõe código)
    const motorTSResult = await calcularServerSide();
    if (!motorTSResult) {
      return {
        matched: true, // não tem como comparar, ignora
        divergencias: [],
        motorTSResult: null,
        timestamp,
        exameId,
      };
    }

    // 2. Ler saída do motor antigo (DOM)
    const motorAntigo = lerSaidaMotorAntigo();

    // 3. Comparar achados
    const divergencias: Divergencia[] = [];
    const maxAchados = Math.max(motorAntigo.achados.length, motorTSResult.achados.length);
    for (let i = 0; i < maxAchados; i++) {
      const velho = motorAntigo.achados[i] || '';
      const novo = motorTSResult.achados[i] || '';
      if (novo.startsWith('__WILKINS__')) continue;
      if (velho !== novo) {
        const div: Divergencia = {
          categoria: 'achado',
          campo: `linha_${i + 1}`,
          velho,
          novo,
          esperado: false,
        };
        div.esperado = isDivergenciaEsperada(div);
        divergencias.push(div);
      }
    }

    // 4. Comparar conclusões
    const maxConcs = Math.max(motorAntigo.conclusoes.length, motorTSResult.conclusoes.length);
    for (let i = 0; i < maxConcs; i++) {
      const velho = motorAntigo.conclusoes[i] || '';
      const novo = motorTSResult.conclusoes[i] || '';
      if (velho !== novo) {
        const div: Divergencia = {
          categoria: 'conclusao',
          campo: `linha_${i + 1}`,
          velho,
          novo,
          esperado: false,
        };
        div.esperado = isDivergenciaEsperada(div);
        divergencias.push(div);
      }
    }

    return {
      matched: divergencias.length === 0,
      divergencias,
      motorTSResult,
      timestamp,
      exameId,
    };
  } catch (e) {
    console.warn('[ShadowMode] Erro ao executar:', e);
    Sentry.captureException(e, { tags: { component: 'shadow-runner' } });
    throw e;
  }
}

/**
 * Reporta divergências para Sentry e armazena localmente pra debug.
 */
export function reportarDivergencias(result: ShadowResult): void {
  if (result.matched) return;

  const inesperadas = result.divergencias.filter(d => !d.esperado);
  const esperadas = result.divergencias.filter(d => d.esperado);

  if (inesperadas.length > 0) {
    console.warn(
      `[ShadowMode] ${inesperadas.length} divergências INESPERADAS:`,
      inesperadas
    );
  }
  if (esperadas.length > 0) {
    console.info(
      `[ShadowMode] ${esperadas.length} divergências esperadas (decisões clínicas)`
    );
  }

  if (inesperadas.length > 0) {
    Sentry.captureMessage('Senna90 divergence detected', {
      level: 'warning',
      tags: {
        component: 'shadow-runner',
        exameId: result.exameId || 'unknown',
      },
      extra: {
        total: result.divergencias.length,
        inesperadas: inesperadas.length,
        esperadas: esperadas.length,
        primeira: inesperadas[0],
      },
    });
  }

  // Histórico no localStorage
  try {
    const key = 'leo:shadow-mode:historico';
    const existente = JSON.parse(localStorage.getItem(key) || '[]') as unknown[];
    const novo = [
      {
        timestamp: result.timestamp,
        exameId: result.exameId,
        matched: result.matched,
        totalDivergencias: result.divergencias.length,
        inesperadas: inesperadas.length,
        esperadas: esperadas.length,
      },
      ...existente,
    ].slice(0, 50);
    localStorage.setItem(key, JSON.stringify(novo));
  } catch { /* */ }
}

/**
 * Verifica se Shadow Mode está ativo via env var ou localStorage.
 */
export function shadowModeAtivo(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NEXT_PUBLIC_SHADOW_MODE === 'on') return true;
  try {
    return localStorage.getItem('leo:shadow-mode') === 'on';
  } catch {
    return false;
  }
}

/**
 * API conveniente: chama shadow mode E reporta.
 */
export function executarEReportar(exameId?: string): void {
  if (!shadowModeAtivo()) return;
  setTimeout(async () => {
    try {
      const r = await rodarShadowMode(exameId);
      reportarDivergencias(r);
    } catch { /* já logado */ }
  }, 100);
}
