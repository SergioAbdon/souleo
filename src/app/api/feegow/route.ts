// ══════════════════════════════════════════════════════════════════
// SOULEO · API Route — Feegow proxy seguro
// Token fica no servidor (env), nunca exposto ao browser
// ══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';

const FEEGOW_BASE = 'https://api.feegow.com/v1/api';
const TOKEN = process.env.FEEGOW_API_TOKEN || '';

// Procedimentos Feegow → tipo de exame LEO
const PROC_MAP: Record<number, string> = {
  6: 'eco_tt',              // ECOCARDIOGRAMA TRANSTORÁCICO
  9: 'eco_tt',              // Eco TT (ID alternativo)
  285: 'doppler_carotidas', // US ECODOPPLER DE CARÓTIDAS
  8: 'doppler_carotidas',   // Doppler Carótidas (ID alternativo)
};

async function feegowFetch(endpoint: string) {
  const res = await fetch(`${FEEGOW_BASE}${endpoint}`, {
    headers: { 'x-access-token': TOKEN, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Feegow ${res.status}: ${res.statusText}`);
  return res.json();
}

function dataLocalHoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// POST /api/feegow — atualizar status no Feegow
export async function POST(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json({ error: 'FEEGOW_API_TOKEN não configurado' }, { status: 500 });
  }

  try {
    const body = await req.json();

    if (body.action === 'atualizar_status') {
      const { agendamento_id, status_id } = body;
      if (!agendamento_id || !status_id) {
        return NextResponse.json({ error: 'agendamento_id e status_id obrigatórios' }, { status: 400 });
      }

      const res = await fetch(`${FEEGOW_BASE}/appoints/statusUpdate`, {
        method: 'POST',
        headers: { 'x-access-token': TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ AgendamentoID: agendamento_id, StatusID: status_id }),
      });
      const data = await res.json();
      return NextResponse.json({ ok: true, data });
    }

    return NextResponse.json({ error: 'action inválida' }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json({ error: 'FEEGOW_API_TOKEN não configurado' }, { status: 500 });
  }

  const action = req.nextUrl.searchParams.get('action');

  try {
    switch (action) {
      case 'teste': {
        const data = await feegowFetch('/professional/list');
        return NextResponse.json({ ok: true, message: 'Conexão Feegow OK!', data });
      }

      case 'sala_espera': {
        const hoje = dataLocalHoje();
        const data = await feegowFetch(`/appoints/search?data_start=${hoje}&data_end=${hoje}&status_id=4`);
        return NextResponse.json({ ok: true, data });
      }

      case 'paciente': {
        const id = req.nextUrl.searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
        const data = await feegowFetch(`/patient/search?paciente_id=${id}`);
        return NextResponse.json({ ok: true, data });
      }

      case 'convenios': {
        const data = await feegowFetch('/insurance/list');
        return NextResponse.json({ ok: true, data });
      }

      case 'importar': {
        // Busca sala de espera + dados completos de cada paciente
        const hoje = dataLocalHoje();
        const salaRes = await feegowFetch(`/appoints/search?data_start=${hoje}&data_end=${hoje}&status_id=4`);
        const agendamentos = salaRes?.content || [];

        // Buscar convênios para resolver nomes
        const convRes = await feegowFetch('/insurance/list');
        const convMap: Record<number, string> = {};
        for (const c of convRes?.content || []) {
          convMap[c.convenio_id] = c.nome;
        }

        // Buscar dados de cada paciente
        const pacientes = [];
        for (const ag of agendamentos) {
          try {
            const pacRes = await feegowFetch(`/patient/search?paciente_id=${ag.paciente_id}`);
            const pac = pacRes?.content;
            if (pac) {
              // Converter nascimento DD-MM-YYYY → YYYY-MM-DD
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
        return NextResponse.json({ error: 'action inválida. Use: teste, sala_espera, paciente, convenios, importar' }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
