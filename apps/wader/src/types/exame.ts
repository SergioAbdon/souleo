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
 *
 * 'nao-realizado' — adicionado em 09/05/2026. Setado pelo cron do LEO
 * (00:00 BRT) em exames com `dataExame < hoje` E `status='aguardando'`.
 * Wader detecta a transição e remove o `.wl` correspondente.
 */
export type StatusExame = 'aguardando' | 'andamento' | 'rascunho' | 'emitido' | 'nao-realizado';

/**
 * Origem do exame.
 *   - MANUAL: cadastrado via Worklist do LEO web ou UI manual do Wader
 *   - FEEGOW: importado da agenda Feegow
 */
export type OrigemExame = 'MANUAL' | 'FEEGOW';

export interface Exame {
  /** ID gerado pelo Firestore. */
  id: string;

  /**
   * AccessionNumber DICOM gerado pelo LEO web no formato `EX{ddmmaa}{hhmmsscc}`
   * (16 chars exatos, dentro do limite DICOM SH). Adicionado em 09/05/2026.
   * Fallback pro `id` quando ausente (compatibilidade com exames antigos).
   * Esta é a chave do match Vivid → Orthanc → Wader → LEO.
   */
  acc?: string;

  /** FK para `workspaces/{wsId}/pacientes/{id}`. */
  pacienteId: string;

  // Dados desnormalizados do paciente (cópia, conforme padrão LEO):
  pacienteNome: string;
  pacienteDtnasc?: string;
  sexo?: 'M' | 'F' | 'O' | '';

  /** CPF do paciente (sem pontos/traços). 1ª escolha pra PatientID DICOM. */
  cpf?: string;

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

  /**
   * Nome do médico "dono da agenda" (responsável pela execução do exame).
   * Vai pro DICOM tag #19 ScheduledPerformingPhysicianName.
   * Vem do Feegow via `feegowProfMap[profissional_id]` ou do user logado em cadastro manual.
   */
  medicoExecutor?: string;

  status: StatusExame;
  origem: OrigemExame;

  /** UID do médico que criou (autenticação Firebase). Obrigatório no LEO. */
  medicoUid: string;

  // Campos de integração externa
  feegowAppointId?: string;
  feegowPacienteId?: string;
  /** Profissional Feegow do agendamento (numérico). Resolve pra medicoExecutor. */
  profissionalId?: number;

  versao: number;

  // Timestamps
  criadoEm?: string;
  atualizadoEm?: string;
  emitidoEm?: string;
  /** Quando virou 'nao-realizado' (cron à meia-noite). */
  naoRealizadoEm?: string;

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
