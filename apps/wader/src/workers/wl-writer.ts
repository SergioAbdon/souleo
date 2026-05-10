import * as fs from 'node:fs';
import * as path from 'node:path';
// dcmjs não tem tipos oficiais robustos — importação dinâmica + ts-ignore localizado
// @ts-ignore — dcmjs não publica tipos completos
import dcmjs from 'dcmjs';
import { Exame, TIPOS_EXAME_LABEL } from '../types/exame';
import { createLogger } from '../logger';

const log = createLogger({ module: 'wl-writer' });

// SOP Class UID para Detached Patient Management — usado em arquivos .wl
// Esse é o SOP Class do OBJETO armazenado no arquivo DICOM Part 10.
// NÃO confundir com 1.2.840.10008.5.1.4.31 (que é o SOP Class do SERVICE C-FIND-Worklist).
// Conforme exemplo oficial: https://orthanc.uclouvain.be/book/plugins/worklists-plugin.html
const DETACHED_PATIENT_MGMT_SOP_CLASS_UID = '1.2.276.0.7230010.3.1.0.1';
// Explicit VR Little Endian
const TRANSFER_SYNTAX_EXPLICIT_LE = '1.2.840.10008.1.2.1';
// UID raiz arbitrário do Wader (registro local — não conflita com nada padrão)
const WADER_IMPL_CLASS_UID = '1.2.826.0.1.3680043.9.7886.1.0.1';
const WADER_IMPL_VERSION = 'WADER_001';

// Modality DICOM padrão para US
const DEFAULT_MODALITY = 'US';
// AE Title que o Vivid usa internamente — vem das memórias (project_vivid_t8_medcardio.md)
// Como esse valor pode variar por instalação, deixamos opcional na geração.
const DEFAULT_SCHEDULED_AE = 'VIVIDT8';
// Nome humano default do aparelho. Pode ser sobrescrito via wader.config.json.
const DEFAULT_STATION_NAME = 'VIVIDT8';

/**
 * Mapeia tipoExame interno do LEO pra descrição DICOM legível pro médico no Vivid.
 * Mesma lógica usada por src/app/api/orthanc/route.ts:29-34 do LEO web.
 */
const TIPO_EXAME_DICOM_DESC: Record<string, string> = {
  eco_tt: 'Ecocardiograma Transtoracico',
  doppler_carotidas: 'Doppler Carotidas',
  eco_te: 'Ecocardiograma Transesofagico',
  eco_stress: 'Ecocardiograma Stress',
};

export interface GerarWlOpts {
  /** Nome humano do aparelho (tag 0040,0010). Default: "VIVIDT8". */
  scheduledStationName?: string;
  /** Nome da clínica/local físico (tag 0040,0011). Default: "" (vazio mas presente). */
  scheduledProcedureStepLocation?: string;
}

/**
 * Gera o conteúdo DICOM Part 10 de um arquivo .wl pra um exame.
 *
 * O plugin Worklist do Orthanc lê esses arquivos da pasta configurada
 * (orthanc.json: "WorklistsDatabase") e os serve via DICOM C-FIND quando
 * o Vivid consulta a Modality Worklist (porta 4242).
 */
export function gerarWlBuffer(exame: Exame, opts: GerarWlOpts = {}): Buffer {
  const { data: dcmData } = dcmjs;
  const { DicomDict, DicomMetaDictionary } = dcmData;

  const naturalDataset = montarDataset(exame, opts);
  const denaturalized = DicomMetaDictionary.denaturalizeDataset(naturalDataset);

  const dicomDict = new DicomDict({});
  dicomDict.dict = denaturalized;

  // File Meta Information (header DICOM Part 10)
  const sopInstanceUid = DicomMetaDictionary.uid();
  const metaNatural = {
    FileMetaInformationVersion: new Uint8Array([0, 1]),
    MediaStorageSOPClassUID: DETACHED_PATIENT_MGMT_SOP_CLASS_UID,
    MediaStorageSOPInstanceUID: sopInstanceUid,
    TransferSyntaxUID: TRANSFER_SYNTAX_EXPLICIT_LE,
    ImplementationClassUID: WADER_IMPL_CLASS_UID,
    ImplementationVersionName: WADER_IMPL_VERSION,
  };
  dicomDict.meta = DicomMetaDictionary.denaturalizeDataset(metaNatural);

  const arrayBuffer = dicomDict.write();
  return Buffer.from(arrayBuffer);
}

/**
 * Monta o dataset DICOM (formato natural — keys por nome) pra um exame.
 *
 * Tags incluídas:
 *   - Patient Module: PatientName, PatientID, PatientBirthDate, PatientSex
 *   - Study Module: AccessionNumber (= exameId), StudyInstanceUID
 *   - Scheduled Procedure Step Sequence (1 item):
 *     - ScheduledStationAETitle, Date, Time
 *     - Modality (US)
 *     - ScheduledProcedureStepID (= exameId)
 *     - ScheduledProcedureStepDescription (label do procedimento)
 *
 * Valores não fornecidos vêm vazios por convenção DICOM (se a tag for
 * obrigatória, o aparelho usa string vazia).
 */
