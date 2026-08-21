import { OrthancClient, OrthancStudy } from '../adapters/orthanc-client';
import { uploadDicomPreview } from '../adapters/storage-uploader';
import { extrairMedidasDoEstudo, SrParseResult } from '../adapters/dicom-sr-parser';
import { getDb, FieldValue } from '../adapters/firebase';
import { candidatos, digitos } from '../lib/acc';
import { createLogger } from '../logger';

const log = createLogger({ module: 'dicom-ingest' });

/** Quantas imagens baixar/subir em paralelo (Fix A, ADR 2026-06-22). */
const IMG_CONCURRENCY = 4;

/** Campos DICOM a limpar do dono anterior quando um estudo troca de exame (achado 4B). */
export const CAMPOS_DICOM_LIMPAR = [
  'dicomStudyUid',
  'dicomOrthancStudyId',
  'dicomMeta',
  'medidasDicom',
  'medidasDicomMeta',
  'imagensDicom',
  'imagensDicomDetalhes',
  'imagensSelecionadasPdf',
] as const;

/** Estudos em exclusão pela tela de conferência (Task 7). Conferido antes de CADA write. */
export const estudosEmExclusao = new Set<string>();

/**
 * Acha o AccessionNumber do estudo (ADR 2026-05-18, Fix 4).
 *
 * O nível-estudo do Orthanc fica VAZIO quando as séries têm ACCs
 * inconsistentes (ex.: SR carimbado, imagens não). Então: se o
 * study.MainDicomTags.AccessionNumber vier vazio, varremos as séries
 * (1ª instance de cada) e usamos o primeiro ACC não-vazio que achar.
 */
async function resolverAccession(
  client: OrthancClient,
  study: OrthancStudy,
  orthancStudyId: string,
): Promise<string> {
  const direto = (study.MainDicomTags.AccessionNumber ?? '').trim();
  if (direto) return direto;

  try {
    const series = await client.getStudySeries(orthancStudyId);
    for (const s of series) {
      const inst = (s.Instances ?? [])[0];
      if (!inst) continue;
      const tags = await client.getInstanceSimplifiedTags(inst);
      const acc = String((tags as Record<string, unknown>).AccessionNumber ?? '').trim();
      if (acc) {
        log.info(
          { orthancStudyId, acc, serie: s.MainDicomTags?.Modality },
          'ACC recuperado de série (nível-estudo vinha vazio)',
        );
        return acc;
      }
    }
  } catch (err) {
    log.warn({ err, orthancStudyId }, 'Falha ao varrer séries em busca de ACC');
  }
  return '';
}

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
  /** Motivo do bloqueio quando o match automático é recusado por segurança. */
  motivoBloqueio?: 'cpf-divergente';
  errors: string[];
}

interface ImagemDicom {
  url: string;
  path: string;
  orthancInstanceId: string;
}

/**
 * Une o array de imagens já gravado com o lote recém-processado, por
 * `orthancInstanceId` (achado 18/D4). Reprocesso parcial (algumas instances
 * falham numa tentativa mas já tinham dado certo antes, ou vice-versa) não
 * pode encolher a galeria: quem já subiu fica, quem subiu de novo atualiza.
 */
function mesclarImagensPorInstancia(atuais: ImagemDicom[], novas: ImagemDicom[]): ImagemDicom[] {
  const porInstancia = new Map(atuais.map((i) => [i.orthancInstanceId, i]));
  for (const img of novas) porInstancia.set(img.orthancInstanceId, img);
  return [...porInstancia.values()];
}

/**
 * Baixa os previews das instances e sobe pro Storage EM PARALELO
 * (Fix A, ADR 2026-06-22). Antes era serial (~1,7s/img ⇒ 9 imgs ~15s);
 * com pool de `IMG_CONCURRENCY` cai pra ~3-4s.
 *
 * Pool simples: N "workers" puxam o próximo índice de um cursor compartilhado
 * (`next`). Como JS é single-thread, `next++` é atômico entre awaits. Cada
 * imagem mantém seu `seq` (= índice+1) pra preservar a ordem no array final
 * e no caminho do Storage (`{seq}.jpg`), idêntico ao comportamento serial.
 */
