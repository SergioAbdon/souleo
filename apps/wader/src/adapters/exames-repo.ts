import { getDb, FieldValue } from './firebase';
import { Exame, CreateExamePayload, StatusExame } from '../types/exame';
import { Paciente } from '../types/paciente';
import { PacientesRepo } from './pacientes-repo';
import { createLogger } from '../logger';
import { CLINIC_TZ } from '../lib/clinica-tempo';

const log = createLogger({ module: 'exames-repo' });

const COLLECTION = 'exames';

/** ALREADY_EXISTS: `.create()` do Firestore falhou pq o doc já existe (colisão). */
export const jaExiste = (e: unknown): boolean =>
  (e as { code?: number })?.code === 6 || String(e).includes('ALREADY_EXISTS');

// Relógio da clínica p/ o carimbo do ACC (dd/mm/aa+hh/mm/ss/cc, cc=centésimos).
// Duplicado de src/lib/feegow-admin.ts:20-37 (mesmo motivo do cpfValido em
// agendamentos.ts): apps/wader é um pacote TS separado do web, sem import
// cross-package; a lógica tem que ficar em sincronia se o formato mudar.
function agoraBelem(): Date {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((a, x) => ({ ...a, [x.type]: x.value }), {} as Record<string, string>);
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, new Date().getMilliseconds());
}

/** ACC no formato `EX{ddmmaa}{hhmmsscc}` (16 chars), relógio de Belém. */
export function gerarAccessionNumber(agora: Date = agoraBelem()): string {
  const dd = String(agora.getDate()).padStart(2, '0');
  const mm = String(agora.getMonth() + 1).padStart(2, '0');
  const aa = String(agora.getFullYear()).slice(-2);
  const hh = String(agora.getHours()).padStart(2, '0');
  const mi = String(agora.getMinutes()).padStart(2, '0');
  const ss = String(agora.getSeconds()).padStart(2, '0');
  const cc = String(Math.floor(agora.getMilliseconds() / 10)).padStart(2, '0');
  return `EX${dd}${mm}${aa}${hh}${mi}${ss}${cc}`;
}

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
    const cpf = paciente.cpf || input.cpf || '';

    const montarDados = (acc: string) => ({
      id: exameId,
      pacienteId: paciente.id,
      pacienteNome: paciente.nome,
      ...(paciente.dtnasc ? { pacienteDtnasc: paciente.dtnasc } : {}),
      ...(paciente.sexo ? { sexo: paciente.sexo } : {}),
      acc,
      cpf,
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
    });

    // ACC + reserva no "cartório" (accIndex) nascem juntos, no mesmo batch —
    // colisão (create ALREADY_EXISTS) regenera com offset +10ms, 1 retry.
    const base = agoraBelem();
    let acc = gerarAccessionNumber(base);
    for (let tentativa = 0; ; tentativa++) {
      const batch = getDb().batch();
      batch.set(docRef, montarDados(acc));
      batch.create(getDb().doc(`workspaces/${this.wsId}/accIndex/${acc}`), {
        exameId,
        em: FieldValue.serverTimestamp(),
      });
      try {
        await batch.commit();
        break;
      } catch (err) {
        if (tentativa === 0 && jaExiste(err)) {
          acc = gerarAccessionNumber(new Date(base.getTime() + 10));
          continue;
        }
        throw err;
      }
    }

    log.info(
      {
        exameId,
        acc,
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
        acc,
        cpf,
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
   * Marca o resultado da última tentativa de escrita do `.wl` (Task 8, D1) —
   * é isso que faz o indicador "SEM MWL" da fila do LEO dizer a verdade
   * (a Task 7 matou o escritor antigo, que gravava sempre 'ok'). Silencioso
   * em erro: um `mwlStatus` desatualizado não pode derrubar o sync.
   */
  async marcarMwl(exameId: string, status: 'ok' | 'falhou', wlHash?: string): Promise<void> {
    try {
      await getDb()
        .collection('workspaces')
        .doc(this.wsId)
        .collection(COLLECTION)
        .doc(exameId)
        .update({ mwlStatus: status, ...(wlHash !== undefined ? { wlHash } : {}) });
    } catch (err) {
      log.warn({ err, exameId, status }, 'Falha ao gravar mwlStatus (segue o jogo)');
    }
  }

  /**
   * Limpa o selo `mwlStatus`/`wlHash` (Task 5) quando o `.wl` correspondente
   * é removido da pasta — evita que o exame fique com um selo "ok" mentiroso
   * apontando pra um arquivo que não existe mais.
   */
  async limparMwl(exameId: string): Promise<void> {
    try {
      await getDb()
        .collection('workspaces')
        .doc(this.wsId)
        .collection(COLLECTION)
        .doc(exameId)
        .update({ mwlStatus: FieldValue.delete(), wlHash: FieldValue.delete() });
    } catch (err) {
      log.warn({ err, exameId }, 'Falha ao limpar mwlStatus (segue o jogo)');
    }
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
    acc: data.acc,
    pacienteId: data.pacienteId,
    pacienteNome: data.pacienteNome,
    pacienteDtnasc: data.pacienteDtnasc,
    sexo: data.sexo,
    cpf: data.cpf,
    tipoExame: data.tipoExame,
    dataExame: data.dataExame,
    horarioChegada: data.horarioChegada,
    horarioAgendado: data.horarioAgendado,
    convenio: data.convenio,
    solicitante: data.solicitante,
    medicoExecutor: data.medicoExecutor,
    status: data.status,
    origem: data.origem ?? 'MANUAL',
    medicoUid: data.medicoUid ?? '',
    feegowAppointId: data.feegowAppointId,
    feegowPacienteId: data.feegowPacienteId,
    profissionalId: data.profissionalId,
    versao: data.versao ?? 1,
    criadoEm: timestampToIso(data.criadoEm),
    atualizadoEm: timestampToIso(data.atualizadoEm),
    emitidoEm: timestampToIso(data.emitidoEm),
    naoRealizadoEm: timestampToIso(data.naoRealizadoEm),
    pdfUrl: data.pdfUrl,
    mwlStatus: data.mwlStatus,
    wlHash: data.wlHash,
  };
}

function timestampToIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  const ts = value as { toDate?: () => Date };
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return undefined;
}