function montarDataset(exame: Exame, opts: GerarWlOpts = {}): Record<string, unknown> {
  const { data: dcmData } = dcmjs;
  const { DicomMetaDictionary } = dcmData;

  const procDesc =
    TIPO_EXAME_DICOM_DESC[exame.tipoExame] ??
    TIPOS_EXAME_LABEL[exame.tipoExame] ??
    exame.tipoExame;

  const stationName = sanitizarAscii(opts.scheduledStationName ?? DEFAULT_STATION_NAME);
  const stepLocation = sanitizarAscii(opts.scheduledProcedureStepLocation ?? '');

  const studyInstanceUid = DicomMetaDictionary.uid();

  return {
    SpecificCharacterSet: 'ISO_IR 100',
    // Patient Module
    PatientName: formatarPatientName(exame.pacienteNome),
    PatientID: sanitizarAscii(exame.pacienteId), // ID do Firestore — único e estável
    PatientBirthDate: dataIsoParaDicom(exame.pacienteDtnasc),
    PatientSex: exame.sexo ?? '',

    // Study Module
    StudyInstanceUID: studyInstanceUid,
    AccessionNumber: sanitizarAscii(exame.id), // chave que o Vivid grava no DICOM e Wader usa pra match

    // Requested Procedure Module
    RequestedProcedureID: sanitizarAscii(exame.id),
    RequestedProcedureDescription: sanitizarAscii(procDesc),
    RequestedProcedurePriority: 'MEDIUM',
    ReferringPhysicianName: sanitizarAscii(exame.solicitante ?? ''),

    // Scheduled Procedure Step Sequence (1 item — 1 exame)
    // Tags Type 2 incluídas mesmo vazias (manual Vivid T8 DCS, Tabela 9.5-2)
    ScheduledProcedureStepSequence: [
      {
        ScheduledStationAETitle: DEFAULT_SCHEDULED_AE,
        ScheduledProcedureStepStartDate: dataIsoParaDicom(exame.dataExame),
        ScheduledProcedureStepStartTime: horaHHMMParaDicom(exame.horarioChegada),
        Modality: DEFAULT_MODALITY,
        ScheduledPerformingPhysicianName: '',
        ScheduledProcedureStepDescription: sanitizarAscii(procDesc),
        ScheduledProcedureStepID: sanitizarAscii(exame.id),
        ScheduledStationName: stationName, // Type 2 (manual Vivid T8 DCS Tabela 9.5-2)
        ScheduledProcedureStepLocation: stepLocation, // Type 2 — idem
      },
    ],
  };
}

/**
 * Remove acentos/diacríticos e converte pra ASCII puro.
 * Razão: dcmjs detecta caracteres não-ASCII e força SpecificCharacterSet=ISO_IR 192 (UTF-8),
 * mas o plugin Orthanc Worklists e o Vivid T8 esperam ISO_IR 100 (Latin-1).
 * Solução: sanitizar TUDO pra ASCII antes de passar pro encoder.
 */
function sanitizarAscii(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos combinantes (acentos)
    .replace(/[^\x00-\x7F]/g, '?'); // qualquer non-ASCII residual vira "?"
}

function formatarPatientName(nome: string): string {
  const trimmed = sanitizarAscii(nome).trim();
  if (!trimmed) return '';
  // Convenção brasileira (validada pelo Dr. Sérgio em 09/05/2026):
  //   Coloca o nome completo no componente "Last Name" (primeiro componente DICOM PN)
  //   e deixa "First Name" e "Middle Name" vazios.
  //
  //   Vantagens:
  //   - Nome aparece SEMPRE na ordem natural ("SERGIO ROBERTO ABDON RODRIGUES")
  //     em qualquer aparelho, sem depender de como o aparelho monta a string
  //   - Resolve automaticamente sobrenomes compostos: "MARIA DA SILVA" → fica
  //     "MARIA DA SILVA" sem precisar heurística pra detectar "DA"
  //   - Comportamento idêntico ao que outros sistemas/clínicas usam
  //
  //   Tradeoff:
  //   - Não é o "padrão DICOM PN" estrito (que separa Family/Given/Middle por ^),
  //     mas é prática consagrada em hospitais brasileiros
  //
  //   Exemplo: "SERGIO ROBERTO ABDON RODRIGUES" → "SERGIO ROBERTO ABDON RODRIGUES"
  return trimmed;
}

function dataIsoParaDicom(iso: string | undefined): string {
  if (!iso) return '';
  // 'YYYY-MM-DD' → 'YYYYMMDD'
  return iso.replace(/-/g, '');
}

function horaHHMMParaDicom(hhmm: string): string {
  if (!hhmm) return '';
  // 'HH:MM' → 'HHMMSS' (DICOM usa segundos; preenchemos com 00)
  return hhmm.replace(':', '') + '00';
}

/**
 * Salva o `.wl` no filesystem.
 * Nome do arquivo = `{exameId}.wl` — único, fácil de rastrear/deletar.
 */
export function salvarWl(worklistPath: string, exame: Exame, opts: GerarWlOpts = {}): string {
  const buffer = gerarWlBuffer(exame, opts);
  const filename = `${exame.id}.wl`;
  const fullPath = path.join(worklistPath, filename);
  fs.writeFileSync(fullPath, buffer);
  log.info(
    {
      exameId: exame.id,
      paciente: exame.pacienteNome,
      bytes: buffer.length,
      stationName: opts.scheduledStationName,
      location: opts.scheduledProcedureStepLocation,
      path: fullPath,
    },
    'Arquivo .wl gerado',
  );
  return fullPath;
}

/**
 * Remove um `.wl` do filesystem.
 * Idempotente: ignora se arquivo já não existe.
 */
export function deletarWl(worklistPath: string, exameId: string): boolean {
  const filename = `${exameId}.wl`;
  const fullPath = path.join(worklistPath, filename);
  if (!fs.existsSync(fullPath)) return false;
  fs.unlinkSync(fullPath);
  log.info({ exameId, path: fullPath }, 'Arquivo .wl removido');
  return true;
}

/**
 * Lista os `.wl` presentes na pasta (debug/admin).
 */
export function listarWlExistentes(worklistPath: string): string[] {
  if (!fs.existsSync(worklistPath)) return [];
  return fs
    .readdirSync(worklistPath)
    .filter((f) => f.endsWith('.wl'))
    .sort();
}
