// ══════════════════════════════════════════════════════════════════
// SOULEO v3 · API Route — Feegow proxy seguro
// Token fica no servidor (env), nunca exposto ao browser
// v3: + rate limit + timeout + auth via Firebase token
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { dataLocalHoje } from '@/lib/utils';
import { adminDb, adminAuth } from '@/lib/auth-admin';
import { resolverPapel, ehMedicoDeVerdade } from '@/lib/exame-admin';
import { gravarImportacao, resolverTokenFeegow, resolverProcMap, decidirGetFeegow, montarCandidatos, normalizarNascimento, reconciliarCancelados } from '@/lib/feegow-admin';

const fbAuth = adminAuth();
const dbAdmin = adminDb();

const FEEGOW_BASE = 'https://api.feegow.com/v1/api';
const TIMEOUT_MS = 10000; // 10 segundos timeout por request Feegow

// ── Rate Limiter (em memoria, por IP) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 30;      // max 30 requests
const RATE_LIMIT_WINDOW = 60000; // por minuto

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ── Auth: verificar token Firebase do usuario ──
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

// ── Resolver token Feegow: SEMPRE da gaveta (privado/feegow.token), sem
// excecao — re-revisao da Task 7 (Critical): o fallback pro FEEGOW_API_TOKEN
// do .env foi removido (a migracao roda ANTES do deploy, entao nao ha mais
// "durante a virada" pra cobrir; o fallback so servia de furo — token real
// da MedCardio vazando pro dono de qualquer workspace novo sem token
// proprio). A variavel FEEGOW_API_TOKEN precisa sair do Vercel (acao
// humana). O header X-Feegow-Token tambem NAO e aceito: resolverTokenFeegow
// nem tem parametro pra ele, entao nao ha como um cliente forjar o proprio
// token aqui.
async function resolverToken(req: NextRequest): Promise<string> {
  const wsId = req.nextUrl.searchParams.get('wsId');
  return resolverTokenFeegow(dbAdmin, wsId);
}

