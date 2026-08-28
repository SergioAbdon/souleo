// ══════════════════════════════════════════════════════════════════
// LEO Senna93 F4 · Comparadores da sombra (frases + células)
// ══════════════════════════════════════════════════════════════════
// Frases: pareamento ESTRITO por conjunto normalizado — porte verbatim de
// src/app/api/admin/shadow-retroativo/route.ts:186-304 (compararLaudo,
// extrairLinhas, splitFrases, normalizar). Só a CLASSIFICAÇÃO mudou: o
// `esperada` deixa de ser uma lista solta de regex e passa a citar a linha
// do markdown (allowlist.ts). As mortas (similaridade/maisSimilar) não vêm.
//
// Células: zona comum das 10 linhas do legado. As linhas 10-11 do Senna93
// (aorta ascendente/arco, B14) NÃO são divergência — não entram no resultado.
// ══════════════════════════════════════════════════════════════════

import {
  FRASES_ESPERADAS,
  PARES_VR,
  TOL_CELULA,
  VR_INCONDICIONAL_LEGADO,
} from './allowlist';

export interface DivFrase {
  categoria: 'achado' | 'conclusao';
  linha: number;
  velho: string;
  novo: string;
  esperada: boolean;
  ref: string | null;
}

export interface DivCelula {
  linha: number;
  col: number;
  legado: string;
  senna93: string;
  esperada: boolean;
  ref: string | null;
}

// ══ FRASES ═════════════════════════════════════════════════════════

/** Primeiro matcher da allowlist que casar (ordem = prioridade). */
function classificarFrase(velho: string, novo: string): { esperada: boolean; ref: string | null } {
  const m = FRASES_ESPERADAS.find((f) => f.casa(velho, novo));
  return m ? { esperada: true, ref: m.ref } : { esperada: false, ref: null };
}

/**
 * Compara achados/conclusões de forma ESTRITA.
 * Match exato (após normalização ortográfica básica) ou divergência.
 * Sem similaridade aproximada — espessura ≠ massa.
 */
export function compararFrases(
  velho: { achados: string[]; conclusoes: string[] },
  novo: { achados: string[]; conclusoes: string[] }
): DivFrase[] {
  const divergencias: DivFrase[] = [];

  function comparar(velhoArr: string[], novoArr: string[], categoria: 'achado' | 'conclusao') {
    const velhoFiltrado = velhoArr.filter((x) => x && !x.startsWith('__WILKINS__'));
    const novoFiltrado = novoArr.filter((x) => x && !x.startsWith('__WILKINS__'));

    const velhoNorm = velhoFiltrado.map((s) => ({ original: s, norm: normalizar(s) }));
    const novoNorm = novoFiltrado.map((s) => ({ original: s, norm: normalizar(s) }));

    const novoNormSet = new Set(novoNorm.map((x) => x.norm));
    const velhoNormSet = new Set(velhoNorm.map((x) => x.norm));

    // Frases no velho que não estão no novo (match exato apenas)
    velhoNorm.forEach((v, i) => {
      if (!novoNormSet.has(v.norm)) {
        divergencias.push({
          categoria, linha: i + 1, velho: v.original, novo: '',
          ...classificarFrase(v.original, ''),
        });
      }
    });

    // Frases no novo que não estão no velho
    novoNorm.forEach((n, i) => {
      if (!velhoNormSet.has(n.norm)) {
        divergencias.push({
          categoria, linha: i + 1, velho: '', novo: n.original,
          ...classificarFrase('', n.original),
        });
      }
    });
  }

  comparar(velho.achados, novo.achados, 'achado');
  comparar(velho.conclusoes, novo.conclusoes, 'conclusao');

  return divergencias;
}

/**
 * Extrai achados/conclusões do que está salvo no exame.
 * O motor antigo salva como ARRAY de strings, mas Firestore pode
 * ter convertido pra string única separada por vírgulas.
 */
