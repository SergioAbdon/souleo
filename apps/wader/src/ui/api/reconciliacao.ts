import * as os from 'node:os';
import { FastifyInstance } from 'fastify';
import { OrthancClient, OrthancStudy } from '../../adapters/orthanc-client';
import { getDb, FieldValue } from '../../adapters/firebase';
import { removerImagensExame } from '../../adapters/storage-uploader';
import { jaExiste } from '../../adapters/exames-repo';
import { digitos } from '../../lib/acc';
import { processarEstudo, CAMPOS_DICOM_LIMPAR, estudosEmExclusao } from '../../workers/dicom-ingest';
import { DicomIngestWorker } from '../../workers/dicom-ingest-worker';
import { createLogger } from '../../logger';
import { WaderConfig } from '../../config/types';
import { hojeClinica } from '../../lib/clinica-tempo';

/** Campos do exame que a console pode editar (whitelist — nunca status/dicom*). */
const CAMPOS_EDITAVEIS = [
  'pacienteNome', 'acc', 'tipoExame', 'horarioChegada',
  'convenio', 'solicitante', 'pacienteDtnasc', 'cpf', 'sexo',
] as const;

const log = createLogger({ module: 'api-reconciliacao' });

interface ExameRecon {
  id: string;
  pacienteNome: string;
  acc: string;
  tipoExame: string;
  status: string;
  horarioChegada: string;
  temAcc: boolean;
  nImagens: number;
  temMedidas: boolean;
  /** 'casado' = já tem imagens/SR no LEO; 'recebido' = estudo chegou, processando; 'aguardando' = sem estudo ainda. */
  matchStatus: 'casado' | 'recebido' | 'aguardando';
  orthancStudyId: string | null;
  /** Último erro de ingestão (dicom-ingest.ts grava no exame quando as imagens falham). */
  dicomUltimoErro: string | null;
}

interface OrfaoRecon {
  orthancStudyId: string;
  pacienteNomeDicom: string;
  accDicom: string;
  /** PatientID cru do DICOM — a tela manda de volta como fingerprint pra excluir. */
  patientIdDicom: string;
  nSeries: number;
  studyDate: string;
  studyTime: string;
  /** Exame do dia cujo CPF bate com o PatientID do estudo (dígitos) — pré-seleciona o dropdown. */
  sugestaoExameId: string | null;
}

/**
 * Endpoint da console de reconciliação (ADR 2026-06-26).
 *
 *   GET /api/reconciliacao?data=YYYY-MM-DD
 *
 * Cruza a agenda do LEO (exames do dia no Firestore) com o que o Vivid mandou
 * (estudos no Orthanc), classificando o vínculo. SÓ LEITURA.
 */