async function baixarImagensParalelo(
  client: OrthancClient,
  wsId: string,
  exameId: string,
  instanceIds: string[],
  result: IngestResult,
): Promise<ImagemDicom[]> {
  const comSeq: Array<ImagemDicom & { seq: number }> = [];
  let next = 0;

  async function runner(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= instanceIds.length) return;
      const instanceId = instanceIds[i];
      try {
        const buffer = await client.getInstancePreview(instanceId);
        const upload = await uploadDicomPreview({
          wsId,
          exameId,
          instanceId,
          seq: i + 1,
          buffer,
          contentType: 'image/jpeg',
        });
        comSeq.push({ url: upload.url, path: upload.path, orthancInstanceId: instanceId, seq: i + 1 });
        result.imagensProcessadas++;
        result.bytesTotais += upload.bytes;
      } catch (err) {
        result.imagensFalhadas++;
        const msg = `Instance ${instanceId}: ${(err as Error).message}`;
        log.error({ err, instanceId }, msg);
        result.errors.push(msg);
      }
    }
  }

  const n = Math.min(IMG_CONCURRENCY, instanceIds.length);
  await Promise.all(Array.from({ length: n }, () => runner()));

  comSeq.sort((a, b) => a.seq - b.seq);
  return comSeq.map(({ seq: _seq, ...img }) => img);
}

/**
 * Processa um estudo DICOM do Orthanc, otimizado pra LATÊNCIA
 * (ADR 2026-06-22 — baixa latência):
 *
 *   1. Metadados + match no Firestore via AccessionNumber.
 *   2. SR PRIMEIRO (Fix 0): extrai medidas e grava num write #1 com
 *      status/dicomStudyUid — o médico vê as MEDIDAS em ~1-2s, sem
 *      esperar as imagens subirem.
 *   3. Imagens EM PARALELO (Fix A) e grava num write #2.
 *
 * Fix B: se o exame já tem `medidasDicom` e o worker não sinalizou SR novo
 * (`forceSr`), pula a (re)extração do SR — economiza um download+parse a
 * cada reprocesso disparado só por imagem nova.
 *
 * Idempotente: reprocessar sobrescreve. Respeita a Trava 2 de status
 * (nunca regride rascunho/emitido).
 */
