import { OrthancClient, OrthancStudy } from '../adapters/orthanc-client';
import { uploadDicomPreview } from '../adapters/storage-uploader';
import { getDb, FieldValue } from '../adapters/firebase';
import { createLogger } from '../logger';

const log = createLogger({ module: 'dicom-ingest' });

export interface IngestResult {
  orthancStudyId: string;
  accessionNumber: string;
  exameIdNoLeo: string | null;
  matched: boolean;
  imagensProcessadas: number;
  imagensFalhadas: number;
  bytesTotais: number;
  errors: string[];
}

/**
 * Processa um estudo DICOM do Orthanc:
 *   1. Baixa metadados do estudo
 *   2. Match no Firestore via AccessionNumber (== exameId do LEO/Wader)
 *   3. Pra cada instance, baixa preview JPG do Orthanc + sobe pro Firebase Storage
 *   4. Atualiza `exames/{exameId}.imagensDicom` com URLs e metadados
 *
 * Idempotente: se exame já tem `imagensDicom`, sobreescreve (pra reprocessar).
 */
export async function processarEstudo(opts: {
  client: OrthancClient;
  orthancStudyId: string;
  wsId: string;
}): Promise<IngestResult> {
  const result: IngestResult = {
    orthancStudyId: opts.orthancStudyId,
    accessionNumber: '',
    exameIdNoLeo: null,
    matched: false,
    imagensProcessadas: 0,
    imagensFalhadas: 0,
    bytesTotais: 0,
    errors: [],
  };

  // 1) Metadados do estudo
  let study: OrthancStudy;
  try {
    study = await opts.client.getStudy(opts.orthancStudyId);
  } catch (err) {
    result.errors.push(`Falha ao buscar estudo: ${(err as Error).message}`);
    return result;
  }

  const accession = study.MainDicomTags.AccessionNumber ?? '';
  result.accessionNumber = accession;

  if (!accession) {
    result.errors.push('Estudo sem AccessionNumber — não dá pra fazer match');
    log.warn({ orthancStudyId: opts.orthancStudyId }, 'Estudo órfão (sem AccessionNumber)');
    return result;
  }

  // 2) Match no Firestore — busca exame onde campo `acc` == AccessionNumber DICOM.
  // Antes da Fase 4.6 o doc id era usado como ACC; após Fase 4.6 o ACC vive no campo
  // `acc` (formato EX{ddmmaa}{hhmmsscc}, 16 chars). Tentamos por `acc` primeiro;
  // fallback pra doc-id-as-acc cobre exames legados ainda sem o campo `acc`.
  const examesCol = getDb()
    .collection('workspaces')
    .doc(opts.wsId)
    .collection('exames');

  let exameRef: FirebaseFirestore.DocumentReference | null = null;
  let exameId: string | null = null;

  const porAcc = await examesCol.where('acc', '==', accession).limit(1).get();
  if (!porAcc.empty) {
    exameRef = porAcc.docs[0].ref;
    exameId = porAcc.docs[0].id;
  } else {
    // Fallback legado: doc id == ACC
    const legadoRef = examesCol.doc(accession);
    const legadoSnap = await legadoRef.get();
    if (legadoSnap.exists) {
      exameRef = legadoRef;
      exameId = accession;
    }
  }

  if (!exameRef || !exameId) {
    result.errors.push(`Exame com acc=${accession} não encontrado em workspaces/${opts.wsId}/exames`);
    log.warn({ accession, wsId: opts.wsId }, 'Estudo sem exame correspondente');
    return result;
  }

  result.exameIdNoLeo = exameId;
  result.matched = true;

  // 3) Lista instances + baixa cada preview + sobe pro Storage
  const instanceIds = await opts.client.getStudyInstances(opts.orthancStudyId);
  log.info(
    { orthancStudyId: opts.orthancStudyId, exameId: accession, totalInstances: instanceIds.length },
    'Estudo casado com exame, baixando previews',
  );

  const imagensDicom: Array<{ url: string; path: string; orthancInstanceId: string }> = [];

  for (let i = 0; i < instanceIds.length; i++) {
    const instanceId = instanceIds[i];
    try {
      const buffer = await opts.client.getInstancePreview(instanceId);
      const upload = await uploadDicomPreview({
        wsId: opts.wsId,
        exameId: exameId,
        seq: i + 1,
        buffer,
        contentType: 'image/jpeg',
      });
      imagensDicom.push({
        url: upload.url,
        path: upload.path,
        orthancInstanceId: instanceId,
      });
      result.imagensProcessadas++;
      result.bytesTotais += upload.bytes;
    } catch (err) {
      result.imagensFalhadas++;
      const msg = `Instance ${instanceId}: ${(err as Error).message}`;
      log.error({ err, instanceId }, msg);
      result.errors.push(msg);
    }
  }

  // 4) Atualiza Firestore
  await exameRef.update({
    imagensDicom: imagensDicom.map((i) => i.url),
    imagensDicomDetalhes: imagensDicom,
    dicomStudyUid: study.MainDicomTags.StudyInstanceUID ?? null,
    dicomOrthancStudyId: opts.orthancStudyId,
    dicomMeta: {
      modality: study.MainDicomTags.Modality ?? 'US',
      studyDate: study.MainDicomTags.StudyDate ?? '',
      studyTime: study.MainDicomTags.StudyTime ?? '',
      studyDescription: study.MainDicomTags.StudyDescription ?? '',
    },
    status: 'imagens-recebidas',
    atualizadoEm: FieldValue.serverTimestamp(),
  });

  log.info(
    {
      exameId: accession,
      imagensProcessadas: result.imagensProcessadas,
      imagensFalhadas: result.imagensFalhadas,
      bytes: result.bytesTotais,
    },
    'Estudo processado e Firestore atualizado',
  );

  return result;
}
