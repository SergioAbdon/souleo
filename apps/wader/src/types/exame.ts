/**
 * Tipos do Exame alinhados com o schema do LEO web.
 *
 * Coleção: `workspaces/{wsId}/exames/{id}`
 *
 * Convenções (espelhadas do LEO):
 *   - ID gerado pelo Firestore (UUID), também usado como AccessionNumber
 *   - Nome do paciente desnormalizado no exame (cópia do paciente)
 *   - Datas em ISO 8601 (YYYY-MM-DD)
 *   - Horários em HH:MM
 */

/**
 * Tipos de procedimento conforme convenção do LEO.
 * Lista dinâmica vem de `workspace.feegowProcMap` — esses são os valores
 * possíveis que aparecem como VALOR (não chave) naquele mapa.
 */
export type TipoExame = 'eco_tt' | 'doppler_carotidas' | 'eco_te' | 'eco_stress';

export const TIPOS_EXAME_LABEL: Record<TipoExame, string> = {
  eco_tt: 'Ecocardiograma Transtorácico',
  doppler_carotidas: 'Doppler de Carótidas',
  eco_te: 'Ecocardiograma Transesofágico',
  eco_stress: 'Ecocardiograma Stress',
};

/**
 * Status conforme observado em src/components/Worklist.tsx do LEO.
 * Wader cria exames com status='aguardando' (default Worklist).
 */
export type StatusExame = 'aguardando' | 'andamento' | 'rascunho' | 'emitido';

/**
 * Origem do exame.
 *   - MANUAL: cadastrado via Worklist do LEO web ou UI manual do Wader
 *   - FEEGOW: importado da agenda Feegow
 */
export type OrigemExame = 'MANUAL' | 'FEEGOW';

export interface Exame {
  /** ID gerado pelo Firestore. Também é o AccessionNumber DICOM. */
  id: string;

  /** FK para `workspaces/{wsId}/pacientes/{id}`. */
  pacienteId: string;

  // Dados desnormalizados do paciente (cópia, conforme padrão LEO):
  pacienteNome: string;
  pacienteDtnasc?: string;
  sexo?: 'M' | 'F' | '';

  /** Tipo do procedimento. Valores conforme `workspace.feegowProcMap`. */
  tipoExame: TipoExame;

  /** Data do exame (ISO YYYY-MM-DD). */
  dataExame: string;
  /** Horário de chegada/início (HH:MM). Filtro principal da Worklist. */
  horarioChegada: string;
  /** Horário agendado original (HH:MM). Pode diferir de horarioChegada. */
  horarioAgendado?: string;

  convenio?: string;
  solicitante?: string;

  status: StatusExame;
  origem: OrigemExame;

  /** UID do médico que criou (autenticação Firebase). Obrigatório no LEO. */
  medicoUid: string;

  // Campos de integração externa
  feegowAppointId?: string;
  feegowPacienteId?: string;

  versao: number;

  // Timestamps
  criadoEm?: string;
  atualizadoEm?: string;
  emitidoEm?: string;

  // Após emissão
  pdfUrl?: string;
}

/**
 * Payload de criação manual via UI do Wader.
 * Wader resolve pacienteId automaticamente (busca por CPF ou cria).
 */
export interface CreateExamePayload {
  // Paciente:
  cpf: string;
  nomePaciente: string;
  dtnasc?: string;
  sexo?: 'M' | 'F' | '';
  telefone?: string;
  convenio?: string;

  // Exame:
  tipoExame: TipoExame;
  dataExame: string;
  horarioChegada: string;
  solicitante?: string;
}
