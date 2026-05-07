import * as fs from 'node:fs';
import * as path from 'node:path';
// dcmjs não tem tipos oficiais robustos — importação dinâmica + ts-ignore localizado
// @ts-ignore — dcmjs não publica tipos completos
import dcmjs from 'dcmjs';
import { Exame, TIPOS_EXAME_LABEL } from '../types/exame';
import { createLogger } from '../logger';

const log = createLogger({ module: 'wl-writer' });

// SOP Class UID para Modality Worklist Information Model — FIND
const MWL_SOP_CLASS_UID = '1.2.840.10008.5.1.4.31';
// Implicit VR Little Endian (default DICOM)
const TRANSFER_SYNTAX_IMPLICIT_LE = '1.2.840.10008.1.2';
// UID raiz arbitrário do Wader (registro local — não conflita com nada padrão)
const WADER_IMPL_CLASS_UID = '1.2.826.0.1.3680043.9.7886.1.0.1';
const WADER_IMPL_VERSION = 'WADER_001';

// Modality DICOM padrão para US
const DEFAULT_MODALITY = 'US';
// AE Title que o Vivid usa internamente — vem das memórias (project_vivid_t8_medcardio.md)
// Como esse valor pode variar por instalação, deixamos opcional na geração.
const DEFAULT_SCHEDULED_AE = 'VIVIDT8';

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

/**
 * Gera o conteúdo DICOM Part 10 de um arquivo .wl pra um exame.
 *
 * O plugin Worklist do Orthanc lê esses arquivos da pasta configurada
 * (orthanc.json: "WorklistsDatabase") e os serve via DICOM C-FIND quando
 * o Vivid consulta a Modality Worklist (porta 4242).
 */
export function gerarWlBuffer(exame: Exame): Buffer {
  const { data: dcmData } = dcmjs;
  const { DicomDict, DicomMetaDictionary } = dcmData;

  const naturalDataset = montarDataset(exame);
  const denaturalized = DicomMetaDictionary.denaturalizeDataset(naturalDataset);

  const dicomDict = new DicomDict({});
  dicomDict.dict = denaturalized;

  // File Meta Information (header DICOM Part 10)
  const sopInstanceUid = DicomMetaDictionary.uid();
  const metaNatural = {
    FileMetaInformationVersion: new Uint8Array([0, 1]),
    MediaStorageSOPClassUID: MWL_SOP_CLASS_UID,
    MediaStorageSOPInstanceUID: sopInstanceUid,
    TransferSyntaxUID: TRANSFER_SYNTAX_IMPLICIT_LE,
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
function montarDataset(exame: Exame): Record<string, unknown> {
  const { data: dcmData } = dcmjs;
  const { DicomMetaDictionary } = dcmData;

  const procDesc =
    TIPO_EXAME_DICOM_DESC[exame.tipoExame] ??
    TIPOS_EXAME_LABEL[exame.tipoExame] ??
    exame.tipoExame;

  const studyInstanceUid = DicomMetaDictionary.uid();

  return {
    SpecificCharacterSet: 'ISO_IR 100',
    // Patient Module
    PatientName: formatarPatientName(exame.pacienteNome),
    PatientID: exame.pacienteId, // ID do Firestore — único e estável
    PatientBirthDate: dataIsoParaDicom(exame.pacienteDtnasc),
    PatientSex: exame.sexo ?? '',

    // Study Module
    StudyInstanceUID: studyInstanceUid,
    AccessionNumber: exame.id, // chave que o Vivid grava no DICOM e Wader usa pra match

    // Requested Procedure Module
    RequestedProcedureID: exame.id,
    RequestedProcedureDescription: procDesc,
    ReferencedStudySequence: [],
    ReferringPhysicianName: exame.solicitante ?? '',

    // Scheduled Procedure Step Sequence (1 item — 1 exame)
    ScheduledProcedureStepSequence: [
      {
        ScheduledStationAETitle: DEFAULT_SCHEDULED_AE,
        ScheduledProcedureStepStartDate: dataIsoParaDicom(exame.dataExame),
        ScheduledProcedureStepStartTime: horaHHMMParaDicom(exame.horarioChegada),
        Modality: DEFAULT_MODALITY,
        ScheduledPerformingPhysicianName: '',
        ScheduledProcedureStepDescription: procDesc,
        ScheduledProcedureStepID: exame.id,
        ScheduledProcedureStepStatus: 'SCHEDULED',
      },
    ],
  };
}

function formatarPatientName(nome: string): string {
  const trimmed = (nome || '').trim();
  if (!trimmed) return '';
  // Convenção DICOM Patient Name: SOBRENOME^NOME^MEIO^PREFIXO^SUFIXO
  // Aqui seguimos prática comum em hospitais brasileiros: nome completo no primeiro componente.
  // O Vivid mostra o nome corretamente desse jeito.
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
export function salvarWl(worklistPath: string, exame: Exame): string {
  const buffer = gerarWlBuffer(exame);
  const filename = `${exame.id}.wl`;
  const fullPath = path.join(worklistPath, filename);
  fs.writeFileSync(fullPath, buffer);
  log.info(
    { exameId: exame.id, paciente: exame.pacienteNome, bytes: buffer.length, path: fullPath },
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