export function registerReconciliacaoRoutes(
  app: FastifyInstance,
  config: WaderConfig,
  client: OrthancClient | null,
  dicomWorker: DicomIngestWorker | null,
): void {
  app.get<{ Querystring: { data?: string } }>('/api/reconciliacao', async (req, reply) => {
    const data = req.query.data || hojeClinica();
    try {
      const payload = await montarReconciliacao(getDb(), config.wsId, client, data);
      return reply.send({ ok: true, data, ...payload });
    } catch (err) {
      log.error({ err }, 'Falha ao montar reconciliação');
      return reply.status(500).send({ ok: false, error: (err as Error).message });
    }
  });

  // POST /api/reconciliacao/vincular { orthancStudyId, exameId }
  // Linka/reatribui um estudo a um exame escolhido pela operadora, ignorando o
  // ACC/identidade do DICOM (resolve órfão sem ACC e identidade trocada).
  app.post<{ Body: { orthancStudyId?: string; exameId?: string } }>(
    '/api/reconciliacao/vincular',
    async (req, reply) => {
      const { orthancStudyId, exameId } = req.body ?? {};
      if (!orthancStudyId || !exameId) {
        return reply.status(400).send({ ok: false, error: 'orthancStudyId e exameId são obrigatórios' });
      }
      if (!client) {
        return reply.status(409).send({ ok: false, error: 'Orthanc não configurado nesta instância' });
      }
      try {
        const result = await processarEstudo({
          client,
          orthancStudyId,
          wsId: config.wsId,
          exameIdOverride: exameId,
        });
        log.info(
          { orthancStudyId, exameId, matched: result.matched, imgs: result.imagensProcessadas, medidas: result.medidasExtraidas },
          'Vínculo manual processado',
        );
        return reply.send({ ok: result.matched, ...result });
      } catch (err) {
        log.error({ err, orthancStudyId, exameId }, 'Falha no vínculo manual');
        return reply.status(500).send({ ok: false, error: (err as Error).message });
      }
    },
  );

  // POST /api/reconciliacao/editar-exame { exameId, campos }
  // Edita campos do exame (nome, ACC, etc.) pra facilitar o envio/match.
  app.post<{ Body: { exameId?: string; campos?: Record<string, unknown> } }>(
    '/api/reconciliacao/editar-exame',
    async (req, reply) => {
      const { exameId, campos } = req.body ?? {};
      if (!exameId || !campos || typeof campos !== 'object') {
        return reply.status(400).send({ ok: false, error: 'exameId e campos são obrigatórios' });
      }
      const update: Record<string, unknown> = {};
      for (const k of CAMPOS_EDITAVEIS) {
        if (k in campos && campos[k] !== undefined) update[k] = campos[k];
      }
      if (Object.keys(update).length === 0) {
        return reply.status(400).send({ ok: false, error: 'Nenhum campo editável informado', editaveis: CAMPOS_EDITAVEIS });
      }
      try {
        const ref = getDb().collection('workspaces').doc(config.wsId).collection('exames').doc(exameId);
        const snap = await ref.get();
        if (!snap.exists) {
          return reply.status(404).send({ ok: false, error: `Exame ${exameId} não existe` });
        }
        update.atualizadoEm = FieldValue.serverTimestamp();

        // ACC também é chave com reserva única no "cartório" (accIndex) — trocar
        // o ACC pela console precisa mover a reserva junto, não só o campo.
        const accAntigo = (snap.data()?.acc as string) || '';
        if (typeof update.acc === 'string' && update.acc.trim() !== accAntigo) {
          const resultado = await trocarAccComReserva(getDb(), config.wsId, exameId, update, accAntigo);
          if (!resultado.ok) {
            return reply.status(resultado.status).send({ ok: false, error: resultado.error });
          }
          const atualizados = Object.keys(update).filter((k) => k !== 'atualizadoEm');
          log.info({ exameId, campos: atualizados }, 'Exame editado pela console (ACC trocado)');
          return reply.send({ ok: true, exameId, atualizados });
        }

        await ref.update(update);
        const atualizados = Object.keys(update).filter((k) => k !== 'atualizadoEm');
        log.info({ exameId, campos: atualizados }, 'Exame editado pela console');
        return reply.send({ ok: true, exameId, atualizados });
      } catch (err) {
        log.error({ err, exameId }, 'Falha ao editar exame');
        return reply.status(500).send({ ok: false, error: (err as Error).message });
      }
    },
  );

  // POST /api/reconciliacao/excluir-reenvio
  // Body: { orthancStudyId, fingerprint: { accDicom, patientIdDicom }, operador }
  // Apaga o estudo do Orthanc pra corrigir cadastro no Vivid e reenviar (D3).
  app.post<{
    Body: {
      orthancStudyId?: string;
      fingerprint?: { accDicom?: string; patientIdDicom?: string };
      operador?: string;
    };
  }>('/api/reconciliacao/excluir-reenvio', async (req, reply) => {
    try {
      const result = await excluirReenvio(getDb(), client, dicomWorker, config.wsId, req.body ?? {});
      const { status, ...body } = result;
      if (!body.ok) {
        log.warn({ body: req.body, error: body.error }, 'excluir-reenvio recusado');
      } else {
        log.info({ orthancStudyId: req.body?.orthancStudyId, examesLimpos: body.examesLimpos }, 'Estudo excluído para reenvio');
      }
      return reply.status(status).send(body);
    } catch (err) {
      log.error({ err }, 'Falha em excluir-reenvio');
      return reply.status(500).send({ ok: false, error: (err as Error).message });
    }
  });

  // POST /api/reconciliacao/reprocessar { orthancStudyId }
  // Reprocessa um estudo já vinculado (ex.: SR chegou atrasado, imagem faltou).
  app.post<{ Body: { orthancStudyId?: string } }>(
    '/api/reconciliacao/reprocessar',
    async (req, reply) => {
      const { orthancStudyId } = req.body ?? {};
      if (!orthancStudyId) {
        return reply.status(400).send({ ok: false, error: 'orthancStudyId é obrigatório' });
      }
      if (!client) {
        return reply.status(409).send({ ok: false, error: 'Orthanc não configurado nesta instância' });
      }
      try {
        const result = await processarEstudo({ client, orthancStudyId, wsId: config.wsId, forceSr: true });
        log.info({ orthancStudyId, matched: result.matched }, 'Reprocessamento manual');
        return reply.send({ ok: result.matched, ...result });
      } catch (err) {
        log.error({ err, orthancStudyId }, 'Falha ao reprocessar');
        return reply.status(500).send({ ok: false, error: (err as Error).message });
      }
    },
  );
}

