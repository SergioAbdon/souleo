// ══════════════════════════════════════════════════════════════════
// SOULEO v3 · API Route — Feegow proxy seguro
// Token fica no servidor (env), nunca exposto ao browser
// v3: + rate limit + timeout + auth via Firebase token
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// ── Firebase Admin (pra verificar auth token) ──
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

const FEEGOW_BASE = 'https://api.feegow.com/v1/api';
const FALLBACK_TOKEN = process.env.FEEGOW_API_TOKEN || ''; // fallback pra migracao
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

// ── Resolver token Feegow (por workspace ou fallback) ──
async function resolverToken(req: NextRequest): Promise<string> {
  // 1. Header X-Feegow-Token (usado no teste de conexao do LocalModal)
  const headerToken = req.headers.get('x-feegow-token');
  if (headerToken) return headerToken;

  // 2. Buscar do workspace via query param wsId
  const wsId = req.nextUrl.searchParams.get('wsId');
  if (wsId) {
    const wsDoc = await dbAdmin.doc(`workspaces/${wsId}`).get();
    if (wsDoc.exists && wsDoc.data()?.feegowToken) {
      return wsDoc.data()!.feegowToken as string;
    }
  }

  // 3. Fallback: token do .env (migracao, vai ser removido depois)
  return FALLBACK_TOKEN;
}

// Procedimentos Feegow → tipo de exame LEO
// IDs confirmados via /procedures/list em 14/04/2026
const PROC_MAP: Record<number, string> = {
  6: 'eco_tt',              // Ecocardiograma Transtorácico
  67: 'doppler_carotidas',  // Doppler colorido de vasos cervicais (carótidas e vertebrais)
  285: 'doppler_carotidas', // US Ecodoppler de carótidas (código alternativo)
};
// IDs que NÃO são exames do LEO (ignorar na importação):
// 5=ECG, 8=MAPA 24h, 9=Holter 24h, 224=Consulta Cardio, 225=Consulta Infecto, 253=Cirurgia

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

function dataLocalHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Middleware: auth + rate limit ──
async function proteger(req: NextRequest): Promise<NextResponse | null> {
  // Rate limit por IP
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ ok: false, error: 'Rate limit excedido. Tente novamente em 1 minuto.' }, { status: 429 });
  }

  // Auth: verificar token Firebase
  const uid = await verificarAuth(req);
  if (!uid) {
    return NextResponse.json({ ok: false, error: 'Nao autorizado. Token Firebase invalido ou ausente.' }, { status: 401 });
  }

  return null; // passou
}

