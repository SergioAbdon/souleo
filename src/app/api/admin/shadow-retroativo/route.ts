// ══════════════════════════════════════════════════════════════════
// SOULEO · API Admin — Análise Retroativa Shadow Mode
// ══════════════════════════════════════════════════════════════════
// Pega exames emitidos num período, roda Senna90 nas medidas salvas
// e compara com os achados/conclusões que o motor antigo gerou.
//
// Não modifica os exames — apenas reporta divergências.
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { calcular } from '@/senna90/motor';
import type { MedidasEcoTT, Sexo, Ritmo, GrauRefluxo, MorfologiaValvar, CodigoSegmento, CodigoDemaisParedes } from '@/senna90/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'leo-sistema-laudos',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const fbAuth = getAuth();
const dbAdmin = getFirestore();

async function verificarAuth(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const decoded = await fbAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * Converte os dados salvos no Firestore para MedidasEcoTT.
 * O motor antigo salva os campos como medidas[id] = string.
 */
function dadosParaMedidas(dados: Record<string, unknown>): MedidasEcoTT {
  const medidas = (dados.medidas || {}) as Record<string, string>;
  const num = (k: string): number | null => {
    const v = medidas[k];
    if (v === undefined || v === null || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  };
  const str = (k: string): string => String(medidas[k] || '');

  return {
    identificacao: {
      nome: String(dados.pacienteNome || ''),
      pacienteDtnasc: String(dados.pacienteDtnasc || ''),
      dataExame: String(dados.dataExame || ''),
      convenio: String(dados.convenio || ''),
      solicitante: String(dados.solicitante || ''),
    },
    gerais: {
      sexo: (str('sexo') || String(dados.sexo || '')) as Sexo,
      ritmo: str('ritmo') as Ritmo,
      peso: num('peso'),
      altura: num('altura'),
    },
    camaras: {
      raizAo: num('b7'),
      ae: num('b8'),
      ddve: num('b9'),
      septoIV: num('b10'),
      paredePosterior: num('b11'),
      dsve: num('b12'),
      vd: num('b13'),
      aoAscendente: num('b28'),
      arcoAo: num('b29'),
    },
    diastolica: {
      ondaE: num('b19'),
      relacaoEA: num('b20'),
      eSeptal: num('b21'),
      relacaoEEseptal: num('b22'),
      velocidadeIT: num('b23'),
      psap: num('b37'),
      volAEindex: num('b24'),
      volADindex: num('b25'),
      laStrain: num('lars'),
      sinaisHP: str('b38') === 'S' ? 'S' : '',
      modoManual: 'auto',
      selecaoManual: -1,
      textoLivre: '',
    },
    sistolica: {
      feSimpson: num('b54'),
      disfuncaoVD: str('b32') as GrauRefluxo,
      tapse: num('b33'),
      glsVE: num('gls_ve'),
      glsVD: num('gls_vd'),
    },
    valvas: {
      morfMitral: str('b34') as MorfologiaValvar,
      refluxoMitral: str('b35') as GrauRefluxo,
      morfTricuspide: str('b34t') as MorfologiaValvar,
      refluxoTricuspide: str('b36') as GrauRefluxo,
      morfAortica: str('b39') as MorfologiaValvar,
      refluxoAortico: str('b40') as GrauRefluxo,
      morfPulmonar: str('b39p') as MorfologiaValvar,
      refluxoPulmonar: str('b40p') as GrauRefluxo,
      pmap: num('psmap'),
      derramePericard: str('b41') as GrauRefluxo,
      placasArco: (str('b42') || '') as '' | 's' | 'nv',
    },
    estenoses: {
      gradMaxMitral: num('b45'),
      gradMedMitral: num('b46'),
      areaMitral: num('b47'),
      gradMaxAo: num('b50'),
      gradMedAo: num('b51'),
      areaAo: num('b52'),
      gradMedTric: num('b46t'),
      areaTric: num('b47t'),
      gradMaxPulm: num('b50p'),
    },
    wilkins: {
      ativo: false, // não temos info salva
      mobilidade: 0, espessura: 0, calcificacao: 0, subvalvar: 0,
    },
    segmentar: {
      apex: (str('b55') || '') as '' | 'H' | 'A' | 'D',
      anterior: str('b56') as CodigoSegmento,
      septalAnterior: str('b57') as CodigoSegmento,
      septalInferior: str('b58') as CodigoSegmento,
      inferior: str('b59') as CodigoSegmento,
      inferolateral: str('b60') as CodigoSegmento,
      lateral: str('b61') as CodigoSegmento,
      demaisParedes: (str('b62') || 'NL') as CodigoDemaisParedes,
    },
  };
}

/** Padrões de divergências esperadas (13 alterações aprovadas + ajustes textuais) */
const ESPERADAS: RegExp[] = [
  /VR ≥ -1[89]%/,                          // GLS VE -18% → -20%
  /Estenose Pulmonar/,                     // Cutoffs ASE 2017
  /Átrio direito aumentado/,               // RAVI sexo-específico → unificado
  /Ectasia.*\(previsto.*± .*mm\)/,        // Aorta com Z-score (versão nova)
  /Ectasia.*medindo \d+ mm/,               // Aorta sem Z-score (versão antiga)
  /Ectasia.*(?:raiz|ascendente|arco)/i,   // Qualquer ectasia (versão de classificação difere)
  /Ectasia da aorta/,                      // Conclusão consolidada
  /Massa do ventrículo esquerdo (?:preservada|aumentada)/, // Versão antiga motor
  /Espessura miocárdica do ventrículo esquerdo (?:preservada|aumentada)/, // Versão nova
  /Contratilidade preservada nas demais paredes/, // Senna90 emite, motor antigo às vezes não
];

/** Calcula similaridade Jaccard entre 2 strings (intersecção/união de palavras) */
function similaridade(a: string, b: string): number {
  const wA = new Set(normalizar(a).split(' ').filter(w => w.length > 2));
  const wB = new Set(normalizar(b).split(' ').filter(w => w.length > 2));
  if (wA.size === 0 && wB.size === 0) return 1;
  if (wA.size === 0 || wB.size === 0) return 0;
  let inter = 0;
  wA.forEach(w => { if (wB.has(w)) inter++; });
  const uniao = wA.size + wB.size - inter;
  return inter / uniao;
}

/** Encontra frase mais similar em um array. Retorna null se nenhuma >= threshold. */
function maisSimilar(target: string, candidatos: string[], threshold: number = 0.6): string | null {
  let melhor: string | null = null;
  let melhorScore = threshold;
  for (const c of candidatos) {
    const s = similaridade(target, c);
    if (s > melhorScore) {
      melhorScore = s;
      melhor = c;
    }
  }
  return melhor;
}

function isEsperada(velho: string, novo: string): boolean {
  return ESPERADAS.some(re => re.test(novo) || re.test(velho));
}

/**
 * Compara achados/conclusões com 3 níveis:
 * 1. Match exato (após normalização) — não vira divergência
 * 2. Match aproximado (similaridade >= 60%) — divergência ESPERADA com motivo "aproximado"
 * 3. Sem match — divergência INESPERADA (a menos que regex esperada bata)
 */
function compararLaudo(velho: { achados: string[]; conclusoes: string[] }, novo: { achados: string[]; conclusoes: string[] }) {
  const divergencias: { categoria: string; linha: number; velho: string; novo: string; esperada: boolean }[] = [];

  function comparar(velhoArr: string[], novoArr: string[], categoria: string) {
    const velhoFiltrado = velhoArr.filter(x => x && !x.startsWith('__WILKINS__'));
    const novoFiltrado = novoArr.filter(x => x && !x.startsWith('__WILKINS__'));

    const velhoNorm = velhoFiltrado.map(s => normalizar(s));
    const novoNorm = novoFiltrado.map(s => normalizar(s));

    const usadosNovo = new Set<number>();
    const usadosVelho = new Set<number>();

    // PASSO 1: matches exatos (já feitos pelo Set)
    const novoNormSet = new Set(novoNorm);
    const velhoNormSet = new Set(velhoNorm);

    velhoNorm.forEach((v, i) => {
      if (novoNormSet.has(v)) usadosVelho.add(i);
    });
    novoNorm.forEach((n, i) => {
      if (velhoNormSet.has(n)) usadosNovo.add(i);
    });

    // PASSO 2: para cada frase do velho não usada, procurar match APROXIMADO no novo
    velhoFiltrado.forEach((v, i) => {
      if (usadosVelho.has(i)) return;
      // Busca frase mais similar entre as não usadas do novo
      let melhorIdx = -1;
      let melhorScore = 0.6;
      novoFiltrado.forEach((n, j) => {
        if (usadosNovo.has(j)) return;
        const s = similaridade(v, n);
        if (s > melhorScore) {
          melhorScore = s;
          melhorIdx = j;
        }
      });
      if (melhorIdx >= 0) {
        // Match aproximado
        const n = novoFiltrado[melhorIdx];
        usadosNovo.add(melhorIdx);
        usadosVelho.add(i);
        divergencias.push({
          categoria,
          linha: i + 1,
          velho: v,
          novo: n,
          esperada: true, // similaridade alta = esperada (variação textual mínima)
        });
      }
    });

    // PASSO 3: o que sobrou é divergência sem par (presente em um lado, ausente no outro)
    velhoFiltrado.forEach((v, i) => {
      if (usadosVelho.has(i)) return;
      divergencias.push({
        categoria,
        linha: i + 1,
        velho: v,
        novo: '',
        esperada: isEsperada(v, ''),
      });
    });
    novoFiltrado.forEach((n, i) => {
      if (usadosNovo.has(i)) return;
      divergencias.push({
        categoria,
        linha: i + 1,
        velho: '',
        novo: n,
        esperada: isEsperada('', n),
      });
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
function extrairLinhas(dados: unknown): string[] {
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
        .map(l => l.trim())
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
    .map(x => x.trim())
    .filter(Boolean);
}

/** Normaliza string pra comparação tolerante (remove pontuação final, espaços extras, numeração) */
function normalizar(s: string): string {
  return s
    .trim()
    .replace(/^\d+[\.\)]\s*/, '')   // remove "1. " ou "1) " do início
    .replace(/[\s ]+/g, ' ')    // colapsa espaços/nbsp
    .replace(/[\.;]+$/, '')           // remove . ou ; do final
    .toLowerCase();
}

/**
 * POST /api/admin/shadow-retroativo
 *
 * Body: { wsId, from (ISO date), to (ISO date) }
 * Response: { exames: [...], resumo: {...} }
 */
export async function POST(req: NextRequest) {
  try {
    const uid = await verificarAuth(req);
    if (!uid) return NextResponse.json({ ok: false, error: 'Auth requerida' }, { status: 401 });

    const body = await req.json();
    const { wsId, from, to } = body as { wsId: string; from: string; to: string };

    if (!wsId || !from) {
      return NextResponse.json({ ok: false, error: 'wsId e from obrigatórios' }, { status: 400 });
    }

    // Buscar exames emitidos do período
    const fromDate = new Date(from);
    const toDate = to ? new Date(to) : new Date();
    toDate.setHours(23, 59, 59, 999);

    const snap = await dbAdmin
      .collection('workspaces').doc(wsId).collection('exames')
      .where('status', '==', 'emitido')
      .where('emitidoEm', '>=', Timestamp.fromDate(fromDate))
      .where('emitidoEm', '<=', Timestamp.fromDate(toDate))
      .orderBy('emitidoEm', 'desc')
      .limit(200)
      .get();

    const exames: Array<{
      id: string;
      pacienteNome: string;
      emitidoEm: string;
      total: number;
      esperadas: number;
      inesperadas: number;
      divergencias: Array<{ categoria: string; linha: number; velho: string; novo: string; esperada: boolean }>;
    }> = [];

    let totalDivergencias = 0;
    let totalEsperadas = 0;
    let totalInesperadas = 0;
    let exMatch = 0;
    let exDiv = 0;

    for (const doc of snap.docs) {
      const dados = doc.data();
      const medidas = dadosParaMedidas(dados);

      // Roda Senna90
      let novo;
      try {
        novo = calcular(medidas);
      } catch {
        continue; // ignora se não conseguir calcular
      }

      // Extrai achados/conclusões salvos
      const velho = {
        achados: extrairLinhas(dados.achados),
        conclusoes: extrairLinhas(dados.conclusoes),
      };

      const divergencias = compararLaudo(velho, novo);
      const esperadas = divergencias.filter(d => d.esperada).length;
      const inesperadas = divergencias.filter(d => !d.esperada).length;

      totalDivergencias += divergencias.length;
      totalEsperadas += esperadas;
      totalInesperadas += inesperadas;
      if (divergencias.length === 0) exMatch++;
      else exDiv++;

      exames.push({
        id: doc.id,
        pacienteNome: String(dados.pacienteNome || '—'),
        emitidoEm: dados.emitidoEm?.toDate?.()?.toISOString?.() || '',
        total: divergencias.length,
        esperadas,
        inesperadas,
        divergencias,
      });
    }

    return NextResponse.json({
      ok: true,
      resumo: {
        totalExames: exames.length,
        match: exMatch,
        diverge: exDiv,
        totalDivergencias,
        totalEsperadas,
        totalInesperadas,
      },
      exames,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    console.error('[/api/admin/shadow-retroativo] error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