/**
 * Exclui um estudo do Orthanc pra reenvio (Task 7, D3) — extraída pra ser
 * testável sem montar o app Fastify (mesmo padrão de `trocarAccComReserva`).
 *
 * Ordem fixa (trava anti-corrida): marca `estudosEmExclusao` → limpa donos
 * (campos DICOM + Storage) → grava auditoria (retrato ANTES do DELETE) →
 * DELETE no Orthanc → esquece a assinatura no worker → desmarca. Enquanto
 * marcado, `processarEstudo` (dicom-ingest.ts) recusa qualquer write nesse
 * studyId — mesmo que um `StableStudy` chegue no meio da exclusão.
 */
export async function excluirReenvio(
  db: FirebaseFirestore.Firestore,
  client: OrthancClient | null,
  dicomWorker: DicomIngestWorker | null,
  wsId: string,
  body: {
    orthancStudyId?: string;
    fingerprint?: { accDicom?: string; patientIdDicom?: string };
    operador?: string;
  },
): Promise<{ status: number; ok: boolean; [k: string]: unknown }> {
  const { orthancStudyId, fingerprint, operador } = body ?? {};
  if (!orthancStudyId || !fingerprint) {
    return { status: 400, ok: false, error: 'orthancStudyId e fingerprint são obrigatórios' };
  }
  if (!String(operador ?? '').trim()) {
    return { status: 400, ok: false, error: 'Operador é obrigatório' };
  }
  if (!client) {
    return { status: 409, ok: false, error: 'Orthanc não configurado' };
  }
  if (!dicomWorker) {
    return {
      status: 409,
      ok: false,
      error: 'Instância UI-only não pode excluir (o Wader de produção detém o estado de ingestão)',
    };
  }

  const study = await client.getStudy(orthancStudyId).catch(() => null);
  if (!study) {
    return { status: 404, ok: false, error: 'Estudo não existe (já excluído?)' };
  }

  // Anti-corrida com a própria tela: confere a impressão digital capturada
  // na renderização — se o estudo mudou desde então (ACC/identidade), recusa.
  const nInst = (study.Series ?? []).length;
  if (
    digitos(study.MainDicomTags?.AccessionNumber) !== digitos(fingerprint.accDicom) ||
    digitos(study.PatientMainDicomTags?.PatientID) !== digitos(fingerprint.patientIdDicom)
  ) {
    return { status: 409, ok: false, error: 'O estudo mudou desde que a tela carregou — recarregue e confira' };
  }

  const examesCol = db.collection('workspaces').doc(wsId).collection('exames');
  const uid = study.MainDicomTags.StudyInstanceUID ?? '__none__';
  const donosSnap = [
    ...(await examesCol.where('dicomOrthancStudyId', '==', orthancStudyId).get()).docs,
    ...(await examesCol.where('dicomStudyUid', '==', uid).get()).docs,
  ];
  const donos = [...new Map(donosSnap.map((d) => [d.id, d])).values()];
  for (const d of donos) {
    if ((d.data().status as string) === 'emitido') {
      return {
        status: 409,
        ok: false,
        error: `Exame ${d.id} está EMITIDO — use o fluxo corrigir-laudo antes de excluir o estudo`,
      };
    }
  }

  estudosEmExclusao.add(orthancStudyId);
  try {
    // 1) limpar donos (campos + status de volta + Storage)
    for (const d of donos) {
      const limpar: Record<string, unknown> = { atualizadoEm: FieldValue.serverTimestamp() };
      for (const c of CAMPOS_DICOM_LIMPAR) limpar[c] = FieldValue.delete();
      const st = d.data().status as string;
      if (st !== 'rascunho' && st !== 'emitido') limpar.status = 'aguardando';
      await d.ref.update(limpar);
      await removerImagensExame(wsId, d.id);
    }
    // 2) auditoria (retrato ANTES do DELETE) — append-only, Admin SDK só.
    await db.collection('workspaces').doc(wsId).collection('auditoria').add({
      tipo: 'exclusao-estudo-orthanc',
      orthancStudyId,
      studyInstanceUID: uid,
      accDicom: study.MainDicomTags?.AccessionNumber ?? '',
      patientIdDicom: study.PatientMainDicomTags?.PatientID ?? '',
      patientNameDicom: study.PatientMainDicomTags?.PatientName ?? '',
      nSeries: nInst,
      examesLimpos: donos.map((d) => d.id),
      operadorDeclarado: String(operador ?? ''),
      maquina: os.hostname(),
      em: FieldValue.serverTimestamp(),
    });
    // 3) DELETE (404 = sucesso) e 4) esquecer assinatura
    await client.deleteStudy(orthancStudyId);
    dicomWorker.forgetStudy(orthancStudyId);
  } finally {
    estudosEmExclusao.delete(orthancStudyId);
  }

  return {
    status: 200,
    ok: true,
    examesLimpos: donos.map((d) => d.id),
    mensagem: 'Estudo excluído. Corrija o cadastro no aparelho e peça o REENVIO agora.',
  };
}