// POST /api/feegow — atualizar status no Feegow
export async function POST(req: NextRequest) {
  // v3: protecao
  const blocked = await proteger(req);
  if (blocked) return blocked;

  // v3: resolver token do workspace
  const token = await resolverToken(req);
  if (!token) return NextResponse.json({ error: 'Token Feegow nao configurado. Va em Local de Trabalho > Integracao Feegow.' }, { status: 400 });

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

    return NextResponse.json({ error: 'action invalida' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    if (msg.includes('aborted')) return NextResponse.json({ ok: false, error: 'Timeout na comunicacao com Feegow' }, { status: 504 });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  // v3: protecao
  const blocked = await proteger(req);
  if (blocked) return blocked;

  // v3: resolver token do workspace
  const token = await resolverToken(req);
  if (!token) return NextResponse.json({ error: 'Token Feegow nao configurado. Va em Local de Trabalho > Integracao Feegow.' }, { status: 400 });

  const action = req.nextUrl.searchParams.get('action');

  try {
    switch (action) {
      case 'teste': {
        const data = await feegowFetch('/professional/list', token);
        return NextResponse.json({ ok: true, message: 'Conexao Feegow OK!', data });
      }

      case 'sala_espera': {
        const hoje = dataLocalHoje();
        const data = await feegowFetch(`/appoints/search?data_start=${hoje}&data_end=${hoje}&status_id=4`, token);
        return NextResponse.json({ ok: true, data });
      }

      case 'paciente': {
        const id = req.nextUrl.searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id obrigatorio' }, { status: 400 });
        const data = await feegowFetch(`/patient/search?paciente_id=${id}`, token);
        return NextResponse.json({ ok: true, data });
      }

      case 'convenios': {
        const data = await feegowFetch('/insurance/list', token);
        return NextResponse.json({ ok: true, data });
      }

      case 'buscar_cpf': {
        const cpf = req.nextUrl.searchParams.get('cpf');
        if (!cpf) return NextResponse.json({ error: 'cpf obrigatorio' }, { status: 400 });
        const cpfLimpo = cpf.replace(/\D/g, '');
        if (cpfLimpo.length < 11) return NextResponse.json({ error: 'CPF invalido' }, { status: 400 });
        const data = await feegowFetch(`/patient/search?paciente_cpf=${cpfLimpo}`, token);
        const pac = data?.content;
        if (!pac) return NextResponse.json({ ok: true, encontrado: false });
        let dtnasc = '';
        if (pac.nascimento) {
          const p = pac.nascimento.split('-');
          if (p.length === 3) dtnasc = `${p[2]}-${p[1]}-${p[0]}`;
        }
        return NextResponse.json({
          ok: true, encontrado: true,
          paciente: {
            nome: (pac.nome || '').toUpperCase(),
            dtnasc,
            sexo: pac.sexo === 'Masculino' ? 'M' : pac.sexo === 'Feminino' ? 'F' : '',
            cpf: (pac.documentos?.cpf || '').replace(/\D/g, '') || cpfLimpo,
            telefone: pac.telefones?.[0] || '',
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

      // DEBUG: ver dados brutos do Feegow para diagnosticar mapeamento de procedimentos
      case 'debug_sala': {
        const hoje2 = dataLocalHoje();
        const raw = await feegowFetch(`/appoints/search?data_start=${hoje2}&data_end=${hoje2}&status_id=4`, token);
        const ags = raw?.content || [];
        // Retornar só os campos relevantes de cada agendamento
        const debug = ags.map((ag: Record<string, unknown>) => ({
          agendamento_id: ag.agendamento_id,
          paciente_id: ag.paciente_id,
          procedimento_id: ag.procedimento_id,
          procedimentos: ag.procedimentos,
          compromisso: ag.compromisso,
          compromisso_id: ag.compromisso_id,
          tipo_compromisso: ag.tipo_compromisso,
          horario: ag.horario,
          // Mostrar TODAS as chaves do objeto para descobrir o campo correto
          _todas_chaves: Object.keys(ag),
        }));
        return NextResponse.json({ ok: true, total: ags.length, agendamentos: debug });
      }

      case 'importar': {
        const hoje = dataLocalHoje();

        // Resolver mapas (procedimentos e profissionais): workspace ou fallback hardcoded
        let procMap: Record<number, string> = PROC_MAP;
        const profMap: Record<number, string> = {};
        const wsId = req.nextUrl.searchParams.get('wsId');
        if (wsId) {
          const wsDoc = await dbAdmin.doc(`workspaces/${wsId}`).get();
          const wsData = wsDoc.data() || {};
          const wsProcMap = wsData.feegowProcMap as Record<string, string> | undefined;
          if (wsProcMap && Object.keys(wsProcMap).length > 0) {
            procMap = {};
            for (const [k, v] of Object.entries(wsProcMap)) {
              procMap[Number(k)] = v;
            }
          }
          const wsProfMap = wsData.feegowProfMap as Record<string, string> | undefined;
          if (wsProfMap) {
            for (const [k, v] of Object.entries(wsProfMap)) {
              profMap[Number(k)] = v;
            }
          }
        }

        const salaRes = await feegowFetch(`/appoints/search?data_start=${hoje}&data_end=${hoje}&status_id=4`, token);
        const agendamentos = salaRes?.content || [];

        const convRes = await feegowFetch('/insurance/list', token);
        const convMap: Record<number, string> = {};
        for (const c of convRes?.content || []) {
          convMap[c.convenio_id] = c.nome;
        }

        const pacientes = [];
        for (const ag of agendamentos) {
          // Pular procedimentos que não são exames do LEO
          if (!procMap[ag.procedimento_id]) continue;

          try {
            const pacRes = await feegowFetch(`/patient/search?paciente_id=${ag.paciente_id}`, token);
            const pac = pacRes?.content;
            if (pac) {
              let dtnasc = '';
              if (pac.nascimento) {
                const p = pac.nascimento.split('-');
                if (p.length === 3) dtnasc = `${p[2]}-${p[1]}-${p[0]}`;
              }
              pacientes.push({
                feegowAppointId: ag.agendamento_id,
                feegowPacienteId: ag.paciente_id,
                pacienteNome: (pac.nome || '').toUpperCase(),
                pacienteDtnasc: dtnasc,
                sexo: pac.sexo === 'Masculino' ? 'M' : pac.sexo === 'Feminino' ? 'F' : '',
                cpf: (pac.documentos?.cpf || '').replace(/\D/g, ''),
                telefone: pac.telefones?.[0] || '',
                convenio: convMap[ag.convenio_id] || '',
                convenioId: ag.convenio_id,
                tipoExame: procMap[ag.procedimento_id],
                procedimentoId: ag.procedimento_id,
                profissionalId: ag.profissional_id,
                medicoExecutor: profMap[ag.profissional_id] || '',
                horarioChegada: ag.horario ? ag.horario.slice(0, 5) : '',
                dataExame: hoje,
                origem: 'FEEGOW',
              });
            }
          } catch { /* pular paciente com erro */ }
        }

        return NextResponse.json({ ok: true, total: pacientes.length, pacientes });
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
        return NextResponse.json({ error: 'action invalida. Use: teste, sala_espera, paciente, buscar_cpf, convenios, importar, profissionais, procedimentos' }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    if (msg.includes('aborted')) return NextResponse.json({ ok: false, error: 'Timeout na comunicacao com Feegow' }, { status: 504 });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
