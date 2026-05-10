import { FastifyInstance } from 'fastify';
import { ExamesRepo } from '../../adapters/exames-repo';
import { PacientesRepo } from '../../adapters/pacientes-repo';
import { CreateExamePayload, TIPOS_EXAME_LABEL, TipoExame } from '../../types/exame';
import { createLogger } from '../../logger';
import { WaderConfig } from '../../config/types';

const log = createLogger({ module: 'api-agendamentos' });

const TIPOS_VALIDOS = Object.keys(TIPOS_EXAME_LABEL) as TipoExame[];

/**
 * Registra rotas de agendamento (cadastro manual).
 *
 *   POST /api/agendamentos        — cria paciente (se necessário) + exame
 *   GET  /api/agendamentos?data=  — lista exames do dia
 */
export function registerAgendamentosRoutes(app: FastifyInstance, config: WaderConfig): void {
  const examesRepo = new ExamesRepo(config.wsId);
  const pacientesRepo = new PacientesRepo(config.wsId);

  app.post<{ Body: Partial<CreateExamePayload> }>('/api/agendamentos', async (req, reply) => {
    const errors = validate(req.body);
    if (errors.length > 0) {
      return reply.status(400).send({ ok: false, errors });
    }

    const payload = req.body as CreateExamePayload;
    try {
      const { exame, paciente, pacienteCriado } = await examesRepo.criarManual(payload);
      return reply.status(201).send({
        ok: true,
        exame,
        paciente: { id: paciente.id, nome: paciente.nome, cpf: paciente.cpf },
        pacienteCriado,
      });
    } catch (err) {
      log.error({ err }, 'Falha ao criar agendamento');
      return reply.status(500).send({ ok: false, error: 'erro_firestore', message: (err as Error).message });
    }
  });

  app.get<{ Querystring: { data?: string } }>('/api/agendamentos', async (req, reply) => {
    const data = req.query.data ?? hojeIso();
    if (!isIsoDate(data)) {
      return reply.status(400).send({ ok: false, error: 'invalid_date', message: 'data deve ser YYYY-MM-DD' });
    }

    try {
      const exames = await examesRepo.listarDoDia(data);
      return reply.send({ ok: true, data, total: exames.length, exames });
    } catch (err) {
      log.error({ err, data }, 'Falha ao listar agendamentos');
      return reply.status(500).send({ ok: false, error: 'erro_firestore', message: (err as Error).message });
    }
  });

  // Auto-complete: buscar paciente por CPF
  app.get<{ Querystring: { cpf?: string } }>('/api/pacientes/buscar', async (req, reply) => {
    const cpf = (req.query.cpf ?? '').replace(/\D/g, '');
    if (cpf.length !== 11) {
      return reply.status(400).send({ ok: false, error: 'invalid_cpf', message: 'CPF deve ter 11 dígitos' });
    }

    try {
      const paciente = await pacientesRepo.buscarPorCpf(cpf);
      if (!paciente) {
        return reply.send({ ok: true, encontrado: false });
      }
      return reply.send({ ok: true, encontrado: true, paciente });
    } catch (err) {
      log.error({ err, cpf }, 'Falha ao buscar paciente');
      return reply.status(500).send({ ok: false, error: 'erro_firestore', message: (err as Error).message });
    }
  });
}

function validate(body: Partial<CreateExamePayload> | undefined): string[] {
  const errors: string[] = [];
  if (!body) return ['body ausente'];

  if (!body.nomePaciente || body.nomePaciente.trim().length < 3) {
    errors.push('nomePaciente: mínimo 3 caracteres');
  }
  if (!body.cpf || !isValidCpf(body.cpf)) {
    errors.push('cpf: 11 dígitos válidos');
  }
  if (!body.dataExame || !isIsoDate(body.dataExame)) {
    errors.push('dataExame: formato YYYY-MM-DD');
  }
  if (!body.tipoExame || !TIPOS_VALIDOS.includes(body.tipoExame)) {
    errors.push(`tipoExame: deve ser um de ${TIPOS_VALIDOS.join(', ')}`);
  }
  if (!body.horarioChegada || !isHHMM(body.horarioChegada)) {
    errors.push('horarioChegada: formato HH:MM');
  }
  if (body.dtnasc && !isIsoDate(body.dtnasc)) {
    errors.push('dtnasc: formato YYYY-MM-DD (ou omitir)');
  }
  if (body.sexo && !['M', 'F', ''].includes(body.sexo)) {
    errors.push('sexo: M, F ou vazio');
  }
  return errors;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function isHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += parseInt(digits[i], 10) * (t + 1 - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== parseInt(digits[t], 10)) return false;
  }
  return true;
}