export function extrairLinhas(dados: unknown): string[] {
  if (!dados) return [];

  // Caso 1: array (formato ideal)
  if (Array.isArray(dados)) {
    // Cada elemento pode ainda ser uma string com várias frases concatenadas
    const todas: string[] = [];
    for (const item of dados) {
      const s = String(item || '').trim();
      if (s) todas.push(...splitFrases(s));
    }
    return todas.filter(Boolean);
  }

  // Caso 2: string única (concatenada com vírgulas pelo Firestore)
  if (typeof dados === 'string') {
    // Tentar como HTML primeiro
    if (dados.includes('<')) {
      return dados
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    }
    return splitFrases(dados);
  }

  return [];
}

/**
 * Splita uma string com várias frases médicas concatenadas.
 * Cada frase nova começa com letra maiúscula após uma vírgula.
 *
 * Ex: "Ritmo regular.,Câmaras normais.,Função preservada."
 * → ["Ritmo regular.", "Câmaras normais.", "Função preservada."]
 *
 * Cuida de NÃO splitar vírgulas DENTRO de frases (ex: "Ectasia leve, medindo X mm.")
 */
function splitFrases(s: string): string[] {
  // Splita em vírgula seguida (opcionalmente de espaço) e letra maiúscula portuguesa
  return s
    .split(/,\s*(?=[A-ZÁÉÍÓÚÂÊÔÃÕÜÇ])/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Normaliza string pra comparação tolerante (remove pontuação final, espaços extras, numeração) */
function normalizar(s: string): string {
  return s
    .trim()
    .replace(/^\d+[\.\)]\s*/, '')   // remove "1. " ou "1) " do início
    .replace(/[\s ]+/g, ' ')    // colapsa espaços/nbsp
    .replace(/[\.;]+$/, '')           // remove . ou ; do final
    .toLowerCase();
}

// ══ CÉLULAS ════════════════════════════════════════════════════════

/** Zona comum: as 10 linhas que os dois motores têm (o Senna93 tem 12, B14). */
const LINHAS_COMUNS = 10;

/** Número de célula da tabela: vírgula decimal e '%' fora. `null` = não é número. */
function num(celula: string): number | null {
  const s = celula.replace('%', '').replace(',', '.').trim();
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

function classificarCelula(
  linha: number, col: number, legado: string, senna93: string
): { esperada: boolean; ref: string | null } {
  const naoEsperada = { esperada: false, ref: null };

  // Colunas de VR (3 = esquerda, 7 = direita)
  if (col === 3 || col === 7) {
    const par = PARES_VR.find((p) => p.legado === legado && p.senna93 === senna93);
    if (par) return { esperada: true, ref: par.ref };
    // C8: as 3 VRs que o legado imprimia sem sexo e o Senna93 zera
    if (senna93 === '' && VR_INCONDICIONAL_LEGADO.includes(legado)) {
      return { esperada: true, ref: 'F3-T5 Tabela · sexo vazio' };
    }
    return naoEsperada;
  }

  // Colunas de valor (1 = esquerda, 5 = direita): tolerância numérica
  if (col === 1 || col === 5) {
    const tol = TOL_CELULA[`${linha},${col}`];
    const a = num(legado), b = num(senna93);
    if (tol === undefined || a === null || b === null) return naoEsperada;  // '—', 'VIDE', texto
    if (Math.abs(a - b) <= tol) return { esperada: true, ref: 'F3-T5 Tabela · valores' };
    return naoEsperada;
  }

  // Rótulo (0/4) e unidade (2/6): qualquer diferença é estrutura quebrada.
  return naoEsperada;
}

/**
 * Compara a tabela de parâmetros célula a célula na zona comum (linhas 0-9).
 * As linhas 10-11 do Senna93 (Aorta Ascendente / Arco Aórtico, B14) são
 * adição declarada — não entram no resultado.
 */
export function compararTabelas(senna93Rows: string[][], legadoRows: string[][]): DivCelula[] {
  const out: DivCelula[] = [];
  for (let linha = 0; linha < LINHAS_COMUNS; linha++) {
    const s = senna93Rows[linha] ?? [];
    const g = legadoRows[linha] ?? [];
    for (let col = 0; col < 8; col++) {
      const senna93 = s[col] ?? '';
      const legado = g[col] ?? '';
      if (senna93 === legado) continue;
      out.push({ linha, col, legado, senna93, ...classificarCelula(linha, col, legado, senna93) });
    }
  }
  return out;
}
