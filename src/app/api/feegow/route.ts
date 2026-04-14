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
const PROC_MAP: Record<number, string> = {
  6: 'eco_tt',              // ECOCARDIOGRAMA TRANSTORÁCICO
  9: 'eco_tt',              // Eco TT (ID alternativo)
  285: 'doppler_carotidas', // US ECODOPPLER DE CARÓTIDAS
  8: 'doppler_carotidas',   // Doppler Carótidas (ID alternativo)
};

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

      case 'importar': {
        const hoje = dataLocalHoje();
        const salaRes = await feegowFetch(`/appoints/search?data_start=${hoje}&data_end=${hoje}&status_id=4`, token);
        const agendamentos = salaRes?.content || [];

        const convRes = await feegowFetch('/insurance/list', token);
        const convMap: Record<number, string> = {};
        for (const c of convRes?.content || []) {
          convMap[c.convenio_id] = c.nome;
        }

        const pacientes = [];
        for (const ag of agendamentos) {
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
                cpf: (pac.documento || '').replace(/\D/g, ''),
                telefone: pac.telefones?.[0] || '',
                convenio: convMap[ag.convenio_id] || '',
                convenioId: ag.convenio_id,
                tipoExame: PROC_MAP[ag.procedimento_id] || 'eco_tt',
                procedimentoId: ag.procedimento_id,
                horarioChegada: ag.horario ? ag.horario.slice(0, 5) : '',
                dataExame: hoje,
                origem: 'FEEGOW',
              });
            }
          } catch { /* pular paciente com erro */ }
        }

        return NextResponse.json({ ok: true, total: pacientes.length, pacientes });
      }

      default:
        return NextResponse.json({ error: 'action invalida. Use: teste, sala_espera, paciente, buscar_cpf, convenios, importar' }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    if (msg.includes('aborted')) return NextResponse.json({ ok: false, error: 'Timeout na comunicacao com Feegow' }, { status: 504 });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