async function feegowFetch(endpoint: string, token: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${FEEGOW_BASE}${endpoint}`, {
      headers: { 'x-access-token': token, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Feegow ${res.status}: ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// BUG (22/06/2026): este endpoint roda no Vercel em UTC. Com `new Date()` do
// servidor, depois das 21h de Brasilia (00h UTC) o "hoje" virava o dia seguinte,
// e a query do Feegow (data_start/data_end=hoje) perdia os exames de hoje ainda
// na sala de espera (ex.: carotida do Francisley). Tambem gravava dataExame no
// dia errado, sumindo da worklist (que filtra pela data local). Fixar no fuso
// da clinica resolve os dois sintomas — feito em utils.ts (dataLocalBRT/Hoje).

// ── Middleware: auth + rate limit ──
// Devolve o uid junto (Minor 7, Sub-plano 5 Task 7 revisao): antes GET e
// POST 'importar' chamavam verificarAuth() de novo depois deste guard —
// dois verifyIdToken por requisicao pro MESMO token. proteger() ja tem o
// uid; os chamadores reusam em vez de reverificar.
async function proteger(req: NextRequest): Promise<{ blocked: NextResponse } | { uid: string }> {
  // Rate limit por IP
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return { blocked: NextResponse.json({ ok: false, error: 'Rate limit excedido. Tente novamente em 1 minuto.' }, { status: 429 }) };
  }

  // Auth: verificar token Firebase
  const uid = await verificarAuth(req);
  if (!uid) {
    return { blocked: NextResponse.json({ ok: false, error: 'Nao autorizado. Token Firebase invalido ou ausente.' }, { status: 401 }) };
  }

  return { uid };
}

// POST /api/feegow — importar sala de espera ou atualizar status no Feegow
export async function POST(req: NextRequest) {
  // v3: protecao
  const guarda = await proteger(req);
  if ('blocked' in guarda) return guarda.blocked;
  const { uid } = guarda;

  // Gate icado pra ANTES do switch de acao (re-revisao da Task 7, Important):
  // as duas acoes do POST leem wsId da query (igual ao GET), entao o mesmo
  // decidirGetFeegow resolve papel+token uma unica vez aqui, ANTES de saber
  // qual acao o corpo pede. Isso fecha o padrao "gate dentro de cada if" que
  // fez 'atualizar_status' nascer sem gate (achado avulso, corrigido depois)
  // — uma terceira acao futura nasce protegida por construcao, sem lista pra
  // esquecer. papel fica em escopo pro calculo de ehMed do 'importar'.
  const wsId = req.nextUrl.searchParams.get('wsId');
  const papel = wsId ? await resolverPapel(dbAdmin, wsId, uid) : null;
  const veredito = await decidirGetFeegow(wsId, papel, () => resolverToken(req));
  if (!veredito.ok) return NextResponse.json({ ok: false, error: veredito.motivo }, { status: veredito.status });
  const token = veredito.token;

  try {
    const body = await req.json();

    if (body.action === 'atualizar_status') {
      const { agendamento_id, status_id } = body;
      if (!agendamento_id || !status_id) {
        return NextResponse.json({ error: 'agendamento_id e status_id obrigatorios' }, { status: 400 });
      }

      const res = await fetch(`${FEEGOW_BASE}/appoints/statusUpdate`, {
        method: 'POST',
        headers: { 'x-access-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ AgendamentoID: agendamento_id, StatusID: status_id }),
      });
      const data = await res.json();
      return NextResponse.json({ ok: true, data });
    }

    if (body.action === 'importar') {
      // Autor so se perfil medico E papel que atende (MEDREC nao carimba) — Codex-2.
      const ehMed = (papel === 'dono' || papel === 'medico') && await ehMedicoDeVerdade(dbAdmin, uid);
      const perfilSnap = await dbAdmin.doc(`profissionais/${uid}`).get();
      const hoje = dataLocalHoje();
      // procMap: SO de integracoes/feegow.procMap (Task 4) — dual-owner fechado
      // aqui, Sub-plano 5 Task 7 item A. profMap continua no documento do local
      // (nao e credencial nem tem dono duplicado — decisao Task 7 item C).
      const procMap = await resolverProcMap(dbAdmin, wsId);
      // D4/achado 15 (Task 3): sem mapa nao ha o que importar — 400 explicito
      // ANTES de bater no Feegow, em vez do PROC_MAP chumbado da MedCardio
      // que antes cobria (errado) qualquer local sem configuracao propria.
      if (Object.keys(procMap).length === 0) {
        return NextResponse.json({ ok: false, error: 'feegow_sem_procmap' }, { status: 400 });
      }
      const profMap: Record<number, string> = {};
      if (wsId) {
        const wsDoc = await dbAdmin.doc(`workspaces/${wsId}`).get();
        const wsProfMap = wsDoc.data()?.feegowProfMap as Record<string, string> | undefined;
        if (wsProfMap) {
          for (const [k, v] of Object.entries(wsProfMap)) {
            profMap[Number(k)] = v;
          }
        }
      }
      const { candidatos, ignorados, falhas, cancelados } = await montarCandidatos({ token, wsId: wsId as string, hoje, procMap, profMap });
      const { criados, descartados } = await gravarImportacao(dbAdmin, {
        wsId: wsId as string, candidatos, uid, ehMed, nomeCriador: (perfilSnap.data()?.nome as string) || '',
      });
      // Task 4 (D3, achado 7a): quem o Feegow ja deu como cancelado/faltou
      // fecha 'nao-realizado' no LEO — nunca apaga (ADR 16/05 #6).
      const naoRealizados = await reconciliarCancelados(dbAdmin, { wsId: wsId as string, hoje, cancelados });
      return NextResponse.json({
        ok: true, total: candidatos.length, criados, ignorados, falhas,
        // descartados: guards de path-safety/data de gravarImportacao (Task 1)
        // — nunca dispara no fluxo real (montarCandidatos sempre gera fgId
        // numerico + data valida), campo proprio so pra fechar o invariante
        // "nenhum descarte silencioso" sem inflar `falhas` (que e busca, nao gravacao).
        descartados,
        naoRealizados,
      });
    }

    return NextResponse.json({ error: 'action invalida' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    if (msg.includes('aborted')) return NextResponse.json({ ok: false, error: 'Timeout na comunicacao com Feegow' }, { status: 504 });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  // v3: protecao
  const guarda = await proteger(req);
  if ('blocked' in guarda) return guarda.blocked;
  const { uid } = guarda;

  const wsId = req.nextUrl.searchParams.get('wsId');
  const papel = wsId ? await resolverPapel(dbAdmin, wsId, uid) : null;

  // Critical 1 + Important 2 (Sub-plano 5, Task 7 revisao): decidirGetFeegow
  // roda pra QUALQUER acao, sem excecao (nao ha mais lista de acoes
  // "gateadas" — 4 acoes bypassavam o gate anterior, uma delas devolvendo
  // CRM de medico de outra clinica) e SEMPRE antes de tocar o token (o gate
  // de papel decide 403 sem nunca ler workspaces/{wsId}/privado/feegow de
  // quem nao tem acesso — o status HTTP nao vaza se a clinica tem Feegow
  // configurado).
  const veredito = await decidirGetFeegow(wsId, papel, () => resolverToken(req));
  if (!veredito.ok) return NextResponse.json({ ok: false, error: veredito.motivo }, { status: veredito.status });
  const token = veredito.token;

  const action = req.nextUrl.searchParams.get('action');

  try {
    switch (action) {
      case 'buscar_cpf': {
        const cpf = req.nextUrl.searchParams.get('cpf');
        if (!cpf) return NextResponse.json({ error: 'cpf obrigatorio' }, { status: 400 });
        const cpfLimpo = cpf.replace(/\D/g, '');
        if (cpfLimpo.length < 11) return NextResponse.json({ error: 'CPF invalido' }, { status: 400 });
        const data = await feegowFetch(`/patient/search?paciente_cpf=${cpfLimpo}`, token);
        const pac = data?.content;
        if (!pac) return NextResponse.json({ ok: true, encontrado: false });
        return NextResponse.json({
          ok: true, encontrado: true,
          paciente: {
            nome: (pac.nome || '').toUpperCase(),
            dtnasc: normalizarNascimento(pac.nascimento),
            sexo: pac.sexo === 'Masculino' ? 'M' : pac.sexo === 'Feminino' ? 'F' : '',
            cpf: (pac.documentos?.cpf || '').replace(/\D/g, '') || cpfLimpo,
            telefone: typeof pac.telefones?.[0] === 'string' ? pac.telefones[0] : '', // mesmo guard de montarCandidatos (achado 16-baixo / re-revisao achado 3)
            feegowPacienteId: pac.id || null,
          },
        });
      }

      // Listar procedimentos do Feegow (para mapeamento no LocalModal)
      case 'procedimentos': {
        const procRes = await feegowFetch('/procedures/list', token);
        const todos = procRes?.content || [];
        // Filtrar só exames relevantes (contêm "Exame -" ou "Eco" ou "Doppler" no nome)
        const filtrados = todos
          .filter((p: Record<string, unknown>) => {
            const nome = ((p.nome as string) || '').toLowerCase();
            return nome.includes('exame -') || nome.includes('eco') || nome.includes('doppler');
          })
          .map((p: Record<string, unknown>) => ({
            procedimento_id: p.procedimento_id,
            nome: p.nome,
          }));
        return NextResponse.json({ ok: true, total: filtrados.length, procedimentos: filtrados });
      }

      // Listar profissionais do Feegow (para mapeamento no LocalModal — análogo a 'procedimentos')
      case 'profissionais': {
        const profRes = await feegowFetch('/professional/list', token);
        const todos = profRes?.content || [];
        const profissionais = todos
          .filter((p: Record<string, unknown>) => p.ativo === true)
          .map((p: Record<string, unknown>) => ({
            profissional_id: p.profissional_id,
            nome: p.nome,
            tratamento: p.tratamento,
            conselho: p.conselho,
            documento_conselho: p.documento_conselho,
            uf_conselho: p.uf_conselho,
          }));
        return NextResponse.json({ ok: true, total: profissionais.length, profissionais });
      }

      default:
        return NextResponse.json({ error: 'action invalida. Use: buscar_cpf, procedimentos, profissionais' }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    if (msg.includes('aborted')) return NextResponse.json({ ok: false, error: 'Timeout na comunicacao com Feegow' }, { status: 504 });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
