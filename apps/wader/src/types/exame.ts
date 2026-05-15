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

/**
 * Item do `medidasDicom` (schema novo 15/05/2026).
 *
 * `grupo` é o Measurement Group onde o código apareceu no SR (LA = Left
 * Atrium, LV = Left Ventricle, AO = Aortic, MV = Mitral Valve, etc).
 * Crítico pra desambiguar códigos genéricos como `M-02550` ("Diameter"),
 * que sozinho não diz qual estrutura.
 *
 * Definido também em `apps/wader/src/adapters/dicom-sr-parser.ts` — esta
 * é a "fonte da verdade" do tipo no schema do Firestore.
 */
export interface MedidaSr {
  /** Valor numérico (na unidade indicada por `unit`). */
  value: number;
  /** Unidade do SR (ex: 'cm', 'm/s', 'ml', '%', 'kg', ''). */
  unit: string;
  /** Nome legível em inglês, vindo direto do `CodeMeaning` do SR. */
  meaning: string;
  /** Grupo (estrutura anatômica) — ver `GrupoSr` no parser. */
  grupo: 'LA' | 'LV' | 'AO' | 'MV' | 'RA' | 'RV' | 'TV' | 'PV' | 'general';
}

export const TIPOS_EXAME_LABEL: Record<TipoExame, string> = {
  eco_tt: 'Ecocardiograma Transtorácico',
  doppler_carotidas: 'Doppler de Carótidas',
  eco_te: 'Ecocardiograma Transesofágico',
  eco_stress: 'Ecocardiograma Stress',
};

/**
 * Status canônico do exame (DEFINIÇÃO FECHADA com Sergio em 15/05/2026).
 * Ver memória `feedback_status_exame_canonico.md` e ADR seção 13.
 *
 * ┌────────────────┬──────────────────────────────────────────┬──────────┐
 * │ Status         │ Significado                              │ tem DICOM│
 * ├────────────────┼──────────────────────────────────────────┼──────────┤
 * │ aguardando     │ Cadastrado, esperando paciente/imagens   │ não      │
 * │ andamento      │ REALIZADO, pendente de laudo (médico age) │ sim     │
 * │ rascunho       │ Laudo iniciado, não emitido              │ sim ou não│
 * │ emitido        │ Finalizado e assinado (doc médico-legal) │ sim ou não│
 * │ nao-realizado  │ Paciente faltou (cron, sem DICOM)        │ NUNCA    │
 * └────────────────┴──────────────────────────────────────────┴──────────┘
 *
 * REGRA DE OURO: tem DICOM ⇒ FOI REALIZADO ⇒ só caminha pra frente
 * (andamento → rascunho → emitido). Nunca volta pra aguardando nem
 * vira nao-realizado.
 *
 * 3 TRAVAS:
 *  1. Cron meia-noite só marca nao-realizado quem é 'aguardando'
 *     (cleanup-worklist/route.ts já filtra status=='aguardando').
 *  2. Wader ao processar DICOM:
 *       aguardando | nao-realizado → andamento
 *       rascunho   → mantém rascunho (não regride trabalho do médico)
 *       emitido    → mantém emitido (documento legal)
 *  3. Emitido reaberto pra editar mas não reemitido → continua emitido
 *     (Leo avisa ao sair — Opção A).
 *
 * LEGADOS REMOVIDOS (15/05): 'imagens-recebidas', 'erro-imagens'.
 * Não usar nunca mais. Exames antigos com esses valores foram migrados
 * pra 'andamento'.
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

  /**
   * Medidas estruturadas extraídas do DICOM SR pelo Wader.
   *
   * Schema NOVO (15/05/2026 — após descoberta da lógica de contexto do
   * Vivid T8). Chave = `{grupo}_{codeValue}`, ex: `LA_M-02550`, `LV_29436-3`.
   * Valor = `{ value, unit, meaning, grupo }`.
   *
   * Por que mudou: o schema antigo (`Record<string, number>`) era ambíguo
   * pra códigos genéricos como `M-02550` ("Diameter"), que aparece em
   * vários grupos do SR (LA, AO, LV...). Sem saber o grupo, não dá pra
   * mapear pro campo certo do motor. Detalhes em
   * `feedback_dicom_sr_vivid_logica.md` (memória local).
   *
   * Schema ANTIGO (`Record<string, number>`) ainda existe em exames
   * processados antes de 15/05. O Leo client lida com os 2 schemas — vê
   * `isSchemaNovo()` em `src/lib/dicom-sr-mapping.ts`.
   *
   * Vazio/undefined quando o estudo não tem série SR (US vascular
   * básico não gera SR padrão).
   */
  medidasDicom?: Record<string, MedidaSr | number>;

  /** Metadata da extração SR (debug/audit). */
  medidasDicomMeta?: {
    /** Instance ID Orthanc do SR processado. */
    srInstanceId: string | null;
    /** Método usado pra extrair: padrão ('content-sequence'), legado ou nenhum SR. */
    metodoFallback: 'content-sequence' | 'tags-diretas' | 'sem-sr';
    /** Quando o Wader processou. */
    processadoEm: string; // ISO timestamp
  };

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
