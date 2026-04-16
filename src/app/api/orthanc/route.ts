// ══════════════════════════════════════════════════════════════════
// SOULEO · API Route — Orthanc (servidor DICOM)
// Proxy seguro para comunicação com Orthanc REST API
// Etapa 1: teste de conexão
// Etapa 3: criar MWL (worklist para Vivid T8), listar estudos
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// ── Firebase Admin ──
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

const TIMEOUT_MS = 5000; // 5s timeout (Orthanc é local, deve ser rápido)

// Mapeamento tipoExame LEO → descrição DICOM
const EXAM_DICOM_MAP: Record<string, string> = {
  'eco_tt': 'Ecocardiograma Transtoracico',
  'doppler_carotidas': 'Doppler Carotidas',
  'eco_te': 'Ecocardiograma Transesofagico',
  'eco_stress': 'Ecocardiograma Stress',
};

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

// ── Resolver URL do Orthanc (header ou workspace) ──
async function resolverUrl(req: NextRequest): Promise<string | null> {
  // 1. Header X-Orthanc-Url (usado no teste de conexao do LocalModal)
  const headerUrl = req.headers.get('x-orthanc-url');
  if (headerUrl) return headerUrl.replace(/\/+$/, ''); // remover trailing slash

  // 2. Buscar do workspace via query param wsId
  const wsId = req.nextUrl.searchParams.get('wsId');
  if (wsId) {
    const wsDoc = await dbAdmin.doc(`workspaces/${wsId}`).get();
    const data = wsDoc.data();
    if (data?.ortancAtivo && data?.ortancUrl) {
      return (data.ortancUrl as string).replace(/\/+$/, '');
    }
  }

  return null;
}

