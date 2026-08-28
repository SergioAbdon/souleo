// ══════════════════════════════════════════════════════════════════
// LEO Senna93 F4 · `rodarShadow` — orquestrador da sombra
// ══════════════════════════════════════════════════════════════════
// Roda as DUAS metades do laudo para cada exame do período:
//   frases  — texto SALVO × `calcular()` de hoje (só conta na meta se o
//             exame é da era Senna90; antes de 16/05 vai pro balde
//             informativo `eraLegado`)
//   números — Senna93 (`montarRowsTabela`) × simulador do legado (T1),
//             motor×motor, logo vale para o histórico inteiro.
// Listagem e persistência entram como DEPS (a rota/cron/script injetam
// o Admin SDK) — o core é puro e testável sem Firestore.
// ponytail: morre na F5b junto com a sombra — não generalizar.
// ══════════════════════════════════════════════════════════════════

import type {
  MedidasEcoTT, Sexo, Ritmo, GrauRefluxo, MorfologiaValvar,
  CodigoSegmento, CodigoDemaisParedes,
} from '@/senna90/types';
import { calcular } from '../../senna90/motor';
import { montarRowsTabela } from '../../senna90/classificacoes/tabela';
import { compararFrases, compararTabelas, extrairLinhas } from './comparar';
import type { DivFrase, DivCelula } from './comparar';

/**
 * T4: dif de UMA célula na checagem simulador × snapshot pintado. Diferente
 * de `DivCelula` (que compara os DOIS motores — legado/senna93): aqui os
 * dois lados são o MESMO motor (legado), então os nomes `legado`/`senna93`
 * mentiriam sobre qual lado é qual — revisão final M-a.
 */
export interface DifSnapshot {
  linha: number; col: number;
  pintado: string; simulado: string;
  esperada: boolean; ref: string | null;
}
import { simularTabelaLegado } from './legado-tabela';
import type { EntradaLegado } from './legado-tabela';
import { extrairRowsDoSnapshot } from './snapshot-params';

/** Frases do Senna90 em produção desde 16/05/2026 (primary-engine-flag.ts). */
export const ERA_SENNA90_DESDE = '2026-05-17';

export interface ShadowDeps {
  listarExames(wsId: string, from: Date, to: Date): Promise<{ id: string; dados: Record<string, unknown> }[]>;
  persistir(wsId: string, exec: ExecucaoShadow): Promise<string>;  // devolve execId
  /** T4: HTML do snapshot pintado (`laudos-html/`) — ausente = check pulado. */
  lerSnapshot?(wsId: string, exameId: string): Promise<string | null>;
}

export interface ExameShadow {
  id: string; emitidoEm: string;
  era: 'senna90' | 'legado';            // emitidoEm >= ERA_SENNA90_DESDE
  motorNumeros: string | null;          // proveniência gravada na F3 (se houver)
  frases: DivFrase[]; celulas: DivCelula[];
  pulado?: 'sem-data' | 'sem-medidas' | 'sem-texto' | 'erro-calculo';
  /** Preenchido pela T4 (validação contra o snapshot HTML), quando houver. */
  snapshotCheck?: { batem: boolean; difs: DifSnapshot[] } | null;
}

export interface ResumoShadow {
  totalExames: number; comparados: number; pulados: number; match: number; diverge: number;
  frases: { esperadas: number; inesperadas: number; eraLegado: number };
  celulas: { esperadas: number; inesperadas: number };
  /** T4: validação simulador × snapshot pintado — só conta quem foi de fato conferido. */
  snapshot: { conferidos: number; batem: number; divergem: number };
}

export interface ExecucaoShadow {
  origem: 'retroativo' | 'cron' | 'script'; uid: string | null;
  from: string; to: string;
  resumo: ResumoShadow; exames: ExameShadow[];
}

/**
 * Converte os dados salvos no Firestore para MedidasEcoTT.
 * O motor antigo salva os campos como medidas[id] = string.
 */