/**
 * Troca o ACC de um exame já cadastrado, movendo a reserva no "cartório"
 * (`accIndex`) junto — extraída pra ser testável sem montar o app Fastify
 * (Task 4, S4-T4). `update` já contém o novo `acc` + demais campos editados
 * (whitelist aplicada pelo chamador); `accAntigo` é o ACC atual do exame.
 */
export async function trocarAccComReserva(
  db: FirebaseFirestore.Firestore,
  wsId: string,
  exameId: string,
  update: Record<string, unknown>,
  accAntigo: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const novo = (update.acc as string).trim();
  const examesCol = db.collection('workspaces').doc(wsId).collection('exames');
  const ref = examesCol.doc(exameId);

  const dup = await examesCol.where('acc', '==', novo).limit(1).get();
  if (!dup.empty && dup.docs[0].id !== exameId) {
    return { ok: false, status: 409, error: `ACC ${novo} já pertence ao exame ${dup.docs[0].id}` };
  }

  const batch = db.batch();
  batch.create(db.doc(`workspaces/${wsId}/accIndex/${novo}`), { exameId, em: FieldValue.serverTimestamp() });
  if (accAntigo) batch.delete(db.doc(`workspaces/${wsId}/accIndex/${accAntigo}`));
  batch.update(ref, { ...update, acc: novo });
  try {
    await batch.commit();
  } catch (err) {
    if (jaExiste(err)) {
      return { ok: false, status: 409, error: `ACC ${novo} já está em uso` };
    }
    throw err;
  }
  return { ok: true };
}

