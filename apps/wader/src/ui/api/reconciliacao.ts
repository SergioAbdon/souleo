import { FastifyInstance } from 'fastify';
import { OrthancClient, OrthancStudy } from '../../adapters/orthanc-client';
import { getDb, FieldValue } from '../../adapters/firebase';
import { jaExiste } from '../../adapters/exames-repo';
import { digitos } from '../../lib/acc';
import { processarEstudo } from '../../workers/dicom-ingest';
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
}

interface OrfaoRecon {
  orthancStudyId: string;
  pacienteNomeDicom: string;
  accDicom: string;
  nSeries: number;
  studyDate: string;
  studyTime: string;
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
): void {
  app.get<{ Querystring: { data?: string } }>('/api/reconciliacao', async (req, reply) => {
    const data = req.query.data || hojeClinica();
    try {
      const payload = await montarReconciliacao(config.wsId, client, data);
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

async function montarReconciliacao(
  wsId: string,
  client: OrthancClient | null,
  data: string,
): Promise<{ exames: ExameRecon[]; orfaos: OrfaoRecon[]; orthancOk: boolean }> {
  // 1) Exames do dia (Firestore). dataExame não é indexado pra where direto —
  // varremos por status e filtramos em memória (≤ ~30 docs/dia).
  const examesCol = getDb().collection('workspaces').doc(wsId).collection('exames');
  const seen = new Set<string>();
  const exameDocs: Array<Record<string, unknown> & { id: string }> = [];
  for (const st of ['aguardando', 'andamento', 'rascunho', 'emitido', 'nao-realizado']) {
    const snap = await examesCol.where('status', '==', st).get();
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      const e = d.data();
      if (e.dataExame === data) {
        exameDocs.push({ id: d.id, ...e });
        seen.add(d.id);
      }
    }
  }

  // 2) Estudos recentes do Orthanc (tolerante a Orthanc fora — só fica sem órfãos).
  let studies: OrthancStudy[] = [];
  let orthancOk = false;
  if (client) {
    try {
      studies = await client.listStudies(80);
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
    };
  });

  // 5) Órfãos: estudos que NÃO estão vinculados a nenhum exame e cujo ACC
  // não casa com nenhum exame do dia (inclui estudos com ACC vazio).
  const orfaos: OrfaoRecon[] = studies
    .filter((s) => {
      if (studyIdsVinculados.has(s.ID)) return false;
      const d = digitos(s.MainDicomTags?.AccessionNumber);
      if (d && accParaExame.has(d)) return false;
      return true;
    })
    .map((s) => ({
      orthancStudyId: s.ID,
      pacienteNomeDicom: s.PatientMainDicomTags?.PatientName || '(sem nome no DICOM)',
      accDicom: s.MainDicomTags?.AccessionNumber || '',
      nSeries: (s.Series ?? []).length,
      studyDate: s.MainDicomTags?.StudyDate || '',
      studyTime: s.MainDicomTags?.StudyTime || '',
    }))
    .sort((a, b) => (b.studyDate + b.studyTime).localeCompare(a.studyDate + a.studyTime));

  return { exames, orfaos, orthancOk };
}