export function dadosParaMedidas(dados: Record<string, unknown>): MedidasEcoTT {
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
      // Review S5-T3 (M4): antes fixava 'auto', então todo exame laudado em
      // manual aparecia como "divergência inesperada" contra o motor antigo
      // (que respeitava a seleção salva). Mesma regra do adapter: sel>=0 = manual.
      modoManual: (num('diast-manual-sel') ?? -1) >= 0 ? 'manual' : 'auto',
      selecaoManual: num('diast-manual-sel') ?? -1,
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

/**
 * Datas do simulador com 'T12:00' — MEIO-DIA LOCAL, o mesmo truque que a
 * tela já usa (params-render.ts:48).
 *
 * Revisão da T1: `idadeAnos` (porte verbatim) faz `new Date('AAAA-MM-DD')`
 * (meia-noite UTC) e lê com getters LOCAIS. Sem o sufixo, a idade depende do
 * fuso do PROCESSO: 8 de 691.920 pares de datas divergem entre UTC−3
 * (navegador da clínica) e UTC (Vercel) — gatilho 01/03 de ano bissexto nas
 * fronteiras 40/65 anos. Rodando na Vercel o simulador concordaria com o
 * Senna93 e CALARIA a divergência; a sombra existe para o contrário.
 *
 * Com 'T12:00' a data de calendário é a mesma em qualquer fuso — e passa a
 * bater com o Senna90 (`helpers/format.ts:39`, aritmética de string). Nesses
 * 8 pares o legado da clínica tinha um off-by-one de um dia que o simulador
 * NÃO reproduz de propósito: divergência ali é bug REAL do legado aparecendo
 * (falhar alto > concordar em silêncio).
 */
function meioDia(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00' : d;
}

/** Entrada do simulador do legado a partir das MESMAS medidas do Senna93. */
export function entradaLegadoDe(m: MedidasEcoTT): EntradaLegado {
  const c = m.camaras;
  return {
    sexo: m.gerais.sexo,
    peso: m.gerais.peso, altura: m.gerais.altura,
    b7: c.raizAo, b8: c.ae, b9: c.ddve, b10: c.septoIV,
    b11: c.paredePosterior, b12: c.dsve, b13: c.vd,
    dtnasc: meioDia(m.identificacao.pacienteDtnasc),
    dtexame: meioDia(m.identificacao.dataExame),
  };
}

/** b7..b29 no formato do builder (o adapter chama de raizAo/ae/ddve/...). */
function medidasDaTabela(m: MedidasEcoTT) {
  const c = m.camaras;
  return {
    b7: c.raizAo, b8: c.ae, b9: c.ddve, b10: c.septoIV, b11: c.paredePosterior,
    b12: c.dsve, b13: c.vd, b28: c.aoAscendente, b29: c.arcoAo,
  };
}

/** ISO do `emitidoEm` (Timestamp do Admin SDK) — '' quando não dá pra ler. */
function isoEmitidoEm(v: unknown): string {
  const d = (v as { toDate?: () => Date } | null | undefined)?.toDate?.();
  return d instanceof Date ? d.toISOString() : typeof v === 'string' ? v : '';
}

/** `calcular` com medida corrompida lança — vira `pulado`, não silêncio. */
function calcularOuNull(m: MedidasEcoTT): ReturnType<typeof calcular> | null {
  try {
    return calcular(m);
  } catch {
    return null;
  }
}

/**
 * T4: simulador (T1) × o que o legado REALMENTE pintou (snapshot HTML) —
 * byte-exato, célula a célula, nas 10 linhas comuns. Diferente de
 * `compararTabelas` (que classifica divergências ESPERADAS entre os dois
 * MOTORES via allowlist): aqui os dois lados representam o MESMO motor
 * (legado), logo qualquer diferença é divergência de verdade — o
 * simulador saiu da linha, não o legado.
 */
function compararComSnapshot(simulado: string[][], pintado: string[][]): DifSnapshot[] {
  const out: DifSnapshot[] = [];
  for (let linha = 0; linha < 10; linha++) {
    const s = simulado[linha] ?? [];
    const p = pintado[linha] ?? [];
    for (let col = 0; col < 8; col++) {
      const cSimulado = s[col] ?? '';
      const cPintado = p[col] ?? '';
      if (cSimulado === cPintado) continue;
      out.push({ linha, col, pintado: cPintado, simulado: cSimulado, esperada: false, ref: null });
    }
  }
  return out;
}

/**
 * Regra de persistência: frase/célula divergente OU o simulador divergindo
 * do que o legado realmente pintou (`snapshotCheck.batem === false` — achado
 * por si, mesmo com frases/células limpas). Fonte única — usada pelo core
 * e pela rota (`persistirExecucao`), pra não duplicar o filtro.
 */
export function exameTemDivergencia(ex: ExameShadow): boolean {
  return !ex.pulado && (ex.frases.length > 0 || ex.celulas.length > 0 || ex.snapshotCheck?.batem === false);
}

export async function rodarShadow(
  deps: ShadowDeps,
  args: { wsId: string; from: Date; to: Date; origem: ExecucaoShadow['origem']; uid: string | null },
): Promise<{ execId: string; exec: ExecucaoShadow }> {
  const docs = await deps.listarExames(args.wsId, args.from, args.to);

  const exames: ExameShadow[] = [];
  const resumo: ResumoShadow = {
    totalExames: docs.length, comparados: 0, pulados: 0, match: 0, diverge: 0,
    frases: { esperadas: 0, inesperadas: 0, eraLegado: 0 },
    celulas: { esperadas: 0, inesperadas: 0 },
    snapshot: { conferidos: 0, batem: 0, divergem: 0 },
  };

  for (const { id, dados } of docs) {
    const emitidoEm = isoEmitidoEm(dados.emitidoEm);
    const ex: ExameShadow = {
      id,
      emitidoEm,
      // M1: fronteira em data de CALENDÁRIO UTC (slice de um ISO). Benigno:
      // a flag virou 'senna90' 16/05 às 00h BRT (03h UTC) — o UTC "come" as
      // primeiras ~3h do dia 17 como se ainda fosse 16, encolhendo a folga
      // de 1 dia que ERA_SENNA90_DESDE já tem margem pra cobrir, nunca
      // invertendo a direção da classificação.
      era: emitidoEm.slice(0, 10) >= ERA_SENNA90_DESDE ? 'senna90' : 'legado',
      motorNumeros: typeof dados.motorNumeros === 'string' ? dados.motorNumeros : null,
      frases: [], celulas: [],
    };
    exames.push(ex);

    // Pulados (fato 6): anexo de catálogo / laudo-texto entrariam na conta
    // como "divergência total" falsa.
    const brutas = (dados.medidas || {}) as Record<string, unknown>;
    const velho = {
      achados: extrairLinhas(dados.achados),
      conclusoes: extrairLinhas(dados.conclusoes),
    };
    // M2 (revisão T3): emitidoEm ilegível não pode virar 'legado' silencioso
    // — antes caía no balde informativo eraLegado sem avisar que a DATA em
    // si já é a falha. Prioridade sobre sem-medidas/sem-texto.
    if (emitidoEm === '') {
      ex.pulado = 'sem-data';
    } else if (Object.values(brutas).every((v) => v === '' || v === null || v === undefined)) {
      ex.pulado = 'sem-medidas';
    } else if (velho.achados.length === 0 && velho.conclusoes.length === 0) {
      ex.pulado = 'sem-texto';
    }

    const m = ex.pulado ? null : dadosParaMedidas(dados);
    const novo = m ? calcularOuNull(m) : null;
    if (m && !novo) ex.pulado = 'erro-calculo';
    if (!m || !novo) { resumo.pulados++; continue; }

    const legadoSimulado = simularTabelaLegado(entradaLegadoDe(m));
    ex.frases = compararFrases(velho, novo);
    ex.celulas = compararTabelas(
      montarRowsTabela(m.gerais, medidasDaTabela(m), novo.derivados, novo.derivados.idade).rows,
      legadoSimulado,
    );

    // T4: só exames que o legado pintou (proveniência da F3) — se o
    // Senna93 pintou, o snapshot não é referência do legado nenhuma.
    // snapshot só existe pós-S5 25/08 — evita 200 downloads 404 em série na rota de 60s
    if (deps.lerSnapshot && ex.motorNumeros !== 'senna93' && emitidoEm.slice(0, 10) >= '2026-08-25') {
      const snapHtml = await deps.lerSnapshot(args.wsId, ex.id);
      const rows = snapHtml ? extrairRowsDoSnapshot(snapHtml) : null;
      // 12 linhas = pintura Senna93 escapada da proveniência → não-conferido.
      if (rows && rows.length === 10) {
        const difs = compararComSnapshot(legadoSimulado, rows);
        ex.snapshotCheck = { batem: difs.length === 0, difs };
        resumo.snapshot.conferidos++;
        if (ex.snapshotCheck.batem) resumo.snapshot.batem++; else resumo.snapshot.divergem++;
      } else {
        ex.snapshotCheck = null;
      }
    }

    resumo.comparados++;
    for (const f of ex.frases) {
      // Era legado: o texto salvo veio do motor antigo — comparar com o motor
      // de hoje re-litiga as 22 divergências históricas de maio (fato 5).
      if (ex.era === 'legado') resumo.frases.eraLegado++;
      else if (f.esperada) resumo.frases.esperadas++;
      else resumo.frases.inesperadas++;
    }
    for (const c of ex.celulas) {
      if (c.esperada) resumo.celulas.esperadas++;
      else resumo.celulas.inesperadas++;
    }
    if (ex.frases.length + ex.celulas.length === 0) resumo.match++;
    else resumo.diverge++;
  }

  const exec: ExecucaoShadow = {
    origem: args.origem, uid: args.uid,
    from: args.from.toISOString(), to: args.to.toISOString(),
    resumo, exames,
  };
  return { execId: await deps.persistir(args.wsId, exec), exec };
}