export async function montarReconciliacao(
  db: FirebaseFirestore.Firestore,
  wsId: string,
  client: OrthancClient | null,
  data: string,
): Promise<{ exames: ExameRecon[]; orfaos: OrfaoRecon[]; orthancOk: boolean }> {
  // 1) Exames do dia (Firestore) — where direto em dataExame (achado 23), no
  // lugar de varrer os 5 status e filtrar em memória.
  const examesCol = db.collection('workspaces').doc(wsId).collection('exames');
  const snap = await examesCol.where('dataExame', '==', data).get();
  const exameDocs: Array<Record<string, unknown> & { id: string }> = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  // 2) Estudos do dia no Orthanc (StudyDate filtrado — achado 23). Tolerante
  // a Orthanc fora (só fica sem órfãos).
  let studies: OrthancStudy[] = [];
  let orthancOk = false;
  if (client) {
    try {
      studies = await client.listStudies(80, data);
      orthancOk = true;
    } catch (err) {
      log.warn({ err }, 'Orthanc inacessível — reconciliação sem o lado Vivid');
    }
  }

  // 3) Índices pro cruzamento.
  // accDigitos -> exame (pra casar estudo por ACC) e studyId vinculado.
  const accParaExame = new Map<string, (typeof exameDocs)[number]>();
  const studyIdsVinculados = new Set<string>();
  for (const e of exameDocs) {
    const d = digitos(e.acc as string);
    if (d) accParaExame.set(d, e);
    const vinc = e.dicomOrthancStudyId as string | undefined;
    if (vinc) studyIdsVinculados.add(vinc);
  }

  // Acha o estudo que casa com um exame (por studyId vinculado OU ACC).
  const studyPorId = new Map(studies.map((s) => [s.ID, s]));
  function estudoDoExame(e: (typeof exameDocs)[number]): OrthancStudy | null {
    const vinc = e.dicomOrthancStudyId as string | undefined;
    if (vinc && studyPorId.has(vinc)) return studyPorId.get(vinc)!;
    const d = digitos(e.acc as string);
    if (!d) return null;
    return studies.find((s) => digitos(s.MainDicomTags?.AccessionNumber) === d) ?? null;
  }

  // 4) Monta lista de exames com status de vínculo.
  const exames: ExameRecon[] = exameDocs.map((e) => {
    const nImagens = Array.isArray(e.imagensDicom) ? (e.imagensDicom as unknown[]).length : 0;
    const temMedidas = !!e.medidasDicom && Object.keys(e.medidasDicom as object).length > 0;
    const casadoNoLeo = nImagens > 0 || !!e.dicomStudyUid;
    const estudo = estudoDoExame(e);
    const matchStatus: ExameRecon['matchStatus'] = casadoNoLeo
      ? 'casado'
      : estudo
        ? 'recebido'
        : 'aguardando';
    return {
      id: e.id,
      pacienteNome: (e.pacienteNome as string) || '(sem nome)',
      acc: (e.acc as string) || '',
      tipoExame: (e.tipoExame as string) || '',
      status: (e.status as string) || '',
      horarioChegada: (e.horarioChegada as string) || '',
      temAcc: !!digitos(e.acc as string),
      nImagens,
      temMedidas,
      matchStatus,
      orthancStudyId: (e.dicomOrthancStudyId as string) || estudo?.ID || null,
      dicomUltimoErro: (e.dicomUltimoErro as string) || null,
    };
  });

  // CPF (dígitos) -> exame do dia, pra sugerir vínculo de um órfão pelo
  // PatientID do DICOM (que na maioria das vezes É o CPF — wl-writer.ts).
  const cpfParaExame = new Map<string, (typeof exameDocs)[number]>();
  for (const e of exameDocs) {
    const c = digitos(e.cpf as string);
    if (c) cpfParaExame.set(c, e);
  }

  // 5) Órfãos: estudos que NÃO estão vinculados a nenhum exame e cujo ACC
  // não casa com nenhum exame do dia (inclui estudos com ACC vazio).
  const orfaos: OrfaoRecon[] = studies
    .filter((s) => {
      if (studyIdsVinculados.has(s.ID)) return false;
      const d = digitos(s.MainDicomTags?.AccessionNumber);
      if (d && accParaExame.has(d)) return false;
      return true;
    })
    .map((s) => {
      const patientIdDicom = s.PatientMainDicomTags?.PatientID || '';
      const cpfDicom = digitos(patientIdDicom);
      const sugestao = cpfDicom ? cpfParaExame.get(cpfDicom) : undefined;
      return {
        orthancStudyId: s.ID,
        pacienteNomeDicom: s.PatientMainDicomTags?.PatientName || '(sem nome no DICOM)',
        accDicom: s.MainDicomTags?.AccessionNumber || '',
        patientIdDicom,
        nSeries: (s.Series ?? []).length,
        studyDate: s.MainDicomTags?.StudyDate || '',
        studyTime: s.MainDicomTags?.StudyTime || '',
        sugestaoExameId: sugestao ? sugestao.id : null,
      };
    })
    .sort((a, b) => (b.studyDate + b.studyTime).localeCompare(a.studyDate + a.studyTime));

  return { exames, orfaos, orthancOk };
}