// ── Fetch genérico ao Orthanc ──
async function orthancFetch(baseUrl: string, endpoint: string, options?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) throw new Error(`Orthanc ${res.status}: ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ── POST: criar MWL (worklist para Vivid T8) ──
export async function POST(req: NextRequest) {
  const uid = await verificarAuth(req);
  if (!uid) {
    return NextResponse.json({ ok: false, error: 'Nao autorizado.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'criar_mwl') {
      const { wsId, exameId, pacienteNome, pacienteId, pacienteDtnasc, sexo, tipoExame, dataExame, horarioChegada, medicoNome } = body;

      if (!exameId || !pacienteNome) {
        return NextResponse.json({ ok: false, error: 'exameId e pacienteNome obrigatorios' }, { status: 400 });
      }

      // Resolver URL do Orthanc via wsId
      let ortancUrl: string | null = null;
      if (wsId) {
        const wsDoc = await dbAdmin.doc(`workspaces/${wsId}`).get();
        const data = wsDoc.data();
        if (data?.ortancAtivo && data?.ortancUrl) {
          ortancUrl = (data.ortancUrl as string).replace(/\/+$/, '');
        }
      }

      if (!ortancUrl) {
        return NextResponse.json({ ok: false, error: 'orthanc_offline', message: 'Orthanc nao configurado ou desativado.' });
      }

      // Formatar datas para DICOM (YYYYMMDD, HHMM)
      const dicomDate = dataExame ? dataExame.replace(/-/g, '') : '';
      const dicomTime = horarioChegada ? horarioChegada.replace(':', '') + '00' : '';
      const dicomBirthDate = pacienteDtnasc ? pacienteDtnasc.replace(/-/g, '') : '';
      const studyDescription = EXAM_DICOM_MAP[tipoExame] || tipoExame || 'Echocardiogram';

      // Criar DICOM instance via Orthanc REST API
      const dicomTags: Record<string, string> = {
        // Patient tags
        'PatientName': pacienteNome || '',
        'PatientID': pacienteId || exameId,
        'PatientBirthDate': dicomBirthDate,
        'PatientSex': sexo === 'M' ? 'M' : sexo === 'F' ? 'F' : 'O',
        // Study tags
        'AccessionNumber': exameId,
        'StudyDescription': studyDescription,
        'Modality': 'US',
        'ReferringPhysicianName': medicoNome || '',
        // Scheduled Procedure Step
        'ScheduledProcedureStepStartDate': dicomDate,
        'ScheduledProcedureStepStartTime': dicomTime,
      };

      const result = await orthancFetch(ortancUrl, '/tools/create-dicom', {
        method: 'POST',
        body: JSON.stringify({
          Tags: dicomTags,
          Content: 'data:application/octet-stream;base64,AA==', // minimal content
        }),
      });

      return NextResponse.json({
        ok: true,
        orthancId: result?.ID || result?.id || null,
        accessionNumber: exameId,
        message: 'Worklist criada no Orthanc',
      });
    }

    return NextResponse.json({ ok: false, error: 'action invalida. Use: criar_mwl' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    if (msg.includes('aborted') || msg.includes('abort') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return NextResponse.json({ ok: false, error: 'orthanc_offline', message: 'Orthanc nao respondeu.' });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

// ── GET: teste, listar estudos ──
export async function GET(req: NextRequest) {
  // Auth
  const uid = await verificarAuth(req);
  if (!uid) {
    return NextResponse.json({ ok: false, error: 'Nao autorizado.' }, { status: 401 });
  }

  const action = req.nextUrl.searchParams.get('action');

  // Resolver URL do Orthanc
  const ortancUrl = await resolverUrl(req);
  if (!ortancUrl) {
    return NextResponse.json({ ok: false, error: 'URL do Orthanc nao configurada.' }, { status: 400 });
  }

  try {
    switch (action) {
      // Testar conexão — GET /system retorna versão e nome do Orthanc
      case 'teste': {
        const data = await orthancFetch(ortancUrl, '/system');
        return NextResponse.json({
          ok: true,
          message: 'Orthanc conectado!',
          version: data.Version || data.version || '?',
          name: data.Name || data.name || 'Orthanc',
        });
      }

      // Listar estudos no Orthanc (para sincronização)
      case 'listar_estudos': {
        const data = req.nextUrl.searchParams.get('data'); // YYYYMMDD ou YYYY-MM-DD
        const studies = await orthancFetch(ortancUrl, '/studies?expand&since=0&limit=100');
        // Filtrar por data se fornecida e mapear campos relevantes
        const dataFiltro = data ? data.replace(/-/g, '') : null;
        const resultado = (studies || [])
          .filter((s: Record<string, unknown>) => {
            if (!dataFiltro) return true;
            const mt = s.MainDicomTags as Record<string, string> | undefined;
            return mt?.StudyDate === dataFiltro;
          })
          .map((s: Record<string, unknown>) => {
            const mt = s.MainDicomTags as Record<string, string>;
            const pt = (s.PatientMainDicomTags as Record<string, string>) || {};
            return {
              orthancId: s.ID,
              pacienteNome: pt.PatientName || '',
              pacienteId: pt.PatientID || '',
              accessionNumber: mt?.AccessionNumber || '',
              studyDate: mt?.StudyDate || '',
              studyDescription: mt?.StudyDescription || '',
              modality: mt?.ModalitiesInStudy || '',
            };
          });
        return NextResponse.json({ ok: true, total: resultado.length, estudos: resultado });
      }

      // Futuro: Etapa 5 — buscar DICOM SR por Accession Number
      // case 'buscar_sr': { ... }

      default:
        return NextResponse.json({ ok: false, error: 'action invalida. Use: teste, listar_estudos' }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    if (msg.includes('aborted') || msg.includes('abort')) {
      return NextResponse.json({ ok: false, error: 'Timeout — Orthanc nao respondeu em 5s. Verifique IP e porta.' }, { status: 504 });
    }
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return NextResponse.json({ ok: false, error: 'Conexao recusada — Orthanc nao encontrado nesse endereco.' }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
