import { getDb, FieldValue } from './firebase';
import { Exame, CreateExamePayload, StatusExame } from '../types/exame';
import { Paciente } from '../types/paciente';
import { PacientesRepo } from './pacientes-repo';
import { createLogger } from '../logger';

const log = createLogger({ module: 'exames-repo' });

const COLLECTION = 'exames';

/**
 * Repositório de exames alinhado com schema do LEO web.
 * Coleção: `workspaces/{wsId}/exames/{id}`
 *
 * Convenções LEO:
 *   - ID gerado pelo Firestore — também serve como AccessionNumber DICOM
 *   - Dados do paciente desnormalizados no exame (cópia)
 *   - Vínculo via `pacienteId` (FK pra pacientes/{id})
 *   - Status inicial: `aguardando`
 *   - Origem: `MANUAL` (Wader) ou `FEEGOW` (importação)
 *   - `medicoUid` obrigatório (Wader usa AGENT_UID enquanto não tem auth de médico no agent)
 *
 * Quando há internet:
 *   1. Recepcionista digita CPF
 *   2. Wader busca paciente por CPF (PacientesRepo)
 *   3. Se não existe, cria
 *   4. Cria exame vinculado ao pacienteId
 */
const AGENT_UID = 'wader-agent';

export interface CriarExameInput extends CreateExamePayload {
  /** UID do médico ou identificador do agente. Default: AGENT_UID. */
  medicoUid?: string;
}

export interface CriarExameResult {
  exame: Exame;
  paciente: Paciente;
  pacienteCriado: boolean;
}

export class ExamesRepo {
  constructor(
    private readonly wsId: string,
    private readonly pacientesRepo: PacientesRepo = new PacientesRepo(wsId),
  ) {}

  /**
   * Cria exame novo (cadastro manual).
   * Resolve paciente automaticamente: busca por CPF ou cria novo.
   */
  async criarManual(input: CriarExameInput): Promise<CriarExameResult> {
    const { paciente, criado: pacienteCriado } = await this.pacientesRepo.buscarOuCriar({
      nome: input.nomePaciente,
      cpf: input.cpf,
      dtnasc: input.dtnasc,
      sexo: input.sexo,
      telefone: input.telefone,
      convenio: input.convenio,
    });

    const collectionRef = getDb()
      .collection('workspaces')
      .doc(this.wsId)
      .collection(COLLECTION);

    const docRef = collectionRef.doc();
    const exameId = docRef.id;

    const dadosFirestore = {
      id: exameId,
      pacienteId: paciente.id,
      pacienteNome: paciente.nome,
      ...(paciente.dtnasc ? { pacienteDtnasc: paciente.dtnasc } : {}),
      ...(paciente.sexo ? { sexo: paciente.sexo } : {}),
      tipoExame: input.tipoExame,
      dataExame: input.dataExame,
      horarioChegada: input.horarioChegada,
      ...(input.solicitante ? { solicitante: input.solicitante } : {}),
      ...(input.convenio ? { convenio: input.convenio } : {}),
      status: 'aguardando' as StatusExame,
      origem: 'MANUAL' as const,
      medicoUid: input.medicoUid ?? AGENT_UID,
      versao: 1,
      criadoEm: FieldValue.serverTimestamp(),
      atualizadoEm: FieldValue.serverTimestamp(),
    };

    await docRef.set(dadosFirestore);

    log.info(
      {
        exameId,
        pacienteId: paciente.id,
        tipoExame: input.tipoExame,
        dataExame: input.dataExame,
        horarioChegada: input.horarioChegada,
      },
      'Exame criado',
    );

    return {
      exame: {
        id: exameId,
        pacienteId: paciente.id,
        pacienteNome: paciente.nome,
        pacienteDtnasc: paciente.dtnasc,
        sexo: paciente.sexo,
        tipoExame: input.tipoExame,
        dataExame: input.dataExame,
        horarioChegada: input.horarioChegada,
        solicitante: input.solicitante,
        convenio: input.convenio,
        status: 'aguardando',
        origem: 'MANUAL',
        medicoUid: input.medicoUid ?? AGENT_UID,
        versao: 1,
      },
      paciente,
      pacienteCriado,
    };
  }

  /**
   * Lista exames do dia para o workspace, ordenados por horário de chegada.
   * Usa o índice composto (dataExame + horarioChegada) já existente.
   */
  async listarDoDia(dataExame: string): Promise<Exame[]> {
    const snapshot = await getDb()
      .collection('workspaces')
      .doc(this.wsId)
      .collection(COLLECTION)
      .where('dataExame', '==', dataExame)
      .orderBy('horarioChegada', 'asc')
      .get();

    const exames: Exame[] = [];
    snapshot.forEach((doc) => {
      exames.push(docToExame(doc.id, doc.data()));
    });
    return exames;
  }
}

function docToExame(id: string, data: FirebaseFirestore.DocumentData): Exame {
  return {
    id,
    pacienteId: data.pacienteId,
    pacienteNome: data.pacienteNome,
    pacienteDtnasc: data.pacienteDtnasc,
    sexo: data.sexo,
    tipoExame: data.tipoExame,
    dataExame: data.dataExame,
    horarioChegada: data.horarioChegada,
    horarioAgendado: data.horarioAgendado,
    convenio: data.convenio,
    solicitante: data.solicitante,
    status: data.status,
    origem: data.origem ?? 'MANUAL',
    medicoUid: data.medicoUid ?? '',
    feegowAppointId: data.feegowAppointId,
    feegowPacienteId: data.feegowPacienteId,
    versao: data.versao ?? 1,
    criadoEm: timestampToIso(data.criadoEm),
    atualizadoEm: timestampToIso(data.atualizadoEm),
    emitidoEm: timestampToIso(data.emitidoEm),
    pdfUrl: data.pdfUrl,
  };
}

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  const ts = value as { toDate?: () => Date };
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return undefined;
}