export async function processarEstudo(opts: {
  client: OrthancClient;
  orthancStudyId: string;
  wsId: string;
  /** Worker passa true quando o Orthanc ganhou uma série SR nova (não pular). */
  forceSr?: boolean;
  /**
   * Vínculo MANUAL (console de reconciliação, ADR 2026-06-26): processa este
   * estudo NESTE exame (doc id), ignorando o ACC/identidade do DICOM. Resolve
   * órfão sem ACC e identidade trocada, sem mexer no Vivid.
   */
  exameIdOverride?: string;
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

  if (estudosEmExclusao.has(opts.orthancStudyId)) {
    result.errors.push('Estudo em exclusão — processamento abortado');
    return result;
  }

  // 1) Metadados do estudo
  let study: OrthancStudy;
  try {
    study = await opts.client.getStudy(opts.orthancStudyId);
  } catch (err) {
    result.errors.push(`Falha ao buscar estudo: ${(err as Error).message}`);
    return result;
  }

  const accession = await resolverAccession(opts.client, study, opts.orthancStudyId);
  result.accessionNumber = accession;

  // Sem ACC só é órfão no caminho automático. No vínculo manual (override) o
  // ACC é irrelevante — a operadora já escolheu o exame.
  if (!accession && !opts.exameIdOverride) {
    result.errors.push('Estudo sem AccessionNumber — não dá pra fazer match');
    log.warn({ orthancStudyId: opts.orthancStudyId }, 'Estudo órfão (sem AccessionNumber)');
    return result;
  }

  // 2) Resolve o exame alvo.
  const examesCol = getDb()
    .collection('workspaces')
    .doc(opts.wsId)
    .collection('exames');

  let exameRef: FirebaseFirestore.DocumentReference | null = null;
  let exameId: string | null = null;
  let exameData: Record<string, unknown> = {};

  if (opts.exameIdOverride) {
    // Vínculo MANUAL (console, ADR 2026-06-26): exame escolhido pela operadora,
    // ignora ACC/identidade do DICOM. Resolve órfão sem ACC e troca de identidade.
    const ref = examesCol.doc(opts.exameIdOverride);
    const snap = await ref.get();
    if (!snap.exists) {
      result.errors.push(`Exame ${opts.exameIdOverride} não existe em workspaces/${opts.wsId}/exames`);
      log.warn({ exameIdOverride: opts.exameIdOverride, wsId: opts.wsId }, 'Vínculo manual: exame alvo não existe');
      return result;
    }
    exameRef = ref;
    exameId = opts.exameIdOverride;
    exameData = snap.data() ?? {};

    // Troca de vínculo (achado 4B): limpa os campos DICOM de qualquer exame
    // que ainda aponte pra este estudo/UID, senão o dono antigo fica com
    // dados órfãos (imagens/medidas de um estudo que já é de outro exame).
    const limpar: Record<string, unknown> = { atualizadoEm: FieldValue.serverTimestamp() };
    for (const c of CAMPOS_DICOM_LIMPAR) limpar[c] = FieldValue.delete();
    for (const campo of ['dicomOrthancStudyId', 'dicomStudyUid'] as const) {
      const valor = campo === 'dicomOrthancStudyId' ? opts.orthancStudyId : (study.MainDicomTags.StudyInstanceUID ?? '__none__');
      const donos = await examesCol.where(campo, '==', valor).get();
      for (const d of donos.docs) {
        if (d.id === opts.exameIdOverride) continue;
        await d.ref.update(limpar);
        log.info({ exameLimpo: d.id, orthancStudyId: opts.orthancStudyId }, 'Dono anterior limpo (troca de vínculo)');
      }
    }
  } else {
    // Vínculo persistido vence o ACC: se algum exame já aponta pra este
    // estudo (troca de identidade, corrida de acc, etc.), é o alvo — não
    // reabre pelo ACC, que pode ter passado a casar com outro exame.
    const porVinculo = await examesCol.where('dicomOrthancStudyId', '==', opts.orthancStudyId).limit(1).get();
    if (!porVinculo.empty) {
      exameRef = porVinculo.docs[0].ref;
      exameId = porVinculo.docs[0].id;
      exameData = porVinculo.docs[0].data();
    } else {
      // Match automático por ACC (== AccessionNumber DICOM).
      // Fix 4 (ADR 2026-05-18): tenta as formas plausíveis do ACC (com/sem
      // prefixo `EX`, só dígitos). Bounded (≤3 queries) — nunca varre a coleção.
      const formas = candidatos(accession);
      for (const forma of formas) {
        const porAcc = await examesCol.where('acc', '==', forma).limit(1).get();
        if (!porAcc.empty) {
          exameRef = porAcc.docs[0].ref;
          exameId = porAcc.docs[0].id;
          exameData = porAcc.docs[0].data();
          break;
        }
        // Fallback legado: doc id == ACC
        const legadoSnap = await examesCol.doc(forma).get();
        if (legadoSnap.exists) {
          exameRef = examesCol.doc(forma);
          exameId = forma;
          exameData = legadoSnap.data() ?? {};
          break;
        }
      }
    }

    if (!exameRef || !exameId) {
      result.errors.push(`Exame com acc=${accession} não encontrado em workspaces/${opts.wsId}/exames`);
      log.warn({ accession, wsId: opts.wsId }, 'Estudo sem exame correspondente');
      return result;
    }

    // Guarda de identidade (achado 3): match automático nunca pode ligar um
    // estudo a um exame de outro paciente. Só bloqueia quando os DOIS CPFs
    // existem e divergem — CPF vazio (de qualquer lado) não impede o match.
    //
    // Refinamento: o PatientID do DICOM nem sempre é CPF — a hierarquia do
    // wl-writer.ts (cpf → feegowPacienteId → doc id) grava o prontuário
    // Feegow ou o doc id quando o exame nasceu sem CPF. Um PatientID desses
    // "parece" divergente de um CPF real só por coincidência de dígitos, e
    // bloquearia um match legítimo. Só bloqueia quando: (1) o PatientID TEM
    // 11 dígitos (formato de CPF), (2) diverge do CPF do exame, E (3) não é
    // o feegowPacienteId do exame (não é o caso "PatientID = prontuário").
    const cpfDicom = digitos(String(study.PatientMainDicomTags?.PatientID ?? ''));
    const cpfExame = digitos(String(exameData.cpf ?? ''));
    const feegowIdExame = digitos(String(exameData.feegowPacienteId ?? ''));
    if (cpfDicom.length === 11 && cpfExame && cpfDicom !== cpfExame && cpfDicom !== feegowIdExame) {
      result.motivoBloqueio = 'cpf-divergente';
      result.errors.push(`Identidade divergente: DICOM PatientID=${cpfDicom} ≠ exame cpf=${cpfExame} — nada gravado`);
      log.warn({ exameId, acc: accession, cpfDicom, cpfExame }, 'Match BLOQUEADO por CPF divergente (D2)');
      return result;
    }
  }

  result.exameIdNoLeo = exameId;
  result.matched = true;

  // TRAVA 2 (status canônico, decisão 15/05/2026 — ver memória
  // `feedback_status_exame_canonico.md` e ADR §13): o Wader NÃO regride o
  // trabalho do médico. aguardando|nao-realizado → andamento; rascunho e
  // emitido se mantêm. Só anexa imagens/medidas; status só avança.
  const statusAtual = (exameData.status as string) || 'aguardando';
  const statusFinal =
    statusAtual === 'rascunho' || statusAtual === 'emitido' ? statusAtual : 'andamento';

  // COFRE DO EMITIDO (achado 18 / D4): exame já emitido é documento que
  // circulou — o Wader NUNCA mais escreve nos campos ao vivo (medidasDicom,
  // dicomMeta, dicomStudyUid, status, imagensDicom/imagensDicomDetalhes).
  // Um estudo reprocessado (reenvio, imagem adicional) vai pros campos-
  // sombra `*Pendente` + a flag `dicomAtualizacaoPendente` pra fila de
  // revisão humana. "Nada muda sem humano".
  const cofre = statusAtual === 'emitido';

  // ── ETAPA 1 (Fix 0): SR PRIMEIRO + write rápido ────────────────────────
  // O dado clinicamente crítico (medidas) chega ao Leo já, sem esperar as
  // imagens. Decisão 13/05/2026: Wader = produtor do SR (server-side, alcança
  // o Orthanc local); Leo = consumidor (lê `medidasDicom` do Firestore).
  const medidasAtuais = exameData.medidasDicom as Record<string, unknown> | undefined;
  const jaTemMedidas = !!medidasAtuais && Object.keys(medidasAtuais).length > 0;

  let srResult: SrParseResult = {
    medidas: {},
    srInstanceId: null,
    totalMedidas: 0,
    metodoFallback: 'sem-sr',
  };
  let extraiuSr = false;

  if (opts.forceSr || !jaTemMedidas || cofre) {
    // Extrai SR (Fix B: só quando não temos medidas ainda OU o worker viu SR
    // novo). Cofre sempre extrai: o campo-sombra precisa refletir o estudo
    // recém-chegado, não pode reusar `medidasDicom` (é o publicado — pode já
    // ter sido revisado/editado pelo médico, não é a mesma coisa que "já
    // processamos esse SR").
    try {
      srResult = await extrairMedidasDoEstudo({ client: opts.client, orthancStudyId: opts.orthancStudyId });
      extraiuSr = true;
    } catch (err) {
      // SR falhar não bloqueia imagens — loga e segue (médico digita manual).
      const msg = `Falha ao extrair SR: ${(err as Error).message}`;
      log.warn({ err, orthancStudyId: opts.orthancStudyId }, msg);
      result.errors.push(msg);
    }
  }

  // Usa o SR recém-extraído SÓ se rendeu medidas — ou se não havia nada antes.
  // Senão preserva as medidas já gravadas: um re-parse vazio (SR transitório/
  // ilegível, mas sem exceção) NÃO pode apagar medidas boas (perda de dado).
  const usaNovoSr = extraiuSr && (srResult.totalMedidas > 0 || !jaTemMedidas);
  result.medidasExtraidas = usaNovoSr
    ? srResult.totalMedidas
    : jaTemMedidas
      ? Object.keys(medidasAtuais!).length
      : 0;

  const etapa1: Record<string, unknown> = {
    dicomOrthancStudyId: opts.orthancStudyId,
    atualizadoEm: FieldValue.serverTimestamp(),
  };
  if (cofre) {
    // Campos-sombra: NADA nos campos ao vivo (dicomStudyUid/dicomMeta/
    // medidasDicom/status) — só a fila de revisão.
    etapa1.dicomAtualizacaoPendente = true;
    if (usaNovoSr) {
      etapa1.medidasDicomPendente = srResult.medidas;
      etapa1.medidasDicomMetaPendente = {
        srInstanceId: srResult.srInstanceId,
        metodoFallback: srResult.metodoFallback,
        processadoEm: new Date().toISOString(),
      };
    }
  } else {
    etapa1.dicomStudyUid = study.MainDicomTags.StudyInstanceUID ?? null;
    etapa1.dicomMeta = {
      modality: study.MainDicomTags.Modality ?? 'US',
      studyDate: study.MainDicomTags.StudyDate ?? '',
      studyTime: study.MainDicomTags.StudyTime ?? '',
      studyDescription: study.MainDicomTags.StudyDescription ?? '',
    };
    etapa1.status = statusFinal;
    if (usaNovoSr) {
      etapa1.medidasDicom = srResult.medidas;
      etapa1.medidasDicomMeta = {
        srInstanceId: srResult.srInstanceId,
        metodoFallback: srResult.metodoFallback,
        processadoEm: new Date().toISOString(),
      };
    }
  }
  if (estudosEmExclusao.has(opts.orthancStudyId)) {
    result.errors.push('Estudo entrou em exclusão durante o processamento — write abortado');
    return result;
  }
  await exameRef.update(etapa1);
  log.info(
    { exameId, acc: accession, medidas: result.medidasExtraidas, reusouSr: !usaNovoSr, status: statusFinal },
    'Etapa 1 gravada (medidas + status) — médico já pode ver as medidas',
  );

  // ── ETAPA 2 (Fix A): imagens em paralelo + write ───────────────────────
  // Só instances NÃO-SR: o /preview de uma instance SR devolve 415 (não há
  // JPG de Structured Report). Filtrar evita 2 "falhas" eternas por estudo e
  // mantém imagensProcessadas alinhado com o curImg do worker (também não-SR).
  const seriesEstudo = await opts.client.getStudySeries(opts.orthancStudyId);
  const instanceIds = seriesEstudo
    .filter((s) => (s.MainDicomTags?.Modality ?? '') !== 'SR')
    .flatMap((s) => s.Instances ?? []);
  log.info(
    { orthancStudyId: opts.orthancStudyId, exameId, acc: accession, imagens: instanceIds.length, concorrencia: IMG_CONCURRENCY },
    'Baixando previews em paralelo (séries SR excluídas)',
  );

  const imagensDicom = await baixarImagensParalelo(
    opts.client,
    opts.wsId,
    exameId,
    instanceIds,
    result,
  );

  const todasFalharam =
    instanceIds.length > 0 && result.imagensProcessadas === 0 && result.imagensFalhadas > 0;
  const semInstances = instanceIds.length === 0;

  if (!todasFalharam && !semInstances) {
    if (estudosEmExclusao.has(opts.orthancStudyId)) {
      result.errors.push('Estudo entrou em exclusão durante o processamento — write abortado');
      return result;
    }
    // Merge por orthancInstanceId (achado 18/D4): reprocesso parcial (algumas
    // instances falharam desta vez) não pode ENCOLHER a galeria — une com o
    // que já tínhamos, a instance que falhou agora mantém a versão anterior.
    if (cofre) {
      const pendentesAtuais = (exameData.imagensDicomPendente as ImagemDicom[] | undefined) ?? [];
      const pendentesFinais = mesclarImagensPorInstancia(pendentesAtuais, imagensDicom);
      await exameRef.update({
        imagensDicomPendente: pendentesFinais,
        atualizadoEm: FieldValue.serverTimestamp(),
      });
    } else {
      const detalhesAtuais = (exameData.imagensDicomDetalhes as ImagemDicom[] | undefined) ?? [];
      const detalhesFinais = mesclarImagensPorInstancia(detalhesAtuais, imagensDicom);
      await exameRef.update({
        imagensDicom: detalhesFinais.map((i) => i.url),
        imagensDicomDetalhes: detalhesFinais,
        atualizadoEm: FieldValue.serverTimestamp(),
      });
    }
  } else {
    // Imagens falharam/ausentes: a etapa 1 (medidas+status) JÁ foi gravada,
    // então NÃO regride matched. O worker reavalia por completude
    // (`curImg > nImg`) e retenta as imagens no próximo ciclo.
    result.errors.push(
      semInstances
        ? 'Estudo sem instances no Orthanc'
        : `Todas as ${result.imagensFalhadas} imagens falharam ao baixar/subir`,
    );
  }

  log.info(
    {
      exameId,
      acc: accession,
      imagensProcessadas: result.imagensProcessadas,
      imagensFalhadas: result.imagensFalhadas,
      medidasExtraidas: result.medidasExtraidas,
      bytes: result.bytesTotais,
      metodoSr: srResult.metodoFallback,
    },
    `Estudo processado: ${result.imagensProcessadas} imgs + ${result.medidasExtraidas} medidas → status='${statusFinal}'`,
  );

  return result;
}
