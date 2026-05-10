import { getDb, FieldValue } from './firebase';
import { Paciente, CreatePacientePayload } from '../types/paciente';
import { createLogger } from '../logger';

const log = createLogger({ module: 'pacientes-repo' });

const COLLECTION = 'pacientes';

/**
 * Repositório de pacientes alinhado com schema do LEO web.
 * Coleção: `workspaces/{wsId}/pacientes/{id}`
 *
 * Convenções LEO:
 *   - ID gerado pelo Firestore (UUID auto)
 *   - Nome SEMPRE em UPPERCASE
 *   - CPF SEMPRE em dígitos puros (11 chars)
 *   - Busca por CPF retorna o primeiro encontrado
 */
export class PacientesRepo {
  constructor(private readonly wsId: string) {}

  /**
   * Busca paciente existente por CPF.
   * Retorna null se não encontrado.
   */
  async buscarPorCpf(cpf: string): Promise<Paciente | null> {
    const cpfNormalizado = normalizarCpf(cpf);

    const snapshot = await getDb()
      .collection('workspaces')
      .doc(this.wsId)
      .collection(COLLECTION)
      .where('cpf', '==', cpfNormalizado)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return docToPaciente(doc.id, doc.data());
  }

  /**
   * Cria paciente novo no Firestore.
   * Aplica normalização (UPPERCASE no nome, dígitos no CPF).
   */
  async criar(payload: CreatePacientePayload): Promise<Paciente> {
    const cpfNormalizado = normalizarCpf(payload.cpf);
    const nomeNormalizado = payload.nome.trim().toUpperCase();

    const collectionRef = getDb()
      .collection('workspaces')
      .doc(this.wsId)
      .collection(COLLECTION);

    const docRef = collectionRef.doc(); // Firestore gera ID

    const dadosFirestore = {
      id: docRef.id,
      nome: nomeNormalizado,
      cpf: cpfNormalizado,
      ...(payload.dtnasc ? { dtnasc: payload.dtnasc } : {}),
      ...(payload.sexo ? { sexo: payload.sexo } : {}),
      ...(payload.telefone ? { telefone: payload.telefone } : {}),
      ...(payload.convenio ? { convenio: payload.convenio } : {}),
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    };

    await docRef.set(dadosFirestore);

    log.info({ pacienteId: docRef.id, cpf: cpfNormalizado, nome: nomeNormalizado }, 'Paciente criado');

    return {
      id: docRef.id,
      nome: nomeNormalizado,
      cpf: cpfNormalizado,
      dtnasc: payload.dtnasc,
      sexo: payload.sexo,
      telefone: payload.telefone,
      convenio: payload.convenio,
    };
  }

  /**
   * Busca por CPF; se não encontrar, cria novo paciente.
   * Retorna o paciente (existente ou recém-criado).
   */
  async buscarOuCriar(payload: CreatePacientePayload): Promise<{ paciente: Paciente; criado: boolean }> {
    const existente = await this.buscarPorCpf(payload.cpf);
    if (existente) {
      log.debug({ pacienteId: existente.id, cpf: existente.cpf }, 'Paciente já existe, reusando');
      return { paciente: existente, criado: false };
    }
    const novo = await this.criar(payload);
    return { paciente: novo, criado: true };
  }
}

function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

function docToPaciente(id: string, data: FirebaseFirestore.DocumentData): Paciente {
  return {
    id,
    nome: data.nome ?? '',
    cpf: data.cpf ?? '',
    dtnasc: data.dtnasc,
    sexo: data.sexo,
    telefone: data.telefone,
    convenio: data.convenio,
    criadoEm: timestampToIso(data.criadoEm),
    atualizadoEm: timestampToIso(data.atualizadoEm),
  };
}

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  const ts = value as { toDate?: () => Date };
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return undefined;
}
