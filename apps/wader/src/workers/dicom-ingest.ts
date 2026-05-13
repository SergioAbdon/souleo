import { OrthancClient, OrthancStudy } from '../adapters/orthanc-client';
import { uploadDicomPreview } from '../adapters/storage-uploader';
import { extrairMedidasDoEstudo, SrParseResult } from '../adapters/dicom-sr-parser';
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
  /** Total de medidas extraídas do DICOM SR (0 se estudo não tem SR). */
  medidasExtraidas: number;
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
    medidasExtraidas: 0,
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

  // 4) Extrair DICOM SR (medidas estruturadas)
  //
  // Decisão 13/05/2026 (substitui a de 11/05): pipeline DICOM AGORA processa
  // SR também. Wader = produtor (server-side, alcança Orthanc na rede local).
  // Leo = consumidor (lê `medidasDicom` direto do Firestore, sem chamar Orthanc).
  //
  // Motivação: o endpoint Leo Cloud `/api/orthanc?action=buscar_sr` roda no
  // Vercel (internet pública), mas o `ortancUrl` é `http://192.168.x.x:8042`
  // (IP da rede local da clínica). Vercel não alcança → botão "📡 Vivid"
  // nunca funcionou em produção. Ver
  // `docs/decisoes/2026-05-13-bug-acc-duplicado-remap-e-wader-sr.md` seção 5.
  let srResult: SrParseResult = {
    medidas: {},
    srInstanceId: null,
    totalMedidas: 0,
    metodoFallback: 'sem-sr',
  };
  try {
    srResult = await extrairMedidasDoEstudo({ client: opts.client, orthancStudyId: opts.orthancStudyId });
    result.medidasExtraidas = srResult.totalMedidas;
  } catch (err) {
    // SR falhar não bloqueia a gravação de imagens — só loga e segue.
    // `medidasDicom` fica vazio, médico pode digitar manualmente.
    const msg = `Falha ao extrair SR: ${(err as Error).message}`;
    log.warn({ err, orthancStudyId: opts.orthancStudyId }, msg);
    result.errors.push(msg);
  }

  // 5) Atualiza Firestore
  //
  // Mudança 13/05/2026 (substitui regra de 11/05):
  //   - Status muda pra 'andamento' atomicamente junto com imagens+SR
  //   - `medidasDicom` (Record<codigoLOINC, numero>) gravado em campo separado
  //     de `medidas` (que é editado pelo médico/motor)
  //   - Falha total nas imagens ainda bloqueia o update (matched=false → retry)
  //   - SR falhar isolado NÃO bloqueia (só grava medidas vazias + segue)
  const todasFalharam =
    instanceIds.length > 0 && result.imagensProcessadas === 0 && result.imagensFalhadas > 0;
  const semInstances = instanceIds.length === 0;
  const sucessoTotal = !todasFalharam && !semInstances;

  if (sucessoTotal) {
    await exameRef.update({
      imagensDicom: imagensDicom.map((i) => i.url),
      imagensDicomDetalhes: imagensDicom,
      medidasDicom: srResult.medidas,
      medidasDicomMeta: {
        srInstanceId: srResult.srInstanceId,
        metodoFallback: srResult.metodoFallback,
        processadoEm: new Date().toISOString(),
      },
      dicomStudyUid: study.MainDicomTags.StudyInstanceUID ?? null,
      dicomOrthancStudyId: opts.orthancStudyId,
      dicomMeta: {
        modality: study.MainDicomTags.Modality ?? 'US',
        studyDate: study.MainDicomTags.StudyDate ?? '',
        studyTime: study.MainDicomTags.StudyTime ?? '',
        studyDescription: study.MainDicomTags.StudyDescription ?? '',
      },
      status: 'andamento',
      atualizadoEm: FieldValue.serverTimestamp(),
    });
  } else {
    // Falha total: marca matched=false pra retentar próxima rodada.
    // Não escreve `dicomOrthancStudyId` pra deixar claro que ainda não processamos OK.
    result.matched = false;
    result.errors.push(
      semInstances
        ? 'Estudo sem instances no Orthanc'
        : `Todas as ${result.imagensFalhadas} imagens falharam ao baixar/subir`,
    );
  }

  log.info(
    {
      exameId: accession,
      imagensProcessadas: result.imagensProcessadas,
      imagensFalhadas: result.imagensFalhadas,
      medidasExtraidas: result.medidasExtraidas,
      bytes: result.bytesTotais,
      sucesso: sucessoTotal,
      metodoSr: srResult.metodoFallback,
    },
    sucessoTotal
      ? `Estudo processado: ${result.imagensProcessadas} imgs + ${result.medidasExtraidas} medidas → status='andamento'`
      : 'Estudo falhou — sem update no Firestore, retentará próxima rodada',
  );

  return result;
}
